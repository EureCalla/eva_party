"""Stone-throwing minigame for the gift exchange: one in-memory match, never written to the DB while playing.

Players report their own position (client-side movement, checked here for
speed and walls); hits, pickups, spawns, monsters and the result are decided
here. Gifts only come from black monsters: every stone that hits one drops a
gift. Monsters eat stones on the ground to refill their fire and breathe it
at players (fire hurts like a stone). Idle players just stand still.
Time advances lazily in fixed steps whenever someone calls in, the same
no-background-thread approach as the exchange rounds.
"""

import math
import random
import threading
from collections import deque
from typing import Any

from countgame import BOT_NAMES

# 俯視地圖 32×20：# 牆、T 聖誕樹、S 雪人、G 禮物堆（都擋路也擋石頭），. 空地
MAP_ROWS: list[str] = [
    "################################",
    "#..............................#",
    "#..T.......S..........S......T.#",
    "#..............................#",
    "#.....GG..............GG.......#",
    "#.....GG..............GG.......#",
    "#..............................#",
    "#..........T.........T.........#",
    "#..............................#",
    "#..S...........##..........S...#",
    "#..............##..............#",
    "#..............................#",
    "#..........T.........T.........#",
    "#..............................#",
    "#.....GG..............GG.......#",
    "#.....GG..............GG.......#",
    "#..............................#",
    "#..T.......S..........S......T.#",
    "#..............................#",
    "################################",
]
MAP_W: int = len(MAP_ROWS[0])
MAP_H: int = len(MAP_ROWS)
SPAWNS: list[tuple[float, float]] = [(3.5, 3.5), (28.5, 16.5), (28.5, 3.5), (3.5, 16.5), (16.0, 1.5), (16.0, 18.5)]

DT = 0.05  # 模擬步長（秒）
RADIUS = 0.35  # 角色半徑（格）
SPEED = 5.0  # 移動速度（格／秒）
SPEED_SLACK = 1.3  # 位置回報容許的超速倍數
MOVE_BUDGET_CAP = SPEED * 1.0  # 移動額度最多累積 1 秒份：請求因網路抖動擠在一起到達也不會被誤判超速
MAX_STONES = 3  # 手上最多幾顆石頭
THROW_COOLDOWN = 0.4
THROW_SLACK = 0.1  # 伺服器端冷卻的寬容：玩家端的冷卻照 0.4 秒算，請求到達時間有抖動也不吃掉石頭
# 蓄力：按住空白鍵最多 CHARGE_SEC 秒，力道 0~1 決定射程與速度（輕丟 3 格、蓄滿 12 格）
CHARGE_SEC = 1.0
STONE_RANGE_MIN = 3.0
STONE_RANGE_MAX = 12.0
STONE_SPEED_MIN = 9.0
STONE_SPEED_MAX = 15.0
HIT_RADIUS = 0.5
INVULN_SEC = 0.6  # 被打中後的無敵時間
PICK_RADIUS = 0.6
START_STONES = 10  # 開場地上的石頭
SPAWN_EVERY = 1.5
# 地上隨機生成的只有石頭與補血；禮物只從黑色怪物身上打下來
ITEM_CAPS: dict[str, int] = {"stone": 12, "heal": 2}
SPAWN_WEIGHTS: dict[str, int] = {"stone": 3, "heal": 1}
FRAME_EVERY = 0.2  # 直播緩衝每幾秒存一格
FRAME_KEEP = 4.0  # 直播緩衝保留幾秒

# 黑色怪物：石頭打中一次掉一個禮物；吃地上的石頭補火，朝 8 方向上的玩家噴火（扣 1 血，跟石頭一樣）
MONSTER_MAX = 2  # 場上最多幾隻
MONSTER_HP = 3  # 打幾下會消失
MONSTER_FIRST_SEC = 5.0  # 開打後幾秒出現第一隻
MONSTER_RESPAWN_SEC = 6.0  # 少一隻後幾秒補一隻
MONSTER_RADIUS = 0.45  # 碰撞半徑
MONSTER_HIT_RADIUS = 0.65  # 石頭打中的距離（比人大一點，好打）
MONSTER_SPEED = 2.2
MONSTER_AMMO_MAX = 3  # 最多存幾發火
MONSTER_START_AMMO = 1
MONSTER_KEEP_DIST = 3.0  # 有火時靠近玩家到這個距離就停
FIRE_COOLDOWN = 2.0
FIRE_SPEED = 9.0
FIRE_RANGE = 7.0
FIRE_AIM_OFF = 0.6  # 玩家離 8 方向射線多近才噴
DROP_LOCK_SEC = 10.0  # 被打中掉出來的禮物，原本的主人幾秒內不能撿回去

