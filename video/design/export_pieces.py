"""把像素小貓（與第二集的動物）拆成紙娃娃零件，輸出 JSON 並注入各集 composition 的 SPRITES 區塊，
同時寫出遊戲頁面用的 static/sprites.js。

座標系：所有零件都放在 44x34 的「角色框」裡；x0/y0 是零件左上角在角色框中的位置，
pivot 是關節點（同一個座標系）。影片程式依 pivot 旋轉、平移各零件。
"""
import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, str(Path(__file__).parent))
import animals  # noqa: E402
import animals_ep3  # noqa: E402
import cat_sprites as cs  # noqa: E402

sys.stdout.reconfigure(encoding="utf-8")

W, H = cs.W, cs.H
PAL = dict(cs.PAL)
PAL.update({
    "A": (217, 168, 106),   # 招牌淺木
    "B": (200, 149, 90),    # 招牌木紋
    "C": (107, 68, 35),     # 招牌框
    "K": (74, 44, 23),      # 招牌正面字
    "f": (220, 227, 234),   # 保麗龍球
    "x": (122, 106, 94),    # 衣架
    "P": (246, 183, 200),   # 孕婦洋裝粉
    "R": (239, 160, 182),   # 洋裝陰影粉
    "Q": (217, 138, 160),   # 洋裝描邊深粉
    "L": (252, 217, 227),   # 亮粉
    "T": (222, 106, 147),   # 招牌粉紅字／粉嫩強調
    "U": (91, 152, 214),    # 招牌粉藍字
    "X": (255, 246, 234),   # 招牌背面奶油白
    "Y": (245, 228, 214),   # 招牌背面紋路
    "V": (191, 221, 245),   # 寶寶藍
})
PAL.update(animals.PAL)
PAL.update(animals_ep3.PAL)

# 零件注入的 composition（每一集一個檔），以及遊戲頁面共用的零件檔
COMPOSITIONS = ["story.html", "ep2.html", "ep3.html"]
SPRITES_JS = Path(__file__).resolve().parent.parent.parent / "static" / "sprites.js"
# 第二、三集公布名字的字卡：(零件名, 動物, 英文名)
NAME_CARDS = [("cap_ethan", "狐獴", "Ethan"), ("cap_ann", "水獺", "Ann"),
              ("cap_charlotte", "長頸鹿", "Charlotte"), ("cap_allen", "大象", "Allen"),
              ("cap_joy", "松鼠", "Joy"), ("cap_mia", "天竺鼠", "Mia"), ("cap_leo", "倉鼠", "Leo"),
              ("cap_amber", "矮袋鼠", "Amber"), ("cap_emily", "蛇", "Emily")]

BOW = ["dd...dd", "drd.drd", "drrdrrd", "drd.drd", "dd...dd"]
ENVELOPE = ["mmmmmmmm", "mcmccmcm", "mccmmccm", "mccTTccm", "mmmmmmmm"]
HEART = [".T.T.", "TTTTT", ".TTT.", "..T.."]


# ---------- 形狀工具 ----------
def blank():
    return [[False] * W for _ in range(H)]


def disk(m, cx, cy, rx, ry=None):
    ry = rx if ry is None else ry
    for y in range(H):
        for x in range(W):
            if ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1:
                m[y][x] = True


def box(m, x0, y0, x1, y1):
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            m[y][x] = True


def tri(m, pts):
    (ax, ay), (bx, by), (cx, cy) = pts
    d = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax)
    for y in range(H):
        for x in range(W):
            w1 = ((bx - ax) * (y - ay) - (by - ay) * (x - ax)) / d
            w2 = ((cx - bx) * (y - by) - (cy - by) * (x - bx)) / d
            w3 = ((ax - cx) * (y - cy) - (ay - cy) * (x - cx)) / d
            if (w1 >= 0 and w2 >= 0 and w3 >= 0) or (w1 <= 0 and w2 <= 0 and w3 <= 0):
                m[y][x] = True


def outlined(m, fill="w"):
    g = [["." for _ in range(W)] for _ in range(H)]
    for y in range(H):
        for x in range(W):
            if not m[y][x]:
                continue
            edge = any(
                not (0 <= y + dy < H and 0 <= x + dx < W and m[y + dy][x + dx])
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))
            )
            g[y][x] = "o" if edge else fill
    return g


