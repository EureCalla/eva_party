"""HTTP server: static front-end files plus the JSON game API."""

import json
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any

import mpivr20_cms as cms
from models import GameDB


class GameHandler(SimpleHTTPRequestHandler):
    """Serve files from the static directory and route /api/* to GameDB."""

    def __init__(self, *args: Any, db: GameDB, **kwargs: Any) -> None:
        """Keep a reference to the shared GameDB."""
        self.db = db
        super().__init__(*args, **kwargs)

    def end_headers(self) -> None:
        """Disable caching so edits show up on refresh during review."""
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, format: str, *args: Any) -> None:
        """Only log API calls, not every static file."""
        if self.path.startswith("/api/"):
            print(f"[server] {self.command} {self.path} {args[1] if len(args) > 1 else ''}")

    def send_json(self, data: Any, status: int = 200) -> None:
        """Write a JSON response."""
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def read_json(self) -> dict[str, Any]:
        """Read the request body as JSON, returning {} when it is missing, not UTF-8 or not an object."""
        length = int(self.headers.get("Content-Length") or 0)
        try:
            data = json.loads(self.rfile.read(length) or b"{}")
        except ValueError:  # JSONDecodeError 與 UnicodeDecodeError 都是 ValueError
            return {}
        return data if isinstance(data, dict) else {}

    def do_GET(self) -> None:
        """Handle API reads, otherwise serve static files."""
        if self.path == "/api/roster":
            self.send_json({"names": self.db.roster_names()})
        elif self.path == "/api/state":
            data = self.db.state(self.headers.get("X-Token"))
            data["labels"] = cms.GIFT_LABELS
            self.send_json(data)
        else:
            super().do_GET()

    def do_POST(self) -> None:
        """Handle login and guesses."""
        data = self.read_json()
        if self.path == "/api/login":
            token = self.db.login(str(data.get("name", "")), str(data.get("password", "")))
            if token is None:
                self.send_json({"error": "名字或密碼不對"}, 401)
            else:
                self.send_json({"token": token})
        elif self.path == "/api/guess":
            try:
                gift_id = int(data.get("gift_id"))
            except (TypeError, ValueError):
                self.send_json({"error": "gift_id 格式不對"}, 400)
                return
            result = self.db.guess(self.headers.get("X-Token", ""), gift_id)
            self.send_json({"result": result}, 401 if result == "unknown" else 200)
        elif self.path == "/api/label":
            result = self.db.set_label(self.headers.get("X-Token", ""), str(data.get("label", "")), cms.GIFT_LABELS)
            status = {"ok": 200, "unknown": 401, "invalid": 400, "not_claimed": 409}[result]
            self.send_json({"result": result}, status)
        else:
            self.send_json({"error": "not found"}, 404)


class GameServer:
    """Threaded HTTP server bound to the game database and static directory."""

    def __init__(self, host: str, port: int, static_dir: Path, db: GameDB) -> None:
        """Create the server without starting it."""
        handler = partial(GameHandler, db=db, directory=str(static_dir))
        self.httpd = ThreadingHTTPServer((host, port), handler)
        print(f"[server] bound {host}:{port}, static={static_dir}")

    def serve_forever(self) -> None:
        """Run until interrupted."""
        try:
            self.httpd.serve_forever()
        except KeyboardInterrupt:
            print("[server] stopped")
        finally:
            self.httpd.server_close()
