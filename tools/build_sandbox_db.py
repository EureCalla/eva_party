"""Build sandbox/sandbox.db from a read-only copy of the real game DB.

The sandbox server (python sandbox_app.py, port 8478) uses this file so new
stage screens can be designed without touching the real DB. Usage:

    python tools/build_sandbox_db.py              # 沙盒 DB 不存在才建立
    python tools/build_sandbox_db.py --force      # 重建，覆蓋現有沙盒 DB
    python tools/build_sandbox_db.py --source D:\\backup\\game.db
    python tools/build_sandbox_db.py --stage reveal

The real DB is only copied, never opened for writing. On the copy, every
migration of the current code is applied (so the format matches models.py),
login sessions are cleared, the stage is switched to the sandbox stage, and
the draw order is shuffled anew (the real DB's order is never carried over).
Players, claims and labels are kept as they were in the real DB.
"""

import argparse
import shutil
import sqlite3
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import mpivr20_cms as cms  # noqa: E402
from models import GameDB  # noqa: E402


def build(source: Path, target: Path, stage: str) -> None:
    """Copy ``source`` to ``target`` and prepare the copy for the sandbox.

    Writes to a temporary file first, so a failed build never leaves a broken
    sandbox DB behind. Raises FileNotFoundError when the source is missing and
    sqlite3.DatabaseError when the copy fails the integrity check.
    """
    if not source.is_file():
        raise FileNotFoundError(f"找不到正式 DB：{source}")
    target.parent.mkdir(parents=True, exist_ok=True)
    tmp = target.with_name(target.name + ".building")
    tmp.unlink(missing_ok=True)
    shutil.copyfile(source, tmp)
    print(f"[sandbox_db] copied {source} -> {tmp}")
    try:
        db = GameDB(tmp)  # 套用目前程式碼的所有 migration
        conn = db.conn
        result = conn.execute("PRAGMA integrity_check").fetchone()[0]
        if result != "ok":
            raise sqlite3.DatabaseError(f"複本檢查失敗：{result}（正式 DB 可能正在寫入，請稍後再試）")
        cleared = conn.execute("DELETE FROM sessions").rowcount
        now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
        conn.execute(
            "UPDATE settings SET value = ?, updated_at = ?, updated_by = NULL WHERE key = 'stage'", (stage, now)
        )
        conn.commit()
        db.shuffle_draw_order()  # 測試庫自己洗一次，不沿用正式 DB 的抽獎順序
        players = db.player_count()
        claimed = conn.execute(
            "SELECT COUNT(*) FROM players WHERE claimed_by IS NOT NULL AND is_deleted = 0"
        ).fetchone()[0]
        conn.close()
    except Exception:
        tmp.unlink(missing_ok=True)
        raise
    try:
        tmp.replace(target)
    except PermissionError:
        tmp.unlink(missing_ok=True)
        raise sqlite3.DatabaseError("沙盒 DB 正被使用中，請先關掉 sandbox_app.py（Ctrl+C）再重建") from None
    print(f"[sandbox_db] sessions cleared: {cleared}")
    print(f"[sandbox_db] stage -> {stage}")
    print(f"[sandbox_db] players: {players}, claimed gifts: {claimed}")
    print(f"[sandbox_db] ready: {target}")


def main() -> None:
    """Parse arguments and build the sandbox DB."""
    sys.stdout.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(description="從正式 DB 複製出沙盒用的 sandbox.db")
    parser.add_argument("--source", type=Path, default=cms.DB_PATH, help="來源 DB，預設為共享槽上的正式 DB")
    parser.add_argument("--target", type=Path, default=cms.SANDBOX_DB_PATH, help="沙盒 DB 位置")
    parser.add_argument("--stage", choices=cms.STAGE_KEYS, default=cms.SANDBOX_STAGE, help="沙盒 DB 的活動階段")
    parser.add_argument("--force", action="store_true", help="沙盒 DB 已存在時覆蓋重建")
    args = parser.parse_args()
    if args.target.exists() and not args.force:
        print(f"[sandbox_db] 已存在：{args.target}，要重建請加 --force")
        return
    try:
        build(args.source, args.target, args.stage)
    except (FileNotFoundError, sqlite3.DatabaseError) as e:
        print(f"[sandbox_db] 失敗：{e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
