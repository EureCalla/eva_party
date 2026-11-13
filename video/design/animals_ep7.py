"""第七集「慢吞吞的臭頭樹懶」的動物與道具零件：水豚、迷你豬、青蛙、樹懶（都畫成面向右的側面），
以及水豚頭上的橘子、溫泉池前緣、荷葉、蒼蠅、臭氣線、臭氣團、溫泉蒸氣。

形狀工具與角色框的用法同 animals.py：每隻動物有自己的角色框（寬 x 高，腳底踩在最下面一列），
零件的 x0/y0 與 pivot 都在框的座標系裡。
"""
from animals import Mask, crop, eye, paint, stamp

PAL = {
    "`": (184, 132, 88),    # 水豚棕
    "/": (164, 140, 112),   # 樹懶灰褐
    ">": (98, 78, 60),      # 樹懶深褐（背、眼罩、亂毛）
    "_": (150, 206, 232),   # 溫泉水
    "'": (188, 204, 84),    # 臭氣黃綠
    ",": (120, 150, 52),    # 臭氣深綠
}


def overlay(base, top):
    for y in range(len(base)):
        for x in range(len(base[0])):
            if top[y][x] != ".":
                base[y][x] = top[y][x]
    return base


def grid(rows, pivot):
    return {"x0": 0, "y0": 0, "rows": rows, "pivot": list(pivot)}


def recolor(g, src, dst):
    for y in range(len(g)):
        for x in range(len(g[0])):
            if g[y][x] == src:
                g[y][x] = dst
    return g


# ---------- 水豚 Uma（26 x 18） ----------
CAPY = (26, 18)


def capy_body():
    m = Mask(*CAPY)
    m.disk(11, 10.5, 9.4, 5.6)
    for x in (4, 8, 13, 16):         # 四隻短腳
        m.box(x, 14, x + 2, 17)
    g = m.outlined("`")
    paint(g, lambda x, y: y <= 7, "O", "`")          # 背上深一點
    return crop(g, (11, 17))


def capy_head(kind):
    """kind：open（一臉放空，半閉眼）／happy／dizzy。方方的大鼻頭。"""
    m = Mask(*CAPY)
    m.disk(19.6, 7.4, 4.0, 3.6)
    m.box(19, 5, 25, 10)
    m.box(16, 8, 19, 12)             # 脖子
    m.disk(17.6, 3.6, 1.2, 1.2)      # 小耳朵
    g = m.outlined("`")
    paint(g, lambda x, y: x >= 23 and y >= 8, "J", "`")
    stamp(g, 24, 6, ["k"])           # 鼻孔
    if kind == "open":
        stamp(g, 20, 6, ["kk"])
    else:
        eye(g, 21, 6, kind)
    return crop(g, (17.5, 10))


def orange():
    m = Mask(6, 6)
    m.disk(2.5, 3.2, 2.5, 2.3)
    g = m.outlined("!")
    recolor(g, "o", "#")
    stamp(g, 2, 0, ["WW"])
    g[2][1] = "^"
    return crop(g, (2.5, 5))


def spring_front():
    """溫泉池的前緣：一圈石頭圍著水面（畫在水豚前面，把身體下半截蓋住）。寬 36、高 8。"""
    w, h = 36, 8
    m = Mask(w, h)
    m.disk(17.5, 2.4, 17.6, 3.6)
    g = m.outlined("_")
    recolor(g, "o", "_")
    for y in range(h):
        for x in range(w):
            if y <= 1:
                g[y][x] = "."
    stones = Mask(w, h)
    for cx, r in ((2, 2.2), (6.5, 2.6), (11.5, 2.4), (16.5, 2.8), (21.5, 2.4), (26.5, 2.6), (31.5, 2.4), (34, 2)):
        stones.disk(cx, 5.2, r, 2.0)
    sg = stones.outlined("E")
    paint(sg, lambda x, y: y >= 6, "D", "E")
    overlay(g, sg)
    for x, y in ((8, 2), (20, 3), (27, 2)):
        if g[y][x] == "_":
            g[y][x] = "h"
    return crop(g, (17.5, 7))


