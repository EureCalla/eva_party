(function () {
  "use strict";

  // 沙盒・交換禮物小遊戲（丟石頭搶禮物）
  // 參賽者：畫面一律在本機跑，不等伺服器——
  //   自己：本機移動、本機丟出石頭、走到東西上就先撿起來（數字先加），每 50ms 把位置回報伺服器
  //   別人：固定晚 0.12 秒播放，在前後兩份快照之間內插，網路抖動也不會停頓或跳格
  //   伺服器：只負責真正要算數的事（砸中扣血、撿到東西、勝負）；預測錯了才修正（東西放回、數字退回）
  //   被砸中：伺服器一確認就閃紅、震動、跳 -1
  // 觀眾：每 1 秒拉一次直播緩衝，延遲 1.5 秒播放並內插，畫面順又不吵伺服器。
  const INPUT_MS = 50;
  const INTERP_DELAY = 0.12; // 別人的位置晚多少秒播放（大於回報間隔＋抖動）
  const WATCH_MS = 1000;
  const WATCH_DELAY = 1.5; // 直播延遲（秒）
  const PICK_PREDICT = 0.5; // 本機先撿的距離（比伺服器 0.6 小一點，少預測錯）
  const PENDING_SEC = 0.8; // 先撿起來但伺服器沒確認，多久後放回
  const TILE = 38; // 一格 38 px，32×20 格 = 1216×760，左右各留 32 px
  const OX = 32;
  const KEYS = {
    KeyW: [0, -1], ArrowUp: [0, -1], KeyS: [0, 1], ArrowDown: [0, 1],
    KeyA: [-1, 0], ArrowLeft: [-1, 0], KeyD: [1, 0], ArrowRight: [1, 0],
  };

  const box = document.getElementById("mg");
  const cv = document.getElementById("mg-canvas");
  const ctx = cv.getContext("2d");
  const hudEl = document.getElementById("mg-hud");
  const timerEl = document.getElementById("mg-timer");
  const boardEl = document.getElementById("mg-board");
  const centerEl = document.getElementById("mg-center");
  const liveEl = document.getElementById("mg-live");

  let bridge = null; // exchange.js 給的 { api, serverNow, tagColor, font }
  let map = null; // /api/minigame/map
  let mapLayer = null; // 地圖只畫一次，之後每幀直接貼上
  let active = false;
  let mode = null; // "play" / "watch"
  let rnd = null; // exchange 回合（phase、參賽者、排名）
  let giftName = "";
  let meName = null;
  let meId = null;
  let roster = new Map(); // id → { name, label }
  let meta = null; // 伺服器最新的時間與排名
  let frames = []; // 伺服器畫面（依 t 排序）：參賽者來自操作回應、觀眾來自直播緩衝
  let liveFrame = null; // 觀眾還沒有緩衝時（準備中）用的目前畫面
  let watchSince = 0;
  let timers = [];
  let effects = []; // 跳字、火花
  // 參賽者
  let me = null; // 本機的自己 { x, y, fx, fy }
  let corr = { x: 0, y: 0 }; // 被伺服器拉回時的平滑位移（逐幀歸零）
  let server = null; // 伺服器上自己那一列 [id,x,y,fx,fy,hp,gifts,alive,inv,stones]
  let offset = null; // 伺服器時間 − 本機時間（秒）
  let lastSnapT = -Infinity; // 最新採用的快照時間：兩個請求同時在路上時，晚到的舊回應不採用
  const held = new Set();
  let pendingThrow = false;
  let pendingPower = 0.5;
  let chargeFrom = null; // 按下空白鍵開始蓄力的時間（秒，本機）
  let inFlight = 0;
  let seq = 0; // 回報編號：晚到的舊位置伺服器會忽略
  let unacked = 0; // 已送出但伺服器還沒回應的丟石頭次數
  const pending = new Map(); // 本機先撿起來、等伺服器確認的東西 itemId → { k, at }
  let myShots = []; // 自己丟出的石頭（本機模擬）
  let lastThrowAt = 0;
  let flashUntil = 0;
  let shakeUntil = 0;

  // ---------- 碰撞（與 minigame.py 相同） ----------
  function solid(tx, ty) {
    if (tx < 0 || ty < 0 || tx >= map.w || ty >= map.h) return true;
    return map.rows[ty][tx] !== ".";
  }
  function blocked(x, y) {
    const r = map.radius;
    return [x - r, x + r].some((cx) => [y - r, y + r].some((cy) => solid(Math.floor(cx), Math.floor(cy))));
  }

  // ---------- 時鐘 ----------
  const localSec = () => performance.now() / 1000;
  // 伺服器時間估計：取「最不延遲」的樣本，往上立刻跟、往下慢慢退
  function noteOffset(serverT) {
    const s = serverT - localSec();
    offset = offset === null || s > offset ? s : offset * 0.95 + s * 0.05;
  }
  const playClock = () => localSec() + (offset || 0);

  // ---------- 開關 ----------
  async function ensureMap() {
    if (map) return true;
    const r = await bridge.api("/api/minigame/map");
    if (!r.ok) return false;
    map = r.data;
    mapLayer = document.createElement("canvas");
    mapLayer.width = cv.width;
    mapLayer.height = cv.height;
    drawMap(mapLayer.getContext("2d"));
    return true;
  }

  function resetPlay() {
    me = null;
    corr = { x: 0, y: 0 };
    server = null;
    offset = null;
    lastSnapT = -Infinity;
    held.clear();
    pendingThrow = false;
    chargeFrom = null;
    unacked = 0;
    pending.clear();
    myShots = [];
  }

  function stop() {
    timers.forEach(clearInterval);
    timers = [];
    active = false;
    mode = null;
    meta = null;
    frames = [];
    liveFrame = null;
    watchSince = 0;
    effects = [];
    lastMs = null;
    resetPlay();
    box.hidden = true;
  }

  function startPlay() {
    mode = "play";
    timers.forEach(clearInterval);
    timers = [setInterval(sendInput, INPUT_MS)];
    frames = [];
    sendInput();
    liveEl.hidden = true;
  }

  function startWatch() {
    mode = "watch";
    timers.forEach(clearInterval);
    timers = [setInterval(pullWatch, WATCH_MS)];
    frames = []; // 直播的時間軸比較晚，重新收
    watchSince = 0;
    myShots = [];
    pullWatch();
    liveEl.hidden = false;
  }

  // exchange.js 每次輪詢後呼叫：依回合 phase 開關小遊戲
  async function sync(b, game, gift) {
    bridge = b;
    rnd = game && game.round;
    giftName = gift ? gift.animal + "的禮物" : "禮物";
    meName = game && game.me ? game.me.name : null;
    const phase = rnd && rnd.phase;
    if (!phase || phase === "contest") {
      if (active) stop();
      return false;
    }
    if (!(await ensureMap())) return false;
    if (!active) {
      active = true;
      box.hidden = false;
      requestAnimationFrame(frame);
      console.log("[minigame] on, in_game", !!(game.me && game.me.in_game));
    }
    const wantPlay = !!(game.me && game.me.in_game) && phase !== "reveal";
    if (wantPlay && mode === null) startPlay();
    else if (!wantPlay && mode !== "watch" && !(mode === "play" && phase === "reveal")) startWatch();
    return true;
  }

  // ---------- 伺服器畫面緩衝 ----------
  function pushFrame(f) {
    const last = frames[frames.length - 1];
    if (last && f.t <= last.t) return;
    if (last) noteHits(last, f);
    frames.push(f);
    while (frames.length > 2 && frames[1].t < f.t - 3) frames.shift();
  }

  // 找出時間 t 前後兩格：a ≤ t < b，k 為內插比例
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

  // 別人被砸中：在那一格的時間點跳 -1（跟著延遲播放的畫面一起出現）
  function noteHits(prev, f) {
    const before = new Map(prev.p.map((p) => [p[0], p]));
    f.p.forEach((p) => {
      const q = before.get(p[0]);
      if (!q || p[5] >= q[5]) return;
      if (mode === "play" && p[0] === meId) return; // 自己的在收到回應時就處理了
      effects.push({ clock: "frame", t: f.t, x: p[1], y: p[2] - 0.6, text: "-1", color: "#E5484D", spark: true });
    });
  }

  // ---------- 參賽者：送操作、收快照 ----------
  async function sendInput(urgent) {
    if (mode !== "play") return;
    if (inFlight >= (urgent ? 2 : 1)) return; // 丟石頭可以插隊，不等上一個回應
    inFlight++;
    const throwNow = pendingThrow;
    pendingThrow = false;
    if (throwNow) unacked++;
    seq++;
    const body = me
      ? { x: me.x, y: me.y, fx: me.fx, fy: me.fy, throw: throwNow, power: pendingPower, seq }
      : { x: 0, y: 0, fx: 0, fy: 0, throw: false, seq };
    try {
      const r = await bridge.api("/api/minigame/input", body);
      if (!r.ok) {
        if (r.status === 409 && mode === "play") startWatch(); // 遊戲結束或不是參賽者
        return;
      }
      if (mode === "play") takeSnap(r.data);
    } catch (e) {
      /* 網路抖一下，下一輪再送 */
    } finally {
      inFlight--;
      if (throwNow) unacked = Math.max(0, unacked - 1);
    }
  }

  function takeSnap(s) {
    if (s.frame.t < lastSnapT) return;
    lastSnapT = s.frame.t;
    meta = s;
    meId = s.me;
    roster = new Map(s.roster.map((p) => [p.id, p]));
    noteOffset(s.now); // 用伺服器回應當下的時間（準備中的畫面時間停在開打那一刻，不能拿來校時）
    pushFrame(s.frame);
    const mine = s.frame.p.find((p) => p[0] === meId);
    if (!mine) return;
    // 先撿起來的東西：伺服器畫面裡已經不見 → 有結果了（算到誰身上看伺服器的數字）
    const ids = new Set(s.frame.i.map((i) => i[0]));
    pending.forEach((v, id) => {
      if (!ids.has(id)) pending.delete(id);
    });
    // 被砸中：這是真正要即時的回饋
    if (server && mine[5] < server[5]) {
      const now = localSec();
      flashUntil = now + 0.35;
      shakeUntil = now + 0.25;
      effects.push({ clock: "local", t: now, x: me ? me.x : mine[1], y: (me ? me.y : mine[2]) - 0.6, text: "-1", color: "#E5484D", spark: true, follow: true });
    }
    server = mine;
    if (!me) {
      me = { x: mine[1], y: mine[2], fx: mine[3], fy: mine[4] };
    } else if (s.corrected) {
      const dx = mine[1] - me.x;
      const dy = mine[2] - me.y;
      me.x = mine[1];
      me.y = mine[2];
      // 小幅修正就滑過去，差太多（準備中、出生點）直接定位
      if (Math.hypot(dx, dy) < 2 && s.phase === "play") corr = { x: corr.x - dx, y: corr.y - dy };
      else corr = { x: 0, y: 0 };
    }
    if (!mine[7]) {
      console.log("[minigame] eliminated, watching");
      startWatch(); // 被淘汰：改看直播
    }
  }

  // 顯示用的數字＝伺服器的數字＋本機先撿起來還沒確認的
  function countPending(k) {
    let n = 0;
    pending.forEach((v) => {
      if (v.k === k) n++;
    });
    return n;
  }
  function shownStones() {
    if (!server) return 0;
    return Math.max(0, Math.min(map.max_stones, server[9] + countPending("stone") - unacked - (pendingThrow ? 1 : 0)));
  }
  const shownHp = () => (server ? Math.min(meta.max_hp, server[5] + countPending("heal")) : 0);
  const shownGifts = () => (server ? server[6] + countPending("gift") : 0);
  const canAct = () => mode === "play" && me && server && server[7] && meta && meta.phase === "play" && playClock() >= meta.play_start;

  function addText(x, y, text, color) {
    effects.push({ clock: "local", t: localSec(), x, y, text, color });
  }

  // 走到東西上就先撿起來（數字先加、東西先消失），伺服器沒確認再放回
  function predictPickups() {
    const now = localSec();
    pending.forEach((v, id) => {
      if (now - v.at > PENDING_SEC) pending.delete(id);
    });
    if (!canAct() || !frames.length) return;
    let stones = shownStones();
    let hp = shownHp();
    frames[frames.length - 1].i.forEach(([id, k, x, y]) => {
      if (pending.has(id) || Math.hypot(x - me.x, y - me.y) >= PICK_PREDICT) return;
      if (k === "stone" && stones >= map.max_stones) return;
      if (k === "heal" && hp >= meta.max_hp) return;
      pending.set(id, { k, at: now });
      if (k === "stone") stones++;
      if (k === "heal") hp++;
      addText(x, y - 0.4, k === "gift" ? "+1 禮物" : k === "heal" ? "+1 ♥" : "+1 石頭", k === "stone" ? "#6B5A55" : "#DE6A93");
    });
  }

  // 蓄力：按住空白鍵開始蓄，放開才丟；力道 0~1 決定射程與速度（與 minigame.py 相同）
  const canThrow = () => canAct() && shownStones() > 0 && performance.now() - lastThrowAt >= map.throw_cooldown * 1000;
  const chargePower = () => (chargeFrom === null ? 0 : Math.min(1, (localSec() - chargeFrom) / map.charge_sec));
  const rangeOf = (pw) => map.stone_range_min + (map.stone_range_max - map.stone_range_min) * pw;
  const speedOf = (pw) => map.stone_speed_min + (map.stone_speed_max - map.stone_speed_min) * pw;

  function startCharge() {
    if (chargeFrom === null && canThrow()) chargeFrom = localSec();
  }

  function releaseCharge() {
    if (chargeFrom === null) return;
    const power = chargePower();
    chargeFrom = null;
    if (!canThrow()) return;
    lastThrowAt = performance.now();
    const n = Math.hypot(me.fx, me.fy) || 1;
    const speed = speedOf(power);
    myShots.push({
      x: me.x + (me.fx / n) * 0.3, y: me.y + (me.fy / n) * 0.3,
      vx: (me.fx / n) * speed, vy: (me.fy / n) * speed, left: rangeOf(power),
    });
    pendingThrow = true;
    pendingPower = power;
    sendInput(true); // 不等下一輪
  }

  function typing(e) {
    const t = e.target;
    return t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT");
  }
  window.addEventListener("keydown", (e) => {
    if (mode !== "play" || typing(e)) return;
    if (KEYS[e.code]) {
      held.add(e.code);
      e.preventDefault();
    } else if (e.code === "Space") {
      if (!e.repeat) startCharge();
      e.preventDefault();
    }
  });
  window.addEventListener("keyup", (e) => {
    held.delete(e.code);
    if (e.code === "Space" && mode === "play") releaseCharge();
  });
  window.addEventListener("blur", () => {
    held.clear();
    chargeFrom = null; // 切走視窗就取消蓄力
  });

  // 本機移動：先 x 後 y，碰牆就沿牆滑
  function moveMe(dt) {
    if (!canAct()) return;
    let dx = 0;
    let dy = 0;
    held.forEach((k) => {
      dx += KEYS[k][0];
      dy += KEYS[k][1];
    });
    dx = Math.sign(dx);
    dy = Math.sign(dy);
    if (!dx && !dy) return;
    me.fx = dx;
    me.fy = dy;
    const step = (map.speed * dt) / Math.hypot(dx, dy);
    if (!blocked(me.x + dx * step, me.y)) me.x += dx * step;
    if (!blocked(me.x, me.y + dy * step)) me.y += dy * step;
  }

  // 自己丟出的石頭：本機飛，撞牆／出射程／碰到別人（畫面上的位置）就停；扣不扣血由伺服器決定
  function updateMyShots(dt, others) {
    myShots = myShots.filter((s) => {
      for (let i = 0; i < 2; i++) {
        s.x += (s.vx * dt) / 2;
        s.y += (s.vy * dt) / 2;
        s.left -= (Math.hypot(s.vx, s.vy) * dt) / 2;
        if (s.left <= 0 || solid(Math.floor(s.x), Math.floor(s.y))) return false;
        if (others.some((o) => o.alive && Math.hypot(o.x - s.x, o.y - s.y) < map.hit_radius)) {
          effects.push({ clock: "local", t: localSec(), x: s.x, y: s.y, spark: true });
          return false;
        }
      }
      return true;
    });
  }

  // ---------- 觀眾：拉直播緩衝 ----------
  async function pullWatch() {
    if (mode !== "watch") return;
    let r;
    try {
      r = await bridge.api("/api/minigame/watch?since=" + watchSince);
    } catch (e) {
      return;
    }
    if (!r.ok || mode !== "watch") return;
    const d = r.data;
    meta = d;
    roster = new Map(d.roster.map((p) => [p.id, p]));
    liveFrame = d.frame;
    d.frames.forEach(pushFrame);
    if (frames.length) watchSince = frames[frames.length - 1].t;
  }

  // ---------- 繪圖 ----------
  const px = (x) => OX + x * TILE;
  const py = (y) => y * TILE;
  function R(x, y, w, h, c, g) {
    (g || ctx).fillStyle = c;
    (g || ctx).fillRect(x, y, w, h);
  }

  function drawMap(g) {
    R(0, 0, cv.width, cv.height, "#3F271C", g);
    for (let ty = 0; ty < map.h; ty++) {
      for (let tx = 0; tx < map.w; tx++) {
        const ch = map.rows[ty][tx];
        const x = px(tx);
        const y = py(ty);
        if (ch === "#") {
          R(x, y, TILE, TILE, "#8E1820", g);
          R(x, y + TILE - 6, TILE, 6, "#5E1015", g);
          R(x + 2, y + 4, TILE / 2 - 4, 8, "#B33A3F", g);
          R(x + TILE / 2 + 2, y + 18, TILE / 2 - 4, 8, "#B33A3F", g);
          continue;
        }
        R(x, y, TILE, TILE, (tx + ty) % 2 ? "#F4F1EA" : "#ECE7DD", g); // 雪地
        if (ch === "T") drawTree(g, x, y);
        else if (ch === "S") drawSnowman(g, x, y);
        else if (ch === "G") drawPile(g, x, y);
      }
    }
  }
  function drawTree(g, x, y) {
    R(x + 16, y + 28, 6, 8, "#6E4730", g);
    R(x + 4, y + 20, 30, 9, "#3E7D4F", g);
    R(x + 8, y + 11, 22, 10, "#4F9A62", g);
    R(x + 13, y + 3, 12, 9, "#5FB173", g);
    R(x + 17, y, 4, 4, "#FFD86B", g);
    R(x + 9, y + 23, 3, 3, "#DE6A93", g);
    R(x + 25, y + 14, 3, 3, "#5B98D6", g);
  }
  function drawSnowman(g, x, y) {
    R(x + 8, y + 18, 22, 18, "#FFFFFF", g);
    R(x + 8, y + 34, 22, 2, "#C9C2B6", g);
    R(x + 12, y + 5, 14, 14, "#FFFFFF", g);
    R(x + 15, y + 9, 2, 2, "#2A1A10", g);
    R(x + 21, y + 9, 2, 2, "#2A1A10", g);
    R(x + 18, y + 12, 5, 2, "#F2994A", g);
    R(x + 11, y + 2, 16, 4, "#2A1A10", g);
  }
  function drawPile(g, x, y) {
    R(x + 3, y + 10, 32, 26, "#F6B7C8", g);
    R(x + 17, y + 10, 4, 26, "#5B98D6", g);
    R(x + 3, y + 20, 32, 4, "#5B98D6", g);
    R(x + 3, y + 34, 32, 2, "#E99AB0", g);
  }

  function drawItem(k, x, y, ms) {
    const cx = px(x);
    const cy = py(y) + Math.sin(ms / 300 + x) * 2;
    if (k === "stone") {
      R(cx - 8, cy - 4, 16, 10, "#8A8580");
      R(cx - 6, cy - 6, 10, 4, "#A8A39D");
      R(cx - 8, cy + 6, 16, 2, "#5E5A56");
    } else if (k === "gift") {
      R(cx - 10, cy - 8, 20, 18, "#F6B7C8");
      R(cx - 2, cy - 8, 4, 18, "#5B98D6");
      R(cx - 10, cy - 1, 20, 4, "#5B98D6");
      R(cx - 6, cy - 13, 5, 5, "#3F78B5");
      R(cx + 1, cy - 13, 5, 5, "#3F78B5");
    } else {
      // 愛心補血
      R(cx - 9, cy - 6, 8, 8, "#E5484D");
      R(cx + 1, cy - 6, 8, 8, "#E5484D");
      R(cx - 9, cy, 18, 5, "#E5484D");
      R(cx - 6, cy + 5, 12, 3, "#E5484D");
      R(cx - 3, cy + 8, 6, 3, "#E5484D");
      R(cx - 7, cy - 4, 3, 3, "#FFFFFF");
    }
  }

  function drawStone(x, y) {
    R(px(x) - 6, py(y) - 6, 12, 12, "#2A1A10");
    R(px(x) - 5, py(y) - 5, 10, 10, "#6E6964");
    R(px(x) - 3, py(y) - 3, 4, 4, "#B8B3AD");
  }

  // 角色：一個方塊＋兩顆眼睛（瞳孔看向面向），方塊用標籤色；頭上名牌與血條
  function drawPlayer(p, x, y, ms, isMe) {
    const [id, , , fx, fy, hp, gifts, alive, inv] = p;
    const info = roster.get(id) || { name: "?", label: null };
    const cx = Math.round(px(x));
    const cy = Math.round(py(y));
    ctx.globalAlpha = alive ? (inv && Math.floor(ms / 80) % 2 ? 0.35 : 1) : 0.35;
    const body = alive ? bridge.tagColor(info.label) : "#B9B4AC";
    R(cx - 14, cy + 15, 28, 5, "rgba(42,26,16,0.25)"); // 影子
    if (isMe) R(cx - 19, cy - 19, 38, 38, "#DE6A93"); // 自己：粉紅外框
    R(cx - 16, cy - 16, 32, 32, "#2A1A10");
    R(cx - 14, cy - 14, 28, 28, body);
    R(cx - 14, cy + 9, 28, 5, "rgba(42,26,16,0.15)"); // 底部陰影
    if (alive) {
      // 眼白＋瞳孔（往面向偏 2 px）
      R(cx - 10, cy - 8, 8, 9, "#FFFFFF");
      R(cx + 2, cy - 8, 8, 9, "#FFFFFF");
      R(cx - 8 + fx * 2, cy - 6 + fy * 2, 4, 5, "#2A1A10");
      R(cx + 4 + fx * 2, cy - 6 + fy * 2, 4, 5, "#2A1A10");
    } else {
      // 淘汰：眼睛閉成一條線
      R(cx - 10, cy - 4, 8, 2, "#2A1A10");
      R(cx + 2, cy - 4, 8, 2, "#2A1A10");
    }
    ctx.globalAlpha = 1;
    // 名牌（禮物數）＋血條
    ctx.font = "bold 18px " + bridge.font;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const label = info.name + (gifts ? " 🎁" + gifts : "");
    const w = ctx.measureText(label).width + 12;
    R(cx - w / 2 - 2, cy - 52, w + 4, 26, "#2A1A10");
    R(cx - w / 2, cy - 50, w, 22, isMe ? "#FFE1EA" : "#FFF6EA");
    ctx.fillStyle = "#2A1A10";
    ctx.fillText(label, cx, cy - 38);
    const maxHp = meta ? meta.max_hp : 5;
    for (let i = 0; i < maxHp; i++) R(cx - (maxHp * 7) / 2 + i * 7, cy - 25, 5, 4, i < hp ? "#E5484D" : "#6B5A55");
  }

  // 蓄力中：朝面向畫出會飛到哪裡的虛線（撞牆截斷）＋腳下的力量條
  function drawCharge() {
    if (chargeFrom === null || !me || !canAct()) return;
    const pw = chargePower();
    const n = Math.hypot(me.fx, me.fy) || 1;
    const ux = me.fx / n;
    const uy = me.fy / n;
    const x0 = me.x + corr.x;
    const y0 = me.y + corr.y;
    const reach = rangeOf(pw);
    for (let d = 0.6; d <= reach; d += 0.45) {
      const x = x0 + ux * d;
      const y = y0 + uy * d;
      if (solid(Math.floor(x), Math.floor(y))) break;
      R(px(x) - 3, py(y) - 3, 6, 6, pw >= 1 ? "#DE6A93" : "rgba(42,26,16,0.45)");
    }
    const cx = Math.round(px(x0));
    const cy = Math.round(py(y0));
    R(cx - 21, cy + 21, 42, 9, "#2A1A10");
    R(cx - 19, cy + 23, 38, 5, "#FFF6EA");
    R(cx - 19, cy + 23, Math.round(38 * pw), 5, pw >= 1 ? "#DE6A93" : "#F2994A");
  }

  const lerp = (a, b, k) => a + (b - a) * k;

  // 時間 t 的所有人位置：a→b 內插；自己（參賽中）用本機位置
  function peopleAt(v) {
    if (!v) return [];
    const next = v.b ? new Map(v.b.p.map((p) => [p[0], p])) : null;
    return v.a.p.map((p) => {
      const q = next && next.get(p[0]);
      let x = q ? lerp(p[1], q[1], v.k) : p[1];
      let y = q ? lerp(p[2], q[2], v.k) : p[2];
      let row = q && v.k > 0.5 ? q : p; // 血量、禮物等跳躍值取比較近的那格
      if (mode === "play" && p[0] === meId && me) {
        x = me.x + corr.x;
        y = me.y + corr.y;
        row = server ? server.slice() : row.slice();
        row[3] = me.fx;
        row[4] = me.fy;
        row[5] = shownHp();
        row[6] = shownGifts();
      }
      return { row, x, y, alive: !!row[7], id: p[0] };
    });
  }

  function drawEffects(frameT) {
    const now = localSec();
    effects = effects.filter((e) => {
      const age = e.clock === "local" ? now - e.t : frameT - e.t;
      if (age > 0.7) return false;
      if (age < 0) return true; // 延遲播放的畫面還沒播到
      let x = e.x;
      let y = e.y;
      if (e.follow && me) {
        x = me.x;
        y = me.y - 0.6;
      }
      const cx = px(x);
      const cy = py(y) - age * 40;
      if (e.spark) {
        const r = 6 + age * 30;
        ctx.globalAlpha = Math.max(0, 1 - age / 0.4);
        R(px(x) - r, py(y + 0.6) - 2, r * 2, 4, "#FFD86B");
        R(px(x) - 2, py(y + 0.6) - r, 4, r * 2, "#FFD86B");
        ctx.globalAlpha = 1;
      }
      if (e.text) {
        ctx.globalAlpha = Math.max(0, 1 - age / 0.7);
        ctx.font = "bold 22px " + bridge.font;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.lineWidth = 4;
        ctx.strokeStyle = "#FFF6EA";
        ctx.strokeText(e.text, cx, cy);
        ctx.fillStyle = e.color || "#2A1A10";
        ctx.fillText(e.text, cx, cy);
        ctx.globalAlpha = 1;
      }
      return true;
    });
  }

  let lastMs = null;
  let viewPeople = [];
  function frame(ms) {
    if (!active) return;
    const dt = lastMs === null ? 0 : Math.min(0.1, (ms - lastMs) / 1000);
    lastMs = ms;
    const decay = Math.exp(-dt * 12);
    corr = { x: corr.x * decay, y: corr.y * decay };
    moveMe(dt);
    predictPickups();

    const t = mode === "play" ? playClock() - INTERP_DELAY : bridge.serverNow() - WATCH_DELAY;
    let v = sample(t);
    if (!v && liveFrame) v = { a: liveFrame, b: null, k: 0 };
    viewPeople = peopleAt(v);
    updateMyShots(dt, viewPeople.filter((o) => o.id !== meId));

    const now = localSec();
    ctx.save();
    if (now < shakeUntil) ctx.translate((Math.random() - 0.5) * 10, (Math.random() - 0.5) * 10);
    ctx.drawImage(mapLayer, 0, 0);
    // 地上的東西：參賽者看最新的（不用延遲），先撿起來的不畫
    const itemsFrame = mode === "play" ? frames[frames.length - 1] : v && (v.b || v.a);
    if (itemsFrame) {
      itemsFrame.i.forEach(([id, k, x, y]) => {
        if (!pending.has(id)) drawItem(k, x, y, ms);
      });
    }
    // 別人的石頭：從延遲畫面那格依速度外插；自己的石頭本機畫
    if (v) {
      const st = t - v.a.t;
      v.a.s.forEach(([, x, y, vx, vy, owner]) => {
        if (mode === "play" && owner === meId) return;
        const nx = x + vx * st;
        const ny = y + vy * st;
        if (!solid(Math.floor(nx), Math.floor(ny))) drawStone(nx, ny);
      });
    }
    myShots.forEach((s) => drawStone(s.x, s.y));
    drawCharge();
    viewPeople
      .slice()
      .sort((a, b) => a.y - b.y) // 下面的人後畫
      .forEach((o) => {
        const isMe = o.id === meId || (meName && (roster.get(o.id) || {}).name === meName);
        drawPlayer(o.row, o.x, o.y, ms, isMe);
      });
    drawEffects(t);
    ctx.restore();
    if (now < flashUntil) {
      ctx.globalAlpha = 0.35 * ((flashUntil - now) / 0.35);
      R(0, 0, cv.width, cv.height, "#E5484D");
      ctx.globalAlpha = 1;
    }
    updateHud();
    requestAnimationFrame(frame);
  }

  // ---------- HUD 與中央訊息 ----------
  function mmss(sec) {
    const s = Math.max(0, Math.ceil(sec));
    return String(Math.floor(s / 60)).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0");
  }

  let hudKey = "";
  function updateHud() {
    if (!meta) return;
    const now = mode === "play" ? playClock() : bridge.serverNow();
    const phase = rnd ? rnd.phase : meta.phase;
    // 倒數
    if (now < meta.play_start) timerEl.textContent = "準備";
    else if (meta.finished_at) timerEl.textContent = "結束";
    else timerEl.textContent = mmss(meta.play_end - now);
    timerEl.classList.toggle("urgent", !meta.finished_at && now >= meta.play_start && meta.play_end - now <= 10);
    // 自己的狀態（參賽者，含先撿起來的）
    let hud = "";
    if (mode === "play" && server) {
      const hp = shownHp();
      hud = "血 " + "♥".repeat(hp) + "♡".repeat(Math.max(0, meta.max_hp - hp)) + "　禮物 " + shownGifts() + "　石頭 " + shownStones() + " / " + map.max_stones;
    }
    hudEl.textContent = hud;
    hudEl.hidden = !hud;
    // 記分板：存活優先、禮物、血量
    const rows = viewPeople
      .map((o) => ({ name: (roster.get(o.id) || {}).name || "?", hp: o.row[5], gifts: o.row[6], alive: o.row[7] }))
      .sort((a, b) => b.alive - a.alive || b.gifts - a.gifts || b.hp - a.hp);
    const key = JSON.stringify(rows) + meName;
    if (key !== hudKey) {
      hudKey = key;
      boardEl.textContent = "";
      rows.forEach((r) => {
        const li = document.createElement("li");
        if (!r.alive) li.classList.add("out");
        if (r.name === meName) li.classList.add("me");
        li.textContent = r.name + "　🎁" + r.gifts + "　" + (r.alive ? "♥" + r.hp : "淘汰");
        boardEl.appendChild(li);
      });
    }
    // 中央訊息
    let html = "";
    if (phase === "reveal" && rnd && rnd.ranking) {
      const win = rnd.ranking[0];
      html =
        '<p class="mg-big mg-win">' + esc(win.name) + " 拿到" + esc(giftName) + "！</p>" +
        '<ol class="mg-rank">' +
        rnd.ranking
          .map((r) => "<li>" + esc(r.name) + "　🎁" + r.gifts + "　" + (r.alive ? "♥" + r.hp : "淘汰") + "</li>")
          .join("") +
        "</ol>";
    } else if (now < meta.play_start) {
      // 準備時間：前面看玩法，最後 3 秒大字倒數
      const n = Math.ceil(meta.play_start - now);
      html =
        n <= 3
          ? '<p class="mg-big">' + n + "</p>"
          : '<p class="mg-title">' + esc(giftName) + " 爭奪戰" + (mode === "play" ? "" : "（直播）") + "</p>" +
            '<ul class="mg-rules">' +
            "<li>WASD／方向鍵移動</li>" +
            "<li>按住<b>空白鍵</b>蓄力、放開丟石頭：蓄越久丟越遠越快（最多 1 秒），可以邊走邊蓄</li>" +
            "<li>走過去就撿：石頭（最多 3 顆）、禮物、愛心補血</li>" +
            "<li>被砸中扣 1 滴血，5 滴血用完就淘汰</li>" +
            "<li>時間到<b>禮物最多</b>的人贏，同分比血量；只剩一人就直接贏</li>" +
            "</ul>" +
            '<p class="mg-tip">' + n + " 秒後開始</p>";
    } else if (mode === "watch" && meId !== null && viewPeople.some((o) => o.id === meId && !o.alive)) {
      html = '<p class="mg-tip">你被淘汰了，改看直播</p>';
    }
    if (centerEl.dataset.html !== html) {
      centerEl.dataset.html = html;
      centerEl.innerHTML = html;
      centerEl.hidden = !html;
    }
  }

  function esc(s) {
    return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  }

  window.ExMinigame = { sync, stop };
})();
