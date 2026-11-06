"""像素小貓角色設定圖：手繪點陣 sprite，輸出成放大的 PNG 供確認造型。"""
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

sys.stdout.reconfigure(encoding="utf-8")

PAL = {
    "o": (107, 90, 85),     # 描邊
    "w": (248, 244, 237),   # 白毛
    "s": (218, 208, 197),   # 毛的陰影
    "p": (242, 160, 168),   # 粉耳
    "e": (111, 141, 191),   # 藍灰眼
    "k": (42, 46, 59),      # 瞳孔／深色線
    "h": (255, 255, 255),   # 高光
    "n": (233, 140, 152),   # 鼻子
    "b": (247, 184, 190),   # 腮紅
    "r": (200, 32, 42),     # 紅
    "d": (142, 24, 32),     # 深紅
    "l": (224, 65, 76),     # 亮紅
    "g": (46, 107, 59),     # 綠
    "G": (31, 77, 42),      # 深綠
    "y": (255, 211, 107),   # 金
    "c": (244, 236, 221),   # 米白（紙、信封）
    "m": (140, 110, 82),    # 信封描邊
}

# 左半邊（16 欄），鏡射成 32 欄；眼睛、尾巴另外蓋上去
HALF = [
    "................",
    "......o.........",
    "......oo........",
    ".....owpo.......",
    ".....oppwo......",
    ".....opppwoooooo",
    "....owppwwwwwwww",
    "....owwwwwwwwwww",
    "...owwwwwwwwwwww",
    "...owwwwwwwwwwww",
    "...owwwwwwwwwwww",
    "..owwwwwwwwwwwww",
    "..owwwwwwwwwwwww",
    "..owwwwwwwwwwwww",
    "..owwbbwwwwwwwwn",
    "..owwwwwwwwwwowo",
    "...owwwwwwwwwwow",
    "....oosswwwwwwww",
    ".....oswwwwwwwww",
    ".....owwwwwwwwww",
    "....oswwwwwwwwww",
    "....oswwwwwwwwww",
    "...oswwwwwwwwwww",
    "...owwwwwwwwwwww",
    "...owwwwwowwwwww",
    "..oswwwwwowwwwww",
    "..oswwwwwowwwwww",
    "..oswwwwwowwwwww",
    "..owwwwwwowwwwww",
    "..owwwwwwowwswww",
    "...owwwwwowwswww",
    "....oooooooooooo",
]

W, H = 44, 34
OX, OY = 6, 1  # 32 欄的身體放在 44 欄畫布中的位置


def base():
    grid = [["." for _ in range(W)] for _ in range(H)]
    for y, row in enumerate(HALF):
        full = row + row[::-1]
        for x, ch in enumerate(full):
            if ch != ".":
                grid[OY + y][OX + x] = ch
    return grid


def stamp(grid, x, y, rows, transparent="."):
    for j, row in enumerate(rows):
        for i, ch in enumerate(row):
            if ch != transparent and 0 <= y + j < H and 0 <= x + i < W:
                grid[y + j][x + i] = ch


EYE_OPEN = [".kk.", "khek", "keek", ".kk."]
EYE_HAPPY = ["....", ".kk.", "k..k", "...."]
EYE_HAPPY_W = ["wwww", "wkkw", "kwwk", "wwww"]


def eyes(grid, left="open", right="open"):
    for col, kind in ((OX + 8, left), (OX + 20, right)):
        if kind == "open":
            stamp(grid, col, OY + 10, EYE_OPEN)
        else:
            stamp(grid, col, OY + 10, EYE_HAPPY_W)


TAIL = [
    "....oo.",
    "...owwo",
    "...owwo",
    "..owwo.",
    "..owwo.",
    ".owwo..",
    ".owwo..",
    "owwo...",
    "owwo...",
    "owwo...",
    "owwso..",
    ".owwso.",
    "..oooo.",
]


def tail(grid):
    stamp(grid, OX + 30, OY + 18, TAIL)


