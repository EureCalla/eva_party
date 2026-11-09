"""第二集的動物與道具零件：狐獴、水獺、長頸鹿、大象（都畫成面向右的側面），茶葉蛋、名牌、問號。

每隻動物有自己的「角色框」（寬 x 高，腳底踩在最下面一列），零件的 x0/y0 與 pivot 都在這個框的座標系裡，
跟小貓的 44x34 角色框同一套用法：影片程式把框的左上角平移到世界座標，再依 pivot 轉各零件。
"""
import math

PAL = {
    "F": (217, 178, 124),   # 狐獴淺棕
    "G": (110, 74, 51),     # 狐獴深棕（眼圈、耳朵、尾巴尖）
    "J": (241, 221, 184),   # 淺米（肚子、口鼻）
    "O": (156, 107, 71),    # 水獺棕
    "I": (242, 207, 122),   # 長頸鹿黃
    "N": (201, 138, 75),    # 長頸鹿斑點
    "E": (185, 180, 194),   # 大象灰
    "D": (158, 152, 170),   # 大象深灰（耳朵、遠側的腳）
    "Z": (168, 112, 63),    # 茶葉蛋殼
    "z": (107, 66, 38),     # 茶葉蛋裂紋
}


# ---------- 形狀工具（每個角色框大小不同，所以不用 export_pieces 的固定 44x34） ----------
class Mask:
    def __init__(self, w, h):
        self.w, self.h = w, h
        self.m = [[False] * w for _ in range(h)]

    def disk(self, cx, cy, rx, ry=None):
        ry = rx if ry is None else ry
        for y in range(self.h):
            for x in range(self.w):
                if ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1:
                    self.m[y][x] = True

    def box(self, x0, y0, x1, y1):
        for y in range(max(0, y0), min(self.h, y1 + 1)):
            for x in range(max(0, x0), min(self.w, x1 + 1)):
                self.m[y][x] = True

    def stroke(self, pts, r0, r1=None, steps=40):
        """沿折線畫一串圓，半徑由 r0 漸變到 r1（脖子、尾巴、象鼻）。"""
        r1 = r0 if r1 is None else r1
        segs = list(zip(pts, pts[1:]))
        for i in range(steps + 1):
            u = i / steps
            k = min(len(segs) - 1, int(u * len(segs)))
            v = u * len(segs) - k
            (ax, ay), (bx, by) = segs[k]
            self.disk(ax + (bx - ax) * v, ay + (by - ay) * v, r0 + (r1 - r0) * u)

    def outlined(self, fill):
        # 圓的最外緣常會多出單獨一格的小凸點，先剔掉鄰居少於 2 格的點
        for y in range(self.h):
            for x in range(self.w):
                if self.m[y][x] and sum(
                    0 <= y + dy < self.h and 0 <= x + dx < self.w and self.m[y + dy][x + dx]
                    for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))
                ) < 2:
                    self.m[y][x] = False
        g = [["." for _ in range(self.w)] for _ in range(self.h)]
        for y in range(self.h):
            for x in range(self.w):
                if not self.m[y][x]:
                    continue
                edge = any(
                    not (0 <= y + dy < self.h and 0 <= x + dx < self.w and self.m[y + dy][x + dx])
                    for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))
                )
                g[y][x] = "o" if edge else fill
        return g


def paint(g, pred, color, only="."):
    """把符合 pred(x, y) 的內部格子（非描邊、非透明）塗成 color；only 指定只蓋哪些顏色。"""
    for y in range(len(g)):
        for x in range(len(g[0])):
            if g[y][x] not in ".o" and (only == "." or g[y][x] in only) and pred(x, y):
                g[y][x] = color


def stamp(g, x, y, rows):
    for j, row in enumerate(rows):
        for i, ch in enumerate(row):
            if ch != "." and 0 <= y + j < len(g) and 0 <= x + i < len(g[0]):
                g[y + j][x + i] = ch


def crop(g, pivot):
    ys = [y for y in range(len(g)) if any(c != "." for c in g[y])]
    xs = [x for x in range(len(g[0])) if any(g[y][x] != "." for y in range(len(g)))]
    x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
    rows = ["".join(g[y][x0:x1 + 1]) for y in range(y0, y1 + 1)]
    return {"x0": x0, "y0": y0, "rows": rows, "pivot": [round(pivot[0], 2), round(pivot[1], 2)]}


EYES = {
    "open": ["kh", "kk"],
    "happy": [".k.", "k.k"],
    "dizzy": ["k.k", ".k.", "k.k"],
}


def eye(g, x, y, kind):
    rows = EYES[kind]
    stamp(g, x - (1 if kind != "open" else 0), y - (1 if kind == "dizzy" else 0), rows)


# ---------- 狐獴（站直，16 x 28） ----------
MEERKAT = (16, 28)


def meerkat_body():
    m = Mask(*MEERKAT)
    m.disk(7, 17, 4.6, 8)
    m.box(4, 23, 6, 27)
    m.box(8, 23, 10, 27)
    m.stroke([(4, 22), (2, 25), (1, 27)], 1.6, 1.0)
    m.box(9, 13, 12, 15)            # 收在胸前的小手
    g = m.outlined("F")
    paint(g, lambda x, y: x >= 7 and 11 <= y <= 23, "J", "F")
    paint(g, lambda x, y: x <= 2 and y >= 26, "G")
    return crop(g, (7, 27))


