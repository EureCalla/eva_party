// 預告片第二集：由 tools/build_trailer.py 從 video/compositions/ep2.html 產生，請勿手改
// 角色零件沿用 sprites.js 的 SPRITES / PAL；登記到 window.EPISODES = [{ no, title, render(t), duration }]
(function () {
      // 角色零件由 design/export_pieces.py 產生並注入，請勿手改這個區塊
      

      // 第二集：小貓散步 → 圍觀大象吹茶葉蛋 → 蛋掉到狐獴頭上 → 發名牌公布名字 → 大家跟著小貓走出畫面
      const DUR = 30;
      const P = 15; // 一格 = 15 px
      const GW = 128;
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
      function rotAbout(p, c, a) {
        const dx = p[0] - c[0];
        const dy = p[1] - c[1];
        return [c[0] + dx * Math.cos(a) - dy * Math.sin(a), c[1] + dx * Math.sin(a) + dy * Math.cos(a)];
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
      // 角色框：w x h，腳底踩在框的最下面；x 是框左上角的世界座標，腳底固定在 GROUND
      const RIG = {
        mk: { w: 16, h: 28, foot: 7, neck: [8, 10] },
        ot: { w: 18, h: 22, foot: 8, neck: [10, 9] },
        gf: { w: 30, h: 56, foot: 13, neck: [21, 23] },
        el: { w: 56, h: 44, foot: 22, neck: [39, 27] },
      };
      const TRUNK_PIVOT = [45.5, 21];
      const TRUNK_TIP = [50, 40];
      const EL_HEAD = [36, 22];

      // 角色框內的點 → 世界座標（依序套用：擠壓、翻面、平移）
      function rigToWorld(st, p) {
        const r = RIG[st.kind];
        let x = r.foot + (p[0] - r.foot) * (st.sx || 1);
        const y = r.h + (p[1] - r.h) * (st.sy || 1);
        if (st.flip !== undefined && st.flip !== 1) x = r.w / 2 + (x - r.w / 2) * st.flip;
        return [st.x + x, GROUND - r.h + y - (st.hop || 0)];
      }
      function drawRig(st, parts) {
        const r = RIG[st.kind];
        ctx.save();
        ctx.translate(st.x, GROUND - r.h - (st.hop || 0));
        if (st.flip !== undefined && st.flip !== 1) {
          ctx.translate(r.w / 2, 0);
          ctx.scale(Math.abs(st.flip) < 0.04 ? 0.04 * Math.sign(st.flip || 1) : st.flip, 1);
          ctx.translate(-r.w / 2, 0);
        }
        ctx.translate(r.foot, r.h);
        ctx.scale(st.sx || 1, st.sy || 1);
        ctx.translate(-r.foot, -r.h);
        parts();
        ctx.restore();
      }
      function drawMeerkat(st) {
        drawRig(st, () => {
          piece("mk_body", 0);
          piece("mk_head_" + (st.face || "open"), st.headRot || 0);
        });
      }
      function drawOtter(st) {
        drawRig(st, () => {
          piece("ot_body", 0);
          piece("ot_head_" + (st.face || "open"), st.headRot || 0);
          piece("ot_arm", st.armRot || 0);
        });
      }
      function drawGiraffe(st) {
        drawRig(st, () => {
          piece("gf_leg_back_far", -(st.leg || 0));
          piece("gf_leg_front_far", st.leg || 0);
          piece("gf_body", 0);
          piece("gf_leg_back", st.leg || 0);
          piece("gf_leg_front", -(st.leg || 0));
          piece("gf_neck_" + (st.face || "open"), st.headRot || 0);
        });
      }
      function drawElephant(st) {
        drawRig(st, () => {
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
          piece("el_trunk", st.trunk || 0);
          ctx.restore();
        });
      }
      function trunkTip(st) {
        let p = rotAbout(TRUNK_TIP, TRUNK_PIVOT, st.trunk || 0);
        p = rotAbout(p, EL_HEAD, st.headRot || 0);
        return rigToWorld(st, p);
      }
      function neckOf(st) {
        const r = RIG[st.kind];
        let p = r.neck;
        if (st.kind === "gf") p = rotAbout(p, [19, 34], st.headRot || 0);
        if (st.kind === "el") p = rotAbout(p, EL_HEAD, st.headRot || 0);
        return rigToWorld(st, p);
      }

      // ---------- 場景：草地（畫在 128x72 的世界畫布上，1 格 = 1 px） ----------
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
        cloud(((t * 1.6) % 160) - 20, 4, 12);
        cloud(((60 + t * 1.1) % 160) - 20, 10, 9);
        cloud(((110 + t * 1.3) % 160) - 20, 6, 10);
        triW(22, 30, 26, 47, "#A8D5A2");
        triW(70, 34, 22, 47, "#93C98E");
        triW(108, 28, 28, 47, "#A8D5A2");
        R(0, 46, GW, 26, "#B7DFA8");
        for (let y = 49; y < GH; y += 4) R(0, y, GW, 1, "#A6D497");
        for (let i = 0; i < 46; i++) {
          const x = Math.floor(hash(i, 7, 1) * GW);
          const y = 48 + Math.floor(hash(i, 7, 2) * 23);
          const c = ["#F6B7C8", "#FFFFFF", "#BFDDF5", "#FFD36B"][i % 4];
          R(x, y, 1, 1, c);
          if (i % 3 === 0) R(x, y + 1, 1, 1, "#7DBB76");
        }
        bush(-3, 44);
        bush(117, 45);
      }
      // 小小一團煙（吹蛋時從蛋殼口噴出）
      function puff(cx, cy, p) {
        if (p <= 0 || p >= 1) return;
        const fade = p < 0.5 ? 1 : 1 - (p - 0.5) / 0.5;
        for (let i = 0; i < 7; i++) {
          const a = Math.PI + (i / 6 - 0.5) * 1.6;
          const d = 1 + p * 6 * (0.6 + hash(i, 9, 1) * 0.6);
          const r = Math.round((1.2 + hash(i, 9, 2) * 1.4) * fade);
          if (r < 1) continue;
          const x0 = Math.round(cx + Math.cos(a) * d);
          const y0 = Math.round(cy + Math.sin(a) * d);
          for (let y = -r; y <= r; y++) {
            for (let x = -r; x <= r; x++) {
              const dd = x * x + y * y;
              if (dd > r * r) continue;
              ctx.fillStyle = dd > (r - 1) * (r - 1) ? "#C9C2D3" : "#FFFFFF";
              ctx.fillRect(x0 + x, y0 + y, 1, 1);
            }
          }
        }
      }

      // ---------- 時間軸 ----------
      // 站位（框左上角 x）
      const HOME = { mk: 23, ot: 34, gf: 40, el: 74 };
      const CAT_X = -6; // 小貓停在最左邊，從這裡把名牌拋給大家
      // 公布名字：每隻 2 秒，從 TAG_AT 起依序是狐獴、水獺、長頸鹿、大象
      const TAG_AT = 11.0;
      const TAGS = [
        { kind: "mk", cap: "cap_ethan", focus: [34, 44] },
        { kind: "ot", cap: "cap_ann", focus: [44, 46] },
        { kind: "gf", cap: "cap_charlotte", focus: [52, 34] },
        { kind: "el", cap: "cap_allen", focus: [84, 44] },
      ];
      const THROW = 0.55; // 每段開始後幾秒拋出名牌
      const FLY = 0.45; // 名牌飛行秒數
      const BLOW_AT = 7.9;
      const LAND_AT = 9.3;
      // 遊行：小貓先出發帶頭，動物依序跟上（框左上角從站位走到畫面外）
      const CAT_GO = [19.2, 23.4];
      const PARADE = { el: [21.2, 25.8], gf: [21.6, 26.4], ot: [22.0, 27.0], mk: [22.4, 27.6] };

      function paradeX(kind, t) {
        const [t0, t1] = PARADE[kind];
        return tw(t, t0, t1, HOME[kind], 140, "lin");
      }
      function walking(kind, t) {
        const [t0, t1] = PARADE[kind];
        return t >= t0 && t < t1 ? t - t0 : -1;
      }
      function tagState(i, t) {
        // 0：還沒掛；0~1：從貓手上飛過去；1：掛好
        const t0 = TAG_AT + 2 * i + THROW;
        return t < t0 ? 0 : tw(t, t0, t0 + FLY, 0, 1, "lin");
      }
      function celebrate(t) {
        return t >= LAND_AT + 0.1 && t < LAND_AT + 1.6;
      }

      function render(t) {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.imageSmoothingEnabled = false;
        ctx.fillStyle = "#1A1420";
        ctx.fillRect(0, 0, 1920, 1080);
        meadow(t);

        // 鏡頭：吹蛋時推近大象；公布名字時依序對準每一隻
        const camKeys = { x: [[0, 64], [5.0, 64], [6.0, 88, "io"], [BLOW_AT, 88], [BLOW_AT + 0.6, 64, "io"]], y: [[0, 36], [5.0, 36], [6.0, 42, "io"], [BLOW_AT, 42], [BLOW_AT + 0.6, 36, "io"]], z: [[0, 1], [5.0, 1], [6.0, 1.4, "io"], [BLOW_AT, 1.4], [BLOW_AT + 0.6, 1, "io"]] };
        const ZOOM = 1.25;
        TAGS.forEach((tg, i) => {
          const t0 = TAG_AT + 2 * i;
          const prev = i ? TAGS[i - 1].focus : [64, 36];
          camKeys.x.push([t0, prev[0]], [t0 + 0.6, tg.focus[0], "io"]);
          camKeys.y.push([t0, prev[1]], [t0 + 0.6, tg.focus[1], "io"]);
          camKeys.z.push([t0, i ? ZOOM : 1], [t0 + 0.6, ZOOM, "io"]);
        });
        const tEnd = TAG_AT + 2 * TAGS.length;
        const last = TAGS[TAGS.length - 1].focus;
        camKeys.x.push([tEnd, last[0]], [tEnd + 0.8, 64, "io"]);
        camKeys.y.push([tEnd, last[1]], [tEnd + 0.8, 36, "io"]);
        camKeys.z.push([tEnd, ZOOM], [tEnd + 0.8, 1, "io"]);
        const cam = { x: path(t, camKeys.x), y: path(t, camKeys.y), z: path(t, camKeys.z) };
        const z = cam.z;
        const vw = GW / z;
        const vh = GH / z;
        const cx = Math.min(GW - vw / 2, Math.max(vw / 2, cam.x));
        const cy = Math.min(GH - vh / 2, Math.max(vh / 2, cam.y));
        const k = P * z;
        ctx.setTransform(k, 0, 0, k, -(cx - vw / 2) * k, -(cy - vh / 2) * k);
        ctx.drawImage(world, 0, 0, GW, GH);

        const blown = t >= BLOW_AT;
        const landed = t >= LAND_AT;

        // ---- 大象 ----
        // 象鼻往上捲、把蛋舉在臉前（-2.5 rad），避免平舉時戳到長頸鹿
        const el = { kind: "el", x: paradeX("el", t), face: "open", ear: Math.sin(t * 2.2) * 0.06 };
        const inhale = tw(t, 6.0, 7.5, 0, 1, "io") * (blown ? 0 : 1);
        el.sx = el.sy = 1 + inhale * 0.1 + pop(t, BLOW_AT, -0.12, 0.6);
        el.headRot = -inhale * 0.12 + (blown ? pop(t, BLOW_AT, 0.15, 0.6) : 0);
        el.trunk = -2.5 - inhale * 0.12;
        if (t >= 7.5 && !blown) el.x += Math.sin(t * 90) * 0.35;
        el.ear = blown && t < BLOW_AT + 0.6 ? -0.35 : el.ear - inhale * 0.25;
        if (celebrate(t)) el.face = "happy";
        if (celebrate(t)) el.hop = jump(t, LAND_AT + 0.2, 0.45, 2);
        el.flip = tw(t, PARADE.el[0] - 0.5, PARADE.el[0] - 0.15, -1, 1, "io");
        const elWalk = walking("el", t);
        if (elWalk >= 0) {
          el.leg = Math.sin(elWalk * Math.PI * 3) * 0.25;
          el.hop = Math.abs(Math.sin(elWalk * Math.PI * 3)) * 0.8;
        }

        // ---- 長頸鹿 ----
        const gf = { kind: "gf", x: paradeX("gf", t), headRot: Math.sin(t * 1.3) * 0.03 };
        gf.headRot += tw(t, 6.0, 7.4, 0, 0.12) * (blown ? 0 : 1);
        if (blown && !landed) gf.headRot = tw(t, BLOW_AT, BLOW_AT + 0.4, 0.12, -0.3, "out");
        if (landed && t < LAND_AT + 0.6) gf.headRot = tw(t, LAND_AT, LAND_AT + 0.6, -0.3, 0, "io");
        if (celebrate(t)) {
          gf.face = "happy";
          gf.hop = jump(t, LAND_AT + 0.15, 0.5, 2.5);
        }

        // ---- 水獺 ----
        const ot = { kind: "ot", x: paradeX("ot", t), headRot: Math.sin(t * 1.7 + 1) * 0.04, armRot: 0 };
        if (blown && !landed) ot.headRot = -0.35;
        if (celebrate(t)) {
          ot.face = "happy";
          ot.hop = jump(t, LAND_AT + 0.1, 0.4, 3) + jump(t, LAND_AT + 0.6, 0.4, 3);
          ot.armRot = -0.5 + Math.sin(t * 30) * 0.3;
        }

        // ---- 狐獴（蛋掉在頭上） ----
        const mk = { kind: "mk", x: paradeX("mk", t), headRot: Math.sin(t * 2.1 + 2) * 0.04 };
        if (blown && !landed) mk.headRot = -0.3;
        if (landed) {
          mk.sy = 1 + pop(t, LAND_AT, -0.22, 0.6);
          mk.sx = 1 + pop(t, LAND_AT, 0.12, 0.6);
          mk.face = t < LAND_AT + 1.7 ? "dizzy" : "open";
          mk.headRot = t < LAND_AT + 1.7 ? Math.sin(t * 9) * 0.12 : mk.headRot;
        }

        // ---- 發名牌：被掛到的那隻開心跳一下 ----
        const rigs = { mk, ot, gf, el };
        TAGS.forEach((tg, i) => {
          const t0 = TAG_AT + 2 * i + THROW + FLY;
          if (t >= t0 && t < t0 + 1.0) {
            rigs[tg.kind].face = "happy";
            rigs[tg.kind].hop = (rigs[tg.kind].hop || 0) + jump(t, t0, 0.4, 2.5);
          }
        });
        // 遊行時一跳一跳
        ["gf", "ot", "mk"].forEach((kd) => {
          const w = walking(kd, t);
          if (w < 0) return;
          const r = rigs[kd];
          r.hop = Math.abs(Math.sin(w * Math.PI * 3.2)) * (kd === "gf" ? 1.2 : 2.2);
          if (kd === "gf") r.leg = Math.sin(w * Math.PI * 3.2) * 0.3;
          r.face = "happy";
        });

        // ---- 畫：後面的先畫 ----
        drawGiraffe(gf);
        drawElephant(el);
        drawOtter(ot);
        drawMeerkat(mk);

        // 蛋：帶殼 → 吹出去（剝好的蛋飛過去）→ 掉在狐獴頭上；空蛋殼留在象鼻尖
        const tip = trunkTip(el);
        // 蛋殼開口朝大象面對的方向（往左時轉 -90 度）
        piece(blown ? "egg_open" : "egg_shell", (Math.PI / 2) * el.flip, { ax: tip[0] + 2.5 * el.flip, ay: tip[1] - 0.5 });
        const head = rigToWorld(mk, [8, 2]);
        if (blown && !landed) {
          const u = (t - BLOW_AT) / (LAND_AT - BLOW_AT);
          const sx = tip[0] - 3;
          const sy = tip[1] - 0.5;
          const ex = head[0];
          const ey = head[1] - 4;
          const top = 4;
          const peak = Math.min(sy, ey) - top;
          const x = sx + (ex - sx) * u;
          const y = (1 - u) * (1 - u) * sy + 2 * u * (1 - u) * (2 * peak - (sy + ey) / 2) + u * u * ey;
          piece("egg_peeled", u * 9, { ax: x, ay: y, scale: 1.2 });
        }
        if (landed) piece("egg_peeled", 0, { ax: head[0], ay: head[1] - 4 + (t < LAND_AT + 0.3 ? -jump(t, LAND_AT, 0.3, 2) : 0), scale: 1.2 });
        puff(tip[0] - 5, tip[1] - 0.5, tw(t, BLOW_AT, BLOW_AT + 0.7, 0, 1, "lin"));
        // 暈頭轉向的星星
        if (landed && t < LAND_AT + 1.7) {
          for (let i = 0; i < 3; i++) {
            const a = t * 6 + (i * Math.PI * 2) / 3;
            piece("sparkle", 0, { ax: head[0] + Math.cos(a) * 5, ay: head[1] - 2 + Math.sin(a) * 1.6, scale: 0.8 });
          }
        }
        // 圍觀的歡呼
        if (celebrate(t)) {
          const u = tw(t, LAND_AT + 0.2, LAND_AT + 0.4, 0, 1, "back") * tw(t, LAND_AT + 1.3, LAND_AT + 1.6, 1, 0, "in");
          piece("sparkle", 0, { ax: 58, ay: 18, scale: u });
          piece("sparkle", 0, { ax: 48, ay: 30, scale: u * 0.8 });
          piece("sparkle", 0, { ax: 98, ay: 22, scale: u });
        }
        // 掛好的名牌（跟著脖子走）
        TAGS.forEach((tg, i) => {
          if (tagState(i, t) < 1) return;
          const n = neckOf(rigs[tg.kind]);
          const t1 = TAG_AT + 2 * i + THROW + FLY;
          const sw = Math.sin((t - t1) * 8) * 0.25 * Math.max(0, 1 - (t - t1) / 1.5);
          piece("name_tag", sw, { ax: n[0], ay: n[1], scale: 1 + pop(t, t1, 0.3, 0.5) });
        });

        // ---- 小貓：走進來 → 冒問號 → 一起歡呼 → 站在左邊拋名牌 → 帶頭走出畫面 ----
        const cat = { x: tw(t, 0, 3.4, -40, CAT_X, "lin"), y: 31, torso: "s_torso_belly_dress", arm: "s_arm_dress", head: "s_head_open_bow", armRot: -0.15, tail: Math.sin(t * 2) * 0.12 };
        if (t < 3.4) walkPose(cat, t * Math.PI * 3.2, 1);
        if (t >= 3.4 && t < 5.0) cat.headRot = tw(t, 3.5, 3.8, 0, -0.15, "out");
        if (celebrate(t)) {
          cat.head = "s_head_happy_bow";
          cat.hop = jump(t, LAND_AT + 0.25, 0.45, 2.5);
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
        if (t >= CAT_GO[0]) {
          cat.x = tw(t, CAT_GO[0], CAT_GO[1], CAT_X, 140, "lin");
          if (t < CAT_GO[1]) walkPose(cat, (t - CAT_GO[0]) * Math.PI * 3.6, 1);
        }
        drawCat(cat);
        if (tagFly) {
          // 從舉高的手（約 -1.4 rad）拋出，沿拋物線飛到脖子
          const hx = cat.x + 20 + Math.cos(-1.4) * 6.2;
          const hy = cat.y + 19 + Math.sin(-1.4) * 6.2;
          const n = neckOf(rigs[TAGS[tagFly.i].kind]);
          const u = tagFly.s;
          const arc = 6 + Math.abs(n[0] - hx) * 0.12;
          piece("name_tag", u * 8, { ax: hx + (n[0] - hx) * u, ay: hy + (n[1] - hy) * u - Math.sin(u * Math.PI) * arc });
        }
        // 小貓看到圍觀，冒問號
        if (t >= 3.6 && t < 5.4) {
          const u = tw(t, 3.6, 3.85, 0, 1.4, "back") * tw(t, 5.1, 5.4, 1, 0, "in");
          piece("question", Math.sin(t * 5) * 0.1, { ax: cat.x + 24, ay: cat.y - 2, scale: u });
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

      (window.EPISODES = window.EPISODES || []).push({ no: 2, title: '第二集', render, duration: DUR });
    })();
