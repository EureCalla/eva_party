"""第三集的動物零件：松鼠、天竺鼠、倉鼠、矮袋鼠（都畫成面向右的側面），以及捲成跑步機的蛇。

形狀工具與角色框的用法同 animals.py：每隻動物有自己的角色框（寬 x 高，腳底踩在最下面一列），
零件的 x0/y0 與 pivot 都在框的座標系裡。蛇比較特別：身體是一整個圓環（繞圓心轉就是跑步機在轉），
頭和尾巴尖是另外的小零件，影片程式把它們擺在圓環頂端。
"""
import math

from animals import Mask, crop, eye, paint, stamp

PAL = {
    "a": (214, 128, 62),    # 松鼠橘
    "i": (150, 82, 40),     # 松鼠深橘（尾巴條紋、耳朵）
    "t": (222, 148, 82),    # 天竺鼠薑黃
    "H": (238, 186, 112),   # 倉鼠金黃
    "M": (166, 132, 100),   # 矮袋鼠灰棕
    "S": (128, 190, 118),   # 蛇綠
    "W": (82, 140, 86),     # 蛇深綠花紋
    "u": (232, 234, 190),   # 蛇肚子淺黃
}


# ---------- 松鼠（18 x 16） ----------
SQUIRREL = (18, 16)


def squirrel_body():
    m = Mask(*SQUIRREL)
    m.disk(10, 11, 4.2, 3.8)
    m.disk(8, 13, 2.8, 2.2)          # 後腿
    m.box(8, 14, 12, 15)
    m.box(13, 10, 14, 12)            # 收在胸前的前爪
    g = m.outlined("a")
    paint(g, lambda x, y: x >= 11 and 9 <= y <= 14, "J", "a")
    return crop(g, (10, 15))


def squirrel_tail():
    m = Mask(*SQUIRREL)
    m.stroke([(6, 12), (3, 9), (2, 5), (4, 2), (6.5, 1.5)], 2.5, 2.0, steps=50)
    g = m.outlined("a")
    paint(g, lambda x, y: (x + y) % 4 == 0, "i", "a")
    return crop(g, (6, 12))


def squirrel_head(kind):
    m = Mask(*SQUIRREL)
    m.disk(13.5, 6.5, 3.4, 3.0)
    m.disk(16, 7.6, 1.7, 1.4)
    m.box(12, 2, 13, 4)              # 耳朵（一格寬會被剔掉，畫兩格）
    m.box(11, 8, 13, 10)             # 脖子
    g = m.outlined("a")
    stamp(g, 12, 1, ["ii"])          # 耳尖簇毛
    paint(g, lambda x, y: x >= 15 and y >= 7, "J", "a")
    eye(g, 14, 5, kind)
    stamp(g, 17, 7, ["k"])
    return crop(g, (12, 10))


# ---------- 天竺鼠（16 x 10） ----------
GUINEA = (16, 10)


def guinea_body():
    m = Mask(*GUINEA)
    m.disk(7, 5.5, 6.6, 3.9)
    m.box(3, 8, 4, 9)
    m.box(9, 8, 10, 9)
    g = m.outlined("w")
    paint(g, lambda x, y: x <= 6 and y <= 6, "t", "w")
    return crop(g, (7, 9))


def guinea_head(kind):
    m = Mask(*GUINEA)
    m.disk(12, 5, 3.4, 3.2)
    m.box(9, 5, 11, 7)
    g = m.outlined("t")
    paint(g, lambda x, y: x >= 14, "w", "t")      # 白色鼻樑
    stamp(g, 9, 1, ["pp"])                         # 小耳朵
    eye(g, 12, 4, kind)
    stamp(g, 15, 6, ["k"])
    return crop(g, (10, 7))


# ---------- 倉鼠（12 x 10） ----------
HAMSTER = (12, 10)


def hamster_body():
    m = Mask(*HAMSTER)
    m.disk(5.5, 5.6, 5.0, 4.2)
    m.box(4, 8, 5, 9)
    m.box(8, 8, 9, 9)
    g = m.outlined("H")
    paint(g, lambda x, y: x >= 4 and y >= 6, "J", "H")
    return crop(g, (6, 9))


