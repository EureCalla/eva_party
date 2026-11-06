"""Centralized paths and settings for the 2026_xmas_party project."""

from pathlib import Path

ROOT_DIR: Path = Path(__file__).resolve().parent
STATIC_DIR: Path = ROOT_DIR / "static"
# 資料庫放在部門共享槽，遊戲狀態與禮物標籤集中保存
DB_PATH: Path = Path(r"\\mpi-file01\VPCRD2-AI\86_LEVELOO\2026_xmas\game.db")

HOST: str = "0.0.0.0"
PORT: int = 8477
DEFAULT_PASSWORD: str = "eva"

# 禮物標籤：邀請函規定禮物名稱需包含的字，每份禮物選一個
GIFT_LABELS: list[str] = ["寶", "貝", "珍珠", "欣", "Eva", "Baby", "欣加Pearl", "媽媽", "男", "孩", "威"]
# False：每個人只看得到自己禮物的標籤與顏色；改 True 並重啟 server 即公開全部標籤
REVEAL_LABELS: bool = False
