#!/usr/bin/env python3
"""Capture the spin-reversal scene at a deterministic frame rate.

The page is rendered in a short-lived headless Chrome process.  A manual
requestAnimationFrame clock lets CDP render exactly one scene update before
each screenshot, so the output is not dependent on MediaRecorder's encoder
back-pressure or a desktop window being visible.
"""

from __future__ import annotations

import argparse
import base64
import json
import os
import random
import shutil
import signal
import socket
import struct
import subprocess
import tempfile
import time
import urllib.request
from pathlib import Path
from typing import Any


class CdpConnection:
    def __init__(self, websocket_url: str) -> None:
        host_port = websocket_url.split("/")[2]
        host, port = host_port.split(":")
        self.host = host
        self.port = int(port)
        self.path = "/" + "/".join(websocket_url.split("/")[3:])
        self.socket = socket.create_connection((self.host, self.port), timeout=10)
        key = base64.b64encode(os.urandom(16)).decode("ascii")
        request = (
            f"GET {self.path} HTTP/1.1\r\n"
            f"Host: {self.host}:{self.port}\r\n"
            "Upgrade: websocket\r\n"
            "Connection: Upgrade\r\n"
            f"Origin: http://127.0.0.1:{self.port}\r\n"
            f"Sec-WebSocket-Key: {key}\r\n"
            "Sec-WebSocket-Version: 13\r\n\r\n"
        )
        self.socket.sendall(request.encode("ascii"))
        response = b""
        while b"\r\n\r\n" not in response:
            response += self.socket.recv(4096)
        self.socket.settimeout(None)

    def send(self, payload: str | bytes, opcode: int = 1) -> None:
        data = payload if isinstance(payload, bytes) else payload.encode("utf-8")
        mask = os.urandom(4)
        masked = bytes(value ^ mask[index % 4] for index, value in enumerate(data))
        length = len(masked)
        if length < 126:
            header = bytes([0x80 | opcode, 0x80 | length])
        elif length < 65536:
            header = bytes([0x80 | opcode, 0x80 | 126]) + struct.pack("!H", length)
        else:
            header = bytes([0x80 | opcode, 0x80 | 127]) + struct.pack("!Q", length)
        self.socket.sendall(header + mask + masked)

    def receive(self) -> tuple[int | None, bytes | None]:
        header = self.socket.recv(2)
        if not header:
            return None, None
        first, second = header
        opcode = first & 0x0F
        length = second & 0x7F
        if length == 126:
            length = struct.unpack("!H", self.socket.recv(2))[0]
        elif length == 127:
            length = struct.unpack("!Q", self.socket.recv(8))[0]
        mask = second >> 7
        mask_key = self.socket.recv(4) if mask else None
        data = b""
        while len(data) < length:
            data += self.socket.recv(length - len(data))
        if mask_key:
            data = bytes(value ^ mask_key[index % 4] for index, value in enumerate(data))
        return opcode, data

    def call(self, method: str, params: dict[str, Any] | None = None, timeout: float = 120) -> dict[str, Any]:
        identifier = random.randint(1, 2**30)
        self.send(json.dumps({"id": identifier, "method": method, "params": params or {}}))
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            opcode, data = self.receive()
            if opcode == 9 and data is not None:
                self.send(data, opcode=10)
                continue
            if opcode != 1 or data is None:
                continue
            message = json.loads(data)
            if message.get("id") == identifier:
                return message
        raise TimeoutError(method)

    def close(self) -> None:
        self.socket.close()


def evaluate(cdp: CdpConnection, expression: str) -> Any:
    response = cdp.call(
        "Runtime.evaluate",
        {
            "expression": expression,
            "awaitPromise": True,
            "returnByValue": True,
            "userGesture": True,
        },
    )
    result = response.get("result", {}).get("result", {})
    if "value" in result:
        return result["value"]
    raise RuntimeError(result.get("description", json.dumps(response, ensure_ascii=False)))


def find_page(port: int) -> str:
    pages = json.load(urllib.request.urlopen(f"http://127.0.0.1:{port}/json/list", timeout=1))
    for page in pages:
        if page.get("type") == "page" and "pingpong-sim" in page.get("url", ""):
            return page["webSocketDebuggerUrl"]
    raise RuntimeError("pingpong-sim page was not found")


def wait_for_page(port: int, timeout: float = 10) -> str:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        try:
            return find_page(port)
        except Exception:
            time.sleep(0.1)
    raise TimeoutError(f"Chrome CDP did not expose a page on port {port}")


