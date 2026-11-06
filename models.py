"""SQLite storage for players, sessions and gift claims."""

import secrets
import sqlite3
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from migrations import m001_add_gift_label

SCHEMA = """
CREATE TABLE IF NOT EXISTS players (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    en_name     TEXT NOT NULL UNIQUE,
    animal      TEXT NOT NULL,
    password    TEXT NOT NULL,
    gift_order  INTEGER NOT NULL,
    claimed_by  INTEGER REFERENCES players(id),
    claimed_at  DATETIME,
    created_at  DATETIME NOT NULL,
    is_deleted  INTEGER DEFAULT 0,
    deleted_at  DATETIME
);
CREATE INDEX IF NOT EXISTS idx_players_en_name ON players(en_name);
CREATE INDEX IF NOT EXISTS idx_players_claimed_by ON players(claimed_by);

CREATE TABLE IF NOT EXISTS sessions (
    token       TEXT PRIMARY KEY,
    player_id   INTEGER NOT NULL REFERENCES players(id),
    created_at  DATETIME NOT NULL,
    is_deleted  INTEGER DEFAULT 0,
    deleted_at  DATETIME
);
CREATE INDEX IF NOT EXISTS idx_sessions_player_id ON sessions(player_id);
"""


def utc_now() -> str:
    """Return the current UTC time as 'YYYY-MM-DD HH:MM:SS'."""
    return datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")


