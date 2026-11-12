"""第五集的動物與道具零件：狐狸（站直、拿夾子）、西施犬、芝麻狗、魷魚，以及烤魷魚攤。

形狀工具與角色框的用法同 animals.py：每隻動物有自己的角色框（寬 x 高，腳底踩在最下面一列），
零件的 x0/y0 與 pivot 都在框的座標系裡。都畫成面向右，面向左的由影片程式水平翻面。

芝麻狗（Sylvia）的毛色照參考照片：白底短毛撒上一顆顆芝麻大小的灰黑點，背部、身側較密，
胸口、前腿以白為主只有零星小點；黑色垂耳、眼睛周圍一圈黑；口鼻白色帶幾顆小灰點；尾巴近尾端有一圈黑。
芝麻點要比一格還小，所以狗用兩倍細格畫（unit 0.5、fine），描邊加粗成兩細格，跟其他角色的一格描邊一樣粗。
"""
from animals import Mask, crop, eye, paint, stamp

PAL = {
    "q": (66, 66, 74),      # 芝麻點（深）
    "v": (138, 138, 148),   # 芝麻點（淺）
    "0": (34, 34, 40),      # 芝麻狗的黑耳朵、眼圈
    "!": (230, 124, 54),    # 狐狸橘
    "#": (184, 84, 36),     # 狐狸深橘（耳背、背部）
    "$": (56, 42, 40),      # 狐狸黑襪子、耳尖
    "%": (212, 160, 88),    # 西施犬金棕
    "&": (168, 116, 58),    # 西施犬深金棕（耳朵）
    "*": (247, 216, 202),   # 魷魚奶油粉
    "+": (234, 150, 140),   # 魷魚粉點
    "=": (128, 74, 52),     # 烤痕
    "@": (96, 96, 108),     # 烤網、夾子
    "^": (255, 138, 60),    # 炭火
}


def overlay(base, top):
    for y in range(len(base)):
        for x in range(len(base[0])):
            if top[y][x] != ".":
                base[y][x] = top[y][x]
    return base


def grid(rows, pivot):
    return {"x0": 0, "y0": 0, "rows": rows, "pivot": list(pivot)}


# ---------- 狐狸 Lesley（站直，18 x 30） ----------
FOX = (18, 30)


def fox_body():
    m = Mask(*FOX)
    m.disk(8, 19, 4.8, 6.6)
    m.box(5, 24, 7, 29)              # 兩隻黑襪子腳
    m.box(9, 24, 11, 29)
    g = m.outlined("!")
    paint(g, lambda x, y: x >= 8 and 14 <= y <= 22, "w", "!")      # 白胸口
    paint(g, lambda x, y: x <= 5 and y <= 21, "#", "!")
    paint(g, lambda x, y: y >= 24, "$", "!w")
    tail = Mask(*FOX)                # 蓬蓬的大尾巴，尾端白色
    tail.stroke([(5, 23), (1.8, 19), (1.6, 13)], 2.6, 2.2)
    tg = tail.outlined("!")
    paint(tg, lambda x, y: y <= 13, "w", "!")
    paint(tg, lambda x, y: x <= 1 and 15 <= y <= 20, "#", "!")
    for y in range(len(g)):          # 尾巴在身體後面
        for x in range(len(g[0])):
            if tg[y][x] != "." and g[y][x] == ".":
                g[y][x] = tg[y][x]
    return crop(g, (8, 29))


def fox_head(kind):
    m = Mask(*FOX)
    m.disk(10, 9, 4.0, 3.6)
    m.disk(14.4, 10.4, 2.4, 1.5)     # 尖尖的口鼻
    m.stroke([(7.6, 6.5), (6.8, 1.2)], 2.3, 1.1)   # 大耳朵
    m.stroke([(11, 6.2), (11.6, 1.0)], 2.3, 1.1)
    m.box(8, 11, 11, 13)             # 脖子
    g = m.outlined("!")
    paint(g, lambda x, y: y <= 3, "$", "!")
    paint(g, lambda x, y: y >= 10 and x >= 10, "w", "!")          # 白臉頰
    paint(g, lambda x, y: x <= 8 and 5 <= y <= 9, "#", "!")
    eye(g, 12, 8, kind)
    stamp(g, 16, 10, ["k"])
    return crop(g, (9.5, 13))


def fox_arm():
    m = Mask(*FOX)
    m.stroke([(9, 15), (12.5, 17.5)], 1.3, 1.2)
    g = m.outlined("!")
    paint(g, lambda x, y: x >= 12, "$", "!")
    return crop(g, (9, 15))


