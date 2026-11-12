"""第六集「翅膀組」的動物與道具零件：小雞、貓頭鷹、小企鵝、仙鶴（都畫成面向右的側面），
以及孵小雞的蛋（整顆、裂開、上下兩半蛋殼）、貓頭鷹睡覺的樹、Z 字、魷魚頭上的憂鬱烏雲。

形狀工具與角色框的用法同 animals.py：每隻動物有自己的角色框（寬 x 高，腳底踩在最下面一列），
零件的 x0/y0 與 pivot 都在框的座標系裡。仙鶴是大體型（丹頂鶴：白身、黑脖子、黑尾羽、頭頂紅）。
"""
from animals import Mask, crop, eye, paint, stamp

PAL = {
    ":": (255, 214, 92),    # 小雞黃
    ";": (232, 176, 56),    # 小雞深黃（翅膀）
    "<": (240, 140, 60),    # 嘴、腳的橘色
    "?": (222, 52, 62),     # 仙鶴頭頂紅
    "[": (150, 108, 72),    # 貓頭鷹棕
    "]": (104, 72, 48),     # 貓頭鷹深棕（花紋、耳羽）
    "{": (240, 222, 188),   # 貓頭鷹臉盤、肚子
    "}": (255, 200, 60),    # 貓頭鷹黃眼
    "(": (132, 92, 60),     # 樹幹
    ")": (126, 186, 110),   # 樹葉
    "|": (96, 156, 90),     # 樹葉陰影
    "-": (190, 196, 210),   # 烏雲
}


def overlay(base, top):
    for y in range(len(base)):
        for x in range(len(base[0])):
            if top[y][x] != ".":
                base[y][x] = top[y][x]
    return base


def grid(rows, pivot):
    return {"x0": 0, "y0": 0, "rows": rows, "pivot": list(pivot)}


# ---------- 小雞 Sally（12 x 12） ----------
CHICK = (12, 12)


def chick_body():
    m = Mask(*CHICK)
    m.disk(5.4, 7.6, 4.2, 3.6)
    g = m.outlined(":")
    wing = Mask(*CHICK)
    wing.disk(4.6, 7.6, 2.2, 1.6)
    overlay(g, wing.outlined(";"))
    stamp(g, 4, 11, ["<.<"])         # 小腳
    return crop(g, (6, 11))


def chick_head(kind):
    m = Mask(*CHICK)
    m.disk(7, 4.2, 3.2, 3.0)
    m.box(5, 6, 8, 7)
    g = m.outlined(":")
    stamp(g, 6, 0, [".o", "o."])     # 頭頂一撮毛
    eye(g, 8, 3, kind)
    stamp(g, 10, 4, ["<<"])
    stamp(g, 7, 5, ["b"])
    return crop(g, (6.5, 7))


# 蛋：10 x 12，裂縫是鋸齒狀（上下兩半蛋殼沿同一條鋸齒切開）
EGG = (10, 12)
ZIG = [6, 5, 6, 5, 6, 5, 6, 5, 6, 5]   # 每一欄的裂縫高度


def egg_mask():
    m = Mask(*EGG)
    m.disk(4.5, 6.6, 4.2, 5.2)
    return m


def egg(part):
    """part：whole（整顆）／crack（有裂縫）／top（上半蛋殼）／bottom（下半蛋殼）。"""
    g = egg_mask().outlined("c")
    for x, y in ((3, 3), (6, 5), (2, 8), (7, 9), (5, 2)):
        if g[y][x] == "c":
            g[y][x] = "L"
    if part != "whole":
        for x in range(EGG[0]):
            if g[ZIG[x]][x] != ".":
                g[ZIG[x]][x] = "o"
    if part == "top":
        for x in range(EGG[0]):
            for y in range(ZIG[x] + 1, EGG[1]):
                g[y][x] = "."
    if part == "bottom":
        for x in range(EGG[0]):
            for y in range(0, ZIG[x]):
                g[y][x] = "."
    return crop(g, (4.5, 11.5) if part != "top" else (4.5, 5.5))


# ---------- 小企鵝 Tiffany（14 x 18） ----------
PENGUIN = (14, 18)


def penguin_body():
    m = Mask(*PENGUIN)
    m.disk(6.6, 11, 5, 6.2)
    g = m.outlined("0")
    paint(g, lambda x, y: x >= 7 and y >= 7, "w", "0")   # 白肚子
    stamp(g, 6, 17, ["<<.<<"])                          # 橘色腳掌
    return crop(g, (7, 17))


