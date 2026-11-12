"""Counting minigame ("報數遊戲") for the gift exchange: one in-memory match, never written to the DB while playing.

Everyone (the players plus a couple of computer players) calls numbers 1-9 in
order, wrapping after 9. Calling the wrong number, or the same number as
someone else at (nearly) the same time, knocks you out; you cannot call twice
in a row. Each correct call scores a point and the highest score wins, but only
a real player can take the gift. Same lazy fixed-step clock as StoneBattle.
"""

import random
import threading
from collections import deque
from typing import Any

DT = 0.05  # 模擬步長（秒）
COLLIDE_SEC = 0.4  # 同一個數字在這麼短的時間內又有人喊 → 撞號，兩個都淘汰
BOT_DELAY = (0.7, 2.6)  # 電腦在別人喊完後隔多久喊（秒，隨機）
BOT_MISTAKE = 0.07  # 電腦喊錯的機率
BOT_NAMES = ["電腦 A", "電腦 B", "電腦 C", "電腦 D"]
FRAME_EVERY = 0.2  # 直播緩衝每幾秒存一格
FRAME_KEEP = 4.0  # 直播緩衝保留幾秒
EVENT_KEEP = 3.0  # 畫面裡帶最近幾秒的喊數事件


def next_number(n: int) -> int:
    """Return the number after ``n`` (9 wraps to 1)."""
    return n % 9 + 1


