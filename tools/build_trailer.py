"""Build static/trailer.js from the invitation video's HyperFrames composition.

The trailer is the same pixel animation as the invitation video, played live in
the browser instead of as an mp4 (the exported mp4 is mp4v, which browsers
cannot decode). Re-run this whenever the video's story.html changes:

    python tools/build_trailer.py
"""

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
STORY_HTML = ROOT / "video" / "compositions" / "story.html"
OUT_JS = ROOT / "static" / "trailer.js"

HEADER = (
    "// 預告片：由 tools/build_trailer.py 從 video/compositions/story.html 產生，請勿手改\n"
    "// 角色零件沿用 sprites.js 的 SPRITES / PAL；對外提供 window.TRAILER = { render(t), duration }\n"
)


def build(src: Path, dst: Path) -> None:
    """Extract the composition script, rewire its canvas and timeline, and write it out."""
    html = src.read_text(encoding="utf-8")
    body = html[html.index("<script>") + len("<script>") : html.rindex("</script>")]

    # 零件資料改用 sprites.js 的全域 SPRITES / PAL
    a = body.index("/*SPRITES*/")
    b = body.index("/*END SPRITES*/") + len("/*END SPRITES*/")
    body = body[:a] + body[b:]

    old_canvas = 'document.getElementById("story-canvas")'
    if old_canvas not in body:
        raise SystemExit("story.html 找不到 story-canvas，格式可能變了")
    body = body.replace(old_canvas, 'document.getElementById("trailer-canvas")')

    # GSAP 時間軸換成直接對外提供 render
    cut = body.index("const state = { t: 0 };")
    body = body[:cut] + "render(0);\n      window.TRAILER = { render, duration: DUR };\n    })();\n"

    dst.write_text(HEADER + body.strip() + "\n", encoding="utf-8", newline="\n")
    print(f"[build_trailer] {src} -> {dst} ({dst.stat().st_size} bytes)")


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    build(STORY_HTML, OUT_JS)
