(function () {
  "use strict";

  // 沙盒・誰是乖孩子：大家坐圓桌吃西瓜，長按右鍵吃（吃滿 5 口），左鍵點對手吐籽（吐完 5 顆再吃）
  // 媽媽（電腦）閉眼禱告時才能動；她突然睜眼時，正在吃或吐的人被一巴掌打死
  // 參賽者：每 50ms 回報右鍵按著沒、點了誰；按下／放開／點擊立刻送；吃了幾口、吐中沒、被打沒以伺服器為準
  // 觀眾：每 1 秒拉一次直播緩衝，延遲 1.5 秒播放
  const INPUT_MS = 50;
  const WATCH_MS = 1000;
  const WATCH_DELAY = 1.5;
  const W = 1280;
  const H = 760;
  const CX = W / 2;
  const CY = 430;
  const RX = 400; // 座位圍成的橢圓
  const RY = 250;
  const HIT_R = 40; // 點到對手的判定半徑

  const box = document.getElementById("mm");
  const cv = document.getElementById("mm-canvas");
  const ctx = cv.getContext("2d");
  const timerEl = document.getElementById("mm-timer");
  const hudEl = document.getElementById("mm-hud");
  const boardEl = document.getElementById("mm-board");
  const centerEl = document.getElementById("mm-center");
  const liveEl = document.getElementById("mm-live");

  let bridge = null;
  let active = false;
  let mode = null; // "play" / "watch"
  let rnd = null;
  let giftName = "";
  let meName = null;
  let meId = null;
  let roster = []; // [{ id, name, label }]
  let meta = null;
  let frames = [];
  let liveFrame = null;
  let latest = null; // 參賽者：最新快照的畫面
  let watchSince = 0;
  let timers = [];
  let offset = null; // 伺服器時間 − 本機時間
  let inFlight = 0;
  let seq = 0;
  let lastSnapT = -1;
  let holding = false; // 右鍵按著
  let spitQueue = []; // 還沒送出的吐籽目標
  let localSeeds = []; // 自己剛吐、本機先畫的籽 { to, t0 }
  let aim = null; // 滑鼠目前指著的對手 id
  let effects = [];
  const events = new Map();
  const seen = new Set();
  let lastMs = null;

  const localSec = () => performance.now() / 1000;
  function noteOffset(serverT) {
    const s = serverT - localSec();
    offset = offset === null || s > offset ? s : offset * 0.95 + s * 0.05;
  }
  const clock = () => (mode === "play" ? localSec() + (offset || 0) : bridge.serverNow() - WATCH_DELAY);

  // ---------- 開關 ----------
  function stop() {
    timers.forEach(clearInterval);
    timers = [];
    active = false;
    mode = null;
    meta = latest = liveFrame = null;
    frames = [];
    effects = [];
    events.clear();
    seen.clear();
    watchSince = 0;
    offset = null;
    seq = 0;
    lastSnapT = -1;
    holding = false;
    spitQueue = [];
    localSeeds = [];
    aim = null;
    lastMs = null;
    box.hidden = true;
  }

  function startPlay() {
    mode = "play";
    timers.forEach(clearInterval);
    timers = [setInterval(() => send(false), INPUT_MS)];
    send(false);
    liveEl.hidden = true;
  }

  function startWatch() {
    mode = "watch";
    holding = false;
    timers.forEach(clearInterval);
    frames = [];
    watchSince = 0;
    timers = [setInterval(pullWatch, WATCH_MS)];
    pullWatch();
    liveEl.hidden = false;
  }

  // exchange.js 每次輪詢後呼叫（不是誰是乖孩子時傳 null）
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
      console.log("[momgame] on, in_game", !!(game.me && game.me.in_game));
    }
    const wantPlay = !!(game.me && game.me.in_game) && phase !== "reveal";
    if (wantPlay && mode === null) startPlay();
    else if (!wantPlay && mode !== "watch" && !(mode === "play" && phase === "reveal")) startWatch();
  }

  // ---------- 參賽者：回報 ----------
  async function send(urgent) {
    if (mode !== "play") return;
    if (inFlight >= (urgent ? 2 : 1)) return; // 按下／放開／吐籽可以插隊一次
    const spits = spitQueue;
    spitQueue = [];
    inFlight++;
    try {
      const r = await bridge.api("/api/minigame/mom", { hold: holding, spits, seq: ++seq });
      if (!r.ok) {
        if (r.status === 409 && mode === "play") startWatch();
        return;
      }
      takeSnap(r.data);
    } catch (e) {
      spitQueue = spits.concat(spitQueue); // 網路抖一下，下一輪再送
    } finally {
      inFlight--;
    }
  }

  function takeSnap(s) {
    if (s.frame.t < lastSnapT) return; // 晚到的舊回應不採用
    lastSnapT = s.frame.t;
    meta = s;
    meId = s.me;
    roster = s.roster;
    noteOffset(s.now);
    latest = s.frame;
    collect(s.frame);
    const mine = s.frame.p.find((p) => p[0] === meId);
    if (mine && !mine[2]) {
      holding = false;
      startWatch();
    }
  }

  function myRow() {
    return latest ? latest.p.find((p) => p[0] === meId) : null;
  }

  function canAct() {
    return mode === "play" && meta && clock() >= meta.play_start && !meta.finished_at;
  }

  // 畫布座標（canvas 有縮放，要換算）
  function canvasPoint(e) {
    const r = cv.getBoundingClientRect();
    return { x: ((e.clientX - r.left) * W) / r.width, y: ((e.clientY - r.top) * H) / r.height };
  }

  function opponentAt(pt) {
    let best = null;
    roster.forEach((r) => {
      if (r.id === meId) return;
      const p = seatOf(r.id);
      const d = Math.hypot(pt.x - p.x, pt.y - p.y);
      if (d <= HIT_R && (!best || d < best.d)) best = { id: r.id, d };
    });
    return best ? best.id : null;
  }

  cv.addEventListener("contextmenu", (e) => e.preventDefault()); // 右鍵不要跳選單
  cv.addEventListener("pointerdown", (e) => {
    if (!canAct()) return;
    e.preventDefault();
    if (e.button === 2) {
      // 右鍵：開始吃（按著）
      if (!holding) {
        holding = true;
        send(true);
      }
    } else if (e.button === 0) {
      // 左鍵：點到誰就吐誰（按下去當下就算，不等放開）
      const target = opponentAt(canvasPoint(e));
      const row = myRow();
      const left = row ? row[5] - localSeeds.filter((s) => s.pending).length : 0;
      if (target === null || !row || row[3] !== "spit" || left <= 0) return;
      spitQueue.push(target);
      localSeeds.push({ to: target, t0: localSec(), pending: true });
      send(true);
    }
  });
  function releaseHold() {
    if (holding) {
      holding = false;
      send(true);
    }
  }
  window.addEventListener("pointerup", (e) => {
    if (e.button === 2) releaseHold();
  });
  window.addEventListener("blur", releaseHold);
  cv.addEventListener("pointermove", (e) => {
    aim = mode === "play" ? opponentAt(canvasPoint(e)) : null;
  });
  cv.addEventListener("pointerleave", () => (aim = null));

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
    meta = r.data;
    roster = meta.roster;
    liveFrame = meta.frame;
    meta.frames.forEach((f) => {
      if (!frames.length || f.t > frames[frames.length - 1].t) frames.push(f);
      collect(f);
    });
    if (frames.length) watchSince = frames[frames.length - 1].t;
    while (frames.length > 2 && frames[1].t < bridge.serverNow() - WATCH_DELAY - 2) frames.shift();
  }

  function currentFrame() {
    if (mode === "play") return latest;
    const t = clock();
    for (let i = frames.length - 1; i >= 0; i--) if (frames[i].t <= t) return frames[i];
    return liveFrame;
  }

  function collect(f) {
    (f.ev || []).forEach((ev) => {
      const key = ev[0] + "|" + ev[1] + "|" + ev[2].join(",");
      if (!events.has(key)) events.set(key, ev);
    });
  }

  // 命中、被打在畫面時間走到時才跳特效
  function fireEvents(t) {
    events.forEach((ev, key) => {
      if (seen.has(key) || ev[0] > t) return;
      seen.add(key);
      if (t - ev[0] > 1) return; // 太舊的不補跳
      const [, kind, ids] = ev;
      const p = seatOf(ids[0]);
      if (!p) return;
      if (kind === "hit") effects.push({ t: localSec(), x: p.x, y: p.y - 60, text: "-1", color: "#E5484D", flash: ids[0] });
      else if (kind === "slap") effects.push({ t: localSec(), x: p.x, y: p.y - 60, text: "啪！", color: "#E5484D", slap: ids[0], big: true });
      else if (kind === "spit" && mode === "play" && ids[0] === meId) {
        const i = localSeeds.findIndex((s) => s.pending && s.to === ids[1]);
        if (i >= 0) localSeeds[i].pending = false; // 伺服器確認吐出去了
      }
    });
  }

  // ---------- 座位 ----------
  // 媽媽坐最上面；參賽者平均坐在其他位置
  function seatOf(id) {
    const i = roster.findIndex((r) => r.id === id);
    if (i < 0) return null;
    const a = -Math.PI / 2 + ((i + 1) * 2 * Math.PI) / (roster.length + 1);
    return { x: CX + RX * Math.cos(a), y: CY + RY * Math.sin(a) };
  }
  const MOM = { x: CX, y: CY - RY };

  // ---------- 繪圖 ----------
  function R(x, y, w, h, c) {
    ctx.fillStyle = c;
    ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  }

  function text(str, x, y, size, color, stroke) {
    ctx.font = "bold " + size + "px " + bridge.font;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    if (stroke) {
      ctx.lineWidth = Math.max(4, size / 7);
      ctx.strokeStyle = stroke;
      ctx.strokeText(str, x, y);
    }
    ctx.fillStyle = color;
    ctx.fillText(str, x, y);
  }

  function drawRoom(momOpen) {
    R(0, 0, W, H, "#8B5A3C"); // 木地板
    for (let y = 0; y < H; y += 48) R(0, y, W, 3, "#6E4730");
    // 圓桌：深色外框＋奶油白桌布（用一圈圈矩形拼成橢圓，不用漸層）
    ctx.fillStyle = "#2A1A10";
    ctx.beginPath();
    ctx.ellipse(CX, CY, 300, 170, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#FFF6EA";
    ctx.beginPath();
    ctx.ellipse(CX, CY, 292, 162, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#F6B7C8";
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.ellipse(CX, CY, 260, 136, 0, 0, Math.PI * 2);
    ctx.stroke();
    // 中央一盤西瓜
    R(CX - 60, CY - 14, 120, 30, "#2A1A10");
    R(CX - 56, CY - 10, 112, 22, "#BFDDF5");
    for (let i = 0; i < 3; i++) drawSlice(CX - 40 + i * 30, CY + 4, 1, 0.8);
    // 媽媽睜眼：整個畫面加一圈紅色警示框
    if (momOpen) {
      R(0, 0, W, 10, "#E5484D");
      R(0, H - 10, W, 10, "#E5484D");
      R(0, 0, 10, H, "#E5484D");
      R(W - 10, 0, 10, H, "#E5484D");
    }
  }

  // 一片西瓜：綠皮、紅肉、黑籽；left 0～1 是剩下多少（吃越多越小）
  function drawSlice(x, y, left, scale) {
    const s = scale || 1;
    const w = Math.max(6, 34 * left) * s;
    R(x - w / 2 - 2, y - 14 * s - 2, w + 4, 18 * s + 4, "#2A1A10");
    R(x - w / 2, y + 0, w, 4 * s, "#3E7D4F"); // 皮
    R(x - w / 2, y - 2 * s, w, 2 * s, "#CDEBD8");
    if (left > 0) {
      R(x - w / 2, y - 14 * s, w, 12 * s, "#E5484D"); // 肉
      for (let i = 0; i < Math.round(3 * left); i++) R(x - w / 2 + 5 * s + i * 9 * s, y - 10 * s + (i % 2) * 4 * s, 3 * s, 4 * s, "#2A1A10");
    }
  }

  function drawMom(open, ms) {
    const { x, y } = MOM;
    const s = 64;
    R(x - s / 2 - 4, y - s / 2 - 4, s + 8, s + 8, "#2A1A10");
    R(x - s / 2, y - s / 2, s, s, "#F6D3B5"); // 臉
    R(x - s / 2, y - s / 2, s, 16, "#DE6A93"); // 頭巾
    for (let i = 0; i < 4; i++) R(x - s / 2 + 6 + i * 16, y - s / 2 + 5, 5, 5, "#FFF6EA");
    if (open) {
      R(x - 22, y - 6, 18, 18, "#FFFFFF");
      R(x + 4, y - 6, 18, 18, "#FFFFFF");
      R(x - 17, y - 1, 9, 10, "#E5484D");
      R(x + 9, y - 1, 9, 10, "#E5484D");
      R(x - 8, y + 20, 16, 5, "#2A1A10"); // 嘴
      text("我看到了喔！", x, y - s / 2 - 26, 22, "#E5484D", "#FFF6EA");
    } else {
      R(x - 22, y + 2, 18, 3, "#2A1A10");
      R(x + 4, y + 2, 18, 3, "#2A1A10");
      R(x - 6, y + 20, 12, 3, "#2A1A10");
      // 雙手合十
      R(x - 10, y + s / 2 + 2, 9, 20, "#2A1A10");
      R(x + 1, y + s / 2 + 2, 9, 20, "#2A1A10");
      R(x - 8, y + s / 2 + 4, 6, 16, "#F6D3B5");
      R(x + 2, y + s / 2 + 4, 6, 16, "#F6D3B5");
      text("禱告中" + ".".repeat(1 + (Math.floor(ms / 400) % 3)), x, y - s / 2 - 26, 18, "#5B98D6", "#FFF6EA");
    }
    text("媽媽", x, y + s / 2 + 36, 18, "#2A1A10", "#FFF6EA");
  }

  // 一個人：方塊＋眼睛（看向桌子中央），手上西瓜、頭上嘴裡的籽、名牌、血條
  function drawPerson(info, row, isMe, flash, slapped) {
    const p = seatOf(info.id);
    const alive = row ? !!row[2] : true;
    const hp = row ? row[1] : 10;
    const modeNow = row ? row[3] : "eat";
    const bites = row ? row[4] : 0;
    const seeds = row ? row[5] - (isMe ? localSeeds.filter((x) => x.pending).length : 0) : 0;
    const acting = row ? !!row[6] : false;
    const s = 46;
    const dx = Math.sign(CX - p.x);
    const dy = Math.sign(CY - p.y);
    ctx.globalAlpha = alive ? 1 : 0.35;
    if (aim === info.id && alive) {
      // 準星
      R(p.x - 34, p.y - 2, 68, 4, "#E5484D");
      R(p.x - 2, p.y - 34, 4, 68, "#E5484D");
    }
    if (isMe) R(p.x - s / 2 - 4, p.y - s / 2 - 4, s + 8, s + 8, "#DE6A93");
    R(p.x - s / 2, p.y - s / 2, s, s, "#2A1A10");
    R(p.x - s / 2 + 3, p.y - s / 2 + 3, s - 6, s - 6, flash ? "#E5484D" : alive ? bridge.tagColor(info.label) : "#B9B4AC");
    if (alive) {
      R(p.x - 14, p.y - 10, 11, 12, "#FFFFFF");
      R(p.x + 3, p.y - 10, 11, 12, "#FFFFFF");
      R(p.x - 11 + dx * 2, p.y - 7 + dy * 2, 5, 6, "#2A1A10");
      R(p.x + 6 + dx * 2, p.y - 7 + dy * 2, 5, 6, "#2A1A10");
      // 嘴：正在吃時一開一合
      const chomp = acting && modeNow === "eat" && Math.floor(lastMs / 120) % 2 === 0;
      R(p.x - 6, p.y + 8, 12, chomp ? 7 : 3, "#2A1A10");
    } else {
      R(p.x - 14, p.y - 4, 11, 3, "#2A1A10");
      R(p.x + 3, p.y - 4, 11, 3, "#2A1A10");
    }
    ctx.globalAlpha = 1;
    // 手上的西瓜（朝桌子那一側）：吃的階段越吃越小，吐的階段只剩瓜皮
    const hx = p.x + dx * 40;
    const hy = p.y + dy * 18 + 8;
    if (alive) drawSlice(hx, hy, modeNow === "eat" ? (5 - bites) / 5 : 0, 1);
    // 頭上：嘴裡的籽
    if (alive && seeds > 0) {
      for (let i = 0; i < seeds; i++) R(p.x - 24 + i * 10, p.y - s / 2 - 16, 6, 8, "#2A1A10");
    }
    // 名牌＋血條
    ctx.font = "bold 18px " + bridge.font;
    const w = ctx.measureText(info.name).width + 14;
    R(p.x - w / 2 - 2, p.y + s / 2 + 10, w + 4, 26, "#2A1A10");
    R(p.x - w / 2, p.y + s / 2 + 12, w, 22, isMe ? "#FFE1EA" : "#FFF6EA");
    text(info.name, p.x, p.y + s / 2 + 23, 18, "#2A1A10");
    for (let i = 0; i < 10; i++) R(p.x - 35 + i * 7, p.y + s / 2 + 40, 5, 6, i < hp ? "#E5484D" : "#6B5A55");
    if (!alive) text("淘汰", p.x, p.y - s / 2 - 14, 18, "#E5484D", "#FFF6EA");
    // 媽媽的巴掌
    if (slapped) {
      R(p.x - 30, p.y - 60, 60, 34, "#2A1A10");
      R(p.x - 26, p.y - 56, 52, 26, "#F6D3B5");
      for (let i = 0; i < 4; i++) R(p.x - 24 + i * 13, p.y - 70, 9, 16, "#F6D3B5");
    }
  }

  // 籽：黑色橢圓沿直線飛（伺服器的＋自己剛吐、還沒確認的）
  function drawSeed(a, b, k) {
    const x = a.x + (b.x - a.x) * k;
    const y = a.y + (b.y - a.y) * k - Math.sin(k * Math.PI) * 30; // 微微拋物線
    R(x - 6, y - 4, 12, 8, "#2A1A10");
    R(x - 3, y - 3, 3, 2, "#6B5A55");
  }

  function drawSeeds(f, t) {
    const flight = meta ? meta.cfg.seed_flight : 0.5;
    (f.s || []).forEach(([, from, to, t0, t1]) => {
      if (mode === "play" && from === meId) return; // 自己的用本機的畫（不延遲）
      if (t < t0 || t >= t1) return;
      const a = seatOf(from);
      const b = seatOf(to);
      if (a && b) drawSeed(a, b, (t - t0) / (t1 - t0));
    });
    const now = localSec();
    localSeeds = localSeeds.filter((s) => now - s.t0 < flight + 0.5);
    localSeeds.forEach((s) => {
      const k = (now - s.t0) / flight;
      if (k >= 1) return;
      const a = seatOf(meId);
      const b = seatOf(s.to);
      if (a && b) drawSeed(a, b, k);
    });
  }

  function drawEffects() {
    const now = localSec();
    effects = effects.filter((e) => {
      const age = now - e.t;
      if (age > 0.9) return false;
      text(e.text, e.x, e.y - age * 40, e.big ? 40 : 26, e.color, "#FFF6EA");
      return true;
    });
  }

  function draw(ms) {
    if (!active) return;
    lastMs = ms;
    const t = clock();
    const f = currentFrame();
    fireEvents(t);
    const momOpen = !!(f && f.mom && f.mom[0]) && !(meta && meta.finished_at);
    drawRoom(momOpen);
    drawMom(momOpen, ms);
    if (f && roster.length) {
      const rows = new Map(f.p.map((p) => [p[0], p]));
      const now = localSec();
      const flashing = new Set(effects.filter((e) => e.flash && now - e.t < 0.3).map((e) => e.flash));
      const slapping = new Set(effects.filter((e) => e.slap && now - e.t < 0.5).map((e) => e.slap));
      roster.forEach((info) => {
        const isMe = info.id === meId || info.name === meName;
        drawPerson(info, rows.get(info.id), isMe, flashing.has(info.id) && Math.floor(ms / 80) % 2 === 0, slapping.has(info.id));
      });
      drawSeeds(f, t);
    }
    drawEffects();
    updateHud(t, f, momOpen);
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

  function updateHud(t, f, momOpen) {
    if (!meta) return;
    const tt = mode === "play" ? t : bridge.serverNow();
    if (tt < meta.play_start) timerEl.textContent = "準備";
    else if (meta.finished_at) timerEl.textContent = "結束";
    else timerEl.textContent = mmss(meta.play_end - tt);
    timerEl.classList.toggle("urgent", !meta.finished_at && tt >= meta.play_start && meta.play_end - tt <= 10);
    // 計分板：還在場上的在前，血多的在上；淘汰的劃掉
    if (f) {
      const names = new Map(roster.map((r) => [r.id, r.name]));
      const mouth = (r) => (r[3] === "eat" ? r[4] : r[5]);
      const rows = f.p.slice().sort((a, b) => b[2] - a[2] || b[1] - a[1] || mouth(b) - mouth(a));
      const key = JSON.stringify(rows.map((r) => [r[0], r[1], r[2], mouth(r)]));
      if (boardEl.dataset.key !== key) {
        boardEl.dataset.key = key;
        boardEl.innerHTML = rows
          .map((r) => {
            const name = names.get(r[0]) || "?";
            const cls = [r[0] === meId || name === meName ? "me" : "", r[2] ? "" : "out"].join(" ").trim();
            return '<li class="' + cls + '">' + esc(name) + "　血 " + r[1] + "　籽 " + mouth(r) + "</li>";
          })
          .join("");
      }
    }
    let hud = "";
    if (mode === "play" && latest && tt >= meta.play_start && !meta.finished_at) {
      const row = myRow();
      if (row && !row[2]) hud = "你被淘汰了";
      else if (momOpen) hud = "媽媽在看！不要動！";
      else if (row && row[3] === "spit") hud = "左鍵點對手吐籽（剩 " + row[5] + " 顆）";
      else hud = "長按右鍵吃西瓜（" + (row ? row[4] : 0) + "/5）";
    }
    hudEl.textContent = hud;
    hudEl.hidden = !hud;
    hudEl.classList.toggle("mm-alert", hud === "媽媽在看！不要動！");
    const phase = rnd ? rnd.phase : meta.phase;
    let html = "";
    if (phase === "reveal" && rnd && rnd.ranking) {
      html =
        '<p class="mg-big mg-win">' + esc(rnd.winner_name || rnd.ranking[0].name) + " 拿到" + esc(giftName) + "！</p>" +
        '<ol class="mg-rank">' +
        rnd.ranking
          .map((r) => "<li>" + esc(r.name) + "　血 " + r.hp + "　籽 " + r.seeds + (r.alive ? "" : "　淘汰") + "</li>")
          .join("") +
        "</ol>";
    } else if (tt < meta.play_start) {
      const n = Math.ceil(meta.play_start - tt);
      html =
        n <= 3
          ? '<p class="mg-big">' + n + "</p>"
          : '<p class="mg-title">誰是乖孩子・' + esc(giftName) + (mode === "play" ? "" : "（直播）") + "</p>" +
            '<p class="mm-mouse">這是<b>滑鼠</b>遊戲！請用滑鼠操作：<b>右鍵</b>吃、<b>左鍵</b>吐</p>' +
            '<ul class="mg-rules">' +
            "<li><b>長按右鍵</b>吃西瓜，吃滿 5 口才能吐籽；吐完 5 顆再吃</li>" +
            "<li><b>左鍵點對手</b>吐籽，吐中扣 1 滴（每人 10 滴）</li>" +
            "<li>媽媽閉眼禱告時才能動；她<b>突然張開眼睛</b>時，正在吃或吐的人<b>直接淘汰</b></li>" +
            "<li>2 分鐘後<b>血最多</b>的人贏，同血量比嘴裡的籽</li>" +
            "</ul>" +
            '<p class="mg-tip">' + n + " 秒後開始（請用滑鼠）</p>";
    }
    if (centerEl.dataset.html !== html) {
      centerEl.dataset.html = html;
      centerEl.innerHTML = html;
      centerEl.hidden = !html;
    }
  }

  window.ExMomgame = { sync, stop };
})();