def penguin_head(kind):
    m = Mask(*PENGUIN)
    m.disk(7.6, 4.6, 3.6, 3.4)
    m.box(5, 7, 9, 8)
    g = m.outlined("0")
    paint(g, lambda x, y: x >= 9 and y >= 4, "w", "0")   # 白臉頰
    eye(g, 9, 3, kind)
    stamp(g, 11, 4, ["<<"])
    stamp(g, 9, 6, ["b"])
    return crop(g, (7, 8))


def penguin_flipper():
    m = Mask(*PENGUIN)
    m.stroke([(6, 8), (4.4, 13)], 1.5, 1.0)
    return crop(m.outlined("0"), (6, 8))


# ---------- 仙鶴 Calla（32 x 50，大體型） ----------
CRANE = (32, 50)


def crane_body():
    m = Mask(*CRANE)
    m.disk(14, 27, 9, 5.6)
    m.disk(6.4, 27.6, 4.6, 4.2)      # 蓬起來的黑色尾羽
    g = m.outlined("w")
    paint(g, lambda x, y: x <= 9, "0", "w")
    paint(g, lambda x, y: y >= 30 and x > 9, "s", "w")
    return crop(g, (14, 31))


def crane_leg(front, far):
    m = Mask(*CRANE)
    x = 16 if front else 12
    m.box(x, 31, x + 1, 47)
    m.box(x, 48, x + 3, 49)          # 腳趾
    g = m.outlined("q" if far else "v")
    for y in range(len(g)):          # 細腳整條都是描邊色，填色看不到；直接塗灰
        for xx in range(len(g[0])):
            if g[y][xx] == "o":
                g[y][xx] = "q" if far else "v"
    return crop(g, (x + 0.5, 31))


def crane_neck(kind):
    m = Mask(*CRANE)
    m.stroke([(19, 26), (22, 16), (23.6, 8)], 2.6, 1.9)
    m.disk(25, 6.4, 3.4, 2.9)        # 頭
    m.stroke([(26.6, 6.6), (31.4, 7.8)], 0.9, 0.6)    # 長嘴
    g = m.outlined("0")
    paint(g, lambda x, y: x >= 23 and y <= 8 and x <= 27, "w", "0")
    paint(g, lambda x, y: y <= 4 and 23 <= x <= 26, "?", "0w")     # 頭頂一點紅
    paint(g, lambda x, y: x >= 28, "J", "0w")
    for x in range(28, 32):
        for y in range(6, 10):
            if g[y][x] == "o":
                g[y][x] = "J"
    eye(g, 25, 6, kind)
    return crop(g, (19, 26))


def crane_wing():
    m = Mask(*CRANE)
    m.disk(13, 24.6, 7, 3.2)
    m.stroke([(8, 25), (3.6, 26.6)], 2.0, 1.4)
    g = m.outlined("w")
    paint(g, lambda x, y: x <= 7, "0", "w")          # 黑色飛羽
    return crop(g, (17, 24))


# ---------- 貓頭鷹 Jade（14 x 16） ----------
OWL = (14, 16)


def owl_body():
    m = Mask(*OWL)
    m.disk(6.6, 10.4, 4.6, 5.2)
    g = m.outlined("[")
    paint(g, lambda x, y: x >= 6 and y >= 8, "{", "[")
    for x, y in ((8, 10), (10, 11), (8, 13), (10, 14), (9, 12)):
        if g[y][x] == "{":
            g[y][x] = "]"
    stamp(g, 6, 15, ["<.<"])
    return crop(g, (7, 15))


