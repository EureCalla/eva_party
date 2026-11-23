"""Migration 011: a final gift recipient's note to the giver."""

import sqlite3


def apply(conn: sqlite3.Connection) -> None:
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS feast_replies (
            gift_id INTEGER NOT NULL REFERENCES players(id),
            sender_id INTEGER NOT NULL REFERENCES players(id),
            giver_id INTEGER NOT NULL REFERENCES players(id),
            message TEXT NOT NULL CHECK (length(trim(message)) BETWEEN 1 AND 50),
            created_at DATETIME NOT NULL,
            PRIMARY KEY (gift_id, sender_id, giver_id)
        );
        """
    )