def steam():
    m = Mask(6, 5)
    m.disk(2.5, 2.4, 2.4, 1.8)
    g = m.outlined("h")
    recolor(g, "o", "j")
    return crop(g, (2.5, 2.5))


# ---------- 迷你豬 Bella（18 x 14） ----------
PIG = (18, 14)


def pig_body():
    m = Mask(*PIG)
    m.disk(8, 8.2, 6.6, 4.4)
    for x in (3, 6, 10, 12):
        m.box(x, 11, x + 1, 13)
    g = m.outlined("b")
    for x, y in ((4, 6), (5, 7), (9, 9), (10, 9), (7, 5), (12, 7)):   # 身上沾的泥巴點點
        if g[y][x] == "b":
            g[y][x] = "="
    stamp(g, 0, 5, ["n.", ".n", "n."])    # 捲捲尾巴
    return crop(g, (8, 13))


def pig_head(kind):
    """kind：open／happy／dizzy／sick（被臭到：眼睛擠成 > <、冒冷汗）。"""
    m = Mask(*PIG)
    m.disk(13.2, 6.4, 3.6, 3.4)
    m.box(15, 5, 17, 9)              # 豬鼻
    g = m.outlined("b")
    paint(g, lambda x, y: x >= 16, "n", "b")
    stamp(g, 17, 6, ["k", ".", "k"])
    stamp(g, 11, 2, ["nn", "n."])    # 耳朵
    if kind == "sick":
        stamp(g, 13, 4, ["k.", ".k", "k."])
        stamp(g, 14, 8, ["kk"])
    else:
        eye(g, 14, 5, kind)
    return crop(g, (11.5, 9))


# ---------- 青蛙 Eli（12 x 10） ----------
FROG = (12, 10)


def frog_body():
    m = Mask(*FROG)
    m.disk(5, 6.6, 4.4, 3.0)
    m.disk(2.6, 7.6, 2.4, 2.2)       # 後腿蜷著
    m.box(6, 8, 8, 9)                # 前腳
    g = m.outlined("S")
    paint(g, lambda x, y: x >= 5 and y >= 7, "u", "S")
    paint(g, lambda x, y: x <= 3 and y >= 7, "W", "S")
    stamp(g, 0, 9, ["WWW"])          # 後腳掌
    return crop(g, (5, 9))


def frog_head(kind):
    """kind：open／happy／dizzy（被臭昏，舌頭吐出來）。眼睛鼓在頭頂。"""
    m = Mask(*FROG)
    m.disk(7.6, 4.6, 3.6, 2.4)
    m.disk(7.4, 2.0, 1.8, 1.6)       # 鼓起來的眼睛
    g = m.outlined("S")
    paint(g, lambda x, y: y >= 6, "u", "S")
    if kind == "open":
        stamp(g, 7, 1, ["hk", "kk"])
    elif kind == "happy":
        stamp(g, 6, 1, [".k.", "k.k"])
    else:
        stamp(g, 6, 1, ["k.k", ".k.", "k.k"])
        stamp(g, 10, 6, ["p", "p"])  # 舌頭吐出來
    stamp(g, 8, 5, ["kkk"])          # 嘴巴
    return crop(g, (6, 6))


def lily():
    m = Mask(12, 4)
    m.disk(5.5, 1.6, 5.6, 1.6)
    g = m.outlined("S")
    recolor(g, "o", "W")
    g[0][6] = g[1][6] = "."          # 荷葉的缺口
    return crop(g, (5.5, 1))


# ---------- 樹懶 Yoga（26 x 20） ----------
SLOTH = (26, 20)


def sloth_body():
    m = Mask(*SLOTH)
    m.disk(12, 10.4, 8.8, 5.0)
    g = m.outlined("/")
    paint(g, lambda x, y: y <= 7 and 6 <= x <= 16, ">", "/")   # 背上一條深色
    return crop(g, (12, 19))


