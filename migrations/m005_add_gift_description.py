"""Migration 005: add gift description columns to players."""

import sqlite3


def apply(conn: sqlite3.Connection) -> bool:
    """Add players.description and players.described_at if missing; returns True when columns were added."""
    cols = {r[1] for r in conn.execute("PRAGMA table_info(players)")}
    if "description" in cols:
        return False
    conn.execute("ALTER TABLE players ADD COLUMN description TEXT")
    conn.execute("ALTER TABLE players ADD COLUMN described_at DATETIME")
    conn.commit()
    print("[migration] 005 add gift description: applied")
    return True
