"""HTTP server: static front-end files plus the JSON game API."""

import json
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, urlsplit

import mpivr20_cms as cms
from minigame import map_info
from models import DESCRIPTION_MAX, GameDB


class GameHandler(SimpleHTTPRequestHandler):
    """Serve files from the static directory and route /api/* to GameDB."""

    # 保持連線（keep-alive）：小遊戲每秒很多請求，省掉每次重新連線；閒置 30 秒就關
    protocol_version = "HTTP/1.1"
    timeout = 30

    def __init__(self, *args: Any, db: GameDB, **kwargs: Any) -> None:
        """Keep a reference to the shared GameDB."""
        self.db = db
        super().__init__(*args, **kwargs)

    def end_headers(self) -> None:
        """Disable caching so edits show up on refresh during review."""
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, format: str, *args: Any) -> None:
        """Only log API calls, not every static file nor the minigame's many-per-second calls."""
        if self.path.startswith("/api/") and not self.path.startswith("/api/minigame/"):
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
            data["description_max"] = DESCRIPTION_MAX
            self.send_json(data)
        elif self.path == "/api/exchange":
            self.send_json(self.db.exchange_state(self.headers.get("X-Token")))
        elif self.path == "/api/minigame/map":
            self.send_json(map_info())
        elif self.path.startswith("/api/minigame/watch"):
            try:
                since = float(parse_qs(urlsplit(self.path).query).get("since", ["0"])[0])
            except ValueError:
                since = 0.0
            result, data = self.db.minigame_watch(since)
            self.send_json(data if data is not None else {"result": result}, 200 if data is not None else 409)
        elif self.path == "/api/admin/players":
            if not self.db.is_admin(self.headers.get("X-Token")):
                self.send_json({"error": "只有管理者可以使用"}, 403)
                return
            self.send_json(self.admin_people())
        else:
            super().do_GET()

    def user_password(self) -> str:
        """Return the current password for non-admins (settings.user_password, else the default)."""
        return self.db.get_setting("user_password", cms.DEFAULT_PASSWORD)

    def admin_people(self) -> dict[str, Any]:
        """Return the admin page's people list plus the shared non-admin password."""
        return {"players": self.db.admin_players(), "user_password": self.user_password()}

    def admin_players_action(self, data: dict[str, Any]) -> None:
        """Add, update or delete a player, or set every non-admin's password (admins only)."""
        caller = self.db.player_by_token(self.headers.get("X-Token", ""))
        if caller is None or caller["permission"] != "admin":
            self.send_json({"error": "只有管理者可以使用"}, 403)
            return
        action = data.get("action")
        permission = "admin" if data.get("admin") else "user"
        try:
            if action == "add":
                password = cms.ADMIN_PASSWORD if permission == "admin" else self.user_password()
                self.db.add_player(str(data.get("en_name", "")), str(data.get("animal", "")), password, permission)
            elif action == "user_password":
                self.db.set_user_password(self.headers.get("X-Token", ""), str(data.get("password", "")))
            elif action in ("update", "delete"):
                player_id = int(data.get("id"))
                if player_id == caller["id"] and (action == "delete" or permission != "admin"):
                    raise ValueError("不能刪除自己，也不能拿掉自己的管理者權限")
                if action == "update":
                    password = data.get("password")
                    self.db.update_player(
                        player_id, str(data.get("en_name", "")), str(data.get("animal", "")), permission,
                        None if password is None else str(password),
                        {"admin": cms.ADMIN_PASSWORD, "user": self.user_password()},
                    )
                else:
                    self.db.delete_player(player_id)
            else:
                raise ValueError("不認得的動作")
        except PermissionError as e:
            self.send_json({"error": str(e)}, 403)
            return
        except (TypeError, ValueError) as e:
            self.send_json({"error": str(e)}, 400)
            return
        self.send_json({"result": "ok", **self.admin_people()})

    def do_POST(self) -> None:
        """Handle login, guesses, labels, descriptions, the exchange contest and admin actions."""
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
        elif self.path == "/api/exchange/start":
            result = self.db.start_exchange(self.headers.get("X-Token", ""))
            status = {"ok": 200, "forbidden": 403, "locked": 409, "started": 409, "empty": 409}[result]
            self.send_json({"result": result}, status)
        elif self.path in ("/api/exchange/join", "/api/exchange/withdraw"):
            token = self.headers.get("X-Token", "")
            join = self.path.endswith("/join")
            result = self.db.join_contest(token) if join else self.db.withdraw_contest(token)
            self.send_json({"result": result}, {"ok": 200, "unknown": 401}.get(result, 409))
        elif self.path == "/api/minigame/input":
            try:
                x, y = float(data.get("x")), float(data.get("y"))
                fx, fy = int(data.get("fx", 0)), int(data.get("fy", 0))
                seq = None if data.get("seq") is None else int(data.get("seq"))
                power = float(data.get("power", 0.5))  # 蓄力 0~1
            except (TypeError, ValueError):
                self.send_json({"error": "x / y / fx / fy / seq / power 格式不對"}, 400)
                return
            result, snap = self.db.minigame_input(
                self.headers.get("X-Token", ""), x, y, fx, fy, bool(data.get("throw")), seq, power
            )
            if snap is not None:
                self.send_json(snap)
            else:
                self.send_json({"result": result}, 401 if result == "unknown" else 409)
        elif self.path == "/api/minigame/count":
            n = data.get("n")
            if n is not None and (not isinstance(n, int) or isinstance(n, bool) or not 1 <= n <= 9):
                self.send_json({"error": "n 要是 1~9 或 null"}, 400)
                return
            result, snap = self.db.minigame_count(self.headers.get("X-Token", ""), n)
            if snap is not None:
                self.send_json(snap)
            else:
                self.send_json({"result": result}, 401 if result == "unknown" else 409)
        elif self.path == "/api/minigame/spell":
            word, keys = data.get("word"), data.get("keys", "")
            if word is not None and (not isinstance(word, int) or isinstance(word, bool)):
                self.send_json({"error": "word 要是整數或 null"}, 400)
                return
            if not isinstance(keys, str) or len(keys) > 20 or any(c not in "abcdefghijklmnopqrstuvwxyz" for c in keys):
                self.send_json({"error": "keys 只能是 a～z，最多 20 個字"}, 400)
                return
            result, snap = self.db.minigame_spell(self.headers.get("X-Token", ""), word, keys)
            if snap is not None:
                self.send_json(snap)
            else:
                self.send_json({"result": result}, 401 if result == "unknown" else 409)
        elif self.path == "/api/minigame/climb":
            try:
                x, y, vy = float(data.get("x")), float(data.get("y")), float(data.get("vy", 0))
                face, move = int(data.get("face", 1)), int(data.get("move", 0))
                seq = None if data.get("seq") is None else int(data.get("seq"))
                have, kick_ack = int(data.get("have", 0)), int(data.get("kick_ack", 0))
                land = None if data.get("land") is None else (float(data["land"][0]), float(data["land"][1]))
            except (TypeError, ValueError, IndexError, KeyError):
                self.send_json({"error": "x / y / vy / face / move / seq / have / kick_ack / land 格式不對"}, 400)
                return
            result, snap = self.db.minigame_climb(
                self.headers.get("X-Token", ""), x, y, vy, bool(data.get("grounded")), face, move, seq, have, kick_ack, land
            )
            if snap is not None:
                self.send_json(snap)
            else:
                self.send_json({"result": result}, 401 if result == "unknown" else 409)
        elif self.path == "/api/description":
            result = self.db.set_description(self.headers.get("X-Token", ""), str(data.get("description", "")))
            status = {"ok": 200, "unknown": 401, "empty": 400, "too_long": 400, "not_claimed": 409, "locked": 409}
            self.send_json({"result": result}, status[result])
        elif self.path == "/api/admin/stage":
            result, detail = self.db.set_stage(
                self.headers.get("X-Token", ""), str(data.get("stage", "")), cms.STAGE_KEYS
            )
            status = {"ok": 200, "forbidden": 403, "invalid": 400, "incomplete": 409}[result]
            self.send_json({"result": result, **detail}, status)
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
