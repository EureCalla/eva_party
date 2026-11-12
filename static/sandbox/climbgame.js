(function () {
  "use strict";

  // 沙盒・往上跳跳樂：←→／AD 移動、空白鍵／W／↑ 跳，一層一層往上爬
  // 最上面的人站上新的一層，畫面就往上挪；掉出畫面底部淘汰；走去撞人可以把人推開
  // 參賽者：自己的角色在本機移動（跟伺服器同一套物理），每 50ms 回報位置；被撞、淘汰、層數以伺服器為準
  // 觀眾：每 1 秒拉一次直播緩衝，延遲 1.5 秒播放
  const INPUT_MS = 50;
  const WATCH_MS = 1000;
  const WATCH_DELAY = 1.5;
  const INTERP_DELAY = 0.12; // 參賽者看別人：延遲這麼久在兩格間內插
  const JUMP_BUFFER = 0.15; // 落地前這麼短的時間內按跳也算
  const COYOTE = 0.1; // 剛走出平台邊緣這麼短的時間內還能跳
  const CAM_EASE = 0.13; // 畫面捲動平滑（約 0.4 秒到位）
  const W = 1280;
  const H = 760;
  const TILE = 38;

  const box = document.getElementById("jg");
  const cv = document.getElementById("jg-canvas");
  const ctx = cv.getContext("2d");
  const timerEl = document.getElementById("jg-timer");
  const hudEl = document.getElementById("jg-hud");
  const boardEl = document.getElementById("jg-board");
  const centerEl = document.getElementById("jg-center");
  const liveEl = document.getElementById("jg-live");

  let bridge = null;
  let active = false;
  let mode = null; // "play" / "watch"
  let rnd = null;
  let giftName = "";
  let meName = null;
  let meId = null;
  let roster = new Map(); // id → { name, label }
  let meta = null;
  let cfg = null;
  let platforms = []; // [層, 左緣, 右緣]
  let frames = [];
  let liveFrame = null;
  let watchSince = 0;
  let timers = [];
  let offset = null; // 伺服器時間 − 本機時間
  let inFlight = 0;
  let seq = 0;
  let lastSnapT = -1;
  let me = null; // 本機的自己 { x, y, vy, kvx, grounded, face, groundAt, land }
  let kickAck = 0;
  let jumpAt = -1; // 按跳的時間（本機秒）
  const held = new Set();
  let camShown = null;
  let effects = [];
  let lastMs = null;

  const localSec = () => performance.now() / 1000;
  function noteOffset(serverT) {
    const s = serverT - localSec();
    offset = offset === null || s > offset ? s : offset * 0.95 + s * 0.05;
  }
  const playClock = () => localSec() + (offset || 0);
  const clock = () => (mode === "play" ? playClock() : bridge.serverNow() - WATCH_DELAY);

  // ---------- 開關 ----------
  function stop() {
    timers.forEach(clearInterval);
    timers = [];
    active = false;
    mode = null;
    meta = cfg = liveFrame = me = null;
    platforms = [];
    frames = [];
    effects = [];
    watchSince = 0;
    offset = null;
    seq = 0;
    lastSnapT = -1;
    kickAck = 0;
    jumpAt = -1;
    camShown = null;
    lastMs = null;
    held.clear();
    box.hidden = true;
  }

  function startPlay() {
    mode = "play";
    timers.forEach(clearInterval);
    timers = [setInterval(sendInput, INPUT_MS)];
    sendInput();
    liveEl.hidden = true;
  }

  function startWatch() {
    mode = "watch";
    timers.forEach(clearInterval);
    frames = [];
    watchSince = 0;
    timers = [setInterval(pullWatch, WATCH_MS)];
    pullWatch();
    liveEl.hidden = false;
  }

  // exchange.js 每次輪詢後呼叫（不是往上跳跳樂時傳 null）
  function sync(b, game, gift) {
    bridge = b;
    rnd = game && game.round;
    giftName = gift ? gift.animal + "的禮物" : "禮物";
    meName = game && game.me ? game.me.name : null;
    const phase = rnd && rnd.phase;
    if (!phase || phase === "contest") {
      if (active) stop();
      return;
    }
    if (!active) {
      active = true;
      box.hidden = false;
      requestAnimationFrame(draw);
      console.log("[climbgame] on, in_game", !!(game.me && game.me.in_game));
    }
    const wantPlay = !!(game.me && game.me.in_game) && phase !== "reveal";
    if (wantPlay && mode === null) startPlay();
    else if (!wantPlay && mode !== "watch" && !(mode === "play" && phase === "reveal")) startWatch();
  }

  // ---------- 參賽者：回報與接收 ----------
  function moveDir() {
    const r = held.has("ArrowRight") || held.has("KeyD") ? 1 : 0;
    const l = held.has("ArrowLeft") || held.has("KeyA") ? 1 : 0;
    return r - l;
  }

  async function sendInput() {
    if (mode !== "play" || inFlight >= 1) return;
    inFlight++;
    const body = me
      ? {
          x: me.x, y: me.y, vy: me.vy, grounded: me.grounded, face: me.face, move: moveDir(),
          seq: ++seq, have: platforms.length, kick_ack: kickAck, land: me.land,
        }
      : { x: 0, y: 0, seq: ++seq, have: platforms.length, kick_ack: kickAck };
    try {
      const r = await bridge.api("/api/minigame/climb", body);
      if (!r.ok) {
        if (r.status === 409 && mode === "play") startWatch();
        return;
      }
      takeSnap(r.data);
    } catch (e) {
      /* 網路抖一下，下一輪再送 */
    } finally {
      inFlight--;
    }
  }

  function takeMeta(s) {
    meta = s;
    cfg = s.cfg;
    roster = new Map(s.roster.map((r) => [r.id, r]));
    if (s.pf_from === 0) platforms = s.platforms.slice();
    else if (s.pf_from === platforms.length) platforms = platforms.concat(s.platforms);
  }

  function takeSnap(s) {
    if (s.frame.t < lastSnapT) return; // 晚到的舊回應不採用
    lastSnapT = s.frame.t;
    takeMeta(s);
    meId = s.me;
    noteOffset(s.now);
    pushFrame(s.frame);
    const row = s.frame.p.find((p) => p[0] === meId);
    if (!row) return;
    if (!row[5]) {
      effects.push({ t: localSec(), x: me ? me.x : row[1], y: me ? me.y : row[2], text: "掉出畫面！", color: "#E5484D" });
      startWatch();
      return;
    }
    if (!me || s.corrected) {
      // 準備中、或伺服器不接受：以伺服器位置為準
      me = { x: row[1], y: row[2], vy: 0, kvx: 0, grounded: !!row[6], face: row[3], groundAt: localSec(), land: null };
    }
    (s.kicks || []).forEach((k) => {
      if (k[0] <= kickAck) return;
      kickAck = k[0];
      me.kvx = k[1];
      me.vy = Math.max(me.vy, k[2]);
      me.grounded = false;
      effects.push({ t: localSec(), follow: true, text: "被撞了！", color: "#DE6A93" });
    });
  }

  // ---------- 本機物理（跟 climbgame.py 同一套數字） ----------
  function overlapX(x, ox, w) {
    return Math.abs(x - ox) < w;
  }

  // 腳下能站的表面（地板、平台、別人的頭）：回傳 x 位置上所有表面高度
  function surfaces(x, others) {
    const half = cfg.body_w / 2;
    const tops = [0];
    platforms.forEach(([k, x0, x1]) => {
      if (x + half > x0 && x - half < x1) tops.push(k * cfg.floor_h);
    });
    others.forEach((o) => {
      if (o.alive && overlapX(x, o.x, cfg.body_w)) tops.push(o.y + cfg.body_h);
    });
    return tops;
  }

  function stepMe(dt, others) {
    const now = localSec();
    const move = moveDir();
    if (move) me.face = move;
    me.kvx *= Math.exp(-5 * dt);
    // 水平：走＋被撞的擊退；撞到別人就停在旁邊（推人的效果由伺服器送給對方）
    let x = me.x + (move * cfg.speed + me.kvx) * dt;
    x = Math.min(Math.max(x, cfg.body_w / 2), cfg.w - cfg.body_w / 2);
    others.forEach((o) => {
      if (!o.alive || Math.abs(o.y - me.y) >= cfg.body_h * 0.8) return;
      if (Math.abs(x - o.x) < cfg.body_w) x = o.x + (me.x <= o.x ? -cfg.body_w : cfg.body_w);
    });
    me.x = Math.min(Math.max(x, cfg.body_w / 2), cfg.w - cfg.body_w / 2);
    // 腳下還有沒有東西（走出平台邊緣就開始掉）
    if (me.grounded && !surfaces(me.x, others).some((t) => Math.abs(t - me.y) < 0.05)) me.grounded = false;
    if (me.grounded) me.groundAt = now;
    // 起跳：落地前的緩衝、走出邊緣的寬容
    if (jumpAt >= 0 && now - jumpAt <= JUMP_BUFFER && (me.grounded || now - me.groundAt <= COYOTE)) {
      me.vy = cfg.jump_v;
      me.grounded = false;
      me.groundAt = -1;
      jumpAt = -1;
    }
    if (me.grounded) {
      me.vy = 0;
      return;
    }
    const prev = me.y;
    me.vy -= cfg.gravity * dt;
    me.y += me.vy * dt;
    if (me.vy <= 0) {
      // 從上面落下才會站住（平台是單向的）；取最高的那個
      const land = surfaces(me.x, others).filter((t) => prev >= t - 1e-6 && me.y <= t);
      if (land.length) {
        me.y = Math.max(...land);
        me.vy = 0;
        me.grounded = true;
        me.groundAt = now;
        me.land = [me.x, me.y]; // 落地點一起回報（落地馬上又跳時，伺服器才知道站上了哪一層）
      }
    }
  }

  function canAct() {
    return mode === "play" && me && cfg && meta && playClock() >= meta.play_start && !meta.finished_at;
  }

  function typing(e) {
    const t = e.target;
    return t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT");
  }
  const MOVE_KEYS = new Set(["ArrowLeft", "ArrowRight", "KeyA", "KeyD"]);
  const JUMP_KEYS = new Set(["Space", "KeyW", "ArrowUp"]);
  window.addEventListener("keydown", (e) => {
    if (mode !== "play" || typing(e)) return;
    if (MOVE_KEYS.has(e.code)) {
      held.add(e.code);
      e.preventDefault();
    } else if (JUMP_KEYS.has(e.code)) {
      e.preventDefault();
      if (!e.repeat) jumpAt = localSec();
    }
  });
  window.addEventListener("keyup", (e) => held.delete(e.code));
  window.addEventListener("blur", () => held.clear());

  // ---------- 觀眾 ----------
  async function pullWatch() {
    if (mode !== "watch") return;
    let r;
    try {
      r = await bridge.api("/api/minigame/watch?since=" + watchSince);
    } catch (e) {
      return;
    }
    if (!r.ok || mode !== "watch") return;
    takeMeta(r.data);
    liveFrame = r.data.frame;
    r.data.frames.forEach(pushFrame);
    if (frames.length) watchSince = frames[frames.length - 1].t;
  }

  // ---------- 畫面緩衝 ----------
  function pushFrame(f) {
    const last = frames[frames.length - 1];
    if (last && f.t <= last.t) return;
    if (last) noteFalls(last, f);
    frames.push(f);
    while (frames.length > 2 && frames[1].t < f.t - 3) frames.shift();
  }

  // 別人掉出畫面：跟著畫面時間跳字
  function noteFalls(prev, f) {
    const before = new Map(prev.p.map((p) => [p[0], p]));
    f.p.forEach((p) => {
      const q = before.get(p[0]);
      if (q && q[5] && !p[5] && !(mode === "play" && p[0] === meId)) {
        effects.push({ frameT: f.t, x: q[1], y: q[2], text: "淘汰！", color: "#E5484D" });
      }
    });
  }

  function sample(t) {
    if (!frames.length) return null;
    if (t <= frames[0].t) return { a: frames[0], b: null, k: 0 };
    for (let i = frames.length - 1; i >= 0; i--) {
      if (frames[i].t <= t) {
        const a = frames[i];
        const b = frames[i + 1] || null;
        return { a, b, k: b ? (t - a.t) / (b.t - a.t) : 0 };
      }
    }
    return { a: frames[0], b: null, k: 0 };
  }

  const lerp = (a, b, k) => a + (b - a) * k;

  // 時間 t 的所有人：a→b 內插 → [{ id, x, y, face, floor, alive }]
  function peopleAt(v) {
    if (!v) return [];
    const next = v.b ? new Map(v.b.p.map((p) => [p[0], p])) : null;
    return v.a.p.map((p) => {
      const q = next && next.get(p[0]);
      const row = q && v.k > 0.5 ? q : p;
      return {
        id: p[0], x: q ? lerp(p[1], q[1], v.k) : p[1], y: q ? lerp(p[2], q[2], v.k) : p[2],
        face: row[3], floor: row[4], alive: !!row[5],
      };
    });
  }

  // ---------- 繪圖 ----------
  const OX = (W - 24 * TILE) / 2; // 場地寬 24 格置中
  let cam = 0;
  const px = (x) => OX + x * TILE;
  const py = (y) => H - (y - cam) * TILE;

  function R(x, y, w, h, c) {
    ctx.fillStyle = c;
    ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  }

  function text(str, x, y, size, color, stroke) {
    ctx.font = "bold " + size + "px " + bridge.font;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    if (stroke) {
      ctx.lineWidth = Math.max(4, size / 6);
      ctx.strokeStyle = stroke;
      ctx.strokeText(str, x, y);
    }
    ctx.fillStyle = color;
    ctx.fillText(str, x, y);
  }

  function drawStage() {
    const fw = (cfg ? cfg.w : 24) * TILE;
    const fh = cfg ? cfg.floor_h : 3;
    // 兩側木牆，中間粉嫩室內牆（每層一條腰線，跟著畫面捲動）
    R(0, 0, W, H, "#5B3A2A");
    for (let y = ((cam * TILE) % 64) - 64; y < H; y += 64) R(0, H - y - 8, W, 8, "#4A2F22");
    R(OX, 0, fw, H, "#FBE7EC");
    const k0 = Math.floor(cam / fh);
    for (let k = k0; k <= k0 + 8; k++) {
      const y = py(k * fh);
      R(OX, y - 1, fw, 2, "#F3CFD9");
      if (k >= 0) {
        // 左側樓層牌
        R(OX - 58, y - 28, 50, 26, "#2A1A10");
        R(OX - 56, y - 26, 46, 22, k % 2 ? "#BFDDF5" : "#F6B7C8");
        text(k + " 樓", OX - 33, y - 15, 16, "#2A1A10");
      }
    }
    R(OX - 6, 0, 6, H, "#2A1A10");
    R(OX + fw, 0, 6, H, "#2A1A10");
  }

  function drawPlatform(x0, x1, y, isGround) {
    const X = px(x0);
    const w = (x1 - x0) * TILE;
    const Y = py(y);
    if (isGround) {
      R(X, Y, w, H - Y + 2, "#8B5A3C");
      for (let x = X; x < X + w; x += 76) R(x, Y + 6, 3, H, "#6E4730");
      R(X, Y, w, 6, "#FFF6EA");
      R(X, Y - 2, w, 2, "#2A1A10");
      return;
    }
    R(X - 2, Y - 2, w + 4, 18, "#2A1A10"); // 外框
    R(X, Y, w, 14, "#8B5A3C");
    R(X, Y, w, 4, "#FFF6EA"); // 奶油白上緣
    for (let x = X + 36; x < X + w - 4; x += 38) R(x, Y + 5, 2, 9, "#6E4730");
    R(X, Y + 14, w, 4, "rgba(42,26,16,0.25)"); // 紙片投影
  }

  // 角色：方塊＋兩顆眼睛（瞳孔看向面向），頭上名牌寫層數
  function drawPerson(o, isMe) {
    const info = roster.get(o.id) || { name: "?", label: null };
    const s = (cfg ? cfg.body_w : 0.8) * TILE; // 30 px
    const cx = Math.round(px(o.x));
    const by = Math.round(py(o.y)); // 腳底
    const top = by - s;
    ctx.globalAlpha = o.alive ? 1 : 0.35;
    if (isMe) R(cx - s / 2 - 3, top - 3, s + 6, s + 6, "#DE6A93");
    R(cx - s / 2, top, s, s, "#2A1A10");
    R(cx - s / 2 + 2, top + 2, s - 4, s - 4, o.alive ? bridge.tagColor(info.label) : "#B9B4AC");
    if (o.alive) {
      R(cx - 9, top + 7, 7, 8, "#FFFFFF");
      R(cx + 2, top + 7, 7, 8, "#FFFFFF");
      R(cx - 7 + o.face * 2, top + 9, 4, 5, "#2A1A10");
      R(cx + 4 + o.face * 2, top + 9, 4, 5, "#2A1A10");
    } else {
      R(cx - 9, top + 11, 7, 2, "#2A1A10");
      R(cx + 2, top + 11, 7, 2, "#2A1A10");
    }
    ctx.globalAlpha = 1;
    ctx.font = "bold 16px " + bridge.font;
    const label = info.name + "・" + o.floor + " 樓";
    const w = ctx.measureText(label).width + 10;
    R(cx - w / 2 - 2, top - 30, w + 4, 24, "#2A1A10");
    R(cx - w / 2, top - 28, w, 20, isMe ? "#FFE1EA" : "#FFF6EA");
    text(label, cx, top - 18, 16, "#2A1A10");
  }

  function drawEffects(frameT) {
    const now = localSec();
    effects = effects.filter((e) => {
      const age = e.frameT !== undefined ? frameT - e.frameT : now - e.t;
      if (age > 0.9) return false;
      if (age < 0) return true; // 延遲播放的畫面還沒播到
      const x = e.follow && me ? me.x : e.x;
      const y = e.follow && me ? me.y : e.y;
      text(e.text, px(x), py(y) - 52 - age * 40, 22, e.color, "#FFF6EA");
      return true;
    });
  }

  function draw(ms) {
    if (!active) return;
    const dt = lastMs === null ? 0 : Math.min(0.05, (ms - lastMs) / 1000);
    lastMs = ms;
    const t = clock();
    const v = sample(mode === "play" ? t - INTERP_DELAY : t);
    let people = peopleAt(v);
    if (mode === "play" && me && cfg) {
      const others = people.filter((o) => o.id !== meId);
      if (canAct()) {
        for (let left = dt; left > 1e-6; left -= 0.01) stepMe(Math.min(0.01, left), others);
      }
      const mine = people.find((o) => o.id === meId);
      people = others.concat([{ id: meId, x: me.x, y: me.y, face: me.face, floor: mine ? mine.floor : 0, alive: true }]);
    }
    // 畫面底線：伺服器決定，這裡只做平滑捲動（只往上）
    const target = v ? (v.b ? lerp(v.a.cam, v.b.cam, v.k) : v.a.cam) : liveFrame ? liveFrame.cam : -1;
    camShown = camShown === null ? target : Math.max(camShown, camShown + (target - camShown) * (1 - Math.exp(-dt / CAM_EASE)));
    cam = camShown;
    drawStage();
    if (cfg) {
      const fh = cfg.floor_h;
      drawPlatform(0, cfg.w, 0, true);
      platforms.forEach(([k, x0, x1]) => {
        const y = k * fh;
        if (y >= cam - 1 && y <= cam + cfg.view_h + 1) drawPlatform(x0, x1, y, false);
      });
    }
    // 畫面底部的危險線
    R(OX, H - 6, (cfg ? cfg.w : 24) * TILE, 6, "rgba(229,72,77,0.7)");
    people
      .sort((a, b) => (a.id === meId) - (b.id === meId))
      .forEach((o) => drawPerson(o, o.id === meId || (roster.get(o.id) || {}).name === meName));
    drawEffects(v ? v.a.t : 0);
    updateHud(t, people);
    requestAnimationFrame(draw);
  }

  // ---------- HUD 與中央訊息 ----------
  function mmss(sec) {
    const s = Math.max(0, Math.ceil(sec));
    return String(Math.floor(s / 60)).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0");
  }

  function esc(s) {
    return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  }

  function updateHud(t, people) {
    if (!meta) return;
    const tt = mode === "play" ? t : bridge.serverNow();
    if (tt < meta.play_start) timerEl.textContent = "準備";
    else if (meta.finished_at) timerEl.textContent = "結束";
    else timerEl.textContent = mmss(meta.play_end - tt);
    timerEl.classList.toggle("urgent", !meta.finished_at && tt >= meta.play_start && meta.play_end - tt <= 10);
    // 計分板：層數高的在上，淘汰的灰掉
    const rows = people
      .map((o) => ({ ...o, name: (roster.get(o.id) || {}).name || "?" }))
      .sort((a, b) => b.alive - a.alive || b.floor - a.floor);
    const key = JSON.stringify(rows.map((r) => [r.id, r.floor, r.alive]));
    if (boardEl.dataset.key !== key) {
      boardEl.dataset.key = key;
      boardEl.innerHTML = rows
        .map((r) => {
          const cls = [r.id === meId || r.name === meName ? "me" : "", r.alive ? "" : "out"].join(" ").trim();
          return '<li class="' + cls + '">' + esc(r.name) + "　" + r.floor + " 樓</li>";
        })
        .join("");
    }
    let hud = "";
    if (mode === "play") hud = "←→／AD 移動，空白鍵／W／↑ 跳";
    else if (meta.ranking === null && meName && roster.size && [...roster.values()].some((r) => r.name === meName)) hud = "你掉出畫面了";
    hudEl.textContent = hud;
    hudEl.hidden = !hud;
    const phase = rnd ? rnd.phase : meta.phase;
    let html = "";
    if (phase === "reveal" && rnd && rnd.ranking) {
      html =
        '<p class="mg-big mg-win">' + esc(rnd.winner_name || rnd.ranking[0].name) + " 拿到" + esc(giftName) + "！</p>" +
        '<ol class="mg-rank">' +
        rnd.ranking.map((r) => "<li>" + esc(r.name) + "　" + r.floor + " 樓" + (r.alive ? "" : "　淘汰") + "</li>").join("") +
        "</ol>";
    } else if (tt < meta.play_start) {
      const n = Math.ceil(meta.play_start - tt);
      html =
        n <= 3
          ? '<p class="mg-big">' + n + "</p>"
          : '<p class="mg-title">往上跳跳樂・' + esc(giftName) + (mode === "play" ? "" : "（直播）") + "</p>" +
            '<ul class="mg-rules">' +
            "<li><b>←→ 或 AD</b> 移動，<b>空白鍵、W 或 ↑</b> 跳，平台可以從下面穿上去</li>" +
            "<li>最上面的人爬上新的一層，<b>畫面就往上挪</b></li>" +
            "<li>走去撞人可以<b>把人推開</b>，也能踩在別人頭上</li>" +
            "<li><b>掉出畫面就淘汰</b>，最後留在場上、<b>層數最高</b>的人贏</li>" +
            "</ul>" +
            '<p class="mg-tip">' + n + " 秒後開始</p>";
    }
    if (centerEl.dataset.html !== html) {
      centerEl.dataset.html = html;
      centerEl.innerHTML = html;
      centerEl.hidden = !html;
    }
  }

  window.ExClimbgame = { sync, stop };
})();
