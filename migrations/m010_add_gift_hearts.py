"""Migration 010: one heart per voter and gift."""

import sqlite3


def apply(conn: sqlite3.Connection) -> None:
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS gift_hearts (
            voter_id INTEGER NOT NULL REFERENCES players(id),
            gift_id INTEGER NOT NULL REFERENCES players(id),
            PRIMARY KEY (voter_id, gift_id)
        );
        CREATE INDEX IF NOT EXISTS idx_gift_hearts_gift_id ON gift_hearts(gift_id);
        """
    )