def meerkat_head(kind):
    m = Mask(*MEERKAT)
    m.disk(7.5, 5.5, 4.2, 3.6)
    m.disk(11.5, 6.6, 2.6, 1.8)
    m.box(6, 8, 9, 10)              # 脖子
    g = m.outlined("F")
    stamp(g, 4, 3, ["GG", "G."])     # 耳朵
    paint(g, lambda x, y: 8 <= x <= 10 and 4 <= y <= 6, "G")   # 黑眼圈
    eye(g, 9, 5, kind)
    stamp(g, 14, 6, ["k"])
    paint(g, lambda x, y: x >= 10 and y >= 7, "J", "F")
    return crop(g, (7.5, 10))


# ---------- 水獺（站直，18 x 22） ----------
OTTER = (18, 22)


def otter_body():
    m = Mask(*OTTER)
    m.disk(8, 14, 5.2, 7)
    m.stroke([(4, 18), (1, 20.5)], 2.2, 1.4)
    m.box(5, 19, 7, 21)
    m.box(9, 19, 11, 21)
    g = m.outlined("O")
    paint(g, lambda x, y: x >= 8 and 9 <= y <= 19, "J", "O")
    return crop(g, (8, 21))


def otter_head(kind):
    m = Mask(*OTTER)
    m.disk(9, 4.8, 4.6, 4.0)
    m.disk(12.6, 6.4, 2.4, 1.8)
    m.disk(5.6, 1.6, 1.3, 1.3)       # 圓耳
    m.box(7, 7, 11, 9)
    g = m.outlined("O")
    paint(g, lambda x, y: x >= 11 and y >= 5, "J", "O")
    eye(g, 10, 3, kind)
    stamp(g, 14, 5, ["k"])
    return crop(g, (9, 9))


def otter_arm():
    m = Mask(*OTTER)
    m.box(10, 11, 13, 13)
    m.disk(14, 12, 1.4, 1.4)
    return crop(m.outlined("O"), (10, 12))


# ---------- 長頸鹿（30 x 56） ----------
GIRAFFE = (30, 56)


def giraffe_spots(g):
    spots = [(8, 33), (13, 31), (17, 35), (10, 37), (5, 36), (15, 39), (20, 33),
             (20, 27), (21, 22), (22, 17), (23, 13)]
    for sx, sy in spots:
        paint(g, lambda x, y, sx=sx, sy=sy: abs(x - sx) <= 1 and abs(y - sy) <= 1 and (x, y) != (sx + 1, sy + 1), "N", "I")


def giraffe_body():
    m = Mask(*GIRAFFE)
    m.disk(13, 35, 10, 6)
    m.stroke([(3.5, 33), (1.5, 41)], 0.8)
    g = m.outlined("I")
    stamp(g, 0, 41, ["GG", "GG"])
    giraffe_spots(g)
    return crop(g, (13, 41))


def giraffe_leg(front, far):
    m = Mask(*GIRAFFE)
    x = (17 if front else 6) + (2 if far else 0)
    m.box(x, 39, x + 2, 55)
    g = m.outlined("N" if far else "I")
    paint(g, lambda xx, y: y >= 53, "G")
    return crop(g, (x + 1, 40))


def giraffe_neck(kind):
    m = Mask(*GIRAFFE)
    m.stroke([(19, 34), (21, 20), (23, 9)], 3.2, 2.2)
    m.disk(24.5, 7, 4, 3.2)
    m.disk(27.6, 8.2, 2.4, 2.1)
    m.box(21, 1, 22, 5)             # 兩支角（一格寬會被 outlined 當成雜點剔掉，所以畫兩格）
    m.box(25, 1, 26, 5)
    m.disk(19.6, 5, 1.6, 1.0)        # 耳朵
    g = m.outlined("I")
    giraffe_spots(g)
    stamp(g, 21, 0, ["GG..GG"])
    paint(g, lambda x, y: x >= 26 and y >= 8, "J", "I")
    eye(g, 25, 5, kind)
    stamp(g, 29, 8, ["k"])
    for y in range(12, 33, 2):       # 鬃毛
        for x in range(GIRAFFE[0]):
            if g[y][x] == "o":
                g[y][x] = "G"
                break
    return crop(g, (19, 34))


# ---------- 大象（56 x 44） ----------
ELEPHANT = (56, 44)
TRUNK_PIVOT = (45.5, 21)
TRUNK_TIP = (50, 40)


def elephant_body():
    m = Mask(*ELEPHANT)
    m.disk(22, 26, 16, 11)
    m.stroke([(6.5, 24), (3.5, 32)], 0.8)
    g = m.outlined("E")
    stamp(g, 2, 32, ["oo", "oo"])
    paint(g, lambda x, y: y >= 33, "D", "E")
    return crop(g, (22, 37))


