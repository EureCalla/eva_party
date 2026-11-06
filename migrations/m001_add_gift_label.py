"""Migration 001: add gift label columns to players."""

import sqlite3


def apply(conn: sqlite3.Connection) -> bool:
    """Add players.label and players.labeled_at if missing; returns True when columns were added."""
    cols = {r[1] for r in conn.execute("PRAGMA table_info(players)")}
    if "label" in cols:
        return False
    conn.execute("ALTER TABLE players ADD COLUMN label TEXT")
    conn.execute("ALTER TABLE players ADD COLUMN labeled_at DATETIME")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_players_label ON players(label)")
    conn.commit()
    print("[migration] 001 add gift label: applied")
    return True
