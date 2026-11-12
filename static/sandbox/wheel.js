(function () {
  "use strict";

  // 沙盒・小遊戲轉盤：倒數結束進小遊戲前轉 3 秒，伺服器轉完才公開這局玩什麼，
  // 拿到結果後減速停在那一格，顯示「這局是：○○！」再交給遊戲畫面
  const SPIN_SPEED = Math.PI * 4; // 轉速（弧度／秒）
  const LAND_SEC = 1.1; // 拿到結果後減速停下的時間
  const SHOW_SEC = 1.4; // 停下後顯示結果多久
  const POLL_MS = 300; // 轉盤中問結果的間隔
  const SLICES = 9; // 格子數（遊戲名稱輪流排，三款各 3 格）
  const COLORS = ["#F6B7C8", "#BFDDF5", "#FFE7A3", "#CDEBD8", "#E3D5F5", "#FFD1B0"];
  const W = 1280;
  const H = 760;
  const CX = W / 2;
  const CY = 410;
  const RADIUS = 270;

  const box = document.getElementById("wheel");
  const cv = document.getElementById("wheel-canvas");
  const ctx = cv.getContext("2d");

  let bridge = null;
  let games = []; // [{ key, name }]
  let state = null; // { angle, last, result, landFrom, landTo, landAt, doneAt, poll }
  let roundNo = null; // 已經轉過的回合，不重轉
  let pending = null; // 倒數中、確定會進小遊戲（2 人以上）：{ round_no, at } 倒數一到就開始轉
  setInterval(() => {
    if (pending && bridge && bridge.serverNow() >= pending.at) {
      roundNo = pending.round_no;
      pending = null;
      if (!state) start();
    }
  }, 100);

  const now = () => performance.now() / 1000;
  const sliceGame = (i) => games[i % games.length];
  const sliceAngle = () => (Math.PI * 2) / SLICES;

  function start() {
    state = { angle: Math.random() * Math.PI * 2, last: now(), result: null, landAt: null, doneAt: null, poll: null };
    state.poll = setInterval(askResult, POLL_MS);
    box.hidden = false;
    requestAnimationFrame(draw);
    console.log("[wheel] spinning");
  }

  function finish() {
    if (state && state.poll) clearInterval(state.poll);
    state = null;
    box.hidden = true;
  }

  async function askResult() {
    if (!state || state.result) return;
    try {
      const r = await bridge.api("/api/exchange");
      if (r.ok && r.data.round && r.data.round.game) land(r.data.round.game);
    } catch (e) {
      /* 下一輪再問 */
    }
  }

  // 拿到結果：從目前角度減速，停在指針（正上方）指著那個遊戲的格子
  function land(key) {
    if (!state || state.result) return;
    state.result = key;
    clearInterval(state.poll);
    const a = sliceAngle();
    const candidates = [];
    for (let i = 0; i < SLICES; i++) if (sliceGame(i).key === key) candidates.push(i);
    const from = state.angle;
    // 減速段大約再轉 SPIN_SPEED × LAND_SEC / 3 的距離（ease-out 起始速度與原轉速接得上）
    const want = from + (SPIN_SPEED * LAND_SEC) / 3;
    let best = null;
    candidates.forEach((i) => {
      // 第 i 格中心在角度 angle + (i + 0.5)a；指針在 -π/2 → angle = -π/2 - (i + 0.5)a + 2πk
      const base = -Math.PI / 2 - (i + 0.5) * a;
      const k = Math.ceil((want - base) / (Math.PI * 2));
      const target = base + k * Math.PI * 2;
      if (best === null || target < best) best = target;
    });
    state.landFrom = from;
    state.landTo = best;
    state.landAt = now();
    console.log("[wheel] result", key);
  }

  // exchange.js 每次輪詢後呼叫
  function sync(b, game) {
    bridge = b;
    games = (game && game.minigames) || games;
    const rnd = game && game.round;
    if (rnd && rnd.phase === "contest") {
      // 候選人＋挑戰者 2 人以上 → 倒數一結束就會進小遊戲，畫面在倒數歸零那一刻就開始轉（不等下一次輪詢）
      const pool = (rnd.candidate ? 1 : 0) + (rnd.challengers || 0);
      pending = pool >= 2 && roundNo !== rnd.round_no ? { round_no: rnd.round_no, at: rnd.ends_epoch } : null;
      if (state && roundNo !== rnd.round_no) finish(); // 已經換到下一份了（例如沒進成小遊戲）
    } else if (rnd && rnd.phase === "spin") {
      if (!state && roundNo !== rnd.round_no && games.length) {
        roundNo = rnd.round_no;
        start();
      }
    } else if (state && rnd && rnd.game && !state.result) {
      land(rnd.game); // 輪詢剛好先拿到結果
    } else if (state && !rnd) {
      finish();
    }
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

  function draw() {
    if (!state) return;
    const t = now();
    if (state.landAt === null) {
      state.angle += SPIN_SPEED * (t - state.last);
    } else {
      const p = Math.min(1, (t - state.landAt) / LAND_SEC);
      state.angle = state.landFrom + (state.landTo - state.landFrom) * (1 - Math.pow(1 - p, 3));
      if (p >= 1 && state.doneAt === null) state.doneAt = t;
    }
    state.last = t;
    if (state.doneAt !== null && t - state.doneAt > SHOW_SEC) {
      finish();
      return;
    }

    ctx.fillStyle = "rgba(42,26,16,0.82)";
    ctx.fillRect(0, 0, W, H);
    const a = sliceAngle();
    // 外框
    ctx.fillStyle = "#2A1A10";
    ctx.beginPath();
    ctx.arc(CX, CY, RADIUS + 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#DE6A93";
    ctx.beginPath();
    ctx.arc(CX, CY, RADIUS + 8, 0, Math.PI * 2);
    ctx.fill();
    // 格子
    for (let i = 0; i < SLICES; i++) {
      const s = state.angle + i * a;
      const won = state.doneAt !== null && sliceGame(i).key === state.result;
      ctx.fillStyle = won && Math.floor(t * 6) % 2 ? "#FFF6EA" : COLORS[(games.indexOf(sliceGame(i)) * 2 + (i % 2)) % COLORS.length];
      ctx.beginPath();
      ctx.moveTo(CX, CY);
      ctx.arc(CX, CY, RADIUS, s, s + a);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "#2A1A10";
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.save();
      ctx.translate(CX, CY);
      ctx.rotate(s + a / 2);
      ctx.font = "bold 30px " + bridge.font;
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "#2A1A10";
      ctx.fillText(sliceGame(i).name, RADIUS - 24, 0);
      ctx.restore();
    }
    // 中心
    ctx.fillStyle = "#2A1A10";
    ctx.beginPath();
    ctx.arc(CX, CY, 46, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#FFF6EA";
    ctx.beginPath();
    ctx.arc(CX, CY, 38, 0, Math.PI * 2);
    ctx.fill();
    text("?", CX, CY + 2, 44, "#DE6A93");
    // 指針（正上方）
    ctx.fillStyle = "#2A1A10";
    ctx.beginPath();
    ctx.moveTo(CX - 30, CY - RADIUS - 46);
    ctx.lineTo(CX + 30, CY - RADIUS - 46);
    ctx.lineTo(CX, CY - RADIUS + 18);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#E5484D";
    ctx.beginPath();
    ctx.moveTo(CX - 20, CY - RADIUS - 40);
    ctx.lineTo(CX + 20, CY - RADIUS - 40);
    ctx.lineTo(CX, CY - RADIUS + 4);
    ctx.closePath();
    ctx.fill();
    // 標題
    if (state.doneAt !== null) {
      const g = games.find((x) => x.key === state.result);
      text("這局是：" + (g ? g.name : "") + "！", CX, 70, 58, "#FFE7A3", "#2A1A10");
    } else {
      text("這局玩什麼？", CX, 70, 58, "#FFF6EA", "#2A1A10");
    }
    requestAnimationFrame(draw);
  }

  window.ExWheel = { sync };
})();
