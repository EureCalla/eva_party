(function () {
  "use strict";

  // 沙盒・交換禮物遊戲。繪圖零件與色票暫時從 ../game.js 複製（game.js 不動），合併回正式版時再整併
  const POLL_MS = 3000;

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
  // 舞台世界 128 x 64 格，一格 10 px；左＝剛抽過、中＝聚光燈下、右＝待命
  const SPOT_CELL = 10;
  const SPOT_W = 128;
  const SPOT_H = 64;
  const FLOOR_Y = 47;
  const TURN_SEC = 0.9; // 輪轉一格的時間
  const BOX = 16; // gift_box 點陣邊長
  // 相對位置 → 擺放（x 中心、底部 y、縮放、透明度）；-2 / 2 在畫面外
  const SLOTS = {
    "-2": { x: -16, y: 50, s: 1.3, a: 0.75 },
    "-1": { x: 22, y: 50, s: 1.3, a: 0.75 },
    "0": { x: 64, y: 52, s: 2.4, a: 1 },
    "1": { x: 106, y: 50, s: 1.3, a: 0.75 },
    "2": { x: 144, y: 50, s: 1.3, a: 0.75 },
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
    pctx.lineTo(88, 53);
    pctx.lineTo(40, 53);
    pctx.closePath();
    pctx.fill();
    pctx.fillStyle = "rgba(255, 246, 234, 0.4)";
    pctx.beginPath();
    pctx.ellipse(64, 52.5, 24, 3.6, 0, 0, Math.PI * 2);
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

  function spotFrame(ms) {
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
    requestAnimationFrame(spotFrame);
  }

  function updateCount() {
    countEl.textContent = order.length ? "第 " + (cur + 1) + " / " + order.length + " 個" : "還沒有禮物";
    document.getElementById("ex-next").disabled = cur >= order.length - 1;
  }

  // 輪轉到第 to 個；動畫中再按會從目前畫面位置接著轉
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

  document.getElementById("ex-next").addEventListener("click", () => turnTo(cur + 1));
  document.getElementById("ex-reset").addEventListener("click", () => turnTo(0));
  document.addEventListener("keydown", (e) => {
    if (exEl.hidden) return;
    if (e.key === "ArrowRight" || e.key === " ") {
      e.preventDefault();
      turnTo(cur + 1);
    } else if (e.key === "ArrowLeft") {
      turnTo(cur - 1);
    }
  });

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
    updateCount();
  }

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
      console.log("[exchange] draw order loaded, seed", r.data.seed);
    }
  }
  async function refresh(data) {
    await loadDrawOrder();
    applyState(data);
  }

  // 開發用：?turn=n 進場後自動輪轉 n 次（間隔 ?gap 毫秒，預設 1500），方便截圖驗收
  const QS = new URLSearchParams(location.search);
  const AUTO_TURN = Number(QS.get("turn")) || 0;
  const AUTO_GAP = Number(QS.get("gap")) || 1500;

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
    for (let i = 0; i < AUTO_TURN; i++) setTimeout(() => turnTo(cur + 1), AUTO_GAP * (i + 1));
    setInterval(async () => {
      const r = await api("/api/state");
      if (r.ok) await refresh(r.data);
    }, POLL_MS);
  }

  loadRoster();
})();