TONGS = [
    "@@@@@@@@@..",
    "........@@.",
    "@@@@@@@@@..",
]
FAN = [
    ".TTTT.",
    "TLLLLT",
    "TLTTLT",
    "TLLLLT",
    ".TTTT.",
    "..mm..",
    "..mm..",
]


# ---------- 西施犬 Yennefer（20 x 16，長毛拖地） ----------
SHIHTZU = (20, 16)


def shihtzu_body():
    m = Mask(*SHIHTZU)
    m.disk(9, 9, 6.6, 3.8)
    m.box(3, 9, 15, 14)              # 長毛裙
    m.stroke([(4, 7), (2, 4), (4.6, 2)], 1.7, 1.4)                 # 捲在背上的尾巴
    g = m.outlined("%")
    paint(g, lambda x, y: y >= 10, "w", "%")
    paint(g, lambda x, y: y >= 10 and x % 3 == 1, "s", "w")        # 毛的紋路
    paint(g, lambda x, y: y <= 3, "w", "%")
    bottom = max(y for y in range(len(g)) if any(c != "." for c in g[y]))
    for x in range(len(g[0])):       # 毛尖一撮一撮
        if g[bottom][x] != "." and x % 2:
            g[bottom][x] = "."
    stamp(g, 12, 15, ["kk"])         # 從毛裡露出來的小腳
    stamp(g, 5, 15, ["kk"])
    return crop(g, (9, 15))


def shihtzu_head(kind):
    m = Mask(*SHIHTZU)
    m.disk(15, 6.4, 3.8, 3.5)
    m.disk(18.2, 7.6, 1.4, 1.2)      # 扁扁的鼻子
    m.disk(14.6, 2.2, 1.4, 1.3)      # 頭頂的小髮髻
    m.box(12, 8, 14, 11)
    g = m.outlined("%")
    paint(g, lambda x, y: x >= 16 and y >= 6, "w", "%")            # 白色口鼻、鬍鬚
    paint(g, lambda x, y: x == 15 and 3 <= y <= 6, "w", "%")       # 額頭中線白毛
    ear = Mask(*SHIHTZU)             # 長長垂下來的耳朵毛
    ear.stroke([(13, 5), (12.2, 10.6)], 1.6, 1.4)
    overlay(g, ear.outlined("&"))
    stamp(g, 13, 0, ["TT.TT", ".TTT."])                            # 粉紅小髮圈
    eye(g, 16, 5, kind)
    stamp(g, 19, 7, ["k"])
    return crop(g, (13, 11))


# ---------- 芝麻狗 Sylvia（26 x 22，兩倍細格 52 x 44） ----------
DOG = (26, 22)
FW, FH = DOG[0] * 2, DOG[1] * 2


def hash01(a, b, c):
    h = (a * 374761393 + b * 668265263 + c * 1274126177) & 0xFFFFFFFF
    h = ((h ^ (h >> 13)) * 1274126177) & 0xFFFFFFFF
    return ((h ^ (h >> 16)) & 0xFFFFFFFF) / 4294967296


def thick_outline(mask, fill):
    """描邊兩細格寬（等於一般角色的一格）。"""
    m = mask.m
    h, w = len(m), len(m[0])
    g = [["." for _ in range(w)] for _ in range(h)]
    for y in range(h):
        for x in range(w):
            if not m[y][x]:
                continue
            edge = any(
                not (0 <= y + dy < h and 0 <= x + dx < w and m[y + dy][x + dx])
                for dx in (-2, -1, 0, 1, 2) for dy in (-2, -1, 0, 1, 2) if abs(dx) + abs(dy) <= 2
            )
            g[y][x] = "o" if edge else fill
    return g


def sesame(g, density, seed):
    """撒芝麻點：一顆一兩細格、形狀略不規則；點與點不相連，看得到白毛。density(x, y) 回傳這一格出現點的機率。"""
    h, w = len(g), len(g[0])
    for y in range(h):
        for x in range(w):
            if g[y][x] != "w" or hash01(x, y, seed) >= density(x, y):
                continue
            shape = [(0, 0)]
            r = hash01(x, y, seed + 1)
            if r < 0.3:
                shape.append((1, 0))
            elif r < 0.5:
                shape.append((0, 1))
            cells = [(x + dx, y + dy) for dx, dy in shape]
            ok = all(0 <= cx < w and 0 <= cy < h and g[cy][cx] == "w" for cx, cy in cells)
            near = any(
                0 <= cy + dy < h and 0 <= cx + dx < w and g[cy + dy][cx + dx] in "qv"
                for cx, cy in cells for dx in (-1, 0, 1) for dy in (-1, 0, 1)
            )
            if ok and not near:
                c = "q" if hash01(x, y, seed + 2) < 0.65 else "v"
                for cx, cy in cells:
                    g[cy][cx] = c