GIFT = [
    "....oooooo....",
    "..oocccrcccoo.",
    ".occgccrccgcco",
    ".occccrrcccrco",
    "occrcccrccgccco",
    "orrrrrrrrrrrrro",
    "occgccrccccrco",
    "occccrccgccco.",
    ".occrcrccccco.",
    ".occcccrcgcco.",
    "..oocccrccoo..",
    "....oooooo....",
]
BOW = ["dd..dd", "drrdrrd", ".drrrd.", "..ddd.."]


def gift(grid, x, y):
    stamp(grid, x, y, GIFT)
    stamp(grid, x + 4, y - 3, BOW)


PAW = [".ooo.", "owwwo", "owwwo", "oswso", ".ooo."]


def big_belly(grid):
    """身體只略寬一點，前面鼓出一顆有描邊、高光、底部陰影的圓肚子。"""
    for y, extra in {22: 1, 23: 1, 24: 2, 25: 2, 26: 2, 27: 2, 28: 1, 29: 1}.items():
        yy = OY + y
        row = HALF[y]
        left = row.index("o") - extra
        right = 31 - left
        for x in range(left, right + 1):
            if grid[yy][OX + x] in ".o":
                grid[yy][OX + x] = "w"
        grid[yy][OX + left] = "o"
        grid[yy][OX + right] = "o"
    cx, cy, r = OX + 15.5, OY + 24.5, 7.2
    for y in range(H):
        for x in range(W):
            d = ((x - cx) ** 2 + (y - cy) ** 2) ** 0.5
            if d <= r:
                grid[y][x] = "o" if d > r - 1 else "w"
    for y in range(H):
        for x in range(W):
            d = ((x - cx) ** 2 + (y - cy) ** 2) ** 0.5
            if d <= r - 1 and y - cy > 2.5:
                grid[y][x] = "s"
    stamp(grid, OX + 11, OY + 20, [".hh", "hh.", "h.."])
    return grid


def _old_big_belly(grid):
    # 肚子往兩側與下方鼓出，加高光和底部陰影
    rows = {
        19: 1, 20: 2, 21: 3, 22: 3, 23: 4, 24: 4, 25: 4, 26: 4, 27: 3, 28: 3, 29: 2, 30: 1,
    }
    for y, extra in rows.items():
        yy = OY + y
        row = HALF[y]
        left = row.index("o") - extra
        right = 31 - left
        for x in range(left, right + 1):
            grid[yy][OX + x] = "w"
        grid[yy][OX + left] = "o"
        grid[yy][OX + right] = "o"
    # 圓肚子輪廓、陰影、高光
    for x in range(10, 22):
        grid[OY + 29][OX + x] = "s"
    for x in range(12, 20):
        grid[OY + 30][OX + x] = "s"
    for y in range(22, 29):
        grid[OY + y][OX + 8] = "s"
        grid[OY + y][OX + 23] = "s"
    stamp(grid, OX + 11, OY + 21, ["hh", "h."])
    for x in range(1, 31):
        if grid[OY + 31][OX + x] == ".":
            continue
    return grid


def dress(grid):
    # 從胸口以下改成紅洋裝，白毛滾邊、綠腰帶、金扣
    for y in range(19, 33 - OY):
        for x in range(OX - 1, OX + 33):
            ch = grid[OY + y][x]
            if ch in "ws":
                grid[OY + y][x] = "r"
            elif ch == "o":
                grid[OY + y][x] = "d"
    for x in range(OX - 1, OX + 33):
        if grid[OY + 20][x] == "r":
            grid[OY + 20][x] = "g"
        if grid[OY + 30][x] in "rd":
            grid[OY + 30][x] = "w" if x % 2 else "s"
    stamp(grid, OX + 15, OY + 20, ["yy"])
    # 洋裝下圓肚子的亮面
    stamp(grid, OX + 11, OY + 20, [".ll", "ll.", "l.."])
    # 裙襬往外撐一點
    for y in (28, 29, 30):
        row = grid[OY + y]
        xs = [x for x in range(OX - 2, OX + 34) if row[x] != "."]
        if xs:
            row[xs[0] - 1] = "d" if y < 30 else "w"
            row[xs[-1] + 1] = "d" if y < 30 else "w"


