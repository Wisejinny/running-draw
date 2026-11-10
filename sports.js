/*
 * sports.js — 종목 정의: 경기장 모양(직선·타원·활강 사면·수영장), 바닥·장애물·관중석, 속도·카메라 설정
 * Sports.create(api) -> { track, horse, cycle, rowing, ski, swim }
 *   api: { ctx, proj, quad, polyPath, clamp, mulberry, cam(), CW(), CH(), HZ(), time(), E(), raceState(), scene() }
 * 좌표: x = 진행 방향, y = 깊이(클수록 카메라에 가까움), z = 높이(m). 레인은 y 방향으로 나란히.
 */
(function (global) {
  'use strict';
  const TAU = Math.PI * 2;

  function create(api) {
    const ctx = api.ctx, P = (x, y, z) => api.proj(x, y, z || 0), clamp = api.clamp, quad = api.quad;
    const NEAR = 0.8;
    const lerp = (a, b, t) => a + (b - a) * t;
    const pick = (r, a) => a[Math.floor(r() * a.length)];

    // ---------- 타원형 트랙 (직선 L + 반원 둘레) ----------
    function ovalAt(L, r, w) { // 결승선(아래 직선 오른쪽 끝)에서 출발해 w만큼 진행한 위치
      const lap = 2 * L + TAU * r;
      w = ((w % lap) + lap) % lap;
      if (w < Math.PI * r) { const th = w / r; return { x: L / 2 + r * Math.sin(th), y: r * Math.cos(th), hx: Math.cos(th), hy: -Math.sin(th) }; }
      if (w < Math.PI * r + L) { const d = w - Math.PI * r; return { x: L / 2 - d, y: -r, hx: -1, hy: 0 }; }
      if (w < 2 * Math.PI * r + L) { const th = (w - Math.PI * r - L) / r; return { x: -L / 2 - r * Math.sin(th), y: -r * Math.cos(th), hx: -Math.cos(th), hy: Math.sin(th) }; }
      return { x: -L / 2 + (w - (2 * Math.PI * r + L)), y: r, hx: 1, hy: 0 };
    }
    // 구간 번호 u(0~4)로 같은 각도의 위치를 반지름이 다른 레인에서 구함 (바닥 띠·벽 그릴 때 사용)
    function ovalU(L, r, u) {
      u = ((u % 4) + 4) % 4;
      if (u < 1) { const th = u * Math.PI; return { x: L / 2 + r * Math.sin(th), y: r * Math.cos(th) }; }
      if (u < 2) return { x: L / 2 - (u - 1) * L, y: -r };
      if (u < 3) { const th = (u - 2) * Math.PI; return { x: -L / 2 - r * Math.sin(th), y: -r * Math.cos(th) }; }
      return { x: -L / 2 + (u - 3) * L, y: r };
    }
    function ovalPts(L, r, N) {
      const a = [];
      for (let i = 0; i <= N; i++) { const th = i / N * Math.PI; a.push({ x: L / 2 + r * Math.sin(th), y: r * Math.cos(th) }); }
      for (let i = 0; i <= N; i++) { const th = i / N * Math.PI; a.push({ x: -L / 2 - r * Math.sin(th), y: -r * Math.cos(th) }); }
      return a;
    }
    function ring(L, r1, r2, color) {
      ctx.beginPath(); api.polyPath(ovalPts(L, r2, 40)); api.polyPath(ovalPts(L, r1, 40));
      ctx.fillStyle = color; ctx.fill('evenodd');
    }
    function disc(L, r, color) { ctx.beginPath(); api.polyPath(ovalPts(L, r, 40)); ctx.fillStyle = color; ctx.fill(); }
    // 타원을 따라 가는 난간(높이 h) + 기둥
    function rail(L, r, h, color, lw, posts) {
      const lap = 2 * L + TAU * r, n = Math.round(lap / 3);
      ctx.strokeStyle = color; ctx.lineCap = 'round';
      for (const hh of [h, h * 0.55]) {
        ctx.beginPath(); let pen = false, wpx = 1;
        for (let i = 0; i <= n; i++) {
          const q = ovalAt(L, r, i * lap / n), s = P(q.x, q.y, hh);
          if (s.zc < NEAR || s.x < -300 || s.x > api.CW() + 300) { pen = false; continue; }
          wpx = Math.max(1.2, lw * s.k); if (pen) ctx.lineTo(s.x, s.y); else ctx.moveTo(s.x, s.y); pen = true;
        }
        ctx.lineWidth = wpx; ctx.stroke();
      }
      if (posts) {
        ctx.lineWidth = 1.5; ctx.beginPath();
        for (let i = 0; i < n; i += 2) { const q = ovalAt(L, r, i * lap / n), a = P(q.x, q.y, 0), b = P(q.x, q.y, h); if (a.zc < NEAR || a.x < -50 || a.x > api.CW() + 50) continue; ctx.lineWidth = Math.max(1.2, lw * a.k * 0.8); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); }
        ctx.stroke();
      }
    }
    // x 방향으로 쪼개서 그리는 띠 (경사·높이 따라가도록)
    function strip(x0, x1, y0, y1, color, step) {
      step = step || 12;
      for (let x = x0; x < x1; x += step) { const xe = Math.min(x1, x + step + 0.05); quad([{ x, y: y0 }, { x: xe, y: y0 }, { x: xe, y: y1 }, { x, y: y1 }], color); }
    }
    function line3(x0, y0, z0, x1, y1, z1, color, wm) {
      const a = P(x0, y0, z0), b = P(x1, y1, z1); if (a.zc < NEAR || b.zc < NEAR) return;
      ctx.strokeStyle = color; ctx.lineWidth = Math.max(1, wm * a.k); ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }
    function box3(x0, x1, y0, y1, z0, z1, top, front, side) { // 간단한 상자 (앞면 + 윗면 + 옆면)
      const a = P(x0, y1, z0), b = P(x1, y1, z1), tb = P(x0, y0, z1), tc = P(x1, y0, z1);
      if (a.zc < NEAR) return;
      ctx.fillStyle = top; ctx.beginPath(); ctx.moveTo(a.x, b.y); ctx.lineTo(b.x, b.y); ctx.lineTo(tc.x, tc.y); ctx.lineTo(tb.x, tb.y); ctx.closePath(); ctx.fill();
      ctx.fillStyle = front; ctx.fillRect(a.x, b.y, b.x - a.x, a.y - b.y);
      if (side) { const cam = api.cam(); const sx = cam.x < x0 ? x0 : x1; const s0 = P(sx, y1, z0), s1 = P(sx, y1, z1), s2 = P(sx, y0, z1), s3 = P(sx, y0, z0); if (cam.x < x0 || cam.x > x1) { ctx.fillStyle = side; ctx.beginPath(); ctx.moveTo(s0.x, s0.y); ctx.lineTo(s1.x, s1.y); ctx.lineTo(s2.x, s2.y); ctx.lineTo(s3.x, s3.y); ctx.closePath(); ctx.fill(); } }
    }

    // ---------- 관중 ----------
    const SKINS = ['#fde0c8', '#f6cfae', '#f1c27d', '#e0ac69', '#c68642', '#a86b3c', '#8d5524'];
    const HAIRS = ['#1b1714', '#2b1d14', '#3b2416', '#5a3420', '#a0662f', '#c99a5b', '#7a7f87'];
    const SHIRTS = ['#e74c3c', '#3498db', '#f1c40f', '#2ecc71', '#e84393', '#ffffff', '#ff9f43', '#9b59b6', '#00cec9', '#ff6b81', '#2d3436', '#74b9ff', '#fd9644'];
    const PANTS = ['#1e272e', '#273c75', '#2d3436', '#57606f', '#3c6382', '#6d4c2f'];
    const FLAGS = ['#e74c3c', '#3498db', '#f1c40f', '#2ecc71', '#ffffff', '#ff6b35'];

    function person(r, x, y, z, s) {
      return { x, y, z, s: s * (0.92 + r() * 0.16), shirt: pick(r, SHIRTS), pants: pick(r, PANTS), skin: pick(r, SKINS), hair: pick(r, HAIRS), ph: r() * TAU, flag: r() < 0.1 ? pick(r, FLAGS) : null, hat: r() < 0.14 };
    }
    // x 방향으로 늘어선 관중 줄들 (rows 개, 뒤로 갈수록 높아짐)
    function crowdX(seed, o) {
      const r = api.mulberry(seed), out = [];
      for (let i = 0; i < o.rows; i++) {
        const y = o.y - i * o.dy, z = o.z + i * o.dz, list = [];
        for (let x = o.x0 + r() * o.dx; x < o.x1; x += o.dx * (0.8 + r() * 0.4)) if (r() < (o.fill == null ? 0.92 : o.fill)) list.push(person(r, x + (r() - 0.5) * 0.5, y + (r() - 0.5) * 0.3, z, o.s || 1));
        out.push({ y, list });
      }
      return out;
    }
    // y 방향(옆 스탠드)으로 늘어선 관중: 6m 덩어리로 나눠서 깊이 정렬이 되게 함
    function crowdY(seed, o) {
      const r = api.mulberry(seed), out = [];
      for (let yy = o.y0; yy < o.y1; yy += 5) {
        const list = [];
        for (let i = 0; i < o.rows; i++) {
          const x = o.x + o.side * i * o.dx, z = o.z + i * o.dz;
          for (let y = yy + r() * o.dy; y < Math.min(o.y1, yy + 5); y += o.dy * (0.8 + r() * 0.4)) if (r() < 0.92) list.push(person(r, x + (r() - 0.5) * 0.3, y, z, o.s || 1));
        }
        out.push({ y: yy + 2.5, list });
      }
      return out;
    }
    function drawPerson(p, e, t) {
      const pr = P(p.x, p.y, p.z); if (pr.zc < 1.5 || pr.x < -30 || pr.x > api.CW() + 30) return;
      const sc = pr.k * 0.02 * p.s;
      if (sc * 90 < 2.6) { ctx.fillStyle = p.shirt; ctx.fillRect(pr.x - sc * 8, pr.y - sc * 72, sc * 16, sc * 40); ctx.fillStyle = p.skin; ctx.fillRect(pr.x - sc * 5, pr.y - sc * 86, sc * 10, sc * 13); return; }
      ctx.save(); ctx.translate(pr.x, pr.y); ctx.scale(sc, sc);
      const jump = e > 0.15 ? Math.abs(Math.sin(t * (4 + p.ph) + p.ph)) * 7 * e : 0;
      ctx.translate(0, -jump);
      ctx.fillStyle = p.pants; ctx.fillRect(-8, -36, 6.5, 36); ctx.fillRect(1.5, -36, 6.5, 36);
      ctx.fillStyle = p.shirt; ctx.beginPath(); ctx.moveTo(-10, -70); ctx.lineTo(10, -70); ctx.lineTo(9, -34); ctx.lineTo(-9, -34); ctx.closePath(); ctx.fill();
      const wave = e * (1.7 + 0.9 * Math.sin(t * 9 + p.ph * 3));
      const a = 0.28 + wave;
      ctx.lineCap = 'round'; ctx.lineWidth = 5.4;
      for (const sd of [-1, 1]) {
        const ang = sd < 0 ? a : 0.28 + e * (1.6 + 0.9 * Math.sin(t * 9 + p.ph * 3 + 2));
        const sx = sd * 9.5, hx = sx + sd * Math.sin(ang) * 27, hy = -66 + Math.cos(ang) * 27;
        ctx.strokeStyle = p.shirt; ctx.beginPath(); ctx.moveTo(sx, -66); ctx.lineTo(sx + (hx - sx) * 0.55, -66 + (hy + 66) * 0.55); ctx.stroke();
        ctx.strokeStyle = p.skin; ctx.beginPath(); ctx.moveTo(sx + (hx - sx) * 0.55, -66 + (hy + 66) * 0.55); ctx.lineTo(hx, hy); ctx.stroke();
        if (p.flag && sd > 0 && e > 0.1) { ctx.strokeStyle = '#8a6a45'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(hx + 1, hy - 28); ctx.stroke(); ctx.fillStyle = p.flag; ctx.beginPath(); ctx.moveTo(hx + 1, hy - 28); ctx.lineTo(hx + 17 + 4 * Math.sin(t * 8 + p.ph), hy - 23); ctx.lineTo(hx + 1, hy - 17); ctx.fill(); ctx.lineWidth = 5.4; }
      }
      ctx.fillStyle = p.skin; ctx.beginPath(); ctx.arc(0, -80, 8, 0, TAU); ctx.fill();
      ctx.fillStyle = p.hair; ctx.beginPath(); ctx.arc(0, -82, 8.4, Math.PI, TAU); ctx.fill();
      if (p.hat) { ctx.fillStyle = p.shirt; ctx.fillRect(-9, -90, 18, 5); ctx.fillRect(-9, -86, 14, 2); }
      if (e > 0.5) { ctx.fillStyle = '#7a2e2e'; ctx.beginPath(); ctx.ellipse(1.5, -77, 2.2, 1.2 + e * 1.4, 0, 0, TAU); ctx.fill(); }
      ctx.restore();
    }
    function rowItems(rows) {
      return rows.map((row) => ({ y: row.y, fn: () => { const e = api.E(), t = api.time(); for (const p of row.list) drawPerson(p, e, t); } }));
    }
    // 계단식 관중석 (콘크리트 단 + 관중)
    function stepsX(x0, x1, y, rows, dy, dz, z0, topC, riseC) {
      for (let i = rows - 1; i >= 0; i--) {
        const yi = y - i * dy, zi = z0 + i * dz;
        quad([{ x: x0, y: yi + dy, z: zi }, { x: x1, y: yi + dy, z: zi }, { x: x1, y: yi, z: zi }, { x: x0, y: yi, z: zi }], topC);
        quad([{ x: x0, y: yi + dy, z: zi - dz }, { x: x1, y: yi + dy, z: zi - dz }, { x: x1, y: yi + dy, z: zi }, { x: x0, y: yi + dy, z: zi }], riseC);
      }
    }

    // ---------- 공통: 광고판 띠 / 결승 장식 ----------
    function boardsX(x0, x1, y, z0, h, c1, c2) {
      const step = 6;
      for (let x = x0; x < x1; x += step) {
        const k = Math.round(x / step) % 2 ? c1 : c2;
        const a = P(x, y, z0), b = P(x + step, y, z0 + h); if (a.zc < NEAR || b.x < -50 || a.x > api.CW() + 50) continue;
        ctx.fillStyle = k; ctx.fillRect(a.x, b.y, b.x - a.x + 0.6, a.y - b.y);
      }
    }

    // =====================================================================
    //  종목 정의
    // =====================================================================
    const S = {};
    function niceTicks(disp) { const step = [25, 50, 100, 250, 500].find((s) => disp / s <= 4) || 500; const a = []; for (let m = 0; m <= disp + 0.1; m += step) a.push({ p: m / disp, label: m + 'm' }); return a; }
    const mkStraight = (id, o) => Object.assign({
      id, oval: null, terrain: null, sprRot: () => 0, lift: () => 0,
      lapLen: () => Infinity,
      pos: (r, q) => ({ x: q, y: r, hx: 1, hy: 0, lift: 0 }),
      q0: () => 0,
      finish: (t) => ({ x: t.D, y0: 0, y1: t.W }),
      ticks: (t, d) => niceTicks(d.disp),
      setup() {}, ground() {}, items: () => [], bell: null
    }, o);

    // ---- 육상 (기존 트랙) ----
    S.track = mkStraight('track', {
      label: '육상', icon: '🏃', verb: '달리는 중', laneW: 1.9, usesScene: true, hurdles: true, photo: null,
      dists: [{ v: '100', label: '100m', disp: 100, D: () => 100 }, { v: '200', label: '200m', disp: 200, D: () => 200 }, { v: '300', label: '300m', disp: 300, D: () => 300 }], defDist: '100',
      time: (D) => 4 + D * 0.07, cad: { mode: 'dist', len: 4.1 }, sfx: 'step',
      cam: (W) => ({ back: 7.5 + W * 0.5, ratio: 0.45, spread: 0.3, maxSpread: 16, ahead: 3 }),
      setup(t) {
        this.rows = [...crowdX(101, { x0: -30, x1: t.D + 50, y: -4.2, z: 0, dx: 1.05, dy: 1.4, dz: 0, rows: 2, s: 1 })];
      },
      ground(t) {
        const sc = api.scene(); const x0 = -25, x1 = t.D + 60, W = t.W;
        quad([{ x: x0, y: -0.5 }, { x: x1, y: -0.5 }, { x: x1, y: W + 0.5 }, { x: x0, y: W + 0.5 }], sc.surface);
        ctx.globalAlpha = 0.9;
        for (let i = 0; i <= t.lanes; i++) { const r = i * t.laneW; quad([{ x: x0, y: r - 0.03 }, { x: x1, y: r - 0.03 }, { x: x1, y: r + 0.03 }, { x: x0, y: r + 0.03 }], sc.lines); }
        for (let m = 10; m < t.D; m += 10) quad([{ x: m - 0.05, y: -0.45 }, { x: m + 0.05, y: -0.45 }, { x: m + 0.05, y: -0.1 }, { x: m - 0.05, y: -0.1 }], sc.lines);
        ctx.globalAlpha = 1;
        boardsX(x0, x1, -2.6, 0, 1.0, '#2d6cdf', '#ffffff');
      },
      items() { return rowItems(this.rows); }
    });

    // ---- 경주마 (타원 잔디·모래 트랙) ----
    const HL = 95, HR0 = 36;
    S.horse = mkStraight('horse', {
      label: '경주마', icon: '🏇', verb: '달리는 중', laneW: 3.0, usesScene: false, photo: 'racecourse',
      oval: { L: HL, R0: HR0 },
      dists: [{ v: '1000', label: '1000m', disp: 1000, frac: 0.5 }, { v: '2000', label: '2000m', disp: 2000, frac: 1 }, { v: '3000', label: '3000m', disp: 3000, frac: 1.5 }], defDist: '1000',
      D: (d, t) => d.frac * (2 * HL + TAU * t.rIn),
      time: (D) => 6 + D * 0.052, cad: { mode: 'dist', len: 6.6 }, sfx: 'thud', bellFrac: null,
      cam: (W) => ({ back: 9 + W * 0.3, ratio: 0.4, spread: 0.2, maxSpread: 12, ahead: 8 }),
      lapLen: (r) => 2 * HL + TAU * r,
      pos: (r, q) => Object.assign(ovalAt(HL, r, q), { lift: 0 }),
      q0: (r, D) => { const Lr = 2 * HL + TAU * r; return ((Lr - (D % Lr)) % Lr + Lr) % Lr; },
      finish: (t) => ({ x: HL / 2, y0: HR0, y1: HR0 + t.W }),
      ticks: (t, d) => niceTicks(d.disp),
      setup(t) {
        const Rout = HR0 + t.W; this.rows = crowdX(202, { x0: -HL / 2 - 40, x1: HL / 2 + 40, y: -(Rout + 8), z: 0.4, dx: 1.1, dy: 1.5, dz: 1.0, rows: 7, s: 1.05 });
        this.rowsEnd = [...crowdY(203, { x: HL / 2 + Rout + 8, y0: -22, y1: 22, z: 0.4, dz: 1.0, dx: 1.5, dy: 1.1, rows: 5, side: 1, s: 1.05 }), ...crowdY(204, { x: -HL / 2 - Rout - 8, y0: -22, y1: 22, z: 0.4, dz: 1.0, dx: 1.5, dy: 1.1, rows: 5, side: -1, s: 1.05 })];
      },
      ground(t) {
        const Rout = HR0 + t.W;
        ring(HL, Rout + 0.8, Rout + 80, '#79b05a');
        ring(HL, HR0 - 0.6, Rout + 0.6, '#b9895a');
        for (let i = 1; i < t.lanes; i++) ring(HL, HR0 + i * t.laneW - 0.06, HR0 + i * t.laneW + 0.06, 'rgba(120,80,45,0.35)');
        disc(HL, HR0 - 0.6, '#6aab4e');
        for (let i = 0; i < 6; i++) { const h = i / 6; ring(HL, HR0 - 0.6 - (h + 0.05) * (HR0 - 4), HR0 - 0.6 - h * (HR0 - 4) - 0.2, i % 2 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)'); }
        // 관중석 계단 (먼 쪽 직선 + 양끝)
        stepsX(-HL / 2 - 40, HL / 2 + 40, -(Rout + 8) + 1.5, 7, 1.5, 1.0, 0, '#a8adb5', '#8d939c');
        // 난간
        rail(HL, HR0 - 1.0, 1.1, '#ffffff', 0.12, true);
        rail(HL, Rout + 1.0, 1.1, '#ffffff', 0.12, true);
      },
      items(t) {
        const out = [...rowItems(this.rows), ...rowItems(this.rowsEnd)];
        // 출발 게이트 (출발 직전까지)
        const st = api.raceState();
        if (st === 'idle' || st === 'countdown') {
          const gate = () => {
            for (let i = 0; i <= t.lanes; i++) {
              const r = HR0 + i * t.laneW, q = this.q0(r, t.D), a = ovalAt(HL, r, q);
              const nx = -a.hy, ny = a.hx; // 레인 바깥쪽 법선 방향
              const f = (d) => ({ x: a.x + a.hx * d, y: a.y + a.hy * d });
              const p0 = f(0), p1 = f(3.2);
              line3(p0.x, p0.y, 0, p0.x, p0.y, 2.4, '#c9ced6', 0.2); line3(p1.x, p1.y, 0, p1.x, p1.y, 2.4, '#c9ced6', 0.2);
              line3(p0.x, p0.y, 2.4, p1.x, p1.y, 2.4, '#e74c3c', 0.2);
              void nx; void ny;
            }
          };
          out.push({ y: HR0 + t.W * 0.5, fn: gate });
        }
        // 결과 판독 타워 + 총득 전광판 (안쪽 잔디)
        out.push({ y: -(HR0 - 8), fn: () => { box3(HL / 2 - 10, HL / 2 + 10, -(HR0 - 12) - 5, -(HR0 - 12), 0, 6, '#dfe3e8', '#f2f4f7', '#c9ced6'); const a = P(HL / 2, -(HR0 - 12), 5.3); ctx.fillStyle = '#1e272e'; ctx.fillRect(a.x - 8 * a.k, a.y - 2.2 * a.k, 16 * a.k, 2.4 * a.k); } });
        return out;
      }
    });

    // ---- 사이클 (벨로드롬) ----
    const CL = 42, CR0 = 19;
    function bank(r, u) { // 레인 높이: 직선은 완만, 커브는 가파르게
      const uu = ((u % 4) + 4) % 4, f = uu % 2;
      const curve = (uu < 1 || (uu >= 2 && uu < 3));
      const slope = curve ? 0.1 + 0.4 * Math.pow(Math.sin(f * Math.PI), 0.55) : 0.1;
      return (r - CR0) * slope;
    }
    function uOfW(r, w) { // 진행 거리 w → 구간 번호 u (뱅크 높이 계산용)
      const lap = 2 * CL + TAU * r; w = ((w % lap) + lap) % lap;
      if (w < Math.PI * r) return w / (Math.PI * r);
      if (w < Math.PI * r + CL) return 1 + (w - Math.PI * r) / CL;
      if (w < 2 * Math.PI * r + CL) return 2 + (w - Math.PI * r - CL) / (Math.PI * r);
      return 3 + (w - 2 * Math.PI * r - CL) / CL;
    }
    S.cycle = mkStraight('cycle', {
      label: '사이클', icon: '🚴', verb: '질주 중', laneW: 1.25, usesScene: false, photo: 'velodrome',
      oval: { L: CL, R0: CR0 },
      dists: [{ v: '250', label: '250m (1바퀴)', disp: 250, frac: 1 }, { v: '500', label: '500m (2바퀴)', disp: 500, frac: 2 }, { v: '750', label: '750m (3바퀴)', disp: 750, frac: 3 }], defDist: '500',
      D: (d, t) => d.frac * (2 * CL + TAU * t.rIn),
      time: (D) => 7 + D * 0.045, cad: { mode: 'dist', len: 6.2 }, sfx: 'tick',
      cam: (W) => ({ back: 8 + W * 0.36, ratio: 0.4, spread: 0.2, maxSpread: 9, ahead: 7 }),
      lapLen: (r) => 2 * CL + TAU * r,
      pos: (r, q) => { const a = ovalAt(CL, r, q); a.lift = bank(r, uOfW(r, q)); return a; },
      q0: (r, D) => { const Lr = 2 * CL + TAU * r; return ((Lr - (D % Lr)) % Lr + Lr) % Lr; },
      finish: (t) => ({ x: CL / 2, y0: CR0, y1: CR0 + t.W }),
      ticks: (t, d) => { const a = []; const lapD = d.disp / d.frac; for (let i = 0; i <= d.frac; i++) a.push({ p: i / d.frac, label: i === 0 ? '출발' : i + '바퀴' }); void lapD; return a; },
      bell: true,
      setup(t) {
        const Rout = CR0 + t.W, zw = bank(Rout, 1.5);
        this.zw = zw;
        this.rows = crowdX(303, { x0: -CL / 2 - 38, x1: CL / 2 + 38, y: -(Rout + 4.5), z: zw + 1.6, dx: 1.0, dy: 1.3, dz: 0.95, rows: 7, s: 1.0 });
        this.rowsEnd = [...crowdY(304, { x: CL / 2 + Rout + 4.5, y0: -Rout - 2, y1: Rout + 2, z: 1.0, dz: 0.95, dx: 1.3, dy: 1.0, rows: 6, side: 1, s: 1.0 }), ...crowdY(305, { x: -CL / 2 - Rout - 4.5, y0: -Rout - 2, y1: Rout + 2, z: 1.0, dz: 0.95, dx: 1.3, dy: 1.0, rows: 6, side: -1, s: 1.0 })];
      },
      ground(t) {
        const Rout = CR0 + t.W + 0.5, W = Rout - CR0;
        // 안쪽 파란 띠와 안쪽 마루
        ring(CL, CR0 - 6, CR0 - 0.01, '#5aa9e6'); disc(CL, CR0 - 6, '#e9eef3');
        ring(CL, CR0 - 0.45, CR0 - 0.01, '#f4f4f4');
        // 나무 트랙 띠 (뱅킹 높이를 반영)
        const N = 160;
        for (let i = 0; i < N; i++) {
          const u0 = i / N * 4, u1 = (i + 1) / N * 4, a0 = ovalU(CL, CR0, u0), a1 = ovalU(CL, CR0, u1), b0 = ovalU(CL, Rout, u0), b1 = ovalU(CL, Rout, u1);
          const col = i % 2 ? '#d6a560' : '#d0a05a';
          quad([{ x: a0.x, y: a0.y, z: bank(CR0, u0) }, { x: b0.x, y: b0.y, z: bank(Rout, u0) }, { x: b1.x, y: b1.y, z: bank(Rout, u1) }, { x: a1.x, y: a1.y, z: bank(CR0, u1) }], col);
        }
        // 선 (스프린터 라인 빨강, 스테이어 라인 파랑, 바깥 흰선)
        const lines = [[0.04, '#e74c3c', 0.16], [0.5, '#2b6cdf', 0.16], [W - 0.2, '#ffffff', 0.12]];
        for (const [off, col, wd] of lines) {
          ctx.strokeStyle = col; ctx.lineCap = 'round'; ctx.beginPath(); let pen = false, wpx = 1;
          for (let i = 0; i <= N; i++) { const u = i / N * 4, q = ovalU(CL, CR0 + off, u), s = P(q.x, q.y, bank(CR0 + off, u)); if (s.zc < NEAR) { pen = false; continue; } wpx = Math.max(1, wd * s.k); if (pen) ctx.lineTo(s.x, s.y); else ctx.moveTo(s.x, s.y); pen = true; }
          ctx.lineWidth = wpx; ctx.stroke();
        }
        // 바깥 벽: 먼 쪽만 (카메라 쪽 벽은 선수를 가리지 않게 생략)
        for (let i = 0; i < N; i++) {
          const u0 = i / N * 4, u1 = (i + 1) / N * 4, b0 = ovalU(CL, Rout, u0), b1 = ovalU(CL, Rout, u1);
          if ((b0.y + b1.y) / 2 > 4) continue;
          const z0 = bank(Rout, u0), z1 = bank(Rout, u1);
          quad([{ x: b0.x, y: b0.y, z: z0 }, { x: b1.x, y: b1.y, z: z1 }, { x: b1.x, y: b1.y, z: z1 + 1.3 }, { x: b0.x, y: b0.y, z: z0 + 1.3 }], i % 4 < 2 ? '#2848a8' : '#f4f6fa');
        }
        // 관중 계단
        const Ro = CR0 + t.W; const zw = this.zw;
        stepsX(-CL / 2 - 38, CL / 2 + 38, -(Ro + 4.5) + 1.3, 7, 1.3, 0.95, zw + 0.5, '#8d96a6', '#6f7888');
      },
      items(t) {
        const out = [...rowItems(this.rows), ...rowItems(this.rowsEnd)];
        // 결승 전광판 아치는 app 에서 그림. 안쪽 코치 + 카메라 장비
        out.push({ y: -(CR0 - 3), fn: () => box3(-8, 8, -(CR0 - 3) - 1.5, -(CR0 - 3), 0, 1.0, '#dfe5ee', '#2848a8', '#1c3480') });
        return out;
      }
    });

    // ---- 조정 (직선 레가타 코스) ----
    S.rowing = mkStraight('rowing', {
      label: '조정', icon: '🚣', verb: '젓는 중', laneW: 3.7, usesScene: false, photo: 'regatta',
      dists: [{ v: '500', label: '500m', disp: 500, D: () => 125 }, { v: '1000', label: '1000m', disp: 1000, D: () => 250 }, { v: '2000', label: '2000m', disp: 2000, D: () => 500 }], defDist: '1000',
      time: (D) => 8 + D * 0.064, cad: { mode: 'time', hz: (v) => 0.55 + 0.05 * v }, sfx: 'splash',
      cam: (W) => ({ back: 8 + W * 0.52, ratio: 0.5, spread: 0.2, maxSpread: 18, ahead: 12 }),
      setup(t) {
        const far = -(t.W * 0.4 + 26);
        this.rowsFar = crowdX(404, { x0: t.D - 80, x1: t.D + 60, y: far, z: 0.4, dx: 1.2, dy: 1.4, dz: 0.9, rows: 5, s: 1.1 });
        this.rowsNear = crowdX(405, { x0: t.D - 60, x1: t.D + 50, y: t.W + 14, z: 0.6, dx: 1.3, dy: 1.3, dz: 0.0, rows: 2, s: 1.15 });
        this.rowsMid = crowdX(406, { x0: -10, x1: t.D - 70, y: -(t.W * 0.4 + 24), z: 0.4, dx: 5.5, dy: 1.4, dz: 0.0, rows: 1, s: 1.1, fill: 0.55 });
      },
      ground(t) {
        const cx = api.cam().x, W = t.W;
        const x0 = Math.max(-40, cx - 140), x1 = Math.min(t.D + 70, cx + 160);
        // 레인 구분 (은은한 줄)
        for (let i = 0; i < t.lanes; i++) quad([{ x: x0, y: i * t.laneW }, { x: x1, y: i * t.laneW }, { x: x1, y: (i + 1) * t.laneW }, { x: x0, y: (i + 1) * t.laneW }], i % 2 ? 'rgba(255,255,255,0.07)' : 'rgba(0,40,80,0.07)');
        // 물결 반짝임
        const tm = api.time();
        ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.lineWidth = 1.1; ctx.beginPath();
        for (let i = 0; i < 90; i++) {
          const wx = Math.floor(cx / 8) * 8 + ((i * 53) % 300) - 150 + Math.sin(tm * 0.8 + i) * 1.2, wy = -30 + ((i * 37) % (W + 60));
          const a = P(wx, wy, 0), b = P(wx + 2.2, wy, 0); if (a.zc > NEAR) { ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); }
        }
        ctx.stroke();
        // 레인 경계 부표 줄 (주황·흰색)
        for (let i = 0; i <= t.lanes; i++) {
          const y = i * t.laneW; const a = P(x0, y, 0), b = P(x1, y, 0); if (a.zc < NEAR) continue;
          ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = Math.max(1, 0.12 * a.k); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
          ctx.strokeStyle = '#ff7a2f'; ctx.lineWidth = Math.max(1.4, 0.34 * a.k); ctx.setLineDash([0.45 * a.k, 0.95 * a.k]); ctx.lineDashOffset = -((x0 % 1.4) * a.k); ctx.beginPath(); ctx.moveTo(a.x, a.y - 0.05 * a.k); ctx.lineTo(b.x, b.y - 0.05 * a.k); ctx.stroke(); ctx.setLineDash([]);
        }
        // 500m 표지
        for (let m = 0; m <= t.D + 0.1; m += t.D / 4) {
          const a = P(m, -1, 0), b = P(m, -1, 3.2); if (a.zc < NEAR) continue;
          ctx.strokeStyle = '#ffffff'; ctx.lineWidth = Math.max(1.4, 0.16 * a.k); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
          ctx.fillStyle = '#ff7a2f'; ctx.fillRect(b.x - 0.8 * a.k, b.y, 1.6 * a.k, 1.3 * a.k);
        }
        // 먼 쪽 기슭의 관중석 계단
        const far = -(W * 0.4 + 26); stepsX(t.D - 80, t.D + 60, far + 1.4, 5, 1.4, 0.9, 0, '#c8ccd2', '#a9aeb6');
      },
      items(t) {
        const out = [...rowItems(this.rowsFar), ...rowItems(this.rowsNear), ...rowItems(this.rowsMid)];
        // 출발대 (뗏목 + 말뚝)
        out.push({ y: t.W + 1, fn: () => { box3(-12, -2, -1, t.W + 2, -0.1, 0.35, '#e8dcc0', '#cdbf9f', '#b8a888'); for (let i = 0; i <= t.lanes; i++) line3(-2.2, i * t.laneW, 0.2, -2.2, i * t.laneW, 1.4, '#f4f4f4', 0.18); } });
        // 결승 타워 (먼 쪽)
        out.push({ y: -(t.W * 0.4 + 24), fn: () => { const fx = t.D, fy = -(t.W * 0.4 + 24); box3(fx - 3, fx + 3, fy - 3, fy, 0, 9, '#eef1f5', '#f7f8fa', '#cfd5dc'); const a = P(fx, fy, 9.2); ctx.fillStyle = '#e74c3c'; ctx.fillRect(a.x - 4 * a.k, a.y - 1.2 * a.k, 8 * a.k, 1.3 * a.k); for (let i = 0; i < 4; i++) { const f = P(fx + 3 + i * 1.8, fy - 1, 0), g = P(fx + 3 + i * 1.8, fy - 1, 7); ctx.strokeStyle = '#fff'; ctx.lineWidth = Math.max(1, 0.1 * f.k); ctx.beginPath(); ctx.moveTo(f.x, f.y); ctx.lineTo(g.x, g.y); ctx.stroke(); ctx.fillStyle = ['#e74c3c', '#3498db', '#f1c40f', '#2ecc71'][i]; ctx.fillRect(g.x, g.y, 1.7 * f.k, 1.1 * f.k); } } });
        return out;
      }
    });

    // ---- 스키 (활강 사면 + 병행 대회전) ----
    const SLOPE = 0.16, GATE = 14, AMP = 0.3;
    S.ski = mkStraight('ski', {
      label: '스키', icon: '⛷', verb: '활강 중', laneW: 3.8, usesScene: false, photo: 'skislope',
      dists: [{ v: '500', label: '500m', disp: 500, D: () => 125 }, { v: '1000', label: '1000m', disp: 1000, D: () => 250 }, { v: '1500', label: '1500m', disp: 1500, D: () => 375 }], defDist: '1000',
      time: (D) => 7 + D * 0.05, cad: { mode: 'dist', len: GATE * 2 }, sfx: 'whoosh', sloped: true,
      cam: (W) => ({ back: 8 + W * 0.52, ratio: 0.36, spread: 0.2, maxSpread: 14, ahead: 10 }),
      terrain(x, t) { const D = (t && t.D) || 250, e = D + 6; if (x <= e) return -SLOPE * x; const d = Math.min(x - e, 40); return -SLOPE * e - SLOPE * (d - d * d / 80) - (x - e > 40 ? 0 : 0); },
      sprRot(x, t) { const e = ((t && t.D) || 250) + 6; if (x <= e) return Math.atan(SLOPE); const d = clamp(x - e, 0, 40); return Math.atan(SLOPE * (1 - d / 40)); },
      pos(r, q) {
        const ph0 = Math.PI / 2 - TAU * 8 / (GATE * 2), arg = TAU * q / (GATE * 2) + ph0;
        const amp = AMP * 3.8 * 0.5 * 1.5; // 레인 반폭의 약 절반
        return { x: q, y: r + amp * Math.sin(arg), hx: 1, hy: amp * TAU / (GATE * 2) * Math.cos(arg), lift: 0, lean: Math.abs(Math.cos(arg)) };
      },
      setup(t) {
        this.t = t;
        this.rowsN = crowdX(504, { x0: 0, x1: t.D + 25, y: t.W + 7, z: 0, dx: 1.5, dy: 1.3, dz: 0, rows: 2, s: 1.1 });
        this.rowsF = crowdX(505, { x0: 0, x1: t.D + 25, y: -9, z: 0, dx: 1.3, dy: 1.4, dz: 0.25, rows: 3, s: 1.1 });
        this.rowsFin = crowdX(506, { x0: t.D - 30, x1: t.D + 35, y: -14, z: 0.2, dx: 1.0, dy: 1.3, dz: 0.8, rows: 5, s: 1.1 });
      },
      ground(t) {
        const W = t.W, x0 = -30, x1 = t.D + 60;
        // 레인 색 (빨강/파랑 코스) + 눈 질감
        for (let i = 0; i < t.lanes; i++) strip(x0, x1, i * t.laneW, (i + 1) * t.laneW, i % 2 ? 'rgba(80,140,230,0.13)' : 'rgba(230,80,80,0.12)', 10);
        // 코스 가장자리 (파랑 선)
        strip(x0, x1, -0.12, 0.12, 'rgba(70,120,200,0.55)', 10); strip(x0, x1, W - 0.12, W + 0.12, 'rgba(70,120,200,0.55)', 10);
        // 스키 자국
        for (let i = 0; i < t.lanes; i++) for (const o of [-0.25, 0.25]) strip(x0, x1, (i + 0.5) * t.laneW + o - 0.05, (i + 0.5) * t.laneW + o + 0.05, 'rgba(120,150,190,0.22)', 10);
        // 안전 그물 (주황) 양쪽
        for (const y of [-2.2, W + 2.2]) for (let x = x0; x < x1; x += 10) { const xe = x + 10.05; quad([{ x, y, z: 0 }, { x: xe, y, z: 0 }, { x: xe, y, z: 1.6 }, { x, y, z: 1.6 }], 'rgba(255,120,30,0.78)'); quad([{ x, y, z: 1.6 }, { x: xe, y, z: 1.6 }, { x: xe, y, z: 1.7 }, { x, y, z: 1.7 }], '#ffffff'); }
      },
      items(t) {
        const out = [...rowItems(this.rowsN), ...rowItems(this.rowsF), ...rowItems(this.rowsFin)];
        // 깃대 (레인마다 번갈아 빨강/파랑)
        const poles = [];
        for (let i = 0; i < t.lanes; i++) for (let g = 0; g < Math.floor(t.D / GATE); g++) poles.push({ x: 10 + g * GATE, y: (i + 0.5) * t.laneW, c: i % 2 ? '#2b6cdf' : '#e74c3c' });
        const cx = api.cam().x;
        for (const p of poles) { if (Math.abs(p.x - cx) > 60) continue; out.push({ y: p.y, fn: () => { const a = P(p.x, p.y, 0), b = P(p.x, p.y, 2.0); if (a.zc < NEAR) return; ctx.strokeStyle = p.c; ctx.lineWidth = Math.max(1.4, 0.1 * a.k); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); ctx.fillStyle = p.c; ctx.beginPath(); const w = api.time(); ctx.moveTo(b.x, b.y); ctx.lineTo(b.x + 1.1 * a.k, b.y + 0.18 * a.k + Math.sin(w * 6 + p.x) * 0.06 * a.k); ctx.lineTo(b.x, b.y + 0.55 * a.k); ctx.fill(); } }); }
        // 출발 오두막 + 출발선 막대
        out.push({ y: t.W + 1.5, fn: () => { box3(-7, -2, 1, t.W + 2.5, 0, 3.2, '#e6edf5', '#3d7ec9', '#2f69ad'); const a = P(-2, t.W + 2.5, 3.4); ctx.fillStyle = '#e74c3c'; ctx.fillRect(a.x - 5 * a.k, a.y - 0.6 * a.k, 5 * a.k, 0.8 * a.k); line3(-0.3, 0, 0.9, -0.3, t.W, 0.9, '#f4f4f4', 0.12); } });
        return out;
      }
    });

    // ---- 수영 (50m 풀) ----
    S.swim = mkStraight('swim', {
      label: '수영', icon: '🏊', verb: '수영 중', laneW: 2.5, usesScene: false, photo: 'pool',
      dists: [{ v: '50', label: '50m', disp: 50, D: () => 50 }, { v: '100', label: '100m', disp: 100, D: () => 100 }, { v: '200', label: '200m', disp: 200, D: () => 200 }], defDist: '50',
      time: (D) => 7 + D * 0.16, cad: { mode: 'time', hz: (v) => 0.55 + 0.17 * v }, sfx: 'splash',
      cam: (W) => ({ back: 7.5 + W * 0.5, ratio: 0.5, spread: 0.25, maxSpread: 14, ahead: 4, pool: true }),
      pos(r, q) { // 50m 를 왕복
        const m = q % 100, fwd = m <= 50;
        return { x: fwd ? m : 100 - m, y: r, hx: fwd ? 1 : -1, hy: 0, lift: 0 };
      },
      finish: (t) => { const lens = Math.max(1, Math.round(t.D / 50)); return { x: lens % 2 ? 50 : 0, y0: 0, y1: t.W }; },
      ticks: (t, d) => niceTicks(d.disp),
      setup(t) {
        const W = t.W;
        this.rowsFar = crowdX(604, { x0: -10, x1: 62, y: -(W * 0 + 9), z: 0.5, dx: 1.0, dy: 1.3, dz: 0.8, rows: 7, s: 1.0 });
        this.rowsEnd = [...crowdY(605, { x: 60, y0: -14, y1: W + 8, z: 0.5, dz: 0.8, dx: 1.3, dy: 1.0, rows: 5, side: 1, s: 1.0 }), ...crowdY(606, { x: -9, y0: -14, y1: W + 8, z: 0.5, dz: 0.8, dx: 1.3, dy: 1.0, rows: 5, side: -1, s: 1.0 })];
        this.rowsDeck = crowdX(607, { x0: -4, x1: 54, y: W + 6.5, z: 0, dx: 6, dy: 1.3, dz: 0, rows: 1, s: 1.05, fill: 0.5 });
      },
      ground(t) {
        const W = t.W, cx = api.cam().x, tm = api.time();
        // 풀 데크 (흰 타일 + 파란 줄)
        quad([{ x: -14, y: -8.5 }, { x: 64, y: -8.5 }, { x: 64, y: W + 8 }, { x: -14, y: W + 8 }], '#e9eef2');
        quad([{ x: -14, y: -8.5 }, { x: 64, y: -8.5 }, { x: 64, y: -7.4 }, { x: -14, y: -7.4 }], '#2b79c2');
        quad([{ x: -14, y: W + 1.2 }, { x: 64, y: W + 1.2 }, { x: 64, y: W + 1.5 }, { x: -14, y: W + 1.5 }], '#2b79c2');
        // 물
        const bands = 5; for (let b = 0; b < bands; b++) { const y0 = -0.4 + (W + 0.8) * b / bands, y1 = -0.4 + (W + 0.8) * (b + 1) / bands; quad([{ x: -0.3, y: y0 }, { x: 50.3, y: y0 }, { x: 50.3, y: y1 }, { x: -0.3, y: y1 }], ['#22b4d6', '#27bde0', '#2cc6e8', '#32cdee', '#3ad4f2'][b]); }
        // 물 반짝임 (빛 무늬)
        ctx.strokeStyle = 'rgba(255,255,255,0.38)'; ctx.lineWidth = 1.2; ctx.beginPath();
        for (let i = 0; i < 120; i++) { const wx = ((i * 41) % 50) + Math.sin(tm * 1.1 + i) * 0.6, wy = ((i * 29) % (W * 100)) / 100 + Math.cos(tm * 0.9 + i) * 0.2; const a = P(wx, wy, 0), b = P(wx + 1.2, wy, 0); if (a.zc > NEAR && Math.abs(wx - cx) < 90) { ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); } }
        ctx.stroke();
        // 바닥 레인 라인 (검정)
        for (let i = 0; i < t.lanes; i++) { const y = (i + 0.5) * t.laneW; quad([{ x: 0.3, y: y - 0.12 }, { x: 49.7, y: y - 0.12 }, { x: 49.7, y: y + 0.12 }, { x: 0.3, y: y + 0.12 }], 'rgba(10,60,110,0.55)'); quad([{ x: 0, y: y - 0.6 }, { x: 0.3, y: y - 0.6 }, { x: 0.3, y: y + 0.6 }, { x: 0, y: y + 0.6 }], 'rgba(10,60,110,0.55)'); quad([{ x: 49.7, y: y - 0.6 }, { x: 50, y: y - 0.6 }, { x: 50, y: y + 0.6 }, { x: 49.7, y: y + 0.6 }], 'rgba(10,60,110,0.55)'); }
        // 풀 벽
        quad([{ x: -0.5, y: -0.5 }, { x: 0, y: -0.5 }, { x: 0, y: W + 0.5 }, { x: -0.5, y: W + 0.5 }], '#dfe6ec'); quad([{ x: 50, y: -0.5 }, { x: 50.5, y: -0.5 }, { x: 50.5, y: W + 0.5 }, { x: 50, y: W + 0.5 }], '#dfe6ec');
        // 관중석 계단 (먼 쪽 + 양쪽)
        stepsX(-10, 62, -9 + 1.3, 7, 1.3, 0.8, 0.5, '#9ea8b8', '#7e889a');
        // 레인 로프 (빨강·흰·파랑 부표)
        for (let i = 0; i <= t.lanes; i++) {
          const y = i * t.laneW, a = P(-0.2, y, 0.02), b = P(50.2, y, 0.02); if (a.zc < NEAR) continue;
          const col = i === 0 || i === t.lanes ? '#ffffff' : ['#d63031', '#ffffff', '#0984e3'][i % 3];
          void col;
          ctx.lineCap = 'butt';
          ctx.strokeStyle = '#ffffff'; ctx.lineWidth = Math.max(1.4, 0.2 * a.k); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
          const cols = ['#d63031', '#0984e3', '#d63031'];
          for (let c = 0; c < 3; c++) { ctx.strokeStyle = cols[c]; ctx.setLineDash([0.5 * a.k, 1.0 * a.k]); ctx.lineDashOffset = -(c * 0.5 * a.k); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); if (c === 0) break; }
          ctx.setLineDash([]);
        }
      },
      items(t) {
        const out = [...rowItems(this.rowsFar), ...rowItems(this.rowsEnd), ...rowItems(this.rowsDeck)];
        // 출발대 (레인마다 번호)
        for (let i = 0; i < t.lanes; i++) out.push({ y: (i + 0.5) * t.laneW, fn: () => { const y = (i + 0.5) * t.laneW; box3(-1.4, -0.1, y - 0.45, y + 0.45, 0, 0.7, '#2f3542', '#dfe6ec', '#c0c8d0'); const a = P(-0.8, y + 0.45, 0.35); ctx.fillStyle = '#1e272e'; ctx.font = '800 ' + Math.max(7, 0.5 * a.k) + 'px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(i + 1), a.x, a.y); } });
        // 전광판 (먼 쪽 벽)
        out.push({ y: -9.5, fn: () => { box3(10, 40, -10.4, -10, 3, 8, '#10151f', '#111827', '#0b0f17'); const a = P(25, -10, 7), b = P(25, -10, 3.6); ctx.fillStyle = '#9fd8ff'; ctx.font = '800 ' + Math.max(8, 1.7 * a.k) + 'px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(api.raceState() === 'running' ? '● LIVE' : 'READY', a.x, (a.y + b.y) / 2); } });
        return out;
      }
    });

    return S;
  }

  global.Sports = { create };
})(window);
