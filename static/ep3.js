// 預告片第三集：由 tools/build_trailer.py 從 video/compositions/ep3.html 產生，請勿手改
// 角色零件沿用 sprites.js 的 SPRITES / PAL；登記到 window.EPISODES = [{ no, title, render(t), duration }]
(function () {
      // 下方 SPRITES 區塊由 video/design/export_pieces.py 自動產生
      

      // 第三集：隊伍繼續前進 → 遇到蛇捲成的跑步機（松鼠、天竺鼠、倉鼠在裡面跑，矮袋鼠跑得很糟）
      // → 小貓揮手，跑步機急停把大家甩出來 → 發名牌公布名字 → 大家加入隊伍走出畫面
      const DUR = 33;
      const P = 15; // 一格 = 15 px
      const GW = 256; // 世界比畫面寬一倍，鏡頭橫移
      const GH = 72;
      const GROUND = 63; // 腳底所在的列
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
      // 角色框：w x h，腳底踩在框的最下面。x 是框左上角的世界座標；
      // 腳底預設踩在 GROUND，也可用 fx/fy 指定腳底的世界座標，rot 繞腳底轉（在跑步機裡、被甩出去時用）
      const RIG = {
        mk: { w: 16, h: 28, foot: 7, neck: [8, 10] },
        ot: { w: 18, h: 22, foot: 8, neck: [10, 9] },
        gf: { w: 30, h: 56, foot: 13, neck: [21, 23] },
        el: { w: 56, h: 44, foot: 22, neck: [39, 27] },
        sq: { w: 18, h: 16, foot: 10, neck: [12, 9] },
        gp: { w: 16, h: 10, foot: 8, neck: [11, 6] },
        hm: { w: 12, h: 10, foot: 6, neck: [8, 6] },
        qk: { w: 14, h: 17, foot: 7, neck: [8, 8] },
      };
      const EL_HEAD = [36, 22];

      function footOf(st) {
        const r = RIG[st.kind];
        return [st.fx !== undefined ? st.fx : st.x + r.foot, (st.fy !== undefined ? st.fy : GROUND) - (st.hop || 0)];
      }
      // 角色框內的點 → 世界座標（依序套用：擠壓、繞腳底旋轉、平移）
      function rigToWorld(st, p) {
        const r = RIG[st.kind];
        const f = footOf(st);
        const dx = (p[0] - r.foot) * (st.sx || 1);
        const dy = (p[1] - r.h) * (st.sy || 1);
        const a = st.rot || 0;
        return [f[0] + dx * Math.cos(a) - dy * Math.sin(a), f[1] + dx * Math.sin(a) + dy * Math.cos(a)];
      }
      function drawRig(st, parts) {
        const r = RIG[st.kind];
        const f = footOf(st);
        ctx.save();
        ctx.translate(f[0], f[1]);
        if (st.rot) ctx.rotate(st.rot);
        ctx.scale(st.sx || 1, st.sy || 1);
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
      };
      function drawAnimal(st) {
        drawRig(st, () => DRAW[st.kind](st));
      }

      // ---------- 蛇：捲成一圈立在地上，身體圓環繞圓心轉就是跑步機；頭和尾巴尖固定在頂端 ----------
      const RING_R = 23.5; // 圓心離地高度
      const RIN = 17.5; // 小動物腳底離圓心的距離（踩在蛇肚子上）
      function drawSnake(sn) {
        ctx.save();
        ctx.translate(sn.x, GROUND - (sn.hop || 0));
        ctx.scale(sn.sx || 1, sn.sy || 1);
        piece("sn_ring", sn.spin, { ax: 0, ay: -RING_R });
        piece("sn_tail", 0.35, { ax: -3, ay: -RING_R * 2 + 1 });
        piece("sn_head_" + (sn.face || "open"), sn.headRot || 0, { ax: 1, ay: -RING_R * 2 + 1.5 });
        ctx.restore();
      }
      function snakeNeck(sn) {
        return [sn.x + 3, GROUND - (sn.hop || 0) - RING_R * 2 * (sn.sy || 1) + 2];
      }
      // 跑步機裡的位置：φ = 0 在正下方，往正值是被轉往後方（左邊）帶上去
      function onWheel(st, sn, phi) {
        const cy = GROUND - RING_R;
        st.fx = sn.x - RIN * Math.sin(phi);
        st.fy = cy + RIN * Math.cos(phi);
        st.rot = phi;
      }

      // ---------- 場景：草地（畫在 256x72 的世界畫布上，1 格 = 1 px） ----------
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
          cloud(((x0 + t * v) % 296) - 20, y, w);
        });
        triW(22, 30, 26, 47, "#A8D5A2");
        triW(70, 34, 22, 47, "#93C98E");
        triW(108, 28, 28, 47, "#A8D5A2");
        triW(158, 33, 24, 47, "#93C98E");
        triW(204, 29, 30, 47, "#A8D5A2");
        triW(250, 35, 20, 47, "#93C98E");
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
      }

      // ---------- 時間軸 ----------
      // 隊伍：小貓帶頭，第二集的朋友跟在後面，停下來時的站位（框左上角 x）
      const CAT_X = 126;
      const WALK_IN = 6.5;
      const HOME = { el: 68, gf: 42, ot: 24, mk: 8 };
      const SNAKE_X = 186; // 跑步機圓心
      // 在跑步機裡的位置（φ）；矮袋鼠沒有固定位置，一直被轉上去再滾下來
      const SLOT = { sq: -0.75, gp: -0.25, hm: 0.2 };
      const STOP = 8.8; // 小貓揮手，跑步機急停
      const LAND = 9.6; // 大家被甩出來落地
      const DIZZY_END = 10.6;
      const SPOT = { qk: 214, hm: 224, gp: 234, sq: 245 }; // 落地的腳底 x
      // 公布名字：每隻 2 秒，從 TAG_AT 起依序是松鼠、天竺鼠、倉鼠、矮袋鼠、蛇
      const TAG_AT = 11.2;
      const TAGS = [
        { kind: "sq", cap: "cap_joy", focus: [236, 50], scale: 0.85 },
        { kind: "gp", cap: "cap_mia", focus: [228, 52], scale: 0.8 },
        { kind: "hm", cap: "cap_leo", focus: [220, 52], scale: 0.75 },
        { kind: "qk", cap: "cap_amber", focus: [212, 50], scale: 0.85 },
        { kind: "sn", cap: "cap_emily", focus: [190, 36], scale: 1 },
      ];
      const THROW = 0.55; // 每段開始後幾秒拋出名牌
      const FLY = 0.45; // 名牌飛行秒數
      // 遊行：小貓帶頭，大家用同樣的速度排成一列跟上（新朋友 → 蛇滾著圈走 → 第二集的朋友）
      // GAP 是每一隻的腳底落後小貓腳底多少格；小貓走到「自己的位置 + GAP」時才起步
      const GO = 22.0;
      const V = 40; // 格/秒
      const CAT_FOOT = CAT_X + 20;
      const GAP = { sq: 18, gp: 34, hm: 48, qk: 62, sn: 97, el: 175, gf: 215, ot: 245, mk: 267 };
      const FOOT0 = { sq: SPOT.sq, gp: SPOT.gp, hm: SPOT.hm, qk: SPOT.qk, sn: SNAKE_X };
      ["el", "gf", "ot", "mk"].forEach((kd) => (FOOT0[kd] = HOME[kd] + RIG[kd].foot));
      const START = {};
      Object.keys(GAP).forEach((kd) => (START[kd] = GO + (FOOT0[kd] + GAP[kd] - CAT_FOOT) / V));
      const EXIT_X = 300;

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
        const t0 = TAG_AT + 2 * i + THROW;
        return t < t0 ? 0 : tw(t, t0, t0 + FLY, 0, 1, "lin");
      }

      function render(t) {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.imageSmoothingEnabled = false;
        ctx.fillStyle = "#1A1420";
        ctx.fillRect(0, 0, 1920, 1080);
        meadow(t);

        // 鏡頭：隊伍走進來後往右帶到跑步機；甩出來時再往右；公布名字時依序對準每一隻
        const camKeys = {
          x: [[0, 64], [2.4, 64], [6.8, 156, "io"], [STOP + 0.3, 156], [STOP + 1.0, 192, "io"]],
          y: [[0, 36]],
          z: [[0, 1]],
        };
        const ZOOM = 1.25;
        TAGS.forEach((tg, i) => {
          const t0 = TAG_AT + 2 * i;
          const prev = i ? TAGS[i - 1].focus : [192, 36];
          camKeys.x.push([t0, prev[0]], [t0 + 0.6, tg.focus[0], "io"]);
          camKeys.y.push([t0, prev[1]], [t0 + 0.6, tg.focus[1], "io"]);
          camKeys.z.push([t0, i ? ZOOM : 1], [t0 + 0.6, ZOOM, "io"]);
        });
        const tEnd = TAG_AT + 2 * TAGS.length;
        const last = TAGS[TAGS.length - 1].focus;
        camKeys.x.push([tEnd, last[0]], [tEnd + 0.8, 192, "io"]);
        camKeys.y.push([tEnd, last[1]], [tEnd + 0.8, 36, "io"]);
        camKeys.z.push([tEnd, ZOOM], [tEnd + 0.8, 1, "io"]);
        const cam = { x: path(t, camKeys.x), y: path(t, camKeys.y), z: path(t, camKeys.z) };
        const z = cam.z;
        const vw = 128 / z;
        const vh = GH / z;
        const cx = Math.min(GW - vw / 2, Math.max(vw / 2, cam.x));
        const cy = Math.min(GH - vh / 2, Math.max(vh / 2, cam.y));
        const k = P * z;
        ctx.setTransform(k, 0, 0, k, -(cx - vw / 2) * k, -(cy - vh / 2) * k);
        ctx.drawImage(world, 0, 0, GW, GH);

        const stopped = t >= STOP;
        const landed = t >= LAND;
        const dizzy = landed && t < DIZZY_END;

        // ---- 小貓的位置（第二集的朋友跟在後面，間距固定） ----
        const catX = tw(t, 0, WALK_IN, -40, CAT_X, "lin");
        const walkingIn = t < WALK_IN;

        // ---- 第二集的朋友：跟著走進來 → 停在左邊 → 最後跟著隊伍走出去 ----
        const friends = {};
        ["el", "gf", "ot", "mk"].forEach((kd) => {
          const st = { kind: kd, x: Math.min(HOME[kd], catX - (CAT_X - HOME[kd])), face: "open", headRot: Math.sin(t * 1.5 + HOME[kd]) * 0.03 };
          if (kd === "el") st.ear = Math.sin(t * 2.2) * 0.06;
          let w = walkingIn ? t : -1;
          const pf = paradeFoot(kd, t);
          if (pf !== null) {
            st.x = pf - RIG[kd].foot;
            w = walking(kd, t);
          }
          if (w >= 0) {
            const ph = w * Math.PI * (kd === "el" ? 3 : 3.2);
            st.hop = Math.abs(Math.sin(ph)) * (kd === "el" ? 0.8 : kd === "gf" ? 1.2 : 2.2);
            if (kd === "el" || kd === "gf") st.leg = Math.sin(ph) * (kd === "el" ? 0.25 : 0.3);
            st.face = "happy";
          }
          friends[kd] = st;
        });

        // ---- 蛇（跑步機） ----
        const SPIN = 3.2; // 轉速（rad/s）
        const sn = { x: SNAKE_X, spin: SPIN * Math.min(t, STOP), face: "open", headRot: Math.sin(t * 2.4) * 0.08 };
        if (stopped) {
          sn.spin += pop(t, STOP, 0.25, 0.7);
          sn.sy = 1 + pop(t, STOP, -0.1, 0.6);
          sn.sx = 1 + pop(t, STOP, 0.06, 0.6);
          sn.headRot = pop(t, STOP, 0.3, 0.7) + (t >= DIZZY_END ? -0.1 : 0);
          if (t >= STOP + 0.8) sn.face = "happy";
        }
        const snf = paradeFoot("sn", t);
        if (snf !== null) {
          sn.x = snf;
          sn.spin += (sn.x - SNAKE_X) / RING_R; // 往右滾
          sn.headRot = 0;
        }

        // ---- 小動物 ----
        const kids = {};
        ["qk", "hm", "gp", "sq"].forEach((kd, n) => {
          const st = { kind: kd, face: "open", tail: Math.sin(t * 6 + n) * 0.2 };
          // 在跑步機裡的位置：矮袋鼠被轉上去再滾下來，其他三隻原地跑
          const wheelPos = (tt) => {
            if (kd !== "qk") return { phi: SLOT[kd], rot: SLOT[kd], face: "open" };
            const c = ((tt + 0.3) % 1.3) / 1.3;
            if (c < 0.45) {
              const phi = 0.45 + (c / 0.45) * 1.5;
              return { phi, rot: phi, face: "open" };
            }
            const v = (c - 0.45) / 0.55;
            const phi = 1.95 - 1.5 * E.io(v);
            return { phi, rot: phi + v * Math.PI * 2, face: "dizzy" };
          };
          if (!stopped) {
            const wp = wheelPos(t);
            onWheel(st, sn, wp.phi);
            st.rot = wp.rot;
            st.face = wp.face;
            if (kd !== "qk" || wp.face === "open") st.hop = Math.abs(Math.sin(t * Math.PI * 6 + n)) * 1.2;
            st.headRot = Math.sin(t * 20 + n) * 0.08;
            if (kd === "qk" && wp.face === "open") st.headRot = Math.sin(t * 30) * 0.25; // 手忙腳亂
          } else if (!landed) {
            // 急停：照原本跑的方向被甩出去，在空中翻一圈
            const wp = wheelPos(STOP);
            const s0 = {};
            onWheel(s0, sn, wp.phi);
            const u = (t - STOP) / (LAND - STOP);
            st.fx = s0.fx + (SPOT[kd] - s0.fx) * u;
            st.fy = s0.fy + (GROUND - s0.fy) * u - Math.sin(u * Math.PI) * (12 + n * 2);
            st.rot = wp.rot * (1 - u) + u * Math.PI * 2 * (kd === "qk" ? 1.25 : 1);
            st.face = "dizzy";
          } else {
            st.fx = SPOT[kd];
            st.fy = GROUND;
            st.sy = 1 + pop(t, LAND, -0.25, 0.6);
            st.sx = 1 + pop(t, LAND, 0.15, 0.6);
            if (dizzy) {
              st.face = "dizzy";
              st.headRot = Math.sin(t * 9 + n) * 0.12;
            }
            if (t >= DIZZY_END && t < DIZZY_END + 0.6) {
              st.face = "happy";
              st.hop = jump(t, DIZZY_END + n * 0.05, 0.4, 2.5);
            }
            // 矮袋鼠臉朝下摔在地上，過一下才爬起來
            if (kd === "qk") st.rot = path(t, [[LAND, Math.PI / 2], [DIZZY_END - 0.3, Math.PI / 2], [DIZZY_END, 0, "back"]]);
          }
          // 遊行
          const pf = paradeFoot(kd, t);
          if (pf !== null) {
            const w = walking(kd, t);
            const p0 = START[kd];
            st.fx = pf;
            st.face = "happy";
            let tripping = false;
            if (kd === "qk") {
              // 矮袋鼠走沒幾步又絆倒一次，爬起來再快跑追上
              st.fx -= path(t, [[p0 + 0.4, 0], [p0 + 1.2, 24, "lin"], [p0 + 2.0, 0, "io"]]);
              st.rot = path(t, [[p0 + 0.4, 0], [p0 + 0.55, 1.45, "in"], [p0 + 1.0, 1.45], [p0 + 1.2, 0, "io"]]);
              tripping = t >= p0 + 0.4 && t < p0 + 1.2;
              if (tripping) st.face = "dizzy";
            }
            if (w >= 0 && !tripping) st.hop = Math.abs(Math.sin(w * Math.PI * 3.6 + n)) * 1.6;
          }
          kids[kd] = st;
        });

        // ---- 發名牌：被掛到的那隻開心跳一下 ----
        const rigs = Object.assign({ sn }, kids);
        TAGS.forEach((tg, i) => {
          const t0 = TAG_AT + 2 * i + THROW + FLY;
          if (t >= t0 && t < t0 + 1.0) {
            rigs[tg.kind].face = "happy";
            rigs[tg.kind].hop = (rigs[tg.kind].hop || 0) + jump(t, t0, 0.4, 2.5);
          }
        });
        const neckOf = (kd) => (kd === "sn" ? snakeNeck(sn) : rigToWorld(kids[kd], RIG[kd].neck));

        // ---- 畫：後面的先畫 ----
        drawAnimal(friends.gf);
        drawAnimal(friends.el);
        drawAnimal(friends.ot);
        drawAnimal(friends.mk);
        // 第二集掛上的名牌一直戴著
        ["gf", "el", "ot", "mk"].forEach((kd) => {
          const n = rigToWorld(friends[kd], RIG[kd].neck);
          piece("name_tag", Math.sin(t * 3 + HOME[kd]) * 0.06, { ax: n[0], ay: n[1] });
        });
        drawSnake(sn);
        ["qk", "hm", "gp", "sq"].forEach((kd) => drawAnimal(kids[kd]));

        // 暈頭轉向的星星
        if (dizzy) {
          ["qk", "hm", "gp", "sq"].forEach((kd, n) => {
            const h = kd === "qk" ? [SPOT.qk + 9, GROUND - 4] : rigToWorld(kids[kd], RIG[kd].neck);
            for (let i = 0; i < 3; i++) {
              const a = t * 6 + n + (i * Math.PI * 2) / 3;
              piece("sparkle", 0, { ax: h[0] + Math.cos(a) * 4, ay: h[1] - 5 + Math.sin(a) * 1.3, scale: 0.6 });
            }
          });
        }
        // 掛好的名牌（跟著脖子走）
        TAGS.forEach((tg, i) => {
          if (tagState(i, t) < 1) return;
          const n = neckOf(tg.kind);
          const t1 = TAG_AT + 2 * i + THROW + FLY;
          const sw = Math.sin((t - t1) * 8) * 0.25 * Math.max(0, 1 - (t - t1) / 1.5);
          piece("name_tag", sw + (rigs[tg.kind].rot || 0) * 0.5, { ax: n[0], ay: n[1], scale: tg.scale * (1 + pop(t, t1, 0.3, 0.5)) });
        });

        // ---- 小貓：帶隊走進來 → 冒問號 → 揮手 → 站著拋名牌 → 帶頭走出畫面 ----
        const cat = { x: catX, y: 31, torso: "s_torso_belly_dress", arm: "s_arm_dress", head: "s_head_open_bow", armRot: -0.15, tail: Math.sin(t * 2) * 0.12 };
        if (walkingIn) walkPose(cat, t * Math.PI * 3.6, 1);
        if (t >= WALK_IN && t < STOP) cat.headRot = tw(t, WALK_IN + 0.1, WALK_IN + 0.4, 0, -0.15, "out");
        // 揮手叫大家
        if (t >= 8.0 && t < 9.0) cat.armRot = path(t, [[8.0, -0.15], [8.25, -1.6, "out"], [8.4, -1.15], [8.55, -1.6], [8.7, -1.15], [9.0, -0.15, "io"]]);
        if (t >= DIZZY_END && t < DIZZY_END + 0.6) {
          cat.head = "s_head_happy_bow";
          cat.hop = jump(t, DIZZY_END + 0.1, 0.45, 2.5);
        }
        let tagFly = null;
        TAGS.forEach((tg, i) => {
          const t0 = TAG_AT + 2 * i;
          if (t < t0 || t >= t0 + 2) return;
          // 舉手 → 拋出名牌 → 手放下
          cat.armRot = path(t, [[t0 + 0.25, -0.15], [t0 + THROW, -1.4, "out"], [t0 + THROW + 0.25, -1.4], [t0 + THROW + 0.55, -0.15, "io"]]);
          if (t < t0 + THROW) cat.hold = () => piece("name_tag", 0, { ax: 6.2, ay: 0.5 });
          const s = tagState(i, t);
          if (s > 0 && s < 1) tagFly = { i, s };
          if (t >= t0 + THROW + FLY && t < t0 + 1.8) cat.head = "s_head_happy_bow";
        });
        if (t >= GO) {
          cat.x = CAT_X + V * (t - GO);
          cat.head = "s_head_happy_bow";
          if (cat.x < EXIT_X) walkPose(cat, (t - GO) * Math.PI * 3.6, 1);
        }
        drawCat(cat);
        if (tagFly) {
          // 從舉高的手（約 -1.4 rad）拋出，沿拋物線飛到脖子
          const hx = cat.x + 20 + Math.cos(-1.4) * 6.2;
          const hy = cat.y + 19 + Math.sin(-1.4) * 6.2;
          const n = neckOf(TAGS[tagFly.i].kind);
          const u = tagFly.s;
          const arc = 6 + Math.abs(n[0] - hx) * 0.12;
          piece("name_tag", u * 8, { ax: hx + (n[0] - hx) * u, ay: hy + (n[1] - hy) * u - Math.sin(u * Math.PI) * arc });
        }
        // 小貓看到跑步機，冒問號
        if (t >= WALK_IN + 0.3 && t < 8.0) {
          const u = tw(t, WALK_IN + 0.3, WALK_IN + 0.55, 0, 1.4, "back") * tw(t, 7.7, 8.0, 1, 0, "in");
          piece("question", Math.sin(t * 5) * 0.1, { ax: cat.x + 24, ay: cat.y - 2, scale: u });
        }
        // 爬起來之後一起歡呼
        if (t >= DIZZY_END && t < DIZZY_END + 0.9) {
          const u = tw(t, DIZZY_END, DIZZY_END + 0.2, 0, 1, "back") * tw(t, DIZZY_END + 0.6, DIZZY_END + 0.9, 1, 0, "in");
          piece("sparkle", 0, { ax: 206, ay: 30, scale: u });
          piece("sparkle", 0, { ax: 240, ay: 34, scale: u * 0.8 });
          piece("heart", 0, { ax: 172, ay: 22, scale: u });
        }

        // ---- 名字字卡（固定在畫面下方，不跟鏡頭） ----
        ctx.setTransform(P, 0, 0, P, 0, 0);
        TAGS.forEach((tg, i) => {
          const t0 = TAG_AT + 2 * i + THROW + FLY - 0.05;
          const t1 = TAG_AT + 2 * i + 2;
          if (t < t0 || t >= t1) return;
          const s = tw(t, t0, t0 + 0.2, 0, 1, "back") * tw(t, t1 - 0.2, t1, 1, 0, "in");
          piece(tg.cap, 0, { ax: 64, ay: 59, scale: s * 0.9 });
        });
      }

      (window.EPISODES = window.EPISODES || []).push({ no: 3, title: '第三集', render, duration: DUR });
    })();
