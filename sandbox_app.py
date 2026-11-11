"""Sandbox entry point: same server code, separate DB and port, for designing new stage screens.

Never touches the real DB. When sandbox/sandbox.db is missing it is built
first from a read-only copy of the real DB (see tools/build_sandbox_db.py).
"""

import sys
from functools import partial
from http.server import ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit

import mpivr20_cms as cms
from app import lan_ip
from game_server import GameHandler, GameServer
from introduce import Introduce
from models import GameDB
from tools.build_sandbox_db import build, fill_sample_descriptions

# 夾進首頁的沙盒橋接：階段是交換禮物遊戲時，從首頁帶到聚光燈頁
BRIDGE_TAG = '<script src="/sandbox/sandbox_bridge.js"></script>'


class SandboxHandler(GameHandler):
    """GameHandler plus sandbox-only APIs that the real server does not expose."""

    def do_GET(self) -> None:
        """Serve the draw order (sandbox DB only) and the bridged home page, otherwise behave like GameHandler."""
        path = urlsplit(self.path).path
        if path == "/api/draw_order":
            self.send_json({"order": self.db.draw_order(), "seed": self.db.get_setting("draw_seed", "")})
        elif path in ("/", "/index.html"):
            self.send_home()
        else:
            super().do_GET()

    def send_home(self) -> None:
        """Serve the real index.html with the sandbox bridge script added to <head>.

        The bridge sends players to the spotlight page once the stage is the
        exchange stage, so game.js itself stays untouched.
        """
        html = (Path(self.directory) / "index.html").read_text(encoding="utf-8")
        html = html.replace("<head>", "<head>\n  " + BRIDGE_TAG, 1)
        body = html.encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


class SandboxServer(GameServer):
    """GameServer that uses SandboxHandler."""

    def __init__(self, host: str, port: int, static_dir: Path, db: GameDB) -> None:
        """Create the server without starting it."""
        handler = partial(SandboxHandler, db=db, directory=str(static_dir))
        self.httpd = ThreadingHTTPServer((host, port), handler)
        print(f"[sandbox] bound {host}:{port}, static={static_dir}")


def main() -> None:
    """Prepare the sandbox DB if needed, then serve until Ctrl+C."""
    sys.stdout.reconfigure(encoding="utf-8")
    info = Introduce()
    print(f"[sandbox] {info.program} {info.version}（沙盒）")
    if not cms.SANDBOX_DB_PATH.exists():
        print("[sandbox] 沙盒 DB 不存在，從正式 DB 複製一份")
        try:
            build(cms.DB_PATH, cms.SANDBOX_DB_PATH, cms.SANDBOX_STAGE)
        except Exception as e:
            print(f"[sandbox] 建立失敗：{e}")
            print("[sandbox] 可改用 python tools/build_sandbox_db.py --source 其他DB路徑")
            sys.exit(1)
    db = GameDB(cms.SANDBOX_DB_PATH)
    if not db.has_draw_order():
        print("[sandbox] 沙盒 DB 還沒有抽獎順序，隨機洗一次")
        db.shuffle_draw_order()
    fill_sample_descriptions(db.conn)  # 沙盒 DB 裡還沒寫描述的禮物補上測試描述
    print(f"[sandbox] players in DB: {db.player_count()}, stage: {db.get_stage()}")
    server = SandboxServer(cms.HOST, cms.SANDBOX_PORT, cms.STATIC_DIR, db)
    print(f"[sandbox] 本機：http://localhost:{cms.SANDBOX_PORT}{cms.SANDBOX_PAGE}")
    print(f"[sandbox] 手機：http://{lan_ip()}:{cms.SANDBOX_PORT}{cms.SANDBOX_PAGE}")
    server.serve_forever()


if __name__ == "__main__":
    main()
