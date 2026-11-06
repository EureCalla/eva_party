"""Add a player to the game DB, or list the current players.

Players (and their gifts) live only in the database. Usage:

    python tools/add_player.py Eden 魷魚            # 預設暗號 eva
    python tools/add_player.py Eden 魷魚 --password xyz
    python tools/add_player.py Eden 魷魚 --admin    # 給管理者權限
    python tools/add_player.py --list

New gifts go after the existing ones, so claims already made are untouched.
The running server picks the new player up on the next page load.
"""

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import mpivr20_cms as cms  # noqa: E402
from models import GameDB  # noqa: E402


def main() -> None:
    """Parse arguments and add or list players."""
    sys.stdout.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(description="新增或列出交換禮物遊戲的使用者")
    parser.add_argument("en_name", nargs="?", help="英文名字（登入選單顯示的名字）")
    parser.add_argument("animal", nargs="?", help="動物（禮物牆上顯示「{動物}的禮物」）")
    parser.add_argument("--password", default=cms.DEFAULT_PASSWORD, help="暗號，預設 eva")
    parser.add_argument("--admin", action="store_true", help="給管理者權限（permission = admin）")
    parser.add_argument("--list", action="store_true", help="列出目前所有使用者")
    args = parser.parse_args()

    db = GameDB(cms.DB_PATH)
    if args.en_name and args.animal:
        try:
            db.add_player(args.en_name, args.animal, args.password, "admin" if args.admin else "user")
        except ValueError as e:
            sys.exit(f"[add_player] {e}")
    elif not args.list:
        parser.error("請給名字和動物，或用 --list")

    rows = db.list_players()
    print(f"[add_player] 共 {len(rows)} 人（禮物牆順序）")
    for r in rows:
        state = "已認領" if r["claimed_by"] is not None else ""
        role = "管理者" if r["permission"] == "admin" else ""
        print(f"  {r['gift_order']:>3}  {r['en_name']:<10} {r['animal']} {role} {state}")


if __name__ == "__main__":
    main()
