"""Mouse minigame ("誰是乖孩子") for the gift exchange: one in-memory match, never written to the DB while playing.

Everyone sits at a round table with a slice of watermelon. Holding the right
mouse button eats it, one bite every BITE_SEC; after five bites your mouth is
full of seeds and you may click (left button) on someone to spit a seed at
them, which costs them one HP when it lands. Once all five seeds are spat you
eat again. Mom (played by the computer) prays with her eyes shut, then
suddenly opens them for two seconds: whoever is eating or spitting right then
gets slapped and is out. Ten HP each; two minutes. Same lazy fixed-step clock
as the other minigames, no background thread.
"""

import random
import threading
from collections import deque
from typing import Any

DT = 0.05  # 模擬步長（秒）
BITES = 5  # 吃幾口嘴裡才滿（5 顆籽）
BITE_SEC = 0.4  # 長按右鍵每幾秒吃一口（2 秒吃滿）
SPIT_ACT_SEC = 0.3  # 吐完一顆後這麼久內還算「正在動」
SEED_FLIGHT = 0.5  # 籽飛到對手的秒數
HP = 10  # 每人血量
MOM_CLOSED = (3.0, 8.0)  # 媽媽閉眼禱告的秒數（隨機）
MOM_OPEN = 2.0  # 媽媽睜眼的秒數
MOM_GRACE = 0.15  # 睜眼後這麼短的時間內不抓（放開右鍵的訊息可能晚一點才到）
HOLD_STALE = 0.5  # 這麼久沒收到回報就當作放開右鍵
FRAME_EVERY = 0.1  # 直播緩衝每幾秒存一格
FRAME_KEEP = 4.0  # 直播緩衝保留幾秒
RECENT_KEEP = 3.0  # 畫面裡帶最近幾秒的籽與事件