ENVELOPE = ["mmmmmmmm", "mcmccmcm", "mccmmccm", "mccnncccm", "mmmmmmmmm"]
ENVELOPE = ["mmmmmmmm", "mcmccmcm", "mccmmccm", "mccrrccm", "mmmmmmmm"]
ARM_UP = [".oo.", "owwo", "owwo", "owwo", "owwo"]
SPARKLE = ["..y..", "..y..", "yyhyy", "..y..", "..y.."]
HEART = [".r.r.", "rrrrr", ".rrr.", "..r.."]


def side(belly=True, dressed=False, eye="open"):
    """側面（朝右）站姿：用幾何形狀拼出剪影，自動描邊，再蓋上五官。"""
    fill = [[False] * W for _ in range(H)]

    def disk(cx, cy, rx, ry):
        for y in range(H):
            for x in range(W):
                if ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1:
                    fill[y][x] = True

    def poly(pts):
        (ax, ay), (bx, by), (cx, cy) = pts
        d = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax)
        for y in range(H):
            for x in range(W):
                w1 = ((bx - ax) * (y - ay) - (by - ay) * (x - ax)) / d
                w2 = ((cx - bx) * (y - by) - (cy - by) * (x - bx)) / d
                w3 = ((ax - cx) * (y - cy) - (ay - cy) * (x - cx)) / d
                if (w1 >= 0 and w2 >= 0 and w3 >= 0) or (w1 <= 0 and w2 <= 0 and w3 <= 0):
                    fill[y][x] = True

    disk(20, 10, 10, 8.4)          # 頭（圓）
    disk(28.4, 12.6, 2.6, 2.2)     # 小小的嘴部
    poly([(11.5, 7), (13.5, -0.5), (19, 3)])   # 後耳
    poly([(20, 3), (24.5, -1), (27.5, 6)])     # 前耳
    disk(19, 23, 6.2, 7.5)         # 身體
    belly_c = (24.5, 24, 8.2) if belly else (21.5, 23.5, 5)
    disk(belly_c[0], belly_c[1], belly_c[2], belly_c[2] * 0.95)
    for x in range(16, 20):        # 後腿
        for y in range(28, 32):
            fill[y][x] = True
    for x in range(22, 26):        # 前腿
        for y in range(29, 32):
            fill[y][x] = True
    disk(18.5, 31.5, 3.2, 1.3)
    disk(24.8, 31.5, 3.2, 1.3)
    # 尾巴：從屁股往左上捲
    for i in range(12):
        u = i / 11
        disk(13.5 - 8 * u, 27 - 10 * u * u, 2.3, 2.3)

    g = [["." for _ in range(W)] for _ in range(H)]
    for y in range(H):
        for x in range(W):
            if not fill[y][x]:
                continue
            edge = any(
                not (0 <= y + dy < H and 0 <= x + dx < W and fill[y + dy][x + dx])
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))
            )
            g[y][x] = "o" if edge else "w"

    # 腿與身體、肚子的分界線，讓剪影讀得出結構
    for y in range(29, 32):
        if g[y][21] != ".":
            g[y][21] = "o"
    for y in range(26, 31):
        if g[y][15] == "w":
            g[y][15] = "s"
    # 頭下緣的陰影，把頭和身體分開
    for x in range(15, 26):
        if g[16][x] == "w":
            g[16][x] = "s"
    # 肚子：底部陰影、高光
    bx, by, br = belly_c
    for y in range(H):
        for x in range(W):
            if g[y][x] == "w" and ((x - bx) ** 2 + (y - by) ** 2) ** 0.5 < br - 1 and y > by + br * 0.45:
                g[y][x] = "s"
    if belly:
        stamp(g, int(bx) + 1, int(by) - 5, [".hh", "hh.", "h.."])
    # 耳朵內側
    stamp(g, 23, 2, ["p", "pp", "pp"])
    stamp(g, 14, 2, ["p", "pp"])
    # 五官
    if eye == "open":
        stamp(g, 23, 8, ["kkh", "kek", ".kk"])
    else:
        stamp(g, 23, 9, [".k.", "k.k"])
    stamp(g, 30, 11, ["n"])
    stamp(g, 29, 13, ["o"])
    stamp(g, 24, 12, ["bb"])
    # 前手：橫放在肚子上緣，只描下緣，讀成一隻手臂
    if belly:
        stamp(g, 20, 18, ["wwwww.", "wwwwwo", "ooooo."])
    else:
        stamp(g, 20, 19, ["wwww.", "wwwwo", "oooo."])

    if dressed:
        for y in range(17, 30):
            for x in range(W):
                if g[y][x] in "wsh" and x >= 12:
                    g[y][x] = "r"
                elif g[y][x] == "o" and x >= 13:
                    g[y][x] = "d"
        # 尾巴維持白色
        for i in range(12):
            u = i / 11
            cx, cy = 15 - 8 * u, 27 - 10 * u * u
            for y in range(int(cy) - 2, int(cy) + 3):
                for x in range(int(cx) - 2, int(cx) + 3):
                    if 0 <= y < H and 0 <= x < 16 and ((x - cx) ** 2 + (y - cy) ** 2) <= 1.6 ** 2:
                        g[y][x] = "w" if g[y][x] == "r" else ("o" if g[y][x] == "d" else g[y][x])
        for x in range(W):
            if g[18][x] == "r":
                g[18][x] = "g"
        stamp(g, 22, 18, ["y"])
        # 裙襬與白毛滾邊
        for x in range(14, 33):
            if g[29][x] in "rdo":
                g[29][x] = "w" if x % 2 else "s"
        stamp(g, int(bx) + 2, int(by) - 4, [".ll", "ll.", "l.."])
        # 袖子＋白色手掌
        stamp(g, 20, 18, ["rrrrww.", "rrrrwwo", "ddddoo."])
    return g