class CountBattle:
    """One counting match: ``prep_sec`` to read the rules, then at most ``play_sec`` of calling.

    Times are epoch seconds. Computer players get negative ids. ``finished_at``
    is set when time runs out, fewer than two can still call, or no real player
    is left; ``ranking`` (everyone by score, ties random) and ``winner`` (the
    best real player) are then final.
    """

    def __init__(
        self, players: list[dict[str, Any]], prep_epoch: float, prep_sec: float, play_sec: float,
        bots: int = 2, rng: random.Random | None = None,
    ) -> None:
        """Seat ``players`` ([{id, name, label}]) and ``bots`` computer players."""
        self.rng = rng or random.SystemRandom()
        self.lock = threading.Lock()
        self.play_start = prep_epoch + prep_sec
        self.play_end = self.play_start + play_sec
        self.t = self.play_start  # 模擬時間
        self.finished_at: float | None = None
        self.ranking: list[dict[str, Any]] | None = None
        self.roster = [{"id": p["id"], "name": p["name"], "label": p.get("label"), "bot": False} for p in players]
        self.roster += [{"id": -(i + 1), "name": BOT_NAMES[i % len(BOT_NAMES)], "label": None, "bot": True} for i in range(bots)]
        self.players: dict[int, dict[str, Any]] = {
            r["id"]: {"id": r["id"], "score": 0, "alive": True, "bot": r["bot"], "next_try": None} for r in self.roster
        }
        self.expected = 1  # 該喊的數字
        self.last: tuple[int, int, float] | None = None  # 最後一次喊對的（數字, 誰, 時間）
        self.events: deque[tuple[float, str, list[int], int]] = deque()
        self.frames: deque[dict[str, Any]] = deque()
        self.next_frame = self.play_start
        self._schedule_bots(self.play_start)

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
        """Advance one fixed step: computer players whose turn has come call, then live frames."""
        self.t += DT
        for p in self.players.values():
            if self.finished_at is not None:
                return
            if p["bot"] and p["alive"] and p["next_try"] is not None and self.t >= p["next_try"]:
                n = self.expected
                if self.rng.random() < BOT_MISTAKE:
                    n = self.rng.choice([x for x in range(1, 10) if x != self.expected])
                self._call(p, n, self.t)
                self._check_end(self.t)
        if self.t >= self.next_frame:
            self.next_frame += FRAME_EVERY
            self.frames.append(self._frame())
            while self.frames and self.frames[0]["t"] < self.t - FRAME_KEEP:
                self.frames.popleft()

    # ---------- 喊數字 ----------

    def _call(self, p: dict[str, Any], n: int, at: float) -> str:
        """Judge one call; returns ok / wait / collide / wrong / ignored."""
        if not p["alive"]:
            return "ignored"
        if self.last is not None and self.last[1] == p["id"]:
            return "wait"  # 不能連續喊，要等別人喊過
        if self.last is not None and n == self.last[0] and at - self.last[2] <= COLLIDE_SEC:
            # 撞號：兩個都淘汰，先喊的那 1 分收回；該喊的數字照樣往下
            first = self.players[self.last[1]]
            first["score"] -= 1
            first["alive"] = p["alive"] = False
            self._event(at, "collide", [first["id"], p["id"]], n)
            self.last = None
            return "collide"
        if n != self.expected:
            p["alive"] = False  # 喊錯：淘汰，該喊的數字不變
            self._event(at, "wrong", [p["id"]], n)
            return "wrong"
        p["score"] += 1
        self.last = (n, p["id"], at)
        self.expected = next_number(n)
        self._event(at, "call", [p["id"]], n)
        return "ok"

    def _event(self, at: float, kind: str, ids: list[int], n: int) -> None:
        """Record an event for the screen and give every computer player a new moment to call."""
        self.events.append((at, kind, ids, n))
        while self.events and self.events[0][0] < at - EVENT_KEEP:
            self.events.popleft()
        self._schedule_bots(at)

    def _schedule_bots(self, at: float) -> None:
        """Each computer player that may call next picks a random delay; the one who just called waits."""
        for p in self.players.values():
            if not p["bot"] or not p["alive"]:
                continue
            just_called = self.last is not None and self.last[1] == p["id"]
            p["next_try"] = None if just_called else at + self.rng.uniform(*BOT_DELAY)

    def _check_end(self, at: float) -> None:
        """End early when fewer than two can call or no real player is left."""
        if self.finished_at is not None:
            return
        alive = [p for p in self.players.values() if p["alive"]]
        if len(alive) < 2 or not any(not p["bot"] for p in alive):
            self._finish(at)

    def _finish(self, at: float) -> None:
        """Rank everyone by score (eliminated players and computers included, ties random) and freeze."""
        self.finished_at = at
        order = list(self.players.values())
        self.rng.shuffle(order)  # 同分時隨機
        order.sort(key=lambda p: -p["score"])
        info = {r["id"]: r for r in self.roster}
        self.ranking = [
            {"rank": i + 1, "id": p["id"], "name": info[p["id"]]["name"], "score": p["score"],
             "alive": p["alive"], "bot": p["bot"]}
            for i, p in enumerate(order)
        ]
        self.frames.append(self._frame())

    @property
    def winner(self) -> int | None:
        """Return the best real player's id once the match is over (computers cannot take the gift)."""
        if not self.ranking:
            return None
        return next((r["id"] for r in self.ranking if not r["bot"]), None)

    def call(self, pid: int, n: int | None, now: float) -> dict[str, Any] | None:
        """A player calls ``n`` (or just polls when None); returns the live snapshot with ``result``.

        Returns None when ``pid`` is not a real player in this match.
        """
        with self.lock:
            self._advance(now)
            p = self.players.get(pid)
            if p is None or p["bot"]:
                return None
            result = "poll"
            if n is not None:
                if self.phase(now) != "play":
                    result = "ignored"
                else:
                    result = self._call(p, n, now)
                    self._check_end(now)
            snap = self._snapshot(now)
            snap["result"] = result
            return snap

    # ---------- 畫面資料 ----------

    def _frame(self) -> dict[str, Any]:
        """Return a compact picture: scores, who is still in, the last good call and recent events."""
        return {
            "t": round(self.t, 3),
            "p": [[p["id"], p["score"], int(p["alive"])] for p in self.players.values()],
            "last": [self.last[0], self.last[1], round(self.last[2], 3)] if self.last else None,
            "ev": [[round(t, 3), kind, ids, n] for t, kind, ids, n in self.events],
        }

    def _meta(self, now: float) -> dict[str, Any]:
        """Return timing, roster and (once over) the ranking."""
        return {
            "game": "count", "now": now, "phase": self.phase(now), "play_start": self.play_start,
            "play_end": self.play_end, "finished_at": self.finished_at, "roster": self.roster, "ranking": self.ranking,
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
