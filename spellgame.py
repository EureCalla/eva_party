"""Typing-spell minigame ("鍵盤詠唱師") for the gift exchange: one in-memory match, never written to the DB while playing.

Players stand in a circle. Every five seconds five random lowercase letters
appear in the middle; typing them in order casts a spell that fires a ray at
every other player still in. You may cast the same letters as many times as
you can type them before the next set appears. A ray takes a while to arrive
(1.5 s at first, down to 0.6 s for the last set); if your target casts back
before it lands, the two rays meet halfway and cancel out. A hit costs one HP,
and so does a wrong letter (the spell backfires and the letters start over).
Ten HP each; at zero you are out. Same lazy fixed-step clock as the other
minigames, no background thread.
"""

import random
import string
import threading
from collections import deque
from typing import Any

DT = 0.05  # 模擬步長（秒）
WORD_EVERY = 5.0  # 每幾秒換一組字母
WORD_LEN = 5  # 每組幾個字母
FLIGHT_FIRST = 1.5  # 第一組的射線飛行秒數
FLIGHT_LAST = 0.6  # 最後一組的射線飛行秒數
HP = 10  # 每人血量
FRAME_EVERY = 0.1  # 直播緩衝每幾秒存一格
FRAME_KEEP = 4.0  # 直播緩衝保留幾秒
RECENT_KEEP = 3.0  # 畫面裡帶最近幾秒的射線與事件


