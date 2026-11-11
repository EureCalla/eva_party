"""Centralized paths and settings for the 2026_xmas_party project."""

from pathlib import Path

ROOT_DIR: Path = Path(__file__).resolve().parent
STATIC_DIR: Path = ROOT_DIR / "static"
# 資料庫放在部門共享槽，遊戲狀態與禮物標籤集中保存
DB_PATH: Path = Path(r"\\mpi-file01\VPCRD2-AI\86_LEVELOO\2026_xmas\game.db")

HOST: str = "0.0.0.0"
PORT: int = 8477
DEFAULT_PASSWORD: str = "4638"  # 一般使用者的暗號
ADMIN_PASSWORD: str = "eva"  # 管理者的暗號

# 禮物標籤：邀請函規定禮物名稱需包含的字，每份禮物選一個
GIFT_LABELS: list[str] = ["寶", "貝", "珍珠", "欣", "Eva", "Baby", "欣加Pearl", "媽媽", "男", "孩", "威"]
# 活動階段（依序），目前階段存在 DB 的 settings.stage，由管理者在管理頁切換
# 只有 seating 可以猜禮物、選標籤；seating 之後全員看得到所有標籤
STAGES: list[tuple[str, str]] = [
    ("seating", "對號入座"),
    ("reveal", "公布標籤"),
    ("exchange", "交換禮物遊戲"),
    ("feast", "共享盛宴"),
]
STAGE_KEYS: list[str] = [k for k, _ in STAGES]

# 沙盒：設計新階段畫面用，與正式 server／正式 DB 完全分開，驗收後才合併
# sandbox.db 由 tools/build_sandbox_db.py 從正式 DB 唯讀複製產生，不進版控（.gitignore 的 *.db）
SANDBOX_DIR: Path = ROOT_DIR / "sandbox"
SANDBOX_DB_PATH: Path = SANDBOX_DIR / "sandbox.db"
SANDBOX_PORT: int = 8478
SANDBOX_STAGE: str = "exchange"  # 沙盒 DB 建好後直接切到這個階段
SANDBOX_PAGE: str = "/sandbox/exchange.html"  # 沙盒畫面，放在 static/sandbox/