class MomBattle:
    """One match: ``prep_sec`` to read the rules, then at most ``play_sec`` of eating and spitting.

    Times are epoch seconds. ``finished_at`` is set when time runs out or at
    most one player is left; ``ranking`` and ``winner`` are then final.
    """

    def __init__(
        self, players: list[dict[str, Any]], prep_epoch: float, prep_sec: float, play_sec: float,
        rng: random.Random | None = None,
    ) -> None:
        """Seat ``players`` ([{id, name, label}]) around the table and plan when Mom opens her eyes."""
        self.rng = rng or random.SystemRandom()
        self.lock = threading.Lock()
        self.play_start = prep_epoch + prep_sec
        self.play_end = self.play_start + play_sec
        self.t = self.play_start  # 模擬時間
        self.finished_at: float | None = None
        self.ranking: list[dict[str, Any]] | None = None
        self.roster = [{"id": p["id"], "name": p["name"], "label": p.get("label")} for p in players]
        self.players: dict[int, dict[str, Any]] = {
            p["id"]: {
                "id": p["id"], "hp": HP, "alive": True, "out_at": None, "mode": "eat", "bites": 0, "seeds": 0,
                "holding": False, "hold_seen": 0.0, "next_bite": 0.0, "act_until": 0.0, "seq": -1,
            }
            for p in players
        }
        # 媽媽時間表：[開始, 結束, 是否睜眼]，一開始閉眼
        self.mom: list[tuple[float, float, bool]] = []
        at, is_open = self.play_start, False
        while at < self.play_end + 10:
            span = MOM_OPEN if is_open else self.rng.uniform(*MOM_CLOSED)
            self.mom.append((at, at + span, is_open))
            at, is_open = at + span, not is_open
        self.seeds: list[dict[str, Any]] = []
        self._next_seed = 1
        self.events: deque[tuple[float, str, list[int]]] = deque()
        self.frames: deque[dict[str, Any]] = deque()
        self.next_frame = self.play_start

    # ---------- 媽媽 ----------

    def mom_segment(self, at: float) -> tuple[float, float, bool]:
        """Return the (start, end, eyes open) stretch Mom is in at ``at``."""
        for seg in self.mom:
            if seg[0] <= at < seg[1]:
                return seg
        return self.mom[-1]

    def mom_watching(self, at: float) -> bool:
        """Return True when Mom's eyes are open at ``at`` and the short grace after opening has passed."""
        start, _end, is_open = self.mom_segment(at)
        return is_open and at - start >= MOM_GRACE

    def acting(self, p: dict[str, Any], at: float) -> bool:
        """Return True while the player is eating (holding with room in the mouth) or just spat."""
        if not p["alive"]:
            return False
        eating = p["mode"] == "eat" and p["holding"] and p["bites"] < BITES
        return eating or at < p["act_until"]

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
        """Advance one fixed step: bites while holding, seeds landing, Mom slapping, early end, live frames."""
        self.t += DT
        t = self.t
        for p in self.players.values():
            if not p["alive"]:
                continue
            if p["holding"] and t - p["hold_seen"] > HOLD_STALE:
                p["holding"] = False  # 斷線或沒在回報：當作放開
            if p["mode"] == "eat" and p["holding"] and p["bites"] < BITES and t >= p["next_bite"]:
                p["bites"] += 1
                p["next_bite"] += BITE_SEC
                self._event(t, "bite", [p["id"]])
                if p["bites"] >= BITES:
                    p["mode"], p["seeds"] = "spit", BITES  # 嘴裡滿了，開始可以吐
        self._land(t)
        if self.finished_at is None and self.mom_watching(t):
            for p in self.players.values():
                if self.acting(p, t):
                    self._slap(p, t)
        self._check_end(t)
        if t >= self.next_frame:
            self.next_frame += FRAME_EVERY
            self.frames.append(self._frame())
            while self.frames and self.frames[0]["t"] < t - FRAME_KEEP:
                self.frames.popleft()

    def _land(self, at: float) -> None:
        """Seeds that arrived by ``at`` hit their target (if still in): one HP each."""
        for s in self.seeds:
            if s["done"] or s["t1"] > at:
                continue
            s["done"] = True
            q = self.players.get(s["to"])
            if q is None or not q["alive"] or self.finished_at is not None:
                continue
            q["hp"] -= 1
            self._event(s["t1"], "hit", [q["id"]])
            if q["hp"] <= 0:
                q["hp"] = 0
                self._out(q, s["t1"])
        self.seeds = [s for s in self.seeds if s["t1"] >= at - RECENT_KEEP]

    def _slap(self, p: dict[str, Any], at: float) -> None:
        """Mom caught ``p`` eating or spitting: one slap and they are out."""
        self._event(at, "slap", [p["id"]])
        self._out(p, at)
        print(f"[momgame] Mom slapped player {p['id']}")

    def _out(self, p: dict[str, Any], at: float) -> None:
        """Take ``p`` out of the match."""
        p["alive"] = False
        p["holding"] = False
        p["out_at"] = at

    def _event(self, at: float, kind: str, ids: list[int]) -> None:
        """Record something for the screen (bite / spit / hit / slap)."""
        self.events.append((at, kind, ids))
        while self.events and self.events[0][0] < at - RECENT_KEEP:
            self.events.popleft()

    def _check_end(self, at: float) -> None:
        """End early when at most one player is left."""
        if self.finished_at is None and sum(1 for p in self.players.values() if p["alive"]) <= 1:
            self._finish(at)

    @staticmethod
    def mouth(p: dict[str, Any]) -> int:
        """Return how many seeds are in the player's mouth (bites so far while eating, seeds left while spitting)."""
        return p["bites"] if p["mode"] == "eat" else p["seeds"]

    def _finish(self, at: float) -> None:
        """Rank everyone and freeze the match.

        Players still in first: more HP, then more seeds in the mouth, then
        random. Players who are out follow, the later they went out the better
        (same moment: random).
        """
        self.finished_at = at
        order = list(self.players.values())
        self.rng.shuffle(order)  # 最後平手時抽籤
        order.sort(key=lambda p: (0, -p["hp"], -self.mouth(p)) if p["alive"] else (1, -(p["out_at"] or 0.0), 0))
        names = {r["id"]: r["name"] for r in self.roster}
        self.ranking = [
            {"rank": i + 1, "id": p["id"], "name": names[p["id"]], "hp": p["hp"], "seeds": self.mouth(p),
             "alive": p["alive"]}
            for i, p in enumerate(order)
        ]
        self.frames.append(self._frame())
        print(f"[momgame] finished, winner {self.winner}")

    @property
    def winner(self) -> int | None:
        """Return the winner's player id once the match is over."""
        return self.ranking[0]["id"] if self.ranking else None

    # ---------- 玩家操作 ----------

    def report(
        self, pid: int, hold: bool, spits: list[int], now: float, seq: int | None = None,
    ) -> dict[str, Any] | None:
        """Take a player's right button state and the opponents they clicked to spit at; returns the live snapshot.

        Reports carry an increasing ``seq``; an older one is ignored. The
        snapshot carries ``spat`` (how many of ``spits`` were spat). Returns
        None when ``pid`` is not in this match.
        """
        with self.lock:
            self._advance(now)
            p = self.players.get(pid)
            if p is None:
                return None
            spat = 0
            if self.phase(now) == "play" and p["alive"] and (seq is None or seq > p["seq"]):
                if seq is not None:
                    p["seq"] = seq
                if hold:
                    if not p["holding"]:
                        p["next_bite"] = now + BITE_SEC  # 按下去 0.4 秒後吃第一口
                    p["holding"], p["hold_seen"] = True, now
                else:
                    p["holding"] = False
                for target in spits:
                    if self._spit(p, target, now):
                        spat += 1
                self._check_end(now)
            snap = self._snapshot(now)
            snap["spat"] = spat
            return snap

    def _spit(self, p: dict[str, Any], target: int, now: float) -> bool:
        """Spit one seed at ``target`` if the mouth is full of seeds; Mom watching means a slap instead."""
        q = self.players.get(target)
        if p["mode"] != "spit" or p["seeds"] <= 0 or q is None or q is p or not q["alive"] or not p["alive"]:
            return False
        if self.mom_watching(now):
            self._slap(p, now)
            return False
        p["seeds"] -= 1
        p["act_until"] = now + SPIT_ACT_SEC
        self.seeds.append({"id": self._next_seed, "from": p["id"], "to": target, "t0": now, "t1": now + SEED_FLIGHT,
                           "done": False})
        self._next_seed += 1
        self._event(now, "spit", [p["id"], target])
        if p["seeds"] == 0:
            p["mode"], p["bites"] = "eat", 0  # 吐完再吃
            p["next_bite"] = now + BITE_SEC
        return True

    # ---------- 畫面資料 ----------

    def _frame(self) -> dict[str, Any]:
        """Return a compact picture: Mom's eyes, everyone's HP / watermelon / seeds, flying seeds and events."""
        start, end, is_open = self.mom_segment(self.t)
        return {
            "t": round(self.t, 3),
            "mom": [int(is_open), round(end, 3)],
            "p": [
                [p["id"], p["hp"], int(p["alive"]), p["mode"], p["bites"], p["seeds"], int(self.acting(p, self.t))]
                for p in self.players.values()
            ],
            "s": [[s["id"], s["from"], s["to"], round(s["t0"], 3), round(s["t1"], 3)] for s in self.seeds],
            "ev": [[round(t, 3), kind, ids] for t, kind, ids in self.events],
        }

    def _meta(self, now: float) -> dict[str, Any]:
        """Return timing, roster, the game's numbers and (once over) the ranking."""
        return {
            "game": "mom", "now": now, "phase": self.phase(now), "play_start": self.play_start,
            "play_end": self.play_end, "finished_at": self.finished_at, "roster": self.roster, "ranking": self.ranking,
            "cfg": {"bites": BITES, "bite_sec": BITE_SEC, "seed_flight": SEED_FLIGHT, "hp": HP},
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