class SpellBattle:
    """One typing-spell match: ``prep_sec`` to read the rules, then at most ``play_sec`` of casting.

    Times are epoch seconds. ``finished_at`` is set when time runs out or at
    most one player is left; ``ranking`` and ``winner`` are then final.
    """

    def __init__(
        self, players: list[dict[str, Any]], prep_epoch: float, prep_sec: float, play_sec: float,
        rng: random.Random | None = None,
    ) -> None:
        """Stand ``players`` ([{id, name, label}]) in a circle and draw every set of letters up front."""
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
                "id": p["id"], "hp": HP, "alive": True, "out_at": None,
                "word": -1, "progress": 0, "started": None, "casts": 0, "last_speed": None,
                "typed": 0,  # 按鍵流水號：已經處理到第幾個按鍵（重送的跳過）
            }
            for p in players
        }
        self.n_words = max(1, int(play_sec // WORD_EVERY))
        self.words = ["".join(self.rng.choice(string.ascii_lowercase) for _ in range(WORD_LEN)) for _ in range(self.n_words)]
        self.rays: list[dict[str, Any]] = []
        self._next_ray = 1
        self.events: deque[tuple[float, str, list[int]]] = deque()
        self.frames: deque[dict[str, Any]] = deque()
        self.next_frame = self.play_start

    # ---------- 字母與飛行時間 ----------

    def word_index(self, at: float) -> int | None:
        """Return which set of letters is up at ``at`` (None before play)."""
        if at < self.play_start:
            return None
        return min(self.n_words - 1, int((at - self.play_start) // WORD_EVERY))

    def word_start(self, n: int) -> float:
        """Return when set ``n`` appears."""
        return self.play_start + n * WORD_EVERY

    def flight(self, n: int) -> float:
        """Return how long a ray cast during set ``n`` takes to arrive (1.5 s down to 0.6 s)."""
        if self.n_words <= 1:
            return FLIGHT_FIRST
        return FLIGHT_FIRST - (FLIGHT_FIRST - FLIGHT_LAST) * n / (self.n_words - 1)

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
            self._land(self.play_end)
            if self.finished_at is None:
                self._finish(self.play_end)

    def _step(self) -> None:
        """Advance one fixed step: rays that arrived hit, early end, live frames."""
        self.t += DT
        self._land(self.t)
        if self.t >= self.next_frame:
            self.next_frame += FRAME_EVERY
            self.frames.append(self._frame())
            while self.frames and self.frames[0]["t"] < self.t - FRAME_KEEP:
                self.frames.popleft()

    def _land(self, at: float) -> None:
        """Rays that arrived by ``at`` and were not cancelled hit their target (if still in)."""
        for r in sorted(self.rays, key=lambda r: r["t1"]):
            if self.finished_at is not None:
                break  # 已經結束（剩 1 人），之後的射線不算
            if r["done"] or r["cancel_t"] is not None or r["t1"] > at:
                continue
            r["done"] = True
            q = self.players.get(r["to"])
            if q is None or not q["alive"]:
                continue
            self._hurt(q, r["t1"], "hit")
        self.rays = [r for r in self.rays if max(r["t1"], r["cancel_t"] or 0) >= at - RECENT_KEEP]

    def _hurt(self, p: dict[str, Any], at: float, kind: str) -> None:
        """Take one HP from ``p`` (a hit or a backfire); at zero they are out."""
        p["hp"] -= 1
        self._event(at, kind, [p["id"]])
        if p["hp"] <= 0:
            p["hp"] = 0
            p["alive"] = False
            p["out_at"] = at
            print(f"[spellgame] player {p['id']} is out ({kind})")
        self._check_end(at)

    def _event(self, at: float, kind: str, ids: list[int]) -> None:
        """Record something for the screen (hit / cancel / backfire / cast)."""
        self.events.append((at, kind, ids))
        while self.events and self.events[0][0] < at - RECENT_KEEP:
            self.events.popleft()

    def _check_end(self, at: float) -> None:
        """End early when at most one player is left."""
        if self.finished_at is None and sum(1 for p in self.players.values() if p["alive"]) <= 1:
            self._finish(at)

    def _finish(self, at: float) -> None:
        """Rank everyone and freeze the match.

        More HP first; same HP: the faster last cast first (never cast = slowest);
        still tied: random. Rays still in flight do not count.
        """
        self.finished_at = at
        order = list(self.players.values())
        self.rng.shuffle(order)  # 最後平手時抽籤
        order.sort(key=lambda p: (-p["hp"], p["last_speed"] is None, p["last_speed"] or 0.0))
        names = {r["id"]: r["name"] for r in self.roster}
        self.ranking = [
            {"rank": i + 1, "id": p["id"], "name": names[p["id"]], "hp": p["hp"], "alive": p["alive"],
             "speed": None if p["last_speed"] is None else round(p["last_speed"], 2)}
            for i, p in enumerate(order)
        ]
        self.frames.append(self._frame())
        print(f"[spellgame] finished, winner {self.winner}")

    @property
    def winner(self) -> int | None:
        """Return the winner's player id once the match is over."""
        return self.ranking[0]["id"] if self.ranking else None

    # ---------- 打字與詠唱 ----------

    def type(
        self, pid: int, word_id: int | None, keys: str, now: float, start: int | None = None,
    ) -> dict[str, Any] | None:
        """A player typed ``keys`` for set ``word_id`` (or just polls with ""); returns the live snapshot.

        ``start`` is the sequence number of the first key (the page numbers
        every key it sends). Keys this player already sent are skipped as
        ``dup``, so a request retried after a network hiccup is never judged
        twice. The snapshot carries ``results`` (one of ok / wrong / cast /
        dup / ignored per key) and ``typed`` (how many keys have been handled).
        Keys for an older set are ignored without penalty. Returns None when
        ``pid`` is not in this match.
        """
        with self.lock:
            self._advance(now)
            p = self.players.get(pid)
            if p is None:
                return None
            results: list[str] = []
            if keys and start is not None:
                dup = min(len(keys), max(0, p["typed"] - start))
                results = ["dup"] * dup
                keys = keys[dup:]
                p["typed"] = max(p["typed"], start + dup + len(keys))
            n = self.word_index(now)
            if keys and (self.phase(now) != "play" or not p["alive"] or n is None or word_id != n):
                results += ["ignored"] * len(keys)
            elif keys:
                self._sync_word(p, n)
                for ch in keys:
                    if self.finished_at is not None or not p["alive"]:
                        results.append("ignored")
                        continue
                    results.append(self._key(p, n, ch, now))
            snap = self._snapshot(now)
            snap["results"] = results
            snap["typed"] = p["typed"]
            return snap

    def _sync_word(self, p: dict[str, Any], n: int) -> None:
        """A new set of letters is up: whatever the player had typed is cleared."""
        if p["word"] != n:
            p["word"], p["progress"], p["casts"] = n, 0, 0
            p["started"] = self.word_start(n)

    def _key(self, p: dict[str, Any], n: int, ch: str, now: float) -> str:
        """Judge one key: ok, cast (fifth letter) or wrong (backfire, start over)."""
        word = self.words[n]
        if ch != word[p["progress"]]:
            p["progress"] = 0
            p["started"] = now  # 打錯重來，從這一刻起算
            self._hurt(p, now, "backfire")
            return "wrong"
        p["progress"] += 1
        if p["progress"] < WORD_LEN:
            return "ok"
        p["last_speed"] = now - p["started"]
        p["progress"] = 0
        p["casts"] += 1
        p["started"] = now  # 同一組再打一次，從這次打完起算
        self._cast(p, n, now)
        return "cast"

    def _cast(self, p: dict[str, Any], n: int, now: float) -> None:
        """Fire a ray at every other player still in; a ray meeting one coming back cancels out."""
        self._event(now, "cast", [p["id"]])
        t_fly = self.flight(n)
        for q in self.players.values():
            if q is p or not q["alive"]:
                continue
            ray = {"id": self._next_ray, "from": p["id"], "to": q["id"], "t0": now, "t1": now + t_fly,
                   "cancel_t": None, "cancel_s": None, "done": False}
            self._next_ray += 1
            back = next(
                (r for r in self.rays
                 if r["from"] == q["id"] and r["to"] == p["id"] and r["cancel_t"] is None and not r["done"] and r["t1"] > now),
                None,
            )
            if back is not None:
                # 兩條相向的射線：A 從 0 走到 1、B 從 1 走回 0，相遇時 sA = sB
                ta, tb = t_fly, back["t1"] - back["t0"]
                meet = (now / ta + 1 + back["t0"] / tb) / (1 / ta + 1 / tb)
                s = (meet - now) / ta  # 從 p 算起的位置（0～1）
                ray["cancel_t"] = back["cancel_t"] = round(meet, 3)
                ray["cancel_s"] = round(s, 3)
                back["cancel_s"] = round(1 - s, 3)
                self._event(meet, "cancel", [p["id"], q["id"]])
            self.rays.append(ray)

    # ---------- 畫面資料 ----------

    def _frame(self) -> dict[str, Any]:
        """Return a compact picture: the current letters, everyone's HP and typing, recent rays and events."""
        n = self.word_index(self.t)
        word = [n, self.words[n], self.word_start(n)] if n is not None else None
        return {
            "t": round(self.t, 3),
            "word": word,
            "p": [
                [p["id"], p["hp"], int(p["alive"]), p["progress"] if p["word"] == n else 0,
                 p["casts"] if p["word"] == n else 0,
                 None if p["last_speed"] is None else round(p["last_speed"], 2)]
                for p in self.players.values()
            ],
            "r": [[r["id"], r["from"], r["to"], round(r["t0"], 3), round(r["t1"], 3), r["cancel_t"], r["cancel_s"]]
                  for r in self.rays],
            "ev": [[round(t, 3), kind, ids] for t, kind, ids in self.events],
        }

    def _meta(self, now: float) -> dict[str, Any]:
        """Return timing, roster, the game's numbers and (once over) the ranking."""
        return {
            "game": "spell", "now": now, "phase": self.phase(now), "play_start": self.play_start,
            "play_end": self.play_end, "finished_at": self.finished_at, "roster": self.roster, "ranking": self.ranking,
            "cfg": {"word_every": WORD_EVERY, "word_len": WORD_LEN, "n_words": self.n_words,
                    "flight_first": FLIGHT_FIRST, "flight_last": FLIGHT_LAST, "hp": HP},
        }

    def _snapshot(self, now: float) -> dict[str, Any]:
        """Return the live view for players: meta plus the current frame (at ``now``, not the last step)."""
        frame = self._frame()
        n = self.word_index(now)
        if n is not None and self.finished_at is None:
            frame["word"] = [n, self.words[n], self.word_start(n)]
            for row in frame["p"]:
                p = self.players[row[0]]
                row[3] = p["progress"] if p["word"] == n else 0
                row[4] = p["casts"] if p["word"] == n else 0
        return {**self._meta(now), "frame": frame}

    def watch(self, now: float, since: float) -> dict[str, Any]:
        """Return the spectator view: buffered frames newer than ``since`` (played back with a delay)."""
        with self.lock:
            self._advance(now)
            frames = [f for f in self.frames if f["t"] > since]
            return {**self._meta(now), "frames": frames, "frame": self._frame()}
