"""平滑（一般動畫風）版小貓：沿用像素版的幾何與配色，以向量形狀抗鋸齒繪製，供和像素版比較。"""
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, str(Path(__file__).parent))
import cat_sprites as px  # noqa: E402

sys.stdout.reconfigure(encoding="utf-8")

K = 12          # 每個設計單位的像素數（與像素版 12 倍同尺寸，方便並排）
SS = 4          # 超取樣倍率
T = 0.42        # 描邊粗細（設計單位）
W, H = px.W, px.H
P = px.PAL


def S(v):
    return v * K * SS


class Pen:
    def __init__(self):
        self.img = Image.new("RGBA", (int(S(W)), int(S(H))), (0, 0, 0, 0))
        self.d = ImageDraw.Draw(self.img)

    def ell(self, cx, cy, rx, ry, c, grow=0.0):
        rx += grow
        ry += grow
        self.d.ellipse([S(cx - rx), S(cy - ry), S(cx + rx), S(cy + ry)], fill=P[c] if isinstance(c, str) else c)

    def tri(self, pts, c, grow=0.0):
        cx = sum(p[0] for p in pts) / 3
        cy = sum(p[1] for p in pts) / 3
        out = []
        for x, y in pts:
            dx, dy = x - cx, y - cy
            L = (dx * dx + dy * dy) ** 0.5 or 1
            out.append((S(x + dx / L * grow * 1.6), S(y + dy / L * grow * 1.6)))
        self.d.polygon(out, fill=P[c])

    def rrect(self, x0, y0, x1, y1, r, c, grow=0.0):
        self.d.rounded_rectangle(
            [S(x0 - grow), S(y0 - grow), S(x1 + grow), S(y1 + grow)], radius=S(r + grow), fill=P[c]
        )

    def arc(self, cx, cy, rx, ry, a0, a1, c, w=0.45):
        self.d.arc([S(cx - rx), S(cy - ry), S(cx + rx), S(cy + ry)], a0, a1, fill=P[c], width=int(S(w)))

    def line(self, pts, c, w=0.4):
        self.d.line([(S(x), S(y)) for x, y in pts], fill=P[c], width=int(S(w)), joint="curve")

    def done(self):
        return self.img.resize((int(W * K), int(H * K)), Image.LANCZOS)


def silhouette(pen, shapes, fill="w"):
    """先畫放大一圈的描邊色，再畫填色，得到乾淨的整體外輪廓。"""
    for kind, args in shapes:
        getattr(pen, kind)(*args, "o", T)
    for kind, args in shapes:
        getattr(pen, kind)(*args, fill)


def tail_shapes(x0, y0, x1, y1, bend, r):
    out = []
    for i in range(16):
        u = i / 15
        out.append(("ell", (x0 + (x1 - x0) * u, y0 + (y1 - y0) * u * u + bend * u * (1 - u), r, r)))
    return out


# ---------- 正面頭 ----------
def front_head(pen, cx, eye_r="open", eye_l="open"):
    silhouette(
        pen,
        [
            ("tri", ([(cx - 10, 8), (cx - 8.5, -0.5), (cx - 3, 3.5)],)),
            ("tri", ([(cx + 10, 8), (cx + 8.5, -0.5), (cx + 3, 3.5)],)),
            ("ell", (cx, 10.5, 12.3, 8.6)),
            ("ell", (cx - 10, 13.6, 3.2, 2.8)),
            ("ell", (cx + 10, 13.6, 3.2, 2.8)),
        ],
    )
    pen.tri([(cx - 8.6, 6.5), (cx - 8, 1.6), (cx - 4.6, 4)], "p")
    pen.tri([(cx + 8.6, 6.5), (cx + 8, 1.6), (cx + 4.6, 4)], "p")
    pen.ell(cx, 17.4, 8, 1.0, "s")
    for ex, kind in ((cx - 5.5, eye_l), (cx + 5.5, eye_r)):
        if kind == "open":
            pen.ell(ex, 11, 2.0, 2.4, "k")
            pen.ell(ex + 0.25, 11.3, 1.25, 1.6, "e")
            pen.ell(ex - 0.6, 10.2, 0.6, 0.6, "h")
        else:
            pen.arc(ex, 12.2, 2.0, 1.8, 200, 340, "k", 0.55)
    pen.ell(cx - 8.6, 14.4, 1.8, 0.9, "b")
    pen.ell(cx + 8.6, 14.4, 1.8, 0.9, "b")
    pen.tri([(cx - 1, 13.8), (cx + 1, 13.8), (cx, 14.9)], "n")
    pen.arc(cx - 0.9, 15.2, 0.95, 0.8, 0, 180, "o", 0.3)
    pen.arc(cx + 0.9, 15.2, 0.95, 0.8, 0, 180, "o", 0.3)


