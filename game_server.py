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
            data["stages"] = [{"key": k, "name": n} for k, n in cms.STAGES]
            self.send_json(data)
        elif self.path == "/api/admin/players":
            if not self.db.is_admin(self.headers.get("X-Token")):
                self.send_json({"error": "只有管理者可以使用"}, 403)
                return
            self.send_json({"players": self.db.admin_players()})
        else:
            super().do_GET()

    def admin_players_action(self, data: dict[str, Any]) -> None:
        """Add, update or delete a player from the admin page (admins only)."""
        caller = self.db.player_by_token(self.headers.get("X-Token", ""))
        if caller is None or caller["permission"] != "admin":
            self.send_json({"error": "只有管理者可以使用"}, 403)
            return
        action = data.get("action")
        permission = "admin" if data.get("admin") else "user"
        try:
            if action == "add":
                self.db.add_player(str(data.get("en_name", "")), str(data.get("animal", "")),
                                   cms.DEFAULT_PASSWORD, permission)
            elif action in ("update", "delete"):
                player_id = int(data.get("id"))
                if player_id == caller["id"] and (action == "delete" or permission != "admin"):
                    raise ValueError("不能刪除自己，也不能拿掉自己的管理者權限")
                if action == "update":
                    self.db.update_player(player_id, str(data.get("en_name", "")),
                                          str(data.get("animal", "")), permission)
                else:
                    self.db.delete_player(player_id)
            else:
                raise ValueError("不認得的動作")
        except (TypeError, ValueError) as e:
            self.send_json({"error": str(e)}, 400)
            return
        self.send_json({"result": "ok", "players": self.db.admin_players()})

    def do_POST(self) -> None:
        """Handle login, guesses, labels and admin actions."""
        data = self.read_json()
        if self.path == "/api/login":
            token = self.db.login(str(data.get("name", "")), str(data.get("password", "")))
            if token is None:
                self.send_json({"error": "名字或暗號不對"}, 401)
            else:
                self.send_json({"token": token})
        elif self.path == "/api/guess":
            try:
                gift_id = int(data.get("gift_id"))
            except (TypeError, ValueError):
                self.send_json({"error": "gift_id 格式不對"}, 400)
                return
            result = self.db.guess(self.headers.get("X-Token", ""), gift_id)
            self.send_json({"result": result}, {"unknown": 401, "locked": 409}.get(result, 200))
        elif self.path == "/api/label":
            result = self.db.set_label(self.headers.get("X-Token", ""), str(data.get("label", "")), cms.GIFT_LABELS)
            status = {"ok": 200, "unknown": 401, "invalid": 400, "not_claimed": 409, "locked": 409}[result]
            self.send_json({"result": result}, status)
        elif self.path == "/api/admin/stage":
            result = self.db.set_stage(self.headers.get("X-Token", ""), str(data.get("stage", "")), cms.STAGE_KEYS)
            status = {"ok": 200, "forbidden": 403, "invalid": 400}[result]
            self.send_json({"result": result}, status)
        elif self.path == "/api/admin/players":
            self.admin_players_action(data)
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
