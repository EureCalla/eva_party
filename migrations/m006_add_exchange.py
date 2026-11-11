"""Migration 006: tickets, gift winners, exchange rounds and challengers."""

import sqlite3


def apply(conn: sqlite3.Connection) -> bool:
    """Add the gift-exchange game columns and tables if missing; returns True when applied.

    - players.tickets: 搶奪券（每人初始 5 張）
    - players.winner_id / won_at: 記在禮物那一列，這份禮物最後由誰獲得
    - exchange_rounds: 聚光燈每一份禮物的回合（候選人、倒數截止、結算結果）
    - exchange_challengers: 加入爭奪的人（退出＝軟刪除）
    """
    cols = {r[1] for r in conn.execute("PRAGMA table_info(players)")}
    if "tickets" in cols:
        return False
    conn.execute("ALTER TABLE players ADD COLUMN tickets INTEGER NOT NULL DEFAULT 5")
    conn.execute("ALTER TABLE players ADD COLUMN winner_id INTEGER REFERENCES players(id)")
    conn.execute("ALTER TABLE players ADD COLUMN won_at DATETIME")
    conn.executescript(
        """
        CREATE INDEX IF NOT EXISTS idx_players_winner_id ON players(winner_id);

        CREATE TABLE IF NOT EXISTS exchange_rounds (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            round_no      INTEGER NOT NULL,
            gift_id       INTEGER NOT NULL REFERENCES players(id),
            candidate_id  INTEGER REFERENCES players(id),
            started_at    DATETIME NOT NULL,
            ends_at       DATETIME NOT NULL,
            ends_epoch    REAL NOT NULL,
            status        TEXT NOT NULL DEFAULT 'open',
            winner_id     INTEGER REFERENCES players(id),
            resolved_by   TEXT,
            created_at    DATETIME NOT NULL,
            is_deleted    INTEGER DEFAULT 0,
            deleted_at    DATETIME
        );
        CREATE INDEX IF NOT EXISTS idx_exchange_rounds_gift_id ON exchange_rounds(gift_id);
        CREATE INDEX IF NOT EXISTS idx_exchange_rounds_candidate_id ON exchange_rounds(candidate_id);
        CREATE INDEX IF NOT EXISTS idx_exchange_rounds_winner_id ON exchange_rounds(winner_id);
        CREATE INDEX IF NOT EXISTS idx_exchange_rounds_status ON exchange_rounds(status);

        CREATE TABLE IF NOT EXISTS exchange_challengers (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            round_id    INTEGER NOT NULL REFERENCES exchange_rounds(id),
            player_id   INTEGER NOT NULL REFERENCES players(id),
            joined_at   DATETIME NOT NULL,
            is_deleted  INTEGER DEFAULT 0,
            deleted_at  DATETIME
        );
        CREATE INDEX IF NOT EXISTS idx_exchange_challengers_round_id ON exchange_challengers(round_id);
        CREATE INDEX IF NOT EXISTS idx_exchange_challengers_player_id ON exchange_challengers(player_id);
        """
    )
    conn.commit()
    print("[migration] 006 add exchange: applied")
    return True
