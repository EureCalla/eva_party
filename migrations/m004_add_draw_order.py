"""Migration 004: add players.draw_order for the gift-exchange stage."""

import sqlite3


def apply(conn: sqlite3.Connection) -> bool:
    """Add players.draw_order (NULL until shuffled) if missing; returns True when applied.

    The order itself is filled by GameDB.shuffle_draw_order (tools/shuffle_draw_order.py),
    never here, so applying the migration alone reveals nothing.
    """
    cols = {r[1] for r in conn.execute("PRAGMA table_info(players)")}
    if "draw_order" in cols:
        return False
    conn.execute("ALTER TABLE players ADD COLUMN draw_order INTEGER")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_players_draw_order ON players(draw_order)")
    conn.commit()
    print("[migration] 004 add draw_order: applied")
    return True
