/*
 * scenes.js — 일직선 코스 주변 풍경 (도시 · 강변 · 시골 · 산)
 * Scenes.create(api) -> { colors, far, ground, items }
 *   api: { ctx(), proj(X,Y,Z), cam(), camY(), W(), H(), HZ(), quad(pts,color), mulberry }
 * 좌표: 코스는 x축(0 → 결승), 레인은 y 0~W, 카메라는 +y 쪽에서 -y 방향을 바라봄 (y가 작을수록 멀다)
 */
(function (global) {
  'use strict';

  function mixHex(a, b, t) {
    const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
    const r = Math.round(((pa >> 16) & 255) * (1 - t) + ((pb >> 16) & 255) * t);
    const g = Math.round(((pa >> 8) & 255) * (1 - t) + ((pb >> 8) & 255) * t);
    const bl = Math.round((pa & 255) * (1 - t) + (pb & 255) * t);
    return '#' + ((1 << 24) | (r << 16) | (g << 8) | bl).toString(16).slice(1);
  }
  const TINT = { day: ['#ffffff', 0], sunset: ['#ff9a6a', 0.2], night: ['#1a1d40', 0.6] };
  const cache = new Map();
  function C(hex, theme, amt) {
    const key = hex + theme + (amt || 1);
    let v = cache.get(key);
    if (!v) { const t = TINT[theme] || TINT.day; v = mixHex(hex, t[0], t[1] * (amt == null ? 1 : amt)); cache.set(key, v); }
    return v;
  }

  // 장면별 기본 색
  const BASE = {
    city: { grass: '#8cc06a', grass2: '#79ad5a', haze: '#d9e6ee', surface: '#c97758', line: '#ffffff', lineA: 0.9 },
    river: { grass: '#8fca6e', grass2: '#7ab85c', haze: '#d6ecf2', surface: '#d4886a', line: '#ffffff', lineA: 0.9 },
    country: { grass: '#9ccc66', grass2: '#88b955', haze: '#e4eed8', surface: '#c9a26c', line: '#fff8e6', lineA: 0.65 },
    mountain: { grass: '#86b862', grass2: '#6f9f52', haze: '#cfdde6', surface: '#b5a387', line: '#ffffff', lineA: 0.55 }
  };

  function create(api) {
    const P = (x, y, z) => api.proj(x, y, z || 0);

    // 화면에 보일 때만 월드 좌표에 스프라이트(미터 단위)로 그림
    function sprite(x, y, fn, minZ) {
      const p = P(x, y, 0);
      if (p.zc < (minZ || 2)) return;
      if (p.x < -p.k * 30 || p.x > api.W() + p.k * 30) return;
      const ctx = api.ctx();
      ctx.save(); ctx.translate(p.x, p.y); ctx.scale(p.k, p.k);
      fn(ctx, p);
      ctx.restore();
    }
    const circ = (ctx, x, y, r) => { ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill(); };

    // ---------- 사물 ----------
    const D = {
      tree(ctx, o, th) {
        ctx.fillStyle = C('#7a5a43', th); ctx.fillRect(-0.2, -2.4 * o.s, 0.4, 2.4 * o.s);
        const c = ['#6aa84f', '#5a9a44', '#7fbb5c'];
        ctx.fillStyle = C(c[o.c % 3], th); circ(ctx, 0, -3.4 * o.s, 1.7 * o.s);
        ctx.fillStyle = C(c[(o.c + 1) % 3], th); circ(ctx, -1 * o.s, -2.7 * o.s, 1.2 * o.s); circ(ctx, 1.05 * o.s, -2.8 * o.s, 1.2 * o.s);
      },
      pine(ctx, o, th) {
        const s = o.s;
        ctx.fillStyle = C('#5d4532', th); ctx.fillRect(-0.18 * s, -1.2 * s, 0.36 * s, 1.2 * s);
        const g = ['#2f6b45', '#3b7d51', '#285c3c'];
        for (let i = 0; i < 3; i++) {
          ctx.fillStyle = C(g[(o.c + i) % 3], th);
          const b = -1 * s - i * 1.5 * s, w = (2 - i * 0.5) * s;
          ctx.beginPath(); ctx.moveTo(-w, b); ctx.lineTo(0, b - 2.4 * s); ctx.lineTo(w, b); ctx.fill();
        }
        if (o.snow) { ctx.fillStyle = C('#ffffff', th, 0.5); ctx.beginPath(); ctx.moveTo(-0.45 * s, -5.0 * s); ctx.lineTo(0, -5.9 * s); ctx.lineTo(0.45 * s, -5.0 * s); ctx.fill(); }
      },
      willow(ctx, o, th) {
        const s = o.s;
        ctx.fillStyle = C('#6b5040', th); ctx.fillRect(-0.22 * s, -3 * s, 0.44 * s, 3 * s);
        ctx.fillStyle = C('#8cbf5a', th); circ(ctx, 0, -3.6 * s, 1.8 * s);
        ctx.strokeStyle = C('#9fd067', th); ctx.lineWidth = 0.18 * s;
        ctx.beginPath();
        for (let i = -4; i <= 4; i++) { ctx.moveTo(i * 0.4 * s, -3.4 * s); ctx.quadraticCurveTo(i * 0.5 * s, -2 * s, i * 0.45 * s, -1 * s); }
        ctx.stroke();
      },
      persimmon(ctx, o, th) {
        D.tree(ctx, o, th);
        ctx.fillStyle = C('#ff8c1a', th, 0.6);
        const s = o.s;
        [[-0.8, -3.4], [0.6, -3.9], [1.2, -2.8], [-1.3, -2.5], [0.1, -2.6], [-0.3, -4.3]].forEach(([a, b]) => circ(ctx, a * s, b * s, 0.22 * s));
      },
      reeds(ctx, o, th, t) {
        ctx.strokeStyle = C('#9fae5e', th); ctx.lineWidth = 0.06;
        ctx.beginPath();
        for (let i = 0; i < 7; i++) { const x = (i - 3) * 0.18, sw = Math.sin(t * 1.5 + o.x + i) * 0.12; ctx.moveTo(x, 0); ctx.quadraticCurveTo(x, -0.8, x + sw, -1.5 - (i % 3) * 0.2); }
        ctx.stroke();
        ctx.fillStyle = C('#a4815a', th);
        for (let i = 0; i < 7; i += 2) { const x = (i - 3) * 0.18 + Math.sin(t * 1.5 + o.x + i) * 0.12; ctx.fillRect(x - 0.05, -1.7 - (i % 3) * 0.2, 0.1, 0.35); }
      },
      flowers(ctx, o, th) {
        const cols = o.cosmos ? ['#ff8fb8', '#ffffff', '#d55aa0'] : ['#ffd23f', '#ff6b6b', '#ffffff', '#b28dff'];
        ctx.fillStyle = C('#6fa64f', th); ctx.fillRect(-1.2, -0.25, 2.4, 0.25);
        for (let i = 0; i < 9; i++) {
          const x = ((i * 37) % 23) / 10 - 1.15, y = -0.3 - ((i * 13) % 7) / 10;
          ctx.strokeStyle = C('#5d8f43', th); ctx.lineWidth = 0.04; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, y); ctx.stroke();
          ctx.fillStyle = C(cols[(i + o.c) % cols.length], th, 0.7); circ(ctx, x, y, o.cosmos ? 0.13 : 0.09);
        }
      },
      rock(ctx, o, th) {
        const s = o.s;
        ctx.fillStyle = C('#8d8f93', th);
        ctx.beginPath(); ctx.moveTo(-1.2 * s, 0); ctx.lineTo(-0.9 * s, -0.8 * s); ctx.lineTo(-0.1 * s, -1.2 * s); ctx.lineTo(0.9 * s, -0.7 * s); ctx.lineTo(1.2 * s, 0); ctx.fill();
        ctx.fillStyle = C('#a9abaf', th);
        ctx.beginPath(); ctx.moveTo(-0.9 * s, -0.8 * s); ctx.lineTo(-0.1 * s, -1.2 * s); ctx.lineTo(0.2 * s, -0.6 * s); ctx.lineTo(-0.5 * s, -0.4 * s); ctx.fill();
      },
      lamp(ctx, o, th) {
        ctx.fillStyle = C('#4a4f5a', th, 0.5); ctx.fillRect(-0.06, -4, 0.12, 4);
        ctx.fillRect(-0.06, -4, 0.7, 0.1);
        if (th === 'night') {
          const g = ctx.createRadialGradient(0.6, -3.8, 0, 0.6, -3.8, 2.2);
          g.addColorStop(0, 'rgba(255,230,160,0.7)'); g.addColorStop(1, 'rgba(255,230,160,0)');
          ctx.fillStyle = g; ctx.fillRect(-1.6, -6, 4.4, 4.4);
        }
        ctx.fillStyle = th === 'night' ? '#fff3c4' : C('#e9eef2', th); ctx.fillRect(0.38, -3.92, 0.44, 0.22);
      },
      bench(ctx, o, th) {
        ctx.fillStyle = C('#b5763d', th); ctx.fillRect(-0.8, -0.45, 1.6, 0.1); ctx.fillRect(-0.8, -0.85, 1.6, 0.1);
        ctx.fillStyle = C('#3d3f45', th); ctx.fillRect(-0.7, -0.45, 0.08, 0.45); ctx.fillRect(0.62, -0.45, 0.08, 0.45);
      },
      sign(ctx, o, th) {
        ctx.fillStyle = C('#ffffff', th, 0.4); ctx.fillRect(-0.05, -1.2, 0.1, 1.2);
        ctx.fillStyle = C(o.big ? '#ff6b4a' : '#2d6cdf', th, 0.4);
        ctx.fillRect(-0.55, -1.75, 1.1, 0.55);
        ctx.fillStyle = '#fff'; ctx.font = '800 0.36px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(o.label, 0, -1.47);
      },
      house(ctx, o, th) {
        const w = o.w, h = 2.6;
        ctx.fillStyle = C(o.wall, th); ctx.fillRect(-w / 2, -h, w, h);
        ctx.fillStyle = C('#6b4a33', th); ctx.fillRect(-w / 2, -0.25, w, 0.25);
        // 기와 지붕 (처마가 살짝 들린 곡선)
        ctx.fillStyle = C(o.roof, th);
        ctx.beginPath(); ctx.moveTo(-w / 2 - 0.9, -h + 0.1); ctx.quadraticCurveTo(-w / 4, -h - 0.4, -w / 2 + 0.6, -h - 1.5);
        ctx.lineTo(w / 2 - 0.6, -h - 1.5); ctx.quadraticCurveTo(w / 4, -h - 0.4, w / 2 + 0.9, -h + 0.1); ctx.closePath(); ctx.fill();
        ctx.fillStyle = th === 'night' ? '#ffd56e' : C('#f6edd8', th);
        ctx.fillRect(-w / 2 + 0.6, -h + 0.7, 1, 1); ctx.fillRect(w / 2 - 1.6, -h + 0.7, 1, 1);
        ctx.fillStyle = C('#8a5a3a', th); ctx.fillRect(-0.45, -1.8, 0.9, 1.8);
      },
      bale(ctx, o, th) {
        ctx.fillStyle = C('#f2efe6', th); circ(ctx, 0, -0.65, 0.65);
        ctx.strokeStyle = C('#d6d1c3', th); ctx.lineWidth = 0.05; ctx.beginPath(); ctx.arc(0, -0.65, 0.4, 0, 7); ctx.stroke();
      },
      scarecrow(ctx, o, th, t) {
        ctx.fillStyle = C('#7a5a43', th); ctx.fillRect(-0.05, -1.9, 0.1, 1.9); ctx.fillRect(-0.7, -1.5, 1.4, 0.08);
        ctx.fillStyle = C('#e74c3c', th); ctx.fillRect(-0.35, -1.6, 0.7, 0.7);
        ctx.fillStyle = C('#f1d39a', th); circ(ctx, 0, -1.9, 0.25);
        ctx.fillStyle = C('#d4a64a', th); ctx.beginPath(); ctx.moveTo(-0.45, -2.0); ctx.lineTo(0, -2.35 - Math.sin(t) * 0.03); ctx.lineTo(0.45, -2.0); ctx.fill();
      },
      pole(ctx, o, th) {
        ctx.fillStyle = C('#8a7a66', th); ctx.fillRect(-0.09, -7, 0.18, 7);
        ctx.fillRect(-0.7, -6.6, 1.4, 0.12);
      },
      fence(ctx, o, th) {
        ctx.fillStyle = C('#a07850', th);
        for (let i = 0; i <= 4; i++) ctx.fillRect(-5 + i * 2.5 - 0.06, -0.9, 0.12, 0.9);
        ctx.fillRect(-5, -0.75, 10, 0.08); ctx.fillRect(-5, -0.4, 10, 0.08);
      },
      cabin(ctx, o, th) {
        const w = 4.5;
        ctx.fillStyle = C('#8b5a3c', th); ctx.fillRect(-w / 2, -2.6, w, 2.6);
        ctx.strokeStyle = C('#6e4530', th); ctx.lineWidth = 0.06; ctx.beginPath();
        for (let y = -2.4; y < 0; y += 0.35) { ctx.moveTo(-w / 2, y); ctx.lineTo(w / 2, y); } ctx.stroke();
        ctx.fillStyle = C('#a33b2b', th); ctx.beginPath(); ctx.moveTo(-w / 2 - 0.5, -2.5); ctx.lineTo(0, -4.6); ctx.lineTo(w / 2 + 0.5, -2.5); ctx.fill();
        ctx.fillStyle = th === 'night' ? '#ffd56e' : C('#f6edd8', th); ctx.fillRect(-1.5, -1.9, 0.9, 0.8); ctx.fillRect(0.6, -1.9, 0.9, 0.8);
      },
      boat(ctx, o, th) {
        ctx.fillStyle = C(o.col, th); ctx.beginPath(); ctx.moveTo(-2, -0.6); ctx.lineTo(2.2, -0.6); ctx.lineTo(1.6, 0); ctx.lineTo(-1.6, 0); ctx.fill();
        if (o.sail) {
          ctx.fillStyle = C('#ffffff', th, 0.5); ctx.beginPath(); ctx.moveTo(0, -0.7); ctx.lineTo(0, -4); ctx.lineTo(1.8, -0.8); ctx.fill();
          ctx.fillStyle = C(o.col2, th); ctx.beginPath(); ctx.moveTo(-0.1, -0.8); ctx.lineTo(-0.1, -3.4); ctx.lineTo(-1.5, -0.9); ctx.fill();
        } else {
          ctx.fillStyle = C('#ffffff', th, 0.5); ctx.fillRect(-1, -1.5, 2, 0.9);
          ctx.fillStyle = C(o.col2, th); ctx.fillRect(-1.1, -1.65, 2.2, 0.2);
        }
        if (th === 'night') { ctx.fillStyle = '#ffe9a0'; circ(ctx, 1.9, -0.7, 0.12); }
      },
      duck(ctx, o, th, t) {
        const bob = Math.sin(t * 3 + o.x) * 0.04;
        ctx.fillStyle = C('#ffffff', th, 0.6); ctx.beginPath(); ctx.ellipse(0, -0.2 + bob, 0.35, 0.18, 0, 0, 7); ctx.fill();
        circ(ctx, 0.25, -0.42 + bob, 0.13); ctx.fillStyle = '#f39c12'; ctx.fillRect(0.36, -0.44 + bob, 0.12, 0.05);
      },
      car(ctx, o, th) {
        const dir = o.dir;
        ctx.save(); ctx.scale(dir, 1);
        ctx.fillStyle = C(o.col, th, 0.7);
        ctx.beginPath(); ctx.moveTo(-2, -0.35); ctx.lineTo(-2, -0.95); ctx.lineTo(-1.1, -1.05); ctx.lineTo(-0.6, -1.55); ctx.lineTo(0.9, -1.55); ctx.lineTo(1.4, -1.0); ctx.lineTo(2.05, -0.9); ctx.lineTo(2.05, -0.35); ctx.fill();
        ctx.fillStyle = th === 'night' ? '#3b4470' : C('#bfe3ff', th); ctx.fillRect(-0.45, -1.45, 0.6, 0.42); ctx.fillRect(0.3, -1.45, 0.6, 0.42);
        ctx.fillStyle = '#222'; circ(ctx, -1.2, -0.32, 0.32); circ(ctx, 1.25, -0.32, 0.32);
        ctx.fillStyle = '#bbb'; circ(ctx, -1.2, -0.32, 0.13); circ(ctx, 1.25, -0.32, 0.13);
        if (th === 'night') { ctx.fillStyle = '#fff6c4'; ctx.fillRect(1.95, -0.85, 0.12, 0.18); ctx.fillStyle = '#ff4040'; ctx.fillRect(-2.05, -0.85, 0.1, 0.18); }
        ctx.restore();
      },
      tent(ctx, o, th) {
        ctx.fillStyle = C('#dcdcdc', th); ctx.fillRect(-1.45, -2.2, 0.08, 2.2); ctx.fillRect(1.37, -2.2, 0.08, 2.2);
        ctx.fillStyle = C(o.col, th, 0.6); ctx.beginPath(); ctx.moveTo(-1.6, -2.2); ctx.lineTo(0, -3.0); ctx.lineTo(1.6, -2.2); ctx.fill();
        ctx.fillRect(-1.6, -2.3, 3.2, 0.3);
        ctx.fillStyle = C('#ffffff', th, 0.5); ctx.fillRect(-1.2, -1.0, 2.4, 0.08);
      }
    };

    // ---------- 장면별 배치 ----------
    const X0 = -140, X1 = 520;
    function build(scene) {
      const rng = api.mulberry({ city: 11, river: 22, country: 33, mountain: 44 }[scene]);
      const R = (a, b) => a + rng() * (b - a);
      const L = [];
      const add = (kind, x, y, extra) => L.push(Object.assign({ kind, x, y, s: 1, c: Math.floor(rng() * 3) }, extra || {}));
      // 거리 표지판 (공통)
      for (let m = 50; m <= 300; m += 50) add('sign', m, -1.4, { label: m + 'm' });
      if (scene === 'city') {
        for (let x = X0; x < X1; x += 25) { add('lamp', x + 5, -2.0); add('tree', x + 17, -2.6, { s: 0.85 }); }
        for (let x = X0; x < X1; x += R(8, 18)) add('tree', x, -27 - R(0, 2), { s: R(0.7, 1) });
        for (let i = 0; i < 9; i++) add('car', R(X0, X1), -11, { dir: 1, sp: R(9, 14), col: ['#e74c3c', '#3498db', '#f1c40f', '#ffffff', '#2ecc71', '#34495e', '#e67e22'][i % 7] });
        for (let i = 0; i < 9; i++) add('car', R(X0, X1), -16.5, { dir: -1, sp: R(9, 14), col: ['#9b59b6', '#ecf0f1', '#c0392b', '#16a085', '#2c3e50', '#f39c12'][i % 6] });
        for (let x = X0; x < X1; x += R(6, 14)) add('flowers', x, R(0, 1) + 99, { near: true });
        add('tent', 150, -3.2, { col: '#ff6b4a' }); add('tent', 154, -3.2, { col: '#3498db' });
      } else if (scene === 'river') {
        for (let x = X0; x < X1; x += 30) { add('lamp', x + 4, -2.2); add('bench', x + 15, -3.0); }
        for (let x = X0; x < X1; x += R(4, 9)) add(rng() < 0.4 ? 'willow' : 'reeds', x, -R(5, 9), { s: R(0.8, 1.15) });
        for (let x = X0; x < X1; x += R(3, 6)) add('reeds', x, -R(12, 13.5));
        for (let i = 0; i < 6; i++) add('boat', R(X0, X1), -R(25, 58), { sp: R(1, 3) * (rng() < 0.5 ? -1 : 1), sail: rng() < 0.5, col: ['#ffffff', '#e74c3c', '#2d6cdf', '#f1c40f'][i % 4], col2: ['#ff6b6b', '#2ecc71', '#ffb400'][i % 3] });
        for (let i = 0; i < 10; i++) add('duck', R(X0, X1), -R(15, 22), { sp: R(0.3, 0.8) });
        for (let x = X0; x < X1; x += R(5, 11)) add('tree', x, -R(72, 80), { s: R(1, 1.5) });
      } else if (scene === 'country') {
        for (let x = X0; x < X1; x += 10) add('fence', x + 5, -2.6);
        for (let x = X0; x < X1; x += 32) add('pole', x, -4.5, { wire: 32 });
        for (let i = 0; i < 6; i++) add('scarecrow', R(X0, X1), -R(14, 40));
        for (let x = X0 + 20; x < X1; x += R(35, 70)) {
          add('house', x, -R(66, 74), { w: R(6, 9), wall: ['#f3e5c8', '#efe2d0', '#e8d9bc'][Math.floor(rng() * 3)], roof: ['#4a5560', '#6b4a3a', '#3f6d8a', '#8a3b2b'][Math.floor(rng() * 4)] });
          add('persimmon', x + R(6, 9), -R(64, 68), { s: R(0.9, 1.2) });
        }
        for (let x = X0; x < X1; x += R(7, 15)) add('bale', x, -R(62, 64));
        for (let x = X0; x < X1; x += R(6, 14)) add('tree', x, -R(84, 96), { s: R(1, 1.6) });
      } else if (scene === 'mountain') {
        for (let x = X0; x < X1; x += R(9, 20)) add('pine', x, -R(5, 12), { s: R(0.7, 1.1) });
        for (let x = X0; x < X1; x += R(5, 11)) add('pine', x, -R(20, 40), { s: R(0.9, 1.4), snow: rng() < 0.3 });
        for (let x = X0; x < X1; x += R(3, 7)) add('pine', x, -R(60, 110), { s: R(1.1, 1.7), snow: rng() < 0.5 });
        for (let x = X0; x < X1; x += R(8, 20)) add('rock', x, -R(2.5, 6), { s: R(0.5, 1.2) });
        add('cabin', 120, -24); add('cabin', 260, -30);
        add('tent', 300, -3.4, { col: '#2ecc71' });
      }
      // 앞쪽(카메라 쪽) 소품
      for (let x = X0; x < X1; x += R(5, 12)) {
        const k = scene === 'mountain' ? (rng() < 0.6 ? 'rock' : 'flowers') : scene === 'river' ? (rng() < 0.5 ? 'reeds' : 'flowers') : 'flowers';
        add(k, x, 0, { near: true, s: R(0.4, 0.8), cosmos: scene === 'country' });
      }
      return L;
    }
    const lists = {};
    function listFor(scene) { return lists[scene] || (lists[scene] = build(scene)); }

    function colors(scene, th) {
      const b = BASE[scene] || BASE.city;
      return { grass: C(b.grass, th), grass2: C(b.grass2, th), haze: C(b.haze, th), surface: C(b.surface, th, 0.8), line: b.line, lineA: b.lineA * (th === 'night' ? 0.8 : 1) };
    }

    // ---------- 바닥 (물, 논, 도로) ----------
    function ground(scene, th, time, W) {
      const q = api.quad, cx = api.cam().x;
      const xa = cx - 400, xb = cx + 400;
      if (scene === 'river') {
        q([{ x: xa, y: -13.5 }, { x: xb, y: -13.5 }, { x: xb, y: -14.2 }, { x: xa, y: -14.2 }], C('#c9c2b0', th));
        q([{ x: xa, y: -14.2 }, { x: xb, y: -14.2 }, { x: xb, y: -70 }, { x: xa, y: -70 }], C('#5aa9d6', th));
        q([{ x: xa, y: -40 }, { x: xb, y: -40 }, { x: xb, y: -70 }, { x: xa, y: -70 }], C('#4f9bc9', th));
        // 물결 반짝임
        const ctx = api.ctx();
        ctx.strokeStyle = th === 'night' ? 'rgba(255,230,170,0.45)' : 'rgba(255,255,255,0.55)';
        ctx.lineWidth = 1.2; ctx.beginPath();
        for (let i = 0; i < 70; i++) {
          const wx = Math.floor(cx / 6) * 6 + ((i * 53) % 300) - 150 + Math.sin(time * 0.7 + i) * 1.5;
          const wy = -15 - ((i * 37) % 55);
          const a = P(wx, wy), b = P(wx + 1.8, wy);
          if (a.zc > 2) { ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); }
        }
        ctx.stroke();
        q([{ x: xa, y: -70 }, { x: xb, y: -70 }, { x: xb, y: -71 }, { x: xa, y: -71 }], C('#c9c2b0', th));
      } else if (scene === 'country') {
        // 논 (계단식 줄)
        const rows = [[-6, -22], [-23, -39], [-40, -58]];
        const shades = ['#a7d46f', '#93c45f', '#b8dc78', '#86b85a'];
        for (let x = Math.floor((cx - 160) / 14) * 14; x < cx + 160; x += 14) {
          rows.forEach((r, j) => {
            const k = Math.abs(Math.round(x / 14) * 7 + j * 3) % 4;
            q([{ x: x + 0.6, y: r[0] }, { x: x + 13.4, y: r[0] }, { x: x + 13.4, y: r[1] }, { x: x + 0.6, y: r[1] }], C(shades[k], th));
          });
        }
        q([{ x: xa, y: -59 }, { x: xb, y: -59 }, { x: xb, y: -61 }, { x: xa, y: -61 }], C('#d2b07a', th));
      } else if (scene === 'city') {
        q([{ x: xa, y: -0.6 }, { x: xb, y: -0.6 }, { x: xb, y: -7.5 }, { x: xa, y: -7.5 }], C('#d9d4cc', th));
        q([{ x: xa, y: -7.5 }, { x: xb, y: -7.5 }, { x: xb, y: -20 }, { x: xa, y: -20 }], C('#5d6470', th));
        for (let x = Math.floor((cx - 200) / 8) * 8; x < cx + 200; x += 8) q([{ x, y: -13.6 }, { x: x + 4, y: -13.6 }, { x: x + 4, y: -13.9 }, { x, y: -13.9 }], C('#ffd23f', th, 0.5));
        q([{ x: xa, y: -20 }, { x: xb, y: -20 }, { x: xb, y: -26 }, { x: xa, y: -26 }], C('#d9d4cc', th));
      } else if (scene === 'mountain') {
        // 계곡 개울
        q([{ x: xa, y: -15 }, { x: xb, y: -15 }, { x: xb, y: -17.5 }, { x: xa, y: -17.5 }], C('#6fb6d8', th));
      }
      void W;
    }

    // ---------- 먼 풍경 (화면 공간, 시차) ----------
    function ridge(seed, len, base, amp, rough) {
      const r = api.mulberry(seed), a = [];
      const ph = [r() * 6, r() * 6, r() * 6, r() * 6];
      for (let i = 0; i <= len; i++) {
        const t = i / len * Math.PI * 2;
        let h = Math.sin(t * 2 + ph[0]) * 0.45 + Math.sin(t * 5 + ph[1]) * 0.3 + Math.sin(t * 11 + ph[2]) * 0.15 * rough + Math.sin(t * 23 + ph[3]) * 0.08 * rough;
        a.push(base + amp * (h * 0.5 + 0.5));
      }
      return a;
    }
    const RID = {
      m1: ridge(1, 300, 0.25, 0.75, 1.4), m2: ridge(2, 300, 0.15, 0.55, 1.2), m3: ridge(3, 300, 0.05, 0.35, 1),
      h1: ridge(4, 300, 0.1, 0.4, 0.4), h2: ridge(5, 300, 0.03, 0.18, 0.3), c1: ridge(6, 300, 0.05, 0.2, 0.6)
    };
    function drawRidge(prof, par, scale, color, snow, th) {
      const ctx = api.ctx(), W = api.W(), HZ = api.HZ(), H = api.H();
      const len = 3000, off = api.cam().x * par;
      const hAt = (x) => { const u = (((x + off) % len) + len) % len / len * (prof.length - 1); const i = Math.floor(u), f = u - i; return prof[i] * (1 - f) + prof[Math.min(prof.length - 1, i + 1)] * f; };
      ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(-10, HZ + 2);
      for (let x = -10; x <= W + 10; x += 6) ctx.lineTo(x, HZ - hAt(x) * H * scale);
      ctx.lineTo(W + 10, HZ + 2); ctx.closePath(); ctx.fill();
      if (snow) {
        ctx.fillStyle = C('#ffffff', th, 0.6); ctx.beginPath();
        let open = false;
        for (let x = -10; x <= W + 10; x += 6) {
          const h = hAt(x), thr = 0.72;
          if (h > thr) {
            const y = HZ - h * H * scale;
            if (!open) { ctx.moveTo(x, y); open = true; } else ctx.lineTo(x, y);
          } else if (open) { open = false; ctx.closePath(); }
        }
        ctx.fill();
        // 눈 덮인 봉우리 아래쪽 경계를 부드럽게
        ctx.fillStyle = color;
        ctx.beginPath(); ctx.moveTo(-10, HZ + 2);
        for (let x = -10; x <= W + 10; x += 6) { const h = hAt(x); ctx.lineTo(x, HZ - Math.min(h, 0.72 + (h - 0.72) * 0.35) * H * scale); }
        ctx.lineTo(W + 10, HZ + 2); ctx.closePath(); ctx.fill();
      }
    }
    function far(scene, th, time) {
      const ctx = api.ctx(), W = api.W(), HZ = api.HZ(), H = api.H();
      if (scene === 'mountain') {
        drawRidge(RID.m1, 0.15, 0.62, C('#9fb4cf', th), true, th);
        drawRidge(RID.m2, 0.35, 0.42, C('#6f93a8', th), true, th);
        drawRidge(RID.m3, 0.7, 0.28, C('#4f7a62', th), false, th);
        // 안개
        const g = ctx.createLinearGradient(0, HZ - H * 0.08, 0, HZ);
        g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(1, th === 'night' ? 'rgba(60,64,110,0.5)' : 'rgba(255,255,255,0.5)');
        ctx.fillStyle = g; ctx.fillRect(0, HZ - H * 0.08, W, H * 0.08);
      } else if (scene === 'country') {
        drawRidge(RID.m2, 0.12, 0.3, C('#a8bcd2', th), false, th);
        drawRidge(RID.h1, 0.35, 0.18, C('#8fbf73', th), false, th);
        drawRidge(RID.h2, 0.7, 0.1, C('#7bb062', th), false, th);
      } else if (scene === 'river') {
        drawRidge(RID.h1, 0.15, 0.2, C('#9fbfa9', th), false, th);
        // 건너편 아파트 단지
        const off = api.cam().x * 0.5, s = H / 600;
        for (let i = -2; i < W / 46 + 3; i++) {
          const gi = Math.floor((i * 46 + off) / 46), x = gi * 46 - off;
          const r = api.mulberry(gi * 97 + 5)();
          const h = (40 + r * 50) * s;
          ctx.fillStyle = C(r < 0.5 ? '#e9e2d8' : '#dfe5ea', th);
          ctx.fillRect(x, HZ - h, 34, h + 1);
          ctx.fillStyle = th === 'night' ? 'rgba(255,214,120,0.7)' : C('#b8c6d4', th);
          for (let y = HZ - h + 5; y < HZ - 4; y += 7 * s + 2) ctx.fillRect(x + 3, y, 28, 2);
        }
        // 다리 (아치)
        const bo = api.cam().x * 0.8, by = HZ - 14 * s;
        ctx.strokeStyle = C('#e4e8ee', th, 0.6); ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(0, by); ctx.lineTo(W, by); ctx.stroke();
        ctx.lineWidth = 2;
        for (let i = -1; i < W / 120 + 2; i++) {
          const x = i * 120 - (bo % 120);
          ctx.beginPath(); ctx.moveTo(x, by); ctx.quadraticCurveTo(x + 60, by - 40 * s, x + 120, by); ctx.stroke();
          ctx.fillStyle = C('#cfd6de', th); ctx.fillRect(x - 3, by, 6, HZ - by);
          if (th === 'night') { ctx.fillStyle = ['#ff6b9a', '#6bd5ff', '#ffe36b'][((i % 3) + 3) % 3]; for (let k = 1; k < 6; k++) { const t = k / 6; ctx.fillRect(x + 120 * t - 1, by - 40 * s * 2 * t * (1 - t) * 1 - 1, 2.5, 2.5); } }
        }
      }
      void time;
    }

    // ---------- 깊이 정렬용 목록 ----------
    function items(scene, th, time, W) {
      const out = [];
      const L = listFor(scene);
      const cx = api.cam().x;
      for (const o of L) {
        let x = o.x;
        if (o.sp) { x = ((o.x + time * o.sp * (o.dir || 1) - X0) % (X1 - X0) + (X1 - X0)) % (X1 - X0) + X0; }
        const y = o.near ? W + 1.5 + (o.s || 0.5) * 4 : o.y;
        if (Math.abs(x - cx) > 140 + Math.abs(y) * 1.2) continue;
        out.push({ y, fn: () => {
          sprite(x, y, (ctx) => D[o.kind](ctx, o, th, time), o.near ? 2.5 : 2);
          if (o.kind === 'pole') { // 전깃줄
            const a = P(x - 0.7, y, 6.55), b = P(x + o.wire - 0.7, y, 6.55), m = P(x + o.wire / 2, y, 6.0);
            if (a.zc > 2) { const ctx = api.ctx(); ctx.strokeStyle = C('#3d3a36', th, 0.5); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.quadraticCurveTo(m.x, m.y + (m.y - (a.y + b.y) / 2), b.x, b.y); ctx.stroke(); }
          }
        } });
      }
      return out;
    }

    return { colors, far, ground, items };
  }

  global.Scenes = { create, BASE };
})(window);