def fine_piece(g, pivot):
    """細格零件：座標換回一般格（x0、y0、pivot 除以 2），畫的時候一細格 = 半格。"""
    p = crop(g, pivot)
    p["x0"] /= 2
    p["y0"] /= 2
    p["pivot"] = [p["pivot"][0] / 2, p["pivot"][1] / 2]
    p["unit"] = 0.5
    p["fine"] = True
    return p


def dog_body():
    m = Mask(FW, FH)
    m.disk(24, 24, 14.4, 9)          # 身體
    m.disk(35, 22, 7, 9.4)           # 胸口
    m.box(31, 28, 35, 43)            # 遠側前腳
    m.box(10, 28, 14, 43)            # 遠側後腳
    m.box(36, 28, 40, 43)            # 近側前腳
    m.disk(16, 29, 5.6, 6.4)         # 後腿大腿
    m.box(15, 30, 19, 43)            # 近側後腳
    g = thick_outline(m, "w")
    for y in range(FH):              # 遠側的腳上一點陰影
        for x in range(FW):
            if g[y][x] == "w" and y >= 31 and (31 <= x <= 33 or 10 <= x <= 12):
                g[y][x] = "s"

    def density(x, y):
        if x >= 31 and y >= 20:      # 胸口、前腳：以白為主，只有零星小點
            return 0.025
        if y <= 22:                  # 背部最密
            return 0.24
        if y <= 29:                  # 身側
            return 0.19
        return 0.11                  # 後腿、肚子下緣
    sesame(g, density, 11)
    tail = Mask(FW, FH)              # 往後上方翹的尾巴，近尾端一圈黑
    tail.stroke([(11, 19), (6, 14), (3.4, 7)], 2.4, 1.6)
    tg = thick_outline(tail, "w")
    for y in range(FH):
        for x in range(FW):
            if tg[y][x] == "w" and 9 <= y <= 11:
                tg[y][x] = "0"
            if tg[y][x] != "." and g[y][x] == ".":
                g[y][x] = tg[y][x]
    return fine_piece(g, (22, 43))


def dog_head(kind):
    m = Mask(FW, FH)
    m.disk(41, 12, 6.4, 5.8)         # 頭
    m.disk(48, 15, 4.4, 3.0)         # 口鼻
    m.box(34, 14, 41, 25)            # 脖子
    g = thick_outline(m, "w")

    def density(x, y):
        if x >= 45 and y >= 13:      # 口鼻：只有幾顆小灰點
            return 0.04
        return 0.12
    sesame(g, density, 23)
    patch = Mask(FW, FH)             # 眼睛周圍的黑色花紋（往頭頂延伸）
    patch.disk(43.4, 10.2, 2.8, 2.4)
    patch.disk(40.6, 8, 2.4, 2.0)
    for y in range(FH):
        for x in range(FW):
            if patch.m[y][x] and g[y][x] not in ".o":
                g[y][x] = "0"
    ear = Mask(FW, FH)               # 黑色垂耳
    ear.stroke([(38.4, 7), (35.6, 12), (35.6, 17)], 2.8, 2.2)
    for y in range(FH):
        for x in range(FW):
            if ear.m[y][x]:
                g[y][x] = "o" if g[y][x] == "." else "0"
    # 眼睛（在黑眼圈裡，用高光表現）
    if kind == "open":
        stamp(g, 43, 9, ["hk", "kk"])
    elif kind == "happy":
        stamp(g, 42, 9, [".hh.", "h..h"])
    else:
        stamp(g, 42, 8, ["h..h", ".hh.", "h..h"])
    stamp(g, 51, 13, ["0", "0"])     # 鼻頭
    stamp(g, 47, 18, ["k.", ".k"])   # 嘴角
    return fine_piece(g, (37, 25))


# ---------- 魷魚 Eden（16 x 20，正面直立） ----------
SQUID = (16, 20)


