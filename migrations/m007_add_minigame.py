"""Migration 007: minigame timing and final ranking on exchange rounds."""

import sqlite3


def apply(conn: sqlite3.Connection) -> bool:
    """Add the minigame columns to exchange_rounds if missing; returns True when applied.

    - exchange_rounds.game_epoch: 小遊戲進場準備開始的時間（epoch 秒）
    - exchange_rounds.game_result: 小遊戲最終排名 JSON（名字、禮物數、血量、是否存活）
    - status 多一個 'game'（小遊戲進行中）；resolved_by 多一個 'game'
    """
    cols = {r[1] for r in conn.execute("PRAGMA table_info(exchange_rounds)")}
    if "game_epoch" in cols:
        return False
    conn.execute("ALTER TABLE exchange_rounds ADD COLUMN game_epoch REAL")
    conn.execute("ALTER TABLE exchange_rounds ADD COLUMN game_result TEXT")
    conn.commit()
    print("[migration] 007 add minigame: applied")
    return True
