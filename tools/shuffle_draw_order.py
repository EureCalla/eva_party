"""Shuffle the gift-exchange draw order by hand, without showing it.

Normally not needed: switching the stage to 交換禮物遊戲 on the admin page
reshuffles automatically, seeded with the switch time (yyyymmddhhmm).

    python tools/shuffle_draw_order.py                  # 正式 DB，已有順序就不動
    python tools/shuffle_draw_order.py --force          # 正式 DB，以現在時間為種子重新洗牌
    python tools/shuffle_draw_order.py --db sandbox/sandbox.db --force --seed 202611271030

Before writing, the DB file is backed up next to itself
(game.db.bak-YYYYMMDD-HHMMSS). Only counts are printed, never the order or seed.
"""

import argparse
import shutil
import sqlite3
import sys
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import mpivr20_cms as cms  # noqa: E402
from models import GameDB  # noqa: E402


def backup(db_path: Path) -> Path:
    """Copy the DB file next to itself with a timestamp suffix; returns the backup path."""
    dest = db_path.with_name(f"{db_path.name}.bak-{datetime.now():%Y%m%d-%H%M%S}")
    shutil.copyfile(db_path, dest)
    print(f"[draw_order] backup: {dest}")
    return dest


def has_order(db_path: Path) -> bool:
    """Return True when the DB already has a draw order; reads only, applies no migration."""
    conn = sqlite3.connect(str(db_path))
    try:
        cols = {r[1] for r in conn.execute("PRAGMA table_info(players)")}
        if "draw_order" not in cols:
            return False
        row = conn.execute(
            "SELECT 1 FROM players WHERE draw_order IS NOT NULL AND is_deleted = 0 LIMIT 1"
        ).fetchone()
        return row is not None
    finally:
        conn.close()


def main() -> None:
    """Parse arguments, back up the DB and shuffle the draw order."""
    sys.stdout.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(description="隨機決定交換禮物的抽獎順序（不顯示順序）")
    parser.add_argument("--db", type=Path, default=cms.DB_PATH, help="要洗牌的 DB，預設為正式 DB")
    parser.add_argument("--force", action="store_true", help="已有順序時重新洗牌")
    parser.add_argument("--seed", help="洗牌種子，預設為現在時間 yyyymmddhhmm；同一個種子必得同一個順序")
    args = parser.parse_args()
    if not args.db.is_file():
        print(f"[draw_order] 找不到 DB：{args.db}")
        sys.exit(1)
    if has_order(args.db) and not args.force:
        print("[draw_order] 已經有抽獎順序，未變更；要重新洗牌請加 --force")
        return
    backup(args.db)  # 確定要寫入才備份；GameDB 開啟時就會套用 migration
    db = GameDB(args.db)
    db.shuffle_draw_order(args.seed)
    print(f"[draw_order] done: {db.player_count()} gifts in {args.db}")


if __name__ == "__main__":
    main()