def sloth_head(kind):
    """kind：open（瞇瞇眼慢慢笑）／happy／dizzy。臉上淺色、深色眼罩，頭頂一撮又長又亂的毛。"""
    m = Mask(*SLOTH)
    m.disk(20.4, 8.4, 4.2, 3.8)
    m.box(16, 9, 18, 12)             # 脖子
    g = m.outlined("/")
    face = Mask(*SLOTH)
    face.disk(21.6, 9.0, 2.8, 2.4)
    for y in range(SLOTH[1]):
        for x in range(SLOTH[0]):
            if face.m[y][x] and g[y][x] == "/":
                g[y][x] = "J"
    stamp(g, 20, 8, [">>>>"])        # 眼罩
    if kind == "open":
        stamp(g, 21, 8, ["kk"])
    elif kind == "happy":
        stamp(g, 21, 7, [".k.", "k.k"])
    else:
        stamp(g, 21, 7, ["k.k", ".k.", "k.k"])
    stamp(g, 24, 9, ["k"])           # 鼻子
    stamp(g, 21, 11, ["k..", ".kk"])  # 一直在笑的嘴
    # 頭頂的亂毛（臭味的來源）
    stamp(g, 16, 1, ["..>.>..", ".>/>/>.", ">/>>/>/", ".>/>>/.", "..>>>.."])
    return crop(g, (17, 11))


def sloth_limb(far, leg):
    """手腳都長長的，末端是三根彎爪。far 是遠側（深色）；leg 是後腳（長在屁股），否則是前手（長在肩膀）。"""
    m = Mask(*SLOTH)
    x0 = (7 if leg else 16) + (2 if far else 0)
    x1 = x0 + (-1 if leg else 2)
    m.stroke([(x0, 12), (x1, 17.4)], 1.5, 1.1)
    g = m.outlined(">" if far else "/")
    stamp(g, round(x1) - 1, 18, ["JJJ", "J.J"])
    return crop(g, (x0, 12))


def fly():
    return grid(["VV.", ".kk"], (1, 1))


STINK = [".'.", "',.", ".'.", ".,'", ".'.", "',.", ".'.", ".,'"]


def stink_cloud():
    m = Mask(14, 9)
    for cx, cy, r in ((4, 5, 3.0), (7.4, 3.6, 3.4), (10.4, 5.2, 2.8), (7, 6.2, 3.0)):
        m.disk(cx, cy, r, r * 0.85)
    g = m.outlined("'")
    recolor(g, "o", ",")
    for x, y in ((5, 4), (9, 5), (7, 6)):
        g[y][x] = ","
    return crop(g, (7, 4.5))


def pieces():
    out = {}
    for kind in ("open", "happy", "dizzy"):
        out["cb_head_" + kind] = capy_head(kind)
        out["pi_head_" + kind] = pig_head(kind)
        out["fr_head_" + kind] = frog_head(kind)
        out["sl_head_" + kind] = sloth_head(kind)
    out["pi_head_sick"] = pig_head("sick")
    out["cb_body"] = capy_body()
    out["pi_body"] = pig_body()
    out["fr_body"] = frog_body()
    out["sl_body"] = sloth_body()
    out["sl_arm"] = sloth_limb(False, False)
    out["sl_arm_far"] = sloth_limb(True, False)
    out["sl_leg"] = sloth_limb(False, True)
    out["sl_leg_far"] = sloth_limb(True, True)
    out["orange"] = orange()
    out["spring_front"] = spring_front()
    out["steam"] = steam()
    out["lily"] = lily()
    out["fly"] = fly()
    out["stink"] = grid(STINK, (1, 7))
    out["stink_cloud"] = stink_cloud()
    return out


if __name__ == "__main__":
    import sys
    sys.stdout.reconfigure(encoding="utf-8")
    for name, p in pieces().items():
        print(name, p["x0"], p["y0"], len(p["rows"][0]), "x", len(p["rows"]), "pivot", p["pivot"])
        if "--show" in sys.argv:
            print("\n".join(p["rows"]))