def crop(g, pivot):
    ys = [y for y in range(len(g)) if any(c != "." for c in g[y])]
    xs = [x for x in range(len(g[0])) if any(g[y][x] != "." for y in range(len(g)))]
    x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
    rows = ["".join(g[y][x0:x1 + 1]) for y in range(y0, y1 + 1)]
    return {"x0": x0, "y0": y0, "rows": rows, "pivot": list(pivot)}


def grid_piece(rows, x0, y0, pivot):
    return {"x0": x0, "y0": y0, "rows": rows, "pivot": list(pivot)}


# ---------- 正面零件 ----------
def front_parts():
    out = {}
    for name, (l, r) in {
        "f_head_open": ("open", "open"),
        "f_head_happy": ("happy", "happy"),
        "f_head_wink": ("open", "happy"),
    }.items():
        for bow in (False, True):
            g = cs.base()
            cs.eyes(g, l, r)
            if bow:
                cs.stamp(g, cs.OX + 20, cs.OY + 2, BOW)
            rows = ["".join(g[cs.OY + y][cs.OX:cs.OX + 32]) for y in range(0, 18)]
            out[name + ("_bow" if bow else "")] = grid_piece(rows, cs.OX, cs.OY, (cs.OX + 16, cs.OY + 17))
    g = cs.base()
    rows = ["".join(g[cs.OY + y][cs.OX:cs.OX + 32]) for y in range(17, 32)]
    out["f_body"] = grid_piece(rows, cs.OX, cs.OY + 17, (cs.OX + 16, cs.OY + 32))
    out["f_tail"] = grid_piece(cs.TAIL, cs.OX + 30, cs.OY + 18, (cs.OX + 31, cs.OY + 30))
    out["paw"] = grid_piece(cs.PAW, 0, 0, (2, 2))
    return out


# ---------- 側面零件 ----------
BELLY = (24.5, 24, 8.2)
FLAT = (21.5, 23.5, 5)


def side_head(eye, bow=False):
    m = blank()
    disk(m, 20, 10, 10, 8.4)
    disk(m, 28.4, 12.6, 2.6, 2.2)
    tri(m, [(11.5, 7), (13.5, -0.5), (19, 3)])
    tri(m, [(20, 3), (24.5, -1), (27.5, 6)])
    for y in range(17, H):
        m[y] = [False] * W
    g = outlined(m)
    cs.stamp(g, 23, 2, ["p", "pp", "pp"])
    cs.stamp(g, 14, 2, ["p", "pp"])
    if eye == "open":
        cs.stamp(g, 23, 8, ["kkh", "kek", ".kk"])
    else:
        cs.stamp(g, 23, 9, [".k.", "k.k"])
    cs.stamp(g, 30, 11, ["n"])
    cs.stamp(g, 29, 13, ["o"])
    cs.stamp(g, 24, 12, ["bb"])
    for x in range(14, 27):
        if g[16][x] == "w":
            g[16][x] = "s"
    if bow:
        cs.stamp(g, 16, 0, BOW)
    return crop(g, (20, 16))


def side_torso(belly, dressed):
    bx, by, br = BELLY if belly else FLAT
    m = blank()
    disk(m, 19, 23, 6.2, 7.5)
    disk(m, bx, by, br, br * 0.95)
    for y in range(0, 15):
        m[y] = [False] * W
    for y in range(31, H):
        m[y] = [False] * W
    g = outlined(m)
    for y in range(H):
        for x in range(W):
            if g[y][x] == "w" and ((x - bx) ** 2 + (y - by) ** 2) ** 0.5 < br - 1 and y > by + br * 0.45:
                g[y][x] = "s"
    if belly:
        cs.stamp(g, int(bx) + 1, int(by) - 5, [".hh", "hh.", "h.."])
    if dressed:
        # 粉紅孕婦洋裝：高腰（胸下）粉藍緞帶、白色蕾絲下襬
        for y in range(17, H):
            for x in range(W):
                if g[y][x] in "wh":
                    g[y][x] = "P"
                elif g[y][x] == "s":
                    g[y][x] = "R"
                elif g[y][x] == "o":
                    g[y][x] = "Q"
        for x in range(W):
            if g[18][x] == "P":
                g[18][x] = "V"
        cs.stamp(g, 21, 17, ["U.U", ".U."])
        bottom = max(y for y in range(H) if any(c != "." for c in g[y]))
        for x in range(W):
            if g[bottom][x] != ".":
                g[bottom][x] = "h" if x % 2 else "L"
        if belly:
            cs.stamp(g, int(bx) + 2, int(by) - 4, [".LL", "LL.", "L.."])
    return crop(g, (19, 28))


