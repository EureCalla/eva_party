"""Migration 009: who held each gift, in order (gift hand-over log)."""

import sqlite3


def apply(conn: sqlite3.Connection) -> bool:
    """Create exchange_transfers if missing; returns True when applied.

    - exchange_transfers: 禮物每一次換人的紀錄（回合得主拿到、或得主換禮物後順移給下一名）
      how：candidate／random／game＝回合得主；pass＝依排名順移；pass_random＝排名找不到人時隨機保底
    """
    row = conn.execute(
        "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'exchange_transfers'"
    ).fetchone()
    if row is not None:
        return False
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS exchange_transfers (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            round_id    INTEGER NOT NULL REFERENCES exchange_rounds(id),
            gift_id     INTEGER NOT NULL REFERENCES players(id),
            from_id     INTEGER REFERENCES players(id),
            to_id       INTEGER REFERENCES players(id),
            how         TEXT NOT NULL,
            rank        INTEGER,
            created_at  DATETIME NOT NULL,
            is_deleted  INTEGER DEFAULT 0,
            deleted_at  DATETIME
        );
        CREATE INDEX IF NOT EXISTS idx_exchange_transfers_round_id ON exchange_transfers(round_id);
        CREATE INDEX IF NOT EXISTS idx_exchange_transfers_gift_id ON exchange_transfers(gift_id);
        CREATE INDEX IF NOT EXISTS idx_exchange_transfers_from_id ON exchange_transfers(from_id);
        CREATE INDEX IF NOT EXISTS idx_exchange_transfers_to_id ON exchange_transfers(to_id);
        """
    )
    conn.commit()
    print("[migration] 009 add exchange transfers: applied")
    return True
