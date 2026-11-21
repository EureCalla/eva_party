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
    // 預告片要登入（帳號＋暗號）進到禮物牆才看得到
    document.getElementById("trailer-btn").hidden = name !== "wall";
    if (name !== "wall") document.getElementById("admin-btn").hidden = true;
    if (name === "login") {
      // 公用電腦：不留上一個人的名字與密碼
      document.getElementById("login-card").reset();
      document.getElementById("login-error").hidden = true;
      loadRoster(); // 管理者可能剛增刪人員，名單每次重讀
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
    while (loginName.options.length > 1) loginName.remove(1); // 保留「選擇你的名字」
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
  let stage = "seating";
  let stages = [];
  let wallSig = ""; // 禮物牆組成（id＋動物），人員異動時重建
  const STAGE_HINT = {
    reveal: "標籤公布！看看大家的禮物",
    exchange: "交換禮物遊戲進行中",
    feast: "一起享用大餐吧！",
  };
  // 可以寫／改禮物描述的階段（與 models.DESCRIBE_STAGES 一致，server 端會再檢查）
  const DESCRIBE_STAGES = ["reveal", "exchange"];
  let descMax = 50;
  let descPromptedStage = null; // 這個階段已經自動跳過描述視窗，避免每次輪詢都跳

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

  let tappedGift = null;
  function clearTappedGift() {
    tappedGift?.classList.remove("show-description");
    tappedGift = null;
  }

  wallEl.addEventListener("click", (e) => {
    if (tappedGift && !tappedGift.contains(e.target)) clearTappedGift();
  });

  function buildWall(gifts) {
    clearTappedGift();
    giftsEl.textContent = "";
    tiles.clear();
    gifts.forEach((g) => {
      const card = document.createElement("div");
      card.className = "gift-card";
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
      label.id = "gift-label-" + g.gift_id;
      label.textContent = g.animal + "的禮物";
      el.setAttribute("aria-labelledby", label.id);
      const description = document.createElement("span");
      description.className = "gift-description";
      description.id = "gift-description-" + g.gift_id;
      description.setAttribute("role", "tooltip");
      description.hidden = true;
      el.append(cv, tag, label, description);
      el.addEventListener("click", () => onGiftClick(g.gift_id));
      const heart = document.createElement("button");
      heart.type = "button";
      heart.className = "gift-heart";
      heart.hidden = true;
      heart.addEventListener("click", () => setGiftHeart(g.gift_id));
      card.append(el, heart);
      giftsEl.appendChild(card);
      const tile = {
        el,
        ctx: cv.getContext("2d"),
        tag,
        label,
        description,
        heart,
        hearted: false,
        canHeart: false,
        heartPending: false,
        animal: g.animal,
        claimed: false,
        giftLabel: null,
        described: false,
      };
      tiles.set(g.gift_id, tile);
      drawGift(tile.ctx, "rest");
    });
  }

  // 活動進度條：已過、目前、未到
  function renderStageBar() {
    const bar = document.getElementById("stage-bar");
    const cur = stages.findIndex((s) => s.key === stage);
    bar.textContent = "";
    stages.forEach((s, i) => {
      const li = document.createElement("li");
      li.className = i < cur ? "done" : i === cur ? "current" : "todo";
      const dot = document.createElement("span");
      dot.className = "dot";
      const name = document.createElement("span");
      name.className = "name";
      name.textContent = s.name;
      li.append(dot, name);
      bar.appendChild(li);
    });
  }

  function canDescribe() {
    return DESCRIBE_STAGES.includes(stage) && !!(me && me.gift_id);
  }

  function updateHint() {
    const seating = stage === "seating";
    wallEl.classList.toggle("locked", !seating);
    wallEl.classList.toggle("done", !seating || !!(me && me.gift_id));
    wallEl.classList.toggle("describe", canDescribe()); // 自己的禮物可以點開寫描述
    if (stage === "exchange" && !exchangeStarted) hintEl.textContent = "等待管理者開始";
    else if (canDescribe() && !me.description) hintEl.textContent = "標籤公布！點你的禮物寫下禮物描述";
    else if (canDescribe()) hintEl.textContent = (STAGE_HINT[stage] || "") + "（描述隨時可以再修改）";
    else if (!seating) hintEl.textContent = STAGE_HINT[stage] || "";
    else if (me && me.gift_id) hintEl.textContent = "你是" + me.animal + "！點你的禮物可以換標籤";
    else hintEl.textContent = "猜猜哪個是你的禮物？";
  }

  // 進到可寫描述的階段、自己還沒寫：每個階段自動跳一次描述視窗
  function promptDescription() {
    if (!canDescribe() || me.description || descPromptedStage === stage) return;
    descPromptedStage = stage;
    if (pickerEl.hidden && adminEl.hidden) openDesc();
  }

  const exchangeBtn = document.getElementById("exchange-btn");
  const exchangeStartBtn = document.getElementById("exchange-start-btn");
  const exchangeStartError = document.getElementById("exchange-start-error");
  const giftDescriptionHint = document.getElementById("gift-description-hint");
  const giftHeartHint = document.getElementById("gift-heart-hint");
  const giftHeartNotice = document.getElementById("gift-heart-notice");
  let giftHeartNoticeTimer;
  let exchangeStarted = false;
  const stayOnWall = new URLSearchParams(location.search).get("wall") === "1";
  let goingToExchange = false;

  function openExchange() {
    if (goingToExchange) return;
    goingToExchange = true;
    try {
      sessionStorage.setItem("exchange_handoff_token", token());
    } catch (e) {
      /* 無法交接登入時，聚光燈頁會顯示登入畫面 */
    }
    location.href = "/exchange/";
  }

  exchangeBtn.addEventListener("click", openExchange);
  exchangeStartBtn.addEventListener("click", async () => {
    exchangeStartBtn.disabled = true;
    exchangeStartError.hidden = true;
    try {
      const result = await api("/api/exchange/start", {});
      await refreshState();
      if (!result.ok && !exchangeStarted && stage === "exchange") {
        exchangeStartError.textContent = result.data.result === "empty" ? "目前沒有可交換的禮物" : "無法開始交換禮物";
        exchangeStartError.hidden = false;
      }
    } catch (e) {
      exchangeStartError.textContent = "連線失敗，請再試一次";
      exchangeStartError.hidden = false;
    } finally {
      exchangeStartBtn.disabled = false;
    }
  });

  function showHeartNotice(text) {
    clearTimeout(giftHeartNoticeTimer);
    giftHeartNotice.textContent = text;
    giftHeartNotice.hidden = !text;
    if (text) giftHeartNoticeTimer = setTimeout(() => { giftHeartNotice.hidden = true; }, 3500);
  }

  async function setGiftHeart(giftId) {
    const tile = tiles.get(giftId);
    if (!tile || !tile.canHeart || tile.heartPending) return;
    tile.heartPending = true;
    tile.heart.disabled = true;
    showHeartNotice("");
    try {
      const result = await api("/api/gift-heart", { gift_id: giftId, liked: !tile.hearted });
      if (result.ok || result.data.result === "locked") {
        await refreshState();
      } else {
        showHeartNotice(result.data.result === "limit" ? "每人最多只能按五個愛心" : "無法更新愛心，請再試一次");
      }
    } catch (e) {
      showHeartNotice("連線失敗，請再試一次");
    } finally {
      tile.heartPending = false;
      tile.heart.disabled = !tile.canHeart;
    }
  }

  function applyState(data) {
    if (data.labels) labels = data.labels;
    if (data.stages) stages = data.stages;
    if (data.stage) stage = data.stage;
    if (data.description_max) descMax = data.description_max;
    // 登入的人被管理者刪掉了：回登入頁
    if (token() && !data.me && !wallEl.hidden) return backToLogin();
    if (data.me) me = data.me;
    window.FeastFinale.render(stage === "feast" && data.me ? data.feast_messages : null);
    exchangeStarted = stage === "exchange" && data.exchange_started === true;
    exchangeBtn.hidden = !(exchangeStarted && data.me);
    exchangeStartBtn.hidden = !(stage === "exchange" && !exchangeStarted && data.me && data.me.is_admin);
    if (exchangeStartBtn.hidden) exchangeStartError.hidden = true;
    if (exchangeStarted && data.me && !stayOnWall) return openExchange();
    const showDescriptions = stage === "exchange";
    giftDescriptionHint.hidden = !showDescriptions;
    if (!showDescriptions) clearTappedGift();
    const votingOpen = showDescriptions && !exchangeStarted && !!data.me;
    giftHeartHint.hidden = !votingOpen;
    if (!votingOpen) showHeartNotice("");
    wallEl.classList.toggle("public-descriptions", showDescriptions);
    const sig = data.gifts.map((g) => g.gift_id + ":" + g.animal).join(",");
    if (sig !== wallSig) {
      wallSig = sig;
      buildWall(data.gifts);
    }
    renderStageBar();
    document.getElementById("admin-btn").hidden = wallEl.hidden || !(me && me.is_admin);
    data.gifts.forEach((g) => {
      const tile = tiles.get(g.gift_id);
      if (!tile) return;
      if (tile.giftLabel !== g.label) {
        tile.giftLabel = g.label;
        tile.tag.textContent = g.label || "";
        tile.tag.style.background = tagColor(g.label);
        tile.drawn = false;
      }
      const description = showDescriptions ? g.description || "" : "";
      if (tile.description.textContent !== description) tile.description.textContent = description;
      tile.description.hidden = !description;
      tile.el.classList.toggle("has-description", !!description);
      if (description) tile.el.setAttribute("aria-describedby", tile.description.id);
      else tile.el.removeAttribute("aria-describedby");
      tile.claimed = g.claimed;
      tile.described = !!g.described;
      tile.el.classList.toggle("claimed", g.claimed);
      const mine = !!me && me.gift_id === g.gift_id;
      tile.el.classList.toggle("mine", mine);
      tile.hearted = g.hearted === true;
      tile.canHeart = votingOpen && g.claimed && !mine;
      tile.heart.hidden = !showDescriptions;
      tile.heart.disabled = !tile.canHeart || tile.heartPending;
      if (showDescriptions) {
        const count = g.heart_count ?? 0;
        tile.heart.textContent = (tile.hearted ? "♥ " : "♡ ") + count;
        tile.heart.setAttribute("aria-label", g.animal + "的禮物，" + count + " 個愛心");
        tile.heart.setAttribute("aria-pressed", String(tile.hearted));
      }
      if (!g.claimed) drawGift(tile.ctx, "rest", g.label);
    });
    updateHint();
    renderFeastReply(data.feast_reply, data.feast_reply_min, data.feast_reply_max);
    if (!wallEl.hidden) promptDescription();
  }

  async function refreshState() {
    const r = await api("/api/state");
    if (r.ok) applyState(r.data);
  }

  function enterWall(data) {
    show("wall");
    drawSign();
    wallSig = "";
    applyState(data);
    if (stage === "seating" && me && me.gift_id && !me.label) openPicker();
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(refreshState, POLL_MS);
    requestAnimationFrame(legsFrame);
  }

  // 長出腳的禮物：每 0.4 秒蹲、站交替；寫好描述的禮物跳快一倍（0.2 秒）
  const STEP_MS = 400;
  const STEP_MS_DESCRIBED = 200;
  function legsFrame(ms) {
    tiles.forEach((tile) => {
      if (!tile.claimed) {
        tile.drawn = false;
        return;
      }
      const step = tile.described ? STEP_MS_DESCRIBED : STEP_MS;
      const pose = Math.floor(ms / step) % 2 ? "squat" : "stand";
      if (pose !== tile.pose || !tile.drawn) {
        drawGift(tile.ctx, pose, tile.giftLabel);
        tile.pose = pose;
        tile.drawn = true;
      }
    });
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
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = null;
    me = null;
    renderFeastReply(null);
    window.FeastFinale.render(null);
    descPromptedStage = null;
    closePicker();
    closeDesc();
    clearTappedGift();
    document.getElementById("admin").hidden = true;
    show("login");
  }

  const feastDialog = document.getElementById("feast-reply-dialog");
  const feastForm = document.getElementById("feast-reply-form");
  const feastGift = document.getElementById("feast-reply-gift");
  const feastGiverName = document.getElementById("feast-giver-name");
  const feastRule = document.getElementById("feast-reply-rule");
  const feastInput = document.getElementById("feast-reply-input");
  const feastCount = document.getElementById("feast-reply-count");
  const feastError = document.getElementById("feast-reply-error");
  const feastSubmit = document.getElementById("feast-reply-submit");
  const feastStatus = document.getElementById("feast-reply-status");
  let feastReply = null;
  let feastMin = 4;
  let feastLimit = 50;
  let feastSending = false;

  function feastText() {
    return feastInput.value.replace(/\r?\n/g, " ").trim();
  }

  function updateFeastCount() {
    const text = feastText();
    const length = Array.from(text).length;
    const visibleLength = Array.from(text.replace(/\s/gu, "")).length;
    feastCount.textContent = length + " / " + feastLimit;
    feastSubmit.disabled = feastSending || visibleLength < feastMin || length > feastLimit;
  }

  function renderFeastReply(reply, min, max) {
    const active = stage === "feast" && !!me;
    const changed = feastReply?.gift_id !== reply?.gift_id || feastReply?.giver_name !== reply?.giver_name;
    feastReply = active ? reply : null;
    if (min) feastMin = min;
    if (max) feastLimit = max;
    feastStatus.hidden = !active || (!!reply && !reply.submitted);
    if (active) {
      feastStatus.textContent = reply ? "留言已送出。" : "目前沒有可留言的禮物。";
    }
    if (!active || !reply || reply.submitted) {
      if (feastDialog.open) feastDialog.close();
      return;
    }
    if (changed || !feastDialog.open) {
      feastInput.value = "";
      feastError.hidden = true;
    }
    const giftName = reply.animal + "的禮物" + (reply.label ? "（" + reply.label + "）" : "");
    feastGift.textContent = "你拿到的是 " + giftName + "。";
    feastGiverName.textContent = reply.giver_animal + " " + reply.giver_name;
    feastRule.textContent = "至少 " + feastMin + " 字（空白不算）";
    updateFeastCount();
    if (!feastDialog.open) feastDialog.showModal();
  }

  feastDialog.addEventListener("cancel", (e) => e.preventDefault());
  feastInput.addEventListener("input", () => {
    feastError.hidden = true;
    updateFeastCount();
  });
  feastForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (feastSubmit.disabled || !feastReply) return;
    const reply = feastReply;
    feastSending = true;
    feastInput.readOnly = true;
    feastError.hidden = true;
    updateFeastCount();
    try {
      const result = await api("/api/feast-reply", { gift_id: reply.gift_id, message: feastText() });
      if (result.ok) {
        if (feastReply?.gift_id === reply.gift_id && feastReply?.giver_name === reply.giver_name) {
          renderFeastReply({ ...reply, submitted: true });
          await refreshState();
        }
      } else if (result.status === 401) {
        backToLogin();
      } else if (result.data.result === "locked" || result.data.result === "wrong_gift") {
        await refreshState();
        feastError.textContent = "禮物資料已更新，請確認後再送出。";
        feastError.hidden = false;
      } else {
        feastError.textContent = "請寫一句 " + feastMin + " 至 " + feastLimit + " 字的留言。";
        feastError.hidden = false;
      }
    } catch (e) {
      feastError.textContent = "連線失敗，請再試一次";
      feastError.hidden = false;
    } finally {
      feastSending = false;
      feastInput.readOnly = false;
      updateFeastCount();
    }
  });

  async function onGiftClick(giftId) {
    const tile = tiles.get(giftId);
    if (!tile) return;
    // 自己的禮物可編輯；觸控裝置可點別人的禮物查看介紹。
    if (stage !== "seating") {
      if (canDescribe() && me.gift_id === giftId) {
        clearTappedGift();
        openDesc();
      } else if (stage === "exchange" && !tile.description.hidden && window.matchMedia("(hover: none)").matches) {
        const wasOpen = tappedGift === tile.el;
        clearTappedGift();
        if (!wasOpen) {
          tappedGift = tile.el;
          tappedGift.classList.add("show-description");
        }
      }
      return;
    }
    if (me && me.gift_id === giftId) return openPicker();
    if (tile.claimed || (me && me.gift_id)) return;
    const r = await api("/api/guess", { gift_id: giftId });
    if (r.status === 401) return backToLogin();
    const result = r.data.result;
    if (result === "wrong") nope(tile);
    await refreshState();
    if (result === "correct" && stage === "seating") openPicker();
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
  // ---------- 禮物描述（公布標籤、交換禮物階段；只有自己看得到） ----------
  const descEl = document.getElementById("desc-editor");
  const descForm = document.getElementById("desc-form");
  const descInput = document.getElementById("desc-input");
  const descCount = document.getElementById("desc-count");
  const descErr = document.getElementById("desc-error");
  const DESC_ERRORS = {
    empty: "請先寫一點描述",
    too_long: "描述太長了",
    locked: "現在不能修改描述了",
    not_claimed: "你還沒有認領禮物",
  };

  function updateDescCount() {
    descCount.textContent = descInput.value.trim().length + " / " + descMax;
  }
  function openDesc() {
    descInput.maxLength = descMax;
    descInput.value = (me && me.description) || "";
    descErr.hidden = true;
    updateDescCount();
    descEl.hidden = false;
    descInput.focus();
  }
  function closeDesc() {
    descEl.hidden = true;
  }
  descInput.addEventListener("input", updateDescCount);
  descForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const r = await api("/api/description", { description: descInput.value });
    if (r.status === 401) return backToLogin();
    if (!r.ok) {
      descErr.textContent = DESC_ERRORS[r.data.result] || "送出失敗";
      descErr.hidden = false;
      if (r.data.result === "locked") await refreshState();
      return;
    }
    closeDesc();
    await refreshState();
  });
  document.getElementById("desc-cancel").addEventListener("click", closeDesc);

  async function chooseLabel(lb) {
    const r = await api("/api/label", { label: lb });
    if (r.status === 401) return backToLogin();
    closePicker(); // 409 locked（階段剛被切走）也一樣關掉，狀態以 server 為準
    await refreshState();
  }
  document.getElementById("label-cancel").addEventListener("click", closePicker);

  // ---------- 管理頁：切換活動階段、新增／修改／刪除人員（server 端會再檢查管理者權限） ----------
  const adminEl = document.getElementById("admin");
  const adminMsg = document.getElementById("admin-msg");
  const stageOptsEl = document.getElementById("stage-options");
  const peopleEl = document.getElementById("people-list");
  const addForm = document.getElementById("people-add");

  function adminNotice(text, ok) {
    adminMsg.textContent = text || "";
    adminMsg.hidden = !text;
    adminMsg.classList.toggle("ok", !!ok);
  }

  function renderStageOptions() {
    stageOptsEl.textContent = "";
    stages.forEach((s, i) => {
      const lb = document.createElement("label");
      lb.className = s.key === stage ? "now" : "";
      const radio = document.createElement("input");
      radio.type = "radio";
      radio.name = "stage";
      radio.value = s.key;
      radio.checked = s.key === stage;
      lb.append(radio, document.createTextNode(i + 1 + ". " + s.name + (s.key === stage ? "（目前）" : "")));
      stageOptsEl.appendChild(lb);
    });
  }

  function renderPeople(list) {
    peopleEl.textContent = "";
    list.forEach((p) => {
      const row = document.createElement("div");
      row.className = "people-row";
      const name = document.createElement("input");
      name.value = p.en_name;
      name.setAttribute("aria-label", "英文名字");
      const animal = document.createElement("input");
      animal.value = p.animal;
      animal.setAttribute("aria-label", "動物");
      const pw = document.createElement("input");
      pw.value = p.password;
      pw.setAttribute("aria-label", "暗號");
      pw.title = "暗號（改權限時沒手動改，會自動換成該身分的預設暗號）";
      const chk = document.createElement("label");
      chk.className = "chk";
      const admin = document.createElement("input");
      admin.type = "checkbox";
      admin.checked = p.admin;
      chk.append(admin, document.createTextNode("管理者"));
      const save = document.createElement("button");
      save.type = "button";
      save.className = "pixel-btn small";
      save.textContent = "儲存";
      save.addEventListener("click", () =>
        peopleAction(
          {
            action: "update",
            id: p.id,
            en_name: name.value,
            animal: animal.value,
            password: pw.value,
            admin: admin.checked,
          },
          "已更新 " + name.value
        )
      );
      const del = document.createElement("button");
      del.type = "button";
      del.className = "pixel-btn small del";
      del.textContent = "刪除";
      del.addEventListener("click", () => {
        const note = p.guessed ? "，他認領的禮物會被釋放" : "";
        if (confirm("確定刪除 " + p.en_name + "（" + p.animal + "）" + note + "？")) {
          peopleAction({ action: "delete", id: p.id }, "已刪除 " + p.en_name);
        }
      });
      row.append(name, animal, pw, chk, save, del);
      peopleEl.appendChild(row);
    });
  }

  const userPwForm = document.getElementById("user-pw");
  const userPwInput = document.getElementById("user-pw-input");
  let people = [];

  function showPeople(data) {
    people = data.players;
    renderPeople(people);
    userPwInput.value = data.user_password;
  }

  async function loadPeople() {
    const r = await api("/api/admin/players");
    if (r.status === 401) return backToLogin();
    if (!r.ok) return adminNotice(r.data.error || "讀取人員失敗");
    showPeople(r.data);
  }

  async function peopleAction(body, okText) {
    const r = await api("/api/admin/players", body);
    if (!r.ok) {
      adminNotice(r.data.error || "操作失敗");
      return false;
    }
    showPeople(r.data);
    adminNotice(okText, true);
    await refreshState();
    return true;
  }

  async function openAdmin() {
    adminNotice("");
    renderStageOptions();
    adminEl.hidden = false;
    await loadPeople();
  }

  // 切換階段被擋下：列出還沒選標籤／還沒寫描述的人
  const blockEl = document.getElementById("stage-block");
  const BLOCK_WHAT = { label: "選標籤", description: "寫禮物描述" };
  function showStageBlock(key, missing, names) {
    const s = stages.find((x) => x.key === key);
    document.getElementById("stage-block-msg").textContent =
      "要切到「" + (s ? s.name : key) + "」，還有 " + names.length + " 位沒有" + (BLOCK_WHAT[missing] || "完成") + "：";
    const list = document.getElementById("stage-block-names");
    list.textContent = "";
    names.forEach((n) => {
      const li = document.createElement("li");
      li.textContent = n;
      list.appendChild(li);
    });
    blockEl.hidden = false;
  }
  document.getElementById("stage-block-ok").addEventListener("click", () => (blockEl.hidden = true));

  document.getElementById("admin-btn").addEventListener("click", openAdmin);
  document.getElementById("admin-close").addEventListener("click", () => (adminEl.hidden = true));
  document.getElementById("stage-submit").addEventListener("click", async () => {
    const sel = stageOptsEl.querySelector("input:checked");
    if (!sel) return;
    const r = await api("/api/admin/stage", { stage: sel.value });
    if (r.status === 403) return adminNotice("只有管理者可以切換階段");
    if (r.data.result === "incomplete") return showStageBlock(sel.value, r.data.missing, r.data.names);
    if (!r.ok) return adminNotice("切換失敗");
    await refreshState();
    renderStageOptions();
    const s = stages.find((x) => x.key === stage);
    adminNotice("已切換到「" + (s ? s.name : stage) + "」", true);
  });
  userPwForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const pw = userPwInput.value.trim();
    const n = people.filter((p) => !p.admin).length;
    if (!pw || !confirm("確定把 " + n + " 位一般人的暗號都改成「" + pw + "」？管理者的暗號不會變。")) return;
    await peopleAction({ action: "user_password", password: pw }, "已把 " + n + " 位一般人的暗號改成「" + pw + "」");
  });
  addForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = addForm.elements;
    const ok = await peopleAction(
      { action: "add", en_name: f.en_name.value, animal: f.animal.value, admin: f.admin.checked },
      "已新增 " + f.en_name.value
    );
    if (ok) addForm.reset();
  });

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

  // ---------- 預告片（各集的 render(t) 逐格畫在 canvas 上；集數由 trailer.js 等檔登記到 window.EPISODES） ----------
  const trailerEl = document.getElementById("trailer");
  const playBtn = document.getElementById("trailer-play");
  const seekEl = document.getElementById("trailer-seek");
  const timeEl = document.getElementById("trailer-time");
  const episodeListEl = document.getElementById("episode-list");
  const episodes = (window.EPISODES || []).slice().sort((a, b) => a.no - b.no);
  let episode = episodes[0];
  let DUR = episode.duration;
  let trailerT = 0;
  let playing = false;
  let lastMs = null;

  function showTrailerFrame() {
    episode.render(trailerT);
    seekEl.value = trailerT;
    const s = Math.floor(trailerT);
    timeEl.textContent = Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
  }
  function setPlaying(v) {
    const was = playing;
    playing = v;
    playBtn.textContent = v ? "暫停" : trailerT >= DUR ? "重播" : "播放";
    lastMs = null;
    if (v && !was) requestAnimationFrame(trailerFrame); // 播放中換集不要多開一條迴圈
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
  // 切到某一集並從頭播放
  function playEpisode(ep) {
    episode = ep;
    DUR = ep.duration;
    seekEl.max = DUR;
    for (const btn of episodeListEl.children) btn.classList.toggle("current", btn.dataset.no === String(ep.no));
    trailerT = 0;
    showTrailerFrame();
    setPlaying(true);
  }
  for (const ep of episodes) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "pixel-btn small episode-btn";
    btn.dataset.no = ep.no;
    btn.textContent = ep.title;
    btn.addEventListener("click", () => playEpisode(ep));
    episodeListEl.appendChild(btn);
  }
  document.getElementById("trailer-btn").addEventListener("click", () => {
    trailerEl.hidden = false;
    playEpisode(episodes[0]);
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
  show("intro");
  requestAnimationFrame(sceneFrame);
  let wallHandoff = null;
  try {
    wallHandoff = sessionStorage.getItem("wall_handoff_token");
    sessionStorage.removeItem("wall_handoff_token");
  } catch (e) {
    /* 無法接手登入時，保留原本的進入流程 */
  }
  if (wallHandoff) {
    saveToken(wallHandoff);
    api("/api/state").then((r) => {
      if (r.ok && r.data.me) enterWall(r.data);
      else backToLogin();
    }).catch(backToLogin);
  }
})();
