"""Migration 002: add players.permission and grant the initial admins."""

import sqlite3

# 初始管理者（2026-11-06 由 Calla.Lin 指定）
INITIAL_ADMINS = ("Calla", "Eva", "Sylvia", "Sally")


def apply(conn: sqlite3.Connection) -> bool:
    """Add players.permission ('user' / 'admin') if missing; returns True when applied."""
    cols = {r[1] for r in conn.execute("PRAGMA table_info(players)")}
    if "permission" in cols:
        return False
    conn.execute("ALTER TABLE players ADD COLUMN permission TEXT NOT NULL DEFAULT 'user'")
    conn.execute(
        f"UPDATE players SET permission = 'admin' WHERE en_name IN ({','.join('?' * len(INITIAL_ADMINS))})",
        INITIAL_ADMINS,
    )
    conn.commit()
    print(f"[migration] 002 add permission: applied, admins = {', '.join(INITIAL_ADMINS)}")
    return True