def elephant_leg(front, far):
    m = Mask(*ELEPHANT)
    x = (28 if front else 9) + (4 if far else 0)
    m.box(x, 32, x + 6, 43 - (1 if far else 0))
    g = m.outlined("D" if far else "E")
    if not far:
        stamp(g, x + 1, 42, ["c.c.c"])
    return crop(g, (x + 3, 33))


def elephant_head(kind):
    m = Mask(*ELEPHANT)
    m.disk(40, 18, 9, 9)
    m.box(42, 20, 47, 24)            # 象鼻根部
    g = m.outlined("E")
    eye(g, 43, 14, kind)
    paint(g, lambda x, y: 44 <= x <= 46 and 18 <= y <= 19, "b", "E")
    stamp(g, 45, 25, ["occ", ".oc"])  # 象牙
    return crop(g, (36, 22))


def elephant_ear():
    m = Mask(*ELEPHANT)
    m.disk(33.5, 19, 6.5, 8.5)
    g = m.outlined("D")
    paint(g, lambda x, y: ((x - 33.5) / 4.2) ** 2 + ((y - 19) / 6) ** 2 <= 1, "p", "D")
    return crop(g, (36, 13))


def elephant_trunk():
    m = Mask(*ELEPHANT)
    pts = [(46.5, 21.5), (48.5, 28), (49.5, 34), (TRUNK_TIP[0], TRUNK_TIP[1] - 1)]
    m.stroke(pts, 3.0, 1.9, steps=60)
    g = m.outlined("E")
    for y in range(26, 40, 3):        # 象鼻的皺摺
        xs = [x for x in range(ELEPHANT[0]) if g[y][x] == "E"]
        if xs:
            g[y][xs[0]] = "D"
            if len(xs) > 2:
                g[y][xs[1]] = "D"
    return crop(g, TRUNK_PIVOT)


# ---------- 道具 ----------
def egg(kind):
    """kind：shell 帶殼茶葉蛋、peeled 剝殼後（白底茶色花紋）、open 被吹空的蛋殼（上緣破口朝上）。"""
    m = Mask(7, 9)
    m.disk(3, 4.6, 3.1, 4.1)
    g = m.outlined("Z" if kind != "peeled" else "c")
    if kind == "peeled":
        for x, y in ((2, 2), (3, 3), (4, 3), (2, 5), (3, 6), (4, 5), (5, 6)):
            if g[y][x] == "c":
                g[y][x] = "Z"
    else:
        for x, y in ((2, 2), (3, 3), (4, 4), (2, 5), (4, 6), (3, 7)):
            if g[y][x] == "Z":
                g[y][x] = "z"
    if kind == "open":
        for y in range(0, 3):
            g[y] = ["."] * 7
        g[3] = ["o", "z", ".", "z", ".", "z", "o"]
        g[2] = [".", "o", ".", "o", ".", "o", "."]
    return crop(g, (3, 4.6))


NAME_TAG = [
    "...o...",
    "..o.o..",
    ".o...o.",
    "QQQQQQQ",
    "QLTLTLQ",
    "QLTTTLQ",
    "QLLTLLQ",
    "QQQQQQQ",
]

QUESTION = [
    ".TTT.",
    "TT.TT",
    "...TT",
    "..TT.",
    "..T..",
    ".....",
    "..T..",
]


def pieces():
    out = {}
    for kind in ("open", "happy", "dizzy"):
        out["mk_head_" + kind] = meerkat_head(kind)
    out["mk_body"] = meerkat_body()
    for kind in ("open", "happy"):
        out["ot_head_" + kind] = otter_head(kind)
        out["gf_neck_" + kind] = giraffe_neck(kind)
        out["el_head_" + kind] = elephant_head(kind)
    out["ot_body"] = otter_body()
    out["ot_arm"] = otter_arm()
    out["gf_body"] = giraffe_body()
    for front in (False, True):
        for far in (False, True):
            key = ("front" if front else "back") + ("_far" if far else "")
            out["gf_leg_" + key] = giraffe_leg(front, far)
            out["el_leg_" + key] = elephant_leg(front, far)
    out["el_body"] = elephant_body()
    out["el_ear"] = elephant_ear()
    out["el_trunk"] = elephant_trunk()
    for kind in ("shell", "peeled", "open"):
        out["egg_" + kind] = egg(kind)
    out["name_tag"] = {"x0": 0, "y0": 0, "rows": NAME_TAG, "pivot": [3, 0]}
    out["question"] = {"x0": 0, "y0": 0, "rows": QUESTION, "pivot": [2, 3]}
    return out


# 給影片程式用的常數（象鼻尖相對於關節的位置，用來把蛋殼黏在鼻尖）
TRUNK = {"pivot": TRUNK_PIVOT, "tip": TRUNK_TIP}


if __name__ == "__main__":
    import sys
    sys.stdout.reconfigure(encoding="utf-8")
    for name, p in pieces().items():
        print(name, p["x0"], p["y0"], len(p["rows"][0]), "x", len(p["rows"]), "pivot", p["pivot"])
        if name.endswith("_open") or name in ("gf_body", "el_body", "el_trunk", "egg_shell", "egg_open"):
            for r in p["rows"]:
                print("   ", r)
