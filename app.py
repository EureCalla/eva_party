"""Entry point: prepare the database and start the game server."""

import socket
import sys

import mpivr20_cms as cms
from game_server import GameServer
from introduce import Introduce
from models import GameDB


def lan_ip() -> str:
    """Return this machine's LAN IP so phones on the same network can connect."""
    with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
        try:
            s.connect(("10.255.255.255", 1))
            return s.getsockname()[0]
        except OSError:
            return "127.0.0.1"


def main() -> None:
    """Seed the roster on first run, then serve until Ctrl+C."""
    sys.stdout.reconfigure(encoding="utf-8")
    info = Introduce()
    print(f"[app] {info.program} {info.version}")
    db = GameDB(cms.DB_PATH)
    db.seed(cms.ROSTER_PATH, cms.DEFAULT_PASSWORD)
    server = GameServer(cms.HOST, cms.PORT, cms.STATIC_DIR, db)
    print(f"[app] 本機：http://localhost:{cms.PORT}")
    print(f"[app] 手機：http://{lan_ip()}:{cms.PORT}")
    server.serve_forever()


if __name__ == "__main__":
    main()