class GameDB:
    """Players, login sessions and gift claims.

    Each player row is also that player's gift. A gift is claimed when
    ``claimed_by`` is set; the claimer is not always the row's owner because
    two players can share an animal (both squirrels may take either gift).
    """

    def __init__(self, db_path: Path) -> None:
        """Open the database and create tables if needed."""
        self.conn = sqlite3.connect(str(db_path), check_same_thread=False)
        self.conn.row_factory = sqlite3.Row
        self.conn.execute("PRAGMA foreign_keys = ON")
        self.lock = threading.Lock()
        with self.lock:
            self.conn.executescript(SCHEMA)
            m001_add_gift_label.apply(self.conn)
        print(f"[models] DB ready: {db_path}")

    def player_count(self) -> int:
        """Return how many active players exist."""
        return self.conn.execute("SELECT COUNT(*) FROM players WHERE is_deleted = 0").fetchone()[0]

    def add_player(self, en_name: str, animal: str, password: str) -> int:
        """Add a player (and their gift) after the existing gifts; returns the new id.

        Appending keeps the wall order and every claim already made untouched.
        Raises ValueError when the name already exists.
        """
        with self.lock:
            if self.conn.execute("SELECT 1 FROM players WHERE en_name = ?", (en_name,)).fetchone():
                raise ValueError(f"{en_name} 已經存在")
            last = self.conn.execute("SELECT MAX(gift_order) FROM players").fetchone()[0]
            cur = self.conn.execute(
                "INSERT INTO players (en_name, animal, password, gift_order, created_at) VALUES (?, ?, ?, ?, ?)",
                (en_name, animal, password, 0 if last is None else last + 1, utc_now()),
            )
            self.conn.commit()
        print(f"[models] player added: {en_name} ({animal})")
        return cur.lastrowid

    def list_players(self) -> list[sqlite3.Row]:
        """Return all active players in gift-wall order."""
        return self.conn.execute(
            "SELECT id, en_name, animal, gift_order, claimed_by, label FROM players "
            "WHERE is_deleted = 0 ORDER BY gift_order"
        ).fetchall()

    def roster_names(self) -> list[str]:
        """Return all player names in alphabetical order, for the login drop-down."""
        rows = self.conn.execute(
            "SELECT en_name FROM players WHERE is_deleted = 0 ORDER BY en_name COLLATE NOCASE"
        ).fetchall()
        return [r["en_name"] for r in rows]

    def login(self, en_name: str, password: str) -> str | None:
        """Check the password and return a new session token, or None on failure."""
        with self.lock:
            row = self.conn.execute(
                "SELECT id, password FROM players WHERE en_name = ? AND is_deleted = 0", (en_name,)
            ).fetchone()
            if row is None or row["password"] != password:
                print(f"[models] login failed: {en_name}")
                return None
            token = secrets.token_urlsafe(24)
            self.conn.execute(
                "INSERT INTO sessions (token, player_id, created_at) VALUES (?, ?, ?)", (token, row["id"], utc_now())
            )
            self.conn.commit()
        print(f"[models] login ok: {en_name}")
        return token

    def player_by_token(self, token: str) -> sqlite3.Row | None:
        """Return the player row for a session token."""
        return self.conn.execute(
            "SELECT p.* FROM sessions s JOIN players p ON p.id = s.player_id "
            "WHERE s.token = ? AND s.is_deleted = 0 AND p.is_deleted = 0",
            (token,),
        ).fetchone()

    def state(self, token: str | None, reveal_labels: bool = False) -> dict[str, Any]:
        """Return the gift wall in display order, plus the caller's own claim if logged in.

        Unless ``reveal_labels`` is set, only the caller's own gift carries its
        label; everyone still sees which gifts are claimed.
        """
        rows = self.conn.execute(
            "SELECT id, animal, claimed_by, label FROM players WHERE is_deleted = 0 ORDER BY gift_order"
        ).fetchall()
        player = self.player_by_token(token) if token else None
        my_id = player["id"] if player is not None else None
        gifts = [
            {
                "gift_id": r["id"],
                "animal": r["animal"],
                "claimed": r["claimed_by"] is not None,
                "label": r["label"] if reveal_labels or (my_id is not None and r["claimed_by"] == my_id) else None,
            }
            for r in rows
        ]
        me: dict[str, Any] | None = None
        if player is not None:
            mine = next((r for r in rows if r["claimed_by"] == player["id"]), None)
            me = {
                "name": player["en_name"],
                "gift_id": mine["id"] if mine else None,
                "animal": mine["animal"] if mine else None,
                "label": mine["label"] if mine else None,
            }
        return {"gifts": gifts, "me": me}

    def set_label(self, token: str, label: str, allowed: list[str]) -> str:
        """Set the label on the gift the caller claimed; returns ok / invalid / not_claimed / unknown."""
        if label not in allowed:
            return "invalid"
        with self.lock:
            player = self.player_by_token(token)
            if player is None:
                return "unknown"
            cur = self.conn.execute(
                "UPDATE players SET label = ?, labeled_at = ? WHERE claimed_by = ?", (label, utc_now(), player["id"])
            )
            self.conn.commit()
        if cur.rowcount == 0:
            return "not_claimed"
        print(f"[models] label set: {player['en_name']} -> {label}")
        return "ok"

    def guess(self, token: str, gift_id: int) -> str:
        """Try to claim a gift; returns correct / wrong / taken / already / unknown."""
        with self.lock:
            player = self.player_by_token(token)
            if player is None:
                return "unknown"
            done = self.conn.execute("SELECT 1 FROM players WHERE claimed_by = ?", (player["id"],)).fetchone()
            if done:
                return "already"
            gift = self.conn.execute(
                "SELECT animal, claimed_by FROM players WHERE id = ? AND is_deleted = 0", (gift_id,)
            ).fetchone()
            if gift is None:
                return "unknown"
            if gift["claimed_by"] is not None:
                return "taken"
            if gift["animal"] != player["animal"]:
                print(f"[models] guess wrong: {player['en_name']} -> {gift['animal']}")
                return "wrong"
            self.conn.execute(
                "UPDATE players SET claimed_by = ?, claimed_at = ? WHERE id = ?", (player["id"], utc_now(), gift_id)
            )
            self.conn.commit()
        print(f"[models] guess correct: {player['en_name']} is {gift['animal']}")
        return "correct"
