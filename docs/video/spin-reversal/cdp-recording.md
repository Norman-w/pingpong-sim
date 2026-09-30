# 无窗口逐帧录制

录制素材不再使用桌面显示器抓取，也不使用 `canvas.captureStream()` 的实时编码。桌面抓取要求窗口前台，浏览器 `MediaRecorder` 在 1920×1080 场景下会因编码回压掉帧；这两条路径都不作为成片源。

`scripts/record-spin-canvas-cdp.py` 会启动一个临时的 headless Chrome，通过 CDP 注入手动时间步：每次先推进一帧 Three.js/Rapier 场景，再截取一张 1920×1080 PNG。录制结束后脚本在 `finally` 中关闭 WebSocket、终止 Chrome 进程组并删除临时用户目录，不会留下浏览器窗口或远程调试端口。

示例：

```bash
python3 scripts/record-spin-canvas-cdp.py \
  --mode standard \
  --frames 720 \
  --fps 60 \
  --out-dir /Users/norman/Movies/pingpong-sim/spin-reversal/raw/v40-native60/standard
```

`--mode` 可选 `standard`、`critical`、`reversal`。当前 `spin-reversal` 录制展示使用 0.10× 的编辑时钟，把两次碰台分开到约 1.9 秒和 6.0 秒；碰撞器、冲量和 RPM 计算没有改变。截图序列仍在仓库外；用本机 ffmpeg 将序列编码为 60 fps MP4 后，再送入 ChatCut 做配音、字幕和剪辑。脚本只负责真实三维仿真画面，不生成音频，也不自动发布。

当前 v40 素材目录为 `/Users/norman/Movies/pingpong-sim/spin-reversal/raw/v40-native60/`，每个模式 720 张 PNG 和一个 12 秒 MP4；reversal 模式的 telemetry 显示两颗球各有两次真实碰台事件。验收至少包括：PNG 为 1920×1080；序列数量等于 `--frames`；编码后的 MP4 用 `ffprobe -count_frames` 得到目标帧率和完整帧数；全量解码无错误；抽帧能看到球、球网、两次落台和碰台提示。