def owl_head(kind):
    """kind：sleep（閉眼）／awake（嚇醒，大黃眼）／grumpy（沒睡飽，半閉眼）／happy。"""
    m = Mask(*OWL)
    m.disk(7.6, 5.2, 4.6, 3.8)
    m.stroke([(4.6, 2.6), (3.6, 0.4)], 1.2, 0.8)     # 耳羽
    m.stroke([(9.6, 2.4), (10.6, 0.4)], 1.2, 0.8)
    g = m.outlined("[")
    face = Mask(*OWL)
    face.disk(6.4, 5.6, 2.2, 2.2)
    face.disk(10.2, 5.6, 2.2, 2.2)
    for y in range(OWL[1]):
        for x in range(OWL[0]):
            if face.m[y][x] and g[y][x] == "[":
                g[y][x] = "{"
    if kind == "sleep":
        stamp(g, 5, 6, ["kk"])
        stamp(g, 9, 6, ["kk"])
    elif kind == "awake":
        stamp(g, 5, 4, ["}}", "}k"])
        stamp(g, 9, 4, ["}}", "k}"])
    elif kind == "grumpy":
        stamp(g, 5, 5, ["]]", "}k"])
        stamp(g, 9, 5, ["]]", "k}"])
    else:
        stamp(g, 5, 5, [".k", "k."])
        stamp(g, 9, 5, ["k.", ".k"])
    stamp(g, 8, 7, ["<"])
    return crop(g, (7, 9))


def owl_wing(spread):
    m = Mask(*OWL)
    if spread:
        m.stroke([(6, 8), (1.4, 3.6), (0.4, 1)], 2.0, 1.2)
    else:
        m.disk(5.2, 10.4, 2.4, 3.6)
    g = m.outlined("]")
    return crop(g, (6, 8) if spread else (5.4, 8))


# ---------- 道具 ----------
def tree():
    """貓頭鷹睡覺的樹：寬 44、高 56，樹幹在 x 26，左邊伸出一根樹枝（高 28）。腳底中心 (26, 55)。"""
    w, h = 44, 56
    m = Mask(w, h)
    m.box(23, 20, 29, 55)            # 樹幹
    m.stroke([(24, 31), (14, 29), (4, 29)], 1.6, 1.1)    # 樹枝
    g = m.outlined("(")
    canopy = Mask(w, h)
    for cx, cy, r in ((26, 12, 11), (16, 16, 8), (36, 16, 8), (26, 4, 7), (20, 21, 6), (32, 21, 6)):
        canopy.disk(cx, cy, r, r * 0.85)
    cg = canopy.outlined(")")
    paint(cg, lambda x, y: y >= 17 or (x + y * 2) % 9 == 0, "|", ")")
    overlay(g, cg)
    for x, y in ((14, 12), (30, 8), (24, 16), (38, 14)):      # 小花
        if g[y][x] in ")|":
            g[y][x] = "P"
    return crop(g, (26, 55))


TREE_BRANCH = (6, 28)                 # 貓頭鷹站的位置（樹的框座標）
ZZZ = ["UUU", "..U", ".U.", "UUU"]


def gloom():
    """魷魚頭上的小烏雲，下面滴雨。"""
    m = Mask(14, 9)
    for cx, cy, r in ((4, 4, 2.6), (7, 3, 3.0), (10, 4.2, 2.4)):
        m.disk(cx, cy, r, r * 0.8)
    g = m.outlined("-")
    paint(g, lambda x, y: y >= 5, "v", "-")
    stamp(g, 4, 8, ["V"])
    stamp(g, 8, 8, ["V"])
    return crop(g, (7, 4))


def pieces():
    out = {}
    for kind in ("open", "happy", "dizzy"):
        out["ck_head_" + kind] = chick_head(kind)
        out["pg_head_" + kind] = penguin_head(kind)
        out["cr_neck_" + kind] = crane_neck(kind)
    for kind in ("sleep", "awake", "grumpy", "happy"):
        out["ow_head_" + kind] = owl_head(kind)
    out["ck_body"] = chick_body()
    out["pg_body"] = penguin_body()
    out["pg_flipper"] = penguin_flipper()
    out["cr_body"] = crane_body()
    out["cr_wing"] = crane_wing()
    for front in (False, True):
        for far in (False, True):
            out["cr_leg_" + ("front" if front else "back") + ("_far" if far else "")] = crane_leg(front, far)
    out["ow_body"] = owl_body()
    out["ow_wing"] = owl_wing(False)
    out["ow_wing_spread"] = owl_wing(True)
    for part in ("whole", "crack", "top", "bottom"):
        out["egg6_" + part] = egg(part)
    out["tree"] = tree()
    out["zzz"] = grid(ZZZ, (1.5, 2))
    out["gloom"] = gloom()
    return out


if __name__ == "__main__":
    import sys
    sys.stdout.reconfigure(encoding="utf-8")
    for name, p in pieces().items():
        print(name, p["x0"], p["y0"], len(p["rows"][0]), "x", len(p["rows"]), "pivot", p["pivot"])
