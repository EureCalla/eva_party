(function () {
  "use strict";

  // 沙盒・報數遊戲：按 1～9 喊數字，照順序喊（9 之後回 1），撞號或喊錯淘汰，不能連續喊
  // 參賽者：按下去自己頭上立刻冒數字，每 100ms 拿最新狀態；對不對以伺服器為準
  // 觀眾：每 1 秒拉一次直播緩衝，延遲 1.5 秒播放
  const POLL_MS = 100;
  const WATCH_MS = 1000;
  const WATCH_DELAY = 1.5;
  const BUBBLE_SEC = 1.0; // 頭上數字泡泡停留秒數
  const W = 1280;
  const H = 760;

  const box = document.getElementById("cg");
  const cv = document.getElementById("cg-canvas");
  const ctx = cv.getContext("2d");
  const timerEl = document.getElementById("cg-timer");
  const hudEl = document.getElementById("cg-hud");
  const centerEl = document.getElementById("cg-center");
  const liveEl = document.getElementById("cg-live");

  let bridge = null;
  let active = false;
  let mode = null; // "play" / "watch"
  let rnd = null;
  let giftName = "";
  let meName = null;
  let meId = null;
  let roster = []; // [{ id, name, label, bot }]
  let meta = null;
  let frames = [];
  let liveFrame = null;
  let latest = null; // 參賽者：最新快照的畫面
  let watchSince = 0;
  let timers = [];
  let offset = null; // 伺服器時間 − 本機時間
  let inFlight = 0;
  let myCall = null; // 自己剛按、伺服器還沒回的 { n, at }
  let notice = null; // { text, until } 自己的提示（等別人喊等）
  const seen = new Map(); // 看過的事件（依時間播放用）
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
    seen.clear();
    watchSince = 0;
    offset = null;
    myCall = notice = null;
    lastMs = null;
    box.hidden = true;
  }

  function startPlay() {
    mode = "play";
    timers.forEach(clearInterval);
    timers = [setInterval(() => send(null), POLL_MS)];
    send(null);
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

  // exchange.js 每次輪詢後呼叫（不是報數遊戲時傳 null）
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
      console.log("[countgame] on, in_game", !!(game.me && game.me.in_game));
    }
    const wantPlay = !!(game.me && game.me.in_game) && phase !== "reveal";
    if (wantPlay && mode === null) startPlay();
    else if (!wantPlay && mode !== "watch" && !(mode === "play" && phase === "reveal")) startWatch();
  }

  // ---------- 參賽者 ----------
  async function send(n) {
    if (mode !== "play") return;
    if (inFlight >= (n === null ? 1 : 2)) return; // 喊數字可以插隊
    inFlight++;
    try {
      const r = await bridge.api("/api/minigame/count", { n });
      if (!r.ok) {
        if (r.status === 409 && mode === "play") startWatch();
        return;
      }
      take(r.data, n);
    } catch (e) {
      /* 網路抖一下，下一輪再拿 */
    } finally {
      inFlight--;
    }
  }

  function take(s, n) {
    meta = s;
    meId = s.me;
    roster = s.roster;
    noteOffset(s.now);
    if (!latest || s.frame.t >= latest.t || n !== null) latest = s.frame;
    collect(s.frame);
    if (n !== null) {
      myCall = null;
      const now = localSec();
      if (s.result === "wait") notice = { text: "不能連續喊，等別人喊", until: now + 1.2 };
      else if (s.result === "wrong") notice = { text: "喊錯了！淘汰", until: now + 3 };
      else if (s.result === "collide") notice = { text: "撞號了！淘汰", until: now + 3 };
      else if (s.result === "ignored") notice = { text: "現在不能喊", until: now + 1 };
    }
  }

  function isTyping(e) {
    const t = e.target;
    return t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT");
  }
  window.addEventListener("keydown", (e) => {
    if (mode !== "play" || isTyping(e) || e.repeat) return;
    const n = Number(e.key);
    if (!(n >= 1 && n <= 9)) return;
    e.preventDefault();
    if (!meta || clock() < meta.play_start || meta.phase === "over") return;
    myCall = { n, at: localSec() }; // 先在自己頭上冒出來
    send(n);
  });

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
    collect(meta.frame);
    meta.frames.forEach((f) => {
      if (!frames.length || f.t > frames[frames.length - 1].t) frames.push(f);
      collect(f);
    });
    if (frames.length) watchSince = frames[frames.length - 1].t;
    while (frames.length > 2 && frames[1].t < bridge.serverNow() - WATCH_DELAY - 2) frames.shift();
  }

  function collect(f) {
    (f.ev || []).forEach((ev) => {
      const key = ev[0] + "|" + ev[1] + "|" + ev[2].join(",");
      if (!seen.has(key)) seen.set(key, ev);
    });
  }

  // 現在要畫的那一格：參賽者用最新的；觀眾用延遲時間之前最近的一格
  function currentFrame() {
    if (mode === "play") return latest;
    const t = clock();
    for (let i = frames.length - 1; i >= 0; i--) if (frames[i].t <= t) return frames[i];
    return liveFrame;
  }

  // ---------- 繪圖 ----------
  function R(x, y, w, h, c) {
    ctx.fillStyle = c;
    ctx.fillRect(x, y, w, h);
  }

  function drawStage() {
    R(0, 0, W, H, "#4A2F22");
    for (let y = 30; y < 470; y += 40) R(0, y, W, 4, "#3F271C");
    R(0, 470, W, H - 470, "#6E4730");
    R(0, 470, W, 6, "#6B5A55");
    for (let x = 0; x < W; x += 160) R(x, 470, 4, H - 470, "#5E3C28");
    for (let i = 0; i < 16; i++) {
      ctx.fillStyle = i % 2 ? "#9DB7CC" : "#CC98A6";
      ctx.beginPath();
      ctx.moveTo(i * 80 + 10, 0);
      ctx.lineTo(i * 80 + 70, 0);
      ctx.lineTo(i * 80 + 40, 36);
      ctx.closePath();
      ctx.fill();
    }
  }

  function text(str, x, y, size, color, stroke) {
    ctx.font = "bold " + size + "px " + bridge.font;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    if (stroke) {
      ctx.lineWidth = Math.max(4, size / 8);
      ctx.strokeStyle = stroke;
      ctx.strokeText(str, x, y);
    }
    ctx.fillStyle = color;
    ctx.fillText(str, x, y);
  }

  // 一個人：方塊＋眼睛（放大 2 倍），頭上分數、腳下名牌
  function drawPerson(info, row, x, y, isMe, flash) {
    const alive = row ? !!row[2] : true;
    const score = row ? row[1] : 0;
    const body = info.bot ? "#9AA5B1" : bridge.tagColor(info.label);
    ctx.globalAlpha = alive ? 1 : 0.4;
    R(x - 36, y + 34, 72, 8, "rgba(42,26,16,0.3)");
    if (isMe) R(x - 40, y - 40, 80, 80, "#DE6A93");
    R(x - 34, y - 34, 68, 68, "#2A1A10");
    R(x - 30, y - 30, 60, 60, flash ? "#E5484D" : alive ? body : "#B9B4AC");
    if (alive) {
      R(x - 20, y - 16, 16, 18, "#FFFFFF");
      R(x + 4, y - 16, 16, 18, "#FFFFFF");
      R(x - 15, y - 11, 8, 10, "#2A1A10");
      R(x + 9, y - 11, 8, 10, "#2A1A10");
    } else {
      R(x - 20, y - 6, 16, 4, "#2A1A10");
      R(x + 4, y - 6, 16, 4, "#2A1A10");
    }
    if (info.bot) {
      R(x - 2, y - 48, 4, 12, "#2A1A10"); // 電腦：天線
      R(x - 6, y - 54, 12, 8, "#E5484D");
    }
    ctx.globalAlpha = 1;
    text(String(score), x, y - 82, 44, "#FFF6EA", "#2A1A10");
    const name = info.name; // 電腦的名字本身就是「電腦 A／B」
    ctx.font = "bold 20px " + bridge.font;
    const w = ctx.measureText(name).width + 16;
    R(x - w / 2 - 2, y + 48, w + 4, 30, "#2A1A10");
    R(x - w / 2, y + 50, w, 26, isMe ? "#FFE1EA" : "#FFF6EA");
    text(name, x, y + 63, 20, "#2A1A10");
    if (!alive) text("淘汰", x, y + 96, 20, "#E5484D", "#FFF6EA");
  }

  // 頭上的講話泡泡
  function bubble(str, x, y, color, age) {
    const pop = Math.min(1, age / 0.12);
    const s = 0.6 + 0.4 * pop;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s, s);
    ctx.font = "bold 40px " + bridge.font;
    const w = Math.max(70, ctx.measureText(str).width + 30);
    R(-w / 2 - 3, -33, w + 6, 66, "#2A1A10");
    R(-w / 2, -30, w, 60, color);
    ctx.fillStyle = "#2A1A10";
    ctx.beginPath();
    ctx.moveTo(-10, 33);
    ctx.lineTo(10, 33);
    ctx.lineTo(0, 48);
    ctx.closePath();
    ctx.fill();
    text(str, 0, 0, 40, "#2A1A10");
    ctx.restore();
  }

  function layout(n) {
    const gap = Math.min(150, (W - 160) / Math.max(1, n - 1));
    const x0 = W / 2 - (gap * (n - 1)) / 2;
    return (i) => ({ x: x0 + gap * i, y: 540 });
  }

  function draw(ms) {
    if (!active) return;
    lastMs = ms;
    drawStage();
    const f = currentFrame();
    const t = clock();
    const now = localSec();
    if (f && roster.length) {
      const rows = new Map(f.p.map((p) => [p[0], p]));
      const pos = layout(roster.length);
      const at = new Map(roster.map((r, i) => [r.id, pos(i)]));
      // 最近的事件：撞號／喊錯閃紅
      const recent = [...seen.values()].filter((ev) => t - ev[0] >= 0 && t - ev[0] < BUBBLE_SEC);
      const flashIds = new Set();
      recent.forEach((ev) => {
        if (ev[1] !== "call") ev[2].forEach((id) => flashIds.add(id));
      });
      roster.forEach((info) => {
        const p = at.get(info.id);
        const isMe = info.id === meId || info.name === meName;
        drawPerson(info, rows.get(info.id), p.x, p.y, isMe, flashIds.has(info.id) && Math.floor(ms / 120) % 2 === 0);
      });
      recent.forEach((ev) => {
        const age = t - ev[0];
        ev[2].forEach((id) => {
          const p = at.get(id);
          if (!p) return;
          if (mode === "play" && id === meId && myCall) return;
          const label = ev[1] === "call" ? ev[3] + "！" : ev[1] === "collide" ? ev[3] + " 撞號！" : ev[3] + " 喊錯！";
          bubble(label, p.x, p.y - 160, ev[1] === "call" ? "#FFF6EA" : "#F6B7C8", age);
        });
      });
      // 自己剛按、伺服器還沒回：先冒出來
      if (mode === "play" && myCall && now - myCall.at < 1.5) {
        const p = at.get(meId);
        if (p) bubble(myCall.n + "！", p.x, p.y - 160, "#FFE1EA", now - myCall.at);
      }
      // 中央：最後喊對的數字
      const lastEv = [...seen.values()].filter((ev) => ev[0] <= t && ev[1] !== "wrong").sort((a, b) => b[0] - a[0])[0];
      R(W / 2 - 150, 90, 300, 210, "#2A1A10");
      R(W / 2 - 144, 96, 288, 198, "#FFF6EA");
      if (lastEv) {
        const who = roster.find((r) => r.id === lastEv[2][lastEv[2].length - 1]);
        text(String(lastEv[3]), W / 2, 178, 120, lastEv[1] === "collide" ? "#E5484D" : "#DE6A93");
        text(
          lastEv[1] === "collide" ? "撞號！接著喊下一個" : (who ? who.name : "") + " 喊的",
          W / 2, 270, 24, "#2A1A10",
        );
      } else {
        text("1", W / 2, 178, 120, "#C9C2B6");
        text("從 1 開始喊", W / 2, 270, 24, "#2A1A10");
      }
    }
    updateHud(t, now);
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

  function updateHud(t, now) {
    if (!meta) return;
    const tt = mode === "play" ? t : bridge.serverNow();
    if (tt < meta.play_start) timerEl.textContent = "準備";
    else if (meta.finished_at) timerEl.textContent = "結束";
    else timerEl.textContent = mmss(meta.play_end - tt);
    timerEl.classList.toggle("urgent", !meta.finished_at && tt >= meta.play_start && meta.play_end - tt <= 10);
    // 自己的狀態列
    let hud = "";
    if (mode === "play" && latest) {
      const mine = latest.p.find((p) => p[0] === meId);
      const justMe = latest.last && latest.last[1] === meId;
      if (notice && now < notice.until) hud = notice.text;
      else if (mine && !mine[2]) hud = "你被淘汰了（分數照算）";
      else if (justMe) hud = "你剛喊過，等別人喊";
      else hud = "按鍵盤 1～9 喊下一個數字";
    } else if (mode === "watch") {
      hud = "";
    }
    hudEl.textContent = hud;
    hudEl.hidden = !hud;
    // 中央訊息：準備說明／公布
    const phase = rnd ? rnd.phase : meta.phase;
    let html = "";
    if (phase === "reveal" && rnd && rnd.ranking) {
      const winner = rnd.winner_name || (rnd.ranking.find((r) => !r.bot) || {}).name;
      html =
        '<p class="mg-big mg-win">' + esc(winner) + " 拿到" + esc(giftName) + "！</p>" +
        (rnd.ranking[0].bot ? '<p class="mg-tip">電腦不能拿禮物，由最高分的真人獲得</p>' : "") +
        '<ol class="mg-rank">' +
        rnd.ranking
          .map((r) => "<li>" + esc(r.name) + "　" + r.score + " 分" + (r.alive ? "" : "　淘汰") + "</li>")
          .join("") +
        "</ol>";
    } else if (tt < meta.play_start) {
      const n = Math.ceil(meta.play_start - tt);
      html =
        n <= 3
          ? '<p class="mg-big">' + n + "</p>"
          : '<p class="mg-title">報數遊戲・' + esc(giftName) + (mode === "play" ? "" : "（直播）") + "</p>" +
            '<ul class="mg-rules">' +
            "<li>按鍵盤 <b>1～9</b> 喊數字，從 1 開始照順序喊，喊到 9 再回到 1</li>" +
            "<li>兩個人同時喊同一個數字 → <b>兩個都淘汰</b>；喊錯數字也淘汰</li>" +
            "<li>不能連續喊，要等別人喊過</li>" +
            "<li>喊對一次得 1 分，1 分鐘後<b>分數最高</b>的人贏（還有 2 個電腦一起玩）</li>" +
            "</ul>" +
            '<p class="mg-tip">' + n + " 秒後開始</p>";
    }
    if (centerEl.dataset.html !== html) {
      centerEl.dataset.html = html;
      centerEl.innerHTML = html;
      centerEl.hidden = !html;
    }
  }

  window.ExCountgame = { sync, stop };
})();
