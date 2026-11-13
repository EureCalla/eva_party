// 預告片第七集：由 tools/build_trailer.py 從 video/compositions/ep7.html 產生，請勿手改
// 角色零件沿用 sprites.js 的 SPRITES / PAL；登記到 window.EPISODES = [{ no, title, render(t), duration }]
(function () {
      // 下方 SPRITES 區塊由 video/design/export_pieces.py 自動產生
      

      // 第七集（慢吞吞的臭頭樹懶）：水豚 Uma 頭頂橘子泡溫泉、迷你豬 Bella 在泥巴坑打滾、青蛙 Eli 在荷葉上跳
      // → 樹上倒掛的樹懶 Yoga 頭髮好臭、超慢地下樹 → 青蛙伸舌頭黏蒼蠅碰到頭髮，臭氣爆開 → 小貓帶前六集的朋友
      // 走進來被臭得後退一步 → 發名牌（樹懶手伸太慢，第一次沒接到）→ 大家都超過慢吞吞的樹懶，仙鶴看不下去飛回來把牠叼走
      const DUR = 45;
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
        cb: { w: 26, h: 18, foot: 11, neck: [17, 10] },
        pi: { w: 18, h: 14, foot: 8, neck: [12, 9] },
        fr: { w: 12, h: 10, foot: 5, neck: [6, 7] },
        sl: { w: 26, h: 20, foot: 12, neck: [17, 11] },
      };
      // 冒暈眩星星的位置（角色框座標）
      const HEAD_TOP = { sh: [20, 3], gt: [8, 8], ln: [24, 2], br: [22, 2], rb: [7, 6], fx: [10, 1], yn: [15, 1], dg: [21, 3], ck: [7, 1], pg: [8, 1], cr: [25, 2], ow: [7, 0], cb: [19, 3], pi: [13, 3], fr: [7, 1], sl: [19, 1] };
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
        cb: (st) => {
          piece("cb_body", 0);
          // 頭上頂著橘子（座標相對於頭的關節 17.5,10）
          const after = st.orange ? () => piece("orange", 0.1, { ax: 2.4, ay: -6.6 }) : null;
          piece("cb_head_" + (st.face || "open"), st.headRot || 0, { after });
        },
        pi: (st) => {
          piece("pi_body", 0);
          piece("pi_head_" + (st.face || "open"), st.headRot || 0);
        },
        fr: (st) => {
          piece("fr_body", 0);
          piece("fr_head_" + (st.face || "open"), st.headRot || 0);
        },
        sl: (st) => {
          // 樹懶：遠側的手腳畫在身體後面；armRot 是近側那隻手（掛名牌的那隻）
          piece("sl_leg_far", -(st.leg || 0));
          piece("sl_arm_far", st.armFar !== undefined ? st.armFar : -(st.leg || 0));
          piece("sl_body", 0);
          piece("sl_leg", st.leg || 0);
          piece("sl_head_" + (st.face || "open"), st.headRot || 0);
          piece("sl_arm", st.armRot !== undefined ? st.armRot : st.leg || 0);
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

      // ---------- 場景：泥巴坑、溫泉、池塘（畫在世界畫布上） ----------
      function oval(cx, cy, rx, ry, c) {
        for (let y = Math.ceil(cy - ry); y <= Math.floor(cy + ry); y++) {
          const w = Math.round(rx * Math.sqrt(Math.max(0, 1 - ((y - cy) / ry) ** 2)));
          R(cx - w, y, w * 2 + 1, 1, c);
        }
      }
      function scenery(t) {
        oval(MUD_X, GROUND + 3, 14, 2.6, "#804A34");
        oval(MUD_X - 1, GROUND + 3, 10, 1.6, "#6B4226");
        [[-8, 2], [5, 3], [10, 2], [-3, 4]].forEach(([dx, dy]) => R(MUD_X + dx, GROUND + dy, 1, 1, "#382A28"));
        // 溫泉池的水面（前緣的石頭另外畫在水豚前面）
        oval(SPRING_X, GROUND - 3, 17, 3, "#96CEE8");
        R(SPRING_X - 9, GROUND - 4, 3, 1, "#FFFFFF");
        R(SPRING_X + 6, GROUND - 3, 2, 1, "#FFFFFF");
        oval(POND_X, GROUND + 3, 20, 3.6, "#5B98D6");
        oval(POND_X, GROUND + 3, 17, 2.4, "#BFDDF5");
        const s = Math.floor(t * 2) % 2; // 水面的波光
        R(POND_X - 11 + s, GROUND + 3, 3, 1, "#FFFFFF");
        R(POND_X + 7 - s, GROUND + 4, 2, 1, "#FFFFFF");
      }
      // 畫一條 1 格粗的像素線（青蛙的舌頭）
      function pixLine(x0, y0, x1, y1, c) {
        const n = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))));
        ctx.fillStyle = c;
        for (let i = 0; i <= n; i++) ctx.fillRect(Math.round(x0 + ((x1 - x0) * i) / n), Math.round(y0 + ((y1 - y0) * i) / n), 1, 1);
      }
      // 零件上的點跟著零件繞自己的關節轉 rot 之後的位置（角色框座標）
      function rotAbout(p, c, rot) {
        const dx = p[0] - c[0];
        const dy = p[1] - c[1];
        return [c[0] + dx * Math.cos(rot) - dy * Math.sin(rot), c[1] + dx * Math.sin(rot) + dy * Math.cos(rot)];
      }

      // ---------- 時間軸 ----------
      // 第四集打架後的四隻還是放大兩倍（BIG），後遺症照舊：山羊頭卡在羊毛裡、獅子爆炸頭、棕熊頭上腫包
      const BIG = 2;
      const STUCK = 17 * BIG;
      const WOOL_MAX = 1.55;
      // 開場：池塘邊，水豚 Uma 頭頂橘子泡溫泉、迷你豬 Bella 在泥巴坑打滾、青蛙 Eli 在荷葉上跳
      const MUD_X = 146;
      const SPRING_X = 184;
      const POND_X = 222;
      const PADS = [210, 222, 234];
      const TREE_X = 262;
      const BRANCH_Y = 37;
      const TRUNK_X = TREE_X - 3;
      // 樹懶 Yoga 下樹：倒掛在樹枝上 → 慢慢伸一隻手 → 沿樹枝挪到樹幹 → 轉成頭下腳上抱著樹幹
      // → 一點一點滑下來 → 落地、轉身（倒掛和抱樹幹時 sx = -1，頭朝樹幹）
      const SL_REACH = [8.0, 11.0];
      const SL_SLIDE = [11.0, 13.0];
      const SL_TURN = [13.0, 16.0];
      const SL_DOWN = [16.0, 22.5];
      const SL_LAND = [22.5, 24.8];
      const SL_FACE = [24.8, 25.4];
      const SL_X = TRUNK_X - 8; // 落地後站的位置（腳底）
      // 青蛙伸舌頭去黏樹懶頭上的蒼蠅，碰到頭髮 → 臭氣爆開：青蛙翻肚昏倒、迷你豬停下來、水豚的橘子掉下來
      const TONGUE = [11.5, 11.8, 12.1]; // 伸出、碰到、收回
      const STINK = TONGUE[1];
      const FROG_FLIP = [12.3, 12.7];
      const PIG_SICK = 12.3;
      const ORANGE_FALL = [12.6, 13.2];
      // 隊伍：小貓帶頭，前六集的朋友跟在後面走進來，被臭得後退一步（停下來時的腳底 x，左邊幾隻停在畫面外）
      const CAT_X = 60;
      const STEP_BACK = 4;
      const CAT_FOOT = CAT_X + 20 - STEP_BACK; // 後退一步之後的腳底
      const WALK0 = 14.6;
      const WALK_IN = 19.0;
      const REACT = WALK_IN + 0.3;
      const HOME = {
        cr: 50, pair: 10, ln: -90, br: -150, sn: -200, el: -255, gf: -295, dg: -330, fx: -360, // 後排（pair 以山羊的腳底為準）
        ck: 40, pg: 26, rb: 10, sq: -10, gp: -26, hm: -42, qk: -58, ot: -78, mk: -98, yn: -116, sd: -136, // 前排
        ow: 30, // 天上
      };
      const OLD = ["gf", "el", "cr", "ln", "br", "dg", "fx", "mk", "ot", "qk", "hm", "gp", "sq", "rb", "yn", "sd", "pg", "ck"];
      const FRONT_KINDS = ["mk", "ot", "qk", "hm", "gp", "sq", "rb", "yn", "sd", "pg", "ck"];
      const HAS_DIZZY = ["br", "ck", "cr", "dg", "fx", "gp", "gt", "hm", "ln", "mk", "pg", "qk", "rb", "sh", "sq", "yn"];
      const OLD_TAG = { el: 1, gf: 1, ot: 1, mk: 1, sn: 1, sq: 0.85, gp: 0.8, hm: 0.75, qk: 0.85, sh: 1.4, gt: 1.4, ln: 1.4, br: 1.4, rb: 0.75, fx: 1, yn: 0.85, dg: 1.2, sd: 0.7, pg: 0.85, cr: 1.3, ck: 0.6, ow: 0.7 };
      const DG_K = 1.3;
      const SQ_K = 0.85;

      // 公布名字：每隻 1.8 秒，依序是水豚、迷你豬、青蛙；第四次拋給樹懶，牠手伸太慢沒接到，
      // 名牌打到頭掉在地上；第五次再拋，這次剛好掛在牠終於舉起來的爪子上
      const TAG_AT = 21.6;
      const STEP = 1.8;
      const TAGS = [
        { kind: "cb", cap: "cap_uma", focus: [SPRING_X, 50], scale: 1.0 },
        { kind: "pi", cap: "cap_bella", focus: [MUD_X, 54], scale: 0.75 },
        { kind: "fr", cap: "cap_eli", focus: [PADS[2], 56], scale: 0.6 },
        { kind: "sl", focus: [SL_X + 2, 50] },
        { kind: "sl", cap: "cap_yoga", focus: [SL_X + 2, 50], scale: 0.9 },
      ];
      const THROW = 0.55;
      const FLY = 0.45;
      const tagHit = (i) => TAG_AT + STEP * i + THROW + FLY;
      const YOGA_MISS = tagHit(3);
      const YOGA_HIT = tagHit(4);
      const SL_ARM = [TAG_AT + STEP * 3 + 0.6, TAG_AT + STEP * 3 + 3.2]; // 舉手（慢到第一次接不到）
      const TAGS_END = YOGA_HIT + 1.6;

      // 遊行：小貓帶頭，大家用同樣的速度排成兩列跟上（GAP 是腳底落後小貓腳底多少格）。
      // 新加入的三隻排最前面；樹懶慢慢爬，整個隊伍都超過牠，最後被遠遠甩在後面
      const GO = TAGS_END + 0.9;
      const V = 110;
      const FOOT0 = { cb: SPRING_X, pi: MUD_X, fr: PADS[2] };
      Object.keys(HOME).forEach((kd) => (FOOT0[kd] = HOME[kd] - STEP_BACK));
      const GAP = {
        cr: 50, cb: 84, pair: 140, ln: 230, br: 290, sn: 340, el: 400, gf: 442, dg: 478, fx: 506, // 後排
        fr: 18, pi: 38, ck: 60, pg: 76, rb: 96, sq: 116, gp: 134, hm: 150, qk: 166, ot: 186, mk: 208, yn: 230, sd: 252, // 前排
        ow: 36, // 天上
      };
      const START = {};
      Object.keys(GAP).forEach((kd) => (START[kd] = GO + (FOOT0[kd] + GAP[kd] - CAT_FOOT) / V));
      const EXIT_X = GW + 44;
      // 樹懶爬得很慢；最後一隻（狐狸）超過牠之後，仙鶴看不下去，飛回來把牠叼走
      const SL_WALK = GO + 0.5;
      const SL_V = 4;
      const slothX = (t) => SL_X + (t > SL_WALK ? SL_V * (t - SL_WALK) : 0);
      const LAST_PASS = (FOOT0.fx - V * START.fx - SL_X - 12 + SL_V * SL_WALK) / (SL_V - V);
      const CR_IN = LAST_PASS + 0.3;
      const CR_LAND = CR_IN + 1.2;
      const CR_DOWN = 1.46; // 仙鶴低頭叼樹懶的脖子角度
      const CR_GRAB = CR_LAND + 0.45;
      const CR_UP = CR_GRAB + 0.45;
      const CR_FLIP = CR_UP + 0.3;
      const CR_OUT = CR_FLIP + 2.0;
      const CR_LAND_X = slothX(CR_LAND) + 25;

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
        if (kd === "fr") st.hop = Math.abs(Math.sin(ph * 0.5)) * 6; // 青蛙一跳一跳
        if (kd === "el" || kd === "gf" || kd === "cr") st.leg = Math.sin(ph) * (kd === "el" ? 0.25 : 0.3);
        if (kd === "pg") st.rot = Math.sin(ph) * 0.18; // 小企鵝搖搖擺擺
        st.face = "happy";
      }
      // 仙鶴嘴尖的世界座標（脖子繞關節 19,26 轉 headRot）
      function beak(cr) {
        return rigToWorld(cr, rotAbout([31, 8], [19, 26], cr.headRot || 0));
      }
      // 樹懶近側那隻手的爪尖（手繞肩膀 16,12 轉 armRot）
      function claw(sl) {
        return rigToWorld(sl, rotAbout([18, 19], [16, 12], sl.armRot || 0));
      }

      function slothState(t) {
        const st = { kind: "sl", sx: -1, face: t % 4.2 > 3.5 ? "happy" : "open", headRot: 0, armRot: 0 };
        if (t < SL_TURN[0]) {
          // 倒掛：sx = -1 加轉半圈，整隻上下顛倒、頭朝樹幹，手腳抓著樹枝
          st.rot = Math.PI + Math.sin(t * 1.2) * 0.04;
          st.fx = tw(t, SL_SLIDE[0], SL_SLIDE[1], 244, 252, "io");
          st.fy = BRANCH_Y;
          st.armRot = path(t, [[SL_REACH[0], 0], [SL_REACH[1], -0.9, "io"], [SL_SLIDE[1], 0, "io"]]);
          st.leg = Math.sin(Math.max(0, t - SL_SLIDE[0]) * 2) * 0.15 * (t > SL_SLIDE[0] ? 1 : 0);
        } else if (t < SL_DOWN[0]) {
          // 轉成頭下腳上，抱住樹幹左邊
          st.rot = tw(t, SL_TURN[0], SL_TURN[1], Math.PI, Math.PI * 1.5, "io");
          st.fx = tw(t, SL_TURN[0], SL_TURN[1], 252, TRUNK_X, "io");
          st.fy = tw(t, SL_TURN[0], SL_TURN[1], BRANCH_Y, BRANCH_Y + 3, "io");
        } else if (t < SL_LAND[0]) {
          // 抱著樹幹一點一點往下滑，手腳輪流放開
          st.rot = Math.PI * 1.5;
          st.fx = TRUNK_X;
          st.fy = tw(t, SL_DOWN[0], SL_DOWN[1], BRANCH_Y + 3, GROUND - 12, "lin");
          st.leg = Math.sin((t - SL_DOWN[0]) * 1.6) * 0.18;
          st.armRot = -st.leg;
        } else {
          // 落地：轉回腳朝下，再慢慢轉身面向右邊
          st.rot = tw(t, SL_LAND[0], SL_LAND[1], Math.PI * 1.5, Math.PI * 2, "io");
          st.fx = tw(t, SL_LAND[0], SL_LAND[1], TRUNK_X, SL_X, "io");
          st.fy = tw(t, SL_LAND[0], SL_LAND[1], GROUND - 12, GROUND, "io");
          st.sx = tw(t, SL_FACE[0], SL_FACE[1], -1, 1, "io");
          if (st.sx === 0) st.sx = 0.01;
          if (t >= SL_FACE[1]) st.rot = 0;
          // 舉手接名牌：慢到第一次接不到，掛上名牌後一直舉著
          st.armRot = path(t, [[SL_ARM[0], 0], [SL_ARM[1], -2.0, "io"], [GO, -2.0], [GO + 1.5, -1.5, "io"]]);
          if (t >= YOGA_MISS && t < YOGA_MISS + 1.0) st.face = "dizzy";
          if (t >= YOGA_HIT) st.face = "happy";
          // 跟在隊伍後面，用超慢的速度一步一步爬
          if (t > SL_WALK) {
            st.fx = slothX(t);
            const ph = (t - SL_WALK) * 2.2;
            st.leg = Math.sin(ph) * 0.35;
            st.armFar = -st.leg;
            st.hop = Math.abs(Math.sin(ph)) * 0.4;
          }
        }
        return st;
      }

      function render(t) {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.imageSmoothingEnabled = false;
        ctx.fillStyle = "#1A1420";
        ctx.fillRect(0, 0, 1920, 1080);
        meadow(t);
        scenery(t);

        // 鏡頭：池塘邊三隻 → 推到樹上倒掛的樹懶 → 拉遠看青蛙伸舌頭、臭氣爆開 → 往左看隊伍走進來
        // → 樹懶還在樹幹上 → 依序對準拿名牌的 → 遊行時跟著小貓走到最右邊，看大家一隻隻走過去、仙鶴回來叼樹懶
        const camKeys = {
          x: [[0, 190], [5.4, 190], [6.4, 244, "io"], [10.6, 244], [11.3, 212, "io"], [12.1, 212], [12.7, 190, "io"], [14.2, 190],
            [WALK0 + 1.0, 64, "io"], [WALK_IN, 92, "lin"], [WALK_IN + 0.5, 130, "io"], [20.2, 130], [20.7, TRUNK_X - 10, "io"]],
          y: [[0, 44], [5.4, 44], [6.4, 46, "io"], [10.6, 46], [11.3, 44, "io"], [14.2, 44],
            [WALK0 + 1.0, 36, "io"], [WALK_IN + 0.5, 38, "io"], [20.2, 38], [20.7, 48, "io"]],
          z: [[0, 1.12], [5.4, 1.12], [6.4, 2.0, "io"], [10.6, 2.0], [11.3, 1.4, "io"], [12.1, 1.4], [12.7, 1.12, "io"], [14.2, 1.12],
            [WALK0 + 1.0, 1, "io"], [20.2, 1], [20.7, 1.6, "io"]],
        };
        const ZOOM = 1.25;
        TAGS.forEach((tg, i) => {
          const t0 = TAG_AT + STEP * i;
          const prev = i ? TAGS[i - 1].focus : [TRUNK_X - 10, 48];
          camKeys.x.push([t0, prev[0]], [t0 + 0.6, tg.focus[0], "io"]);
          camKeys.y.push([t0, prev[1]], [t0 + 0.6, tg.focus[1], "io"]);
          camKeys.z.push([t0, i ? ZOOM : 1.6], [t0 + 0.6, ZOOM, "io"]);
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
        // 被臭到：先暈一下，之後一直冒冷汗
        const reeling = t >= REACT && t < REACT + 0.9;
        const reek = (st) => {
          if (reeling && HAS_DIZZY.includes(st.kind)) st.face = "dizzy";
        };

        // ---- 隊伍走進來：整隊跟著小貓平移，到了被臭得後退一步 ----
        const catX = tw(t, WALK0, WALK_IN, -70, CAT_X, "lin");
        const off = catX - CAT_X - tw(t, REACT, REACT + 0.3, 0, STEP_BACK, "out");
        const walkingIn = t > WALK0 && t < WALK_IN;
        const old = {};
        OLD.forEach((kd, n) => {
          const st = { kind: kd, fx: HOME[kd] + off, face: "open", headRot: Math.sin(t * 1.5 + HOME[kd]) * 0.03 };
          if (FRONT_KINDS.includes(kd)) st.fy = FRONT;
          if (kd === "ln" || kd === "br") st.k = BIG;
          if (kd === "ln") st.messy = true;
          if (kd === "br") st.bump = 1;
          if (kd === "rb") st.ears = "up";
          if (kd === "el") {
            st.ear = Math.sin(t * 2.2) * 0.06;
            st.shell = -10; // 第六集撿到的蛋殼還頂在鼻尖上
            st.t = t;
          }
          if (kd === "sq") st.tail = Math.sin(t * 6) * 0.2;
          if (kd === "dg") st.k = DG_K;
          if (kd === "sd") st.k = SQ_K;
          if (kd === "ck") st.shell = true;
          if (walkingIn) stride(st, t - WALK0, n);
          reek(st);
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
            // 狐狸手上舉著搶回來的金幣
            st.prop = "coin";
            st.armRot = -1.0 + Math.sin(t * 4) * 0.08;
          }
          if (kd === "sd") {
            // 魷魚還在憂鬱：低著頭、垂頭喪氣地慢慢跳
            st.face = "sad";
            st.headRot = 0.12 + Math.sin(t * 1.3) * 0.03;
            st.hop = (st.hop || 0) * 0.35;
            st.sy = 0.92;
          }
          cheer(st, n);
          if (kd === "sd") st.face = "sad";
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

        // ---- 第四集的後遺症：山羊頭卡在綿羊的毛裡（倒退著把綿羊拖著走） ----
        const pairX = paradeFoot("pair", t);
        const goat = { kind: "gt", k: BIG, sx: -1, fx: pairX !== null ? pairX : HOME.pair + off, face: "open", headRot: 0.6 + Math.sin(t * 9) * 0.06 };
        goat.hop = Math.abs(Math.sin(t * 18)) * 1.2;
        goat.rot = Math.sin(t * 9) * 0.05;
        const sheep = { kind: "sh", k: BIG, fx: goat.fx - STUCK, face: "open", wool: WOOL_MAX, rot: -0.06 };
        if (walkingIn || walking("pair", t) >= 0) sheep.face = "happy";
        reek(goat);
        reek(sheep);
        cheer(sheep, 0);
        if (!walkingIn && t < GO && t >= REACT + 0.9) {
          old.ln.headRot = -0.15 + Math.sin(t * 2) * 0.03;
          old.br.headRot = -0.15;
        }

        // ---- 貓頭鷹：跟著隊伍飛在上方，邊飛邊打瞌睡 ----
        const ow = { kind: "ow", fx: HOME.ow + off, fy: 28 + Math.sin(t * 5) * 1.5, fly: true, flap: Math.sin(t * 14) * 0.6 };
        ow.face = Math.floor(t / 0.9) % 2 ? "sleep" : "grumpy";
        ow.headRot = Math.sin(t * 2) * 0.15;
        if (reeling) ow.face = "awake";
        const owf = paradeFoot("ow", t);
        if (owf !== null) ow.fx = owf;

        // ---- 池塘邊的三隻 ----
        // 水豚泡在溫泉裡一臉放空，頭上頂著橘子
        const cb = { kind: "cb", fx: SPRING_X, fy: GROUND + 1, face: "open", headRot: Math.sin(t * 0.8) * 0.03, orange: true };
        // 迷你豬在泥巴坑裡打滾 → 被臭到停下來、擠眉弄眼冒冷汗
        const pi = { kind: "pi", fx: MUD_X, fy: GROUND + 2, face: "happy" };
        const roll = t < PIG_SICK ? 1 : tw(t, PIG_SICK, PIG_SICK + 0.4, 1, 0);
        pi.rot = Math.sin(t * 3.2) * 1.25 * roll;
        pi.hop = Math.abs(Math.sin(t * 3.2)) * 0.8 * roll;
        if (t >= PIG_SICK) pi.face = "sick";
        // 青蛙在荷葉間跳 → 伸舌頭黏蒼蠅、碰到樹懶的頭髮 → 翻肚昏倒
        const fr = { kind: "fr", fx: path(t, [[1.0, PADS[0]], [1.5, PADS[1], "io"], [3.0, PADS[1]], [3.5, PADS[2], "io"]]), fy: GROUND + 2, face: "open" };
        fr.hop = jump(t, 1.0, 0.5, 6) + jump(t, 3.0, 0.5, 6);
        fr.sy = 1 + Math.max(0, Math.sin(t * 5)) * 0.06 * (t < TONGUE[0] ? 1 : 0); // 鼓氣
        if (t >= TONGUE[0] - 0.4 && t < TONGUE[2]) fr.headRot = -0.35;
        if (t >= TONGUE[2]) fr.face = "dizzy";
        if (t >= FROG_FLIP[0]) {
          const u = tw(t, FROG_FLIP[0], FROG_FLIP[1], 0, 1, "out");
          fr.rot = u * Math.PI;
          fr.fy = GROUND + 2 - u * 7;
          fr.hop = jump(t, FROG_FLIP[0], 0.4, 4);
          fr.headRot = 0;
        }
        const rigs = { cb, pi, fr };
        TAGS.forEach((tg, i) => {
          if (i > 2) return;
          const st = rigs[tg.kind];
          const t0 = tagHit(i);
          if (t < t0) return;
          st.face = "happy";
          if (tg.kind === "fr") {
            // 名牌一掛上去，青蛙就醒了：翻回來
            const u = tw(t, t0, t0 + 0.4, 1, 0, "io");
            st.rot = u * Math.PI;
            st.fy = GROUND + 2 - u * 7;
          }
          if (t < t0 + 1.0) st.hop = (st.hop || 0) + jump(t, t0, 0.4, 3);
        });
        [cb, pi, fr].forEach((st, n) => cheer(st, n + 3));
        // 遊行：水豚跳出溫泉、迷你豬和青蛙跟上
        [["cb", cb], ["pi", pi], ["fr", fr]].forEach(([kd, st], n) => {
          const pf = paradeFoot(kd, t);
          if (pf === null) return;
          const w = t - START[kd];
          st.fx = pf;
          st.rot = 0;
          st.fy = kd === "cb" ? (w < 0.35 ? tw(w, 0, 0.35, GROUND + 1, GROUND) - jump(w, 0, 0.35, 8) : GROUND) : FRONT;
          if (walking(kd, t) >= 0 && (kd !== "cb" || w >= 0.35)) stride(st, w, n);
        });
        // 橘子：被臭到掉進溫泉裡漂著 → 水豚拿到名牌時跳回頭上
        const umaHit = tagHit(0);
        const headTop = rigToWorld(cb, [20, 3]);
        const floatAt = [SPRING_X + 8, GROUND - 4 + Math.sin(t * 3) * 0.4];
        let orangeLoose = null;
        if (t >= ORANGE_FALL[0] && t < umaHit + 0.5) {
          cb.orange = false;
          if (t < ORANGE_FALL[1]) {
            const u = (t - ORANGE_FALL[0]) / (ORANGE_FALL[1] - ORANGE_FALL[0]);
            orangeLoose = [headTop[0] + (floatAt[0] - headTop[0]) * u, headTop[1] + (floatAt[1] - headTop[1]) * u - Math.sin(u * Math.PI) * 4, u * 3];
          } else if (t < umaHit) {
            orangeLoose = [floatAt[0], floatAt[1], Math.sin(t * 2) * 0.2];
          } else {
            const u = (t - umaHit) / 0.5;
            orangeLoose = [floatAt[0] + (headTop[0] - floatAt[0]) * u, floatAt[1] + (headTop[1] - floatAt[1]) * u - Math.sin(u * Math.PI) * 6, -u * Math.PI * 2];
          }
        }

        // ---- 樹懶 ----
        const sl = slothState(t);
        // ---- 仙鶴：遊行時走在最前面；最後看不下去，飛回來把樹懶叼走 ----
        const cr = old.cr;
        let carried = false;
        if (t >= CR_IN) {
          cr.leg = 0;
          cr.hop = 0;
          cr.rot = 0;
          cr.headRot = 0;
          cr.face = "open";
          cr.flap = -0.7 - Math.sin(t * 16) * 0.6;
          if (t < CR_LAND) {
            const u = tw(t, CR_IN, CR_LAND, 0, 1, "out");
            cr.sx = -1;
            cr.fx = GW + 30 + (CR_LAND_X - GW - 30) * u;
            cr.fy = GROUND - 12 * (1 - u) + Math.sin(t * 6) * 1.5 * (1 - u);
          } else if (t < CR_FLIP + 0.3) {
            cr.sx = t < CR_FLIP ? -1 : tw(t, CR_FLIP, CR_FLIP + 0.3, -1, 1, "lin") || 0.01;
            cr.fx = CR_LAND_X;
            cr.fy = GROUND;
            cr.flap = 0;
            cr.headRot = path(t, [[CR_LAND, 0], [CR_GRAB, CR_DOWN, "io"], [CR_UP, 0.2, "io"]]);
          } else {
            const u = tw(t, CR_FLIP + 0.3, CR_OUT, 0, 1, "in");
            cr.sx = 1;
            cr.fx = CR_LAND_X + (GW + 90 - CR_LAND_X) * u;
            cr.fy = GROUND - tw(t, CR_FLIP + 0.3, CR_FLIP + 1.0, 0, 16, "out") + Math.sin(t * 6) * 1.2;
            cr.headRot = 0.2;
          }
          if (t >= CR_GRAB) cr.face = "dizzy"; // 叼到的那一刻被臭到眼睛變叉叉，還是硬撐著
          if (t >= CR_GRAB) {
            // 樹懶背上（框座標 13,6）被仙鶴叼著，在半空中晃，照樣慢動作揮手
            carried = true;
            const b = beak(cr);
            sl.sx = 1;
            sl.rot = Math.sin(t * 3) * 0.12;
            sl.fx = b[0] - 1;
            sl.fy = b[1] + 14;
            sl.hop = 0;
            sl.leg = Math.sin(t * 2) * 0.25;
            sl.armFar = -sl.leg;
            sl.armRot = -1.8 + Math.sin(t * 1.6) * 0.4;
            sl.face = "happy";
          }
        }

        // ---- 畫：樹 → 後排 → 池塘邊 → 樹懶 → 小貓 → 前排 → 天上 ----
        const tagOn = (st, kd, scale) => {
          const n = kd === "sn" ? snakeNeck(sn) : rigToWorld(st, RIG[st.kind].neck);
          piece("name_tag", Math.sin(t * 3 + (HOME[kd] || 0)) * 0.06 + (st && st.rot ? st.rot * 0.5 : 0), { ax: n[0], ay: n[1], scale });
        };
        piece("tree", 0, { ax: TREE_X, ay: GROUND });
        ["gf", "el"].forEach((kd) => {
          drawAnimal(old[kd]);
          tagOn(old[kd], kd, OLD_TAG[kd]);
        });
        drawSnake(sn);
        tagOn(null, "sn", OLD_TAG.sn);
        ["ln", "br", "dg", "fx"].forEach((kd) => drawAnimal(old[kd]));
        drawAnimal(goat);
        drawAnimal(sheep);
        [["ln", old.ln], ["br", old.br], ["gt", goat], ["sh", sheep], ["dg", old.dg], ["fx", old.fx]].forEach(([kd, st]) => tagOn(st, kd, OLD_TAG[kd]));

        // 溫泉：水豚泡在裡面時只露出上半身（前緣的石頭蓋住）
        const cbIn = paradeFoot("cb", t) === null;
        if (cbIn) {
          ctx.save();
          ctx.beginPath();
          ctx.rect(SPRING_X - 30, 0, 60, GROUND - 3);
          ctx.clip();
        }
        drawAnimal(cb);
        if (cbIn) ctx.restore();
        piece("spring_front", 0, { ax: SPRING_X, ay: GROUND + 1 });
        if (orangeLoose) piece("orange", orangeLoose[2], { ax: orangeLoose[0], ay: orangeLoose[1] + 2.5 });
        // 溫泉冒蒸氣
        for (let i = 0; i < 3; i++) {
          const u = (t * 0.45 + i / 3) % 1;
          piece("steam", 0, { ax: SPRING_X - 10 + i * 10 + Math.sin(t * 2 + i) * 1.5, ay: GROUND - 5 - u * 12, scale: 0.6 + u * 0.6 - (u > 0.8 ? (u - 0.8) * 4 : 0) });
        }
        // 荷葉、泥巴坑裡的豬
        PADS.forEach((x, i) => piece("lily", 0, { ax: x, ay: GROUND + 2 + Math.sin(t * 2 + i) * 0.3 }));
        drawAnimal(pi);
        if (roll > 0.5 && Math.abs(Math.sin(t * 3.2)) > 0.9) {
          // 打滾濺起泥巴
          ctx.fillStyle = "#804A34";
          for (let i = 0; i < 4; i++) ctx.fillRect(MUD_X - 8 + i * 5 + hash(i, Math.floor(t * 3), 3) * 3, GROUND - 2 - hash(i, Math.floor(t * 3), 4) * 4, 1, 1);
        }
        drawAnimal(fr);
        drawAnimal(cr);
        tagOn(cr, "cr", OLD_TAG.cr);
        drawAnimal(sl);

        // ---- 小貓：帶隊走進來 → 捏鼻子 → 拋名牌 → 帶頭走出畫面 ----
        const cat = { x: catX, y: 31, torso: "s_torso_belly_dress", arm: "s_arm_dress", head: "s_head_open_bow", armRot: -0.15, tail: Math.sin(t * 2) * 0.12 };
        if (walkingIn) {
          walkPose(cat, (t - WALK0) * Math.PI * 3.6, 1);
          cat.head = "s_head_happy_bow";
        }
        if (t >= REACT && t < REACT + 1.6) {
          // 捏著鼻子
          cat.armRot = path(t, [[REACT, -0.15], [REACT + 0.2, -2.5, "out"], [REACT + 1.3, -2.5], [REACT + 1.6, -0.15, "io"]]);
        }
        cat.x = catX - tw(t, REACT, REACT + 0.3, 0, STEP_BACK, "out");
        let tagFly = null;
        TAGS.forEach((tg, i) => {
          const t0 = TAG_AT + STEP * i;
          if (t < t0 || t >= t0 + STEP) return;
          cat.armRot = path(t, [[t0 + 0.25, -0.15], [t0 + THROW, -1.4, "out"], [t0 + THROW + 0.25, -1.4], [t0 + THROW + 0.55, -0.15, "io"]]);
          if (t < t0 + THROW) cat.hold = () => piece("name_tag", 0, { ax: 6.2, ay: 0.5 });
          const s = tagState(i, t);
          if (s > 0 && s < 1) tagFly = { i, s };
          if (t >= t0 + THROW + FLY && t < t0 + STEP - 0.1) cat.head = i === 3 ? "s_head_open_bow" : "s_head_happy_bow";
        });
        if (t >= TAGS_END && t < TAGS_END + 0.8) {
          cat.head = "s_head_happy_bow";
          cat.hop = jump(t, TAGS_END, 0.45, 3);
        }
        if (t >= GO) {
          cat.x = CAT_FOOT - 20 + V * (t - GO);
          if (cat.x < EXIT_X) walkPose(cat, (t - GO) * Math.PI * 3.6, 1);
        }
        drawCat(cat);

        FRONT_KINDS.forEach((kd) => {
          drawAnimal(old[kd]);
          tagOn(old[kd], kd, OLD_TAG[kd]);
        });
        // 憂鬱的魷魚頭上一直跟著一朵小烏雲
        const gh = rigToWorld(old.sd, [8, 0]);
        piece("gloom", 0, { ax: gh[0] + Math.sin(t * 1.5) * 0.6, ay: gh[1] - 5 + Math.sin(t * 2) * 0.5, scale: 0.8 });
        const drop = (t * 1.4) % 1;
        piece("sweat", 0, { ax: gh[0] - 1.5, ay: gh[1] - 2 + drop * 3, scale: 0.4 * (1 - drop) });
        piece("sweat", 0, { ax: gh[0] + 1.5, ay: gh[1] - 2 + ((drop + 0.5) % 1) * 3, scale: 0.4 * (1 - ((drop + 0.5) % 1)) });
        drawAnimal(ow);
        tagOn(ow, "ow", OLD_TAG.ow);

        // 掛好的名牌（跟著脖子走；樹懶的掛在爪子上）
        TAGS.forEach((tg, i) => {
          if (i === 3 || tagState(i, t) < 1) return;
          const st = i === 4 ? sl : rigs[tg.kind];
          const n = i === 4 ? claw(sl) : rigToWorld(st, RIG[tg.kind].neck);
          const t1 = tagHit(i);
          const sw = Math.sin((t - t1) * 8) * 0.25 * Math.max(0, 1 - (t - t1) / 1.5);
          piece("name_tag", sw + (st.rot || 0) * 0.5, { ax: n[0], ay: n[1], scale: tg.scale * (1 + pop(t, t1, 0.3, 0.5)) });
        });
        // 第一次拋給樹懶的名牌：打到頭彈開，掉在地上就一直躺在那裡
        if (t >= YOGA_MISS) {
          const h = rigToWorld(slothState(YOGA_MISS), HEAD_TOP.sl);
          const u = tw(t, YOGA_MISS, YOGA_MISS + 0.5, 0, 1, "lin");
          piece("name_tag", u * 4.4, { ax: h[0] + u * 8, ay: h[1] + (GROUND - 1 - h[1]) * u - Math.sin(u * Math.PI) * 6, scale: 0.9 });
        }
        if (tagFly) {
          const hx = cat.x + 20 + Math.cos(-1.4) * 6.2;
          const hy = cat.y + 19 + Math.sin(-1.4) * 6.2;
          const tg = TAGS[tagFly.i];
          const n = tagFly.i === 3 ? rigToWorld(sl, HEAD_TOP.sl) : tagFly.i === 4 ? claw(sl) : rigToWorld(rigs[tg.kind], RIG[tg.kind].neck);
          const u = tagFly.s;
          const arc = 6 + Math.abs(n[0] - hx) * 0.12;
          piece("name_tag", u * 8, { ax: hx + (n[0] - hx) * u, ay: hy + (n[1] - hy) * u - Math.sin(u * Math.PI) * arc });
        }

        // ---- 特效 ----
        // 樹懶頭髮的臭味：往上飄的綠色波浪線，三隻蒼蠅繞著頭飛
        const hp = rigToWorld(sl, [19, 2]);
        for (let i = 0; i < 3; i++) {
          const u = (t * 0.5 + i / 3) % 1;
          piece("stink", Math.sin(t * 3 + i) * 0.15, { ax: hp[0] + (i - 1) * 3 + Math.sin(t * 2 + i * 2) * 1.2, ay: hp[1] - 1 - u * 10, scale: 0.7 * Math.sin(u * Math.PI) + 0.1 });
        }
        for (let i = 0; i < 3; i++) {
          const a = t * (4 + i * 0.7) + i * 2.1;
          piece("fly", 0, { ax: hp[0] + Math.cos(a) * (5 + i), ay: hp[1] - 1 + Math.sin(a) * 2.5 - i, scale: 0.8 });
        }
        // 仙鶴飛走後，臭味還留在原地飄一陣子才散掉
        if (t >= CR_OUT - 1.0) {
          const fade = tw(t, CR_OUT - 1.0, DUR - 0.3, 1, 0, "lin");
          const x0 = CR_LAND_X - 24;
          for (let i = 0; i < 3; i++) {
            const u = (t * 0.4 + i / 3) % 1;
            piece("stink", Math.sin(t * 2 + i) * 0.2, { ax: x0 + (i - 1) * 4, ay: GROUND - 6 - u * 10, scale: fade * (0.8 * Math.sin(u * Math.PI) + 0.1) });
          }
        }
        // 青蛙的舌頭
        if (t >= TONGUE[0] && t < TONGUE[2]) {
          const m = rigToWorld(fr, [11, 6]);
          const e = path(t, [[TONGUE[0], 0], [TONGUE[1], 1, "out"], [TONGUE[2], 0, "in"]]);
          const tip = [m[0] + (hp[0] - m[0]) * e, m[1] + (hp[1] - m[1]) * e];
          pixLine(m[0], m[1], tip[0], tip[1], "#E98C98");
          ctx.fillStyle = "#F2A0A8";
          ctx.fillRect(Math.round(tip[0]) - 1, Math.round(tip[1]) - 1, 2, 2);
        }
        // 臭氣爆開：三團綠色的臭氣往青蛙、水豚、豬那邊飄過去
        if (t >= STINK && t < STINK + 2.4) {
          const u = (t - STINK) / 2.4;
          [[PADS[2] + 4, GROUND - 4], [SPRING_X + 6, GROUND - 12], [MUD_X + 8, GROUND - 8]].forEach(([x, y], i) => {
            const v = Math.min(1, u * (1.4 - i * 0.2));
            piece("stink_cloud", Math.sin(t * 2 + i) * 0.1, { ax: hp[0] + (x - hp[0]) * v, ay: hp[1] + (y - hp[1]) * v, scale: (0.6 + v * 1.4) * Math.min(1, (1 - u) * 3) });
          });
        }
        // 冷汗：被臭到的豬、隊伍裡幾隻比較大的、小貓
        const sweaty = [];
        if (t >= PIG_SICK && t < tagHit(1)) sweaty.push(rigToWorld(pi, HEAD_TOP.pi));
        if (t >= REACT && t < GO) {
          ["cr", "ln", "br", "pg", "rb"].forEach((kd) => sweaty.push(rigToWorld(old[kd], HEAD_TOP[kd])));
          sweaty.push([cat.x + 26, cat.y + 2]);
        }
        if (t >= YOGA_MISS && t < YOGA_MISS + 0.9) sweaty.push([cat.x + 26, cat.y + 2]);
        sweaty.forEach((h, i) => {
          const u = (t * 1.2 + i * 0.37) % 1;
          piece("sweat", 0, { ax: h[0] + 3, ay: h[1] + u * 4, scale: 0.6 * (1 - u) + 0.2 });
        });
        // 水豚拿到名牌、橘子跳回頭上的瞬間閃一下
        if (t >= umaHit + 0.5 && t < umaHit + 1.0) {
          const u = (t - umaHit - 0.5) / 0.5;
          piece("sparkle", 0, { ax: headTop[0] + 3, ay: headTop[1] - 4 - u * 4, scale: Math.sin(u * Math.PI) * 1.4 });
        }
        // 樹懶終於接到名牌：頭上冒愛心
        if (t >= YOGA_HIT && t < YOGA_HIT + 1.4) {
          const u = (t - YOGA_HIT) / 1.4;
          const h = rigToWorld(sl, HEAD_TOP.sl);
          piece("heart", Math.sin(t * 6) * 0.2, { ax: h[0] + 3, ay: h[1] - 3 - u * 6, scale: Math.sin(u * Math.PI) * 1.2 });
        }
        // 名牌打到頭：冒星星
        if (t >= YOGA_MISS && t < YOGA_MISS + 0.6) {
          const u = (t - YOGA_MISS) / 0.6;
          const h = rigToWorld(sl, HEAD_TOP.sl);
          piece("sparkle", 0, { ax: h[0] + 2, ay: h[1] - 2 - u * 3, scale: Math.sin(u * Math.PI) * 1.2 });
        }
        // 隊伍看到奇怪的池塘邊冒問號
        if (t >= WALK_IN && t < REACT) {
          ["cr", "pg", "ck"].forEach((kd, n) => {
            const h = rigToWorld(old[kd], HEAD_TOP[kd]);
            piece("question", Math.sin(t * 5 + n) * 0.15, { ax: h[0], ay: h[1] - 3, scale: 0.8 });
          });
        }
        // 仙鶴叼起樹懶的瞬間：臭氣噴一下
        if (carried && t < CR_GRAB + 0.8) {
          const u = (t - CR_GRAB) / 0.8;
          const b = beak(cr);
          piece("stink_cloud", 0, { ax: b[0], ay: b[1] - 2 - u * 4, scale: Math.sin(u * Math.PI) * 1.3 });
        }

        // ---- 字卡（固定在畫面下方，不跟鏡頭） ----
        ctx.setTransform(P, 0, 0, P, 0, 0);
        TAGS.forEach((tg, i) => {
          if (!tg.cap) return;
          const t0 = tagHit(i) - 0.05;
          const t1 = i === 4 ? TAGS_END : TAG_AT + STEP * (i + 1);
          if (t < t0 || t >= t1) return;
          const s = tw(t, t0, t0 + 0.2, 0, 1, "back") * tw(t, t1 - 0.2, t1, 1, 0, "in");
          piece(tg.cap, 0, { ax: 64, ay: 59, scale: s * 0.9 });
        });
        // 樹懶慢慢動的時候：「……」
        [[SL_REACH[0] + 0.3, SL_REACH[1]], [20.8, TAG_AT]].forEach(([t0, t1]) => {
          if (t < t0 || t >= t1) return;
          const s = tw(t, t0, t0 + 0.2, 0, 1, "back") * tw(t, t1 - 0.2, t1, 1, 0, "in");
          piece("cap_dots", 0, { ax: 64, ay: 61, scale: s * 0.6 });
        });
      }

      (window.EPISODES = window.EPISODES || []).push({ no: 7, title: '第七集', render, duration: DUR });
    })();