def stop_process(process: subprocess.Popen[bytes]) -> None:
    if process.poll() is not None:
        return
    try:
        os.killpg(process.pid, signal.SIGTERM)
    except ProcessLookupError:
        return
    try:
        process.wait(timeout=5)
    except subprocess.TimeoutExpired:
        try:
            os.killpg(process.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
        process.wait(timeout=5)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--mode", choices=("standard", "critical", "reversal"), default="standard")
    parser.add_argument("--shot", choices=("overview", "contact", "force"), default="overview")
    parser.add_argument("--frames", type=int, default=720)
    parser.add_argument("--fps", type=int, choices=(30, 60), default=60)
    parser.add_argument("--out-dir", type=Path, required=True)
    parser.add_argument("--telemetry-out", type=Path)
    parser.add_argument("--port", type=int, default=9225)
    parser.add_argument(
        "--chrome",
        type=Path,
        default=Path("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"),
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    if args.frames <= 0:
        raise SystemExit("--frames must be positive")
    args.out_dir.mkdir(parents=True, exist_ok=True)
    for old_frame in args.out_dir.glob("*.png"):
        old_frame.unlink()

    profile_dir = Path(tempfile.mkdtemp(prefix="pingpong-cdp-"))
    url = (
        "http://192.168.7.187:5173/pingpong-sim/"
        f"?recording=spin-reversal&recordingFps={args.fps}&mode={args.mode}&recordingShot={args.shot}&manual=1"
    )
    chrome_args = [
        str(args.chrome),
        "--headless=new",
        f"--remote-debugging-port={args.port}",
        "--remote-allow-origins=*",
        f"--user-data-dir={profile_dir}",
        "--no-first-run",
        "--disable-extensions",
        "--disable-translate",
        "--disable-features=Translate,TranslateUI",
        "--disable-background-timer-throttling",
        "--disable-renderer-backgrounding",
        "--disable-backgrounding-occluded-windows",
        "--window-size=1920,1080",
        "--hide-scrollbars",
        "--kiosk",
        f"--app={url}",
    ]
    process = subprocess.Popen(chrome_args, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True)
    cdp: CdpConnection | None = None
    try:
        websocket_url = wait_for_page(args.port)
        cdp = CdpConnection(websocket_url)
        cdp.call("Page.enable")
        cdp.call(
            "Page.addScriptToEvaluateOnNewDocument",
            {
                "source": """
(() => {
  const queue = [];
  let nextId = 1;
  let manualNow = 0;
  Object.defineProperty(performance, 'now', { configurable: true, value: () => manualNow });
  window.requestAnimationFrame = callback => {
    const id = nextId++;
    queue.push({ id, callback });
    return id;
  };
  window.cancelAnimationFrame = id => {
    const index = queue.findIndex(item => item.id === id);
    if (index >= 0) queue.splice(index, 1);
  };
  window.__pingpongManualFrame = timestamp => {
    manualNow = timestamp;
    const item = queue.shift();
    if (!item) return false;
    item.callback(timestamp);
    return true;
  };
  window.__pingpongManualQueue = () => queue.length;
})();
""",
            },
        )
        cdp.call("Emulation.setDeviceMetricsOverride", {"width": 1920, "height": 1080, "deviceScaleFactor": 1, "mobile": False})
        cdp.call("Page.reload", {"ignoreCache": True})
        time.sleep(1.5)
        info = evaluate(
            cdp,
            "({hidden:document.hidden,canvas:document.querySelector('canvas') && [document.querySelector('canvas').width,document.querySelector('canvas').height],queue:window.__pingpongManualQueue()})",
        )
        if info.get("canvas") != [1920, 1080]:
            raise RuntimeError(f"unexpected capture canvas: {info}")

        timestamp = 0.0
        for _ in range(6):
            evaluate(cdp, f"window.__pingpongManualFrame({timestamp})")
            timestamp += 1000 / args.fps
            time.sleep(0.03)

        telemetry: list[dict[str, Any]] = []
        for index in range(args.frames):
            evaluate(cdp, f"window.__pingpongManualFrame({timestamp})")
            if args.telemetry_out:
                telemetry.append(
                    {
                        "frame": index,
                        "time": timestamp / 1000,
                        "chapter": evaluate(cdp, "document.getElementById('spin-recording-chapter')?.textContent || ''"),
                        "balls": evaluate(
                            cdp,
                            "JSON.parse(document.getElementById('bc')?.dataset.allTelemetry || '[]')",
                        ),
                    }
                )
            screenshot = cdp.call(
                "Page.captureScreenshot",
                {"format": "png", "fromSurface": True, "captureBeyondViewport": False},
            )
            encoded = screenshot.get("result", {}).get("data")
            if not encoded:
                raise RuntimeError(f"screenshot failed: {screenshot}")
            (args.out_dir / f"{index:06d}.png").write_bytes(base64.b64decode(encoded))
            timestamp += 1000 / args.fps
            if index % 60 == 0:
                print(f"frame {index}/{args.frames}", flush=True)

        if args.telemetry_out:
            args.telemetry_out.parent.mkdir(parents=True, exist_ok=True)
            args.telemetry_out.write_text(json.dumps(telemetry, ensure_ascii=False, indent=2), encoding="utf-8")
        print(json.dumps({"mode": args.mode, "shot": args.shot, "frames": args.frames, "fps": args.fps, "outDir": str(args.out_dir)}))
    finally:
        if cdp is not None:
            cdp.close()
        stop_process(process)
        shutil.rmtree(profile_dir, ignore_errors=True)


if __name__ == "__main__":
    main()
