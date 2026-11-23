"""Migration 010: remember whether a player has set their own password."""

import sqlite3


def apply(conn: sqlite3.Connection) -> bool:
    """Add players.password_changed if missing; returns True when the column was added.

    - password_changed：1＝本人已改過自己的暗號（公布標籤起一般人登入要先改一次），0＝還是共用暗號
    """
    cols = {r[1] for r in conn.execute("PRAGMA table_info(players)")}
    if "password_changed" in cols:
        return False
    conn.execute("ALTER TABLE players ADD COLUMN password_changed INTEGER DEFAULT 0")
    conn.commit()
    print("[migration] 010 add password changed: applied")
    return True
