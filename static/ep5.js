// 預告片第五集：由 tools/build_trailer.py 從 video/compositions/ep5.html 產生，請勿手改
// 角色零件沿用 sprites.js 的 SPRITES / PAL；登記到 window.EPISODES = [{ no, title, render(t), duration }]
(function () {
      // 下方 SPRITES 區塊由 video/design/export_pieces.py 自動產生
      

      // 第五集：狐狸 Lesley 在烤魷魚攤搧火，西施犬 Yennefer 和芝麻狗 Sylvia 排隊等著吃
      // → 特寫：狐狸用夾子把魷魚翻面，看到魷魚的臉 → 小貓帶前四集的朋友走進來（後遺症照舊：山羊頭卡在羊毛裡、
      // 獅子爆炸頭、棕熊腫包、矮袋鼠絆倒、蛇滾著走）→ 發名牌給狐狸、芝麻狗、西施犬，魷魚趁亂躲到攤位底下
      // → 遊行經過攤位時小貓偷偷把名牌塞給魷魚 → 大家走遠了，魷魚才衝出來追上去
      // 芝麻狗開場就把金幣拋到桌上付錢，結果大家（連狐狸）都忘了拿，最後被魷魚叼走
      const DUR = 38;
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
        SPR[name] = { c, sh, w: w * unit, h: h * unit, x0: p.x0, y0: p.y0, px: p.pivot[0], py: p.pivot[1], unit, fine: !!p.fine };
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
        // 細格零件（fine，如芝麻狗）的 x0/y0 已換算成一般格，照角色框對齊
        const lx = s.unit === 1 || s.fine ? s.x0 - s.px : -s.w / 2;
        const ly = s.unit === 1 || s.fine ? s.y0 - s.py : -s.h / 2;
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
        fx: { w: 18, h: 30, foot: 8, neck: [10, 13] },
        yn: { w: 20, h: 16, foot: 9, neck: [14, 10] },
        dg: { w: 26, h: 22, foot: 11, neck: [19, 12] },
        sd: { w: 16, h: 20, foot: 8, neck: [8, 15] },
      };
      // 冒暈眩星星的位置（角色框座標）
      const HEAD_TOP = { sh: [20, 3], gt: [8, 8], ln: [24, 2], br: [22, 2], rb: [7, 6], fx: [10, 1], yn: [15, 1], dg: [21, 3] };
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
        fx: (st) => {
          piece("fx_body", 0);
          piece("fx_head_" + (st.face || "open"), st.headRot || 0);
          // 手上拿扇子或夾子（座標相對於手臂的關節 9,15）
          const after = st.prop === "fan" ? () => piece("fan", 0.3, { ax: 4, ay: 2 }) : st.prop === "tongs" ? () => piece("tongs", 0.25, { ax: 3.6, ay: 2.4 }) : null;
          piece("fx_arm", st.armRot || 0, { after });
        },
        yn: (st) => {
          piece("yn_body", 0);
          piece("yn_head_" + (st.face || "open"), st.headRot || 0);
        },
        dg: (st) => {
          piece("dg_body", 0);
          piece("dg_head_" + (st.face || "open"), st.headRot || 0);
        },
        sd: (st) => piece("sd_" + (st.face || "open"), st.headRot || 0),
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

      // ---------- 烤魷魚攤（格座標） ----------
      const STALL_X = 192; // 攤子中心
      const TOP = GROUND - 14; // 櫃台桌面
      const GRILL_Y = TOP - 8; // 魷魚躺在烤網上的中心高度
      const SQ_K = 0.6; // 魷魚躲在攤位底下的大小
      const SQ_GRILL = 0.8; // 躺在烤網上（特寫要看得清楚臉）
      const SQ_RUN = 0.85; // 衝出來追隊伍
      function drawStallBack() {
        piece("stall_back", 0, { ax: STALL_X, ay: TOP - 28 });
        piece("stall_sign", 0, { ax: STALL_X, ay: TOP - 33 });
      }
      function drawCounter() {
        piece("stall_counter", 0, { ax: STALL_X, ay: GROUND });
      }

      // ---------- 時間軸 ----------
      // 第四集打架後的四隻還是放大兩倍（BIG），後遺症照舊：山羊頭卡在羊毛裡、獅子爆炸頭、棕熊頭上腫包
      const BIG = 2;
      const STUCK = 17 * BIG;
      const WOOL_MAX = 1.55;
      // 開場：狐狸搧火，西施犬、芝麻狗排隊等；鏡頭推到烤網特寫，狐狸用夾子把魷魚翻面，看到魷魚的臉
      const CLOSE_IN = [2.6, 3.3];
      const FAN_END = 3.3;
      const FLIP = [4.6, 5.0];
      const CLOSE_OUT = [7.0, 7.7];
      // 隊伍：小貓帶頭，前四集的朋友跟在後面走進來（停下來時的腳底 x，左邊幾隻停在畫面外）
      const CAT_X = 60;
      const CAT_FOOT = CAT_X + 20;
      const WALK0 = 8.6;
      const WALK_IN = 14.6;
      const HOME = {
        pair: 40, ln: -60, br: -120, sn: -170, el: -225, gf: -265, // 後排（pair 是卡在一起的山羊＋綿羊，以山羊的腳底為準）
        rb: 30, sq: 10, gp: -6, hm: -22, qk: -38, ot: -58, mk: -78, // 前排
      };
      const BACK_ROW = ["gf", "el"];
      const FRONT_ROW = ["mk", "ot", "qk", "hm", "gp", "sq", "rb"];
      const OLD_TAG = { el: 1, gf: 1, ot: 1, mk: 1, sn: 1, sq: 0.85, gp: 0.8, hm: 0.75, qk: 0.85, sh: 1.4, gt: 1.4, ln: 1.4, br: 1.4, rb: 0.75 };
      // 第五集的新角色：狐狸站在攤子後面（墊著箱子，面向左），西施犬排第一、芝麻狗排第二
      const FX_X = STALL_X + 15;
      const FX_Y = GROUND - 6;
      const YN_X = 158;
      const DG_X = 124;
      const DG_K = 1.3; // 芝麻狗是中型犬，比其他小動物大一號

      // 公布名字：每隻 1.8 秒，依序是狐狸、芝麻狗、西施犬；魷魚先不給
      const TAG_AT = 15.8;
      const STEP = 1.8;
      const TAGS = [
        { kind: "fx", cap: "cap_lesley", focus: [196, 36], scale: 1 },
        { kind: "dg", cap: "cap_sylvia", focus: [136, 42], scale: 1.2 },
        { kind: "yn", cap: "cap_yennefer", focus: [168, 46], scale: 0.85 },
      ];
      const THROW = 0.55;
      const FLY = 0.45;
      const tagHit = (i) => TAG_AT + STEP * i + THROW + FLY;
      const TAGS_END = TAG_AT + STEP * TAGS.length;
      // 發名牌的時候魷魚趁亂從烤網跳下來，躲到攤位底下；狐狸發現烤網空了
      const ESC = TAG_AT + STEP * 2 + 1.15;
      const HIDE_X = STALL_X - 2;
      const HIDE_SY = 0.62;

      // 遊行：小貓帶頭，大家用同樣的速度排成兩列跟上（GAP 是腳底落後小貓腳底多少格）。
      // 小貓走到攤位前停下來，偷偷把名牌塞給攤位底下的魷魚——這段時間整條隊伍一起停（parade clock 暫停）
      const GO = TAGS_END + 1.4;
      const V = 70;
      const CAT_STOP = 176;
      const P0 = GO + (CAT_STOP - CAT_FOOT) / V;
      const PAUSE = 2.0;
      const P1 = P0 + PAUSE;
      const pc = (t) => (t <= P0 ? t : t <= P1 ? P0 : t - PAUSE);
      const FOOT0 = Object.assign({ fx: FX_X, yn: YN_X, dg: DG_X }, HOME);
      const GAP = {
        dg: 44, fx: 78, pair: 116, ln: 200, br: 256, sn: 306, el: 366, gf: 408, // 後排
        yn: 22, rb: 56, sq: 76, gp: 94, hm: 110, qk: 126, ot: 146, mk: 168, // 前排
      };
      const START = {};
      Object.keys(GAP).forEach((kd) => (START[kd] = GO + (FOOT0[kd] + GAP[kd] - CAT_FOOT) / V));
      const EXIT_X = GW + 44;
      // 魷魚等隊伍最後一隻（長頸鹿）走過攤位好一段才衝出來追
      const lastPass = START.gf + (STALL_X + 60 - FOOT0.gf) / V;
      const SQ_GO = (lastPass > P0 ? lastPass + PAUSE : lastPass) + 0.5;
      const SQ_V = V * 1.6;
      // 芝麻狗付的金幣：開場從嘴裡拋到桌上，一直放到最後被魷魚拿走
      const COIN_X = STALL_X - 14;
      const COIN_THROW = 1.3;
      const COIN_FLY = 0.6;
      // 魷魚出來後的路線：從攤位底下鑽出來 → 跳上桌叼走金幣 → 跳下來舉著金幣衝出去
      function squidRun(r) {
        if (r < 0.3) return { x: HIDE_X, y: GROUND, coin: false };
        if (r < 0.75) {
          return { x: tw(r, 0.3, 0.75, HIDE_X, COIN_X + 3, "lin"), y: path(r, [[0.3, GROUND], [0.55, TOP - 8, "out"], [0.75, TOP, "in"]]), coin: false };
        }
        if (r < 1.0) return { x: COIN_X + 3, y: TOP, coin: r >= 0.85 };
        return { x: COIN_X + 3 + SQ_V * (r - 1.0), y: path(r, [[1.0, TOP], [1.15, TOP - 5, "out"], [1.4, GROUND, "in"]]), coin: true };
      }
      const TAG_SQ = P0 + 0.55; // 名牌從小貓手上塞到攤位底下
      const TAG_SQ_HIT = TAG_SQ + 0.45;

      function paradeFoot(kind, t) {
        const pt = pc(t);
        return pt < START[kind] ? null : FOOT0[kind] + V * (pt - START[kind]);
      }
      const paused = (t) => t > P0 && t < P1;
      function walking(kind, t) {
        const f = paradeFoot(kind, t);
        return f !== null && f < EXIT_X + 30 && !paused(t) ? pc(t) - START[kind] : -1;
      }
      function tagState(i, t) {
        const t0 = TAG_AT + STEP * i + THROW;
        return t < t0 ? 0 : tw(t, t0, t0 + FLY, 0, 1, "lin");
      }
      function stride(st, w, n) {
        const kd = st.kind;
        const ph = w * Math.PI * (kd === "el" ? 3 : 3.4) + (n || 0);
        st.hop = Math.abs(Math.sin(ph)) * (kd === "el" ? 0.8 : kd === "gf" ? 1.2 : st.k ? 2.4 : 2);
        if (kd === "el" || kd === "gf") st.leg = Math.sin(ph) * (kd === "el" ? 0.25 : 0.3);
        st.face = "happy";
      }

      function render(t) {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.imageSmoothingEnabled = false;
        ctx.fillStyle = "#1A1420";
        ctx.fillRect(0, 0, 1920, 1080);
        meadow(t);

        // 鏡頭：攤子（狐狸搧火、狗狗排隊）→ 推到烤網特寫 → 拉回 → 往左看隊伍走進來 → 依序對準拿名牌的
        // → 遊行時跟著小貓走到攤位前停住，看大家一隻隻走過 → 跟著衝出來的魷魚走到最右邊
        const camKeys = {
          x: [[0, 168], [CLOSE_IN[0], 168], [CLOSE_IN[1], STALL_X + 3, "io"], [CLOSE_OUT[0], STALL_X + 3], [CLOSE_OUT[1], 168, "io"],
            [WALK0 + 1.4, 168], [WALK0 + 2.3, 64, "io"], [WALK_IN, 92, "lin"], [WALK_IN + 0.9, 130, "io"]],
          y: [[0, 42], [CLOSE_IN[0], 42], [CLOSE_IN[1], 40, "io"], [CLOSE_OUT[0], 40], [CLOSE_OUT[1], 40, "io"], [WALK0 + 1.4, 40], [WALK0 + 2.3, 36, "io"]],
          z: [[0, 1.4], [CLOSE_IN[0], 1.4], [CLOSE_IN[1], 2.9, "io"], [CLOSE_OUT[0], 2.9], [CLOSE_OUT[1], 1.4, "io"], [WALK0 + 1.4, 1.4], [WALK0 + 2.3, 1, "io"]],
        };
        const ZOOM = 1.25;
        TAGS.forEach((tg, i) => {
          const t0 = TAG_AT + STEP * i;
          const prev = i ? TAGS[i - 1].focus : [130, 36];
          camKeys.x.push([t0, prev[0]], [t0 + 0.6, tg.focus[0], "io"]);
          camKeys.y.push([t0, prev[1]], [t0 + 0.6, tg.focus[1], "io"]);
          camKeys.z.push([t0, i ? ZOOM : 1], [t0 + 0.6, ZOOM, "io"]);
        });
        const last = TAGS[TAGS.length - 1].focus;
        camKeys.x.push([TAGS_END, last[0]], [TAGS_END + 0.8, 150, "io"]);
        camKeys.y.push([TAGS_END, last[1]], [TAGS_END + 0.8, 36, "io"]);
        camKeys.z.push([TAGS_END, ZOOM], [TAGS_END + 0.8, 1, "io"]);
        const cam = { x: path(t, camKeys.x), y: path(t, camKeys.y), z: path(t, camKeys.z) };
        const catFoot = t < GO ? CAT_FOOT : CAT_FOOT + V * (pc(t) - GO);
        if (t >= GO) cam.x = tw(t, GO, GO + 0.8, 150, Math.min(STALL_X + 8, Math.max(150, catFoot + 20)), "io");
        if (t >= SQ_GO) cam.x = Math.max(STALL_X + 8, squidRun(t - SQ_GO).x + 10);
        const z = cam.z;
        const vw = 128 / z;
        const vh = GH / z;
        const cx = Math.min(GW - vw / 2, Math.max(vw / 2, cam.x));
        const cy = Math.min(GH - vh / 2, Math.max(vh / 2, cam.y));
        const k = P * z;
        ctx.setTransform(k, 0, 0, k, -(cx - vw / 2) * k, -(cy - vh / 2) * k);
        ctx.drawImage(world, 0, 0, GW, GH);

        const cheer = (st, n) => {
          // 發完名牌：大家一起開心跳一下
          if (t >= TAGS_END && t < TAGS_END + 0.8) {
            st.face = "happy";
            st.hop = (st.hop || 0) + jump(t, TAGS_END + (n || 0) * 0.04, 0.45, st.k ? 5 : 3);
          }
        };
        const arrive = t >= WALK_IN && t < WALK_IN + 0.5;

        // ---- 隊伍走進來：整隊跟著小貓平移 ----
        const catX = tw(t, WALK0, WALK_IN, -70, CAT_X, "lin");
        const off = catX - CAT_X;
        const walkingIn = t > WALK0 && t < WALK_IN;
        const old = {};
        ["gf", "el", "mk", "ot", "qk", "hm", "gp", "sq"].forEach((kd, n) => {
          const st = { kind: kd, fx: HOME[kd] + off, face: "open", headRot: Math.sin(t * 1.5 + HOME[kd]) * 0.03 };
          if (FRONT_ROW.includes(kd)) st.fy = FRONT;
          if (kd === "el") st.ear = Math.sin(t * 2.2) * 0.06;
          if (kd === "sq") st.tail = Math.sin(t * 6) * 0.2;
          if (walkingIn) stride(st, t - WALK0, n);
          const pf = paradeFoot(kd, t);
          let tripping = false;
          if (pf !== null) {
            st.fx = pf;
            st.face = "happy";
            const p0 = START[kd];
            const pt = pc(t);
            if (kd === "qk") {
              // 矮袋鼠走沒幾步又絆倒（同第三集），爬起來快跑追上
              st.fx -= path(pt, [[p0 + 0.5, 0], [p0 + 1.3, 26, "lin"], [p0 + 2.1, 0, "io"]]);
              st.rot = path(pt, [[p0 + 0.5, 0], [p0 + 0.65, 1.45, "in"], [p0 + 1.1, 1.45], [p0 + 1.3, 0, "io"]]);
              tripping = pt >= p0 + 0.5 && pt < p0 + 1.3;
              if (tripping) st.face = "dizzy";
            }
            const w = walking(kd, t);
            if (w >= 0 && !tripping) stride(st, w, n);
          }
          cheer(st, n);
          old[kd] = st;
        });
        // 蛇：捲成一圈滾著走
        const sn = { x: HOME.sn + off, face: "open", headRot: Math.sin(t * 2.4) * 0.08 };
        const snf = paradeFoot("sn", t);
        if (snf !== null) {
          sn.x = snf;
          sn.headRot = 0;
          sn.face = "happy";
        }
        if (t >= TAGS_END && t < TAGS_END + 0.8) sn.hop = jump(t, TAGS_END, 0.45, 3);
        sn.spin = (sn.x - HOME.sn) / RING_R;

        // ---- 第四集的後遺症：山羊頭卡在綿羊的毛裡（倒退著把綿羊拖著走）、獅子爆炸頭、棕熊腫包 ----
        const pairX = paradeFoot("pair", t);
        const goat = { kind: "gt", k: BIG, sx: -1, fx: pairX !== null ? pairX : HOME.pair + off, face: "open", headRot: 0.6 + Math.sin(t * 9) * 0.06 };
        goat.hop = Math.abs(Math.sin(t * 18)) * 1.2; // 想把頭拔出來，後腳一直亂踢
        goat.rot = Math.sin(t * 9) * 0.05;
        const sheep = { kind: "sh", k: BIG, fx: goat.fx - STUCK, face: "open", wool: WOOL_MAX, rot: -0.06 };
        if (walkingIn || walking("pair", t) >= 0) sheep.face = "happy";
        const lion = { kind: "ln", k: BIG, fx: HOME.ln + off, face: "open", messy: true };
        const bear = { kind: "br", k: BIG, fx: HOME.br + off, face: "open", bump: 1 };
        const rb = { kind: "rb", fx: HOME.rb + off, fy: FRONT, face: "happy", ears: "up" };
        [["ln", lion], ["br", bear], ["rb", rb]].forEach(([kd, st], n) => {
          if (walkingIn) stride(st, t - WALK0, n + 3);
          const pf = paradeFoot(kd, t);
          if (pf !== null) {
            st.fx = pf;
            const w = walking(kd, t);
            if (w >= 0) stride(st, w, n);
          }
          cheer(st, n + 2);
        });
        // 獅子和棕熊還在互瞪：隊伍停下來時把頭撇開
        if (!walkingIn && t < GO) {
          lion.headRot = -0.15 + Math.sin(t * 2) * 0.03;
          bear.headRot = -0.15;
        }
        cheer(sheep, 0);

        // ---- 新角色 ----
        const fox = { kind: "fx", fx: FX_X, fy: FX_Y, sx: -1, face: "open", prop: "fan", armRot: 0 };
        const yn = { kind: "yn", fx: YN_X, fy: FRONT, face: "open" };
        const dg = { kind: "dg", k: DG_K, fx: DG_X, face: "open" };
        // 搧火
        if (t < FAN_END) fox.armRot = -0.5 + Math.sin(t * 14) * 0.45;
        else {
          fox.prop = "tongs";
          fox.armRot = path(t, [[FAN_END, 0.1], [FLIP[0] - 0.2, 0.15], [FLIP[0] + 0.15, -0.35, "out"], [FLIP[1] + 0.2, 0.1, "io"]]);
        }
        // 翻面後看到魷魚的臉，狐狸嚇一跳
        if (t >= FLIP[1] + 0.15 && t < CLOSE_OUT[1] + 0.6) {
          fox.hop = jump(t, FLIP[1] + 0.15, 0.4, 3);
          fox.face = t < FLIP[1] + 1.0 ? "dizzy" : "open";
        }
        // 狗狗排隊：踮腳往前看，芝麻狗流口水
        if (t < GO) {
          yn.sy = 1 + Math.max(0, Math.sin(t * 5)) * 0.08;
          dg.sy = 1 + Math.max(0, Math.sin(t * 5 + 1.6)) * 0.07;
          yn.headRot = -0.1 + Math.sin(t * 3) * 0.05;
          dg.headRot = -0.12 + Math.sin(t * 3 + 1) * 0.05;
        }
        // 芝麻狗低頭、甩頭把嘴裡的金幣拋到桌上付錢
        if (t >= 0.8 && t < 1.8) dg.headRot = path(t, [[0.8, -0.12], [1.15, 0.22, "io"], [COIN_THROW, -0.45, "out"], [1.8, -0.12, "io"]]);
        // 小貓帶著奇怪的隊伍走進來：新角色嚇一跳
        if (arrive) [fox, yn, dg].forEach((st, n) => (st.hop = (st.hop || 0) + jump(t, WALK_IN + n * 0.05, 0.4, 2.5)));
        const rigs = { fx: fox, yn, dg };
        TAGS.forEach((tg, i) => {
          const st = rigs[tg.kind];
          const t0 = tagHit(i);
          if (t < t0) return;
          st.face = "happy";
          if (t < t0 + 1.0) st.hop = (st.hop || 0) + jump(t, t0, 0.4, 3);
        });
        [fox, yn, dg].forEach((st, n) => cheer(st, n));
        // 遊行
        [["fx", fox], ["yn", yn], ["dg", dg]].forEach(([kd, st], n) => {
          const pf = paradeFoot(kd, t);
          if (pf === null) return;
          st.fx = pf;
          st.sx = 1;
          st.sy = 1;
          st.headRot = 0;
          if (kd === "fx") {
            // 從攤子後面跳下來
            st.fy = tw(pc(t), START.fx, START.fx + 0.3, FX_Y, GROUND, "in");
            st.prop = null;
            st.armRot = 0.2;
          }
          const w = walking(kd, t);
          if (w >= 0) stride(st, w, n);
        });

        // ---- 魷魚 Eden ----
        // 0：躺在烤網上（先看到背面）→ 翻面看到臉 → 趁亂跳下來躲到攤位底下 → 等大家走遠才衝出來追
        const sq = { kind: "sd", k: SQ_K, fx: HIDE_X, face: "open", sy: HIDE_SY };
        let onGrill = null;
        if (t < ESC) {
          let flip = 1;
          let face = "back";
          if (t >= FLIP[0]) {
            const u = tw(t, FLIP[0], FLIP[1], 0, 1, "io");
            flip = Math.cos(u * Math.PI);
            face = u < 0.5 ? "back" : "scared";
          }
          if (t >= FLIP[1]) {
            face = "scared";
            if (t >= 6.0 && t < 6.15) face = "happy"; // 眨眼
            if (t >= 6.6) face = "open";
          }
          const lift = t >= FLIP[0] && t < FLIP[1] ? jump(t, FLIP[0], FLIP[1] - FLIP[0], 3) : 0;
          onGrill = { face, flip, lift, shake: t >= FLIP[1] ? Math.sin(t * 40) * 0.15 : Math.sin(t * 25) * 0.05 };
        } else if (t < ESC + 0.6) {
          // 跳起來翻正 → 落到桌巾後面
          // 躺在烤網上（臉朝左、背對狐狸）時繞腳底轉了 90 度，所以腳底在烤網中心左邊半個身長
          const u = (t - ESC) / 0.6;
          sq.sy = tw(u, 0.5, 1, 1, HIDE_SY, "io");
          sq.fx = tw(u, 0, 1, STALL_X - 10 * SQ_GRILL, HIDE_X, "lin");
          sq.k = tw(u, 0, 1, SQ_GRILL, SQ_K, "lin");
          sq.fy = path(u, [[0, GRILL_Y], [0.35, GRILL_Y - 6, "out"], [1, GROUND, "in"]]);
          sq.rot = tw(u, 0, 0.4, Math.PI / 2, 0, "out");
          sq.face = "scared";
          sq.esc = u < 0.4;
        }
        if (t >= TAG_SQ_HIT) sq.face = "happy";
        if (t >= ESC + 0.6 && t < SQ_GO) {
          // 躲在底下偷看隊伍走過去
          sq.headRot = Math.sin(t * 2.5) * 0.08;
          sq.sy = HIDE_SY + Math.sin(t * 4) * 0.02;
        }
        let sqRun = -1;
        if (t >= SQ_GO) {
          sqRun = t - SQ_GO;
          sq.sy = tw(sqRun, 0, 0.3, HIDE_SY, 1, "back");
          sq.k = tw(sqRun, 0, 0.3, SQ_K, SQ_RUN, "back");
          const run = squidRun(sqRun);
          sq.fx = run.x;
          sq.fy = run.y;
          sq.face = "happy";
          if (sqRun > 1.4) {
            sq.hop = Math.abs(Math.sin(sqRun * Math.PI * 6)) * 2.2;
            sq.headRot = Math.sin(sqRun * 30) * 0.12;
          }
        }
        const sqHidden = !onGrill && !sq.esc && sqRun < 0.3;

        // ---- 畫：後排 → 攤子 → 打架組 → 小貓 → 前排 ----
        const tagOn = (st, kd, scale) => {
          const n = kd === "sn" ? snakeNeck(sn) : rigToWorld(st, RIG[st.kind].neck);
          piece("name_tag", Math.sin(t * 3 + (HOME[kd] || 0)) * 0.06 + (st && st.rot ? st.rot * 0.5 : 0), { ax: n[0], ay: n[1], scale });
        };
        BACK_ROW.forEach((kd) => drawAnimal(old[kd]));
        BACK_ROW.forEach((kd) => tagOn(old[kd], kd, OLD_TAG[kd]));
        drawSnake(sn);
        tagOn(null, "sn", OLD_TAG.sn);

        drawStallBack();
        drawAnimal(fox);
        piece("grill", 0, { ax: STALL_X, ay: TOP });
        // 炭火的熱氣
        if (t < ESC) {
          for (let i = 0; i < 3; i++) {
            const u = (t * 0.8 + i / 3) % 1;
            piece("dust", 0, { ax: STALL_X - 6 + i * 6 + Math.sin(t * 3 + i) * 1.5, ay: TOP - 10 - u * 10, scale: 0.3 * Math.sin(u * Math.PI) });
          }
        }
        if (onGrill) {
          piece("sd_" + onGrill.face, Math.PI / 2 + onGrill.shake * 0.2, { ax: STALL_X, ay: GRILL_Y - onGrill.lift, sx: onGrill.flip, scale: SQ_GRILL });
        }
        if (sqHidden) {
          drawAnimal(sq);
          if (t >= TAG_SQ_HIT) tagOn(sq, "sd", 0.7);
        }
        drawCounter();
        // 金幣：叼在芝麻狗嘴裡 → 拋到桌上（翻轉）→ 一直放在桌上，大家都忘了拿 → 被魷魚舉著帶走
        const coinRun = sqRun >= 0 ? squidRun(sqRun) : null;
        if (t < COIN_THROW) {
          const m = rigToWorld(dg, [25.2, 10.6]);
          piece("coin", 0, { ax: m[0], ay: m[1] + 2, scale: 0.7 });
        } else if (t < COIN_THROW + COIN_FLY) {
          const m = rigToWorld(dg, [25.2, 10.6]);
          const u = (t - COIN_THROW) / COIN_FLY;
          piece("coin", 0, { ax: m[0] + (COIN_X - m[0]) * u, ay: m[1] + 2 + (TOP - m[1] - 2) * u - Math.sin(u * Math.PI) * 10, sx: Math.cos(u * Math.PI * 4), scale: 0.7 + 0.4 * u });
        } else if (!coinRun || !coinRun.coin) {
          piece("coin", 0, { ax: COIN_X, ay: TOP, scale: 1.1 * (1 + pop(t, COIN_THROW + COIN_FLY, 0.25, 0.4)) });
          if (t < COIN_THROW + COIN_FLY + 0.5) piece("sparkle", 0, { ax: COIN_X + 3, ay: TOP - 5, scale: Math.sin(((t - COIN_THROW - COIN_FLY) / 0.5) * Math.PI) * 1.2 });
        }
        if (sq.esc || (!sqHidden && !onGrill)) {
          drawAnimal(sq);
          if (t >= TAG_SQ_HIT) tagOn(sq, "sd", 0.7);
        }

        drawAnimal(lion);
        drawAnimal(bear);
        drawAnimal(dg);
        drawAnimal(goat);
        drawAnimal(sheep);
        [["ln", lion], ["br", bear], ["gt", goat], ["sh", sheep]].forEach(([kd, st]) => tagOn(st, kd, OLD_TAG[kd]));

        // ---- 小貓：帶隊走進來 → 拋名牌 → 帶頭走到攤位前停下來，偷偷把名牌塞到攤位底下 → 繼續走 ----
        const cat = { x: catX, y: 31, torso: "s_torso_belly_dress", arm: "s_arm_dress", head: "s_head_open_bow", armRot: -0.15, tail: Math.sin(t * 2) * 0.12 };
        if (walkingIn) {
          walkPose(cat, (t - WALK0) * Math.PI * 3.6, 1);
          cat.head = "s_head_happy_bow";
        }
        if (t >= WALK_IN && t < WALK_IN + 0.95) {
          const W0 = WALK_IN;
          cat.armRot = path(t, [[W0, -0.15], [W0 + 0.2, -1.6, "out"], [W0 + 0.35, -1.15], [W0 + 0.5, -1.6], [W0 + 0.65, -1.15], [W0 + 0.95, -0.15, "io"]]);
          cat.head = "s_head_happy_bow";
        }
        let tagFly = null;
        TAGS.forEach((tg, i) => {
          const t0 = TAG_AT + STEP * i;
          if (t < t0 || t >= t0 + STEP) return;
          cat.armRot = path(t, [[t0 + 0.25, -0.15], [t0 + THROW, -1.4, "out"], [t0 + THROW + 0.25, -1.4], [t0 + THROW + 0.55, -0.15, "io"]]);
          if (t < t0 + THROW) cat.hold = () => piece("name_tag", 0, { ax: 6.2, ay: 0.5 });
          const s = tagState(i, t);
          if (s > 0 && s < 1) tagFly = { i, s };
          if (t >= t0 + THROW + FLY && t < t0 + STEP - 0.1) cat.head = "s_head_happy_bow";
        });
        if (t >= TAGS_END && t < TAGS_END + 0.8) {
          cat.head = "s_head_happy_bow";
          cat.hop = jump(t, TAGS_END, 0.45, 3);
        }
        if (t >= GO) {
          cat.x = catFoot - 20;
          if (!paused(t) && cat.x < EXIT_X) walkPose(cat, (pc(t) - GO) * Math.PI * 3.6, 1);
        }
        let sqTagFly = -1;
        if (paused(t)) {
          // 低頭看攤位底下，手往下伸把名牌塞過去
          cat.headRot = tw(t, P0, P0 + 0.3, 0, 0.25, "io") * tw(t, P1 - 0.3, P1, 1, 0, "io");
          cat.armRot = path(t, [[P0, -0.15], [P0 + 0.35, 1.0, "out"], [TAG_SQ_HIT + 0.2, 1.0], [P1 - 0.2, -0.15, "io"]]);
          if (t < TAG_SQ) cat.hold = () => piece("name_tag", 0, { ax: 6.2, ay: 0.5 });
          if (t >= TAG_SQ && t < TAG_SQ_HIT) sqTagFly = (t - TAG_SQ) / (TAG_SQ_HIT - TAG_SQ);
          if (t >= TAG_SQ_HIT) cat.head = "s_head_happy_bow";
        }
        drawCat(cat);

        FRONT_ROW.forEach((kd) => drawAnimal(kd === "rb" ? rb : old[kd]));
        FRONT_ROW.forEach((kd) => tagOn(kd === "rb" ? rb : old[kd], kd, OLD_TAG[kd]));
        drawAnimal(yn);

        // 掛好的名牌（跟著脖子走）
        TAGS.forEach((tg, i) => {
          if (tagState(i, t) < 1) return;
          const st = rigs[tg.kind];
          const n = rigToWorld(st, RIG[tg.kind].neck);
          const t1 = tagHit(i);
          const sw = Math.sin((t - t1) * 8) * 0.25 * Math.max(0, 1 - (t - t1) / 1.5);
          piece("name_tag", sw, { ax: n[0], ay: n[1], scale: tg.scale * (1 + pop(t, t1, 0.3, 0.5)) });
        });
        if (tagFly) {
          const hx = cat.x + 20 + Math.cos(-1.4) * 6.2;
          const hy = cat.y + 19 + Math.sin(-1.4) * 6.2;
          const tg = TAGS[tagFly.i];
          const n = rigToWorld(rigs[tg.kind], RIG[tg.kind].neck);
          const u = tagFly.s;
          const arc = 6 + Math.abs(n[0] - hx) * 0.12;
          piece("name_tag", u * 8, { ax: hx + (n[0] - hx) * u, ay: hy + (n[1] - hy) * u - Math.sin(u * Math.PI) * arc });
        }
        if (sqTagFly >= 0) {
          // 從往下伸的手（約 1.0 rad）滑到攤位底下魷魚的脖子
          const hx = cat.x + 20 + Math.cos(1.0) * 6.2;
          const hy = cat.y + 19 + Math.sin(1.0) * 6.2;
          const n = rigToWorld(sq, RIG.sd.neck);
          const u = sqTagFly;
          piece("name_tag", u * 3, { ax: hx + (n[0] - hx) * u, ay: hy + (n[1] - hy) * u - Math.sin(u * Math.PI) * 2, scale: 0.85 });
        }

        // ---- 特效 ----
        // 翻面的瞬間：魷魚冒冷汗
        if (onGrill && t >= FLIP[1]) {
          for (let j = 0; j < 3; j++) {
            const u = (t * 1.6 + j / 3) % 1;
            piece("sweat", 0, { ax: STALL_X - 4 + j * 4, ay: GRILL_Y - 5 - u * 3, scale: 0.5 * (1 - u) });
          }
        }
        // 芝麻狗的口水
        if (t < GO) {
          const m = rigToWorld(dg, [24.6, 9.6]);
          const u = (t * 0.9) % 1;
          piece("sweat", 0, { ax: m[0], ay: m[1] + u * 4, scale: 0.55 * (1 - u * 0.5) });
        }
        // 狐狸、狗狗看到奇怪的隊伍、發現烤網空了都冒問號
        const qs = [];
        if (t >= WALK_IN + 0.2 && t < TAG_AT) qs.push(dg, yn);
        if (t >= ESC + 0.8 && t < GO) qs.push(fox);
        qs.forEach((st, n) => {
          const h = rigToWorld(st, HEAD_TOP[st.kind]);
          piece("question", Math.sin(t * 5 + n) * 0.15, { ax: h[0], ay: h[1] - 3, scale: 0.8 + pop(t, WALK_IN + 0.2, 0.3, 0.5) });
        });
        // 被燙到的熱氣
        // 魷魚舉著金幣跑（金幣在頭頂上晃）
        if (coinRun && coinRun.coin) {
          const h = rigToWorld(sq, [8, -1]);
          piece("coin", Math.sin(t * 12) * 0.2, { ax: h[0], ay: h[1] - Math.abs(Math.sin(t * 9)) * 0.8, scale: 1.1 });
          if (sqRun < 1.3) piece("sparkle", 0, { ax: h[0] + 3, ay: h[1] - 6, scale: Math.sin(((sqRun - 0.85) / 0.45) * Math.PI) * 1.4 });
        }
        if (sqRun > 1.4 && sqRun < 3.5) {
          const u = (sqRun * 3) % 1;
          piece("dust", 0, { ax: sq.fx - 6 - u * 6, ay: GROUND - 6 - u * 3, scale: 0.5 * (1 - u) });
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
        if (t >= TAG_SQ_HIT - 0.05 && t < P1 + 0.4) {
          const s = tw(t, TAG_SQ_HIT - 0.05, TAG_SQ_HIT + 0.15, 0, 1, "back") * tw(t, P1 + 0.2, P1 + 0.4, 1, 0, "in");
          piece("cap_eden", 0, { ax: 64, ay: 59, scale: s * 0.9 });
        }
      }

      (window.EPISODES = window.EPISODES || []).push({ no: 5, title: '第五集', render, duration: DUR });
    })();