def side_leg(front):
    m = blank()
    if front:
        box(m, 22, 27, 25, 31)
        disk(m, 24.8, 31.5, 3.0, 1.3)
    else:
        box(m, 16, 26, 19, 31)
        disk(m, 18.5, 31.5, 3.0, 1.3)
    g = outlined(m, "w" if front else "s")
    return crop(g, (23.5, 27.5) if front else (17.5, 26.5))


def side_arm(dressed):
    m = blank()
    box(m, 20, 17, 25, 21)
    disk(m, 26, 19, 2.3, 2.3)
    disk(m, 20, 19, 2.2, 2.2)
    g = outlined(m)
    if dressed:
        for y in range(H):
            for x in range(W):
                if x <= 23 and g[y][x] == "w":
                    g[y][x] = "P"
                elif x <= 23 and g[y][x] == "o":
                    g[y][x] = "Q"
    return crop(g, (20, 19))


def side_tail():
    m = blank()
    for i in range(14):
        u = i / 13
        disk(m, 13.5 - 8 * u, 27 - 10 * u * u, 2.3, 2.3)
    return crop(outlined(m), (14, 27))


# ---------- 道具 ----------
def gift_stage(stage):
    """stage 0 保麗龍球；1-4 包裝紙由左往右；5 加緞帶；6 加蝴蝶結。"""
    gw, gh = 15, 19
    cx, cy, r = 7, 11.5, 6.6
    g = [["." for _ in range(gw)] for _ in range(gh)]
    cover = [0, 3, 7, 11, 15, 15, 15][stage]
    for y in range(gh):
        for x in range(gw):
            d = ((x - cx) ** 2 + (y - cy) ** 2) ** 0.5
            if d <= r:
                if d > r - 1:
                    g[y][x] = "o"
                elif x < cover:
                    g[y][x] = "c"
                else:
                    g[y][x] = "f"
    pattern = {(4, 8): "U", (9, 9): "T", (3, 12): "T", (10, 13): "U", (6, 15): "U", (8, 6): "U", (5, 10): "T",
               (11, 10): "T", (8, 14): "T"}
    for (x, y), c in pattern.items():
        if g[y][x] == "c":
            g[y][x] = c
    for y in range(gh):
        for x in range(gw):
            if g[y][x] in "cfTU" and ((x - cx - 2.5) ** 2 + (y - cy - 2.5) ** 2) ** 0.5 < 3.2 and \
                    ((x - cx) ** 2 + (y - cy) ** 2) ** 0.5 > r - 2.5:
                g[y][x] = "s" if g[y][x] in "cf" else g[y][x]
    if stage >= 5:
        for y in range(gh):
            if g[y][7] not in ".o":
                g[y][7] = "T"
        for x in range(gw):
            if g[11][x] not in ".o":
                g[11][x] = "T"
    if stage >= 6:
        cs.stamp(g, 3, 2, ["QQ...QQ", "QTQ.QTQ", "QTTQTTQ", ".QTQTQ.", "..QQQ.."])
    return grid_piece(["".join(r) for r in g], 0, 0, (7, 11))


HANGER_DRESS = [
    "......x......",
    ".....x.x.....",
    "....x...x....",
    "xxxxxxxxxxxxx",
    "...QPPPPPQ...",
    "...QVVUVVQ...",
    "..QPPPPPPPQ..",
    "..QPLPPPPPQ..",
    ".QPLPPPPPPPQ.",
    ".QPPPPPPPPPQ.",
    "QPPPPPPPPPPPQ",
    "QPPPPPPPPPPPQ",
    "hLhLhLhLhLhLh",
]


