"""第四集的動物與道具零件：綿羊、山羊、獅子、棕熊、小白兔（都畫成面向右的側面），以及哨子、音符、汗滴、打架煙霧、腫包。

形狀工具與角色框的用法同 animals.py：每隻動物有自己的角色框（寬 x 高，腳底踩在最下面一列），
零件的 x0/y0 與 pivot 都在框的座標系裡。面向左的角色（山羊、棕熊）由影片程式水平翻面。
綿羊的毛是獨立零件，打一次架就蓬大一圈；獅子另有被抓亂的爆炸頭鬃毛。
"""
import math

from animals import Mask, crop, eye, paint, stamp

PAL = {
    "1": (240, 216, 204),   # 綿羊臉（奶油粉）
    "2": (110, 100, 108),   # 綿羊腳（深灰）
    "3": (226, 220, 206),   # 山羊灰白
    "4": (184, 158, 118),   # 山羊角
    "5": (236, 186, 96),    # 獅子金黃
    "6": (196, 112, 52),    # 獅子鬃毛
    "7": (150, 100, 64),    # 棕熊棕
    "8": (112, 72, 46),     # 棕熊深棕（耳朵內側、遠側的腳）
    "9": (252, 250, 245),   # 打架煙霧
    "j": (226, 228, 236),   # 煙霧陰影
}


def overlay(base, top):
    """把 top 不透明的格子蓋到 base 上（同尺寸）。"""
    for y in range(len(base)):
        for x in range(len(base[0])):
            if top[y][x] != ".":
                base[y][x] = top[y][x]
    return base


def legs(m, xs, y0, y1):
    """一排 3 格寬的腳（描邊後中間一欄留底色）。"""
    for x in xs:
        m.box(x, y0, x + 2, y1)


# ---------- 綿羊（24 x 18） ----------
SHEEP = (24, 18)
SHEEP_WOOL_C = (11, 9)


def sheep_legs():
    m = Mask(*SHEEP)
    legs(m, (4, 8, 13, 17), 12, 17)
    return crop(m.outlined("2"), (11, 12))


def sheep_wool():
    m = Mask(*SHEEP)
    m.disk(11, 9, 7.5, 4.6)
    for cx, cy in ((5, 7.5), (7.5, 5), (11, 4.2), (15, 4.6), (17.6, 7.4), (17, 11.4), (12, 12.6), (7, 12.2), (4.2, 10.4)):
        m.disk(cx, cy, 2.6, 2.4)
    g = m.outlined("w")
    paint(g, lambda x, y: y >= 11, "s", "w")
    for x, y in ((8, 7), (12, 6), (15, 9), (6, 10), (10, 10)):     # 捲毛
        if g[y][x] == "w":
            g[y][x] = "s"
    return crop(g, SHEEP_WOOL_C)


def sheep_head(kind):
    m = Mask(*SHEEP)
    m.disk(19.5, 7.6, 3.2, 3.4)
    m.disk(21.4, 9.2, 2.0, 1.8)
    m.box(16, 8, 18, 11)             # 脖子
    m.disk(16.2, 6.4, 1.8, 1.2)      # 耳朵
    g = m.outlined("1")
    tuft = Mask(*SHEEP)              # 頭頂一撮捲毛
    tuft.disk(18.6, 4.4, 2.6, 1.8)
    overlay(g, tuft.outlined("w"))
    paint(g, lambda x, y: x <= 16 and 6 <= y <= 7, "p", "1")
    eye(g, 20, 7, kind)
    stamp(g, 22, 9, ["k"])
    stamp(g, 18, 9, ["b"])
    return crop(g, (17, 11))


# ---------- 山羊（22 x 22） ----------
GOAT = (22, 22)


def goat_body():
    m = Mask(*GOAT)
    m.disk(10, 13.6, 7.4, 4.2)
    legs(m, (4, 13), 15, 21)
    m.stroke([(3.6, 11.5), (1.8, 9)], 1.5, 1.2)     # 往上翹的短尾巴
    g = m.outlined("3")
    paint(g, lambda x, y: y >= 20, "m", "3")       # 蹄
    paint(g, lambda x, y: y >= 16 and 6 <= x <= 13, "s", "3")
    return crop(g, (10, 21))


