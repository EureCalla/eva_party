"""Climbing minigame ("往上跳跳樂") for the gift exchange: one in-memory match, never written to the DB while playing.

Everyone starts on the ground floor and jumps up short platforms (one or two
per floor, one-way: you pass through from below and land from above). The
screen only moves up, when the highest player lands on a new floor; whoever
drops below the bottom of the screen is out. Walking into someone knocks
them sideways, so players can push each other off. When time is up (or at
most one is left) the players still in rank by floor, ties random; players
who fell out rank after them, the later the better.

Players move themselves locally and report their position (checked here for
speed, jump height and footing, like StoneBattle); knock-backs, falling out,
the camera, floors and the result are decided here. Same lazy fixed-step
clock as the other minigames, no background thread.
"""

import math
import random
import threading
from collections import deque
from typing import Any

# 座標單位是「格」；y 往上為正，(x, y) 是腳底中央。第 k 層平台的上緣在 y = k × FLOOR_H
WIDTH = 24.0  # 場地寬（左右是牆）
FLOOR_H = 3.0  # 每層高度
BODY_W = 0.8  # 角色寬
BODY_H = 0.8  # 角色高
SPEED = 6.0  # 走速（格/秒）
GRAVITY = 30.0  # 重力（格/秒²）
JUMP_V = 15.0  # 起跳速度；最高約 JUMP_V² / 2g = 3.75 格
PUSH_V = 9.0  # 被撞到時的水平擊退速度
PUSH_UP = 4.0  # 被撞到時往上彈一點
PUSH_COOLDOWN = 0.3  # 同一對人多久才能再撞一次
PLATFORM_W = (3, 5)  # 平台寬（格）
PLATFORM_REACH = 2.5  # 上下兩層平台邊緣的水平距離最多多少（一跳約可橫移 4 格，留餘裕）
GEN_AHEAD = 10  # 比最高的人多產生幾層平台
CAM_BELOW = 2  # 畫面底線保留最高者下面幾層
CAM_MARGIN = 1.0  # 畫面底線再往下留多少
VIEW_H = 20.0  # 畫面高度（格）；前端照這個畫
DT = 0.025  # 模擬步長（秒）
STALE_SEC = 0.5  # 多久沒回報就由伺服器代為下墜
SPEED_SLACK = 1.3  # 速度檢查的寬容倍數
MOVE_BUDGET_CAP = (SPEED + PUSH_V + 2.4) * 1.0  # 移動額度最多累積 1 秒（含站在移動地板上）
RISE_TOL = 0.6  # 高度檢查的寬容（格）
FOOT_TOL = 0.15  # 判斷腳下有沒有東西的寬容（格）
FRAME_EVERY = 0.1  # 直播緩衝每幾秒存一格
FRAME_KEEP = 4.0  # 直播緩衝保留幾秒
# 特殊地板（8 樓起）：左右移動、或中間週期性開洞；位置與開關都是「開打後經過秒數」的函式，前端算出來一樣
SPECIAL_FROM = 8  # 從幾樓開始出現
SPECIAL_BASE = 0.2  # 8 樓起每塊平台是特殊地板的機率
SPECIAL_STEP = 0.1  # 每往上 SPECIAL_EVERY 層加多少
SPECIAL_EVERY = 5
SPECIAL_MAX = 0.6
MOVE_AMP = 3.0  # 移動地板左右各 3 格
MOVE_PERIOD = 8.0  # 來回一次 8 秒（單趟約 4 秒）
MOVE_SPEED_MAX = MOVE_AMP * 2 * math.pi / MOVE_PERIOD  # 移動地板最快速度（約 2.4 格/秒）
HOLE_PLATFORM_W = 5.0  # 開洞地板寬
HOLE_W = 1.6  # 中間洞寬
HOLE_CLOSED = 2.5  # 關著的秒數（最後 HOLE_WARN 秒閃紅）
HOLE_OPEN = 1.0  # 開著的秒數
HOLE_WARN = 0.6
TIME_TOLS = (0.0, -0.12, -0.25, 0.1)  # 判斷腳下時往前後多看幾個時間點（網路延遲、時鐘誤差）
NORMAL, MOVING, HOLE = 0, 1, 2