# 電腦玩家（試玩大廳用；正式比賽 bots=0 完全不會用到）：難度「普通、偶爾失誤」
BOT_SPEED = 0.9  # 走速是真人 SPEED 的幾倍（略慢一點）
BOT_REACT = (0.3, 0.6)  # 反應延遲：多久重新選一次目標／轉向（秒，隨機）
BOT_THROW_REACT = (0.3, 0.7)  # 丟完一顆後，除了冷卻還要多愣多久才會再丟（秒，隨機）
BOT_AIM_OFF = 0.45  # 目標離 8 方向射線多近才算瞄準了（格）
BOT_RANGE_EXTRA = 0.6  # 算力道時多丟幾格，確保飛得到目標
BOT_MISS_CHANCE = 0.22  # 丟偏的機率（一半偏 45 度、一半力道不足掉在前面）
BOT_DAZE_PER_SEC = 0.1  # 每秒有多少機率突然發呆
BOT_DAZE_SEC = 0.5  # 發呆多久（秒）
BOT_GIFT_CHANCE = 0.3  # 選目標時改去撿地上禮物的機率
BOT_GIFT_NEAR = 3.0  # 地上禮物（或受傷時的補血）在幾格內就順手去撿
BOT_STONE_NEAR = 2.0  # 手上沒滿、附近幾格內有石頭就順手撿
BOT_MONSTER_BIAS = 0.8  # 選目標時怪物的距離打幾折（怪物會掉禮物，稍微偏好）
BOT_KEEP_DIST = (3.0, 7.0)  # 跟目標保持的距離範圍（格）：站到目標的 8 方向射線上再丟
BOT_DODGE_CHANCE = 0.55  # 發現火球／石頭飛來或被怪物對準時，成功側移躲避的機率
BOT_DODGE_LOOK = 3.5  # 飛行物在幾格內才會注意到
BOT_DODGE_SEC = 0.35  # 一次側移多久（秒）
BOT_DODGE_RECHECK = 0.4  # 躲避判定後多久才會再判定一次（秒）


def stone_range(power: float) -> float:
    """Return how far a stone thrown with ``power`` (0~1) flies."""
    return STONE_RANGE_MIN + (STONE_RANGE_MAX - STONE_RANGE_MIN) * power


def stone_speed(power: float) -> float:
    """Return how fast a stone thrown with ``power`` (0~1) flies."""
    return STONE_SPEED_MIN + (STONE_SPEED_MAX - STONE_SPEED_MIN) * power


def solid(tx: int, ty: int) -> bool:
    """Return True when tile (tx, ty) blocks movement and stones (outside the map counts as wall)."""
    if tx < 0 or ty < 0 or tx >= MAP_W or ty >= MAP_H:
        return True
    return MAP_ROWS[ty][tx] != "."


def blocked(x: float, y: float, r: float = RADIUS) -> bool:
    """Return True when a circle-ish box of half-size ``r`` at (x, y) overlaps a solid tile."""
    return any(solid(math.floor(cx), math.floor(cy)) for cx in (x - r, x + r) for cy in (y - r, y + r))


def map_info() -> dict[str, Any]:
    """Return the map and movement constants the client needs for prediction and drawing."""
    return {
        "rows": MAP_ROWS, "w": MAP_W, "h": MAP_H, "radius": RADIUS, "speed": SPEED,
        "charge_sec": CHARGE_SEC, "stone_range_min": STONE_RANGE_MIN, "stone_range_max": STONE_RANGE_MAX,
        "stone_speed_min": STONE_SPEED_MIN, "stone_speed_max": STONE_SPEED_MAX, "max_stones": MAX_STONES,
        "throw_cooldown": THROW_COOLDOWN, "pick_radius": PICK_RADIUS, "hit_radius": HIT_RADIUS,
        "monster_hit_radius": MONSTER_HIT_RADIUS, "monster_hp": MONSTER_HP, "monster_ammo_max": MONSTER_AMMO_MAX,
        "frame_every": FRAME_EVERY,
    }


def snap8(dx: float, dy: float) -> tuple[int, int]:
    """Snap a direction to the nearest of 8 directions as (-1|0|1, -1|0|1)."""
    if dx == 0 and dy == 0:
        return 0, 0
    a = round(math.atan2(dy, dx) / (math.pi / 4)) * (math.pi / 4)
    return round(math.cos(a)), round(math.sin(a))


