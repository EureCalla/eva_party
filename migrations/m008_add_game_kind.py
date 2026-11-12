"""Migration 008: which minigame an exchange round played."""

import sqlite3


def apply(conn: sqlite3.Connection) -> bool:
    """Add exchange_rounds.game_kind if missing; returns True when applied.

    - exchange_rounds.game_kind: 小遊戲種類（stones＝雪地大亂鬥、count＝報數遊戲），沒進小遊戲為 NULL
    """
    cols = {r[1] for r in conn.execute("PRAGMA table_info(exchange_rounds)")}
    if "game_kind" in cols:
        return False
    conn.execute("ALTER TABLE exchange_rounds ADD COLUMN game_kind TEXT")
    conn.commit()
    print("[migration] 008 add game kind: applied")
    return True
