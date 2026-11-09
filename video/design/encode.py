import re
import sys
from pathlib import Path

import cv2

src = Path(sys.argv[1])
out = Path(sys.argv[2])
frames = sorted(
    src.glob("at-*s.png"),
    key=lambda p: float(re.match(r"at-([\d.]+)s\.png", p.name).group(1)),
)
print("frames:", len(frames))
first = cv2.imread(str(frames[0]))
h, w = first.shape[:2]
writer = None
for codec in ("avc1", "H264", "mp4v"):
    vw = cv2.VideoWriter(str(out), cv2.VideoWriter_fourcc(*codec), 30, (w, h))
    if vw.isOpened():
        writer = vw
        print("codec:", codec)
        break
if writer is None:
    sys.exit("no usable codec")
for f in frames:
    writer.write(cv2.imread(str(f)))
writer.release()
print("written:", out, out.stat().st_size)
