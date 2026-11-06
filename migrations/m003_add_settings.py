"""Migration 003: add the settings table and the initial activity stage."""

import sqlite3
from datetime import datetime, timezone


def apply(conn: sqlite3.Connection) -> bool:
    """Create settings (key/value) with stage = 'seating' if missing; returns True when applied."""
    exists = conn.execute("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'settings'").fetchone()
    if exists:
        return False
    conn.executescript(
        """
        CREATE TABLE settings (
            key         TEXT PRIMARY KEY,
            value       TEXT NOT NULL,
            updated_at  DATETIME,
            updated_by  INTEGER REFERENCES players(id),
            is_deleted  INTEGER DEFAULT 0,
            deleted_at  DATETIME
        );
        CREATE INDEX IF NOT EXISTS idx_settings_updated_by ON settings(updated_by);
        """
    )
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
    conn.execute("INSERT INTO settings (key, value, updated_at) VALUES ('stage', 'seating', ?)", (now,))
    conn.commit()
    print("[migration] 003 add settings: applied, stage = seating")
    return True
