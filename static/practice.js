(function () {
  "use strict";

  // 試玩大廳：自己＋3 個電腦練習五款小遊戲。對戰畫面沿用 sandbox/*.js 的五個模組，
  // 這裡只負責大廳、規則、開局，並假裝成交換禮物頁餵給模組（bridge＋回合狀態）。
  const POLL_MS = 250;
  const HANDOFF_IN = "practice_handoff_token"; // 禮物牆交過來
  const HANDOFF_OUT = "home_handoff_token"; // 交回禮物牆
  const PRIZE = { title: "練習賽獎盃" }; // 模組公布時寫「{第一名} 拿到練習賽獎盃！」

  const GAMES = [
    {
      key: "stones", name: "雪地大亂鬥", input: "鍵盤", sec: "2 分鐘", module: "ExMinigame",
      rules: [
        "用 <b>WASD</b> 或<b>方向鍵</b>移動",
        "先<b>撿石頭</b>才能攻擊：按住<b>空白鍵</b>蓄力、放開丟，蓄越久丟越遠",
        "打<b>黑色怪物</b>會掉禮物，快去撿！",
        "閃開怪物噴的火和別人的石頭：被打中扣血，身上的禮物也會掉一個，10 秒內自己撿不回來",
        "時間到<b>禮物最多</b>的人贏；同樣多比血量",
      ],
    },
    {
      key: "count", name: "報數遊戲", input: "鍵盤", sec: "1 分鐘", module: "ExCountgame",
      rules: [
        "按鍵盤 <b>1～9</b> 喊數字，從 1 開始照順序喊，喊到 9 再回到 1",
        "兩個人同時喊同一個數字 → <b>兩個都淘汰</b>；喊錯數字也淘汰",
        "不能連續喊，要等別人喊過",
        "喊對一次得 1 分，時間到<b>分數最高</b>的人贏",
      ],
    },
    {
      key: "climb", name: "往上跳跳樂", input: "鍵盤", sec: "90 秒", module: "ExClimbgame",
      rules: [
        "<b>←→ 或 AD</b> 移動，<b>空白鍵、W 或 ↑</b> 跳，平台可以從下面穿上去",
        "最上面的人爬上新的一層，<b>畫面就往上挪</b>",
        "走去撞人可以<b>把人推開</b>，也能踩在別人頭上",
        "<b>掉出畫面就淘汰</b>，最後留在場上、<b>層數最高</b>的人贏",
        "8 樓起有<b>會左右移動</b>的地板，還有中間<b>閃紅就要開洞</b>的地板",
      ],
    },
    {
      key: "spell", name: "鍵盤詠唱師", input: "鍵盤", sec: "60 秒", module: "ExSpellgame",
      rules: [
        "照順序打出中間 <b>5 個字母</b>，就會對所有人發射魔法；<b>5 秒內打幾次就發射幾次</b>",
        "對方的魔法飛到之前你也打完，就能<b>互相抵銷</b>",
        "被打中扣 1 滴、<b>打錯也扣 1 滴</b>（反噬）；10 滴，歸零淘汰",
        "時間到<b>血最多</b>的人贏，同血量比最後一次詠唱速度",
        "用中文輸入法也可以，按的是鍵盤上的實體字母鍵",
      ],
    },
    {
      key: "mom", name: "誰是乖孩子", input: "滑鼠", sec: "2 分鐘", module: "ExMomgame",
      rules: [
        "<b>長按右鍵</b>吃西瓜，吃滿 5 口才能吐籽；吐完 5 顆再吃",
        "<b>左鍵點對手</b>吐籽，吐中扣 1 滴（每人 10 滴）",
        "媽媽閉眼禱告時才能動；她<b>突然張開眼睛</b>時，正在吃或吐的人<b>直接淘汰</b>",
        "時間到<b>血最多</b>的人贏，同血量比嘴裡的籽",
      ],
    },
  ];
  const START_ERRORS = {
    not_open: "現在不是試玩時間（只在公布標籤階段開放）",
    no_description: "先回禮物牆寫好禮物描述，才能試玩",
    invalid: "不認得這個遊戲",
  };

  // 標籤配色（同 game.js，只要底色）
  const LABEL_COLORS = {
    "寶": "#F6B7C8", "貝": "#BFDDF5", "珍珠": "#FBF7F0", "欣": "#FFE7A3", "Eva": "#F8F4ED", "Baby": "#CDEBD8",
    "欣加Pearl": "#E3D5F5", "媽媽": "#F4A6A0", "男": "#8FB8E8", "孩": "#FFD1B0", "威": "#9BD3D0",
  };
  const tagColor = (label) => LABEL_COLORS[label] || "#F4ECDD";

  const $ = (id) => document.getElementById(id);
  let sessionToken = null;
  let clockOffset = 0; // 伺服器時間 − 本機時間（秒）
  let current = null; // 選中的遊戲
  let pollTimer = null;

  async function api(path, body) {
    // 小遊戲模組打的是正式路徑，試玩改打自己的那一局
    const m = /^\/api\/minigame\/(input|count|climb|spell|mom)$/.exec(path);
    if (m) path = "/api/practice/minigame/" + m[1];
    const headers = { "Content-Type": "application/json" };
    if (sessionToken) headers["X-Token"] = sessionToken;
    const res = await fetch(path, body ? { method: "POST", headers, body: JSON.stringify(body) } : { headers });
    const data = await res.json();
    if (res.status === 401) goHome(false); // 階段切換時大家都被登出
    return { ok: res.ok, status: res.status, data };
  }
  const BRIDGE = {
    api,
    serverNow: () => Date.now() / 1000 + clockOffset,
    tagColor,
    font: getComputedStyle(document.body).fontFamily,
  };

  // ---------- 畫面切換 ----------
  const views = ["pr-lobby", "pr-intro", "pr-xr", "pr-play", "pr-nologin"];
  function view(name) {
    views.forEach((v) => ($(v).hidden = v !== name));
    $("tab-games").classList.toggle("current", name !== "pr-xr");
    $("tab-rules").classList.toggle("current", name === "pr-xr");
    document.querySelector(".pr-tabs").hidden = name === "pr-play" || name === "pr-nologin";
    $("pr-note").hidden = name === "pr-play" || name === "pr-nologin";
  }

  function goHome(keepLogin) {
    stopPlay();
    if (keepLogin && sessionToken) {
      try {
        sessionStorage.setItem(HANDOFF_OUT, sessionToken);
      } catch (e) {
        /* 拿不到 storage：回首頁重新登入 */
      }
    }
    sessionToken = null;
    location.href = "/";
  }

  // ---------- 大廳 ----------
  function buildLobby() {
    const box = $("pr-lobby");
    GAMES.forEach((g) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "pr-card";
      b.innerHTML =
        '<span class="pr-card-name">' + g.name + "</span>" +
        '<span class="pr-card-meta"><span class="pr-badge' + (g.input === "滑鼠" ? " mouse" : "") + '">' +
        g.input + "</span>" + g.sec + "</span>" +
        '<span class="pr-card-go">進入大廳 ▶</span>';
      b.addEventListener("click", () => openIntro(g));
      box.appendChild(b);
    });
  }

  function openIntro(g) {
    current = g;
    $("pr-intro-name").textContent = g.name;
    $("pr-intro-meta").textContent = g.input + "操作・" + g.sec + "・你＋3 個電腦";
    $("pr-intro-rules").innerHTML = g.rules.map((r) => "<li>" + r + "</li>").join("");
    $("pr-error").hidden = true;
    view("pr-intro");
  }

  // ---------- 對戰 ----------
  async function startGame() {
    $("pr-error").hidden = true;
    const r = await api("/api/practice/start", { kind: current.key });
    if (!r.ok) {
      $("pr-error").textContent = START_ERRORS[r.data.result] || "開始失敗";
      $("pr-error").hidden = false;
      return;
    }
    stopPlay();
    view("pr-play");
    $("pr-again").hidden = true;
    if (document.activeElement) document.activeElement.blur(); // 空白鍵不要再按到按鈕
    await poll();
    pollTimer = setInterval(poll, POLL_MS);
  }

  async function poll() {
    const r = await api("/api/practice/state");
    if (!r.ok) {
      if (r.status === 409) {
        stopPlay();
        openIntro(current);
        $("pr-error").textContent = START_ERRORS[r.data.result] || "現在不能試玩";
        $("pr-error").hidden = false;
      }
      return;
    }
    const data = r.data;
    clockOffset = data.now - Date.now() / 1000;
    syncModules(data);
    $("pr-again").hidden = !(data.round && data.round.phase === "reveal");
  }

  function syncModules(data) {
    const kind = data && data.round ? data.round.game : null;
    GAMES.forEach((g) => window[g.module].sync(BRIDGE, kind === g.key ? data : null, PRIZE));
  }

  function stopPlay() {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = null;
    syncModules(null); // 每個模組收到 null 會自己關掉
  }

  // ---------- 事件 ----------
  $("tab-games").addEventListener("click", () => view("pr-lobby"));
  $("tab-rules").addEventListener("click", () => view("pr-xr"));
  $("pr-home").addEventListener("click", () => goHome(true));
  $("pr-intro-back").addEventListener("click", () => view("pr-lobby"));
  $("pr-start").addEventListener("click", startGame);
  $("pr-again").addEventListener("click", startGame);
  $("pr-leave").addEventListener("click", () => {
    stopPlay();
    view("pr-lobby");
  });

  // ---------- 開場：接手禮物牆的登入 token（讀完即刪，重新整理就要從禮物牆再進來） ----------
  $("pr-xr").innerHTML = window.ExchangeRules.html;
  buildLobby();
  async function boot() {
    let tk = null;
    try {
      tk = sessionStorage.getItem(HANDOFF_IN);
      sessionStorage.removeItem(HANDOFF_IN);
    } catch (e) {
      /* 沒有 storage 就請他登入 */
    }
    if (!tk) return view("pr-nologin");
    sessionToken = tk;
    const r = await api("/api/practice/state");
    if (r.ok && r.data.admins && r.data.admins.length) $("pr-admins").textContent = "管理者（" + r.data.admins.join("、") + "）";
    if (!r.ok) {
      if (r.status === 409) {
        view("pr-lobby");
        $("pr-lobby").insertAdjacentHTML(
          "afterbegin",
          '<p class="pr-closed">' + (START_ERRORS[r.data.result] || "現在不能試玩") + "</p>"
        );
      }
      return;
    }
    view("pr-lobby");
  }
  boot();
})();