def squid(face, grilled=True):
    """face：back（背面，看不到臉）／open／happy／scared。烤過的有烤痕。"""
    m = Mask(*SQUID)
    m.stroke([(8, 12), (8, 2.4)], 4.4, 2.4)          # 身體（外套膜）
    m.disk(8, 1.6, 1.6, 1.4)                         # 尖頭
    m.disk(3.4, 3.6, 2.0, 1.6)                       # 鰭
    m.disk(12.6, 3.6, 2.0, 1.6)
    m.disk(8, 13.4, 4.6, 2.6)                        # 頭
    for x, bend in ((3, -0.8), (6.4, -0.3), (9.6, 0.3), (13, 0.8)):
        m.stroke([(x, 14), (x + bend, 17), (x + bend * 2, 19)], 1.2, 1.0)
    g = m.outlined("*")
    for x, y in ((6, 5), (10, 7), (7, 9), (9, 3), (5, 8), (11, 10)):
        if g[y][x] == "*":
            g[y][x] = "+"
    if grilled:                                      # 斜斜的烤痕
        paint(g, lambda x, y: y <= 11 and (x + y) % 5 == 0, "=", "*+")
    if face == "back":
        return crop(g, (8, 10))
    if face == "open":
        for x0 in (4, 10):
            stamp(g, x0, 12, ["kh", "kk"])
    elif face == "happy":
        for x0 in (4, 10):
            stamp(g, x0 - 1, 12, [".k.", "k.k"])
    else:   # scared：瞪大的白眼
        for x0 in (3, 9):
            stamp(g, x0, 11, ["oooo", "ohko", "oooo"])
    stamp(g, 7, 15, ["nn"] if face != "scared" else ["kk"])
    stamp(g, 3, 14, ["b"])
    stamp(g, 12, 14, ["b"])
    return crop(g, (8, 10))


# ---------- 烤魷魚攤（寬 44，畫在影片的格座標上） ----------
STALL_W = 44


def stall_back():
    """攤子後面：兩根柱子＋粉白條紋遮雨棚。"""
    rows = []
    for y in range(7):               # 遮雨棚
        row = ""
        for x in range(STALL_W):
            if y == 6:
                row += "Q" if x % 4 in (1, 2) else "."
            elif y == 0 or x in (0, STALL_W - 1):
                row += "Q"
            else:
                row += "T" if (x // 4) % 2 == 0 else "X"
        rows.append(row)
    for y in range(21):              # 柱子
        rows.append("." * 3 + "CC" + "." * (STALL_W - 10) + "CC" + "." * 3)
    return grid(rows, (STALL_W / 2, 0))


def stall_counter():
    """櫃台：木頭桌面＋垂下的粉紅桌巾（下緣離地 7 格，魷魚可以躲在底下），兩隻桌腳。"""
    rows = []
    for y in range(2):
        rows.append("C" * STALL_W if y == 0 else "".join("A" if x % 6 else "B" for x in range(STALL_W)))
    for y in range(5):
        row = "Q"
        for x in range(1, STALL_W - 1):
            row += "L" if (x // 3) % 2 == 0 else "P"
        rows.append(row + "Q")
    rows.append("".join("Q" if x % 3 != 2 else "." for x in range(STALL_W)))
    for y in range(6):
        rows.append("." * 2 + "CC" + "." * (STALL_W - 8) + "CC" + "." * 2)
    return grid(rows, (STALL_W / 2, len(rows)))


def grill():
    """烤網＋炭火。"""
    rows = [
        "o" * 24,
        "".join("@" if x % 2 == 0 else "." for x in range(24)),
        "@" * 24,
        "".join("^" if x % 3 else "k" for x in range(24)),
        "o" * 24,
    ]
    return grid(rows, (12, 5))


def pieces():
    out = {}
    for kind in ("open", "happy", "dizzy"):
        out["fx_head_" + kind] = fox_head(kind)
        out["yn_head_" + kind] = shihtzu_head(kind)
        out["dg_head_" + kind] = dog_head(kind)
    out["fx_body"] = fox_body()
    out["fx_arm"] = fox_arm()
    out["yn_body"] = shihtzu_body()
    out["dg_body"] = dog_body()
    for face in ("back", "open", "happy", "scared"):
        out["sd_" + face] = squid(face)
    out["tongs"] = grid(TONGS, (0, 1))
    out["fan"] = grid(FAN, (2.5, 6))
    out["stall_back"] = stall_back()
    out["stall_counter"] = stall_counter()
    out["grill"] = grill()
    return out


if __name__ == "__main__":
    import sys
    sys.stdout.reconfigure(encoding="utf-8")
    for name, p in pieces().items():
        print(name, p["x0"], p["y0"], len(p["rows"][0]), "x", len(p["rows"]), "pivot", p["pivot"])