def sign_board(lines, base="A", grain="B", frame="C"):
    """招牌在 2 倍細格上畫：50x22 格的木板 → 100x44 細格，字用系統字二值化（太寬會自動縮字）。"""
    bw, bh = 100, 44
    g = [[base] * bw for _ in range(bh)]
    for y in range(bh):
        for x in range(bw):
            if x < 2 or y < 2 or x >= bw - 2 or y >= bh - 2:
                g[y][x] = frame
            elif y % 10 == 0:
                g[y][x] = grain
    for x, y in ((4, 4), (bw - 6, 4), (4, bh - 6), (bw - 6, bh - 6)):
        for dy in range(2):
            for dx in range(2):
                g[y + dy][x + dx] = frame
    img = Image.new("L", (bw, bh), 0)
    d = ImageDraw.Draw(img)
    for text, size, cy, color in lines:
        font = ImageFont.truetype("msjhbd.ttc", size)
        while d.textlength(text, font=font) > bw - 10 and size > 10:
            size -= 1
            font = ImageFont.truetype("msjhbd.ttc", size)
        tw = d.textlength(text, font=font)
        bbox = d.textbbox((0, 0), text, font=font)
        th = bbox[3] - bbox[1]
        layer = Image.new("L", (bw, bh), 0)
        ImageDraw.Draw(layer).text(((bw - tw) / 2, cy - th / 2 - bbox[1]), text, font=font, fill=255)
        for y in range(bh):
            for x in range(bw):
                if layer.getpixel((x, y)) > 110:
                    g[y][x] = color
    return grid_piece(["".join(r) for r in g], 0, 0, (bw // 2, bh // 2))


def letter_card():
    """邀請函信紙：3 倍細格（一格 = 5 px），關鍵字上色，自動縮字讓每行都放得下。"""
    lw, lh = 300, 198
    g = [["c"] * lw for _ in range(lh)]
    for y in range(lh):
        for x in range(lw):
            if x < 3 or y < 3 or x >= lw - 3 or y >= lh - 3:
                g[y][x] = "Q"
            elif (x in (8, lw - 9) or y in (8, lh - 9)) and (x + y) % 6 < 3 and 8 <= x <= lw - 9 and 8 <= y <= lh - 9:
                g[y][x] = "P"
    for cx, cy in ((18, 18), (lw - 19, 18), (18, lh - 19), (lw - 19, lh - 19)):
        for j, row in enumerate(HEART):
            for i, ch in enumerate(row):
                if ch != ".":
                    for dy in range(2):
                        for dx in range(2):
                            g[cy - 4 + j * 2 + dy][cx - 5 + i * 2 + dx] = "T"
    K = "K"
    title = [[("邀請函", "T")]]
    body = [
        [("邀請朋友們來交換禮物，", K)],
        [("禮物名稱中需包含", K)],
        [("寶", "T"), ("、", K), ("貝", "T"), ("、", K), ("珍珠", "T"), ("、", K), ("欣", "T"), ("、", K),
         ("Eva", "U"), ("、", K), ("Baby", "U"), ("、", K)],
        [("欣加Pearl", "T"), ("(新加坡？)", K), ("、", K), ("媽媽", "T"), ("、", K)],
        [("男", "T"), ("、", K), ("孩", "T"), ("、", K), ("威", "T"), ("等字，", K)],
        [("若準備到重覆現場會有處罰", K)],
    ]

    def width(line, font, d):
        return sum(d.textlength(t, font=font) for t, _ in line)

    probe = ImageDraw.Draw(Image.new("L", (1, 1)))
    size = 19
    while size > 10:
        font = ImageFont.truetype("msjhbd.ttc", size)
        if max(width(l, font, probe) for l in body) <= lw - 44:
            break
        size -= 1

    def draw_line(line, font, cy):
        total = width(line, font, probe)
        x = (lw - total) / 2
        for text, color in line:
            layer = Image.new("L", (lw, lh), 0)
            dl = ImageDraw.Draw(layer)
            bb = dl.textbbox((0, 0), "國", font=font)
            dl.text((x, cy - (bb[3] - bb[1]) / 2 - bb[1]), text, font=font, fill=255)
            px = layer.load()
            for yy in range(lh):
                for xx in range(lw):
                    if px[xx, yy] > 110:
                        g[yy][xx] = color
            x += probe.textlength(text, font=font)

    draw_line(title[0], ImageFont.truetype("msjhbd.ttc", 28), 28)
    for x in range(110, lw - 110):
        g[45][x] = "P"
    font = ImageFont.truetype("msjhbd.ttc", size)
    for i, line in enumerate(body):
        draw_line(line, font, 64 + i * 22)
    piece = grid_piece(["".join(r) for r in g], 0, 0, (lw // 2, lh // 2))
    piece["unit"] = 1 / 3
    return piece


def main():
    pieces = {}
    pieces.update(front_parts())
    for eye in ("open", "happy"):
        pieces["s_head_" + eye] = side_head(eye)
        pieces["s_head_" + eye + "_bow"] = side_head(eye, bow=True)
    for belly in (False, True):
        for dressed in (False, True):
            if dressed and not belly:
                continue
            key = "s_torso_" + ("belly" if belly else "flat") + ("_dress" if dressed else "")
            pieces[key] = side_torso(belly, dressed)
    pieces["s_leg_back"] = side_leg(False)
    pieces["s_leg_front"] = side_leg(True)
    pieces["s_arm"] = side_arm(False)
    pieces["s_arm_dress"] = side_arm(True)
    pieces["s_tail"] = side_tail()
    for i in range(7):
        pieces[f"gift{i}"] = gift_stage(i)
    pieces["envelope"] = grid_piece(ENVELOPE, 0, 0, (4, 2))
    pieces["heart"] = grid_piece(HEART, 0, 0, (2, 2))
    pieces["sparkle"] = grid_piece(cs.SPARKLE, 0, 0, (2, 2))
    pieces["hanger_dress"] = grid_piece(HANGER_DRESS, 0, 0, (6, 0))
    pieces["sign_front"] = sign_board([("準備中", 26, 22, "K")])
    pieces["sign_front"]["unit"] = 0.5
    pieces["sign_back"] = sign_board([("好孕敲門", 19, 13, "T"), ("交換禮物 Party", 17, 31, "U")],
                                     base="X", grain="Y", frame="Q")
    pieces["sign_back"]["unit"] = 0.5
    pieces["letter"] = letter_card()
    pieces.update(animals.pieces())
    pieces.update(animals_ep3.pieces())
    for key, animal, name in NAME_CARDS:
        pieces[key] = sign_board([(animal, 15, 12, "T"), (name, 22, 30, "U")], base="X", grain="Y", frame="Q")
        pieces[key]["unit"] = 0.5

    pal = {k: "#%02X%02X%02X" % v for k, v in PAL.items()}
    sprites = json.dumps(pieces, ensure_ascii=False)
    payload = "const SPRITES = " + sprites + ";\n      const PAL = " + json.dumps(pal) + ";"
    for name in COMPOSITIONS:
        comp = Path(__file__).parent.parent / "compositions" / name
        s = comp.read_text(encoding="utf-8")
        a = s.index("/*SPRITES*/")
        b = s.index("/*END SPRITES*/")
        s = s[:a] + "/*SPRITES*/\n      " + payload + "\n      " + s[b:]
        comp.write_text(s, encoding="utf-8", newline="\n")
    SPRITES_JS.write_text(
        "// 角色零件資料：由 video/design/export_pieces.py 產生，請勿手改\n"
        "const SPRITES = " + sprites + ";\nconst PAL = " + json.dumps(pal) + ";\n",
        encoding="utf-8", newline="\n")

    # 預覽：所有零件排成一張圖
    px = 8
    names = list(pieces)
    cols = 8
    cell = 62 * px
    sheet = Image.new("RGB", (cols * cell, ((len(names) + cols - 1) // cols) * cell), (91, 58, 42))
    for i, n in enumerate(names):
        p = pieces[n]
        ox, oy = (i % cols) * cell + 10, (i // cols) * cell + 10
        scale = max(1, round(px * p.get("unit", 1)))
        d = ImageDraw.Draw(sheet)
        for y, row in enumerate(p["rows"]):
            for x, ch in enumerate(row):
                if ch != ".":
                    d.rectangle([ox + x * scale, oy + y * scale, ox + x * scale + scale - 1, oy + y * scale + scale - 1],
                                fill=PAL[ch])
        d.text((ox, oy + cell - 40), n, fill=(255, 244, 214))
    sheet.save(Path(__file__).with_name("pieces_preview.png"))
    print("pieces:", len(pieces), "->", ", ".join(COMPOSITIONS), "+", SPRITES_JS.name)


if __name__ == "__main__":
    main()