def hamster_head(kind):
    m = Mask(*HAMSTER)
    m.disk(8.5, 4.4, 2.9, 2.7)
    m.box(6, 5, 8, 7)
    g = m.outlined("H")
    stamp(g, 6, 1, ["pp"])
    paint(g, lambda x, y: x >= 9 and y >= 5, "b", "H")   # 鼓鼓的頰囊
    eye(g, 9, 3, kind)
    stamp(g, 11, 4, ["k"])
    return crop(g, (7, 7))


# ---------- 矮袋鼠（14 x 17，站直） ----------
QUOKKA = (14, 17)


def quokka_body():
    m = Mask(*QUOKKA)
    m.disk(6, 10.5, 4.2, 5.0)
    m.box(5, 15, 10, 16)             # 長長的後腳掌
    m.stroke([(3, 13), (1, 16)], 1.5, 1.0)
    m.box(9, 9, 11, 10)              # 小手
    g = m.outlined("M")
    paint(g, lambda x, y: x >= 6 and 7 <= y <= 14, "J", "M")
    return crop(g, (7, 16))


def quokka_head(kind):
    m = Mask(*QUOKKA)
    m.disk(8, 4.6, 3.6, 3.3)
    m.disk(11, 5.8, 1.9, 1.5)
    m.disk(5.6, 1.4, 1.5, 1.4)       # 圓耳
    m.box(6, 7, 9, 9)
    g = m.outlined("M")
    paint(g, lambda x, y: x <= 6 and y <= 2, "p", "M")
    paint(g, lambda x, y: x >= 10 and y >= 6, "J", "M")
    eye(g, 9, 3, kind)
    stamp(g, 12, 5, ["k"])
    stamp(g, 10, 7, ["k"])           # 矮袋鼠招牌的微笑嘴角
    return crop(g, (7.5, 9))


# ---------- 蛇（捲成一圈的跑步機） ----------
RING = 48
RING_C = 23.5
RING_OUT = 23.0
RING_IN = 18.0


def snake_ring():
    m = Mask(RING, RING)
    for y in range(RING):
        for x in range(RING):
            d = math.hypot(x - RING_C, y - RING_C)
            m.m[y][x] = RING_IN <= d <= RING_OUT
    g = m.outlined("S")
    for y in range(RING):
        for x in range(RING):
            if g[y][x] != "S":
                continue
            d = math.hypot(x - RING_C, y - RING_C)
            band = int((math.atan2(y - RING_C, x - RING_C) + math.pi) / (2 * math.pi) * 18)
            if d < RING_IN + 1.6:
                g[y][x] = "u"            # 內側是肚子，小動物踩在上面跑
            elif band % 2 == 0:
                g[y][x] = "W"
    return crop(g, (RING_C, RING_C))


def snake_head(kind):
    m = Mask(13, 8)
    m.disk(5.5, 4, 4.6, 3.1)
    g = m.outlined("S")
    paint(g, lambda x, y: y >= 5, "u", "S")
    for x, y in ((3, 2), (5, 1)):
        if g[y][x] == "S":
            g[y][x] = "W"
    eye(g, 7, 2, kind)
    stamp(g, 10, 4, ["rr", "..r"])    # 分岔的舌頭
    return crop(g, (3, 7))


def snake_tail():
    m = Mask(9, 5)
    m.stroke([(8, 2.5), (1, 2)], 1.9, 0.9)
    g = m.outlined("S")
    paint(g, lambda x, y: x % 3 == 0, "W", "S")
    return crop(g, (8, 2.5))


def pieces():
    out = {}
    for kind in ("open", "happy", "dizzy"):
        out["sq_head_" + kind] = squirrel_head(kind)
        out["gp_head_" + kind] = guinea_head(kind)
        out["hm_head_" + kind] = hamster_head(kind)
        out["qk_head_" + kind] = quokka_head(kind)
    for kind in ("open", "happy"):
        out["sn_head_" + kind] = snake_head(kind)
    out["sq_body"] = squirrel_body()
    out["sq_tail"] = squirrel_tail()
    out["gp_body"] = guinea_body()
    out["hm_body"] = hamster_body()
    out["qk_body"] = quokka_body()
    out["sn_ring"] = snake_ring()
    out["sn_tail"] = snake_tail()
    return out


if __name__ == "__main__":
    import sys
    sys.stdout.reconfigure(encoding="utf-8")
    for name, p in pieces().items():
        print(name, p["x0"], p["y0"], len(p["rows"][0]), "x", len(p["rows"]), "pivot", p["pivot"])
        if "open" in name or name.endswith(("_body", "_tail")):
            for r in p["rows"]:
                print("   ", r)
