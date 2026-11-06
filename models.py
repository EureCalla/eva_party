"""SQLite storage for players, sessions and gift claims."""

import secrets
import sqlite3
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from migrations import m001_add_gift_label, m002_add_permission, m003_add_settings

PERMISSIONS = ("user", "admin")

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
            m002_add_permission.apply(self.conn)
            m003_add_settings.apply(self.conn)
        print(f"[models] DB ready: {db_path}")

    def player_count(self) -> int:
        """Return how many active players exist."""
        return self.conn.execute("SELECT COUNT(*) FROM players WHERE is_deleted = 0").fetchone()[0]

    def add_player(self, en_name: str, animal: str, password: str, permission: str = "user") -> int:
        """Add a player (and their gift) after the existing gifts; returns the new id.

        Appending keeps the wall order and every claim already made untouched.
        Raises ValueError when the name already exists or the permission is unknown.
        """
        en_name, animal = en_name.strip(), animal.strip()
        if not en_name or not animal:
            raise ValueError("名字和動物都要填")
        if permission not in PERMISSIONS:
            raise ValueError(f"permission 只能是 {' / '.join(PERMISSIONS)}")
        with self.lock:
            old = self.conn.execute("SELECT id, is_deleted FROM players WHERE en_name = ?", (en_name,)).fetchone()
            if old is not None and not old["is_deleted"]:
                raise ValueError(f"{en_name} 已經存在")
            last = self.conn.execute("SELECT MAX(gift_order) FROM players").fetchone()[0]
            order = 0 if last is None else last + 1
            if old is not None:
                # 之前刪掉的同名使用者：復原成全新的一份禮物
                self.conn.execute(
                    "UPDATE players SET animal = ?, password = ?, permission = ?, gift_order = ?, claimed_by = NULL, "
                    "claimed_at = NULL, label = NULL, labeled_at = NULL, is_deleted = 0, deleted_at = NULL WHERE id = ?",
                    (animal, password, permission, order, old["id"]),
                )
                new_id = old["id"]
            else:
                cur = self.conn.execute(
                    "INSERT INTO players (en_name, animal, password, gift_order, permission, created_at) "
                    "VALUES (?, ?, ?, ?, ?, ?)",
                    (en_name, animal, password, order, permission, utc_now()),
                )
                new_id = cur.lastrowid
            self.conn.commit()
        print(f"[models] player added: {en_name} ({animal}, {permission})")
        return new_id

    def update_player(
        self,
        player_id: int,
        en_name: str,
        animal: str,
        permission: str,
        password: str | None,
        role_passwords: dict[str, str],
    ) -> None:
        """Edit a player's name, animal, permission and password; claims and labels are kept.

        When the permission changes and no new password was typed, the password
        switches to that role's default (``role_passwords``). A typed password
        always wins. Raises ValueError on empty fields, an unknown permission or
        a duplicate name.
        """
        en_name, animal = en_name.strip(), animal.strip()
        if not en_name or not animal:
            raise ValueError("名字和動物都要填")
        if permission not in PERMISSIONS:
            raise ValueError(f"permission 只能是 {' / '.join(PERMISSIONS)}")
        with self.lock:
            row = self.conn.execute(
                "SELECT permission, password FROM players WHERE id = ? AND is_deleted = 0", (player_id,)
            ).fetchone()
            if row is None:
                raise ValueError("找不到這個使用者")
            dup = self.conn.execute(
                "SELECT 1 FROM players WHERE en_name = ? AND id != ?", (en_name, player_id)
            ).fetchone()
            if dup:
                raise ValueError(f"{en_name} 已經有人用了")
            typed = (password or "").strip()
            if password is not None and not typed:
                raise ValueError("暗號不能是空白")
            if typed and typed != row["password"]:
                new_password = typed
            elif permission != row["permission"]:
                new_password = role_passwords[permission]
            else:
                new_password = row["password"]
            self.conn.execute(
                "UPDATE players SET en_name = ?, animal = ?, permission = ?, password = ? WHERE id = ?",
                (en_name, animal, permission, new_password, player_id),
            )
            self.conn.commit()
        changed = "，暗號已更新" if new_password != row["password"] else ""
        print(f"[models] player updated: #{player_id} -> {en_name} ({animal}, {permission}){changed}")

    def delete_player(self, player_id: int) -> None:
        """Soft-delete a player and their gift; a gift they had claimed is released.

        Their login sessions stop working because player_by_token skips deleted players.
        """
        with self.lock:
            row = self.conn.execute(
                "SELECT en_name FROM players WHERE id = ? AND is_deleted = 0", (player_id,)
            ).fetchone()
            if row is None:
                raise ValueError("找不到這個使用者")
            self.conn.execute(
                "UPDATE players SET claimed_by = NULL, claimed_at = NULL, label = NULL, labeled_at = NULL "
                "WHERE claimed_by = ?",
                (player_id,),
            )
            self.conn.execute(
                "UPDATE players SET is_deleted = 1, deleted_at = ? WHERE id = ?", (utc_now(), player_id)
            )
            self.conn.commit()
        print(f"[models] player deleted: {row['en_name']}")

    def list_players(self) -> list[sqlite3.Row]:
        """Return all active players in gift-wall order."""
        return self.conn.execute(
            "SELECT id, en_name, animal, gift_order, claimed_by, label, permission FROM players "
            "WHERE is_deleted = 0 ORDER BY gift_order"
        ).fetchall()

    def admin_players(self) -> list[dict[str, Any]]:
        """Return players for the admin page, alphabetical, with password, guess status and label."""
        rows = self.conn.execute(
            "SELECT p.id, p.en_name, p.animal, p.permission, p.password, g.label AS my_label, g.id AS my_gift "
            "FROM players p LEFT JOIN players g ON g.claimed_by = p.id AND g.is_deleted = 0 "
            "WHERE p.is_deleted = 0 ORDER BY p.en_name COLLATE NOCASE"
        ).fetchall()
        return [
            {
                "id": r["id"],
                "en_name": r["en_name"],
                "animal": r["animal"],
                "admin": r["permission"] == "admin",
                "password": r["password"],
                "guessed": r["my_gift"] is not None,
                "label": r["my_label"],
            }
            for r in rows
        ]

    def is_admin(self, token: str | None) -> bool:
        """Return True when the session belongs to a player with admin permission."""
        player = self.player_by_token(token) if token else None
        return player is not None and player["permission"] == "admin"

    def get_stage(self) -> str:
        """Return the current activity stage key."""
        row = self.conn.execute("SELECT value FROM settings WHERE key = 'stage' AND is_deleted = 0").fetchone()
        return row["value"] if row else "seating"

    def set_stage(self, token: str, stage: str, allowed: list[str]) -> str:
        """Switch the activity stage (admins only); returns ok / forbidden / invalid."""
        if stage not in allowed:
            return "invalid"
        with self.lock:
            player = self.player_by_token(token) if token else None
            if player is None or player["permission"] != "admin":
                return "forbidden"
            self.conn.execute(
                "UPDATE settings SET value = ?, updated_at = ?, updated_by = ? WHERE key = 'stage'",
                (stage, utc_now(), player["id"]),
            )
            self.conn.commit()
        print(f"[models] stage -> {stage} by {player['en_name']}")
        return "ok"

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

    def state(self, token: str | None) -> dict[str, Any]:
        """Return the stage, the gift wall in display order, and the caller's own claim.

        During the seating stage only the caller's own gift carries its label;
        from the reveal stage on, every label is visible. Everyone always sees
        which gifts are claimed.
        """
        stage = self.get_stage()
        reveal_labels = stage != "seating"
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
                "is_admin": player["permission"] == "admin",
            }
        return {"stage": stage, "gifts": gifts, "me": me}

    def set_label(self, token: str, label: str, allowed: list[str]) -> str:
        """Set the label on the gift the caller claimed; returns ok / invalid / not_claimed / unknown / locked."""
        if label not in allowed:
            return "invalid"
        with self.lock:
            player = self.player_by_token(token)
            if player is None:
                return "unknown"
            if self.get_stage() != "seating":
                return "locked"
            cur = self.conn.execute(
                "UPDATE players SET label = ?, labeled_at = ? WHERE claimed_by = ?", (label, utc_now(), player["id"])
            )
            self.conn.commit()
        if cur.rowcount == 0:
            return "not_claimed"
        print(f"[models] label set: {player['en_name']} -> {label}")
        return "ok"

    def guess(self, token: str, gift_id: int) -> str:
        """Try to claim a gift; returns correct / wrong / taken / already / unknown / locked."""
        with self.lock:
            player = self.player_by_token(token)
            if player is None:
                return "unknown"
            if self.get_stage() != "seating":
                return "locked"
            done =self.conn.execute("SELECT 1 FROM players WHERE claimed_by = ?", (player["id"],)).fetchone()
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