def front_sit():
    pen = Pen()
    silhouette(pen, tail_shapes(30, 30.5, 36, 20, 2, 1.7))
    silhouette(
        pen,
        [
            ("ell", (14.5, 28.4, 5.4, 4.0)),
            ("ell", (29.5, 28.4, 5.4, 4.0)),
            ("ell", (22, 24.5, 9.4, 7.8)),
            ("rrect", (17, 24, 21, 32, 1.6)),
            ("rrect", (23, 24, 27, 32, 1.6)),
        ],
    )
    pen.line([(21, 26), (21, 31.6)], "o", 0.35)
    pen.line([(23, 26), (23, 31.6)], "o", 0.35)
    pen.line([(19, 30.6), (19, 31.6)], "s", 0.3)
    pen.line([(25, 30.6), (25, 31.6)], "s", 0.3)
    front_head(pen, 22)
    return pen.done()


# ---------- 側面 ----------
def side_body(pen, belly=True, dressed=False):
    silhouette(pen, tail_shapes(13.5, 27, 5.5, 17, 0, 2.2))
    bx, by, br = (24.5, 24, 8.2) if belly else (21.5, 23.5, 5)
    body = [
        ("rrect", (16, 27, 20, 32, 1.2)),
        ("rrect", (22, 28, 26, 32, 1.2)),
        ("ell", (18.5, 31.5, 3.0, 1.3)),
        ("ell", (24.8, 31.5, 3.0, 1.3)),
        ("ell", (19, 23, 6.2, 7.5)),
        ("ell", (bx, by, br, br * 0.95)),
    ]
    silhouette(pen, body)
    pen.line([(21, 29.5), (21, 32)], "o", 0.35)
    # 肚子底部陰影（新月形）＋高光
    pen.ell(bx, by, br - 0.5, br * 0.95 - 0.5, "s")
    pen.ell(bx - 0.6, by - 1.1, br - 0.9, br * 0.95 - 1.4, "w")
    if belly:
        pen.ell(bx + 2.2, by - 4.2, 1.3, 0.9, "h")
    if dressed:
        layer = Pen()
        for kind, args in body[4:]:
            getattr(layer, kind)(*args, "d", T)
        for kind, args in body[4:]:
            getattr(layer, kind)(*args, "r")
        layer.ell(bx - 0.4, by - 0.8, br - 1.2, br * 0.95 - 1.4, "r")
        layer.ell(bx + 2.4, by - 3.8, 1.6, 2.4, "l")
        band = Image.new("L", layer.img.size, 0)
        ImageDraw.Draw(band).rectangle([0, S(17.2), layer.img.size[0], S(29.4)], fill=255)
        mask = Image.composite(layer.img.split()[3], Image.new("L", layer.img.size, 0), band)
        pen.img.paste(layer.img, (0, 0), mask)
        # 腰帶、金扣、白毛滾邊
        pen.rrect(13.2, 18.0, 25.5, 19.1, 0.4, "g")
        pen.rrect(21.7, 17.8, 23.0, 19.3, 0.2, "y")
        for i in range(10):
            pen.ell(13.8 + i * 2.05, 29.4, 1.25, 1.0, "w")
    return bx, by, br


def side_head(pen, eye="open"):
    silhouette(
        pen,
        [
            ("tri", ([(11.5, 7), (13.5, -0.5), (19, 3)],)),
            ("tri", ([(20, 3), (24.5, -1), (27.5, 6)],)),
            ("ell", (20, 10, 10, 8.4)),
            ("ell", (28.4, 12.6, 2.6, 2.2)),
        ],
    )
    pen.tri([(14, 4.6), (14.4, 1.4), (17, 3.4)], "p")
    pen.tri([(22.2, 3.6), (24.2, 0.8), (25.8, 5)], "p")
    pen.ell(20, 17.4, 6.5, 0.9, "s")
    if eye == "open":
        pen.ell(24.4, 9.6, 1.5, 2.1, "k")
        pen.ell(24.6, 9.9, 0.9, 1.4, "e")
        pen.ell(24.0, 8.8, 0.5, 0.5, "h")
    else:
        pen.arc(24.4, 10.8, 1.6, 1.5, 200, 340, "k", 0.55)
    pen.ell(25, 12.8, 1.3, 0.7, "b")
    pen.tri([(30.4, 11.2), (31.2, 11.6), (30.4, 12.2)], "n")
    pen.arc(29.6, 13.1, 0.8, 0.7, 20, 160, "o", 0.28)


