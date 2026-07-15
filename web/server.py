#!/usr/bin/env python3
"""Pingpong Simulation Server — serves the 3D simulation page and STL files."""

import http.server
import os
import sys
import mimetypes

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

class PingpongHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=PROJECT_ROOT, **kwargs)

    def do_GET(self):
        # Redirect root to the simulation page
        if self.path == '/' or self.path == '/index.html':
            self.path = '/web/index.html'
        return super().do_GET()

    def log_message(self, format, *args):
        print(f"  {args[0]}", flush=True)

if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8080

    # Ensure mimetypes for STL
    mimetypes.add_type('model/stl', '.stl')
    mimetypes.add_type('application/octet-stream', '.stl')

    server = http.server.HTTPServer(('0.0.0.0', port), PingpongHandler)
    print(f"""
╔══════════════════════════════════════════════╗
║  🏓 pingpong-sim                            ║
║  乒乓球物理仿真 Server                        ║
╠══════════════════════════════════════════════╣
║  Local:  http://localhost:{port}              ║
╚══════════════════════════════════════════════╝
""")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nServer stopped.")
        server.server_close()