def goat_head(kind):
    m = Mask(*GOAT)
    m.disk(17, 8.2, 3.2, 2.9)
    m.disk(19.8, 9.6, 2.1, 1.7)
    m.box(13, 9, 16, 13)             # 脖子
    m.stroke([(15, 8), (12.2, 8.8)], 1.3, 1.0)     # 往後垂的耳朵
    g = m.outlined("3")
    horn = Mask(*GOAT)               # 往後彎的角
    horn.stroke([(16.5, 5.6), (15.6, 2.6), (13.4, 1.4), (11.8, 2.6)], 1.4, 0.9, steps=60)
    overlay(g, horn.outlined("4"))
    stamp(g, 18, 12, ["ww", "w"])    # 山羊鬍
    eye(g, 18, 7, kind)
    stamp(g, 21, 9, ["k"])
    return crop(g, (15, 13))


# ---------- 獅子（30 x 24） ----------
LION = (30, 24)


def lion_body():
    m = Mask(*LION)
    m.disk(14, 15.4, 9, 4.8)
    legs(m, (6, 18), 17, 23)
    m.stroke([(5.4, 13.4), (2.6, 11.4), (1.6, 8.4)], 1.4, 1.2)
    g = m.outlined("5")
    tuft = Mask(*LION)
    tuft.disk(1.8, 7.0, 1.8, 1.8)
    overlay(g, tuft.outlined("6"))
    paint(g, lambda x, y: y >= 17 and 8 <= x <= 20, "J", "5")
    return crop(g, (14, 23))


def lion_head(kind, messy):
    m = Mask(*LION)
    m.disk(22, 10.4, 5.8, 6.0)
    if messy:
        # 被抓亂的爆炸頭：往四面八方炸開的尖刺
        for i in range(10):
            a = -math.pi * 0.95 + i * (math.pi * 1.15 / 9)   # 只往上、往前炸，不往下（會像多長了腳）
            r = 9.0 + (1.6 if i % 2 else 0)
            m.stroke([(22, 10.4), (22 + math.cos(a) * r, 10.4 + math.sin(a) * r)], 1.6, 1.0, steps=30)
    g = m.outlined("6")
    if messy:
        paint(g, lambda x, y: (x * 3 + y * 5) % 7 == 0, "i", "6")
    face = Mask(*LION)
    face.disk(24.4, 11.2, 3.6, 3.4)
    face.disk(26.8, 12.6, 2.2, 1.7)
    face.disk(21.6, 7.4, 1.3, 1.3)   # 耳朵
    fg = face.outlined("5")
    paint(fg, lambda x, y: x >= 26 and y >= 12, "J", "5")
    overlay(g, fg)
    eye(g, 25, 10, kind)
    stamp(g, 28, 11, ["k"])
    return crop(g, (20, 15))


# ---------- 棕熊（28 x 22） ----------
BEAR = (28, 22)
BEAR_BUMP = (22, 3.2)   # 腫包貼在頭頂的位置（角色框座標）


def bear_body():
    m = Mask(*BEAR)
    m.disk(12.6, 13.4, 9.4, 5.8)
    legs(m, (5, 16), 16, 21)
    m.disk(3.4, 10.6, 1.6, 1.6)      # 短尾巴
    g = m.outlined("7")
    paint(g, lambda x, y: y >= 19, "8", "7")
    return crop(g, (12, 21))


def bear_head(kind):
    m = Mask(*BEAR)
    m.disk(21.6, 8.6, 4.2, 4.0)
    m.disk(25.2, 10.4, 2.3, 1.8)
    m.disk(18.8, 4.8, 1.7, 1.7)      # 耳朵
    m.box(17, 10, 20, 14)            # 脖子
    g = m.outlined("7")
    paint(g, lambda x, y: x >= 24 and y >= 9, "J", "7")
    paint(g, lambda x, y: x <= 19 and y <= 5, "8", "7")
    eye(g, 22, 7, kind)
    stamp(g, 27, 9, ["k"])
    return crop(g, (19, 14))


# ---------- 小白兔（14 x 26，站直） ----------
RABBIT = (14, 26)


def rabbit_body():
    m = Mask(*RABBIT)
    m.disk(6, 19.4, 4.4, 5.0)
    m.box(5, 23, 10, 25)             # 長長的腳掌
    m.disk(1.8, 19.6, 1.8, 1.8)      # 圓尾巴
    m.box(8, 16, 10, 18)             # 收在胸前的小手
    g = m.outlined("w")
    paint(g, lambda x, y: x <= 5 and y >= 20, "s", "w")
    return crop(g, (7, 25))


