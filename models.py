"""SQLite storage for players, sessions and gift claims."""

import json
import random
import secrets
import sqlite3
import threading
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import mpivr20_cms as cms
from countgame import CountBattle
from minigame import StoneBattle
from migrations import (
    m001_add_gift_label,
    m002_add_permission,
    m003_add_settings,
    m004_add_draw_order,
    m005_add_gift_description,
    m006_add_exchange,
    m007_add_minigame,
    m008_add_game_kind,
)

PERMISSIONS = ("user", "admin")
EXCHANGE_STAGE = "exchange"  # 進入這個階段時重新洗抽獎順序
DESCRIPTION_MAX = 50  # 禮物描述字數上限
DESCRIBE_STAGES = ("reveal", "exchange")  # 可以寫／改禮物描述的階段
DESCRIPTION_PUBLIC_STAGES = ("exchange", "feast")  # 描述對所有人公開的階段（聚光燈講話框）

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


def epoch_to_utc(epoch: float) -> str:
    """Convert epoch seconds to a UTC 'YYYY-MM-DD HH:MM:SS' string."""
    return datetime.fromtimestamp(epoch, timezone.utc).strftime("%Y-%m-%d %H:%M:%S")


def draw_seed_now() -> str:
    """Return the current local time as 'yyyymmddhhmm', the seed for shuffling the draw order."""
    return datetime.now().strftime("%Y%m%d%H%M")


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
            m004_add_draw_order.apply(self.conn)
            m005_add_gift_description.apply(self.conn)
            m006_add_exchange.apply(self.conn)
            m007_add_minigame.apply(self.conn)
            m008_add_game_kind.apply(self.conn)
        # 交換禮物遊戲參數；沙盒可改 round_sec 縮短測試
        self.round_sec: float = cms.EXCHANGE_ROUND_SEC
        self.max_challengers: int = cms.MAX_CHALLENGERS
        self.start_tickets: int = cms.START_TICKETS
        # 小遊戲參數；沙盒可改 game_sec 縮短
        self.game_prep_sec: float = cms.GAME_PREP_SEC
        self.game_sec: float = cms.GAME_SEC
        self.game_reveal_sec: float = cms.GAME_REVEAL_SEC
        self.game_hp: int = cms.GAME_HP
        self.count_game_sec: float = cms.COUNT_GAME_SEC
        self.count_bots: int = cms.COUNT_BOTS
        self.game_mode: str = "random"  # 小遊戲種類：random（隨機）／stones／count；沙盒可指定
        self.spin_sec: float = cms.SPIN_SEC
        self.battle: StoneBattle | CountBattle | None = None  # 進行中的小遊戲（只在記憶體）
        self.battle_kind: str | None = None  # stones / count
        self.battle_spin_end: float = 0.0  # 轉盤轉完的時間；之前不公開遊戲種類
        self.battle_round_id: int | None = None
        self._token_ids: dict[str, int] = {}  # 小遊戲每秒很多次請求，token→player id 快取免得一直查 DB
        print(f"[models] DB ready: {db_path}")

    def player_count(self) -> int:
        """Return how many active players exist."""
        return self.conn.execute("SELECT COUNT(*) FROM players WHERE is_deleted = 0").fetchone()[0]

    def has_draw_order(self) -> bool:
        """Return True when any active gift already has a draw position."""
        row = self.conn.execute(
            "SELECT 1 FROM players WHERE draw_order IS NOT NULL AND is_deleted = 0 LIMIT 1"
        ).fetchone()
        return row is not None

    def shuffle_draw_order(self, seed: str | None = None, by: int | None = None) -> str:
        """Shuffle the draw order from ``seed`` (default: now as yyyymmddhhmm); returns the seed used."""
        with self.lock:
            return self._shuffle_draw_order(seed, by)

    def _shuffle_draw_order(self, seed: str | None, by: int | None) -> str:
        """Shuffle every active gift's draw position (0-based) and record the seed; caller holds the lock.

        The same seed always gives the same order (gifts are shuffled from id
        order), so the order can be reproduced from settings.draw_seed. Neither
        the order nor the seed is printed. Deleted gifts get NULL.
        """
        seed = seed or draw_seed_now()
        ids = [r["id"] for r in self.conn.execute("SELECT id FROM players WHERE is_deleted = 0 ORDER BY id")]
        random.Random(seed).shuffle(ids)
        self.conn.execute("UPDATE players SET draw_order = NULL")
        self.conn.executemany(
            "UPDATE players SET draw_order = ? WHERE id = ?", [(i, gift_id) for i, gift_id in enumerate(ids)]
        )
        self.conn.execute(
            "INSERT INTO settings (key, value, updated_at, updated_by) VALUES ('draw_seed', ?, ?, ?) "
            "ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, "
            "updated_by = excluded.updated_by",
            (seed, utc_now(), by),
        )
        self.conn.commit()
        print(f"[models] draw order shuffled: {len(ids)} gifts")
        return seed

    def draw_order(self) -> list[int]:
        """Return active gift ids in draw order; gifts without a position (added later) go last."""
        rows = self.conn.execute(
            "SELECT id FROM players WHERE is_deleted = 0 "
            "ORDER BY draw_order IS NULL, draw_order, gift_order"
        ).fetchall()
        return [r["id"] for r in rows]

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
                    "claimed_at = NULL, label = NULL, labeled_at = NULL, description = NULL, described_at = NULL, "
                    "is_deleted = 0, deleted_at = NULL WHERE id = ?",
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
                "UPDATE players SET claimed_by = NULL, claimed_at = NULL, label = NULL, labeled_at = NULL, "
                "description = NULL, described_at = NULL WHERE claimed_by = ?",
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

    def get_setting(self, key: str, default: str) -> str:
        """Return a settings value, or ``default`` when it has never been set."""
        row = self.conn.execute(
            "SELECT value FROM settings WHERE key = ? AND is_deleted = 0", (key,)
        ).fetchone()
        return row["value"] if row else default

    def set_user_password(self, token: str, password: str) -> int:
        """Set every non-admin's password at once (admins only); returns how many were changed.

        The value is also saved as settings.user_password, so players added or
        demoted later get the same password. Raises PermissionError for
        non-admins and ValueError for a blank password.
        """
        password = password.strip()
        if not password:
            raise ValueError("暗號不能是空白")
        with self.lock:
            player = self.player_by_token(token) if token else None
            if player is None or player["permission"] != "admin":
                raise PermissionError("只有管理者可以使用")
            cur = self.conn.execute(
                "UPDATE players SET password = ? WHERE permission = 'user' AND is_deleted = 0", (password,)
            )
            self.conn.execute(
                "INSERT INTO settings (key, value, updated_at, updated_by) VALUES ('user_password', ?, ?, ?) "
                "ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, "
                "updated_by = excluded.updated_by",
                (password, utc_now(), player["id"]),
            )
            self.conn.commit()
        print(f"[models] user password set for {cur.rowcount} players by {player['en_name']}")
        return cur.rowcount

    def get_stage(self) -> str:
        """Return the current activity stage key."""
        row = self.conn.execute("SELECT value FROM settings WHERE key = 'stage' AND is_deleted = 0").fetchone()
        return row["value"] if row else "seating"

    def missing_for_stage(self, stage: str, allowed: list[str]) -> tuple[str, list[str]] | None:
        """Return who is not ready to move into ``stage``: ("label" | "description", names), or None.

        From the reveal stage on, every player needs a claimed gift with a
        label (players who have not found their gift count as missing). From
        the exchange stage on, every gift also needs a description. Names are
        sorted alphabetically.
        """
        idx = allowed.index(stage)
        checks = [
            ("label", "reveal", "g.label IS NULL"),
            ("description", "exchange", "g.description IS NULL OR g.description = ''"),
        ]
        for kind, from_stage, missing_sql in checks:
            if from_stage not in allowed or idx < allowed.index(from_stage):
                continue
            rows = self.conn.execute(
                "SELECT p.en_name FROM players p "
                "LEFT JOIN players g ON g.claimed_by = p.id AND g.is_deleted = 0 "
                f"WHERE p.is_deleted = 0 AND (g.id IS NULL OR {missing_sql}) "
                "ORDER BY p.en_name COLLATE NOCASE"
            ).fetchall()
            if rows:
                return kind, [r["en_name"] for r in rows]
        return None

    def set_stage(self, token: str, stage: str, allowed: list[str]) -> tuple[str, dict[str, Any]]:
        """Switch the activity stage (admins only); returns (ok / forbidden / invalid / incomplete, detail).

        Moving forward is refused with "incomplete" while someone has no label
        (for reveal and later) or no description (for exchange and later);
        detail then holds {"missing": kind, "names": [...]}. Going back is
        always allowed.

        Entering the exchange stage from another stage reshuffles the draw
        order, seeded with the switch time (yyyymmddhhmm), so going back and
        entering again gives a new order.
        """
        if stage not in allowed:
            return "invalid", {}
        with self.lock:
            player = self.player_by_token(token) if token else None
            if player is None or player["permission"] != "admin":
                return "forbidden", {}
            before = self.get_stage()
            forward = before not in allowed or allowed.index(stage) > allowed.index(before)
            if forward:
                missing = self.missing_for_stage(stage, allowed)
                if missing is not None:
                    print(f"[models] stage -> {stage} refused: {len(missing[1])} missing {missing[0]}")
                    return "incomplete", {"missing": missing[0], "names": missing[1]}
            self.conn.execute(
                "UPDATE settings SET value = ?, updated_at = ?, updated_by = ? WHERE key = 'stage'",
                (stage, utc_now(), player["id"]),
            )
            self.conn.commit()
            if stage == EXCHANGE_STAGE and before != EXCHANGE_STAGE:
                self._shuffle_draw_order(None, player["id"])
                self._reset_exchange()  # 重新進入交換禮物＝整局重來
        print(f"[models] stage -> {stage} by {player['en_name']}")
        return "ok", {}

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
        which gifts are claimed. Descriptions are private (only ``described``
        is shared) until DESCRIPTION_PUBLIC_STAGES, where every gift carries
        its description for the spotlight speech bubble.
        """
        stage = self.get_stage()
        reveal_labels = stage != "seating"
        public_desc = stage in DESCRIPTION_PUBLIC_STAGES
        rows = self.conn.execute(
            "SELECT id, animal, claimed_by, label, description FROM players WHERE is_deleted = 0 ORDER BY gift_order"
        ).fetchall()
        player = self.player_by_token(token) if token else None
        my_id = player["id"] if player is not None else None
        # 公布標籤階段：描述內容只回給寫的人，其他人只知道寫了沒（寫好的禮物跳得比較快）
        # 交換禮物起：描述公開，聚光燈下的禮物用講話框顯示
        gifts = []
        for r in rows:
            gift = {
                "gift_id": r["id"],
                "animal": r["animal"],
                "claimed": r["claimed_by"] is not None,
                "label": r["label"] if reveal_labels or (my_id is not None and r["claimed_by"] == my_id) else None,
                "described": bool(r["description"]),
            }
            if public_desc:
                gift["description"] = r["description"]
            gifts.append(gift)
        me: dict[str, Any] | None = None
        if player is not None:
            mine = next((r for r in rows if r["claimed_by"] == player["id"]), None)
            me = {
                "name": player["en_name"],
                "gift_id": mine["id"] if mine else None,
                "animal": mine["animal"] if mine else None,
                "label": mine["label"] if mine else None,
                "description": mine["description"] if mine else None,
                "is_admin": player["permission"] == "admin",
            }
        return {"stage": stage, "gifts": gifts, "me": me}

    def set_description(self, token: str, text: str) -> str:
        """Set the description on the caller's gift; returns ok / unknown / empty / too_long / not_claimed / locked.

        Allowed in DESCRIBE_STAGES only, and may be changed any number of
        times there. Leading and trailing spaces are trimmed.
        """
        text = text.strip()
        if not text:
            return "empty"
        if len(text) > DESCRIPTION_MAX:
            return "too_long"
        with self.lock:
            player = self.player_by_token(token)
            if player is None:
                return "unknown"
            if self.get_stage() not in DESCRIBE_STAGES:
                return "locked"
            cur = self.conn.execute(
                "UPDATE players SET description = ?, described_at = ? WHERE claimed_by = ? AND is_deleted = 0",
                (text, utc_now(), player["id"]),
            )
            self.conn.commit()
        if cur.rowcount == 0:
            return "not_claimed"
        print(f"[models] description set: {player['en_name']} ({len(text)} chars)")
        return "ok"

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

    # ---------- 交換禮物遊戲：回合、候選人、爭奪 ----------
    # 聚光燈每到一份禮物開一個回合，倒數 round_sec 秒；回合結束才決定得主（小遊戲完成前先用暫代規則）。
    # 回合推進不靠背景執行緒：每次有人讀狀態或動作時先 _tick()，過期的回合一次結算並開下一回合。

    def clock(self) -> float:
        """Return the current epoch seconds; tests replace this to fake time."""
        return time.time()

    def _reset_exchange(self) -> None:
        """Clear rounds, challengers and winners, and refill everyone's tickets; caller holds the lock."""
        now = utc_now()
        self.conn.execute("UPDATE exchange_challengers SET is_deleted = 1, deleted_at = ? WHERE is_deleted = 0", (now,))
        self.conn.execute("UPDATE exchange_rounds SET is_deleted = 1, deleted_at = ? WHERE is_deleted = 0", (now,))
        self.conn.execute("UPDATE players SET winner_id = NULL, won_at = NULL, tickets = ?", (self.start_tickets,))
        self.conn.commit()
        self.battle, self.battle_round_id = None, None
        print("[models] exchange reset")

    def _current_round(self) -> sqlite3.Row | None:
        """Return the latest round of the current exchange, open or closed."""
        return self.conn.execute(
            "SELECT * FROM exchange_rounds WHERE is_deleted = 0 ORDER BY round_no DESC LIMIT 1"
        ).fetchone()

    def _next_gift(self) -> int | None:
        """Return the next gift in draw order that has not had a round yet, or None when all are done."""
        row = self.conn.execute(
            "SELECT id FROM players WHERE is_deleted = 0 "
            "AND id NOT IN (SELECT gift_id FROM exchange_rounds WHERE is_deleted = 0) "
            "ORDER BY draw_order IS NULL, draw_order, gift_order LIMIT 1"
        ).fetchone()
        return row["id"] if row else None

    def _has_won(self, player_id: int) -> bool:
        """Return True when the player already got a gift in this exchange."""
        row = self.conn.execute(
            "SELECT 1 FROM players WHERE winner_id = ? AND is_deleted = 0 LIMIT 1", (player_id,)
        ).fetchone()
        return row is not None

    def _eligible_ids(self, gift_id: int) -> list[int]:
        """Return players who may hold this gift: active, not its owner (claimer), and without a gift yet."""
        rows = self.conn.execute(
            "SELECT p.id FROM players p WHERE p.is_deleted = 0 "
            "AND p.id IS NOT (SELECT claimed_by FROM players WHERE id = ?) "
            "AND NOT EXISTS (SELECT 1 FROM players g WHERE g.winner_id = p.id AND g.is_deleted = 0) "
            "ORDER BY p.id",
            (gift_id,),
        ).fetchall()
        return [r["id"] for r in rows]

    def _open_round(self, gift_id: int, start_epoch: float, round_no: int) -> None:
        """Open a round for ``gift_id`` and draw its candidate at random; caller holds the lock."""
        eligible = self._eligible_ids(gift_id)
        candidate = secrets.SystemRandom().choice(eligible) if eligible else None
        ends_epoch = start_epoch + self.round_sec
        self.conn.execute(
            "INSERT INTO exchange_rounds (round_no, gift_id, candidate_id, started_at, ends_at, ends_epoch, "
            "status, created_at) VALUES (?, ?, ?, ?, ?, ?, 'open', ?)",
            (round_no, gift_id, candidate, epoch_to_utc(start_epoch), epoch_to_utc(ends_epoch), ends_epoch, utc_now()),
        )
        self.conn.commit()
        print(f"[models] exchange round {round_no} opened ({len(eligible)} eligible)")

    def _active_challengers(self, round_id: int) -> list[int]:
        """Return the player ids still in the contest for a round, in join order."""
        rows = self.conn.execute(
            "SELECT player_id FROM exchange_challengers WHERE round_id = ? AND is_deleted = 0 ORDER BY id",
            (round_id,),
        ).fetchall()
        return [r["player_id"] for r in rows]

    def _pool(self, rnd: sqlite3.Row) -> list[int]:
        """Return the round's contestants: the candidate (if any) followed by the challengers in join order."""
        head = [rnd["candidate_id"]] if rnd["candidate_id"] is not None else []
        return head + self._active_challengers(rnd["id"])

    def _close_round(
        self, rnd: sqlite3.Row, winner: int | None, how: str, at_epoch: float, result: str | None = None
    ) -> None:
        """Record the round's winner on the gift and close the round; caller holds the lock."""
        if winner is not None:
            self.conn.execute(
                "UPDATE players SET winner_id = ?, won_at = ? WHERE id = ?", (winner, epoch_to_utc(at_epoch), rnd["gift_id"])
            )
        self.conn.execute(
            "UPDATE exchange_rounds SET status = 'closed', winner_id = ?, resolved_by = ?, game_result = ? WHERE id = ?",
            (winner, how, result, rnd["id"]),
        )
        self.conn.commit()
        print(f"[models] exchange round {rnd['round_no']} closed: {how}")

    def _end_contest(self, rnd: sqlite3.Row) -> float | None:
        """Handle a round whose countdown ran out; returns when the next round starts, or None while a game runs.

        兩人以上（候選人＋挑戰者）→ 進小遊戲；只有一人 → 直接給他；沒人 → 沒有得主。
        Challengers' tickets were taken when they joined and are not refunded.
        """
        pool = self._pool(rnd)
        if len(pool) >= 2:
            self.conn.execute(
                "UPDATE exchange_rounds SET status = 'game', game_epoch = ? WHERE id = ?", (rnd["ends_epoch"], rnd["id"])
            )
            self.conn.commit()
            self._start_battle(rnd["id"], pool, rnd["ends_epoch"])
            return None
        if pool:
            how = "candidate" if pool[0] == rnd["candidate_id"] else "random"
            self._close_round(rnd, pool[0], how, rnd["ends_epoch"])
        else:
            self._close_round(rnd, None, "nobody", rnd["ends_epoch"])
        return rnd["ends_epoch"]

    def _start_battle(self, round_id: int, pool: list[int], game_epoch: float) -> None:
        """Create the in-memory minigame for a round; caller holds the lock."""
        marks = ",".join("?" * len(pool))
        rows = {
            r["id"]: r for r in self.conn.execute(f"SELECT id, en_name, label FROM players WHERE id IN ({marks})", pool)
        }
        players = [{"id": pid, "name": rows[pid]["en_name"], "label": rows[pid]["label"]} for pid in pool if pid in rows]
        kind = self.game_mode if self.game_mode in cms.MINIGAMES else secrets.SystemRandom().choice(list(cms.MINIGAMES))
        prep_epoch = game_epoch + self.spin_sec  # 先轉盤，再進準備
        if kind == "count":
            self.battle = CountBattle(players, prep_epoch, self.game_prep_sec, self.count_game_sec, self.count_bots)
        else:
            self.battle = StoneBattle(players, prep_epoch, self.game_prep_sec, self.game_sec, self.game_hp)
        self.battle_kind = kind
        self.battle_spin_end = prep_epoch
        self.battle_round_id = round_id
        self.conn.execute("UPDATE exchange_rounds SET game_kind = ? WHERE id = ?", (kind, round_id))
        self.conn.commit()
        self._token_ids.clear()
        print(f"[models] minigame started: round {round_id}, {cms.MINIGAMES[kind]}, {len(players)} players")

    def _battle_for(self, rnd: sqlite3.Row) -> StoneBattle | CountBattle | None:
        """Return the in-memory minigame of a 'game' round, or None when it was lost (server restarted)."""
        return self.battle if self.battle is not None and self.battle_round_id == rnd["id"] else None

    def _settle_game(self, rnd: sqlite3.Row, now: float) -> float | None:
        """Close a 'game' round once its result has been shown; returns when the next round starts, or None.

        若伺服器在遊戲中重開（記憶體裡的對戰不見了），立刻改用隨機規則結算，流程不會卡住。
        """
        battle = self._battle_for(rnd)
        if battle is None:
            pool = self._pool(rnd)
            winner = secrets.SystemRandom().choice(pool) if pool else None
            print(f"[models] minigame of round {rnd['round_no']} lost (restart?), settled at random")
            self._close_round(rnd, winner, "random" if winner else "nobody", now)
            return now
        battle.advance(now)
        if battle.finished_at is None:
            return None
        reveal_end = battle.finished_at + self.game_reveal_sec
        if now < reveal_end:
            return None
        result = json.dumps(battle.ranking, ensure_ascii=False)
        self._close_round(rnd, battle.winner, "game", battle.finished_at, result)
        self.battle, self.battle_round_id, self.battle_kind = None, None, None
        return reveal_end

    def _tick(self) -> None:
        """Settle every expired round and open the next ones on schedule; caller holds the lock.

        The next round starts when the previous one ended (or its minigame's
        result finished showing), not when someone noticed, so a quiet server
        catches up correctly. Bounded for safety.
        """
        now = self.clock()
        for _ in range(1000):
            rnd = self._current_round()
            if rnd is None:
                return
            if rnd["status"] == "open":
                if now < rnd["ends_epoch"]:
                    return
                next_start = self._end_contest(rnd)
                if next_start is None:
                    continue  # 小遊戲剛建立，下一圈看它是否已經結束（伺服器很久沒人連線時）
            elif rnd["status"] == "game":
                next_start = self._settle_game(rnd, now)
                if next_start is None:
                    return
            else:
                return
            nxt = self._next_gift()
            if nxt is None:
                print("[models] exchange finished")
                return
            self._open_round(nxt, next_start, rnd["round_no"] + 1)

    def start_exchange(self, token: str) -> str:
        """Start the first round (admins only); returns ok / forbidden / locked / started / empty."""
        with self.lock:
            player = self.player_by_token(token) if token else None
            if player is None or player["permission"] != "admin":
                return "forbidden"
            if self.get_stage() != EXCHANGE_STAGE:
                return "locked"
            if self._current_round() is not None:
                return "started"
            gift_id = self._next_gift()
            if gift_id is None:
                return "empty"
            self._open_round(gift_id, self.clock(), 1)
        print(f"[models] exchange started by {player['en_name']}")
        return "ok"

    def _join_block(self, player: sqlite3.Row, rnd: sqlite3.Row) -> str | None:
        """Return why the player cannot join this round's contest, or None when they can."""
        owner = self.conn.execute("SELECT claimed_by FROM players WHERE id = ?", (rnd["gift_id"],)).fetchone()
        challengers = self._active_challengers(rnd["id"])
        if owner is not None and owner["claimed_by"] == player["id"]:
            return "owner"
        if rnd["candidate_id"] == player["id"]:
            return "candidate"
        if self._has_won(player["id"]):
            return "already_won"
        if player["id"] in challengers:
            return "joined"
        if player["tickets"] <= 0:
            return "no_ticket"
        if len(challengers) >= self.max_challengers:
            return "full"
        return None

    def _open_round_for(self, token: str) -> tuple[sqlite3.Row | None, sqlite3.Row | None, str | None]:
        """Common checks for contest actions: (player, open round, error); caller holds the lock."""
        player = self.player_by_token(token) if token else None
        if player is None:
            return None, None, "unknown"
        if self.get_stage() != EXCHANGE_STAGE:
            return player, None, "locked"
        self._tick()
        rnd = self._current_round()
        if rnd is None or rnd["status"] != "open":
            return player, None, "no_round"
        return player, rnd, None

    def join_contest(self, token: str) -> str:
        """Join the contest for the gift under the spotlight, spending one ticket.

        Returns ok / unknown / locked / no_round / owner / candidate / already_won / joined / no_ticket / full.
        """
        with self.lock:
            player, rnd, err = self._open_round_for(token)
            if err:
                return err
            block = self._join_block(player, rnd)
            if block:
                return block
            self.conn.execute(
                "INSERT INTO exchange_challengers (round_id, player_id, joined_at) VALUES (?, ?, ?)",
                (rnd["id"], player["id"], utc_now()),
            )
            self.conn.execute("UPDATE players SET tickets = tickets - 1 WHERE id = ?", (player["id"],))
            self.conn.commit()
        print(f"[models] contest joined: {player['en_name']} (round {rnd['round_no']})")
        return "ok"

    def withdraw_contest(self, token: str) -> str:
        """Leave the contest before the countdown ends and get the ticket back.

        Returns ok / unknown / locked / no_round / not_joined.
        """
        with self.lock:
            player, rnd, err = self._open_round_for(token)
            if err:
                return err
            cur = self.conn.execute(
                "UPDATE exchange_challengers SET is_deleted = 1, deleted_at = ? "
                "WHERE round_id = ? AND player_id = ? AND is_deleted = 0",
                (utc_now(), rnd["id"], player["id"]),
            )
            if cur.rowcount == 0:
                return "not_joined"
            self.conn.execute("UPDATE players SET tickets = tickets + 1 WHERE id = ?", (player["id"],))
            self.conn.commit()
        print(f"[models] contest withdrawn: {player['en_name']} (round {rnd['round_no']})")
        return "ok"

    def exchange_state(self, token: str | None) -> dict[str, Any]:
        """Return the exchange game for the spotlight page.

        Public: the current round (gift, countdown, candidate's name, the
        challengers in join order, and the minigame's timing once it starts)
        and every settled gift with its winner. The future draw order is not
        included. ``round.phase`` is contest / prep / play / reveal.
        """
        with self.lock:
            if self.get_stage() == EXCHANGE_STAGE:
                self._tick()
            now = self.clock()
            names = {r["id"]: r["en_name"] for r in self.conn.execute("SELECT id, en_name FROM players")}
            rnd = self._current_round()
            is_open = rnd is not None and rnd["status"] == "open"
            in_game = rnd is not None and rnd["status"] == "game"
            challengers = self._active_challengers(rnd["id"]) if is_open or in_game else []
            pool = self._pool(rnd) if in_game else []
            round_info = None
            if is_open or in_game:
                round_info = {
                    "round_no": rnd["round_no"],
                    "gift_id": rnd["gift_id"],
                    "ends_epoch": rnd["ends_epoch"],
                    "candidate": names.get(rnd["candidate_id"]),
                    "challengers": len(challengers),
                    "challenger_names": [names.get(pid) for pid in challengers],  # 依加入順序
                    "max_challengers": self.max_challengers,
                    "phase": "contest",
                }
                battle = self._battle_for(rnd) if in_game else None
                if battle is not None and now < self.battle_spin_end:
                    # 轉盤中：大家都還不知道這局玩什麼（不送遊戲種類）
                    round_info.update({
                        "phase": "spin",
                        "participants": [names.get(pid) for pid in pool],
                        "spin_end": self.battle_spin_end,
                    })
                elif battle is not None:
                    phase = battle.phase(now)
                    round_info.update({
                        "phase": "reveal" if phase == "over" else phase,
                        "participants": [names.get(pid) for pid in pool],
                        "play_start": battle.play_start,
                        "play_end": battle.play_end,
                        "finished_at": battle.finished_at,
                        "reveal_end": None if battle.finished_at is None else battle.finished_at + self.game_reveal_sec,
                        "ranking": battle.ranking,
                        "game": self.battle_kind,
                        "game_name": cms.MINIGAMES.get(self.battle_kind),
                        # 公布用：報數遊戲第一名可能是電腦，禮物給最高分的真人
                        "winner_name": next(
                            (r["name"] for r in battle.ranking or [] if r["id"] == battle.winner), None
                        ),
                    })
            results = [
                {
                    "round_no": r["round_no"],
                    "gift_id": r["gift_id"],
                    "animal": r["animal"],
                    "label": r["label"],
                    "winner": names.get(r["winner_id"]),
                    "resolved_by": r["resolved_by"],
                    "ranking": json.loads(r["game_result"]) if r["game_result"] else None,
                    "game": r["game_kind"],
                    "game_name": cms.MINIGAMES.get(r["game_kind"]) if r["game_kind"] else None,
                }
                for r in self.conn.execute(
                    "SELECT r.round_no, r.gift_id, r.winner_id, r.resolved_by, r.game_result, r.game_kind, "
                    "g.animal, g.label "
                    "FROM exchange_rounds r JOIN players g ON g.id = r.gift_id "
                    "WHERE r.is_deleted = 0 AND r.status = 'closed' ORDER BY r.round_no"
                )
            ]
            me: dict[str, Any] | None = None
            player = self.player_by_token(token) if token else None
            if player is not None:
                won = self.conn.execute(
                    "SELECT animal, label FROM players WHERE winner_id = ? AND is_deleted = 0", (player["id"],)
                ).fetchone()
                block = self._join_block(player, rnd) if is_open else "no_round"
                me = {
                    "name": player["en_name"],
                    "tickets": player["tickets"],
                    "max_tickets": self.start_tickets,
                    "joined": player["id"] in challengers,
                    "is_candidate": (is_open or in_game) and rnd["candidate_id"] == player["id"],
                    "in_game": player["id"] in pool,
                    "won": {"animal": won["animal"], "label": won["label"]} if won else None,
                    "can_join": block is None,
                    "reason": block,
                    "is_admin": player["permission"] == "admin",
                }
            return {
                "now": now,
                "round_sec": self.round_sec,
                "started": rnd is not None,
                "finished": rnd is not None and rnd["status"] == "closed",
                "round": round_info,
                "results": results,
                "me": me,
                "minigames": [{"key": k, "name": n} for k, n in cms.MINIGAMES.items()],  # 轉盤上的格子
            }

    # ---------- 小遊戲：玩家操作（即時）與觀眾直播（延遲） ----------
    # 這兩個入口每秒會被打很多次，只碰記憶體裡的對戰，不讀寫 DB（token 有快取）。

    def _player_id(self, token: str) -> int | None:
        """Return the player id for a token, cached for the minigame's frequent calls."""
        pid = self._token_ids.get(token)
        if pid is None and token:
            with self.lock:
                row = self.player_by_token(token)
            if row is not None:
                pid = self._token_ids[token] = row["id"]
        return pid

    def minigame_input(
        self, token: str, x: float, y: float, fx: int, fy: int, throw: bool,
        seq: int | None = None, power: float = 0.5,
    ) -> tuple[str, dict[str, Any] | None]:
        """Report a player's move/throw; returns (ok, live snapshot) / (unknown|no_game|not_player, None)."""
        pid = self._player_id(token)
        if pid is None:
            return "unknown", None
        battle = self.battle
        if battle is None or self.clock() < self.battle_spin_end:
            return "no_game", None
        if not isinstance(battle, StoneBattle):
            return "not_player", None
        snap = battle.report(pid, x, y, fx, fy, throw, self.clock(), seq, power)
        if snap is None:
            return "not_player", None
        snap["me"] = pid
        return "ok", snap

    def minigame_count(self, token: str, n: int | None) -> tuple[str, dict[str, Any] | None]:
        """Call a number in the counting game (or poll when ``n`` is None); returns (ok, snapshot with result).

        Errors: (unknown | no_game | not_player, None).
        """
        pid = self._player_id(token)
        if pid is None:
            return "unknown", None
        battle = self.battle
        if battle is None or self.clock() < self.battle_spin_end:
            return "no_game", None
        if not isinstance(battle, CountBattle):
            return "not_player", None
        snap = battle.call(pid, n, self.clock())
        if snap is None:
            return "not_player", None
        snap["me"] = pid
        return "ok", snap

    def minigame_watch(self, since: float) -> tuple[str, dict[str, Any] | None]:
        """Return buffered live frames newer than ``since`` for spectators; (no_game, None) when no game runs."""
        battle = self.battle
        if battle is None or self.clock() < self.battle_spin_end:
            return "no_game", None
        return "ok", battle.watch(self.clock(), since)
