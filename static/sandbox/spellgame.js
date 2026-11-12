(function () {
  "use strict";

  // 沙盒・鍵盤詠唱師：俯視、大家圍成一圈；中間每 5 秒換 5 個小寫字母，照順序打完就對所有人射魔法
  // 5 秒內打幾次就射幾次；對方的魔法飛到前也打完 → 兩條相撞抵銷；打錯反噬扣血
  // 參賽者：按鍵先在本機標示，每 100ms 送一次（有按鍵就立刻送）；判定以伺服器為準
  // 觀眾：每 1 秒拉一次直播緩衝，延遲 1.5 秒播放
  const POLL_MS = 100;
  const WATCH_MS = 1000;
  const WATCH_DELAY = 1.5;
  const W = 1280;
  const H = 760;
  const CX = W / 2;
  const CY = 400;
  const RX = 470; // 圍圈半徑（橢圓，畫面比較寬）
  const RY = 270;

  const box = document.getElementById("sg");
  const cv = document.getElementById("sg-canvas");
  const ctx = cv.getContext("2d");
  const timerEl = document.getElementById("sg-timer");
  const hudEl = document.getElementById("sg-hud");
  const boardEl = document.getElementById("sg-board");
  const centerEl = document.getElementById("sg-center");
  const liveEl = document.getElementById("sg-live");

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
  let keyBusy = false; // 帶按鍵的請求一次只送一個，伺服器收到的順序才不會顛倒
  let pollBusy = false;
  let kseq = 0; // 按鍵流水號（下一個按鍵的編號）
  let queue = []; // 還沒送出的按鍵 { i, ch, w }（w＝按下時的字母組）
  let sent = []; // 送出中、還沒回來的按鍵
  let latestTyped = 0; // latest 這份畫面是伺服器處理到第幾個按鍵時的狀態
  let lastWordId = null; // 換新字組時閃一下
  let wordFlashUntil = 0;
  let imeUntil = 0; // 偵測到中文輸入法時，狀態列提示幾秒
  let effects = [];
  let shakeUntil = 0;
  const seen = new Set(); // 已經跳過特效的事件
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
    seen.clear();
    events.clear();
    watchSince = 0;
    offset = null;
    keyBusy = pollBusy = false;
    kseq = latestTyped = 0;
    queue = [];
    sent = [];
    lastWordId = null;
    wordFlashUntil = imeUntil = 0;
    lastMs = null;
    box.hidden = true;
  }

  function startPlay() {
    mode = "play";
    timers.forEach(clearInterval);
    timers = [setInterval(pump, POLL_MS)];
    pump();
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

  // exchange.js 每次輪詢後呼叫（不是鍵盤詠唱師時傳 null）
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
      console.log("[spellgame] on, in_game", !!(game.me && game.me.in_game));
    }
    const wantPlay = !!(game.me && game.me.in_game) && phase !== "reveal";
    if (wantPlay && mode === null) startPlay();
    else if (!wantPlay && mode !== "watch" && !(mode === "play" && phase === "reveal")) startWatch();
  }

  // ---------- 參賽者 ----------
  // 目前這組字母（以伺服器最新畫面為準）
  function currentWord() {
    const f = mode === "play" ? latest : currentFrame();
    return f && f.word ? { id: f.word[0], letters: f.word[1], at: f.word[2] } : null;
  }

  function pump() {
    if (mode !== "play") return;
    if (queue.length && !keyBusy) sendKeys();
    else if (!keyBusy && !pollBusy) poll();
  }

  async function sendKeys() {
    const w = queue[0].w;
    let n = 0;
    while (n < queue.length && n < 20 && queue[n].w === w) n++;
    const batch = queue.splice(0, n);
    keyBusy = true;
    sent = batch;
    try {
      const r = await bridge.api("/api/minigame/spell", { word: w, keys: batch.map((k) => k.ch).join(""), from: batch[0].i });
      if (!r.ok) {
        if (r.status === 409 && mode === "play") startWatch();
        return;
      }
      take(r.data);
    } catch (e) {
      queue = batch.concat(queue); // 網路抖一下：照原編號重送，伺服器會跳過已經處理過的
    } finally {
      sent = [];
      keyBusy = false;
      if (queue.length) pump(); // 排隊中的按鍵馬上接著送
    }
  }

  async function poll() {
    pollBusy = true;
    try {
      const r = await bridge.api("/api/minigame/spell", { word: null, keys: "" });
      if (!r.ok) {
        if (r.status === 409 && mode === "play") startWatch();
        return;
      }
      take(r.data);
    } catch (e) {
      /* 網路抖一下，下一輪再拿 */
    } finally {
      pollBusy = false;
    }
  }

  function take(s) {
    meta = s;
    meId = s.me;
    roster = s.roster;
    noteOffset(s.now);
    // 只採用比較新的回應：伺服器時間比較晚、處理過的按鍵也不比較少（舊回應晚到不會把進度蓋回去）
    const typed = s.typed || 0;
    if (!latest || (s.frame.t >= latest.t && typed >= latestTyped)) {
      latest = s.frame;
      latestTyped = typed;
    }
    collect(s.frame);
    (s.results || []).forEach((res) => {
      const me = posOf(meId);
      if (!me) return;
      if (res === "wrong") {
        effects.push({ t: localSec(), x: me.x, y: me.y - 70, text: "反噬 -1", color: "#E5484D" });
        shakeUntil = localSec() + 0.25;
      } else if (res === "cast") {
        effects.push({ t: localSec(), x: me.x, y: me.y - 70, text: "詠唱！", color: "#DE6A93" });
      }
    });
  }

  function typing(e) {
    const t = e.target;
    return t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT");
  }
  window.addEventListener("keydown", (e) => {
    if (mode !== "play" || typing(e) || e.ctrlKey || e.metaKey || e.altKey) return;
    const m = /^Key([A-Z])$/.exec(e.code || "");
    if (!m) return;
    e.preventDefault();
    if (e.repeat) return; // 按住不放的自動連發不算
    // 中文輸入法：e.key 會是 "Process" 或全形字，照實體按鍵當英文，並提示玩家不用切換
    if (e.key === "Process" || e.isComposing || !/^[a-zA-Z]$/.test(e.key || "")) imeUntil = localSec() + 3;
    if (!meta || clock() < meta.play_start || meta.finished_at) return;
    const w = currentWord();
    if (!w) return;
    queue.push({ i: kseq++, ch: m[1].toLowerCase(), w: w.id });
    pump();
  });

  // 本機看到的進度：伺服器的進度＋還沒回來的按鍵（照同樣規則先推算）
  function myProgress() {
    const w = currentWord();
    if (!w || !latest) return 0;
    const row = latest.p.find((p) => p[0] === meId);
    let prog = row ? row[3] : 0;
    sent.concat(queue).forEach((k) => {
      if (k.i < latestTyped || k.w !== w.id) return; // 伺服器已經算進去的、或別組的不重算
      if (k.ch === w.letters[prog]) prog = prog + 1 >= w.letters.length ? 0 : prog + 1;
      else prog = 0;
    });
    return prog;
  }

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

  // 事件（命中、反噬）在畫面時間走到時才跳特效
  const events = new Map();
  function collect(f) {
    (f.ev || []).forEach((ev) => {
      const key = ev[0] + "|" + ev[1] + "|" + ev[2].join(",");
      if (!events.has(key)) events.set(key, ev);
    });
  }

  function fireEvents(t) {
    events.forEach((ev, key) => {
      if (seen.has(key) || ev[0] > t) return;
      seen.add(key);
      if (t - ev[0] > 1) return; // 太舊的不補跳
      const [, kind, ids] = ev;
      if (kind === "hit") {
        const p = posOf(ids[0]);
        if (p) effects.push({ t: localSec(), x: p.x, y: p.y - 70, text: "-1", color: "#E5484D", flash: ids[0] });
      } else if (kind === "backfire" && !(mode === "play" && ids[0] === meId)) {
        const p = posOf(ids[0]);
        if (p) effects.push({ t: localSec(), x: p.x, y: p.y - 70, text: "反噬", color: "#E5484D" });
      }
    });
  }

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

  // 每個人在圓周上的位置（從正上方開始順時針）
  function posOf(id) {
    const i = roster.findIndex((r) => r.id === id);
    if (i < 0) return null;
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / roster.length;
    return { x: CX + RX * Math.cos(a), y: CY + RY * Math.sin(a) };
  }

  function drawFloor() {
    R(0, 0, W, H, "#5B3A2A");
    R(40, 40, W - 80, H - 60, "#FBE7EC"); // 粉嫩地毯
    R(40, 40, W - 80, 6, "#F3CFD9");
    // 中央魔法陣：同心菱形＋方框（不用漸層）
    ctx.save();
    ctx.translate(CX, CY);
    [[230, "#F6B7C8"], [180, "#BFDDF5"], [130, "#F6B7C8"]].forEach(([r, c]) => {
      ctx.strokeStyle = c;
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(0, -r * 0.62);
      ctx.lineTo(r, 0);
      ctx.lineTo(0, r * 0.62);
      ctx.lineTo(-r, 0);
      ctx.closePath();
      ctx.stroke();
    });
    ctx.restore();
  }

  // 一個人：方塊＋眼睛（看向圓心），下方名牌、血條、詠唱進度
  function drawPerson(info, row, p, isMe, flash) {
    const alive = row ? !!row[2] : true;
    const hp = row ? row[1] : 10;
    const prog = isMe && mode === "play" ? myProgress() : row ? row[3] : 0;
    const casts = row ? row[4] : 0;
    const body = bridge.tagColor(info.label);
    const s = 44;
    const dx = Math.sign(CX - p.x);
    const dy = Math.sign(CY - p.y);
    ctx.globalAlpha = alive ? 1 : 0.35;
    R(p.x - s / 2, p.y + s / 2 + 2, s, 6, "rgba(42,26,16,0.25)");
    if (isMe) R(p.x - s / 2 - 4, p.y - s / 2 - 4, s + 8, s + 8, "#DE6A93");
    R(p.x - s / 2, p.y - s / 2, s, s, "#2A1A10");
    R(p.x - s / 2 + 3, p.y - s / 2 + 3, s - 6, s - 6, flash ? "#E5484D" : alive ? body : "#B9B4AC");
    if (alive) {
      R(p.x - 14, p.y - 10, 11, 12, "#FFFFFF");
      R(p.x + 3, p.y - 10, 11, 12, "#FFFFFF");
      R(p.x - 11 + dx * 2, p.y - 7 + dy * 2, 5, 6, "#2A1A10");
      R(p.x + 6 + dx * 2, p.y - 7 + dy * 2, 5, 6, "#2A1A10");
    } else {
      R(p.x - 14, p.y - 4, 11, 3, "#2A1A10");
      R(p.x + 3, p.y - 4, 11, 3, "#2A1A10");
    }
    ctx.globalAlpha = 1;
    // 名牌
    ctx.font = "bold 18px " + bridge.font;
    const w = ctx.measureText(info.name).width + 14;
    R(p.x - w / 2 - 2, p.y + s / 2 + 12, w + 4, 26, "#2A1A10");
    R(p.x - w / 2, p.y + s / 2 + 14, w, 22, isMe ? "#FFE1EA" : "#FFF6EA");
    text(info.name, p.x, p.y + s / 2 + 25, 18, "#2A1A10");
    // 血條 10 格
    for (let i = 0; i < 10; i++) R(p.x - 35 + i * 7, p.y + s / 2 + 42, 5, 6, i < hp ? "#E5484D" : "#6B5A55");
    // 詠唱進度 5 格＋這組詠唱次數
    if (alive) {
      for (let i = 0; i < 5; i++) R(p.x - 31 + i * 12, p.y - s / 2 - 16, 9, 9, i < prog ? "#DE6A93" : "#E8D9DD");
      if (casts) text("×" + casts, p.x + 46, p.y - s / 2 - 12, 16, "#5B98D6", "#FFF6EA");
    } else {
      text("淘汰", p.x, p.y - s / 2 - 14, 18, "#E5484D", "#FFF6EA");
    }
  }

  // 中央：5 個字母（自己打過的變粉紅、下一個加底線）＋第幾組與倒數條
  function drawWord(t) {
    const w = currentWord();
    if (!w || !meta) return;
    const prog = mode === "play" ? myProgress() : 0;
    if (w.id !== lastWordId) {
      if (lastWordId !== null) wordFlashUntil = localSec() + 0.45;
      lastWordId = w.id;
    }
    const flash = localSec() < wordFlashUntil && Math.floor(localSec() * 10) % 2 === 0;
    const size = 74;
    const gap = 10;
    const x0 = CX - (5 * size + 4 * gap) / 2;
    for (let i = 0; i < w.letters.length; i++) {
      const x = x0 + i * (size + gap);
      R(x - 3, CY - 70 - 3, size + 6, size + 6, flash ? "#5B98D6" : "#2A1A10");
      R(x, CY - 70, size, size, flash ? "#FFD86B" : i < prog ? "#F6B7C8" : "#FFF6EA");
      text(w.letters[i], x + size / 2, CY - 70 + size / 2 - 2, 56, i < prog ? "#DE6A93" : "#2A1A10");
      if (i === prog && mode === "play") R(x + 12, CY - 70 + size - 12, size - 24, 5, "#5B98D6");
    }
    const cfg = meta.cfg;
    const left = Math.max(0, Math.min(1, (w.at + cfg.word_every - t) / cfg.word_every));
    R(CX - 200, CY + 22, 400, 12, "#2A1A10");
    R(CX - 198, CY + 24, 396 * left, 8, left < 0.3 ? "#E5484D" : "#5B98D6");
    text("第 " + (w.id + 1) + "／" + cfg.n_words + " 組", CX, CY + 58, 22, "#2A1A10");
  }

  // 射線：施法者 → 目標的光束＋光球；抵銷時在相撞點爆黃色十字火花
  function drawRays(f, t) {
    (f.r || []).forEach(([, from, to, t0, t1, cancelT, cancelS]) => {
      if (t < t0) return;
      const a = posOf(from);
      const b = posOf(to);
      if (!a || !b) return;
      let s;
      if (cancelT !== null && t >= cancelT) {
        const age = t - cancelT;
        if (age > 0.4) return;
        const x = a.x + (b.x - a.x) * cancelS;
        const y = a.y + (b.y - a.y) * cancelS;
        const r = 8 + age * 60;
        ctx.globalAlpha = Math.max(0, 1 - age / 0.4);
        R(x - r, y - 3, r * 2, 6, "#FFD86B");
        R(x - 3, y - r, 6, r * 2, "#FFD86B");
        ctx.globalAlpha = 1;
        return;
      }
      if (t >= t1) return;
      s = (t - t0) / (t1 - t0);
      const x = a.x + (b.x - a.x) * s;
      const y = a.y + (b.y - a.y) * s;
      const info = roster.find((r) => r.id === from);
      ctx.strokeStyle = "rgba(255,216,107,0.55)";
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(x, y);
      ctx.stroke();
      R(x - 9, y - 9, 18, 18, "#2A1A10");
      R(x - 7, y - 7, 14, 14, info ? bridge.tagColor(info.label) : "#FFD86B");
      R(x - 3, y - 3, 6, 6, "#FFF6EA");
    });
  }

  function drawEffects() {
    const now = localSec();
    effects = effects.filter((e) => {
      const age = now - e.t;
      if (age > 0.9) return false;
      text(e.text, e.x, e.y - age * 40, 26, e.color, "#FFF6EA");
      return true;
    });
  }

  function draw(ms) {
    if (!active) return;
    lastMs = ms;
    const t = clock();
    const f = currentFrame();
    fireEvents(t);
    ctx.save();
    if (localSec() < shakeUntil) ctx.translate(Math.round(Math.random() * 8 - 4), Math.round(Math.random() * 8 - 4));
    drawFloor();
    if (f && roster.length) {
      drawRays(f, t);
      const rows = new Map(f.p.map((p) => [p[0], p]));
      const flashing = new Set(effects.filter((e) => e.flash && localSec() - e.t < 0.3).map((e) => e.flash));
      roster.forEach((info) => {
        const p = posOf(info.id);
        const isMe = info.id === meId || info.name === meName;
        drawPerson(info, rows.get(info.id), p, isMe, flashing.has(info.id) && Math.floor(ms / 80) % 2 === 0);
      });
      if (t >= meta.play_start && !meta.finished_at) drawWord(t);
    }
    drawEffects();
    ctx.restore();
    updateHud(t, f);
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

  function updateHud(t, f) {
    if (!meta) return;
    const tt = mode === "play" ? t : bridge.serverNow();
    if (tt < meta.play_start) timerEl.textContent = "準備";
    else if (meta.finished_at) timerEl.textContent = "結束";
    else timerEl.textContent = mmss(meta.play_end - tt);
    timerEl.classList.toggle("urgent", !meta.finished_at && tt >= meta.play_start && meta.play_end - tt <= 10);
    // 計分板：血多的在上，淘汰的劃掉
    if (f) {
      const names = new Map(roster.map((r) => [r.id, r.name]));
      const rows = f.p.slice().sort((a, b) => b[2] - a[2] || b[1] - a[1]);
      const key = JSON.stringify(rows.map((r) => [r[0], r[1], r[2]]));
      if (boardEl.dataset.key !== key) {
        boardEl.dataset.key = key;
        boardEl.innerHTML = rows
          .map((r) => {
            const name = names.get(r[0]) || "?";
            const cls = [r[0] === meId || name === meName ? "me" : "", r[2] ? "" : "out"].join(" ").trim();
            return '<li class="' + cls + '">' + esc(name) + "　血 " + r[1] + "</li>";
          })
          .join("");
      }
    }
    let hud = "";
    if (mode === "play" && latest) {
      const mine = latest.p.find((p) => p[0] === meId);
      if (mine && !mine[2]) hud = "你被淘汰了";
      else if (localSec() < imeUntil) hud = "偵測到中文輸入法，已自動當成英文按鍵（不用切換）";
      else hud = "打出中間的字母（打完可以再打一次）";
    }
    hudEl.textContent = hud;
    hudEl.hidden = !hud;
    const phase = rnd ? rnd.phase : meta.phase;
    let html = "";
    if (phase === "reveal" && rnd && rnd.ranking) {
      html =
        '<p class="mg-big mg-win">' + esc(rnd.winner_name || rnd.ranking[0].name) + " 拿到" + esc(giftName) + "！</p>" +
        '<ol class="mg-rank">' +
        rnd.ranking
          .map(
            (r) =>
              "<li>" + esc(r.name) + "　血 " + r.hp +
              (r.speed !== null && r.speed !== undefined ? "　最後詠唱 " + r.speed.toFixed(2) + " 秒" : "") +
              (r.alive ? "" : "　淘汰") + "</li>",
          )
          .join("") +
        "</ol>";
    } else if (tt < meta.play_start) {
      const n = Math.ceil(meta.play_start - tt);
      html =
        n <= 3
          ? '<p class="mg-big">' + n + "</p>"
          : '<p class="mg-title">鍵盤詠唱師・' + esc(giftName) + (mode === "play" ? "" : "（直播）") + "</p>" +
            '<ul class="mg-rules">' +
            "<li>照順序打出中間 <b>5 個字母</b>，就會對所有人發射魔法；<b>5 秒內打幾次就發射幾次</b></li>" +
            "<li>對方的魔法飛到之前你也打完，就能<b>互相抵銷</b></li>" +
            "<li>被打中扣 1 滴、<b>打錯也扣 1 滴</b>（反噬）；10 滴，歸零淘汰</li>" +
            "<li>60 秒後<b>血最多</b>的人贏，同血量比最後一次詠唱速度</li>" +
            "</ul>" +
            '<p class="mg-tip">' + n + " 秒後開始</p>";
    }
    if (centerEl.dataset.html !== html) {
      centerEl.dataset.html = html;
      centerEl.innerHTML = html;
      centerEl.hidden = !html;
    }
  }

  window.ExSpellgame = { sync, stop };
})();