def rabbit_head(kind, ears):
    m = Mask(*RABBIT)
    m.disk(7.4, 11.2, 3.6, 3.3)
    m.disk(10.2, 12.4, 1.8, 1.4)
    m.box(6, 13, 9, 16)              # 脖子
    if ears == "up":
        m.stroke([(6.0, 9.6), (4.6, 1.6)], 1.5, 1.3)
        m.stroke([(8.4, 9.6), (9.4, 1.8)], 1.5, 1.3)
    else:   # 嚇到垂下來
        m.stroke([(6.2, 9.4), (3.2, 8.4), (1.4, 12.0)], 1.4, 1.2)
        m.stroke([(7.6, 9.0), (4.8, 7.0), (2.4, 9.6)], 1.4, 1.2)
    g = m.outlined("w")
    if ears == "up":
        paint(g, lambda x, y: 2 <= y <= 6, "p", "w")
    else:
        paint(g, lambda x, y: x <= 4 and 8 <= y <= 11, "p", "w")
    eye(g, 8, 10, kind)
    stamp(g, 11, 11, ["n"])
    stamp(g, 9, 13, ["b"])
    return crop(g, (7.5, 16))


def rabbit_ball():
    """嚇到縮成一顆毛球：耳朵貼在背上、閉緊眼睛。"""
    m = Mask(*RABBIT)
    m.disk(7, 21, 5.8, 4.6)
    m.stroke([(8, 17.4), (4, 16.8), (2, 18.4)], 1.3, 1.1)
    g = m.outlined("w")
    paint(g, lambda x, y: y >= 23, "s", "w")
    paint(g, lambda x, y: x <= 4 and y <= 18, "p", "w")
    stamp(g, 10, 20, ["kk"])
    stamp(g, 11, 22, ["b"])
    return crop(g, (7, 25))


# ---------- 道具 ----------
WHISTLE = ["oooo.", "oyyyo", "oyyko", "ooo.."]
NOTE = ["..oo", "..ko", "..k.", "kkk.", "kk.."]
SWEAT = [".V.", "VVV", ".V."]
BUMP = [".oo.", "onno", "onho", "onno"]


def grid(rows, pivot):
    return {"x0": 0, "y0": 0, "rows": rows, "pivot": list(pivot)}


def dust():
    m = Mask(14, 10)
    for cx, cy, r in ((4, 5.6, 3.2), (7.4, 4, 3.6), (10.4, 5.8, 3.0), (7, 6.8, 3.0)):
        m.disk(cx, cy, r, r * 0.9)
    g = m.outlined("9")
    paint(g, lambda x, y: y >= 7, "j", "9")
    return crop(g, (7, 5.5))


def pieces():
    out = {}
    for kind in ("open", "happy", "dizzy"):
        out["sh_head_" + kind] = sheep_head(kind)
        out["gt_head_" + kind] = goat_head(kind)
        out["ln_head_" + kind] = lion_head(kind, False)
        out["ln_head_" + kind + "_messy"] = lion_head(kind, True)
        out["br_head_" + kind] = bear_head(kind)
        for ears in ("up", "down"):
            out["rb_head_" + kind + "_" + ears] = rabbit_head(kind, ears)
    out["sh_legs"] = sheep_legs()
    out["sh_wool"] = sheep_wool()
    out["gt_body"] = goat_body()
    out["ln_body"] = lion_body()
    out["br_body"] = bear_body()
    out["rb_body"] = rabbit_body()
    out["rb_ball"] = rabbit_ball()
    out["whistle"] = grid(WHISTLE, (0, 1))
    out["note"] = grid(NOTE, (2, 2))
    out["sweat"] = grid(SWEAT, (1, 1))
    out["bump"] = grid(BUMP, (2, 3))
    out["dust"] = dust()
    return out


if __name__ == "__main__":
    import sys
    sys.stdout.reconfigure(encoding="utf-8")
    for name, p in pieces().items():
        print(name, p["x0"], p["y0"], len(p["rows"][0]), "x", len(p["rows"]), "pivot", p["pivot"])
