// 預告片第四集：由 tools/build_trailer.py 從 video/compositions/ep4.html 產生，請勿手改
// 角色零件沿用 sprites.js 的 SPRITES / PAL；登記到 window.EPISODES = [{ no, title, render(t), duration }]
(function () {
      // 下方 SPRITES 區塊由 video/design/export_pieces.py 自動產生
      

      // 第四集：小白兔當裁判（面向鏡頭）嚇得發抖、眼珠亂轉，鏡頭跟著眼珠看左邊互撞的綿羊和山羊、
      // 右邊打成一團煙霧的獅子和棕熊（都放大兩倍）→ 拉遠，小白兔夾在中間又小又怕
      // → 小貓帶著前兩集的朋友走進來，揮手叫停 → 打架的後果（蓬成毛球、山羊頭卡在羊毛裡、爆炸頭、腫包）
      // → 發名牌公布名字，拿到名牌的就不吵了 → 世界和平（一起跳、冒愛心）→ 大家排成兩列跟著小貓走出畫面
      const DUR = 39;
      const P = 15; // 一格 = 15 px
      const GW = 352; // 世界比畫面寬快兩倍，鏡頭橫移（角色多、又有放大兩倍的動物）
      const GH = 72;
      const GROUND = 63; // 腳底所在的列（後排）
      const FRONT = GROUND + 5; // 前排的腳底
      const out = document.getElementById("trailer-canvas");
      const ctx = out.getContext("2d");
      const world = document.createElement("canvas");
      world.width = GW;
      world.height = GH;
      const g = world.getContext("2d");

      // ---------- 零件轉成小畫布（1 格 = 1 px），另做一份投影 ----------
      const SPR = {};
      Object.keys(SPRITES).forEach((name) => {
        const p = SPRITES[name];
        const h = p.rows.length;
        const w = p.rows[0].length;
        const c = document.createElement("canvas");
        const sh = document.createElement("canvas");
        c.width = sh.width = w;
        c.height = sh.height = h;
        const x = c.getContext("2d");
        const xs = sh.getContext("2d");
        xs.fillStyle = "#000";
        p.rows.forEach((row, j) => {
          for (let i = 0; i < w; i++) {
            const ch = row[i];
            if (ch === ".") continue;
            x.fillStyle = PAL[ch];
            x.fillRect(i, j, 1, 1);
            xs.fillRect(i, j, 1, 1);
          }
        });
        const unit = p.unit || 1;
        SPR[name] = { c, sh, w: w * unit, h: h * unit, x0: p.x0, y0: p.y0, px: p.pivot[0], py: p.pivot[1], unit };
      });

      // ---------- 數學工具 ----------
      const E = {
        lin: (p) => p,
        io: (p) => (p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2),
        out: (p) => 1 - Math.pow(1 - p, 3),
        in: (p) => p * p * p,
        back: (p) => {
          const c1 = 2.4;
          return 1 + (c1 + 1) * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2);
        },
      };
      function tw(t, t0, t1, a, b, e) {
        if (t <= t0) return a;
        if (t >= t1) return b;
        return a + (b - a) * E[e || "io"]((t - t0) / (t1 - t0));
      }
      function path(t, keys) {
        if (t <= keys[0][0]) return keys[0][1];
        for (let i = 1; i < keys.length; i++) {
          if (t <= keys[i][0]) return tw(t, keys[i - 1][0], keys[i][0], keys[i - 1][1], keys[i][1], keys[i][2]);
        }
        return keys[keys.length - 1][1];
      }
      function hash(a, b, c) {
        let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263) + Math.imul(c | 0, 1274126177)) | 0;
        h = Math.imul(h ^ (h >>> 13), 1274126177);
        return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
      }
      // 彈一下後停住（紙片被彈起的感覺）
      function pop(t, t0, amp, dur) {
        if (t < t0 || t > t0 + dur) return 0;
        const u = (t - t0) / dur;
        return amp * Math.sin(u * Math.PI * 2.5) * (1 - u);
      }
      // 一次性的跳躍：t0 起跳，dur 秒落地
      function jump(t, t0, dur, h) {
        if (t < t0 || t > t0 + dur) return 0;
        return Math.sin(((t - t0) / dur) * Math.PI) * h;
      }

      // ---------- 紙片零件繪製（座標單位：格） ----------
      // 以零件自己的關節對齊 (ax, ay)；預設對齊它在角色框中的關節位置
      function piece(name, rot, opt) {
        const s = SPR[name];
        opt = opt || {};
        const ax = opt.ax !== undefined ? opt.ax : s.px;
        const ay = opt.ay !== undefined ? opt.ay : s.py;
        ctx.save();
        ctx.translate(ax + (opt.dx || 0), ay + (opt.dy || 0));
        if (rot) ctx.rotate(rot);
        const sc = opt.scale !== undefined ? opt.scale : 1;
        ctx.scale(sc * (opt.sx !== undefined ? opt.sx : 1), sc);
        const lx = s.unit === 1 ? s.x0 - s.px : -s.w / 2;
        const ly = s.unit === 1 ? s.y0 - s.py : -s.h / 2;
        ctx.globalAlpha = 0.28;
        ctx.drawImage(s.sh, lx + 0.35, ly + 0.35, s.w, s.h);
        ctx.globalAlpha = 1;
        ctx.drawImage(s.c, lx, ly, s.w, s.h);
        if (opt.after) opt.after();
        ctx.restore();
      }

      // ---------- 小貓（紙娃娃，同第一集） ----------
      function drawCat(st) {
        ctx.save();
        ctx.translate(st.x, st.y - (st.hop || 0));
        piece("s_leg_back", st.legB || 0);
        piece("s_leg_front", st.legF || 0);
        ctx.save();
        ctx.translate(19, 28);
        ctx.rotate(st.rock || 0);
        ctx.translate(-19, -28);
        piece("s_tail", st.tail || 0);
        piece(st.torso, 0);
        piece(st.head, st.headRot || 0, { ax: 20, ay: 16 });
        piece(st.arm, st.armRot || 0, { after: st.hold });
        ctx.restore();
        ctx.restore();
      }
      function walkPose(st, ph, amp) {
        st.legB = Math.sin(ph) * 0.45 * amp;
        st.legF = -Math.sin(ph) * 0.45 * amp;
        st.rock = Math.sin(ph * 2) * 0.04 * amp;
        st.hop = Math.abs(Math.sin(ph)) * 1.2 * amp;
        st.tail = Math.sin(ph) * 0.15;
      }

      // ---------- 動物（紙娃娃） ----------
      // 角色框：w x h，腳底踩在框的最下面。fx/fy 是腳底的世界座標（fy 預設 GROUND），
      // rot 繞腳底轉；sx = -1 是面向左（山羊、棕熊）；k 是整隻放大的倍數
      const RIG = {
        mk: { w: 16, h: 28, foot: 7, neck: [8, 10] },
        ot: { w: 18, h: 22, foot: 8, neck: [10, 9] },
        gf: { w: 30, h: 56, foot: 13, neck: [21, 23] },
        el: { w: 56, h: 44, foot: 22, neck: [39, 27] },
        sq: { w: 18, h: 16, foot: 10, neck: [12, 9] },
        gp: { w: 16, h: 10, foot: 8, neck: [11, 6] },
        hm: { w: 12, h: 10, foot: 6, neck: [8, 6] },
        qk: { w: 14, h: 17, foot: 7, neck: [8, 8] },
        sh: { w: 24, h: 18, foot: 11, neck: [17, 12] },
        gt: { w: 22, h: 22, foot: 10, neck: [15, 13] },
        ln: { w: 30, h: 24, foot: 14, neck: [21, 16] },
        br: { w: 28, h: 22, foot: 12, neck: [19, 14] },
        rb: { w: 14, h: 26, foot: 7, neck: [8, 16] },
      };
      // 冒暈眩星星的位置（角色框座標）
      const HEAD_TOP = { sh: [20, 3], gt: [8, 8], ln: [24, 2], br: [22, 2], rb: [7, 6] };
      const EL_HEAD = [36, 22];

      function footOf(st) {
        const r = RIG[st.kind];
        return [st.fx !== undefined ? st.fx : st.x + r.foot, (st.fy !== undefined ? st.fy : GROUND) - (st.hop || 0)];
      }
      // 角色框內的點 → 世界座標（依序套用：擠壓／翻面、繞腳底旋轉、平移）
      function rigToWorld(st, p) {
        const r = RIG[st.kind];
        const f = footOf(st);
        const dx = (p[0] - r.foot) * (st.sx || 1) * (st.k || 1);
        const dy = (p[1] - r.h) * (st.sy || 1) * (st.k || 1);
        const a = st.rot || 0;
        return [f[0] + dx * Math.cos(a) - dy * Math.sin(a), f[1] + dx * Math.sin(a) + dy * Math.cos(a)];
      }
      function drawRig(st, parts) {
        const r = RIG[st.kind];
        const f = footOf(st);
        ctx.save();
        ctx.translate(f[0], f[1]);
        if (st.rot) ctx.rotate(st.rot);
        ctx.scale((st.sx || 1) * (st.k || 1), (st.sy || 1) * (st.k || 1));
        ctx.translate(-r.foot, -r.h);
        parts();
        ctx.restore();
      }
      const DRAW = {
        mk: (st) => {
          piece("mk_body", 0);
          piece("mk_head_" + (st.face || "open"), st.headRot || 0);
        },
        ot: (st) => {
          piece("ot_body", 0);
          piece("ot_head_" + (st.face || "open"), st.headRot || 0);
          piece("ot_arm", st.armRot || 0);
        },
        gf: (st) => {
          piece("gf_leg_back_far", -(st.leg || 0));
          piece("gf_leg_front_far", st.leg || 0);
          piece("gf_body", 0);
          piece("gf_leg_back", st.leg || 0);
          piece("gf_leg_front", -(st.leg || 0));
          piece("gf_neck_" + (st.face || "open"), st.headRot || 0);
        },
        el: (st) => {
          piece("el_leg_back_far", -(st.leg || 0));
          piece("el_leg_front_far", st.leg || 0);
          piece("el_body", 0);
          piece("el_leg_back", st.leg || 0);
          piece("el_leg_front", -(st.leg || 0));
          ctx.save();
          ctx.translate(EL_HEAD[0], EL_HEAD[1]);
          ctx.rotate(st.headRot || 0);
          ctx.translate(-EL_HEAD[0], -EL_HEAD[1]);
          piece("el_head_" + (st.face || "open"), 0);
          piece("el_ear", st.ear || 0);
          piece("el_trunk", -2.5);
          ctx.restore();
        },
        sq: (st) => {
          piece("sq_tail", st.tail || 0);
          piece("sq_body", 0);
          piece("sq_head_" + (st.face || "open"), st.headRot || 0);
        },
        gp: (st) => {
          piece("gp_body", 0);
          piece("gp_head_" + (st.face || "open"), st.headRot || 0);
        },
        hm: (st) => {
          piece("hm_body", 0);
          piece("hm_head_" + (st.face || "open"), st.headRot || 0);
        },
        qk: (st) => {
          piece("qk_body", 0);
          piece("qk_head_" + (st.face || "open"), st.headRot || 0);
        },
        sh: (st) => {
          piece("sh_legs", 0);
          piece("sh_wool", 0, { scale: st.wool || 1 });
          piece("sh_head_" + (st.face || "open"), st.headRot || 0);
        },
        gt: (st) => {
          piece("gt_body", 0);
          piece("gt_head_" + (st.face || "open"), st.headRot || 0);
        },
        ln: (st) => {
          piece("ln_body", 0);
          piece("ln_head_" + (st.face || "open") + (st.messy ? "_messy" : ""), st.headRot || 0);
        },
        br: (st) => {
          piece("br_body", 0);
          // 腫包黏在頭頂，跟著頭轉（座標相對於頭的關節 19,14）
          const after = st.bump ? () => piece("bump", 0, { ax: 3, ay: -10.6, scale: st.bump }) : null;
          piece("br_head_" + (st.face || "open"), st.headRot || 0, { after });
        },
        rb: (st) => {
          if (st.ball) return piece("rb_ball", 0);
          if (!st.front) {
            piece("rb_body", 0);
            return piece("rb_head_" + (st.face || "open") + "_" + (st.ears || "up"), st.headRot || 0);
          }
          // 正面：眼珠在大眼白裡亂轉（眼白左上格在 4,10 與 10,10；座標相對於頭的關節 7.5,16）
          const eyes = st.eyes || "scared";
          const look = st.look || [0, 0];
          const after = eyes === "scared" ? () => [4, 10].forEach((x) => piece("pupil", 0, { ax: x + look[0] - 7.5, ay: 10 + look[1] - 16 })) : null;
          piece("rb_front_body", 0);
          piece("rb_front_" + eyes + "_" + (st.ears || "up"), st.headRot || 0, { after });
        },
      };
      function drawAnimal(st) {
        drawRig(st, () => DRAW[st.kind](st));
      }

      // ---------- 蛇：捲成一圈滾著走（同第三集） ----------
      const RING_R = 23.5; // 圓心離地高度
      function drawSnake(sn) {
        ctx.save();
        ctx.translate(sn.x, GROUND - (sn.hop || 0));
        piece("sn_ring", sn.spin, { ax: 0, ay: -RING_R });
        piece("sn_tail", 0.35, { ax: -3, ay: -RING_R * 2 + 1 });
        piece("sn_head_" + (sn.face || "open"), sn.headRot || 0, { ax: 1, ay: -RING_R * 2 + 1.5 });
        ctx.restore();
      }
      function snakeNeck(sn) {
        return [sn.x + 3, GROUND - (sn.hop || 0) - RING_R * 2 + 2];
      }

      // ---------- 場景：草地（畫在 256x72 的世界畫布上，1 格 = 1 px，同第三集） ----------
      function R(x, y, w, h, c) {
        g.fillStyle = c;
        g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
      }
      function triW(cx, top, hw, bot, c) {
        for (let y = top; y <= bot; y++) {
          const w = Math.round(((y - top) / (bot - top)) * hw);
          R(cx - w, y, w * 2 + 1, 1, c);
        }
      }
      function cloud(x, y, w) {
        R(x + 2, y, w - 4, 1, "#FFFFFF");
        R(x, y + 1, w, 2, "#FFFFFF");
        R(x + 1, y + 3, w - 2, 1, "#EAF4FC");
      }
      function bush(x, y) {
        R(x + 2, y, 8, 2, "#7DBB76");
        R(x, y + 2, 12, 5, "#6FAF68");
        R(x + 1, y + 7, 10, 1, "#5E9E5A");
        R(x + 3, y + 1, 1, 1, "#F6B7C8");
        R(x + 8, y + 3, 1, 1, "#F6B7C8");
        R(x + 5, y + 4, 1, 1, "#FFFFFF");
        R(x + 2, y + 5, 1, 1, "#BFDDF5");
      }
      function meadow(t) {
        R(0, 0, GW, 34, "#BFDDF5");
        R(0, 34, GW, 12, "#D7EBF8");
        [[0, 4, 12, 1.6], [60, 10, 9, 1.1], [110, 6, 10, 1.3], [170, 3, 11, 1.4], [220, 9, 9, 1.2]].forEach(([x0, y, w, v]) => {
          cloud(((x0 + t * v) % (GW + 40)) - 20, y, w);
        });
        triW(22, 30, 26, 47, "#A8D5A2");
        triW(70, 34, 22, 47, "#93C98E");
        triW(108, 28, 28, 47, "#A8D5A2");
        triW(158, 33, 24, 47, "#93C98E");
        triW(204, 29, 30, 47, "#A8D5A2");
        triW(250, 35, 20, 47, "#93C98E");
        triW(284, 30, 26, 47, "#A8D5A2");
        triW(318, 34, 22, 47, "#93C98E");
        triW(350, 29, 28, 47, "#A8D5A2");
        R(0, 46, GW, 26, "#B7DFA8");
        for (let y = 49; y < GH; y += 4) R(0, y, GW, 1, "#A6D497");
        for (let i = 0; i < 92; i++) {
          const x = Math.floor(hash(i, 7, 1) * GW);
          const y = 48 + Math.floor(hash(i, 7, 2) * 23);
          const c = ["#F6B7C8", "#FFFFFF", "#BFDDF5", "#FFD36B"][i % 4];
          R(x, y, 1, 1, c);
          if (i % 3 === 0) R(x, y + 1, 1, 1, "#7DBB76");
        }
        bush(-3, 44);
        bush(117, 45);
        bush(247, 44);
        bush(279, 45);
        bush(343, 44);
      }

      // ---------- 時間軸 ----------
      // 綿羊、山羊、獅子、棕熊放大兩倍（BIG），小白兔夾在中間顯得又小又怕
      const BIG = 2;
      // 隊伍：小貓帶頭，前兩集的朋友跟在後面走進來。大隻的（蛇、大象、長頸鹿）走後排，
      // 小隻的走前排（腳底低 5 格、畫在前面），停下來時的腳底 x 如下（左邊幾隻停在畫面外）
      const CAT_X = 70;
      const CAT_FOOT = CAT_X + 20;
      const WALK0 = 9.0; // 隊伍從畫面外起步
      const WALK_IN = 15.4; // 小貓走到定位
      const HOME = { sn: 60, el: -4, gf: -49, sq: 70, gp: 56, hm: 38, qk: 22, ot: 2, mk: -20 };
      const BACK_ROW = ["gf", "el"];
      const FRONT_ROW = ["mk", "ot", "qk", "hm", "gp", "sq"];
      const OLD_TAG = { el: 1, gf: 1, ot: 1, mk: 1, sn: 1, sq: 0.85, gp: 0.8, hm: 0.75, qk: 0.85 };

      // 打架：綿羊（面向右）和山羊（面向左）互撞，每 1.5 秒撞一次；獅子和棕熊在右邊打成一團煙霧
      const SH_X = 145;
      const GT_X = 201;
      const CLASH_X = 174;
      const RB_X = 232; // 小白兔裁判
      const BX = 285; // 打架煙霧的中心
      const BY = GROUND - 18;
      const CYCLE = 1.5;
      const BUTT0 = 0.3;
      // 8.7 秒那次山羊被彈飛，撞到小白兔；10.2 秒那次山羊還沒回來，綿羊撞空
      const GOAT_FLY = 8.7;
      const GOAT_BACK = 10.5;
      const CLASHES = [];
      for (let c = BUTT0 + 0.9; c < 15.8; c += CYCLE) if (c < GOAT_FLY + 0.1 || c > GOAT_BACK) CLASHES.push(c);
      // 小白兔被山羊撞到：跳起來 → 縮成毛球發抖 → 回來繼續當裁判
      const RB_JUMP = 8.95;
      const RB_BALL = [9.45, 11.1];
      // 開場：小白兔眼珠先往左看（鏡頭跟過去看羊打架），再往右看（看獅熊打架）
      const LOOK_L = [2.0, 4.5];
      const LOOK_R = [4.5, 7.4];

      const STOP = 15.8; // 小貓揮手，大家停手
      const DIZZY_END = 17.0;
      const LN_X = 268; // 停手後獅子、棕熊鼻子對鼻子瞪著
      const BR_X = 328;
      const STUCK = 17 * BIG; // 山羊頭卡在羊毛裡：山羊腳底在綿羊右邊幾格
      const WOOL_MAX = 1.55;

      // 公布名字：每隻 1.8 秒，從 TAG_AT 起依序是綿羊、山羊、獅子、棕熊、小白兔；發完才世界和平
      const TAG_AT = 17.4;
      const STEP = 1.8;
      const TAGS = [
        { kind: "sh", cap: "cap_yvette", focus: [150, 44], scale: 1.4 },
        { kind: "gt", cap: "cap_zeyi", focus: [192, 44], scale: 1.4 },
        { kind: "ln", cap: "cap_david", focus: [262, 40], scale: 1.4 },
        { kind: "br", cap: "cap_steve", focus: [316, 40], scale: 1.4 },
        { kind: "rb", cap: "cap_maisie", focus: [232, 48], scale: 0.75 },
      ];
      const THROW = 0.55; // 每段開始後幾秒拋出名牌
      const FLY = 0.45; // 名牌飛行秒數
      const tagHit = (i) => TAG_AT + STEP * i + THROW + FLY;
      const PEACE = TAG_AT + STEP * TAGS.length; // 世界和平：大家一起跳、冒愛心

      // 遊行：小貓帶頭，大家用同樣的速度排成兩列跟上。GAP 是腳底落後小貓腳底多少格，
      // 小貓走到「自己的位置 + GAP」時才起步。山羊和綿羊卡在一起，算同一組（pair，以山羊的腳底為準）
      const GO = PEACE + 1.6;
      const V = 60; // 格/秒
      const FOOT0 = Object.assign({ pair: SH_X + STUCK, ln: LN_X, br: BR_X, rb: RB_X }, HOME);
      const GAP = {
        pair: 36, ln: 130, br: 186, sn: 230, el: 290, gf: 330, // 後排
        rb: 24, sq: 44, gp: 62, hm: 78, qk: 94, ot: 114, mk: 136, // 前排
      };
      const START = {};
      Object.keys(GAP).forEach((kd) => (START[kd] = GO + (FOOT0[kd] + GAP[kd] - CAT_FOOT) / V));
      const EXIT_X = GW + 44;

      // 遊行中的腳底 x；還沒起步回 null
      function paradeFoot(kind, t) {
        return t < START[kind] ? null : FOOT0[kind] + V * (t - START[kind]);
      }
      function walking(kind, t) {
        const f = paradeFoot(kind, t);
        return f !== null && f < EXIT_X + 30 ? t - START[kind] : -1;
      }
      function tagState(i, t) {
        // 0：還沒掛；0~1：從貓手上飛過去；1：掛好
        const t0 = TAG_AT + STEP * i + THROW;
        return t < t0 ? 0 : tw(t, t0, t0 + FLY, 0, 1, "lin");
      }
      // 走路時一跳一跳（大象、長頸鹿另外擺腳）
      function stride(st, w, n) {
        const kd = st.kind;
        const ph = w * Math.PI * (kd === "el" ? 3 : 3.4) + (n || 0);
        st.hop = Math.abs(Math.sin(ph)) * (kd === "el" ? 0.8 : kd === "gf" ? 1.2 : st.k ? 2.4 : 2);
        if (kd === "el" || kd === "gf") st.leg = Math.sin(ph) * (kd === "el" ? 0.25 : 0.3);
        st.face = "happy";
      }
      // 互撞的位移：退後 → 衝 → 撞到彈回
      function butt(t) {
        if (t < BUTT0) return { d: 0, head: 0 };
        const u = ((t - BUTT0) % CYCLE) / CYCLE;
        return {
          d: path(u, [[0, 0], [0.45, -8, "io"], [0.6, 5.5, "in"], [0.72, -2, "out"], [1, 0, "io"]]),
          head: path(u, [[0.3, 0], [0.5, 0.35, "io"], [0.75, 0.35], [0.95, 0, "io"]]),
        };
      }

      function render(t) {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.imageSmoothingEnabled = false;
        ctx.fillStyle = "#1A1420";
        ctx.fillRect(0, 0, 1920, 1080);
        meadow(t);

        // 鏡頭：特寫發抖的小白兔 → 跟著眼珠看左邊的羊、右邊的獅熊（都好大隻）→ 拉遠，小白兔在中間
        // → 往左看隊伍走進來，跟著小貓回來 → 公布名字時依序對準 → 世界和平 → 跟著小貓走
        const camKeys = {
          x: [[0, RB_X], [LOOK_L[0], RB_X], [LOOK_L[0] + 0.6, 174, "io"], [LOOK_R[0], 174], [LOOK_R[0] + 0.8, 290, "io"], [LOOK_R[1], 290], [LOOK_R[1] + 1.0, RB_X, "io"],
            [12.0, RB_X], [12.8, 64, "io"], [14.6, 104, "lin"], [15.4, 136, "io"], [16.3, 136], [16.9, 280, "io"]],
          y: [[0, 48], [LOOK_L[0], 48], [LOOK_L[0] + 0.6, 40, "io"], [LOOK_R[1], 40], [LOOK_R[1] + 1.0, 36, "io"]],
          z: [[0, 2.2], [LOOK_L[0], 2.2], [LOOK_L[0] + 0.6, 1.5, "io"], [LOOK_R[1], 1.5], [LOOK_R[1] + 1.0, 1, "io"]],
        };
        const ZOOM = 1.25;
        TAGS.forEach((tg, i) => {
          const t0 = TAG_AT + STEP * i;
          const prev = i ? TAGS[i - 1].focus : [280, 36];
          camKeys.x.push([t0, prev[0]], [t0 + 0.6, tg.focus[0], "io"]);
          camKeys.y.push([t0, prev[1]], [t0 + 0.6, tg.focus[1], "io"]);
          camKeys.z.push([t0, i ? ZOOM : 1], [t0 + 0.6, ZOOM, "io"]);
        });
        const last = TAGS[TAGS.length - 1].focus;
        camKeys.x.push([PEACE, last[0]], [PEACE + 0.8, RB_X, "io"]);
        camKeys.y.push([PEACE, last[1]], [PEACE + 0.8, 36, "io"]);
        camKeys.z.push([PEACE, ZOOM], [PEACE + 0.8, 1, "io"]);
        const cam = { x: path(t, camKeys.x), y: path(t, camKeys.y), z: path(t, camKeys.z) };
        if (t >= GO) {
          // 跟著帶頭的小貓走，走到世界右邊就停住，看大家一隻隻走過去
          const follow = Math.max(130, CAT_FOOT + V * (t - GO) + 20);
          cam.x = tw(t, GO, GO + 0.8, RB_X, follow, "io");
        }
        const z = cam.z;
        const vw = 128 / z;
        const vh = GH / z;
        const cx = Math.min(GW - vw / 2, Math.max(vw / 2, cam.x));
        const cy = Math.min(GH - vh / 2, Math.max(vh / 2, cam.y));
        const k = P * z;
        ctx.setTransform(k, 0, 0, k, -(cx - vw / 2) * k, -(cy - vh / 2) * k);
        ctx.drawImage(world, 0, 0, GW, GH);

        const stopped = t >= STOP;
        const dizzy = stopped && t < DIZZY_END;
        const calm = t >= DIZZY_END;
        const peace = t >= PEACE;
        const cheer = (st, n) => {
          // 世界和平：一起跳一下
          if (t >= PEACE && t < PEACE + 0.8) {
            st.face = "happy";
            st.hop = (st.hop || 0) + jump(t, PEACE + (n || 0) * 0.04, 0.45, st.k ? 5 : 3);
          }
        };

        // ---- 隊伍走進來：整隊跟著小貓平移 ----
        const catX = tw(t, WALK0, WALK_IN, -60, CAT_X, "lin");
        const off = catX - CAT_X;
        const walkingIn = t > WALK0 && t < WALK_IN;
        const old = {};
        Object.keys(HOME).forEach((kd, n) => {
          if (kd === "sn") return;
          const st = { kind: kd, fx: HOME[kd] + off, face: "open", headRot: Math.sin(t * 1.5 + HOME[kd]) * 0.03 };
          if (FRONT_ROW.includes(kd)) st.fy = FRONT;
          if (kd === "el") st.ear = Math.sin(t * 2.2) * 0.06;
          if (kd === "sq") st.tail = Math.sin(t * 6) * 0.2;
          if (walkingIn) stride(st, t - WALK0, n);
          const pf = paradeFoot(kd, t);
          if (pf !== null) {
            st.fx = pf;
            const w = walking(kd, t);
            if (w >= 0) stride(st, w, n);
          }
          // 看到打架嚇一跳（停下來那一刻跳一下）
          if (t >= STOP && t < STOP + 0.5) st.hop = (st.hop || 0) + jump(t, STOP + n * 0.03, 0.4, 2);
          cheer(st, n);
          old[kd] = st;
        });
        const sn = { x: HOME.sn + off, face: "open", headRot: Math.sin(t * 2.4) * 0.08 };
        const snf = paradeFoot("sn", t);
        if (snf !== null) {
          sn.x = snf;
          sn.headRot = 0;
          sn.face = "happy";
        }
        if (t >= PEACE && t < PEACE + 0.8) {
          sn.face = "happy";
          sn.hop = jump(t, PEACE, 0.45, 3);
        }
        sn.spin = (sn.x - HOME.sn) / RING_R; // 往右滾

        // ---- 綿羊、山羊 ----
        const sheep = { kind: "sh", k: BIG, fx: SH_X, face: "open" };
        const goat = { kind: "gt", k: BIG, fx: GT_X, sx: -1, face: "open" };
        const hits = CLASHES.filter((c) => c <= Math.min(t, STOP));
        const lastHit = hits.length ? hits[hits.length - 1] : -9;
        sheep.wool = Math.min(1.45, 1 + 0.06 * hits.length) + pop(t, lastHit, 0.15, 0.4);
        let clashFx = -1;
        if (!stopped) {
          const b = butt(t);
          sheep.fx = SH_X + b.d;
          sheep.headRot = b.head;
          goat.fx = GT_X - b.d;
          goat.headRot = b.head;
          if (t >= GOAT_FLY && t < GOAT_BACK) {
            // 被彈飛到小白兔旁邊，暈一下再走回來
            goat.fx = GT_X + path(t, [[GOAT_FLY, 0], [RB_JUMP, 18, "out"], [9.9, 18], [GOAT_BACK, 0, "io"]]);
            goat.hop = jump(t, GOAT_FLY, RB_JUMP - GOAT_FLY, 6);
            goat.headRot = 0;
            goat.face = t < 9.9 ? "dizzy" : "open";
          }
          if (lastHit > 0 && t < lastHit + 0.3) {
            clashFx = (t - lastHit) / 0.3;
            sheep.sy = goat.sy = 1 + pop(t, lastHit, -0.12, 0.3);
          }
        } else {
          // 小貓喊停的那一刻，山羊最後一撞把頭卡進羊毛裡
          const g0 = GT_X - butt(STOP).d;
          goat.fx = tw(t, STOP, STOP + 0.35, g0, SH_X + STUCK, "in");
          goat.headRot = tw(t, STOP, STOP + 0.35, 0.2, 0.6, "io");
          sheep.wool = tw(t, STOP + 0.35, STOP + 0.6, sheep.wool, WOOL_MAX, "back");
          sheep.sx = 1 + pop(t, STOP + 0.35, 0.12, 0.5);
          if (dizzy) sheep.face = "dizzy";
          // 想把頭拔出來：後腳亂踢
          if (t >= STOP + 0.35) {
            goat.hop = Math.abs(Math.sin(t * 18)) * 1.2;
            goat.rot = Math.sin(t * 9) * 0.05;
            goat.headRot = 0.6 + Math.sin(t * 9) * 0.06;
          }
        }
        // 山羊卡著綿羊一起走（山羊倒退著把綿羊拖走，綿羊腳不動往前滑）
        const pairF = paradeFoot("pair", t);
        if (pairF !== null) {
          goat.fx = pairF;
          sheep.fx = pairF - STUCK;
          sheep.rot = -0.06;
          sheep.face = "happy";
        } else if (stopped) {
          sheep.fx = t < STOP + 0.35 ? SH_X : goat.fx - STUCK;
        }

        // ---- 獅子、棕熊：打成一團 → 停手後鼻子對鼻子瞪著，一個爆炸頭、一個腫包 ----
        const lion = { kind: "ln", k: BIG, face: "open" };
        const bear = { kind: "br", k: BIG, sx: -1, face: "open" };
        const brawl = (tt) => ({
          lx: BX - 10 + Math.sin(tt * 7) * 5,
          ly: GROUND - Math.abs(Math.sin(tt * 8)) * 8,
          lr: Math.sin(tt * 6) * 0.6,
          bx: BX + 12 + Math.sin(tt * 6 + 1) * 5,
          by: GROUND - Math.abs(Math.sin(tt * 7 + 1)) * 8,
          br: -Math.sin(tt * 5.5 + 0.5) * 0.6,
        });
        if (!stopped) {
          const b = brawl(t);
          Object.assign(lion, { fx: b.lx, fy: b.ly, rot: b.lr, headRot: Math.sin(t * 13) * 0.15 });
          Object.assign(bear, { fx: b.bx, fy: b.by, rot: b.br, headRot: Math.sin(t * 12 + 1) * 0.15 });
        } else {
          const b = brawl(STOP);
          const u = tw(t, STOP, STOP + 0.45, 0, 1, "out");
          lion.fx = b.lx + (LN_X - b.lx) * u;
          lion.fy = GROUND - jump(t, STOP, 0.45, 10);
          lion.rot = b.lr * (1 - u);
          lion.messy = true;
          bear.fx = b.bx + (BR_X - b.bx) * u;
          bear.fy = GROUND - jump(t, STOP, 0.45, 10);
          bear.rot = b.br * (1 - u);
          bear.bump = tw(t, STOP + 0.45, STOP + 0.75, 0, 1, "back");
          if (dizzy) {
            lion.face = bear.face = "dizzy";
            lion.headRot = Math.sin(t * 9) * 0.12;
            bear.headRot = Math.sin(t * 9 + 1) * 0.12;
          }
        }

        // ---- 小白兔裁判：一直面向鏡頭，嚇到發抖、眼珠亂轉 ----
        const rb = { kind: "rb", fx: RB_X, front: true, eyes: "scared", ears: "up" }; // 耳朵一直豎著，一看就是兔子
        if (t < tagHit(4)) {
          rb.fx += Math.sin(t * 47) * 0.25;
          rb.headRot = Math.sin(t * 31) * 0.04;
          // 眼珠每 0.22 秒換一個方向（左右為主，偶爾往上下瞄）；開場跟著鏡頭先看左、再看右
          const slot = Math.floor(t / 0.22);
          rb.look = [hash(slot, 5, 1) < 0.5 ? 0 : 1, hash(slot, 5, 2) < 0.7 ? 0 : 1];
          if (t >= LOOK_L[0] - 0.2 && t < LOOK_L[1]) rb.look = [0, 0];
          if (t >= LOOK_R[0] && t < LOOK_R[1]) rb.look = [1, 0];
        }
        if (!stopped) {
          if (t >= RB_JUMP && t < RB_BALL[0]) {
            // 被山羊撞到：嚇得跳起來，眼珠亂轉
            rb.hop = jump(t, RB_JUMP, RB_BALL[0] - RB_JUMP, 7);
            rb.look = [Math.floor(t * 20) % 2, 0];
          }
          if (t >= RB_BALL[0] && t < RB_BALL[1]) {
            rb.ball = true;
            rb.sy = 1 + pop(t, RB_BALL[0], -0.2, 0.4);
            rb.fx = RB_X + Math.sin(t * 60) * 0.35;
          }
        }
        const rbTagged = t >= tagHit(4);
        if (rbTagged) {
          // 收到名牌，終於鬆一口氣：一屁股坐下
          rb.eyes = "happy";
          rb.sy = tw(t, tagHit(4) + 0.3, tagHit(4) + 0.5, 1, 0.84, "out");
          if (peace) rb.sy = 1;
          cheer(rb);
        }
        const rbf = paradeFoot("rb", t);
        if (rbf !== null) {
          rb.fx = rbf;
          rb.front = false; // 走路時轉成側面
          rb.face = "happy";
          rb.sy = 1;
          rb.fy = tw(t, START.rb, START.rb + 0.3, GROUND, FRONT, "io");
          const w = walking("rb", t);
          if (w >= 0) stride(rb, w);
        }

        // ---- 拿到名牌就不吵了：表情轉開心，世界和平時一起跳 ----
        const rigs = { sh: sheep, gt: goat, ln: lion, br: bear, rb };
        TAGS.forEach((tg, i) => {
          const st = rigs[tg.kind];
          const t0 = tagHit(i);
          if (t < t0 || tg.kind === "rb") return;
          st.face = "happy";
          if (t < t0 + 1.0) st.hop = (st.hop || 0) + jump(t, t0, 0.4, 4);
          cheer(st, i);
        });

        // ---- 遊行：獅子、棕熊轉過來面向右走 ----
        [["ln", lion], ["br", bear]].forEach(([kd, st], n) => {
          const pf = paradeFoot(kd, t);
          if (pf === null) return;
          st.fx = pf;
          st.sx = 1;
          st.headRot = 0;
          const w = walking(kd, t);
          if (w >= 0) stride(st, w, n);
        });
        if (pairF !== null) {
          const w = walking("pair", t);
          if (w >= 0) goat.hop = Math.abs(Math.sin(w * Math.PI * 5)) * 1.6;
        }

        // ---- 畫：後排 → 打架的 → 小貓 → 前排 ----
        const tagOn = (st, kd, scale) => {
          const n = kd === "sn" ? snakeNeck(sn) : rigToWorld(st, RIG[kd].neck);
          piece("name_tag", Math.sin(t * 3 + (HOME[kd] || 0)) * 0.06 + (st && st.rot ? st.rot * 0.5 : 0), { ax: n[0], ay: n[1], scale });
        };
        BACK_ROW.forEach((kd) => drawAnimal(old[kd]));
        BACK_ROW.forEach((kd) => tagOn(old[kd], kd, OLD_TAG[kd]));
        drawSnake(sn);
        tagOn(null, "sn", OLD_TAG.sn);

        drawAnimal(lion);
        drawAnimal(bear);
        // 打架煙霧蓋在兩隻身上，只露出頭和腳；喊停時炸開消失
        if (t < STOP + 0.5) {
          const grow = stopped ? 1 + (t - STOP) * 1.6 : 1;
          const fade = stopped ? tw(t, STOP, STOP + 0.5, 1, 0, "in") : 1;
          // 煙霧只蓋住扭在一起的身體中段，頭、尾巴、腳都露出來
          for (let i = 0; i < 5; i++) {
            const a = t * 3 + i * 1.25;
            const s = (1.45 + 0.3 * Math.sin(t * 9 + i * 1.7)) * fade;
            piece("dust", 0, { ax: BX + Math.cos(a) * 9 * grow + Math.sin(t * 11 + i) * 2, ay: BY + 4 + Math.sin(a) * 4 * grow, scale: s });
          }
          if (!stopped) {
            // 煙霧邊緣不時冒出星星
            const slot = Math.floor(t / 0.25);
            const a = hash(slot, 3, 1) * Math.PI * 2;
            const u = (t % 0.25) / 0.25;
            piece("sparkle", 0, { ax: BX + Math.cos(a) * 24, ay: BY + Math.sin(a) * 13, scale: Math.sin(u * Math.PI) * 1.6 });
          }
        }
        drawAnimal(goat);
        drawAnimal(sheep);
        // 互撞的火花
        if (clashFx >= 0) {
          const s = Math.sin(clashFx * Math.PI);
          piece("sparkle", 0, { ax: CLASH_X, ay: GROUND - 26, scale: s * 2.2 });
          piece("sparkle", 0, { ax: CLASH_X - 6, ay: GROUND - 33, scale: s * 1.2 });
        }

        // ---- 小貓：帶隊走進來 → 揮手叫停 → 站著拋名牌 → 帶頭走出畫面 ----
        const cat = { x: catX, y: 31, torso: "s_torso_belly_dress", arm: "s_arm_dress", head: "s_head_open_bow", armRot: -0.15, tail: Math.sin(t * 2) * 0.12 };
        if (walkingIn) {
          walkPose(cat, (t - WALK0) * Math.PI * 3.6, 1);
          cat.head = "s_head_happy_bow";
        }
        const W0 = STOP - 0.35;
        if (t >= W0 && t < W0 + 0.95) cat.armRot = path(t, [[W0, -0.15], [W0 + 0.2, -1.6, "out"], [W0 + 0.35, -1.15], [W0 + 0.5, -1.6], [W0 + 0.65, -1.15], [W0 + 0.95, -0.15, "io"]]);
        if (t >= DIZZY_END && t < DIZZY_END + 0.6) {
          cat.head = "s_head_happy_bow";
          cat.hop = jump(t, DIZZY_END + 0.1, 0.45, 2.5);
        }
        let tagFly = null;
        TAGS.forEach((tg, i) => {
          const t0 = TAG_AT + STEP * i;
          if (t < t0 || t >= t0 + STEP) return;
          // 舉手 → 拋出名牌 → 手放下
          cat.armRot = path(t, [[t0 + 0.25, -0.15], [t0 + THROW, -1.4, "out"], [t0 + THROW + 0.25, -1.4], [t0 + THROW + 0.55, -0.15, "io"]]);
          if (t < t0 + THROW) cat.hold = () => piece("name_tag", 0, { ax: 6.2, ay: 0.5 });
          const s = tagState(i, t);
          if (s > 0 && s < 1) tagFly = { i, s };
          if (t >= t0 + THROW + FLY && t < t0 + STEP - 0.1) cat.head = "s_head_happy_bow";
        });
        if (peace) {
          cat.head = "s_head_happy_bow";
          if (t < PEACE + 0.8) cat.hop = jump(t, PEACE, 0.45, 3);
        }
        if (t >= GO) {
          cat.x = CAT_X + V * (t - GO);
          if (cat.x < EXIT_X) walkPose(cat, (t - GO) * Math.PI * 3.6, 1);
        }
        drawCat(cat);

        drawAnimal(rb);
        FRONT_ROW.forEach((kd) => drawAnimal(old[kd]));
        FRONT_ROW.forEach((kd) => tagOn(old[kd], kd, OLD_TAG[kd]));

        // 掛好的名牌（跟著脖子走）
        TAGS.forEach((tg, i) => {
          if (tagState(i, t) < 1) return;
          const st = rigs[tg.kind];
          const n = rigToWorld(st, RIG[tg.kind].neck);
          const t1 = tagHit(i);
          const sw = Math.sin((t - t1) * 8) * 0.25 * Math.max(0, 1 - (t - t1) / 1.5);
          piece("name_tag", sw + (st.rot || 0) * 0.5, { ax: n[0], ay: n[1], scale: tg.scale * (1 + pop(t, t1, 0.3, 0.5)) });
        });
        if (tagFly) {
          // 從舉高的手（約 -1.4 rad）拋出，沿拋物線飛到脖子
          const hx = cat.x + 20 + Math.cos(-1.4) * 6.2;
          const hy = cat.y + 19 + Math.sin(-1.4) * 6.2;
          const tg = TAGS[tagFly.i];
          const n = rigToWorld(rigs[tg.kind], RIG[tg.kind].neck);
          const u = tagFly.s;
          const arc = 6 + Math.abs(n[0] - hx) * 0.12;
          piece("name_tag", u * 8, { ax: hx + (n[0] - hx) * u, ay: hy + (n[1] - hy) * u - Math.sin(u * Math.PI) * arc });
        }

        // ---- 特效 ----
        // 暈頭轉向的星星（被彈飛的山羊、停手後的四隻）
        const stars = [];
        if (!stopped && t >= RB_JUMP && t < 9.9) stars.push(rigToWorld(goat, HEAD_TOP.gt));
        if (dizzy) [sheep, goat, lion, bear].forEach((st) => stars.push(rigToWorld(st, HEAD_TOP[st.kind])));
        stars.forEach((h, n) => {
          for (let i = 0; i < 3; i++) {
            const a = t * 6 + n + (i * Math.PI * 2) / 3;
            piece("sparkle", 0, { ax: h[0] + Math.cos(a) * 6, ay: h[1] - 3 + Math.sin(a) * 2, scale: 0.9 });
          }
        });
        // 冒冷汗：頭的兩側一直滴
        if (!rbTagged) {
          const sides = rb.ball ? [[RB_X - 4, GROUND - 9], [RB_X + 5, GROUND - 9]] : [rigToWorld(rb, [0, 8]), rigToWorld(rb, [15, 8])];
          sides.forEach((top, i) => {
            for (let j = 0; j < 2; j++) {
              const u = (t * 1.3 + i * 0.35 + j * 0.5) % 1;
              piece("sweat", 0, { ax: top[0] + (i ? 1 : -1) * j * 1.5, ay: top[1] + u * 4, scale: 0.7 * (1 - u) });
            }
          });
        }
        // 鬆一口氣
        if (rbTagged && t < tagHit(4) + 1.2) {
          const u = (t - tagHit(4) - 0.4) / 0.8;
          if (u > 0) {
            const m = rigToWorld(rb, [7.5, 14]);
            piece("dust", 0, { ax: m[0] - 2 - u * 4, ay: m[1] - u * 3, scale: 0.4 * Math.sin(Math.min(1, u) * Math.PI) });
          }
        }
        // 世界和平：每隻頭上冒愛心飄上去
        if (t >= PEACE && t < PEACE + 1.6) {
          const u = (t - PEACE) / 1.6;
          [sheep, goat, lion, bear, rb].forEach((st, n) => {
            const h = rigToWorld(st, HEAD_TOP[st.kind]);
            const s = Math.sin(Math.min(1, u * 1.4) * Math.PI) * (st.k ? 2.6 : 1.6);
            piece("heart", Math.sin(t * 6 + n) * 0.2, { ax: h[0] + Math.sin(u * 8 + n) * 2, ay: h[1] - 4 - u * 10, scale: s });
          });
          // 獅子和棕熊中間冒一顆大愛心
          piece("heart", 0, { ax: (lion.fx + bear.fx) / 2, ay: GROUND - 46 - u * 4, scale: 3.6 * Math.sin(Math.min(1, u * 1.2) * Math.PI) });
        }

        // ---- 名字字卡（固定在畫面下方，不跟鏡頭） ----
        ctx.setTransform(P, 0, 0, P, 0, 0);
        TAGS.forEach((tg, i) => {
          const t0 = tagHit(i) - 0.05;
          const t1 = TAG_AT + STEP * (i + 1);
          if (t < t0 || t >= t1) return;
          const s = tw(t, t0, t0 + 0.2, 0, 1, "back") * tw(t, t1 - 0.2, t1, 1, 0, "in");
          piece(tg.cap, 0, { ax: 64, ay: 59, scale: s * 0.9 });
        });
      }

      (window.EPISODES = window.EPISODES || []).push({ no: 4, title: '第四集', render, duration: DUR });
    })();
