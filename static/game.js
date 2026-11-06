(function () {
  "use strict";

  const TOKEN_KEY = "xmas_party_token"; // 舊版存登入用的 key，只用來清除
  const POLL_MS = 3000;

  // ---------- 正方形禮物與小腳（同影片色票：o 描邊、c 包裝紙、T 緞帶、Q 蝴蝶結、U 藍點、s 陰影、w 白腳） ----------
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

  // ---------- 禮物標籤配色：包裝紙 c、紙陰影 s、緞帶 T、蝴蝶結 Q（皆為粉嫩寶寶色系，不用紅綠配） ----------
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

  // ---------- 點陣轉畫布 ----------
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
  // 每個標籤一款換色的正方形禮物
  Object.keys(LABEL_COLORS).forEach((label) => {
    addExtra("gift_box@" + label, EXTRA.gift_box, Object.assign({}, PAL, LABEL_COLORS[label]));
  });
  function boxSprite(label) {
    return label && SPR["gift_box@" + label] ? "gift_box@" + label : "gift_box";
  }
  function tagColor(label) {
    return LABEL_COLORS[label] ? LABEL_COLORS[label].c : "#F4ECDD";
  }

  // 以零件關節對齊 (ax, ay) 畫出，帶 0.35 格紙片投影（與影片 story.html 的 piece() 相同）
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

  // ---------- 緩動 ----------
  const clamp01 = (v) => Math.max(0, Math.min(1, v));
  const easeOut = (p) => 1 - Math.pow(1 - p, 3);
  const easeBack = (p) => {
    const c1 = 2.4;
    return 1 + (c1 + 1) * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2);
  };
  function seg(t, t0, t1) {
    return clamp01((t - t0) / (t1 - t0));
  }

  // ---------- 像素場景（世界 128 x 72 格，一格 15 px） ----------
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

  // 主角：穿孕婦洋裝、戴紅蝴蝶結的白貓（側面）
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

  function drawHearts(x, y, t) {
    for (let i = 0; i < 3; i++) {
      const u = (t * 0.5 + i / 3) % 1;
      sctx.globalAlpha = 1 - u;
      piece(sctx, "heart", 0, { ax: x + Math.sin((t + i) * 2) * 2, ay: y - u * 14 });
    }
    sctx.globalAlpha = 1;
  }

  // 邀請函動畫時間軸（秒）
  const INTRO_END = 3.2;
  function drawIntro(t) {
    drawRoom();
    drawCat(-2, 34, t);
    // 信封彈入
    if (t < 1.8) {
      const fly = easeBack(seg(t, 0.2, 0.9));
      const shrink = 1 - seg(t, 1.4, 1.8);
      const ey = 92 - (92 - 36) * fly;
      piece(sctx, "envelope", 0, { ax: 72, ay: ey, scale: 3 * shrink });
      // 愛心封蠟彈開
      if (t > 1.1) {
        const pop = easeBack(seg(t, 1.1, 1.45));
        sctx.globalAlpha = 1 - seg(t, 1.45, 1.8);
        piece(sctx, "heart", 0, { ax: 72, ay: 37 - pop * 5, scale: 1 + pop * 1.5 });
        sctx.globalAlpha = 1;
      }
    }
    // 邀請函滑出放大
    if (t > 1.4) {
      const g = easeOut(seg(t, 1.4, 2.4));
      piece(sctx, "letter", 0, { ax: 74, ay: 34 + (1 - g) * 10, scale: 0.15 + g * 0.65 });
    }
    if (t > 2.4) drawHearts(30, 46, t);
  }

  function drawIdle(t) {
    drawRoom();
    piece(sctx, "gift6", 0, { ax: 100, ay: 56 });
    piece(sctx, "gift6", 0, { ax: 114, ay: 57, scale: 0.85 });
    drawCat(4, 33, t);
    drawHearts(42, 52, t);
  }

  let sceneMode = "intro";
  let introStart = null;
  // 開發用：?t=秒數 把邀請函動畫凍結在該時間點，方便截圖驗收
  const FREEZE_T = Number(new URLSearchParams(location.search).get("t"));
  function sceneFrame(ms) {
    if (sceneMode === "off") return;
    if (introStart === null) introStart = ms;
    const t = sceneMode === "intro" && FREEZE_T > 0 ? FREEZE_T : (ms - introStart) / 1000;
    sctx.setTransform(CELL, 0, 0, CELL, 0, 0);
    sctx.imageSmoothingEnabled = false;
    if (sceneMode === "intro") {
      drawIntro(t);
      if (t >= INTRO_END) showEnter();
    } else {
      drawIdle(t);
    }
    requestAnimationFrame(sceneFrame);
  }

  // ---------- 畫面切換 ----------
  const screens = {
    intro: document.getElementById("intro"),
    login: document.getElementById("login"),
    wall: document.getElementById("wall"),
  };
  function show(name) {
    Object.keys(screens).forEach((k) => (screens[k].hidden = k !== name));
    document.getElementById("top-btns").hidden = name === "intro";
    if (name === "login") {
      // 公用電腦：不留上一個人的名字與密碼
      document.getElementById("login-card").reset();
      document.getElementById("login-error").hidden = true;
    }
    document.body.classList.toggle("scene-cover", name === "login");
    if (name === "wall") {
      sceneMode = "off";
      scene.hidden = true;
    } else {
      const wasOff = sceneMode === "off";
      scene.hidden = false;
      if (name === "login") sceneMode = "idle";
      if (wasOff) requestAnimationFrame(sceneFrame);
    }
  }

  // ---------- API ----------
  // 登入狀態只放記憶體、不寫進瀏覽器：有人用公用電腦，重新整理就要重新登入
  let sessionToken = null;
  try {
    localStorage.removeItem(TOKEN_KEY); // 清掉舊版記住的登入
  } catch (e) {
    /* 拿不到 storage 就算了 */
  }
  function token() {
    return sessionToken;
  }
  function saveToken(v) {
    sessionToken = v || null;
  }
  async function api(path, body) {
    const headers = { "Content-Type": "application/json" };
    const tk = token();
    if (tk) headers["X-Token"] = tk;
    const res = await fetch(path, body ? { method: "POST", headers, body: JSON.stringify(body) } : { headers });
    const data = await res.json();
    return { ok: res.ok, status: res.status, data };
  }

  // ---------- 1. 邀請函 ----------
  const enterBtn = document.getElementById("enter");
  const skipHint = document.getElementById("skip-hint");
  function showEnter() {
    if (!enterBtn.hidden) return;
    enterBtn.hidden = false;
    skipHint.hidden = true;
  }
  screens.intro.addEventListener("click", (e) => {
    if (e.target === enterBtn) return;
    if (enterBtn.hidden && introStart !== null) introStart -= INTRO_END * 1000;
  });
  enterBtn.addEventListener("click", () => show("login"));

  // ---------- 2. 登入 ----------
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
    saveToken(r.data.token);
    const s = await api("/api/state");
    enterWall(s.data);
  });

  // ---------- 3. 禮物牆 ----------
  const GIFT_PX = 6; // 一格畫成 6 px，再由 CSS 放大
  const GIFT_W = 17;
  const GIFT_H = 22;
  const giftsEl = document.getElementById("gifts");
  const wallEl = screens.wall;
  const hintEl = document.getElementById("wall-hint");
  const tiles = new Map(); // gift_id -> { el, ctx, label, animal, claimed }
  let me = null;
  let pollTimer = null;

  // pose：rest 平放、stand 站、squat 蹲；label 決定包裝紙顏色
  function drawGift(ctx, pose, label) {
    const box = boxSprite(label);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.setTransform(GIFT_PX, 0, 0, GIFT_PX, 0, 0);
    ctx.imageSmoothingEnabled = false;
    if (pose === "rest") {
      piece(ctx, box, 0, { ax: 0, ay: 5 });
      return;
    }
    const stand = pose === "stand";
    const legY = stand ? 16 : 18;
    const leg = stand ? "leg_stand" : "leg_squat";
    piece(ctx, leg, 0, { ax: 3, ay: legY });
    piece(ctx, leg, 0, { ax: 9, ay: legY });
    piece(ctx, box, 0, { ax: 0, ay: stand ? 0 : 2 });
  }

  function drawSign() {
    const c = document.getElementById("wall-sign");
    const ctx = c.getContext("2d");
    ctx.setTransform(8, 0, 0, 8, 0, 0);
    ctx.imageSmoothingEnabled = false;
    piece(ctx, "sign_back", 0, { ax: 25, ay: 11 });
  }

  function buildWall(gifts) {
    giftsEl.textContent = "";
    tiles.clear();
    gifts.forEach((g) => {
      const el = document.createElement("button");
      el.type = "button";
      el.className = "gift";
      const cv = document.createElement("canvas");
      cv.width = GIFT_W * GIFT_PX;
      cv.height = GIFT_H * GIFT_PX;
      const tag = document.createElement("span");
      tag.className = "tag";
      const label = document.createElement("span");
      label.className = "label";
      label.textContent = g.animal + "的禮物";
      el.append(cv, tag, label);
      el.addEventListener("click", () => onGiftClick(g.gift_id));
      giftsEl.appendChild(el);
      const tile = { el, ctx: cv.getContext("2d"), tag, label, animal: g.animal, claimed: false, giftLabel: null };
      tiles.set(g.gift_id, tile);
      drawGift(tile.ctx, "rest");
    });
  }

  function applyState(data) {
    if (data.labels) labels = data.labels;
    if (data.me) me = data.me;
    data.gifts.forEach((g) => {
      const tile = tiles.get(g.gift_id);
      if (!tile) return;
      if (tile.giftLabel !== g.label) {
        tile.giftLabel = g.label;
        tile.tag.textContent = g.label || "";
        tile.tag.style.background = tagColor(g.label);
        tile.drawn = false;
      }
      tile.claimed = g.claimed;
      tile.el.classList.toggle("claimed", g.claimed);
      tile.el.classList.toggle("mine", !!me && me.gift_id === g.gift_id);
      if (!g.claimed) drawGift(tile.ctx, "rest", g.label);
    });
    if (me && me.gift_id) {
      wallEl.classList.add("done");
      hintEl.textContent = "你是" + me.animal + "！點你的禮物可以換標籤";
    }
  }

  function enterWall(data) {
    show("wall");
    drawSign();
    buildWall(data.gifts);
    applyState(data);
    if (me && me.gift_id && !me.label) openPicker();
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(async () => {
      const r = await api("/api/state");
      if (r.ok) applyState(r.data);
    }, POLL_MS);
    requestAnimationFrame(legsFrame);
  }

  // 長出腳的禮物：每 0.4 秒蹲、站交替
  let lastPose = null;
  function legsFrame(ms) {
    const pose = Math.floor(ms / 400) % 2 ? "squat" : "stand";
    tiles.forEach((tile) => {
      if (tile.claimed && (pose !== lastPose || !tile.drawn)) {
        drawGift(tile.ctx, pose, tile.giftLabel);
        tile.drawn = true;
      }
      if (!tile.claimed) tile.drawn = false;
    });
    lastPose = pose;
    if (!wallEl.hidden) requestAnimationFrame(legsFrame);
  }

  function nope(tile) {
    tile.el.classList.remove("shake");
    void tile.el.offsetWidth;
    tile.el.classList.add("shake");
    tile.label.innerHTML = '<span class="nope">不是你喔</span>';
    clearTimeout(tile.nopeTimer);
    tile.nopeTimer = setTimeout(() => (tile.label.textContent = tile.animal + "的禮物"), 1200);
  }

  function backToLogin() {
    saveToken(null);
    closePicker();
    show("login");
  }

  async function onGiftClick(giftId) {
    const tile = tiles.get(giftId);
    if (!tile) return;
    if (me && me.gift_id === giftId) return openPicker();
    if (tile.claimed || (me && me.gift_id)) return;
    const r = await api("/api/guess", { gift_id: giftId });
    if (r.status === 401) return backToLogin();
    const result = r.data.result;
    if (result === "wrong") nope(tile);
    const s = await api("/api/state");
    if (s.ok) applyState(s.data);
    if (result === "correct") openPicker();
  }

  // ---------- 標籤選單 ----------
  let labels = [];
  const pickerEl = document.getElementById("label-picker");
  const optionsEl = document.getElementById("label-options");

  function openPicker() {
    optionsEl.textContent = "";
    labels.forEach((lb) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "label-opt" + (me && me.label === lb ? " current" : "");
      b.textContent = lb;
      b.style.background = tagColor(lb);
      b.addEventListener("click", () => chooseLabel(lb));
      optionsEl.appendChild(b);
    });
    pickerEl.hidden = false;
  }
  function closePicker() {
    pickerEl.hidden = true;
  }
  async function chooseLabel(lb) {
    const r = await api("/api/label", { label: lb });
    if (r.status === 401) return backToLogin();
    closePicker();
    const s = await api("/api/state");
    if (s.ok) applyState(s.data);
  }
  document.getElementById("label-cancel").addEventListener("click", closePicker);

  // ---------- 再看一次邀請函（用影片的 letter 零件，原尺寸 300x198 放大 3 倍） ----------
  const rulesEl = document.getElementById("rules");
  function openRules() {
    const c = document.getElementById("rules-letter");
    const ctx = c.getContext("2d");
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(SPR.letter.c, 0, 0, c.width, c.height);
    rulesEl.hidden = false;
  }
  document.getElementById("rules-btn").addEventListener("click", openRules);
  document.getElementById("rules-close").addEventListener("click", () => (rulesEl.hidden = true));
  rulesEl.addEventListener("click", (e) => {
    if (e.target === rulesEl) rulesEl.hidden = true;
  });

  // ---------- 預告片（trailer.js 的 render(t) 逐格畫在 canvas 上） ----------
  const trailerEl = document.getElementById("trailer");
  const playBtn = document.getElementById("trailer-play");
  const seekEl = document.getElementById("trailer-seek");
  const timeEl = document.getElementById("trailer-time");
  const DUR = window.TRAILER.duration;
  let trailerT = 0;
  let playing = false;
  let lastMs = null;

  function showTrailerFrame() {
    window.TRAILER.render(trailerT);
    seekEl.value = trailerT;
    const s = Math.floor(trailerT);
    timeEl.textContent = Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
  }
  function setPlaying(v) {
    playing = v;
    playBtn.textContent = v ? "暫停" : trailerT >= DUR ? "重播" : "播放";
    lastMs = null;
    if (v) requestAnimationFrame(trailerFrame);
  }
  function trailerFrame(ms) {
    if (!playing || trailerEl.hidden) return;
    if (lastMs !== null) trailerT = Math.min(DUR, trailerT + (ms - lastMs) / 1000);
    lastMs = ms;
    showTrailerFrame();
    if (trailerT >= DUR) return setPlaying(false);
    requestAnimationFrame(trailerFrame);
  }
  function closeTrailer() {
    setPlaying(false);
    trailerEl.hidden = true;
  }
  document.getElementById("trailer-btn").addEventListener("click", () => {
    trailerT = 0;
    trailerEl.hidden = false;
    showTrailerFrame();
    setPlaying(true);
  });
  playBtn.addEventListener("click", () => {
    if (!playing && trailerT >= DUR) trailerT = 0;
    setPlaying(!playing);
  });
  seekEl.max = DUR;
  seekEl.addEventListener("input", () => {
    trailerT = Number(seekEl.value);
    showTrailerFrame();
    if (!playing) playBtn.textContent = "播放";
  });
  document.getElementById("trailer-close").addEventListener("click", closeTrailer);
  trailerEl.addEventListener("click", (e) => {
    if (e.target === trailerEl) closeTrailer();
  });

  // ---------- 開場 ----------
  loadRoster();
  show("intro");
  requestAnimationFrame(sceneFrame);
})();
