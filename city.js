/*
 * city.js — 경기장 주변 입체 도시 (월드 공간 3D 상자 + 원근 투영)
 * City.create(api) -> { items(themeKey, time) }
 *   api: { ctx(), proj(X,Y,Z), cam(), camY(), mulberry, shade }
 *   items() 는 [{ y, fn }] 배열을 돌려주고, app.js 가 주자·나무와 함께 깊이 정렬해서 그린다.
 */
(function (global) {
  'use strict';

  function mix(a, b, t) {
    const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
    const r = Math.round(((pa >> 16) & 255) * (1 - t) + ((pb >> 16) & 255) * t);
    const g = Math.round(((pa >> 8) & 255) * (1 - t) + ((pb >> 8) & 255) * t);
    const bl = Math.round((pa & 255) * (1 - t) + (pb & 255) * t);
    return '#' + ((1 << 24) | (r << 16) | (g << 8) | bl).toString(16).slice(1);
  }

  // 테마별 색 보정
  const TINT = {
    day: { tint: '#ffffff', amt: 0, glass: ['#9fd3ff', '#e8f6ff'], win: '#cfe9ff', winDark: '#7fa9cc', lit: 0, haze: '#d7ecff', hazeMax: 0.55 },
    sunset: { tint: '#ff9a6a', amt: 0.22, glass: ['#ffb38a', '#ffe2b8'], win: '#ffe0b0', winDark: '#b07a68', lit: 0.25, haze: '#f4cfaa', hazeMax: 0.6 },
    night: { tint: '#1a1d40', amt: 0.62, glass: ['#1d2550', '#3a3f7a'], win: '#ffd56e', winDark: '#252a52', lit: 0.62, haze: '#2a2d5a', hazeMax: 0.55 }
  };

  const WALLS = ['#f4e6d0', '#e8d5c4', '#cfe0ea', '#f2c6b4', '#d9e8cf', '#f7e2a4', '#d6cbe8', '#c9d6e3', '#ffd1dc', '#bfe3dc', '#e9e4dc'];
  const ACCENTS = ['#ff5e7e', '#ffb400', '#2ec4b6', '#5b8cff', '#ff7a3d', '#9b5de5', '#00bbf9', '#f15bb5', '#00c26e'];
  const SHOPS = ['분식', '카페', '문구점', '치킨', '편의점', '꽃집', '서점', '빵집', '태권도', '피아노', '안경', '약국', '떡볶이', '아이스크림'];
  const BOARDS = ['달려라!', 'GO GO!', '파이팅!', 'RUN ★', '운동회', 'SPORTS DAY', '힘내라!', '★ ★ ★'];

  function create(api) {
    const rng = api.mulberry(20261108);
    const R = (a, b) => a + rng() * (b - a);
    const pick = (a) => a[Math.floor(rng() * a.length)];
    const blds = [];

    function addRow(y0, y1, x0, x1, hMin, hMax, styles, gapMin, gapMax) {
      let x = x0 + R(0, 8);
      while (x < x1) {
        const w = R(10, 26), d = R(10, 18);
        const yf = R(y0, y1);
        const style = pick(styles);
        let h = R(hMin, hMax);
        if (style === 'shop') h = R(8, 13);
        if (style === 'apt') h = Math.max(h, 30);
        blds.push(makeBld(x, x + w, yf, d, h, style));
        x += w + R(gapMin, gapMax);
      }
    }
    function makeBld(x0, x1, yf, d, h, style) {
      const b = {
        x0, x1, yf, yb: yf - d, h, style,
        wall: pick(WALLS), accent: pick(ACCENTS), seed: Math.floor(rng() * 1e9),
        crown: style === 'glass' && rng() < 0.45 ? pick(['spire', 'step', 'slant']) : null,
        board: (style !== 'shop' && rng() < 0.28) ? pick(BOARDS) : null,
        antenna: rng() < 0.5, tank: style === 'office' && rng() < 0.4,
        num: style === 'apt' ? String(101 + Math.floor(rng() * 12)) + '동' : null,
        tex: {}, boardTex: {}
      };
      if (style === 'glass') b.wall = pick(['#7fb6e0', '#8fc9d8', '#a3b7e8', '#96d3c4', '#b8a6e3']);
      return b;
    }

    // 도시 배치 — 일직선 코스(x 0~300m) 뒤쪽으로 줄지어 선 건물들 (도로 너머)
    addRow(-36, -30, -220, 640, 8, 13, ['shop', 'shop', 'shop', 'office'], 2, 6);
    addRow(-66, -54, -240, 660, 18, 40, ['office', 'apt', 'apt', 'glass'], 4, 12);
    addRow(-115, -95, -280, 700, 30, 75, ['glass', 'office', 'apt', 'glass'], 6, 16);
    addRow(-200, -160, -340, 760, 55, 130, ['glass', 'glass', 'office'], 8, 22);

    // ---- 텍스처 (테마별로 한 번만 그림) ----
    function facade(b, key) {
      if (b.tex[key]) return b.tex[key];
      const T = TINT[key];
      const ppm = 4; // 1m = 4px
      const W = Math.max(8, Math.round((b.x1 - b.x0) * ppm)), H = Math.max(8, Math.round(b.h * ppm));
      const c = document.createElement('canvas'); c.width = W; c.height = H;
      const g = c.getContext('2d');
      const r = api.mulberry(b.seed);
      const wall = mix(b.wall, T.tint, T.amt);
      const acc = mix(b.accent, T.tint, T.amt * 0.5);
      const winC = () => (r() < T.lit ? (r() < 0.2 ? '#ffffff' : T.win) : T.winDark);
      if (b.style === 'glass') {
        const gr = g.createLinearGradient(0, 0, W, H);
        gr.addColorStop(0, mix(mix(b.wall, T.glass[0], 0.45), T.tint, T.amt * 0.6));
        gr.addColorStop(0.5, mix(T.glass[1], T.tint, T.amt * 0.3));
        gr.addColorStop(1, mix(mix(b.wall, T.glass[0], 0.3), '#000000', 0.15 + T.amt * 0.4));
        g.fillStyle = gr; g.fillRect(0, 0, W, H);
        // 반사 띠
        g.globalAlpha = 0.25; g.fillStyle = '#ffffff';
        g.beginPath(); g.moveTo(W * 0.1, H); g.lineTo(W * 0.45, 0); g.lineTo(W * 0.6, 0); g.lineTo(W * 0.25, H); g.fill();
        g.globalAlpha = 1;
        // 멀리언(창틀)
        g.fillStyle = 'rgba(255,255,255,0.22)';
        for (let x = 0; x < W; x += 12) g.fillRect(x, 0, 1.5, H);
        for (let y = 0; y < H; y += 14) g.fillRect(0, y, W, 1.2);
        if (key === 'night') {
          for (let y = 3; y < H - 4; y += 14) for (let x = 2; x < W - 8; x += 12) if (r() < 0.45) { g.fillStyle = r() < 0.3 ? '#bfe6ff' : T.win; g.fillRect(x + 1, y, 9, 9); }
        }
        g.fillStyle = acc; g.fillRect(0, 0, W, 4);
      } else if (b.style === 'apt') {
        g.fillStyle = wall; g.fillRect(0, 0, W, H);
        g.fillStyle = acc; g.fillRect(0, 0, 5, H); g.fillRect(W - 5, 0, 5, H);
        for (let y = 6; y < H - 6; y += 12) {
          for (let x = 9; x < W - 14; x += 18) { g.fillStyle = winC(); g.fillRect(x, y, 13, 7); }
          g.fillStyle = mix(wall, '#000000', 0.12); g.fillRect(6, y + 8, W - 12, 2.5); // 발코니
        }
        if (b.num && W > 40) {
          g.fillStyle = key === 'night' ? '#ffe9a8' : acc;
          g.font = `800 ${Math.min(22, W / 4)}px 'Noto Sans KR',sans-serif`; g.textAlign = 'center'; g.textBaseline = 'top';
          g.fillText(b.num, W / 2, 2);
        }
      } else if (b.style === 'shop') {
        g.fillStyle = wall; g.fillRect(0, 0, W, H);
        // 위층 창
        for (let y = 5; y < H - 22; y += 12) for (let x = 5; x < W - 10; x += 14) { g.fillStyle = winC(); g.fillRect(x, y, 9, 8); }
        // 간판
        const sh = 10, sy = H - 24;
        g.fillStyle = acc; g.fillRect(2, sy, W - 4, sh);
        g.fillStyle = '#ffffff';
        if (key === 'night') { g.shadowColor = '#ffffff'; g.shadowBlur = 6; }
        g.font = `800 8px 'Noto Sans KR',sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(pick2(r, SHOPS), W / 2, sy + sh / 2 + 0.5);
        g.shadowBlur = 0;
        // 차양 줄무늬
        for (let x = 2; x < W - 2; x += 6) { g.fillStyle = (x / 6) % 2 < 1 ? '#ffffff' : acc; g.fillRect(x, sy + sh, 6, 4); }
        // 쇼윈도
        g.fillStyle = key === 'night' ? '#ffe7a0' : mix('#bfe3ff', T.tint, T.amt * 0.5);
        g.fillRect(4, sy + sh + 6, W - 8, H - (sy + sh + 6));
        g.fillStyle = mix(wall, '#000000', 0.3); g.fillRect(W / 2 - 3, sy + sh + 6, 6, H);
      } else { // office
        g.fillStyle = wall; g.fillRect(0, 0, W, H);
        g.fillStyle = mix(wall, '#000000', 0.1);
        for (let x = 0; x < W; x += 16) g.fillRect(x, 0, 3, H);
        for (let y = 4; y < H - 4; y += 10) for (let x = 5; x < W - 9; x += 16) { g.fillStyle = winC(); g.fillRect(x, y, 9, 6); }
        g.fillStyle = acc; g.fillRect(0, H - 6, W, 6);
      }
      if (key === 'night' && b.style !== 'shop') { // 옥상 네온 테두리
        g.fillStyle = b.accent; g.fillRect(0, 0, W, 2);
      }
      b.tex[key] = c;
      return c;
    }
    function pick2(r, a) { return a[Math.floor(r() * a.length)]; }

    function boardTex(b, key) {
      if (b.boardTex[key]) return b.boardTex[key];
      const c = document.createElement('canvas'); c.width = 160; c.height = 48;
      const g = c.getContext('2d');
      const gr = g.createLinearGradient(0, 0, 160, 0);
      gr.addColorStop(0, b.accent); gr.addColorStop(1, mix(b.accent, '#ffd23f', 0.6));
      g.fillStyle = key === 'night' ? '#14122b' : gr; g.fillRect(0, 0, 160, 48);
      g.strokeStyle = key === 'night' ? b.accent : '#ffffff'; g.lineWidth = 4; g.strokeRect(2, 2, 156, 44);
      g.font = `800 26px 'Jua','Noto Sans KR',sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
      if (key === 'night') { g.shadowColor = b.accent; g.shadowBlur = 12; g.fillStyle = mix(b.accent, '#ffffff', 0.5); }
      else g.fillStyle = '#ffffff';
      g.fillText(b.board, 80, 26);
      b.boardTex[key] = c;
      return c;
    }

    // ---- 관중석 ----
    const stand = { x0: -40, x1: 40, yf: -57, d: 7, h: 3.5, tex: {} };
    function standTex(key) {
      if (stand.tex[key]) return stand.tex[key];
      const W = 88 * 6, H = 7 * 6;
      const c = document.createElement('canvas'); c.width = W; c.height = H;
      const g = c.getContext('2d'), r = api.mulberry(77);
      const T = TINT[key];
      g.fillStyle = mix('#3a6fb0', T.tint, T.amt * 0.6); g.fillRect(0, 0, W, H);
      const rows = 5;
      for (let i = 0; i < rows; i++) {
        const y = 2 + i * 7;
        g.fillStyle = mix(['#ff6b6b', '#ffd23f', '#4ecdc4', '#5b8cff', '#ff9f43'][i], T.tint, T.amt * 0.5);
        g.fillRect(0, y + 4, W, 3);
        for (let x = 2; x < W; x += 4.5) {
          if (r() < 0.75) { g.fillStyle = mix(pick2(r, ['#ff5e7e', '#ffd166', '#06d6a0', '#118ab2', '#ffffff', '#ef476f', '#8338ec', '#f4a261']), T.tint, T.amt * 0.5); g.beginPath(); g.arc(x, y + 2.5, 1.9, 0, 7); g.fill(); }
        }
      }
      g.fillStyle = mix('#ffffff', T.tint, T.amt * 0.3); g.fillRect(W / 2 - 70, H - 9, 140, 9);
      g.fillStyle = '#e8484f'; g.font = `800 8px 'Noto Sans KR',sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('★ 우리 학교 달리기 대회 ★', W / 2, H - 4.3);
      stand.tex[key] = c;
      return c;
    }

    const lights = [{ x: -62, y: -60 }, { x: 62, y: -60 }, { x: -112, y: 18 }, { x: 112, y: 18 }];

    // ---- 그리기 ----
    function hazeAlpha(zc, key) { return Math.min(TINT[key].hazeMax, Math.max(0, (zc - 70) / 420)); }

    function quadPath(ctx, a, b, c, d) { ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(c.x, c.y); ctx.lineTo(d.x, d.y); ctx.closePath(); }

    function drawBox(b, key, time, texFn) {
      const ctx = api.ctx(), P = api.proj, cam = api.cam();
      const camY = api.camY();
      if (camY - b.yf < 3) return;
      const T = TINT[key];
      const f0 = P(b.x0, b.yf, 0), f1 = P(b.x1, b.yf, b.h);
      if (f1.x < -50 || f0.x > api.W() + 50) return;
      const zc = f0.zc, haze = hazeAlpha(zc, key);
      const wall = mix(b.wall || '#cccccc', T.tint, T.amt);
      // 옆면
      if (cam.x < b.x0 || cam.x > b.x1) {
        const sx = cam.x < b.x0 ? b.x0 : b.x1;
        const a = P(sx, b.yf, 0), c = P(sx, b.yb, 0), d = P(sx, b.yb, b.h), e = P(sx, b.yf, b.h);
        quadPath(ctx, a, c, d, e);
        ctx.fillStyle = mix(wall, '#000000', cam.x < b.x0 ? 0.18 : 0.32); ctx.fill();
        // 층 줄
        ctx.strokeStyle = 'rgba(0,0,0,0.12)'; ctx.lineWidth = 1;
        const step = b.h > 40 ? 6 : 3.5;
        ctx.beginPath();
        for (let z = step; z < b.h - 1; z += step) { const p1 = P(sx, b.yf, z), p2 = P(sx, b.yb, z); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); }
        ctx.stroke();
        if (key === 'night' && b.style !== 'glass') {
          ctx.fillStyle = 'rgba(255,213,110,0.35)';
          for (let z = 2; z < b.h - 2; z += step * 2) { const p1 = P(sx, b.yf - 2, z), p2 = P(sx, b.yb + 2, z), p3 = P(sx, b.yb + 2, z + 1.2), p4 = P(sx, b.yf - 2, z + 1.2); quadPath(ctx, p1, p2, p3, p4); ctx.fill(); }
        }
        if (haze > 0.02) { quadPath(ctx, a, c, d, e); ctx.globalAlpha = haze; ctx.fillStyle = T.haze; ctx.fill(); ctx.globalAlpha = 1; }
      }
      // 지붕 윗면 (카메라가 더 높을 때)
      const camH = P(0, b.yf, 0); void camH;
      const top0 = P(b.x0, b.yb, b.h), top1 = P(b.x1, b.yb, b.h);
      if (top0.y < f1.y) {
        quadPath(ctx, { x: f0.x, y: f1.y }, { x: f1.x, y: f1.y }, top1, top0);
        ctx.fillStyle = mix(wall, '#ffffff', 0.15); ctx.fill();
      }
      // 앞면
      const tex = texFn(b, key);
      ctx.drawImage(tex, f0.x, f1.y, f1.x - f0.x, f0.y - f1.y);
      if (haze > 0.02) { ctx.globalAlpha = haze; ctx.fillStyle = T.haze; ctx.fillRect(f0.x, f1.y, f1.x - f0.x, f0.y - f1.y); ctx.globalAlpha = 1; }
      // 왕관(꼭대기 장식)
      const cx = (b.x0 + b.x1) / 2, yc = b.yf - (b.yf - b.yb) / 2;
      if (b.crown) {
        ctx.fillStyle = mix(mix(b.wall, '#ffffff', 0.2), T.tint, T.amt);
        const w = b.x1 - b.x0;
        if (b.crown === 'spire') {
          const a = P(cx - w * 0.2, b.yf, b.h), c = P(cx + w * 0.2, b.yf, b.h), t = P(cx, b.yf, b.h + b.h * 0.25);
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(t.x, t.y); ctx.lineTo(c.x, c.y); ctx.fill();
        } else if (b.crown === 'step') {
          const a = P(b.x0 + w * 0.15, b.yf, b.h), c = P(b.x1 - w * 0.15, b.yf, b.h + 6);
          ctx.fillRect(a.x, c.y, c.x - a.x, a.y - c.y);
          const a2 = P(b.x0 + w * 0.3, b.yf, b.h + 6), c2 = P(b.x1 - w * 0.3, b.yf, b.h + 11);
          ctx.fillRect(a2.x, c2.y, c2.x - a2.x, a2.y - c2.y);
        } else {
          const a = P(b.x0, b.yf, b.h), c = P(b.x1, b.yf, b.h), t = P(b.x1, b.yf, b.h + w * 0.5);
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(t.x, t.y); ctx.lineTo(c.x, c.y); ctx.fill();
        }
      }
      if (b.tank) {
        const a = P(cx - 2, yc, b.h), c = P(cx + 2, yc, b.h + 4);
        ctx.fillStyle = mix('#8a6a55', T.tint, T.amt); ctx.fillRect(a.x, c.y, c.x - a.x, a.y - c.y);
      }
      if (b.board) {
        const w = Math.min(16, (b.x1 - b.x0) * 0.85);
        const a = P(cx - w / 2, b.yf - 1, b.h + 0.6), c = P(cx + w / 2, b.yf - 1, b.h + 0.6 + w * 0.3);
        // 다리
        ctx.strokeStyle = 'rgba(60,60,70,0.8)'; ctx.lineWidth = 1;
        const l0 = P(cx - w / 3, b.yf - 1, b.h), l1 = P(cx + w / 3, b.yf - 1, b.h);
        ctx.beginPath(); ctx.moveTo(l0.x, l0.y); ctx.lineTo(l0.x, a.y); ctx.moveTo(l1.x, l1.y); ctx.lineTo(l1.x, a.y); ctx.stroke();
        ctx.drawImage(boardTex(b, key), a.x, c.y, c.x - a.x, a.y - c.y);
        if (haze > 0.05) { ctx.globalAlpha = haze * 0.8; ctx.fillStyle = T.haze; ctx.fillRect(a.x, c.y, c.x - a.x, a.y - c.y); ctx.globalAlpha = 1; }
      }
      if (b.antenna && !b.crown) {
        const top = b.h + (b.board ? 6 : 0);
        const a = P(b.x0 + 2, yc, top), t = P(b.x0 + 2, yc, top + Math.min(14, b.h * 0.25));
        ctx.strokeStyle = 'rgba(80,80,90,0.9)'; ctx.lineWidth = Math.max(1, a.k * 0.15);
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(t.x, t.y); ctx.stroke();
        if (Math.sin(time * 3 + b.seed) > 0) { ctx.fillStyle = '#ff3b3b'; ctx.beginPath(); ctx.arc(t.x, t.y, Math.max(1.5, t.k * 0.35), 0, 7); ctx.fill(); }
      }
    }

    function drawStand(key) {
      const ctx = api.ctx(), P = api.proj, T = TINT[key];
      if (api.camY() - stand.yf < 3) return;
      const yb = stand.yf - stand.d;
      const f0 = P(stand.x0, stand.yf, 0), f1 = P(stand.x1, stand.yf, stand.h);
      const cam = api.cam();
      const side = mix('#2f5c94', T.tint, T.amt);
      if (cam.x < stand.x0 || cam.x > stand.x1) {
        const sx = cam.x < stand.x0 ? stand.x0 : stand.x1;
        const a = P(sx, stand.yf, 0), c = P(sx, yb, 0), d = P(sx, yb, stand.h + 2.5), e = P(sx, stand.yf, stand.h);
        quadPath(ctx, a, c, d, e); ctx.fillStyle = side; ctx.fill();
      }
      // 계단식 경사면 (뒤로 갈수록 높아짐) — 앞면 텍스처를 기울여 그림
      const b0 = P(stand.x0, yb, stand.h + 2.5), b1 = P(stand.x1, yb, stand.h + 2.5);
      quadPath(ctx, { x: f0.x, y: f1.y }, { x: f1.x, y: f1.y }, b1, b0); ctx.fillStyle = mix('#284f80', T.tint, T.amt); ctx.fill();
      ctx.drawImage(standTex(key), f0.x, f1.y, f1.x - f0.x, f0.y - f1.y);
      // 지붕
      const r0 = P(stand.x0 - 2, yb, stand.h + 5), r1 = P(stand.x1 + 2, yb, stand.h + 5);
      const r2 = P(stand.x1 + 2, stand.yf - 2, stand.h + 4), r3 = P(stand.x0 - 2, stand.yf - 2, stand.h + 4);
      quadPath(ctx, r0, r1, r2, r3); ctx.fillStyle = mix('#f2f2f2', T.tint, T.amt * 0.7); ctx.fill();
      ctx.fillStyle = mix('#ff6b4a', T.tint, T.amt * 0.5);
      const e0 = P(stand.x0 - 2, stand.yf - 2, stand.h + 4), e1 = P(stand.x1 + 2, stand.yf - 2, stand.h + 3.4);
      ctx.fillRect(e0.x, e0.y, e1.x - e0.x, Math.max(2, e1.y - e0.y));
      // 기둥
      ctx.strokeStyle = mix('#dddddd', T.tint, T.amt); ctx.lineWidth = Math.max(1, f0.k * 0.25);
      ctx.beginPath();
      for (let x = stand.x0; x <= stand.x1; x += 22) { const p0 = P(x, stand.yf - 2, stand.h), p1 = P(x, stand.yf - 2, stand.h + 4); ctx.moveTo(p0.x, p0.y); ctx.lineTo(p1.x, p1.y); }
      ctx.stroke();
    }

    function drawLight(L, key, time) {
      const ctx = api.ctx(), P = api.proj;
      if (api.camY() - L.y < 4) return;
      const b = P(L.x, L.y, 0), t = P(L.x, L.y, 30);
      ctx.strokeStyle = key === 'night' ? '#5a5f7a' : '#9aa3ad'; ctx.lineWidth = Math.max(1.5, b.k * 0.5);
      ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(t.x, t.y); ctx.stroke();
      const pw = 6 * t.k, ph = 3 * t.k;
      if (key === 'night') {
        const g = ctx.createRadialGradient(t.x, t.y, 0, t.x, t.y, pw * 3);
        g.addColorStop(0, 'rgba(255,255,230,0.55)'); g.addColorStop(1, 'rgba(255,255,230,0)');
        ctx.fillStyle = g; ctx.fillRect(t.x - pw * 3, t.y - pw * 3, pw * 6, pw * 6);
      }
      ctx.fillStyle = key === 'night' ? '#fffbe0' : '#d8dee6';
      ctx.fillRect(t.x - pw / 2, t.y - ph, pw, ph);
      ctx.fillStyle = key === 'night' ? '#fff6b0' : '#ffffff';
      for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) ctx.fillRect(t.x - pw / 2 + pw * (0.05 + i * 0.24), t.y - ph + ph * (0.12 + j * 0.45), pw * 0.18, ph * 0.35);
      void time;
    }

    // 밤 서치라이트 (화면 공간, 하늘에 먼저 그림)
    function drawSkyFx(key, time, HZ, W) {
      if (key !== 'night') return;
      const ctx = api.ctx(), cam = api.cam();
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 3; i++) {
        const bx = W * (0.2 + i * 0.3) - cam.x * 1.2, ang = Math.sin(time * 0.4 + i * 2) * 0.5 - Math.PI / 2;
        const len = HZ * 1.4, wid = 0.06;
        const g = ctx.createLinearGradient(bx, HZ, bx + Math.cos(ang) * len, HZ + Math.sin(ang) * len);
        g.addColorStop(0, 'rgba(180,200,255,0.18)'); g.addColorStop(1, 'rgba(180,200,255,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.moveTo(bx, HZ);
        ctx.lineTo(bx + Math.cos(ang - wid) * len, HZ + Math.sin(ang - wid) * len);
        ctx.lineTo(bx + Math.cos(ang + wid) * len, HZ + Math.sin(ang + wid) * len);
        ctx.fill();
      }
      ctx.restore();
    }

    function items(key, time) {
      const out = [];
      for (const b of blds) out.push({ y: b.yf, fn: () => drawBox(b, key, time, facade) });
      return out;
    }

    return { items, drawSkyFx, stand };
  }

  global.City = { create };
})(window);