def side_wink():
    """側面身體＋轉向鏡頭的正面頭，右眼眨眼。"""
    g = side(belly=True, dressed=True)
    for y in range(0, 17):
        for x in range(9, W):
            g[y][x] = "."
    fb = base()
    eyes(fb, "open", "happy")
    hx = 5
    for y in range(0, 18):
        for x in range(32):
            ch = fb[OY + y][OX + x]
            if ch != "." and 0 <= hx + x < W:
                g[y][hx + x] = ch
    stamp(g, 34, 2, SPARKLE)
    stamp(g, 27, 20, ENVELOPE)
    return g


def render(grid, px):
    img = Image.new("RGBA", (W * px, H * px), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    for y, row in enumerate(grid):
        for x, ch in enumerate(row):
            if ch != ".":
                d.rectangle([x * px, y * px, x * px + px - 1, y * px + px - 1], fill=PAL[ch])
    return img


def poses():
    out = []

    g = base()
    tail(g)
    eyes(g)
    out.append(("① 基本坐姿", g))

    g = base()
    tail(g)
    eyes(g)
    gift(g, OX + 9, OY + 20)
    stamp(g, OX + 8, OY + 20, PAW)
    stamp(g, OX + 19, OY + 21, PAW)
    out.append(("② 包禮物", g))

    out.append(("③ 側面（塞禮物前）", side(belly=False)))

    g = side(belly=True, eye="happy")
    stamp(g, 31, 3, HEART)
    out.append(("④ 側面圓肚子", g))

    g = side(belly=True, dressed=True)
    stamp(g, 26, 15, ENVELOPE)
    out.append(("⑤ 側面洋裝＋邀請函", g))

    out.append(("⑥ 側面回頭眨眼", side_wink()))
    return out


def main():
    px = 12
    items = poses()
    pad = 40
    cell_w = W * px
    cell_h = H * px + 70
    sheet = Image.new("RGB", (pad + len(items) * (cell_w + pad), cell_h + pad * 2), (91, 58, 42))
    try:
        font = ImageFont.truetype("msjhbd.ttc", 30)
    except OSError:
        font = ImageFont.load_default()
    d = ImageDraw.Draw(sheet)
    for i, (name, grid) in enumerate(items):
        x = pad + i * (cell_w + pad)
        sheet.paste(render(grid, px), (x, pad), render(grid, px))
        tw = d.textlength(name, font=font)
        d.text((x + (cell_w - tw) / 2, pad + H * px + 20), name, fill=(255, 244, 214), font=font)
    out = Path(__file__).with_name("character_sheet_v7.png")
    sheet.save(out)
    print(out, sheet.size)


if __name__ == "__main__":
    main()
