"""SQLite storage for players, sessions and gift claims."""

import json
import random
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

    def seed(self, roster_path: Path, default_password: str) -> None:
        """Insert the roster with a shuffled gift order, only when the table is empty."""
        with self.lock:
            count = self.conn.execute("SELECT COUNT(*) FROM players").fetchone()[0]
            if count:
                print(f"[models] seed skipped, {count} players already exist")
                return
            roster = json.loads(roster_path.read_text(encoding="utf-8"))
            order = list(range(len(roster)))
            random.shuffle(order)
            now = utc_now()
            self.conn.executemany(
                "INSERT INTO players (en_name, animal, password, gift_order, created_at) VALUES (?, ?, ?, ?, ?)",
                [(p["en_name"], p["animal"], default_password, order[i], now) for i, p in enumerate(roster)],
            )
            self.conn.commit()
        print(f"[models] seeded {len(roster)} players")

    def roster_names(self) -> list[str]:
        """Return all player names in roster order, for the login drop-down."""
        rows = self.conn.execute("SELECT en_name FROM players WHERE is_deleted = 0 ORDER BY id").fetchall()
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

    def state(self, token: str | None) -> dict[str, Any]:
        """Return the gift wall in display order, plus the caller's own claim if logged in."""
        rows = self.conn.execute(
            "SELECT id, animal, claimed_by, label FROM players WHERE is_deleted = 0 ORDER BY gift_order"
        ).fetchall()
        gifts = [
            {"gift_id": r["id"], "animal": r["animal"], "claimed": r["claimed_by"] is not None, "label": r["label"]}
            for r in rows
        ]
        me: dict[str, Any] | None = None
        player = self.player_by_token(token) if token else None
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