class StoneBattle:
    """One match: up to 6 players, ``prep_sec`` to get ready, then at most ``play_sec`` of play.

    Times are epoch seconds. ``finished_at`` is set when time runs out or at
    most one player is left; ``ranking`` and ``winner`` are then final.
    """

    def __init__(
        self, players: list[dict[str, Any]], prep_epoch: float, prep_sec: float, play_sec: float,
        hp: int, rng: random.Random | None = None, bots: int = 0,
    ) -> None:
        """Place ``players`` ([{id, name, label}]) and ``bots`` computers on the spawn points and scatter the first stones.

        Computers get ids -1, -2, ...; they never report and are moved by the
        engine inside ``_step``. ``bots=0`` (the real contest) behaves exactly as before.
        """
        self.rng = rng or random.SystemRandom()
        self.lock = threading.Lock()
        self.play_start = prep_epoch + prep_sec
        self.play_end = self.play_start + play_sec
        self.max_hp = hp
        self.t = self.play_start  # 模擬時間
        self.finished_at: float | None = None
        self.ranking: list[dict[str, Any]] | None = None
        self.bots = bots
        self.roster = [{"id": p["id"], "name": p["name"], "label": p.get("label"), "bot": False} for p in players]
        self.roster += [{"id": -(i + 1), "name": BOT_NAMES[i % len(BOT_NAMES)], "label": None, "bot": True}
                        for i in range(bots)]
        self.players: dict[int, dict[str, Any]] = {}
        for i, r in enumerate(self.roster):
            x, y = SPAWNS[i % len(SPAWNS)]
            fx, fy = snap8(MAP_W / 2 - x, MAP_H / 2 - y)  # 一開始面向地圖中央
            self.players[r["id"]] = {
                "id": r["id"], "x": x, "y": y, "fx": fx, "fy": fy, "hp": hp, "gifts": 0, "stones": 0,
                "alive": True, "inv_until": 0.0, "died_at": None, "cool_until": 0.0,
                "checked_at": self.play_start, "budget": 0.5, "seq": -1, "bot": r["bot"],
            }
            if r["bot"]:
                self.players[r["id"]].update({
                    "think_at": self.play_start + self.rng.uniform(*BOT_REACT), "goal": None, "path": [],
                    "aim": None, "daze_until": 0.0, "dodge": None, "dodge_until": 0.0, "dodge_check": 0.0,
                })
        self.items: list[dict[str, Any]] = []
        self.shots: list[dict[str, Any]] = []
        self._next_id = 1
        self.next_spawn = self.play_start + SPAWN_EVERY
        for _ in range(START_STONES):
            self._spawn("stone")
        self.monsters: list[dict[str, Any]] = []
        self.next_monster = self.play_start + MONSTER_FIRST_SEC
        self.frames: deque[dict[str, Any]] = deque()
        self.next_frame = self.play_start

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
        """Advance one fixed step: monsters, stones and fire in flight, pickups, spawns, live frames, early end."""
        self.t += DT
        if self.bots:
            for p in self.players.values():
                if p["bot"] and p["alive"]:
                    self._bot(p)
        if len(self.monsters) < MONSTER_MAX and self.t >= self.next_monster:
            self._spawn_monster()
            self.next_monster = self.t + MONSTER_RESPAWN_SEC
        for m in list(self.monsters):
            self._monster(m)
        self._move_shots()
        self._pickups()
        while self.t >= self.next_spawn:
            self.next_spawn += SPAWN_EVERY
            kinds = [k for k, cap in ITEM_CAPS.items() if sum(1 for i in self.items if i["k"] == k) < cap]
            if kinds:
                self._spawn(self.rng.choices(kinds, [SPAWN_WEIGHTS[k] for k in kinds])[0])
        if self.t >= self.next_frame:
            self.next_frame += FRAME_EVERY
            self.frames.append(self._frame())
            while self.frames and self.frames[0]["t"] < self.t - FRAME_KEEP:
                self.frames.popleft()
        alive = sum(1 for p in self.players.values() if p["alive"])
        if len(self.players) >= 2 and alive <= 1:
            self._finish(self.t)
        elif self.bots and not any(p["alive"] and not p["bot"] for p in self.players.values()):
            self._finish(self.t)  # 試玩：真人都倒了就不用等電腦打完

    def _move_shots(self) -> None:
        """Fly stones and fire in two half-steps; each stops at walls, at the end of its range, or on a target.

        Stones hit players (not the thrower) and monsters; fire only hits players.
        """
        keep = []
        for s in self.shots:
            hit = False
            for _ in range(2):
                s["x"] += s["vx"] * DT / 2
                s["y"] += s["vy"] * DT / 2
                s["left"] -= math.hypot(s["vx"], s["vy"]) * DT / 2
                if s["left"] <= 0 or solid(math.floor(s["x"]), math.floor(s["y"])):
                    hit = True
                    break
                target = next(
                    (p for p in self.players.values()
                     if p["alive"] and p["id"] != s["owner"] and math.hypot(p["x"] - s["x"], p["y"] - s["y"]) < HIT_RADIUS),
                    None,
                )
                if target is not None:
                    self._hurt(target)
                    hit = True
                    break
                if s["kind"] == "stone":
                    mon = next(
                        (m for m in self.monsters
                         if math.hypot(m["x"] - s["x"], m["y"] - s["y"]) < MONSTER_HIT_RADIUS),
                        None,
                    )
                    if mon is not None:
                        self._hit_monster(mon)
                        hit = True
                        break
            if not hit:
                keep.append(s)
        self.shots = keep

    def _hurt(self, p: dict[str, Any]) -> None:
        """Take one HP unless the player is still flashing from the last hit; 0 HP is out.

        A player carrying gifts drops one next to them; for DROP_LOCK_SEC only
        the others can pick it up.
        """
        if self.t < p["inv_until"]:
            return
        if p["gifts"] > 0:
            p["gifts"] -= 1
            self._drop_gift(p["x"], p["y"], lock=p["id"])
        p["hp"] -= 1
        p["inv_until"] = self.t + INVULN_SEC
        if p["hp"] <= 0:
            p["hp"] = 0
            p["alive"] = False
            p["died_at"] = self.t

    def _pickups(self) -> None:
        """Walk over an item to take it: stones up to MAX_STONES, gifts always, heals only when hurt."""
        for p in self.players.values():
            if p["alive"]:
                self._pickup_at(p, p["x"], p["y"])

    def _pickup_at(self, p: dict[str, Any], x: float, y: float) -> None:
        """Let player ``p`` take every item within reach of (x, y)."""
        for item in list(self.items):
            if math.hypot(item["x"] - x, item["y"] - y) >= PICK_RADIUS:
                continue
            if item["k"] == "stone":
                if p["stones"] >= MAX_STONES:
                    continue
                p["stones"] += 1
            elif item["k"] == "gift":
                if item.get("lock") == p["id"] and self.t < item["until"]:
                    continue  # 自己被打掉的禮物，10 秒內撿不回來
                p["gifts"] += 1
            else:
                if p["hp"] >= self.max_hp:
                    continue
                p["hp"] += 1
            self.items.remove(item)

    def _spawn(self, kind: str) -> None:
        """Drop an item on a random free tile away from players and other items."""
        for _ in range(60):
            tx, ty = self.rng.randrange(1, MAP_W - 1), self.rng.randrange(1, MAP_H - 1)
            if solid(tx, ty):
                continue
            x, y = tx + 0.5, ty + 0.5
            if any(math.hypot(p["x"] - x, p["y"] - y) < 1.5 for p in self.players.values() if p["alive"]):
                continue
            if any(math.hypot(i["x"] - x, i["y"] - y) < 1.0 for i in self.items):
                continue
            self.items.append({"id": self._next_id, "k": kind, "x": x, "y": y})
            self._next_id += 1
            return

    def _throw(self, p: dict[str, Any], power: float = 0.5) -> bool:
        """Throw a stone the way the player faces with ``power`` (0~1, how long it was charged).

        Returns False when out of stones or cooling down.
        """
        if not p["alive"] or p["stones"] <= 0 or self.t < p["cool_until"] - THROW_SLACK or (p["fx"], p["fy"]) == (0, 0):
            return False
        n = math.hypot(p["fx"], p["fy"])
        power = min(1.0, max(0.0, power))
        speed = stone_speed(power)
        vx, vy = p["fx"] / n * speed, p["fy"] / n * speed
        self.shots.append({
            "id": self._next_id, "x": p["x"] + p["fx"] / n * 0.3, "y": p["y"] + p["fy"] / n * 0.3,
            "vx": vx, "vy": vy, "left": stone_range(power), "owner": p["id"], "kind": "stone",
        })
        self._next_id += 1
        p["stones"] -= 1
        p["cool_until"] = self.t + THROW_COOLDOWN
        return True

    def _finish(self, at: float) -> None:
        """Rank everyone and freeze the match.

        Survivors rank first (if nobody survived, the players who fell last
        count as survivors), then more gifts, then more HP, then random.
        """
        self.finished_at = at
        alive = [p for p in self.players.values() if p["alive"]]
        if not alive and self.players:
            last = max(p["died_at"] for p in self.players.values())
            alive = [p for p in self.players.values() if p["died_at"] == last]
        pool = {p["id"] for p in alive}
        order = list(self.players.values())
        self.rng.shuffle(order)  # 同分時隨機
        order.sort(key=lambda p: (p["id"] not in pool, -p["gifts"], -p["hp"]))
        names = {r["id"]: r["name"] for r in self.roster}
        self.ranking = [
            {"rank": i + 1, "id": p["id"], "name": names[p["id"]], "gifts": p["gifts"], "hp": p["hp"],
             "alive": p["alive"], "bot": p["bot"]}
            for i, p in enumerate(order)
        ]
        self.shots = []
        self.frames.append(self._frame())

    @property
    def winner(self) -> int | None:
        """Return the best real player's id once the match is over (computers cannot take the gift)."""
        if not self.ranking:
            return None
        return next((r["id"] for r in self.ranking if not r["bot"]), None)

    # ---------- 電腦玩家（試玩用） ----------

    def _bot(self, p: dict[str, Any]) -> None:
        """Drive one computer player for one step, under the same rules as a real player.

        Order: daze -> dodge -> throw when lined up -> re-think the goal every
        BOT_REACT seconds -> walk along the path at BOT_SPEED (walls block, items
        on the way are picked up by ``_pickups``).
        """
        if self.t < p["daze_until"]:
            return
        if self.rng.random() < BOT_DAZE_PER_SEC * DT:
            p["daze_until"] = self.t + BOT_DAZE_SEC  # 偶爾發呆
            return
        if self.t < p["dodge_until"] and p["dodge"]:
            if self._bot_walk(p, p["dodge"]):
                return
            p["dodge_until"] = 0.0
        elif self.t >= p["dodge_check"]:
            side = self._bot_threat(p)
            if side is not None:
                p["dodge_check"] = self.t + BOT_DODGE_RECHECK
                if self.rng.random() < BOT_DODGE_CHANCE:
                    p["dodge"], p["dodge_until"] = side, self.t + BOT_DODGE_SEC
                    p["path"] = []
                    self._bot_walk(p, side)
                    return
        if self._bot_try_throw(p):
            return
        if self.t >= p["think_at"]:
            self._bot_think(p)
            p["think_at"] = self.t + self.rng.uniform(*BOT_REACT)
        self._bot_follow(p)

    def _bot_targets(self, p: dict[str, Any]) -> list[tuple[float, dict[str, Any]]]:
        """Return (weighted distance, target) for every other live player and every monster, nearest first."""
        out = [(math.hypot(q["x"] - p["x"], q["y"] - p["y"]), q) for q in self.players.values()
               if q["alive"] and q["id"] != p["id"]]
        out += [(math.hypot(m["x"] - p["x"], m["y"] - p["y"]) * BOT_MONSTER_BIAS, m) for m in self.monsters]
        out.sort(key=lambda e: e[0])
        return out

    def _bot_think(self, p: dict[str, Any]) -> None:
        """Pick where to go: stones first when empty-handed, else a target's firing line (sometimes a gift)."""
        def near(kind: str) -> list[tuple[float, dict[str, Any]]]:
            got = [(math.hypot(i["x"] - p["x"], i["y"] - p["y"]), i) for i in self.items if i["k"] == kind
                   and not (kind == "gift" and i.get("lock") == p["id"] and self.t < i["until"])]
            return sorted(got, key=lambda e: e[0])

        stones, gifts, heals = near("stone"), near("gift"), near("heal")
        goal = None
        p["aim"] = None
        if p["stones"] == 0:
            if stones:
                goal = (stones[0][1]["x"], stones[0][1]["y"])
            elif gifts:
                goal = (gifts[0][1]["x"], gifts[0][1]["y"])
        elif gifts and (gifts[0][0] < BOT_GIFT_NEAR or self.rng.random() < BOT_GIFT_CHANCE):
            goal = (gifts[0][1]["x"], gifts[0][1]["y"])
        elif heals and p["hp"] < self.max_hp and heals[0][0] < BOT_GIFT_NEAR:
            goal = (heals[0][1]["x"], heals[0][1]["y"])
        elif stones and p["stones"] < MAX_STONES and stones[0][0] < BOT_STONE_NEAR:
            goal = (stones[0][1]["x"], stones[0][1]["y"])
        else:
            targets = self._bot_targets(p)
            if targets:
                q = targets[0][1]
                p["aim"] = q
                # 站到目標的 8 方向射線上（優先選靠自己這側的射線），保持一段距離
                d = math.hypot(p["x"] - q["x"], p["y"] - q["y"])
                keep = min(BOT_KEEP_DIST[1], max(BOT_KEEP_DIST[0], d))
                rays = [(a, b) for a in (-1, 0, 1) for b in (-1, 0, 1) if (a, b) != (0, 0)]
                rays.sort(key=lambda v: -((p["x"] - q["x"]) * v[0] + (p["y"] - q["y"]) * v[1]) / math.hypot(*v))
                for sx, sy in rays:
                    n = math.hypot(sx, sy)
                    gx, gy = q["x"] + sx / n * keep, q["y"] + sy / n * keep
                    if not blocked(gx, gy):
                        goal = (gx, gy)
                        break
        p["goal"] = goal
        p["path"] = self._bot_path(p, goal) if goal else []

    def _bot_path(self, p: dict[str, Any], goal: tuple[float, float]) -> list[tuple[float, float]]:
        """Return waypoints from the bot to ``goal``: tile BFS around obstacles, then shortcut straight runs."""
        start = (math.floor(p["x"]), math.floor(p["y"]))
        end = (math.floor(goal[0]), math.floor(goal[1]))
        prev: dict[tuple[int, int], tuple[int, int] | None] = {start: None}
        queue = deque([start])
        while queue and end not in prev:
            cx, cy = queue.popleft()
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (1, -1), (-1, 1), (-1, -1)):
                nx, ny = cx + dx, cy + dy
                if (nx, ny) in prev or solid(nx, ny):
                    continue
                if dx and dy and (solid(cx + dx, cy) or solid(cx, cy + dy)):
                    continue  # 斜走不切牆角
                prev[(nx, ny)] = (cx, cy)
                queue.append((nx, ny))
        if end not in prev:
            return [goal]
        tiles = []
        node: tuple[int, int] | None = end
        while node is not None and node != start:
            tiles.append(node)
            node = prev[node]
        tiles.reverse()
        pts = [(tx + 0.5, ty + 0.5) for tx, ty in tiles[:-1]] + [goal]
        # 走得到直線的就跳過中間點
        out = []
        cur = (p["x"], p["y"])
        i = 0
        while i < len(pts):
            j = len(pts) - 1
            while j > i and not self._bot_clear(cur, pts[j], RADIUS):
                j -= 1
            out.append(pts[j])
            cur = pts[j]
            i = j + 1
        return out

    @staticmethod
    def _bot_clear(a: tuple[float, float], b: tuple[float, float], r: float) -> bool:
        """Return True when a body of half-size ``r`` can go straight from ``a`` to ``b`` (r=0: a stone's line)."""
        dist = math.hypot(b[0] - a[0], b[1] - a[1])
        steps = max(1, math.ceil(dist / 0.2))
        for k in range(1, steps + 1):
            x, y = a[0] + (b[0] - a[0]) * k / steps, a[1] + (b[1] - a[1]) * k / steps
            if blocked(x, y, r) if r > 0 else solid(math.floor(x), math.floor(y)):
                return False
        return True

    def _bot_follow(self, p: dict[str, Any]) -> None:
        """Walk toward the next waypoint; drop it once reached, re-think soon when stuck."""
        while p["path"] and math.hypot(p["path"][0][0] - p["x"], p["path"][0][1] - p["y"]) < 0.1:
            p["path"].pop(0)
        if not p["path"]:
            p["goal"] = None
            if p["aim"] is not None:  # 到定位了：轉身面向目標
                f = snap8(p["aim"]["x"] - p["x"], p["aim"]["y"] - p["y"])
                if f != (0, 0):
                    p["fx"], p["fy"] = f
            return
        wx, wy = p["path"][0]
        dx, dy = wx - p["x"], wy - p["y"]
        d = math.hypot(dx, dy)
        if not self._bot_walk(p, (dx / d, dy / d), min(SPEED * BOT_SPEED * DT, d)):
            p["path"] = []
            p["goal"] = None
            p["think_at"] = min(p["think_at"], self.t + 0.2)  # 卡住：稍後重想

    def _bot_walk(self, p: dict[str, Any], v: tuple[float, float], dist: float | None = None) -> bool:
        """Move along unit vector ``v`` (sliding along walls) and face that way; False when fully blocked."""
        step = SPEED * BOT_SPEED * DT if dist is None else dist
        for mx, my in ((v[0], v[1]), (v[0], 0.0), (0.0, v[1])):
            if abs(mx) < 1e-6 and abs(my) < 1e-6:
                continue
            nx, ny = p["x"] + mx * step, p["y"] + my * step
            if not blocked(nx, ny):
                p["x"], p["y"] = nx, ny
                f = snap8(v[0], v[1])
                if f != (0, 0):
                    p["fx"], p["fy"] = f
                return True
        return False

    def _bot_try_throw(self, p: dict[str, Any]) -> bool:
        """Throw at a target lined up on one of the 8 directions, in range and in sight; sometimes miss."""
        if p["stones"] <= 0 or self.t < p["cool_until"]:
            return False
        for _, q in self._bot_targets(p):
            dx, dy = q["x"] - p["x"], q["y"] - p["y"]
            dist = math.hypot(dx, dy)
            if dist > STONE_RANGE_MAX - BOT_RANGE_EXTRA:
                continue
            sx, sy = snap8(dx, dy)
            n = math.hypot(sx, sy) or 1
            off = abs(dx * sy / n - dy * sx / n)  # 離 8 方向射線的垂直距離
            if off >= BOT_AIM_OFF or not self._bot_clear((p["x"], p["y"]), (q["x"], q["y"]), 0):
                continue
            power = (dist + BOT_RANGE_EXTRA - STONE_RANGE_MIN) / (STONE_RANGE_MAX - STONE_RANGE_MIN)
            if self.rng.random() < BOT_MISS_CHANCE:
                if self.rng.random() < 0.5:  # 偏 45 度
                    a = math.atan2(sy, sx) + self.rng.choice((-1, 1)) * math.pi / 4
                    sx, sy = round(math.cos(a)), round(math.sin(a))
                else:  # 力道不足，掉在目標前面
                    power = (dist - self.rng.uniform(1.5, 3.0) - STONE_RANGE_MIN) / (STONE_RANGE_MAX - STONE_RANGE_MIN)
            p["fx"], p["fy"] = sx, sy
            if self._throw(p, min(1.0, max(0.0, power))):
                p["cool_until"] = self.t + THROW_COOLDOWN + self.rng.uniform(*BOT_THROW_REACT)
                return True
            return False
        return False

    def _bot_threat(self, p: dict[str, Any]) -> tuple[float, float] | None:
        """Return a sidestep direction when fire/a stone flies at the bot or a loaded monster lines it up."""
        lines = []
        for s in self.shots:
            if s["owner"] == p["id"]:
                continue
            sp = math.hypot(s["vx"], s["vy"]) or 1
            ux, uy = s["vx"] / sp, s["vy"] / sp
            rx, ry = p["x"] - s["x"], p["y"] - s["y"]
            along = rx * ux + ry * uy
            if 0 < along < min(BOT_DODGE_LOOK, s["left"] + HIT_RADIUS) and abs(rx * uy - ry * ux) < HIT_RADIUS + 0.4:
                lines.append((ux, uy, rx, ry))
        for m in self.monsters:
            if m["ammo"] <= 0 or self.t < m["cool_until"] - 0.3:
                continue
            rx, ry = p["x"] - m["x"], p["y"] - m["y"]
            sx, sy = snap8(rx, ry)
            n = math.hypot(sx, sy) or 1
            if math.hypot(rx, ry) <= FIRE_RANGE and abs(rx * sy / n - ry * sx / n) < FIRE_AIM_OFF + 0.3:
                lines.append((sx / n, sy / n, rx, ry))  # 被怪物鎖定
        if not lines:
            return None
        ux, uy, rx, ry = lines[0]
        side = 1 if rx * uy - ry * ux >= 0 else -1  # 往已經偏離射線的那一側閃
        for sgn in (side, -side):
            v = (uy * sgn, -ux * sgn)
            if not blocked(p["x"] + v[0] * 0.5, p["y"] + v[1] * 0.5):
                return v
        return None

    # ---------- 黑色怪物 ----------

    def _free_spot(self, near: tuple[float, float] | None, r: float, away: float) -> tuple[float, float] | None:
        """Return a free spot (within 1.5 tiles of ``near`` if given) at least ``away`` from every player."""
        for _ in range(60):
            if near is None:
                x, y = self.rng.randrange(1, MAP_W - 1) + 0.5, self.rng.randrange(1, MAP_H - 1) + 0.5
            else:
                a = self.rng.uniform(0, 2 * math.pi)
                d = self.rng.uniform(0.6, 1.5)
                x, y = near[0] + math.cos(a) * d, near[1] + math.sin(a) * d
            if blocked(x, y, r):
                continue
            if any(math.hypot(p["x"] - x, p["y"] - y) < away for p in self.players.values() if p["alive"]):
                continue
            return x, y
        return None

    def _spawn_monster(self) -> None:
        """Put a black monster on a free tile at least 4 tiles from every player."""
        spot = self._free_spot(None, MONSTER_RADIUS, 4.0)
        if spot is None:
            return
        self.monsters.append({
            "id": self._next_id, "x": spot[0], "y": spot[1], "hp": MONSTER_HP, "ammo": MONSTER_START_AMMO,
            "cool_until": self.t + 1.0, "fx": 0, "fy": 1, "dir": None, "turn_at": 0.0, "hurt_until": 0.0,
        })
        self._next_id += 1

    def _drop_gift(self, x: float, y: float, lock: int | None = None) -> None:
        """Drop a gift on a free spot near (x, y); ``lock`` is a player who cannot take it for DROP_LOCK_SEC."""
        spot = self._free_spot((x, y), 0.2, 0.0) or (x, y)
        item = {"id": self._next_id, "k": "gift", "x": round(spot[0], 2), "y": round(spot[1], 2)}
        if lock is not None:
            item["lock"], item["until"] = lock, round(self.t + DROP_LOCK_SEC, 3)
        self.items.append(item)
        self._next_id += 1

    def _hit_monster(self, m: dict[str, Any]) -> None:
        """A stone hit: drop one gift next to the monster; it vanishes after MONSTER_HP hits."""
        m["hp"] -= 1
        m["hurt_until"] = self.t + 0.3
        self._drop_gift(m["x"], m["y"])
        if m["hp"] <= 0:
            self.monsters.remove(m)
            self.next_monster = max(self.next_monster, self.t + MONSTER_RESPAWN_SEC)

    def _monster(self, m: dict[str, Any]) -> None:
        """Breathe fire at a lined-up player, eat stones to refill, otherwise close in on the nearest player."""
        foes = sorted(
            (q for q in self.players.values() if q["alive"]),
            key=lambda q: math.hypot(q["x"] - m["x"], q["y"] - m["y"]),
        )
        if m["ammo"] > 0 and self.t >= m["cool_until"]:
            for q in foes:
                dx, dy = q["x"] - m["x"], q["y"] - m["y"]
                sx, sy = snap8(dx, dy)
                n = math.hypot(sx, sy) or 1
                off = abs(dx * sy / n - dy * sx / n)  # 離 8 方向射線的垂直距離
                if math.hypot(dx, dy) <= FIRE_RANGE and off < FIRE_AIM_OFF:
                    m["fx"], m["fy"] = sx, sy
                    self.shots.append({
                        "id": self._next_id, "x": m["x"] + sx / n * 0.5, "y": m["y"] + sy / n * 0.5,
                        "vx": sx / n * FIRE_SPEED, "vy": sy / n * FIRE_SPEED, "left": FIRE_RANGE,
                        "owner": -m["id"], "kind": "fire",
                    })
                    self._next_id += 1
                    m["ammo"] -= 1
                    m["cool_until"] = self.t + FIRE_COOLDOWN
                    break
        # 吃石頭補火
        if m["ammo"] < MONSTER_AMMO_MAX:
            for item in self.items:
                if item["k"] == "stone" and math.hypot(item["x"] - m["x"], item["y"] - m["y"]) < PICK_RADIUS:
                    self.items.remove(item)
                    m["ammo"] += 1
                    break
        # 方向：沒火就去吃石頭；有火就靠近最近的玩家（太近就停下來，順便補火）
        if self.t >= m["turn_at"]:
            stones = [(i["x"], i["y"]) for i in self.items if i["k"] == "stone"]
            near_foe = foes[0] if foes else None
            far = near_foe is not None and math.hypot(near_foe["x"] - m["x"], near_foe["y"] - m["y"]) > MONSTER_KEEP_DIST
            goal = None
            if stones and (m["ammo"] == 0 or (m["ammo"] < MONSTER_AMMO_MAX and not far)):
                goal = min(stones, key=lambda g: math.hypot(g[0] - m["x"], g[1] - m["y"]))
            elif far:
                goal = (near_foe["x"], near_foe["y"])
            m["dir"] = snap8(goal[0] - m["x"], goal[1] - m["y"]) if goal else None
            m["turn_at"] = self.t + 0.4
        if not m["dir"]:
            return
        dx, dy = m["dir"]
        step = MONSTER_SPEED * DT / math.hypot(dx, dy)
        for mx, my in ((dx, dy), (dx, 0), (0, dy)):
            if (mx, my) != (0, 0) and not blocked(m["x"] + mx * step, m["y"] + my * step, MONSTER_RADIUS):
                m["x"] += mx * step
                m["y"] += my * step
                return
        m["dir"] = self.rng.choice([(1, 0), (-1, 0), (0, 1), (0, -1)])  # 卡住就換方向
        m["turn_at"] = self.t + 0.6

    # ---------- 玩家操作與畫面資料 ----------

    def report(
        self, pid: int, x: float, y: float, fx: int, fy: int, throw: bool, now: float,
        seq: int | None = None, power: float = 0.5,
    ) -> dict[str, Any] | None:
        """Take a player's position, facing and throw, then return the live snapshot (None if not playing).

        A move faster than SPEED (with slack) or through a wall is refused and
        the snapshot carries ``corrected`` so the client snaps back. Reports
        carry an increasing ``seq``; one that arrives after a newer one only
        counts its throw, so out-of-order arrival never drags the player back.
        """
        with self.lock:
            self._advance(now)
            p = self.players.get(pid)
            if p is None or p["bot"]:
                return None  # 電腦由伺服器自己動，不接受回報
            corrected = False
            if self.phase(now) == "play" and p["alive"]:
                stale = seq is not None and seq <= p["seq"]
                if not stale:
                    if seq is not None:
                        p["seq"] = seq
                    corrected = not self._accept_move(p, x, y, now)
                    fx, fy = snap8(fx, fy)
                    if (fx, fy) != (0, 0):
                        p["fx"], p["fy"] = fx, fy
                if throw:
                    self._throw(p, power)
            else:
                corrected = True  # 準備中／淘汰後位置以伺服器為準
            snap = self._snapshot(now)
            snap["corrected"] = corrected
            return snap

    def _accept_move(self, p: dict[str, Any], x: float, y: float, now: float) -> bool:
        """Move the player to (x, y) if it fits the movement budget and does not cross walls.

        The budget refills at SPEED (with slack) and holds up to one second of
        movement, so reports that arrive bunched together are still accepted.
        Items along the path are picked up, matching what the player saw locally.
        """
        p["budget"] = min(MOVE_BUDGET_CAP, p["budget"] + SPEED * SPEED_SLACK * max(0.0, now - p["checked_at"]))
        p["checked_at"] = now
        dist = math.hypot(x - p["x"], y - p["y"])
        if dist > p["budget"] + 0.05:
            return False
        steps = max(1, math.ceil(dist / 0.2))
        path = [(p["x"] + (x - p["x"]) * i / steps, p["y"] + (y - p["y"]) * i / steps) for i in range(1, steps + 1)]
        if any(blocked(px, py) for px, py in path):
            return False
        for px, py in path:
            self._pickup_at(p, px, py)
        p["x"], p["y"] = x, y
        p["budget"] -= dist
        return True

    def _frame(self) -> dict[str, Any]:
        """Return a compact picture of the field at the simulation time."""
        return {
            "t": round(self.t, 3),
            "p": [
                [p["id"], round(p["x"], 2), round(p["y"], 2), p["fx"], p["fy"], p["hp"], p["gifts"],
                 int(p["alive"]), int(self.t < p["inv_until"]), p["stones"]]
                for p in self.players.values()
            ],
            "s": [
                [s["id"], round(s["x"], 2), round(s["y"], 2), round(s["vx"], 2), round(s["vy"], 2), s["owner"], s["kind"][0]]
                for s in self.shots
            ],
            # 被打掉的禮物多帶「原主人、到期時間」：[id, k, x, y, lock, until]
            "i": [[i["id"], i["k"], i["x"], i["y"]] + ([i["lock"], i["until"]] if "lock" in i else []) for i in self.items],
            "m": [
                [m["id"], round(m["x"], 2), round(m["y"], 2), m["hp"], m["ammo"], int(self.t < m["hurt_until"]), m["fx"], m["fy"]]
                for m in self.monsters
            ],
        }

    def _meta(self, now: float) -> dict[str, Any]:
        """Return timing, roster and (once over) the ranking."""
        return {
            "now": now, "phase": self.phase(now), "play_start": self.play_start, "play_end": self.play_end,
            "finished_at": self.finished_at, "max_hp": self.max_hp, "roster": self.roster, "ranking": self.ranking,
        }

    def _snapshot(self, now: float) -> dict[str, Any]:
        """Return the live view for players: meta plus the current frame."""
        return {**self._meta(now), "frame": self._frame()}

    def watch(self, now: float, since: float) -> dict[str, Any]:
        """Return the spectator view: buffered frames newer than ``since`` (played back with a delay)."""
        with self.lock:
            self._advance(now)
            frames = [f for f in self.frames if f["t"] > since]
            return {**self._meta(now), "frames": frames, "frame": self._frame()}