def arm(pen, dressed, y=18.0):
    if dressed:
        pen.rrect(19.4, y, 26.6, y + 2.5, 1.2, "d")
        pen.rrect(19.4, y, 24.4, y + 2.1, 1.0, "r")
        pen.ell(25.4, y + 1.2, 1.4, 1.2, "o")
        pen.ell(25.4, y + 1.1, 1.1, 0.95, "w")
    else:
        pen.rrect(19.4, y, 26.4, y + 2.5, 1.2, "o")
        pen.rrect(19.4, y, 26.0, y + 2.0, 1.0, "w")


def envelope(pen, x, y):
    pen.rrect(x, y, x + 6.8, y + 4.4, 0.4, "m")
    pen.rrect(x + 0.35, y + 0.35, x + 6.45, y + 4.05, 0.3, "c")
    pen.line([(x + 0.5, y + 0.5), (x + 3.4, y + 2.6), (x + 6.3, y + 0.5)], "m", 0.3)
    pen.ell(x + 3.4, y + 2.9, 0.75, 0.7, "r")


def sparkle(pen, x, y, r):
    pen.d.polygon(
        [(S(x), S(y - r)), (S(x + r * 0.22), S(y - r * 0.22)), (S(x + r), S(y)), (S(x + r * 0.22), S(y + r * 0.22)),
         (S(x), S(y + r)), (S(x - r * 0.22), S(y + r * 0.22)), (S(x - r), S(y)), (S(x - r * 0.22), S(y - r * 0.22))],
        fill=P["y"],
    )
    pen.ell(x, y, r * 0.18, r * 0.18, "h")


def heart(pen, x, y, r):
    pen.ell(x - r * 0.5, y, r * 0.55, r * 0.55, "r")
    pen.ell(x + r * 0.5, y, r * 0.55, r * 0.55, "r")
    pen.tri([(x - r * 1.02, y + r * 0.2), (x + r * 1.02, y + r * 0.2), (x, y + r * 1.4)], "r")


def side_belly():
    pen = Pen()
    side_body(pen, belly=True)
    arm(pen, False)
    side_head(pen, "happy")
    heart(pen, 33, 4, 1.6)
    return pen.done()


def side_dress():
    pen = Pen()
    side_body(pen, belly=True, dressed=True)
    side_head(pen)
    envelope(pen, 26, 15)
    arm(pen, True)
    return pen.done()


def side_wink():
    pen = Pen()
    side_body(pen, belly=True, dressed=True)
    front_head(pen, 21, eye_r="wink")
    envelope(pen, 27, 20)
    arm(pen, True, 20.5)
    sparkle(pen, 36, 4, 2.4)
    return pen.done()


def main():
    pix = {name: g for name, g in px.poses()}
    rows = [
        ("① 正面坐姿", pix["① 基本坐姿"], front_sit()),
        ("④ 側面圓肚子", pix["④ 側面圓肚子"], side_belly()),
        ("⑤ 洋裝＋邀請函", pix["⑤ 側面洋裝＋邀請函"], side_dress()),
        ("⑥ 回頭眨眼", pix["⑥ 側面回頭眨眼"], side_wink()),
    ]
    cw, ch = W * K, H * K
    pad = 40
    label_w = 170
    sheet = Image.new("RGB", (label_w + pad + len(rows) * (cw + pad), 2 * (ch + 60) + pad * 2), (91, 58, 42))
    d = ImageDraw.Draw(sheet)
    try:
        font = ImageFont.truetype("msjhbd.ttc", 30)
        big = ImageFont.truetype("msjhbd.ttc", 34)
    except OSError:
        font = big = ImageFont.load_default()
    d.text((pad, pad + ch / 2 - 20), "A 像素版", fill=(255, 211, 107), font=big)
    d.text((pad, pad + ch + 60 + ch / 2 - 20), "B 一般動畫", fill=(255, 211, 107), font=big)
    for i, (name, grid, smooth) in enumerate(rows):
        x = label_w + pad + i * (cw + pad)
        pimg = px.render(grid, K)
        sheet.paste(pimg, (x, pad), pimg)
        sheet.paste(smooth, (x, pad + ch + 60), smooth)
        tw = d.textlength(name, font=font)
        d.text((x + (cw - tw) / 2, pad + 2 * ch + 70), name, fill=(255, 244, 214), font=font)
    out = Path(__file__).with_name("compare_pixel_vs_smooth_v1.png")
    sheet.save(out)
    print(out, sheet.size)


if __name__ == "__main__":
    main()
