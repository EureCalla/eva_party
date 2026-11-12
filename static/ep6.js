// 預告片第六集：由 tools/build_trailer.py 從 video/compositions/ep6.html 產生，請勿手改
// 角色零件沿用 sprites.js 的 SPRITES / PAL；登記到 window.EPISODES = [{ no, title, render(t), duration }]
(function () {
      // 下方 SPRITES 區塊由 video/design/export_pieces.py 自動產生
      

      // 第六集（翅膀組）：小企鵝 Tiffany 和仙鶴 Calla 圍著一顆蛋看 → 特寫：小雞 Sally 頂著半片蛋殼孵出來
      // → 大家拍翅膀歡呼，把樹上睡覺的貓頭鷹 Jade 吵醒 → 小貓帶前五集的朋友走進來（後遺症照舊，
      // 狐狸手上拿著搶回來的金幣，魷魚很憂鬱）→ 發名牌 → 大家跟著隊伍往前走，貓頭鷹飛在上方打瞌睡
      const DUR = 36;
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
        ck: { w: 12, h: 12, foot: 6, neck: [7, 7] },
        pg: { w: 14, h: 18, foot: 7, neck: [8, 8] },
        cr: { w: 32, h: 50, foot: 14, neck: [19, 27] },
        ow: { w: 14, h: 16, foot: 7, neck: [7, 10] },
      };
      // 冒暈眩星星的位置（角色框座標）
      const HEAD_TOP = { sh: [20, 3], gt: [8, 8], ln: [24, 2], br: [22, 2], rb: [7, 6], fx: [10, 1], yn: [15, 1], dg: [21, 3], ck: [7, 1], pg: [8, 1], cr: [25, 2], ow: [7, 0] };
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
          // 象鼻舉高（-2.5 rad）；第六集撿到小雞的蛋殼就頂在鼻尖上（鼻尖相對於關節 4.5,19，轉回正）
          piece("el_trunk", -2.5, st.shell ? { after: () => piece("egg6_bottom", 2.5, { ax: 4.5, ay: 19, scale: 1.2 * (1 + pop(st.t || 0, st.shell, 0.3, 0.4)) }) } : undefined);
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
          const after = st.prop === "fan" ? () => piece("fan", 0.3, { ax: 4, ay: 2 }) : st.prop === "tongs" ? () => piece("tongs", 0.25, { ax: 3.6, ay: 2.4 }) : st.prop === "coin" ? () => piece("coin", 1.0, { ax: 4.6, ay: 3.4, scale: 1.1 }) : null;
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
        ck: (st) => {
          piece("ck_body", 0);
          // 頭上頂著半片蛋殼（座標相對於頭的關節 6.5,7）
          const after = st.shell ? () => piece("egg6_top", -0.15, { ax: 0, ay: -5.2, scale: 1.0 }) : null;
          piece("ck_head_" + (st.face || "open"), st.headRot || 0, { after });
        },
        pg: (st) => {
          piece("pg_body", 0);
          piece("pg_head_" + (st.face || "open"), st.headRot || 0);
          piece("pg_flipper", st.flap || 0.15);
        },
        cr: (st) => {
          // 鳥只有兩隻腳：遠側那隻畫在身體後面，兩隻反向擺動
          piece("cr_leg_far", -(st.leg || 0));
          piece("cr_body", 0);
          piece("cr_wing", st.flap || 0);
          piece("cr_leg", st.leg || 0);
          piece("cr_neck_" + (st.face || "open"), st.headRot || 0);
        },
        ow: (st) => {
          // 貓頭鷹的臉：sleep／awake／grumpy／happy（一般的 open 當成沒睡飽）
          const face = st.face === "open" ? "grumpy" : st.face === "dizzy" ? "awake" : st.face;
          if (st.fly) piece("ow_wing_spread", st.flap || 0);
          piece("ow_body", 0);
          if (!st.fly) piece("ow_wing", 0);
          piece("ow_head_" + face, st.headRot || 0);
          if (st.fly) piece("ow_wing_spread", -(st.flap || 0) * 0.6);
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
      // 第四集打架後的四隻還是放大兩倍（BIG），後遺症照舊：山羊頭卡在羊毛裡、獅子爆炸頭、棕熊頭上腫包
      const BIG = 2;
      const STUCK = 17 * BIG;
      const WOOL_MAX = 1.55;
      // 開場：小企鵝和仙鶴圍著一顆蛋看 → 特寫：蛋裂開，小雞頂著半片蛋殼孵出來 → 拉遠大家拍翅膀歡呼
      // → 樹上睡覺的貓頭鷹被吵醒
      const EGG_X = 200;
      const PG_X = 184;
      const CR_X = 222;
      const TREE_X = 262;
      const OW_X = 244; // 貓頭鷹站在樹枝上
      const OW_Y = GROUND - 27;
      const CLOSE_IN = [2.4, 3.0];
      const CRACK = 3.6;
      const HATCH = 4.6;
      const CLOSE_OUT = [6.2, 6.8];
      const CHEER = [6.5, 7.7];
      const OW_WAKE = 7.2;
      const OW_GRUMPY = 8.0;
      // 隊伍：小貓帶頭，前五集的朋友跟在後面走進來（停下來時的腳底 x，左邊幾隻停在畫面外）
      const CAT_X = 60;
      const CAT_FOOT = CAT_X + 20;
      const WALK0 = 9.2;
      const WALK_IN = 15.2;
      const HOME = {
        pair: 40, ln: -60, br: -120, sn: -170, el: -225, gf: -265, dg: -300, fx: -330, // 後排（pair 以山羊的腳底為準）
        rb: 30, sq: 10, gp: -6, hm: -22, qk: -38, ot: -58, mk: -78, yn: -96, sd: -116, // 前排
      };
      const BACK_ROW = ["gf", "el"];
      const FRONT_ROW = ["mk", "ot", "qk", "hm", "gp", "sq", "rb", "yn"];
      const OLD_TAG = { el: 1, gf: 1, ot: 1, mk: 1, sn: 1, sq: 0.85, gp: 0.8, hm: 0.75, qk: 0.85, sh: 1.4, gt: 1.4, ln: 1.4, br: 1.4, rb: 0.75, fx: 1, yn: 0.85, dg: 1.2, sd: 0.7 };
      const DG_K = 1.3;
      const SQ_K = 0.85;

      // 公布名字：每隻 1.8 秒，依序是小企鵝、仙鶴、小雞、貓頭鷹
      const TAG_AT = 16.0;
      const STEP = 1.8;
      const TAGS = [
        { kind: "pg", cap: "cap_tiffany", focus: [184, 48], scale: 0.85 },
        { kind: "cr", cap: "cap_calla", focus: [216, 36], scale: 1.3 },
        { kind: "ck", cap: "cap_sally", focus: [200, 54], scale: 0.6 },
        { kind: "ow", cap: "cap_jade", focus: [236, 32], scale: 0.7 },
      ];
      const THROW = 0.55;
      const FLY = 0.45;
      const tagHit = (i) => TAG_AT + STEP * i + THROW + FLY;
      const TAGS_END = TAG_AT + STEP * TAGS.length;

      // 遊行：小貓帶頭，大家用同樣的速度排成兩列跟上（GAP 是腳底落後小貓腳底多少格）。
      // 新加入的四隻排最前面；貓頭鷹飛在隊伍上方，邊飛邊打瞌睡
      const GO = TAGS_END + 1.2;
      const V = 70;
      const FOOT0 = Object.assign({ ck: EGG_X, pg: PG_X, cr: CR_X, ow: OW_X }, HOME);
      const GAP = {
        cr: 50, pair: 96, ln: 186, br: 242, sn: 292, el: 352, gf: 394, dg: 430, fx: 458, // 後排
        ck: 20, pg: 40, rb: 62, sq: 82, gp: 100, hm: 116, qk: 132, ot: 152, mk: 174, yn: 196, sd: 218, // 前排
        ow: 36, // 天上
      };
      const START = {};
      Object.keys(GAP).forEach((kd) => (START[kd] = GO + (FOOT0[kd] + GAP[kd] - CAT_FOOT) / V));
      const EXIT_X = GW + 44;

      function paradeFoot(kind, t) {
        return t < START[kind] ? null : FOOT0[kind] + V * (t - START[kind]);
      }
      function walking(kind, t) {
        const f = paradeFoot(kind, t);
        return f !== null && f < EXIT_X + 30 ? t - START[kind] : -1;
      }
      function tagState(i, t) {
        const t0 = TAG_AT + STEP * i + THROW;
        return t < t0 ? 0 : tw(t, t0, t0 + FLY, 0, 1, "lin");
      }
      function stride(st, w, n) {
        const kd = st.kind;
        const ph = w * Math.PI * (kd === "el" ? 3 : 3.4) + (n || 0);
        st.hop = Math.abs(Math.sin(ph)) * (kd === "el" ? 0.8 : kd === "gf" || kd === "cr" ? 1.2 : st.k ? 2.4 : 2);
        if (kd === "el" || kd === "gf" || kd === "cr") st.leg = Math.sin(ph) * (kd === "el" ? 0.25 : 0.3);
        if (kd === "pg") st.rot = Math.sin(ph) * 0.18; // 小企鵝搖搖擺擺
        st.face = "happy";
      }

      function render(t) {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.imageSmoothingEnabled = false;
        ctx.fillStyle = "#1A1420";
        ctx.fillRect(0, 0, 1920, 1080);
        meadow(t);

        // 鏡頭：蛋和圍觀的兩隻 → 推到蛋的特寫看小雞孵出來 → 拉遠歡呼 → 轉到樹上被吵醒的貓頭鷹
        // → 往左看隊伍走進來 → 依序對準拿名牌的 → 遊行時跟著小貓走到最右邊，看大家一隻隻走過去
        const camKeys = {
          x: [[0, 212], [CLOSE_IN[0], 212], [CLOSE_IN[1], EGG_X, "io"], [CLOSE_OUT[0], EGG_X], [CLOSE_OUT[1], 212, "io"],
            [OW_WAKE - 0.2, 212], [OW_WAKE + 0.4, 236, "io"], [OW_GRUMPY + 0.6, 236], [OW_GRUMPY + 1.2, 212, "io"],
            [WALK0 + 1.4, 212], [WALK0 + 2.3, 64, "io"], [WALK_IN, 92, "lin"], [WALK_IN + 0.9, 140, "io"]],
          y: [[0, 42], [CLOSE_IN[0], 42], [CLOSE_IN[1], GROUND - 9, "io"], [CLOSE_OUT[0], GROUND - 9], [CLOSE_OUT[1], 40, "io"],
            [OW_WAKE - 0.2, 40], [OW_WAKE + 0.4, 32, "io"], [OW_GRUMPY + 0.6, 32], [OW_GRUMPY + 1.2, 40, "io"], [WALK0 + 1.4, 40], [WALK0 + 2.3, 36, "io"]],
          z: [[0, 1.25], [CLOSE_IN[0], 1.25], [CLOSE_IN[1], 2.8, "io"], [CLOSE_OUT[0], 2.8], [CLOSE_OUT[1], 1.25, "io"],
            [OW_WAKE - 0.2, 1.25], [OW_WAKE + 0.4, 1.9, "io"], [OW_GRUMPY + 0.6, 1.9], [OW_GRUMPY + 1.2, 1.25, "io"], [WALK0 + 1.4, 1.25], [WALK0 + 2.3, 1, "io"]],
        };
        const ZOOM = 1.25;
        TAGS.forEach((tg, i) => {
          const t0 = TAG_AT + STEP * i;
          const prev = i ? TAGS[i - 1].focus : [140, 36];
          camKeys.x.push([t0, prev[0]], [t0 + 0.6, tg.focus[0], "io"]);
          camKeys.y.push([t0, prev[1]], [t0 + 0.6, tg.focus[1], "io"]);
          camKeys.z.push([t0, i ? ZOOM : 1], [t0 + 0.6, ZOOM, "io"]);
        });
        const last = TAGS[TAGS.length - 1].focus;
        camKeys.x.push([TAGS_END, last[0]], [TAGS_END + 0.8, 170, "io"]);
        camKeys.y.push([TAGS_END, last[1]], [TAGS_END + 0.8, 36, "io"]);
        camKeys.z.push([TAGS_END, ZOOM], [TAGS_END + 0.8, 1, "io"]);
        const cam = { x: path(t, camKeys.x), y: path(t, camKeys.y), z: path(t, camKeys.z) };
        if (t >= GO) cam.x = tw(t, GO, GO + 0.8, 170, Math.max(170, CAT_FOOT + V * (t - GO) + 20), "io");
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
            st.face = st.kind === "sd" ? "sad" : "happy";
            st.hop = (st.hop || 0) + jump(t, TAGS_END + (n || 0) * 0.04, 0.45, st.k && st.k > 1.5 ? 5 : 3);
          }
        };
        const arrive = t >= WALK_IN && t < WALK_IN + 0.5;

        // ---- 隊伍走進來：整隊跟著小貓平移 ----
        const catX = tw(t, WALK0, WALK_IN, -70, CAT_X, "lin");
        const off = catX - CAT_X;
        const walkingIn = t > WALK0 && t < WALK_IN;
        const old = {};
        ["gf", "el", "mk", "ot", "qk", "hm", "gp", "sq", "dg", "fx", "yn", "sd"].forEach((kd, n) => {
          const st = { kind: kd, fx: HOME[kd] + off, face: "open", headRot: Math.sin(t * 1.5 + HOME[kd]) * 0.03 };
          if (FRONT_ROW.includes(kd) || kd === "sd") st.fy = FRONT;
          if (kd === "el") st.ear = Math.sin(t * 2.2) * 0.06;
          if (kd === "sq") st.tail = Math.sin(t * 6) * 0.2;
          if (kd === "dg") st.k = DG_K;
          if (kd === "sd") st.k = SQ_K;
          if (walkingIn) stride(st, t - WALK0, n);
          const pf = paradeFoot(kd, t);
          let tripping = false;
          if (pf !== null) {
            st.fx = pf;
            st.face = "happy";
            const p0 = START[kd];
            if (kd === "qk") {
              // 矮袋鼠走沒幾步又絆倒（同第三集），爬起來快跑追上
              st.fx -= path(t, [[p0 + 0.5, 0], [p0 + 1.3, 26, "lin"], [p0 + 2.1, 0, "io"]]);
              st.rot = path(t, [[p0 + 0.5, 0], [p0 + 0.65, 1.45, "in"], [p0 + 1.1, 1.45], [p0 + 1.3, 0, "io"]]);
              tripping = t >= p0 + 0.5 && t < p0 + 1.3;
              if (tripping) st.face = "dizzy";
            }
            const w = walking(kd, t);
            if (w >= 0 && !tripping) stride(st, w, n);
          }
          if (kd === "fx") {
            // 狐狸把金幣搶回來了，舉在手上
            st.prop = "coin";
            st.armRot = -1.0 + Math.sin(t * 4) * 0.08;
          }
          if (kd === "sd") {
            // 魷魚很憂鬱：低著頭、垂頭喪氣地慢慢跳
            st.face = "sad";
            st.headRot = 0.12 + Math.sin(t * 1.3) * 0.03;
            st.hop = (st.hop || 0) * 0.35;
            st.sy = 0.92;
          }
          cheer(st, n);
          if (kd === "sd") st.face = "sad";
          old[kd] = st;
        });
        // 大象經過蛋的位置時用鼻子把小雞留下的下半片蛋殼撿起來，一路頂在鼻尖上
        const elf = paradeFoot("el", t);
        const SHELL_PICK = START.el + (EGG_X - 26 - HOME.el) / V;
        const shellTaken = elf !== null && t >= SHELL_PICK;
        if (shellTaken) {
          old.el.shell = SHELL_PICK;
          old.el.t = t;
        }
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
        goat.hop = Math.abs(Math.sin(t * 18)) * 1.2;
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
        if (!walkingIn && t < GO) {
          lion.headRot = -0.15 + Math.sin(t * 2) * 0.03;
          bear.headRot = -0.15;
        }
        cheer(sheep, 0);

        // ---- 翅膀組 ----
        const pg = { kind: "pg", fx: PG_X, fy: FRONT, face: "open", headRot: 0.15 };
        const cr = { kind: "cr", fx: CR_X, sx: -1, face: "open", headRot: 0.25 };
        const ck = { kind: "ck", fx: EGG_X, fy: GROUND + 1, face: "open", shell: t >= HATCH + 0.5 };
        const ow = { kind: "ow", fx: OW_X, fy: OW_Y, face: "sleep" };
        // 圍著蛋看：探頭探腦
        if (t < CHEER[0]) {
          pg.headRot = 0.15 + Math.sin(t * 2.2) * 0.08;
          cr.headRot = 0.3 + Math.sin(t * 1.7) * 0.08;
          pg.rot = Math.sin(t * 2.2) * 0.05;
        }
        // 小雞從蛋裡冒出來
        if (t >= HATCH) {
          ck.sy = tw(t, HATCH, HATCH + 0.4, 0.3, 1, "back");
          ck.fy = tw(t, HATCH, HATCH + 0.4, GROUND + 4, GROUND + 1, "out");
          if (t >= HATCH + 0.9 && t < HATCH + 1.05) ck.face = "happy"; // 眨眼
          if (t >= HATCH + 1.4) ck.face = "happy";
          ck.headRot = Math.sin(t * 3) * 0.08;
        }
        // 拍翅膀歡呼
        if (t >= CHEER[0] && t < CHEER[1]) {
          const u = t - CHEER[0];
          pg.flap = -0.9 - Math.sin(u * 22) * 0.7;
          cr.flap = -0.7 - Math.sin(u * 16) * 0.6;
          pg.hop = Math.abs(Math.sin(u * 9)) * 3;
          cr.hop = Math.abs(Math.sin(u * 7)) * 3;
          ck.hop = Math.abs(Math.sin(u * 10)) * 1.5;
          pg.face = cr.face = ck.face = "happy";
          pg.headRot = cr.headRot = -0.1;
        }
        // 貓頭鷹被吵醒：嚇得跳起來、羽毛炸開 → 沒睡飽的臭臉
        if (t >= OW_WAKE) {
          ow.face = t < OW_GRUMPY ? "awake" : "grumpy";
          ow.hop = jump(t, OW_WAKE, 0.35, 3);
          ow.sx = 1 + pop(t, OW_WAKE, 0.25, 0.5);
          ow.sy = 1 + pop(t, OW_WAKE, 0.25, 0.5);
        }
        if (arrive) [pg, cr, ck].forEach((st, n) => (st.hop = (st.hop || 0) + jump(t, WALK_IN + n * 0.05, 0.4, 2.5)));
        const rigs = { pg, cr, ck, ow };
        TAGS.forEach((tg, i) => {
          const st = rigs[tg.kind];
          const t0 = tagHit(i);
          if (t < t0) return;
          st.face = "happy";
          if (t < t0 + 1.0) st.hop = (st.hop || 0) + jump(t, t0, 0.4, 3);
        });
        [pg, cr, ck, ow].forEach((st, n) => cheer(st, n));
        // 遊行
        [["pg", pg], ["cr", cr], ["ck", ck]].forEach(([kd, st], n) => {
          const pf = paradeFoot(kd, t);
          if (pf === null) return;
          st.fx = pf;
          st.sx = 1;
          st.fy = kd === "cr" ? GROUND : FRONT;
          st.headRot = 0;
          const w = walking(kd, t);
          if (w >= 0) stride(st, w, n);
        });
        // 貓頭鷹飛下來，在隊伍上方邊飛邊打瞌睡
        const owf = paradeFoot("ow", t);
        if (owf !== null) {
          const w = t - START.ow;
          ow.fx = owf;
          ow.fy = tw(w, 0, 0.6, OW_Y, 30, "io") + Math.sin(w * 5) * 1.5;
          ow.fly = true;
          ow.flap = Math.sin(w * 14) * 0.6;
          ow.face = Math.floor(w / 0.9) % 2 ? "sleep" : "grumpy";
          ow.headRot = Math.sin(w * 2) * 0.15;
          ow.hop = 0;
        }

        // ---- 畫：樹 → 後排 → 小貓 → 前排 → 天上 ----
        const tagOn = (st, kd, scale) => {
          const n = kd === "sn" ? snakeNeck(sn) : rigToWorld(st, RIG[st.kind].neck);
          piece("name_tag", Math.sin(t * 3 + (HOME[kd] || 0)) * 0.06 + (st && st.rot ? st.rot * 0.5 : 0), { ax: n[0], ay: n[1], scale });
        };
        piece("tree", 0, { ax: TREE_X, ay: GROUND });
        if (!ow.fly) drawAnimal(ow);
        BACK_ROW.forEach((kd) => drawAnimal(old[kd]));
        BACK_ROW.forEach((kd) => tagOn(old[kd], kd, OLD_TAG[kd]));
        drawSnake(sn);
        tagOn(null, "sn", OLD_TAG.sn);
        drawAnimal(cr);
        drawAnimal(lion);
        drawAnimal(bear);
        drawAnimal(old.dg);
        drawAnimal(old.fx);
        drawAnimal(goat);
        drawAnimal(sheep);
        [["ln", lion], ["br", bear], ["gt", goat], ["sh", sheep], ["dg", old.dg], ["fx", old.fx]].forEach(([kd, st]) => tagOn(st, kd, OLD_TAG[kd]));

        // ---- 小貓：帶隊走進來 → 拋名牌 → 帶頭走出畫面 ----
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
          cat.x = CAT_X + V * (t - GO);
          if (cat.x < EXIT_X) walkPose(cat, (t - GO) * Math.PI * 3.6, 1);
        }
        drawCat(cat);

        FRONT_ROW.forEach((kd) => drawAnimal(kd === "rb" ? rb : old[kd]));
        FRONT_ROW.forEach((kd) => tagOn(kd === "rb" ? rb : old[kd], kd, OLD_TAG[kd]));
        drawAnimal(old.sd);
        tagOn(old.sd, "sd", OLD_TAG.sd);
        // 憂鬱的魷魚頭上一直跟著一朵小烏雲
        const gh = rigToWorld(old.sd, [8, 0]);
        piece("gloom", 0, { ax: gh[0] + Math.sin(t * 1.5) * 0.6, ay: gh[1] - 5 + Math.sin(t * 2) * 0.5, scale: 0.8 });
        const drop = (t * 1.4) % 1;
        piece("sweat", 0, { ax: gh[0] - 1.5, ay: gh[1] - 2 + drop * 3, scale: 0.4 * (1 - drop) });
        piece("sweat", 0, { ax: gh[0] + 1.5, ay: gh[1] - 2 + ((drop + 0.5) % 1) * 3, scale: 0.4 * (1 - ((drop + 0.5) % 1)) });

        // 蛋：整顆在晃 → 裂開 → 上半蛋殼彈起來蓋到小雞頭上，下半蛋殼留在地上
        if (t < HATCH) {
          const wob = t < CRACK ? Math.sin(t * 9) * 0.08 * (t > 1 ? 1 : 0.4) : Math.sin(t * 22) * 0.16;
          piece(t < CRACK ? "egg6_whole" : "egg6_crack", wob, { ax: EGG_X, ay: GROUND, scale: 1.3 });
          drawAnimal(pg);
        } else {
          // 小雞站在下半蛋殼裡（蛋殼畫在前面），出發時才走出來
          drawAnimal(pg);
          drawAnimal(ck);
          if (!shellTaken) piece("egg6_bottom", 0, { ax: EGG_X, ay: GROUND, scale: 1.3 });
        }
        if (t >= HATCH && t < HATCH + 0.5) {
          // 上半蛋殼彈到半空，再落到小雞頭上（之後由小雞的頭帶著）
          const u = (t - HATCH) / 0.5;
          const h = rigToWorld(ck, [6.5, 1.2]);
          piece("egg6_top", u * Math.PI * 2, { ax: EGG_X + (h[0] - EGG_X) * u, ay: GROUND - 8 + (h[1] - GROUND + 8) * u - Math.sin(u * Math.PI) * 8, scale: 1.0 });
        }
        if (ow.fly) drawAnimal(ow);

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
          const hx = cat.x + 20 + Math.cos(-1.4) * 6.2;
          const hy = cat.y + 19 + Math.sin(-1.4) * 6.2;
          const tg = TAGS[tagFly.i];
          const n = rigToWorld(rigs[tg.kind], RIG[tg.kind].neck);
          const u = tagFly.s;
          const arc = 6 + Math.abs(n[0] - hx) * 0.12;
          piece("name_tag", u * 8, { ax: hx + (n[0] - hx) * u, ay: hy + (n[1] - hy) * u - Math.sin(u * Math.PI) * arc });
        }

        // ---- 特效 ----
        // 貓頭鷹睡覺冒 Z、飛的時候也在打瞌睡
        if (t < OW_WAKE || (ow.fly && ow.face === "sleep")) {
          const h = rigToWorld(ow, HEAD_TOP.ow);
          for (let i = 0; i < 2; i++) {
            const u = (t * 0.7 + i * 0.5) % 1;
            piece("zzz", 0, { ax: h[0] + 3 + u * 4, ay: h[1] - 2 - u * 6, scale: 0.5 + u * 0.4 });
          }
        }
        // 被吵醒：羽毛炸開
        if (t >= OW_WAKE && t < OW_WAKE + 0.8) {
          const u = (t - OW_WAKE) / 0.8;
          for (let i = 0; i < 5; i++) {
            const a = -Math.PI * 0.1 - i * 0.7;
            piece("dust", 0, { ax: OW_X + Math.cos(a) * u * 9, ay: OW_Y - 8 + Math.sin(a) * u * 7, scale: 0.35 * (1 - u) });
          }
        }
        // 大象撿起蛋殼的瞬間閃一下
        if (shellTaken && t < SHELL_PICK + 0.5) {
          const u = (t - SHELL_PICK) / 0.5;
          piece("sparkle", 0, { ax: EGG_X, ay: GROUND - 8 - u * 10, scale: Math.sin(u * Math.PI) * 1.6 });
        }
        // 小雞孵出來：冒愛心
        if (t >= HATCH + 0.6 && t < HATCH + 2.0) {
          const u = (t - HATCH - 0.6) / 1.4;
          const h = rigToWorld(ck, HEAD_TOP.ck);
          piece("heart", Math.sin(t * 6) * 0.2, { ax: h[0] + 4, ay: h[1] - 4 - u * 6, scale: Math.sin(u * Math.PI) * 1.2 });
        }
        // 歡呼：頭上冒星星
        if (t >= CHEER[0] && t < CHEER[1]) {
          [pg, cr].forEach((st, n) => {
            const h = rigToWorld(st, HEAD_TOP[st.kind]);
            const u = ((t - CHEER[0]) * 2 + n * 0.5) % 1;
            piece("sparkle", 0, { ax: h[0] + (n ? -4 : 4), ay: h[1] - 3 - u * 4, scale: Math.sin(u * Math.PI) * 1.4 });
          });
        }
        // 新角色看到奇怪的隊伍冒問號
        if (t >= WALK_IN + 0.2 && t < TAG_AT) {
          [pg, cr, ck].forEach((st, n) => {
            const h = rigToWorld(st, HEAD_TOP[st.kind]);
            piece("question", Math.sin(t * 5 + n) * 0.15, { ax: h[0], ay: h[1] - 3, scale: 0.8 + pop(t, WALK_IN + 0.2, 0.3, 0.5) });
          });
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

      (window.EPISODES = window.EPISODES || []).push({ no: 6, title: '第六集', render, duration: DUR });
    })();
