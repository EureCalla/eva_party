(function () {
  "use strict";

  // 沙盒・交換禮物遊戲。繪圖零件與色票暫時從 ../game.js 複製（game.js 不動），合併回正式版時再整併
  const EXCHANGE_POLL_MS = 2000; // 交換回合要看倒數與爭奪人數，輪詢比禮物牆快

  // ---------- 正方形禮物與小腳（同 game.js） ----------
  const EXTRA = {
    gift_box: [
      "....QQ....QQ....",
      "....QTQ..QTQ....",
      "....QTTQQTTQ....",
      ".....QQTTQQ.....",
      ".ooooooTToooooo.",
      ".occUcccTTcccco.",
      ".occcccTTccUcco.",
      ".occcccTTccccso.",
      ".oTTTTTTTTTTTTo.",
      ".oTTTTTTTTTTTTo.",
      ".occUccTTcccsso.",
      ".occcccTTcUcsso.",
      ".ocUcccTTcccsso.",
      ".occcccTTccssso.",
      ".osssssTTssssso.",
      ".oooooooooooooo.",
    ],
    leg_stand: ["owwo", "owwo", "owwo", "owwo", "oooo"],
    leg_squat: ["owwo", "owwo", "oooo"],
  };

  // ---------- 禮物標籤配色（同 game.js） ----------
  const LABEL_COLORS = {
    "寶": { c: "#F6B7C8", s: "#E99AB0", T: "#5B98D6", Q: "#3F78B5" },
    "貝": { c: "#BFDDF5", s: "#9CC5E8", T: "#DE6A93", Q: "#D98AA0" },
    "珍珠": { c: "#FBF7F0", s: "#E3DCEF", T: "#B79AD9", Q: "#9A7CC4" },
    "欣": { c: "#FFE7A3", s: "#F2CF73", T: "#DE6A93", Q: "#D98AA0" },
    "Eva": { c: "#F8F4ED", s: "#DAD0C5", T: "#C8202A", Q: "#8E1820" },
    "Baby": { c: "#CDEBD8", s: "#A8D6B9", T: "#DE6A93", Q: "#D98AA0" },
    "欣加Pearl": { c: "#E3D5F5", s: "#C9B5E8", T: "#DE6A93", Q: "#D98AA0" },
    "媽媽": { c: "#F4A6A0", s: "#E08A84", T: "#FFF6EA", Q: "#F5E4D6" },
    "男": { c: "#8FB8E8", s: "#6E9BD3", T: "#FFF6EA", Q: "#F5E4D6" },
    "孩": { c: "#FFD1B0", s: "#F2B48A", T: "#5B98D6", Q: "#3F78B5" },
    "威": { c: "#9BD3D0", s: "#79B9B5", T: "#DE6A93", Q: "#D98AA0" },
  };

  // ---------- 點陣轉畫布（同 game.js） ----------
  function bake(rows, pal) {
    pal = pal || PAL;
    const h = rows.length;
    const w = rows[0].length;
    const c = document.createElement("canvas");
    const sh = document.createElement("canvas");
    c.width = sh.width = w;
    c.height = sh.height = h;
    const x = c.getContext("2d");
    const xs = sh.getContext("2d");
    xs.fillStyle = "#2A1A10";
    rows.forEach((row, j) => {
      for (let i = 0; i < row.length; i++) {
        const ch = row[i];
        if (ch === ".") continue;
        x.fillStyle = pal[ch];
        x.fillRect(i, j, 1, 1);
        xs.fillRect(i, j, 1, 1);
      }
    });
    return { c, sh, w, h };
  }

  const SPR = {};
  Object.keys(SPRITES).forEach((name) => {
    const p = SPRITES[name];
    const b = bake(p.rows);
    const unit = p.unit || 1;
    SPR[name] = { c: b.c, sh: b.sh, w: b.w * unit, h: b.h * unit, x0: p.x0, y0: p.y0, px: p.pivot[0], py: p.pivot[1], unit };
  });
  function addExtra(name, rows, pal) {
    const b = bake(rows, pal);
    SPR[name] = { c: b.c, sh: b.sh, w: b.w, h: b.h, x0: 0, y0: 0, px: 0, py: 0, unit: 1 };
  }
  Object.keys(EXTRA).forEach((name) => addExtra(name, EXTRA[name]));
  Object.keys(LABEL_COLORS).forEach((label) => {
    addExtra("gift_box@" + label, EXTRA.gift_box, Object.assign({}, PAL, LABEL_COLORS[label]));
  });
  function boxSprite(label) {
    return label && SPR["gift_box@" + label] ? "gift_box@" + label : "gift_box";
  }
  function tagColor(label) {
    return LABEL_COLORS[label] ? LABEL_COLORS[label].c : "#F4ECDD";
  }

  // 以零件關節對齊 (ax, ay) 畫出，帶 0.35 格紙片投影（同 game.js）
  function piece(ctx, name, rot, opt) {
    const s = SPR[name];
    opt = opt || {};
    const ax = opt.ax !== undefined ? opt.ax : s.px;
    const ay = opt.ay !== undefined ? opt.ay : s.py;
    ctx.save();
    ctx.translate(ax, ay);
    if (rot) ctx.rotate(rot);
    const sc = opt.scale !== undefined ? opt.scale : 1;
    ctx.scale(sc, sc);
    const lx = s.unit === 1 ? s.x0 - s.px : -s.w / 2;
    const ly = s.unit === 1 ? s.y0 - s.py : -s.h / 2;
    const alpha = ctx.globalAlpha;
    ctx.globalAlpha = alpha * 0.28;
    ctx.drawImage(s.sh, lx + 0.35, ly + 0.35, s.w, s.h);
    ctx.globalAlpha = alpha;
    ctx.drawImage(s.c, lx, ly, s.w, s.h);
    ctx.restore();
  }

  // ---------- 登入背景：像素室內＋孕婦貓（同 game.js 的 idle 場景） ----------
  const CELL = 15;
  const scene = document.getElementById("scene");
  const sctx = scene.getContext("2d");
  function R(x, y, w, h, c) {
    sctx.fillStyle = c;
    sctx.fillRect(x, y, w, h);
  }
  function drawRoom() {
    R(0, 0, 128, 60, "#5B3A2A");
    for (let y = 3; y < 60; y += 4) R(0, y, 128, 0.5, "#4E3123");
    R(0, 60, 128, 12, "#8B5A3C");
    R(0, 60, 128, 0.6, "#6B5A55");
    for (let x = 0; x < 128; x += 16) R(x, 60, 0.4, 12, "#7A4E33");
    R(0, 2, 128, 0.4, "#6B5A55");
    for (let i = 0; i < 16; i++) {
      sctx.fillStyle = i % 2 ? "#BFDDF5" : "#F6B7C8";
      sctx.beginPath();
      sctx.moveTo(i * 8 + 1, 2.4);
      sctx.lineTo(i * 8 + 7, 2.4);
      sctx.lineTo(i * 8 + 4, 6);
      sctx.closePath();
      sctx.fill();
    }
  }
  function drawCat(x, y, t) {
    const bob = Math.abs(Math.sin(t * 2.2)) * 0.8;
    sctx.save();
    sctx.translate(x, y - bob);
    piece(sctx, "s_leg_back", 0);
    piece(sctx, "s_leg_front", 0);
    piece(sctx, "s_tail", Math.sin(t * 3) * 0.18);
    piece(sctx, "s_torso_belly_dress", 0);
    const blink = t % 4 > 3.75;
    piece(sctx, blink ? "s_head_happy_bow" : "s_head_open_bow", Math.sin(t * 1.4) * 0.06, { ax: 20, ay: 16 });
    piece(sctx, "s_arm_dress", -0.25 + Math.sin(t * 2.2) * 0.08);
    sctx.restore();
  }
  let sceneOn = true;
  function sceneFrame(ms) {
    if (!sceneOn) return;
    const t = ms / 1000;
    sctx.setTransform(CELL, 0, 0, CELL, 0, 0);
    sctx.imageSmoothingEnabled = false;
    drawRoom();
    piece(sctx, "gift6", 0, { ax: 100, ay: 56 });
    piece(sctx, "gift6", 0, { ax: 114, ay: 57, scale: 0.85 });
    drawCat(4, 33, t);
    requestAnimationFrame(sceneFrame);
  }
  document.body.classList.add("scene-cover");
  requestAnimationFrame(sceneFrame);

  // ---------- API（登入只放記憶體，同 game.js） ----------
  let sessionToken = null;
  async function api(path, body) {
    const headers = { "Content-Type": "application/json" };
    if (sessionToken) headers["X-Token"] = sessionToken;
    const res = await fetch(path, body ? { method: "POST", headers, body: JSON.stringify(body) } : { headers });
    const data = await res.json();
    return { ok: res.ok, status: res.status, data };
  }

  // ---------- 登入 ----------
  const loginEl = document.getElementById("login");
  const loginCard = document.getElementById("login-card");
  const loginName = document.getElementById("login-name");
  const loginPw = document.getElementById("login-password");
  const loginErr = document.getElementById("login-error");

  async function loadRoster() {
    const r = await api("/api/roster");
    r.data.names.forEach((n) => {
      const o = document.createElement("option");
      o.value = o.textContent = n;
      loginName.appendChild(o);
    });
  }

  loginCard.addEventListener("submit", async (e) => {
    e.preventDefault();
    loginErr.hidden = true;
    const r = await api("/api/login", { name: loginName.value, password: loginPw.value });
    if (!r.ok) {
      loginErr.textContent = r.data.error || "登入失敗";
      loginErr.hidden = false;
      loginCard.classList.remove("shake");
      void loginCard.offsetWidth;
      loginCard.classList.add("shake");
      return;
    }
    sessionToken = r.data.token;
    const s = await api("/api/state");
    enterExchange(s.data);
  });

  // ---------- 交換禮物遊戲：聚光燈輪轉 ----------
  // 舞台世界 128 x 76 格，一格 10 px；左＝剛抽過、中＝聚光燈下、右＝待命；上方留給講話框
  const SPOT_CELL = 10;
  const SPOT_W = 128;
  const SPOT_H = 76;
  const FLOOR_Y = 59;
  const TURN_SEC = 0.9; // 輪轉一格的時間
  const BOX = 16; // gift_box 點陣邊長
  // 相對位置 → 擺放（x 中心、底部 y、縮放、透明度）；-2 / 2 在畫面外
  const SLOTS = {
    "-2": { x: -16, y: 62, s: 1.3, a: 0.75 },
    "-1": { x: 22, y: 62, s: 1.3, a: 0.75 },
    "0": { x: 64, y: 64, s: 2.4, a: 1 },
    "1": { x: 106, y: 62, s: 1.3, a: 0.75 },
    "2": { x: 144, y: 62, s: 1.3, a: 0.75 },
  };
  const exEl = document.getElementById("exchange");
  const spot = document.getElementById("ex-spot");
  const pctx = spot.getContext("2d");
  const countEl = document.getElementById("ex-count");
  const FONT = getComputedStyle(document.body).fontFamily;
  let order = []; // 依抽獎順序排好的禮物
  let cur = 0; // 聚光燈下是第幾個
  let turnFrom = 0; // 輪轉動畫起點（可小數）
  let turnStart = null;

  const easeInOut = (p) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);

  // 依相對位置（可小數）在相鄰兩個擺放之間內插
  function slotAt(pos) {
    const p = Math.max(-2, Math.min(2, pos));
    const lo = Math.min(1, Math.floor(p));
    const f = p - lo;
    const A = SLOTS[lo];
    const B = SLOTS[lo + 1];
    const mix = (k) => A[k] + (B[k] - A[k]) * f;
    return { x: mix("x"), y: mix("y"), s: mix("s"), a: mix("a") };
  }

  function P(x, y, w, h, c) {
    pctx.fillStyle = c;
    pctx.fillRect(x, y, w, h);
  }

  // 壓暗一階的木牆＋地板（平塗，不是深色虛空）
  function drawStageRoom() {
    P(0, 0, SPOT_W, FLOOR_Y, "#4A2F22");
    for (let y = 3; y < FLOOR_Y; y += 4) P(0, y, SPOT_W, 0.5, "#3F271C");
    P(0, FLOOR_Y, SPOT_W, SPOT_H - FLOOR_Y, "#6E4730");
    P(0, FLOOR_Y, SPOT_W, 0.6, "#6B5A55");
    for (let x = 0; x < SPOT_W; x += 16) P(x, FLOOR_Y, 0.4, SPOT_H - FLOOR_Y, "#5E3C28");
    P(0, 2, SPOT_W, 0.4, "#6B5A55");
    for (let i = 0; i < 16; i++) {
      pctx.fillStyle = i % 2 ? "#9DB7CC" : "#CC98A6"; // 三角旗也壓暗一階
      pctx.beginPath();
      pctx.moveTo(i * 8 + 1, 2.4);
      pctx.lineTo(i * 8 + 7, 2.4);
      pctx.lineTo(i * 8 + 4, 6);
      pctx.closePath();
      pctx.fill();
    }
  }

  // 聚光燈：硬邊半透明光錐＋地面光圈＋頂上燈具，無漸層無發光
  function drawSpotlight() {
    pctx.fillStyle = "rgba(255, 246, 234, 0.22)";
    pctx.beginPath();
    pctx.moveTo(59, 0);
    pctx.lineTo(69, 0);
    pctx.lineTo(88, 65);
    pctx.lineTo(40, 65);
    pctx.closePath();
    pctx.fill();
    pctx.fillStyle = "rgba(255, 246, 234, 0.4)";
    pctx.beginPath();
    pctx.ellipse(64, 64.5, 24, 3.6, 0, 0, Math.PI * 2);
    pctx.fill();
    P(58, 0, 12, 2, "#6B5A55");
    P(59, 2, 10, 1, "#FFF6EA");
  }

  // 一份禮物：點陣禮物＋標籤牌＋名稱，(x, bottom) 為底部中心
  function drawSpotGift(g, x, bottom, s, a, bob) {
    const big = s > 1.8;
    const fs = big ? 2.6 : 1.9;
    pctx.globalAlpha = a;
    piece(pctx, boxSprite(g.label), 0, { ax: x - (BOX * s) / 2, ay: bottom - BOX * s - bob, scale: s });
    pctx.textAlign = "center";
    pctx.textBaseline = "top";
    let ty = bottom + 1.2;
    if (g.label) {
      pctx.font = fs + "px " + FONT;
      const w = pctx.measureText(g.label).width + 2;
      const h = fs + 1;
      P(x - w / 2 - 0.3, ty - 0.3, w + 0.6, h + 0.6, "#6B5A55");
      P(x - w / 2, ty, w, h, tagColor(g.label));
      pctx.fillStyle = "#6B5A55";
      pctx.fillText(g.label, x, ty + 0.5);
    }
    ty += fs + 1.8;
    pctx.font = "bold " + fs + "px " + FONT;
    pctx.fillStyle = "#FFF6EA";
    pctx.fillText(g.animal + "的禮物", x, ty);
    pctx.globalAlpha = 1;
  }

  // ---------- 講話框：聚光燈下的禮物停好後彈出，內容是它的描述 ----------
  // 用疊在舞台上的 HTML（文字清楚、手機字級可調），輪轉中收起
  const bubbleEl = document.getElementById("ex-bubble");
  let bubbleKey = null; // 目前顯示的「第幾個＋描述」，變了才重新彈出

  function syncBubble(show) {
    const g = order[cur];
    if (!show || !g) {
      bubbleEl.hidden = true;
      bubbleKey = null;
      return;
    }
    const text = g.description || "（還沒有描述）";
    const key = cur + "|" + g.gift_id + "|" + text;
    if (key === bubbleKey) return;
    const changedTextOnly = bubbleKey !== null && bubbleKey.startsWith(cur + "|" + g.gift_id + "|");
    bubbleKey = key;
    bubbleEl.textContent = text;
    bubbleEl.hidden = false;
    if (changedTextOnly) return; // 主人改了描述：直接換字，不重新彈
    bubbleEl.classList.remove("pop");
    void bubbleEl.offsetWidth;
    bubbleEl.classList.add("pop");
  }

  function spotFrame(ms) {
    if (inGamePhase()) {
      // 小遊戲蓋住舞台時不重畫聚光燈，省下效能給小遊戲
      syncBubble(false);
      requestAnimationFrame(spotFrame);
      return;
    }
    let view = cur;
    if (turnStart !== null) {
      const p = Math.min(1, (ms - turnStart) / 1000 / TURN_SEC);
      view = turnFrom + (cur - turnFrom) * easeInOut(p);
      if (p >= 1) turnStart = null;
    }
    pctx.setTransform(SPOT_CELL, 0, 0, SPOT_CELL, 0, 0);
    pctx.imageSmoothingEnabled = false;
    drawStageRoom();
    drawSpotlight();
    // 由外往內畫，聚光燈下的最後畫、壓在最上層
    const items = [];
    order.forEach((g, i) => {
      const pos = i - view;
      if (pos > -2.5 && pos < 2.5) items.push({ g, pos });
    });
    items.sort((a, b) => Math.abs(b.pos) - Math.abs(a.pos));
    items.forEach(({ g, pos }) => {
      const sl = slotAt(pos);
      const bob = Math.abs(pos) < 0.05 ? Math.abs(Math.sin((ms / 1000) * 2.4)) * 0.6 : 0;
      drawSpotGift(g, sl.x, sl.y, sl.s, sl.a, bob);
    });
    // 管理者按開始後才顯示講話框；小遊戲進行中收起
    syncBubble(turnStart === null && !!game && game.started && !inGamePhase());
    requestAnimationFrame(spotFrame);
  }

  function updateCount() {
    if (!game || !game.started) countEl.textContent = order.length ? "共 " + order.length + " 份禮物" : "還沒有禮物";
    else if (game.finished) countEl.textContent = "全部 " + order.length + " 份禮物都交換完了";
    else countEl.textContent = "第 " + game.round.round_no + " / " + order.length + " 份";
  }

  // 輪轉到第 to 個（由伺服器回合決定）；動畫中再換會從目前畫面位置接著轉
  function turnTo(to) {
    if (to < 0 || to >= order.length || to === cur) return;
    const now = performance.now();
    let from = cur;
    if (turnStart !== null) {
      const p = Math.min(1, (now - turnStart) / 1000 / TURN_SEC);
      from = turnFrom + (cur - turnFrom) * easeInOut(p);
    }
    turnFrom = from;
    cur = to;
    turnStart = now;
    updateCount();
    console.log("[exchange] spotlight ->", cur + 1, order[cur].animal);
  }

  // ---------- 頁首 ----------
  function drawSign() {
    const ctx = document.getElementById("wall-sign").getContext("2d");
    ctx.setTransform(8, 0, 0, 8, 0, 0);
    ctx.imageSmoothingEnabled = false;
    piece(ctx, "sign_back", 0, { ax: 25, ay: 11 });
  }

  function renderStageBar(stages, stage) {
    const bar = document.getElementById("stage-bar");
    const idx = stages.findIndex((s) => s.key === stage);
    bar.textContent = "";
    stages.forEach((s, i) => {
      const li = document.createElement("li");
      li.className = i < idx ? "done" : i === idx ? "current" : "todo";
      const dot = document.createElement("span");
      dot.className = "dot";
      const name = document.createElement("span");
      name.className = "name";
      name.textContent = s.name;
      li.append(dot, name);
      bar.appendChild(li);
    });
  }

  function applyState(data) {
    renderStageBar(data.stages || [], data.stage);
    const me = data.me;
    document.getElementById("ex-me").textContent = me
      ? me.name + (me.animal ? "（" + me.animal + (me.label ? "・" + me.label : "") + "）" : "（還沒認領禮物）")
      : "";
    // 依抽獎順序排列；不在順序裡的（之後新增的禮物）排最後
    const rank = new Map(drawIds.map((id, i) => [id, i]));
    const at = (g) => (rank.has(g.gift_id) ? rank.get(g.gift_id) : drawIds.length + g.gift_id);
    order = data.gifts.slice().sort((a, b) => at(a) - at(b));
    cur = Math.min(cur, Math.max(0, order.length - 1));
    if (data.description_max) descMax = data.description_max;
    showMyDesc(me);
    applyGame();
  }

  // ---------- 交換回合：倒數、候選人、爭奪（伺服器為準） ----------
  const timerEl = document.getElementById("ex-timer");
  const waitEl = document.getElementById("ex-wait");
  const bannerEl = document.getElementById("ex-banner");
  const startBtn = document.getElementById("ex-start");
  const resetBtn = document.getElementById("ex-reset"); // 沙盒專用：重置測試資料
  const joinBtn = document.getElementById("ex-join");
  const leaveBtn = document.getElementById("ex-leave");
  const JOIN_REASONS = {
    owner: "這是你帶來的禮物，不能爭奪",
    candidate: "你是這份禮物的候選人，等倒數結束就好",
    no_ticket: "搶奪券用完了",
    full: "爭奪名額已滿",
    no_round: "目前沒有進行中的禮物",
    locked: "現在不是交換禮物階段",
  };
  let game = null; // /api/exchange 的最新結果
  let clockOffset = 0; // 伺服器時間 - 本機時間（秒）
  let shownResults = null; // 已經跳過結果橫幅的回合數
  let bannerTimer = null;

  function serverNow() {
    return Date.now() / 1000 + clockOffset;
  }

  // 回合進到小遊戲（準備／遊戲中／公布）時，舞台交給 minigame.js
  function inGamePhase() {
    return !!(game && game.round && game.round.phase && game.round.phase !== "contest");
  }

  async function loadGame() {
    const r = await api("/api/exchange");
    if (!r.ok) return;
    game = r.data;
    clockOffset = game.now - Date.now() / 1000;
  }

  // 每幀更新倒數文字；最後 10 秒變色
  function updateTimer() {
    const rnd = game && game.round;
    timerEl.hidden = !rnd || inGamePhase();
    if (timerEl.hidden) return;
    const left = Math.max(0, Math.ceil(rnd.ends_epoch - serverNow()));
    timerEl.textContent = String(Math.floor(left / 60)).padStart(2, "0") + ":" + String(left % 60).padStart(2, "0");
    timerEl.classList.toggle("urgent", left <= 10);
  }

  function showBanner(text) {
    bannerEl.textContent = text;
    bannerEl.hidden = false;
    bannerEl.classList.remove("pop");
    void bannerEl.offsetWidth;
    bannerEl.classList.add("pop");
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(() => (bannerEl.hidden = true), 4500);
  }

  // 結果區每次輪詢都會重畫，記住哪些項目展開著，重畫後維持原狀
  const openDetails = new Set();
  function keepOpen(det, key) {
    det.open = openDetails.has(key);
    det.addEventListener("toggle", () => (det.open ? openDetails.add(key) : openDetails.delete(key)));
  }

  // 小遊戲排名（可展開）
  function rankingDetails(gameKind, gameName, ranking, key) {
    const det = document.createElement("details");
    keepOpen(det, key);
    const sum = document.createElement("summary");
    sum.textContent = (gameName || "小遊戲") + "排名";
    const ol = document.createElement("ol");
    ranking.forEach((p) => {
      const it = document.createElement("li");
      it.textContent =
        gameKind === "count"
          ? p.name + "　" + p.score + " 分" + (p.alive ? "" : "　淘汰")
          : gameKind === "climb"
          ? p.name + "　" + p.floor + " 樓" + (p.alive ? "" : "　淘汰")
          : p.name + "　禮物 " + p.gifts + "　" + (p.alive ? "血 " + p.hp : "淘汰");
      ol.appendChild(it);
    });
    det.append(sum, ol);
    return det;
  }

  // 易手紀錄的一步，例如「第 7 回 Allen 搶到別份，順移給 Calla（第 2 名）」
  function stepText(s) {
    const head = "第 " + s.round_no + " 回 ";
    if (s.how === "game") return head + (s.game_name || "小遊戲") + " → " + s.to + " 搶到";
    if (s.how === "candidate") return head + "候選人 " + s.to + " 直接獲得";
    if (s.how === "random") return head + "隨機 → " + s.to;
    if (s.how === "pass") return head + s.from + " 搶到別份，順移給 " + s.to + "（第 " + s.rank + " 名）";
    if (s.how === "pass_random") return head + s.from + " 搶到別份，隨機順移給 " + (s.to || "沒有人");
    return head + "沒有人拿到";
  }

  // 誰拿到了：每份禮物一列（目前拿著的人），展開看搶奪順序
  function renderResults() {
    const list = document.getElementById("ex-results");
    list.textContent = "";
    const gifts = game.gifts || [];
    gifts.forEach((g) => {
      const li = document.createElement("li");
      const gift = document.createElement("span");
      gift.className = "res-gift";
      gift.textContent = g.animal + "的禮物" + (g.label ? "（" + g.label + "）" : "");
      const who = document.createElement("strong");
      who.textContent = g.holder || "沒有人";
      li.append(gift, document.createTextNode(" → "), who);
      const det = document.createElement("details");
      det.className = "res-steps";
      keepOpen(det, "g" + g.gift_id);
      const sum = document.createElement("summary");
      sum.textContent = "搶奪順序（" + g.steps.length + " 次）";
      const ol = document.createElement("ol");
      g.steps.forEach((s) => {
        const it = document.createElement("li");
        if (s.how === "pass" || s.how === "pass_random") it.className = "passed";
        it.textContent = stepText(s);
        if (s.ranking) it.appendChild(rankingDetails(s.game, s.game_name, s.ranking, "g" + g.gift_id + "r" + s.round_no));
        ol.appendChild(it);
      });
      det.append(sum, ol);
      li.appendChild(det);
      list.appendChild(li);
    });
    document.getElementById("ex-results-empty").hidden = gifts.length > 0;
  }

  function renderContest() {
    const me = game.me;
    const rnd = game.round;
    document.getElementById("ex-contest").hidden = !rnd || inGamePhase();
    if (rnd) {
      document.getElementById("ex-cand").textContent = rnd.candidate || "（沒有可抽的人）";
      document.getElementById("ex-chal").textContent = rnd.challengers + " / " + rnd.max_challengers;
      // 一起爭奪的人：依加入順序，自己那一格標粉紅
      const list = document.getElementById("ex-chal-list");
      list.textContent = "";
      (rnd.challenger_names || []).forEach((n) => {
        const li = document.createElement("li");
        li.textContent = n;
        if (me && n === me.name) li.classList.add("me");
        list.appendChild(li);
      });
      if (!list.children.length) {
        const li = document.createElement("li");
        li.className = "empty";
        li.textContent = "還沒有人加入";
        list.appendChild(li);
      }
    }
    if (!me) return;
    document.getElementById("ex-tickets").textContent = me.tickets + " / " + me.max_tickets;
    document.getElementById("ex-won").textContent = me.won
      ? "你目前拿著：" + me.won.animal + "的禮物" + (me.won.label ? "（" + me.won.label + "）" : "") +
        (me.tickets > 0 ? "　還可以用券搶下一份，搶到的話這份會順移給下一名" : "")
      : "";
    joinBtn.hidden = me.joined;
    leaveBtn.hidden = !me.joined;
    joinBtn.disabled = !me.can_join;
    const reason = document.getElementById("ex-reason");
    reason.textContent = me.joined ? "你已加入爭奪，倒數結束前可以退出（會退還搶奪券）" : JOIN_REASONS[me.reason] || "";
    startBtn.hidden = !(me.is_admin && !game.started);
    resetBtn.hidden = !me.is_admin;
  }

  function applyGame() {
    if (!game) return;
    // 聚光燈對準伺服器目前的回合；開始前停在第一份，結束後停在最後一份
    let target = 0;
    if (game.round) target = order.findIndex((g) => g.gift_id === game.round.gift_id);
    else if (game.finished && game.results.length) {
      const last = game.results[game.results.length - 1].gift_id;
      target = order.findIndex((g) => g.gift_id === last);
    }
    if (target >= 0 && target !== cur) turnTo(target);
    waitEl.hidden = game.started;
    waitEl.textContent = "等待管理者開始";
    document.getElementById("ex-finished").hidden = !game.finished;
    if (shownResults !== null && game.results.length > shownResults) {
      const r = game.results[game.results.length - 1];
      if (r.passed) {
        // 得主換了禮物：就算小遊戲公布過，也要告訴大家舊禮物順移給誰
        const p = r.passed;
        showBanner(
          r.winner + " 搶到了！原本的" + p.animal + "的禮物順移給 " + (p.to || "沒有人") +
            (p.rank ? "（第 " + p.rank + " 名）" : "")
        );
      } else if (r.resolved_by !== "game") showBanner(r.animal + "的禮物 → " + (r.winner || "沒有人")); // 小遊戲已經公布過
    }
    shownResults = game.results.length;
    updateCount();
    renderContest();
    renderResults();
    const gift = game.round ? order.find((g) => g.gift_id === game.round.gift_id) : null;
    // 依回合的小遊戲種類只開對應的那一個（另一個收到 null 會自己關掉）
    // 轉盤中還沒有種類，兩個都不開
    const kind = game.round && game.round.game;
    window.ExMinigame.sync(MG_BRIDGE, kind === "stones" ? game : null, gift);
    window.ExCountgame.sync(MG_BRIDGE, kind === "count" ? game : null, gift);
    window.ExClimbgame.sync(MG_BRIDGE, kind === "climb" ? game : null, gift);
    window.ExWheel.sync(MG_BRIDGE, game);
  }
  const MG_BRIDGE = { api: (path, body) => api(path, body), serverNow: () => serverNow(), tagColor: (l) => tagColor(l), font: FONT };

  async function contestAction(path) {
    const r = await api(path, {});
    if (!r.ok) document.getElementById("ex-reason").textContent = JOIN_REASONS[r.data.result] || "操作失敗";
    await loadGame();
    applyGame();
  }
  joinBtn.addEventListener("click", () => contestAction("/api/exchange/join"));
  leaveBtn.addEventListener("click", () => contestAction("/api/exchange/withdraw"));
  startBtn.addEventListener("click", () => contestAction("/api/exchange/start"));

  // 沙盒專用：重置測試資料（交換進度清空，順序、標籤、描述不動）
  resetBtn.addEventListener("click", async () => {
    const ok = window.confirm(
      "要把交換禮物的進度全部清空嗎？\n\n回合、爭奪名單、誰拿到哪份禮物都會清掉，搶奪券回到 5 張，進行中的小遊戲也會結束。\n抽獎順序、標籤、描述不會動。",
    );
    if (!ok) return;
    const msg = document.getElementById("ex-reset-msg");
    resetBtn.disabled = true;
    const r = await api("/api/sandbox/reset", {});
    resetBtn.disabled = false;
    msg.textContent = r.ok ? "已重置，管理者按「開始」就能重新測試" : "重置失敗（只有管理者可以重置）";
    await loadGame();
    applyGame();
  });

  // ---------- 舞台下方：禮物主人修改自己的描述 ----------
  const descForm = document.getElementById("ex-desc");
  const descInput = document.getElementById("ex-desc-input");
  const descCount = document.getElementById("ex-desc-count");
  const descMsg = document.getElementById("ex-desc-msg");
  const DESC_ERRORS = {
    empty: "請先寫一點描述",
    too_long: "描述太長了",
    locked: "現在不能修改描述了",
    not_claimed: "你還沒有認領禮物",
  };
  let descMax = 50;
  let descDirty = false; // 正在打字時，輪詢不要蓋掉輸入框

  function updateDescCount() {
    descCount.textContent = descInput.value.trim().length + " / " + descMax;
  }
  function descNotice(text, ok) {
    descMsg.textContent = text || "";
    descMsg.classList.toggle("ok", !!ok);
  }
  function showMyDesc(me) {
    descForm.hidden = !(me && me.gift_id);
    if (descForm.hidden || descDirty) return;
    descInput.maxLength = descMax;
    descInput.value = me.description || "";
    updateDescCount();
  }
  descInput.addEventListener("input", () => {
    descDirty = true;
    descNotice("");
    updateDescCount();
  });
  descForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const r = await api("/api/description", { description: descInput.value });
    if (!r.ok) return descNotice(DESC_ERRORS[r.data.result] || "送出失敗");
    descDirty = false;
    descNotice("已更新，大家的講話框都會換成新的描述", true);
    const s = await api("/api/state");
    if (s.ok) await refresh(s.data);
  });

  // 抽獎順序：沙盒 server 才有這支 API，只讀測試庫
  // 管理頁重新切進交換禮物階段會換一組順序（洗牌碼＝切換時間 yyyymmddhhmm），換了就從第一個重新開始
  let drawIds = [];
  async function loadDrawOrder() {
    const r = await api("/api/draw_order");
    if (!r.ok) return;
    const changed = r.data.order.join(",") !== drawIds.join(",");
    drawIds = r.data.order;
    document.getElementById("ex-seed").textContent = r.data.seed ? "洗牌碼 " + r.data.seed : "";
    if (changed) {
      cur = 0;
      turnStart = null;
      bubbleKey = null; // 講話框重新彈出
      shownResults = null; // 新的一局，不補跳舊結果
      console.log("[exchange] draw order loaded, seed", r.data.seed);
    }
  }
  async function refresh(data) {
    await loadDrawOrder();
    await loadGame();
    if (shownResults === null && game) {
      // 第一次載入：聚光燈直接放到目前回合，不從第一份轉過去
      shownResults = game.results.length;
      const id = game.round ? game.round.gift_id : null;
      const rank = drawIds.indexOf(id);
      if (rank >= 0) cur = rank;
    }
    applyState(data);
  }

  async function enterExchange(data) {
    loginEl.hidden = true;
    sceneOn = false;
    scene.hidden = true;
    document.body.classList.remove("scene-cover");
    exEl.hidden = false;
    drawSign();
    await refresh(data);
    requestAnimationFrame(spotFrame);
    console.log("[exchange] entered as", data.me && data.me.name, "stage", data.stage);
    setInterval(updateTimer, 250);
    setInterval(async () => {
      const r = await api("/api/state");
      if (!r.ok) return;
      // 管理者把階段切走：回首頁（禮物牆）。首頁不記登入，要重新登入
      if (r.data.stage !== EXCHANGE_STAGE) {
        console.log("[exchange] stage changed to", r.data.stage, "back to home");
        location.href = "/";
        return;
      }
      await refresh(r.data);
    }, EXCHANGE_POLL_MS);
  }

  // 從首頁帶過來（sandbox_bridge.js）：接手登入 token，讀完即刪，重新整理一樣要重新登入
  const EXCHANGE_STAGE = "exchange";
  const HANDOFF_KEY = "sandbox_handoff_token";
  async function takeHandoff() {
    let token = null;
    try {
      token = sessionStorage.getItem(HANDOFF_KEY);
      sessionStorage.removeItem(HANDOFF_KEY);
    } catch (e) {
      /* 拿不到 storage 就走登入 */
    }
    if (!token) return false;
    sessionToken = token;
    const s = await api("/api/state");
    if (!s.ok || !s.data.me) {
      sessionToken = null;
      return false;
    }
    await enterExchange(s.data);
    return true;
  }

  takeHandoff().then((ok) => {
    if (!ok) loadRoster();
  });
})();
