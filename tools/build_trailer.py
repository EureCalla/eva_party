"""Build the trailer episodes (static/trailer.js, ...) from the video's HyperFrames compositions.

The trailer is the same pixel animation as the invitation video, played live in
the browser instead of as an mp4 (the exported mp4 is mp4v, which browsers
cannot decode). Each composition becomes one episode; re-run this whenever a
composition changes:

    python tools/build_trailer.py
"""

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
COMPOSITIONS = ROOT / "video" / "compositions"
STATIC = ROOT / "static"

# 集數清單：(集數, 標題, composition 檔名, 輸出 js 檔名)；新的一集加在這裡，並在 index.html 掛上輸出的 js
EPISODES = [
    (1, "第一集", "story.html", "trailer.js"),
]


def build(no: int, title: str, src: Path, dst: Path) -> None:
    """Extract the composition script, rewire its canvas and timeline, and register it as an episode."""
    html = src.read_text(encoding="utf-8")
    body = html[html.index("<script>") + len("<script>") : html.rindex("</script>")]

    # 零件資料改用 sprites.js 的全域 SPRITES / PAL
    a = body.index("/*SPRITES*/")
    b = body.index("/*END SPRITES*/") + len("/*END SPRITES*/")
    body = body[:a] + body[b:]

    old_canvas = 'document.getElementById("story-canvas")'
    if old_canvas not in body:
        raise SystemExit(f"{src.name} 找不到 story-canvas，格式可能變了")
    body = body.replace(old_canvas, 'document.getElementById("trailer-canvas")')

    # GSAP 時間軸換成直接登記到 window.EPISODES
    cut = body.index("const state = { t: 0 };")
    body = body[:cut] + (
        f"(window.EPISODES = window.EPISODES || []).push({{ no: {no}, title: {title!r}, render, duration: DUR }});\n"
        "    })();\n"
    )

    header = (
        f"// 預告片{title}：由 tools/build_trailer.py 從 video/compositions/{src.name} 產生，請勿手改\n"
        "// 角色零件沿用 sprites.js 的 SPRITES / PAL；登記到 window.EPISODES = [{ no, title, render(t), duration }]\n"
    )
    dst.write_text(header + body.strip() + "\n", encoding="utf-8", newline="\n")
    print(f"[build_trailer] {src} -> {dst} ({dst.stat().st_size} bytes)")


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    for no, title, src, dst in EPISODES:
        build(no, title, COMPOSITIONS / src, STATIC / dst)
