"""Program metadata for the 2026_xmas_party project."""


class Introduce:
    """Expose program identity and version information."""

    def __init__(self) -> None:
        self.program = "2026_xmas_party"
        self.version = "v3.3"
        self.developer = "Calla.Lin #6381"
        self.program_intro = "好孕敲門・交換禮物 Party 猜禮物遊戲：邀請函、登入、猜自己的動物禮物。"
        self.program_notice = "執行 python app.py 後開 http://localhost:8477；刪除 game.db 會重置整場遊戲。"