def gap(a0: float, a1: float, b0: float, b1: float) -> float:
    """Return the horizontal gap between spans a0..a1 and b0..b1 (0 when they overlap)."""
    return max(0.0, b0 - a1, a0 - b1)


def climb_info() -> dict[str, Any]:
    """Return the constants the page needs to run the same movement locally."""
    return {
        "w": WIDTH, "floor_h": FLOOR_H, "body_w": BODY_W, "body_h": BODY_H, "speed": SPEED, "gravity": GRAVITY,
        "jump_v": JUMP_V, "push_v": PUSH_V, "view_h": VIEW_H, "frame_every": FRAME_EVERY,
        "move_amp": MOVE_AMP, "move_period": MOVE_PERIOD, "hole_w": HOLE_W,
        "hole_closed": HOLE_CLOSED, "hole_open": HOLE_OPEN, "hole_warn": HOLE_WARN,
    }


def special_chance(floor: int) -> float:
    """Return how likely a platform on ``floor`` is a moving or holed one (0 below SPECIAL_FROM)."""
    if floor < SPECIAL_FROM:
        return 0.0
    return min(SPECIAL_MAX, SPECIAL_BASE + SPECIAL_STEP * ((floor - SPECIAL_FROM) // SPECIAL_EVERY))


def platform_offset(pf: list[float], tau: float) -> float:
    """Return how far a moving platform has slid from its base at ``tau`` seconds into play (0 for others)."""
    if pf[3] != MOVING:
        return 0.0
    return MOVE_AMP * math.sin(2 * math.pi * (tau + pf[4]) / MOVE_PERIOD)


def platform_velocity(pf: list[float], tau: float) -> float:
    """Return a moving platform's sideways speed at ``tau`` (0 for others)."""
    if pf[3] != MOVING:
        return 0.0
    return MOVE_SPEED_MAX * math.cos(2 * math.pi * (tau + pf[4]) / MOVE_PERIOD)


def hole_state(pf: list[float], tau: float) -> str:
    """Return closed / warn / open for a holed platform at ``tau`` (others are always closed)."""
    if pf[3] != HOLE:
        return "closed"
    u = (tau + pf[4]) % (HOLE_CLOSED + HOLE_OPEN)
    if u >= HOLE_CLOSED:
        return "open"
    return "warn" if u >= HOLE_CLOSED - HOLE_WARN else "closed"


def solid_spans(pf: list[float], tau: float) -> list[tuple[float, float]]:
    """Return the parts of a platform you can stand on at ``tau``: one span, or two while its hole is open."""
    x0, x1 = pf[1], pf[2]
    if pf[3] == HOLE and hole_state(pf, tau) == "open":
        c = (x0 + x1) / 2
        return [(x0, c - HOLE_W / 2), (c + HOLE_W / 2, x1)]
    off = platform_offset(pf, tau)
    return [(x0 + off, x1 + off)]


class ClimbBattle:
    """One climbing match: ``prep_sec`` to read the rules, then at most ``play_sec`` of play.

    Times are epoch seconds. ``finished_at`` is set when time runs out or at
    most one player is left; ``ranking`` and ``winner`` are then final.
    """

    def __init__(
        self, players: list[dict[str, Any]], prep_epoch: float, prep_sec: float, play_sec: float,
        rng: random.Random | None = None,
    ) -> None:
        """Line ``players`` ([{id, name, label}]) up on the ground floor and lay out the first floors."""
        self.rng = rng or random.SystemRandom()
        self.lock = threading.Lock()
        self.play_start = prep_epoch + prep_sec
        self.play_end = self.play_start + play_sec
        self.t = self.play_start  # 模擬時間
        self.finished_at: float | None = None
        self.ranking: list[dict[str, Any]] | None = None
        self.roster = [{"id": p["id"], "name": p["name"], "label": p.get("label")} for p in players]
        self.players: dict[int, dict[str, Any]] = {}
        n = max(1, len(players))
        for i, p in enumerate(players):
            x = WIDTH * (i + 1) / (n + 1)
            self.players[p["id"]] = {
                "id": p["id"], "x": x, "y": 0.0, "vx": 0.0, "vy": 0.0, "face": 1 if x < WIDTH / 2 else -1,
                "grounded": True, "floor": 0, "support_y": 0.0, "alive": True, "out_at": None,
                "seq": -1, "checked_at": self.play_start, "budget": 0.5, "seen_at": self.play_start,
                "move": 0, "kicks": [], "kick_seq": 0,
            }
        self.platforms: list[list[float]] = []  # [層, 左緣, 右緣, 種類, 相位]；第 0 層是整排地板，不放在這裡
        self.top_built = 0
        self._build_to(GEN_AHEAD)
        self.camera = -CAM_MARGIN  # 畫面底線（只往上）
        self.top_floor = 0
        self.bumped: dict[tuple[int, int], float] = {}  # (撞人的, 被撞的) → 上次撞到的時間
        self.frames: deque[dict[str, Any]] = deque()
        self.next_frame = self.play_start

    # ---------- 場地 ----------

    def _build_to(self, floor: int) -> None:
        """Lay out platforms up to ``floor``; every platform has one on the next floor within jumping reach.

        下一層先替每塊「還沒有跳得到的平台」的下層平台各放一塊（最多兩塊），所以不會走進死路；
        只放了一塊時，再隨機（1/3）多放一塊。
        """
        while self.top_built < floor:
            k = self.top_built + 1
            below = [(p[1], p[2]) for p in self.platforms if p[0] == k - 1] or [(0.0, WIDTH)]
            # 移動地板兩側要多留空間，有時第二塊放不下 → 整層重來；試 10 次都不行就只放一般平台
            for attempt in range(11):
                special = attempt < 10
                placed: list[list[float]] = []
                order = below[:]
                self.rng.shuffle(order)
                for b0, b1 in order:
                    if len(placed) < 2 and not any(gap(b0, b1, q[1], q[2]) <= PLATFORM_REACH for q in placed):
                        self._place_near(k, b0, b1, placed, special)
                if len(placed) == 1 and self.rng.random() < 1 / 3:
                    b0, b1 = self.rng.choice(below)
                    self._place_near(k, b0, b1, placed, special)
                if placed and all(any(gap(b0, b1, q[1], q[2]) <= PLATFORM_REACH for q in placed) for b0, b1 in below):
                    break
            self.platforms.extend(placed)
            self.top_built = k

    def _place_near(self, k: int, b0: float, b1: float, placed: list[list[float]], special: bool = True) -> None:
        """Add a platform on floor ``k`` within reach of the platform b0..b1 below, clear of ``placed``.

        8 樓起有機率是特殊地板：移動地板（3～4 格寬，左右滑動範圍都在場內）或開洞地板（5 格寬）。
        基準位置跳得到，移動地板就是在來回途中一定有跳得到的時候。同層兩塊之間另外留出移動範圍。
        特殊地板放不下時改放一般平台。
        """
        kinds = [NORMAL]
        if special and self.rng.random() < special_chance(k):
            kinds.insert(0, self.rng.choice((MOVING, HOLE)))
        for kind in kinds:
            for _try in range(40):
                if kind == HOLE:
                    w = HOLE_PLATFORM_W
                elif kind == MOVING:
                    w = float(self.rng.randint(3, 4))
                else:
                    w = float(self.rng.randint(*PLATFORM_W))
                edge = MOVE_AMP if kind == MOVING else 0.0  # 移動地板滑到最邊也不能出牆
                lo = max(edge, b0 - PLATFORM_REACH - w)
                hi = min(WIDTH - w - edge, b1 + PLATFORM_REACH)  # 只在場內取，不夾到牆邊
                if lo > hi:
                    continue
                x0 = round(self.rng.uniform(lo, hi), 2)
                x1 = round(x0 + w, 2)
                clear = [2 + MOVE_AMP * ((kind == MOVING) + (q[3] == MOVING)) for q in placed]
                if gap(b0, b1, x0, x1) <= PLATFORM_REACH and all(
                    x0 > q[2] + c or x1 < q[1] - c for q, c in zip(placed, clear)
                ):
                    period = MOVE_PERIOD if kind == MOVING else HOLE_CLOSED + HOLE_OPEN
                    placed.append([k, x0, x1, kind, round(self.rng.uniform(0, period), 2) if kind else 0.0])
                    return

    def _tau(self, at: float | None = None) -> float:
        """Return seconds into play at ``at`` (default: the simulation time); platforms move by this clock."""
        return (self.t if at is None else at) - self.play_start

    def _platform_at(self, x: float, y: float, taus: tuple[float, ...] | list[float]) -> list[float] | None:
        """Return the platform under the feet (x, y) at any of the times ``taus``, or None (ground not included)."""
        half = BODY_W / 2
        for pf in self.platforms:
            if abs(y - pf[0] * FLOOR_H) > FOOT_TOL:
                continue
            for tau in taus:
                if any(x + half > a and x - half < b for a, b in solid_spans(pf, tau)):
                    return pf
        return None

    def _platform_under(self, x: float, y: float, taus: tuple[float, ...] | list[float] | None = None) -> int | None:
        """Return the floor whose surface is at the feet (x, y), or None; floor 0 is the whole ground.

        ``taus`` are the play times to check (default: now in the simulation); reports check a few
        times around their arrival so network delay does not count as missing footing.
        """
        if abs(y) <= FOOT_TOL:
            return 0
        pf = self._platform_at(x, y, (self._tau(),) if taus is None else taus)
        return pf[0] if pf is not None else None

    def _head_under(self, p: dict[str, Any], x: float, y: float) -> bool:
        """Return True when the feet (x, y) rest on another player's head."""
        for q in self.players.values():
            if q is p or not q["alive"]:
                continue
            if abs(y - (q["y"] + BODY_H)) <= FOOT_TOL * 2 and abs(x - q["x"]) < BODY_W + 0.1:
                return True
        return False

    # ---------- 時間推進 ----------

    def phase(self, now: float) -> str:
        """Return prep / play / over."""
        if self.finished_at is not None:
            return "over"
        return "prep" if now < self.play_start else "play"

    def advance(self, now: float) -> None:
        """Run the simulation up to ``now``."""
        with self.lock:
            self._advance(now)

    def _advance(self, now: float) -> None:
        """Step until ``now`` (or the end of play); caller holds the lock."""
        end = min(now, self.play_end)
        while self.finished_at is None and self.t + DT <= end + 1e-9:
            self._step()
        if self.finished_at is None and now >= self.play_end:
            self._finish(self.play_end)

    def _step(self) -> None:
        """Advance one fixed step: players who stopped reporting fall, the screen catches up, falling out, frames."""
        self.t += DT
        for p in self.players.values():
            if p["alive"] and self.t - p["seen_at"] > STALE_SEC:
                self._fall(p)
        for p in self.players.values():
            if p["alive"] and p["y"] + BODY_H < self.camera:
                p["alive"] = False
                p["out_at"] = self.t
                print(f"[climbgame] player {p['id']} fell out at floor {p['floor']}")
        self._check_end(self.t)
        if self.t >= self.next_frame:
            self.next_frame += FRAME_EVERY
            self.frames.append(self._frame())
            while self.frames and self.frames[0]["t"] < self.t - FRAME_KEEP:
                self.frames.popleft()

    def _fall(self, p: dict[str, Any]) -> None:
        """Move a player who is not reporting: knock-back slides, gravity pulls, platforms catch them."""
        p["vx"] *= math.exp(-5 * DT)
        tau = self._tau()
        carry = 0.0
        if p["grounded"]:
            pf = self._platform_at(p["x"], p["y"], (tau,))
            carry = platform_velocity(pf, tau) if pf is not None else 0.0  # 站在移動地板上跟著走
        p["x"] = min(max(p["x"] + (p["vx"] + carry) * DT, BODY_W / 2), WIDTH - BODY_W / 2)
        on = self._platform_under(p["x"], p["y"])
        if on is not None and p["vy"] <= 0:
            p["vy"], p["grounded"] = 0.0, True
            return
        p["grounded"] = False
        prev = p["y"]
        p["vy"] -= GRAVITY * DT
        p["y"] += p["vy"] * DT
        if p["vy"] <= 0:
            half = BODY_W / 2
            under = [
                q[0] for q in self.platforms
                if any(p["x"] + half > a and p["x"] - half < b for a, b in solid_spans(q, tau))
            ]
            for k in [0] + under:
                top = k * FLOOR_H
                if prev >= top >= p["y"]:
                    p["y"], p["vy"], p["grounded"] = top, 0.0, True
                    self._stand(p, k)
                    break

    def _stand(self, p: dict[str, Any], floor: int) -> None:
        """A player is standing on ``floor``: record it, move the screen up for a new top floor, build ahead."""
        p["floor"] = floor
        p["support_y"] = floor * FLOOR_H
        if floor > self.top_floor:
            self.top_floor = floor
            self.camera = max(self.camera, (floor - CAM_BELOW) * FLOOR_H - CAM_MARGIN)
            self._build_to(floor + GEN_AHEAD)

    def _check_end(self, at: float) -> None:
        """End early when at most one player is left."""
        if self.finished_at is None and sum(1 for p in self.players.values() if p["alive"]) <= 1:
            self._finish(at)

    def _finish(self, at: float) -> None:
        """Rank everyone and freeze the match.

        Players still in rank first by floor (ties random); players who fell
        out follow, the later they fell the better (same moment: random).
        """
        self.finished_at = at
        order = list(self.players.values())
        self.rng.shuffle(order)  # 同分時隨機
        order.sort(key=lambda p: (0, -p["floor"]) if p["alive"] else (1, -(p["out_at"] or 0.0)))
        names = {r["id"]: r["name"] for r in self.roster}
        self.ranking = [
            {"rank": i + 1, "id": p["id"], "name": names[p["id"]], "floor": p["floor"], "alive": p["alive"]}
            for i, p in enumerate(order)
        ]
        self.frames.append(self._frame())
        print(f"[climbgame] finished, winner {self.winner}")

    @property
    def winner(self) -> int | None:
        """Return the winner's player id once the match is over."""
        return self.ranking[0]["id"] if self.ranking else None

    # ---------- 玩家操作 ----------

    def report(
        self, pid: int, x: float, y: float, vy: float, grounded: bool, face: int, move: int, now: float,
        seq: int | None = None, have: int = 0, kick_ack: int = 0, land: tuple[float, float] | None = None,
    ) -> dict[str, Any] | None:
        """Take a player's own position, then return the live snapshot (None if not in this match).

        A move that is too fast, too high, or claims footing where there is
        none is refused and the snapshot carries ``corrected`` so the client
        snaps back. Reports carry an increasing ``seq``; an older one is
        ignored. Walking into someone (``move`` toward them) knocks them away;
        the knock-backs a player has not acknowledged (``kick_ack``) ride along
        in ``kicks``. ``have`` is how many platforms the page already has.
        ``land`` is where the player last landed: players often jump again the
        moment they land, between two reports, so the landing is checked here
        on its own to raise their jump height and floor.
        """
        with self.lock:
            self._advance(now)
            p = self.players.get(pid)
            if p is None:
                return None
            p["kicks"] = [k for k in p["kicks"] if k[0] > kick_ack]
            corrected = False
            if self.phase(now) == "play" and p["alive"]:
                p["seen_at"] = now
                if seq is None or seq > p["seq"]:
                    if seq is not None:
                        p["seq"] = seq
                    if land is not None:
                        self._landed(p, land[0], land[1], now)
                    corrected = not self._accept(p, x, y, vy, grounded, now)
                    p["move"] = max(-1, min(1, int(move)))
                    if face in (-1, 1):
                        p["face"] = face
                    if not corrected:
                        self._bump(p)
                    self._check_end(now)
            else:
                corrected = True  # 準備中／淘汰後位置以伺服器為準
            snap = self._snapshot(now, have)
            snap["corrected"] = corrected
            snap["kicks"] = p["kicks"]
            return snap

    def _landed(self, p: dict[str, Any], x: float, y: float, now: float) -> None:
        """Take the player's last landing spot if it is new, reachable and really has footing there."""
        if p.get("land") == (x, y):
            return
        p["land"] = (x, y)
        if y > p["support_y"] + JUMP_V ** 2 / (2 * GRAVITY) + BODY_H + RISE_TOL:
            return  # 比站過的地方高太多，不採用
        if abs(x - p["x"]) > MOVE_BUDGET_CAP:
            return
        tau = self._tau(now)
        floor = self._platform_under(x, y, [tau - 0.05 * i for i in range(14)] + [tau + 0.1])  # 落地可能是 0.6 秒前
        if floor is not None:
            self._stand(p, floor)
        elif self._head_under(p, x, y):
            p["support_y"] = y

    def _accept(self, p: dict[str, Any], x: float, y: float, vy: float, grounded: bool, now: float) -> bool:
        """Move the player to (x, y) if it is fast and high enough to be real and the footing exists."""
        rate = (SPEED + PUSH_V + MOVE_SPEED_MAX) * SPEED_SLACK
        p["budget"] = min(MOVE_BUDGET_CAP, p["budget"] + rate * max(0.0, now - p["checked_at"]))
        p["checked_at"] = now
        if not (BODY_W / 2 - 0.01 <= x <= WIDTH - BODY_W / 2 + 0.01) or not math.isfinite(y):
            return False
        dx = abs(x - p["x"])
        if dx > p["budget"] + 0.05:
            return False
        if y > p["support_y"] + JUMP_V ** 2 / (2 * GRAVITY) + BODY_H + RISE_TOL:
            return False  # 比站過的地方跳得還高
        floor = None
        if grounded:
            floor = self._platform_under(x, y, [self._tau(now) + d for d in TIME_TOLS])
            if floor is None and not self._head_under(p, x, y):
                return False  # 說站穩了，腳下卻沒有東西
        p["budget"] -= dx
        p["x"], p["y"], p["vy"], p["grounded"] = x, y, vy, grounded
        p["vx"] = 0.0  # 自己在回報時由本機移動；vx 只在伺服器代為下墜時用
        if grounded:
            if floor is not None:
                self._stand(p, floor)
            else:
                p["support_y"] = y  # 站在別人頭上：可以從這裡起跳，但不算新的一層
        return True

    def _bump(self, p: dict[str, Any]) -> None:
        """Knock away whoever ``p`` is walking into (one bump per pair per cooldown)."""
        if p["move"] == 0:
            return
        for q in self.players.values():
            if q is p or not q["alive"]:
                continue
            dx = q["x"] - p["x"]
            if abs(dx) > BODY_W + 0.12 or abs(q["y"] - p["y"]) > BODY_H * 0.8:
                continue
            direction = 1 if dx > 0 else -1 if dx < 0 else p["move"]
            if direction != p["move"]:
                continue
            key = (p["id"], q["id"])
            if self.t - self.bumped.get(key, -1e9) < PUSH_COOLDOWN:
                continue
            self.bumped[key] = self.t
            q["kick_seq"] += 1
            q["kicks"].append([q["kick_seq"], direction * PUSH_V, PUSH_UP])
            q["kicks"] = q["kicks"][-8:]
            # 被撞的人沒在回報（伺服器代為下墜）時，直接套用擊退
            q["vx"] = direction * PUSH_V
            if self.t - q["seen_at"] > STALE_SEC:
                q["vy"], q["grounded"] = PUSH_UP, False
            print(f"[climbgame] {p['id']} bumped {q['id']}")

    # ---------- 畫面資料 ----------

    def _frame(self) -> dict[str, Any]:
        """Return a compact picture: [id, x, y, face, floor, alive, grounded] per player, plus the screen bottom."""
        return {
            "t": round(self.t, 3),
            "cam": round(self.camera, 2),
            "p": [
                [p["id"], round(p["x"], 2), round(p["y"], 2), p["face"], p["floor"], int(p["alive"]), int(p["grounded"])]
                for p in self.players.values()
            ],
        }

    def _meta(self, now: float, have: int = 0) -> dict[str, Any]:
        """Return timing, roster, the platforms the page does not have yet and (once over) the ranking."""
        return {
            "game": "climb", "now": now, "phase": self.phase(now), "play_start": self.play_start,
            "play_end": self.play_end, "finished_at": self.finished_at, "roster": self.roster, "ranking": self.ranking,
            "cfg": climb_info(), "top_floor": self.top_floor,
            "pf_from": max(0, have), "platforms": self.platforms[max(0, have):],
        }

    def _snapshot(self, now: float, have: int = 0) -> dict[str, Any]:
        """Return the live view for players: meta plus the current frame."""
        return {**self._meta(now, have), "frame": self._frame()}

    def watch(self, now: float, since: float) -> dict[str, Any]:
        """Return the spectator view: buffered frames newer than ``since`` (played back with a delay)."""
        with self.lock:
            self._advance(now)
            frames = [f for f in self.frames if f["t"] > since]
            return {**self._meta(now), "frames": frames, "frame": self._frame()}
