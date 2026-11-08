/* app.js — 달리기 뽑기: 트랙 반 바퀴 경주 */
(() => {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];

  // ---------- 유틸 ----------
  function mulberry(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hash(str) { let h = 2166136261; for (const ch of str) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* 무시 */ } }
  };

  // ---------- 설정 ----------
  const S = Object.assign({ mode: 'first', nth: 2, theme: 'sunset', cam: 'follow', speed: '1', music: 'off', dist: '100', scene: 'river' }, store.get('runDraw.settings', {}));
  const DEFAULT_NAMES = '김민준, 이서연, 박지호, 최하은, 정우진, 강수아, 조예준, 윤지우';
  const namesEl = $('#names');
  namesEl.value = store.get('runDraw.names', DEFAULT_NAMES);

  // ---------- 코스 (일직선) ----------
  const TR = { LW: 1.9 }; // 그림 속 레인 폭 (겹치지 않게 실제보다 넓게)
  const track = { lanes: 8, width: 8 * TR.LW, rMin: 0, D: 0 };

  function parseNames(txt) {
    const out = [];
    txt.split(/[,\n]/).map((s) => s.trim()).filter(Boolean).forEach((tok) => {
      const m = tok.match(/^(.*?)\s*[*xX×]\s*(\d+)$/);
      if (m && m[1].trim()) { const n = clamp(+m[2], 1, 10); for (let i = 0; i < n; i++) out.push(m[1].trim()); }
      else out.push(tok);
    });
    return out.slice(0, 60);
  }

  // 경로: x축을 따라 곧게 달림 (q = 출발선에서 달린 거리, r = 레인 위치)
  function pathPos(r, q) { return { x: q, y: r, hx: 1, hy: 0 }; }

  // ---------- 주자 ----------
  let runners = [];
  let seedBase = store.get('runDraw.seed', (Math.random() * 1e9) | 0);
  const V0 = () => track.D / (4 + track.D * 0.07); // 100m 약 11초, 200m 약 18초, 300m 약 25초

  function build(reshuffle) {
    if (reshuffle) { seedBase = (Math.random() * 1e9) | 0; store.set('runDraw.seed', seedBase); }
    const names = parseNames(namesEl.value);
    const n = names.length;
    const rng = mulberry(seedBase);
    const order = names.map((_, i) => i);
    for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
    track.lanes = clamp(n, 3, 12);
    track.width = track.lanes * TR.LW;
    runners = order.map((ni, i) => {
      let r;
      if (n <= 12) r = (i + Math.floor((track.lanes - n) / 2) + 0.5) * TR.LW;
      else r = (i + 0.5) * track.width / n;
      const lr = mulberry(hash(names[ni]) ^ (seedBase + i * 7919));
      const look = Runner.makeLook(lr);
      return { name: names[ni], idx: i, r, look, q0: 0, s: 0, v: 0, ph: lr() * 6.28, face: 1, k: 0 };
    });
    track.D = clamp(+S.dist || 100, 50, 300);
    runners.forEach((o) => { o.q0 = 0; }); // 모두 같은 출발선
    $('#cnt').textContent = n + '명';
    $('#hTot').textContent = n;
    resetRace();
  }

  // ---------- 경주 상태 ----------
  const race = { state: 'idle', t: 0, finished: [], winner: null, declaredAt: 0, countT: 0 };

  function resetRace() {
    race.state = 'idle'; race.t = 0; race.finished = []; race.winner = null;
    runners.forEach((o) => {
      const rr = Math.random;
      Object.assign(o, {
        s: 0, v: 0, fin: false, rank: 0, ftime: 0, face: 1, k: 0,
        react: 0.08 + rr() * 0.28, base: 0.965 + rr() * 0.07,
        w1: 0.5 + rr() * 0.9, w2: 1.1 + rr() * 1.4, p1: rr() * 6.28, p2: rr() * 6.28,
        ev: 0, evT: 1.5 + rr() * 2, evDur: 0, kick: rr() * 0.14 - 0.03, stumble: 0, oops: 0,
        stride: 3.9 + rr() * 0.5
      });
    });
    renderArrivals();
    setHud();
    $('#startBtn').disabled = runners.length < 2;
  }

  function startRace() {
    if (runners.length < 2) return;
    if (race.state !== 'idle') resetRace();
    hideModal();
    race.state = 'countdown'; race.countT = 0;
    audioInit();
    $('#startBtn').disabled = true;
    const seq = ['3', '2', '1'];
    seq.forEach((txt, i) => setTimeout(() => { showCount(txt); sfxBeep(660); }, i * 800));
    setTimeout(() => {
      showCount('출발!'); sfxGun();
      race.state = 'running'; race.t = 0;
      setHud();
    }, seq.length * 800);
  }

  function showCount(txt) {
    const el = $('#count'); el.textContent = txt; el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop');
  }

  function ranking() {
    const rest = runners.filter((o) => !o.fin).sort((a, b) => b.s - a.s);
    return race.finished.concat(rest);
  }
  function targetRank() {
    const n = runners.length;
    if (S.mode === 'first') return 1;
    if (S.mode === 'last') return n;
    return clamp(+S.nth || 1, 1, n);
  }

  function update(dt) {
    if (race.state !== 'running' && race.state !== 'done') {
      runners.forEach((o) => { o.k += (0 - o.k) * Math.min(1, dt * 4); });
      return;
    }
    race.t += dt;
    const v0 = V0();
    const just = [];
    for (const o of runners) {
      let target = 0;
      if (race.t < o.react) target = 0;
      else if (!o.fin) {
        const tt = race.t;
        const nz = (Math.sin(tt * o.w1 + o.p1) + 0.6 * Math.sin(tt * o.w2 + o.p2)) / 1.6;
        o.evT -= dt;
        if (o.evT <= 0) {
          const r = Math.random();
          if (r < 0.006 && o.s > 15 && o.s < track.D - 10) { o.stumble = 0.8; o.oops = 1.6; }
          else if (r < 0.3) o.ev = 0.06 + Math.random() * 0.07;
          else if (r < 0.48) o.ev = -(0.04 + Math.random() * 0.05);
          else o.ev = 0;
          o.evT = 1.2 + Math.random() * 2.2;
        }
        target = v0 * o.base * (1 + 0.05 * nz + o.ev);
        const prog = o.s / track.D;
        if (prog > 0.7) target *= 1 + o.kick * (prog - 0.7) / 0.3;
        if (o.stumble > 0) { o.stumble -= dt; target *= 0.3; }
      } else {
        target = race.t - o.ftime < 1.8 ? v0 * 0.35 : 0;
      }
      if (o.oops > 0) o.oops -= dt;
      const acc = o.fin ? 1.1 : (race.t - o.react < 2 ? 1.5 : 2.0);
      o.v += (target - o.v) * Math.min(1, dt * acc);
      if (o.v < 0.05 && target === 0) o.v = 0;
      o.s += o.v * dt;
      o.ph += (o.v * dt * 2 * Math.PI) / o.stride;
      const kt = race.t < o.react ? 0.15 : clamp(o.v / (v0 * 0.8), 0, 1);
      o.k += (kt - o.k) * Math.min(1, dt * 6);
      if (!o.fin && o.s >= track.D) {
        o.fin = true;
        o.ftime = race.t - (o.s - track.D) / Math.max(o.v, 0.1);
        just.push(o);
      }
    }
    if (just.length) {
      just.sort((a, b) => a.ftime - b.ftime);
      for (const o of just) {
        race.finished.push(o); o.rank = race.finished.length;
        sfxBlip(o.rank);
        checkWinner(o);
      }
      renderArrivals();
      if (race.finished.length === runners.length) race.state = 'done';
    }
    setHud();
  }

  function checkWinner(o) {
    if (race.winner) return;
    if (o.rank === targetRank()) {
      race.winner = o; race.declaredAt = performance.now();
      setTimeout(() => { sfxFanfare(); showModal(o); burst(); }, 900);
    }
  }

  // ---------- 카메라 / 투영 ----------
  const cam = { x: -60, y: 0, back: 34, ratio: 0.42, inited: false };
  let CW = 0, CH = 0, DPR = 1, F = 1, HZ = 0;
  const cv = $('#stage'), ctx = cv.getContext('2d');

  function resize() {
    const r = cv.getBoundingClientRect();
    DPR = Math.min(2, window.devicePixelRatio || 1);
    CW = Math.max(1, r.width); CH = Math.max(1, r.height);
    cv.width = Math.round(CW * DPR); cv.height = Math.round(CH * DPR);
  }
  window.addEventListener('resize', resize);

  function camTarget() {
    const W = track.width, D = track.D;
    if (S.cam === 'all') return { x: D / 2, y: W / 2, back: D * 0.62 + 18, ratio: 0.5 };
    if (!runners.length) return { x: 0, y: W / 2, back: 30, ratio: 0.45 };
    const base = 7.5 + W * 0.5;
    if (race.state === 'idle' || race.state === 'countdown') return { x: 5, y: W / 2, back: base + 2, ratio: 0.45 };
    if (race.winner && performance.now() - race.declaredAt > 1800) return { x: D + 3, y: W / 2, back: base + 4, ratio: 0.45 };
    const f = race.winner && performance.now() - race.declaredAt > 400 ? race.winner : ranking()[targetRank() - 1];
    const list = ranking();
    const spread = Math.abs(list[0].s - list[list.length - 1].s);
    const back = base + clamp(spread * 0.3, 0, 16);
    return { x: Math.min(f.s, D + 6) + 3, y: W / 2, back, ratio: 0.45 };
  }

  function updateCam(dt) {
    const t = camTarget();
    if (!cam.inited) { Object.assign(cam, t); cam.inited = true; return; }
    const a = Math.min(1, dt * 2.6);
    cam.x += (t.x - cam.x) * a; cam.y += (t.y - cam.y) * a; cam.back += (t.back - cam.back) * Math.min(1, dt * 1.5);
    cam.ratio += ((t.ratio || 0.45) - cam.ratio) * Math.min(1, dt * 1.5);
  }

  function setupProj() {
    HZ = CH * 0.3;
    F = (CH * 0.66 - HZ) / cam.ratio; // 목표점이 화면 66% 높이
  }
  const camY = () => cam.y + cam.back;
  const camH = () => cam.back * cam.ratio;
  function proj(X, Y, Z) {
    const zc = camY() - Y;
    const k = F / zc;
    return { x: CW / 2 + (X - cam.x) * k, y: HZ + (camH() - (Z || 0)) * k, k, zc };
  }
  const NEAR = 0.6;

  function clipPoly(pts) {
    const lim = camY() - NEAR, out = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      const ain = a.y <= lim, bin = b.y <= lim;
      if (ain) out.push(a);
      if (ain !== bin) { const t = (lim - a.y) / (b.y - a.y); out.push({ x: a.x + (b.x - a.x) * t, y: lim }); }
    }
    return out;
  }
  function polyPath(pts) {
    const c = clipPoly(pts);
    if (c.length < 3) return;
    c.forEach((p, i) => { const s = proj(p.x, p.y); i ? ctx.lineTo(s.x, s.y) : ctx.moveTo(s.x, s.y); });
    ctx.closePath();
  }

  function quad(pts, color) { ctx.beginPath(); polyPath(pts); ctx.fillStyle = color; ctx.fill(); }

  // ---------- 테마 ----------
  const THEMES = {
    sunset: {
      sky: ['#e7a98c', '#f2c39b', '#f7dcb0'], sun: '#fdebd0', sunGlow: 'rgba(255,240,215,0.55)', cloud: 'rgba(255,245,235,0.65)',
      far: '#d7b394', mid: '#bb9478', win: 'rgba(255,240,200,0.5)', house: '#8b7366', roof: '#5e4d48',
      grass: '#93b96c', grass2: '#7fa85c', infield: '#a2c779', track: '#c97758', line: 'rgba(255,255,255,0.9)', haze: '#e9cfae',
      tree: ['#6f9a4f', '#5f8a44', '#83ad5c'], trunk: '#7a5a43', bush: ['#5e8f45', '#76a957']
    },
    day: {
      sky: ['#6fbff0', '#a6dbf7', '#dff3ff'], sun: '#fff6c9', sunGlow: 'rgba(255,250,210,0.6)', cloud: 'rgba(255,255,255,0.9)',
      far: '#a9c0d6', mid: '#86a3bf', win: 'rgba(255,255,255,0.45)', house: '#d9a37a', roof: '#b05a45',
      grass: '#7fc463', grass2: '#6cb354', infield: '#8fd06f', track: '#d0674a', line: 'rgba(255,255,255,0.95)', haze: '#cfe8d8',
      tree: ['#4f9a43', '#3f8a3a', '#66b257'], trunk: '#7a5a43', bush: ['#3f8a3a', '#5aa64b']
    },
    night: {
      sky: ['#121634', '#262b57', '#4a4778'], sun: '#f4f1d0', sunGlow: 'rgba(240,240,210,0.25)', cloud: 'rgba(160,160,200,0.25)',
      far: '#2c2f55', mid: '#22244a', win: 'rgba(255,214,120,0.85)', house: '#3a3558', roof: '#24203c',
      grass: '#3d6a4c', grass2: '#345d42', infield: '#457755', track: '#8f4c3f', line: 'rgba(255,255,255,0.75)', haze: '#3e3f6c',
      tree: ['#2e5440', '#264a37', '#386348'], trunk: '#3a2c25', bush: ['#2b5038', '#36603f']
    }
  };

  // 배경 스카이라인 (화면 공간, 시차 스크롤)
  const skyline = (() => {
    const rng = mulberry(42), far = [], mid = [], clouds = [];
    let x = 0;
    while (x < 2400) { const w = 40 + rng() * 70; far.push({ x, w, h: 50 + rng() * 120, win: rng() < 0.6 }); x += w + rng() * 8; }
    x = 0;
    while (x < 2400) {
      const isHouse = rng() < 0.55, w = isHouse ? 60 + rng() * 40 : 40 + rng() * 50;
      mid.push({ x, w, h: isHouse ? 30 + rng() * 20 : 60 + rng() * 80, house: isHouse });
      x += w + 10 + rng() * 30;
    }
    for (let i = 0; i < 7; i++) clouds.push({ x: rng() * 2400, y: 0.05 + rng() * 0.18, w: 90 + rng() * 140, sp: 4 + rng() * 6 });
    const stars = [];
    for (let i = 0; i < 90; i++) stars.push({ x: rng(), y: rng() * 0.9, r: 0.5 + rng() * 1.2, tw: rng() * 6 });
    return { far, mid, clouds, stars };
  })();

  function drawSky(th, time) {
    const g = ctx.createLinearGradient(0, 0, 0, HZ);
    g.addColorStop(0, th.sky[0]); g.addColorStop(0.6, th.sky[1]); g.addColorStop(1, th.sky[2]);
    ctx.fillStyle = g; ctx.fillRect(0, 0, CW, HZ + 2);
    if (S.theme === 'night') {
      skyline.stars.forEach((s) => { ctx.globalAlpha = 0.5 + 0.5 * Math.sin(time * 2 + s.tw); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(s.x * CW, s.y * HZ, s.r, 0, 7); ctx.fill(); });
      ctx.globalAlpha = 1;
    }
    // 해 / 달
    const sx = CW * 0.62 - cam.x * 0.15, sy = HZ * 0.55, sr = Math.min(CW, CH) * 0.13;
    const sg = ctx.createRadialGradient(sx, sy, sr * 0.6, sx, sy, sr * 2.2);
    sg.addColorStop(0, th.sunGlow); sg.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = sg; ctx.fillRect(sx - sr * 2.2, sy - sr * 2.2, sr * 4.4, sr * 4.4);
    ctx.fillStyle = th.sun; ctx.beginPath(); ctx.arc(sx, sy, sr, 0, 7); ctx.fill();
    // 구름
    ctx.fillStyle = th.cloud;
    skyline.clouds.forEach((c) => {
      let x = ((c.x + time * c.sp - cam.x * 0.8) % 2400 + 2400) % 2400 - 200;
      for (let rep = 0; rep < 2; rep++, x += 2400) {
        if (x > CW + 200) continue;
        const y = c.y * CH;
        roundRect(x, y, c.w, 14, 7); ctx.fill();
        roundRect(x + c.w * 0.2, y - 9, c.w * 0.45, 14, 7); ctx.fill();
      }
    });
    // 먼 빌딩
    const s = CH / 600;
    ctx.fillStyle = th.far;
    if (S.scene === 'city') skyline.far.forEach((b) => {
      let x = ((b.x - cam.x * 0.6) % 2400 + 2400) % 2400 - 100;
      for (let rep = 0; rep < 2; rep++, x += 2400) {
        if (x > CW + 100 || x + b.w < -100) continue;
        ctx.fillRect(x, HZ - b.h * s * 1.6, b.w, b.h * s * 1.6 + 2);
        if (b.win) {
          ctx.fillStyle = th.win;
          for (let wy = HZ - b.h * s * 1.6 + 10; wy < HZ - 12; wy += 16) for (let wx = x + 8; wx < x + b.w - 10; wx += 14) ctx.fillRect(wx, wy, 6, 7);
          ctx.fillStyle = th.far;
        }
      }
    });
    scenes.far(S.scene, S.theme, time);
    if (S.scene === 'city') city.drawSkyFx(S.theme, time, HZ, CW);
  }
  function roundRect(x, y, w, h, r) {
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }

  const city = City.create({ ctx: () => ctx, proj: (X, Y, Z) => proj(X, Y, Z), cam: () => cam, camY: () => camY(), W: () => CW, mulberry });
  const scenes = Scenes.create({ ctx: () => ctx, proj: (X, Y, Z) => proj(X, Y, Z), cam: () => cam, camY: () => camY(), W: () => CW, H: () => CH, HZ: () => HZ, quad, mulberry });

  function drawGround() {
    const sc = scenes.colors(S.scene, S.theme);
    const g = ctx.createLinearGradient(0, HZ, 0, CH);
    g.addColorStop(0, sc.haze); g.addColorStop(0.07, sc.grass2); g.addColorStop(1, sc.grass);
    ctx.fillStyle = g; ctx.fillRect(0, HZ, CW, CH - HZ);
    const W = track.width, D = track.D;
    scenes.ground(S.scene, S.theme, animT, W);
    const x0 = -25, x1 = D + 60;
    quad([{ x: x0, y: -0.5 }, { x: x1, y: -0.5 }, { x: x1, y: W + 0.5 }, { x: x0, y: W + 0.5 }], sc.surface);
    // 레인 선
    ctx.globalAlpha = sc.lineA;
    for (let i = 0; i <= track.lanes; i++) { const r = i * TR.LW; quad([{ x: x0, y: r - 0.03 }, { x: x1, y: r - 0.03 }, { x: x1, y: r + 0.03 }, { x: x0, y: r + 0.03 }], sc.line); }
    // 10m 눈금
    for (let m = 10; m < D; m += 10) quad([{ x: m - 0.05, y: -0.45 }, { x: m + 0.05, y: -0.45 }, { x: m + 0.05, y: -0.1 }, { x: m - 0.05, y: -0.1 }], sc.line);
    ctx.globalAlpha = 1;
    // 출발선
    quad([{ x: -0.08, y: 0 }, { x: 0.08, y: 0 }, { x: 0.08, y: W }, { x: -0.08, y: W }], '#ffffff');
    // 결승선 (체크무늬)
    const sq = 0.4, cols = Math.ceil(W / sq);
    for (let row = 0; row < 2; row++) for (let c = 0; c < cols; c++) {
      const y0 = c * sq, y1 = Math.min(W, y0 + sq);
      quad([{ x: D + row * sq, y: y0 }, { x: D + (row + 1) * sq, y: y0 }, { x: D + (row + 1) * sq, y: y1 }, { x: D + row * sq, y: y1 }], (row + c) % 2 ? '#222' : '#fff');
    }
  }

  // 출발·결승 아치 (기둥 + 현수막)
  function drawPost(x, y, withBanner, text, color) {
    const H = 3.1;
    const b = proj(x, y, 0), t = proj(x, y, H);
    if (b.zc < 1) return;
    ctx.strokeStyle = '#f5f5f5'; ctx.lineWidth = Math.max(2, 0.14 * b.k);
    ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(t.x, t.y); ctx.stroke();
    if (withBanner) {
      const y1 = -0.7, y2 = track.width + 0.7;
      const a1 = proj(x, y1, H), a2 = proj(x, y2, H), b1 = proj(x, y1, H - 0.75), b2 = proj(x, y2, H - 0.75);
      if (a1.zc < 1 || a2.zc < 1) return;
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.moveTo(a1.x, a1.y); ctx.lineTo(a2.x, a2.y); ctx.lineTo(b2.x, b2.y); ctx.lineTo(b1.x, b1.y); ctx.closePath(); ctx.fill();
      const mx = (a1.x + a2.x + b1.x + b2.x) / 4, my = (a1.y + a2.y + b1.y + b2.y) / 4;
      const fs = Math.abs(b2.y - a2.y + b1.y - a1.y) / 2 * 0.7;
      if (fs > 6) {
        ctx.save(); ctx.translate(mx, my);
        // 글자가 항상 왼쪽→오른쪽으로 읽히도록 방향을 맞춤
        const ang = a2.x >= a1.x ? Math.atan2(a2.y - a1.y, a2.x - a1.x) : Math.atan2(a1.y - a2.y, a1.x - a2.x);
        ctx.transform(Math.cos(ang), Math.sin(ang), 0, 1, 0, 0);
        ctx.fillStyle = '#fff'; ctx.font = "800 " + fs + "px 'Noto Sans KR',sans-serif"; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(text, 0, 0); ctx.restore();
      }
    }
  }

  let animT = 0;
  function drawRunner(o, focus) {
    const pos = pathPos(o.r, o.q0 + o.s);
    const p = proj(pos.x, pos.y, 0);
    if (p.zc < 1.2) return null;
    const sc = p.k * 0.021 * o.look.h;
    // 그림자
    ctx.fillStyle = 'rgba(40,20,10,0.18)';
    ctx.beginPath(); ctx.ellipse(p.x, p.y, 20 * sc, 4.5 * sc, 0, 0, 7); ctx.fill();
    ctx.save(); ctx.translate(p.x, p.y);
    const f = Math.abs(o.face) < 0.18 ? Math.sign(o.face || 1) * 0.18 : o.face;
    ctx.scale(f * sc, sc);
    Runner.draw(ctx, o.look, o.ph, { k: o.k, t: animT + o.idx });
    ctx.restore();
    const head = proj(pos.x, pos.y, 2.1 * o.look.h + 0.25);
    return { o, x: head.x, y: head.y, k: p.k, focus };
  }

  // 이름표 겹침 방지: 가까운(화면 아래) 이름표부터 자리 잡고, 겹치면 위로 올림
  function layoutLabels(labels) {
    const placed = [];
    labels.sort((a, b) => b.y - a.y).forEach((L) => {
      const o = L.o;
      L.fs = clamp(L.k * 0.42, 10, 17);
      ctx.font = `800 ${L.fs}px 'Noto Sans KR',sans-serif`;
      L.txt = (o.rank ? o.rank + '등 ' : '') + o.name;
      L.w = ctx.measureText(L.txt).width + L.fs * 0.9; L.h = L.fs * 1.55;
      L.top = L.y - L.h - (L.focus ? 10 : 2);
      L.anchor = L.y;
      for (let guard = 0; guard < 12; guard++) {
        const hit = placed.find((P) => Math.abs(P.x - L.x) < (P.w + L.w) / 2 + 2 && Math.abs(P.top - L.top) < (P.h + L.h) / 2 + 1);
        if (!hit) break;
        L.top = hit.top - L.h - 2;
      }
      placed.push(L);
    });
  }

  function drawLabel(L) {
    const o = L.o, fs = L.fs, txt = L.txt, w = L.w, h = L.h;
    ctx.font = `800 ${fs}px 'Noto Sans KR',sans-serif`;
    const x = L.x - w / 2, y = L.top;
    if (L.anchor - (y + h) > 14) {
      ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(L.x, y + h); ctx.lineTo(L.x, L.anchor - 2); ctx.stroke();
    }
    roundRect(x, y, w, h, h / 2);
    ctx.fillStyle = L.focus ? '#fff7d6' : 'rgba(255,255,255,0.92)'; ctx.fill();
    ctx.lineWidth = L.focus ? 3 : 2; ctx.strokeStyle = L.focus ? '#ff6b4a' : o.look.shirt === '#ffffff' ? '#bbb' : o.look.shirt; ctx.stroke();
    ctx.fillStyle = '#3a2a1e'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(txt, L.x, y + h / 2 + 0.5);
    if (L.focus) {
      ctx.fillStyle = '#ff6b4a';
      ctx.beginPath(); ctx.moveTo(L.x - 6, y + h + 1); ctx.lineTo(L.x + 6, y + h + 1); ctx.lineTo(L.x, y + h + 8); ctx.fill();
    }
    if (o.oops > 0) {
      ctx.font = `800 ${fs * 1.1}px 'Jua',sans-serif`; ctx.fillStyle = '#ff4757';
      ctx.fillText('앗!', L.x + w / 2 + fs, y - 2);
    }
  }

  // 진행 막대 (오른쪽 위): 출발 ~ 결승까지 주자 위치
  function drawMinimap() {
    const w = Math.min(240, CW * 0.38), h = 46, x0 = CW - w - 12, y0 = 12;
    ctx.fillStyle = 'rgba(255,255,255,0.85)'; roundRect(x0, y0, w, h, 12); ctx.fill();
    const D = track.D, lx = x0 + 16, rx = x0 + w - 16, ly = y0 + 30;
    const X = (m) => lx + (rx - lx) * clamp(m / D, 0, 1);
    ctx.strokeStyle = '#d98a6a'; ctx.lineWidth = 6; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(rx, ly); ctx.stroke(); ctx.lineCap = 'butt';
    ctx.fillStyle = '#7a6250'; ctx.font = "700 10px 'Noto Sans KR',sans-serif"; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    for (let m = 0; m <= D; m += 50) ctx.fillText(m + 'm', X(m), y0 + 16);
    const focus = race.state === 'running' || race.state === 'done' ? (race.winner || ranking()[targetRank() - 1]) : null;
    runners.forEach((o) => {
      ctx.fillStyle = o.look.shirt; ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(X(o.s), ly, o === focus ? 5 : 3.5, 0, 7); ctx.fill(); ctx.stroke();
    });
  }

  // ---------- 색종이 ----------
  let confetti = [];
  function burst() {
    const cols = ['#ff6b4a', '#ffb347', '#3498db', '#2ecc71', '#e84393', '#f6c344', '#8e44ad'];
    for (let i = 0; i < 160; i++) confetti.push({ x: CW / 2 + (Math.random() - 0.5) * 200, y: CH * 0.35, vx: (Math.random() - 0.5) * 700, vy: -300 - Math.random() * 500, r: Math.random() * 6.28, vr: (Math.random() - 0.5) * 12, c: cols[i % cols.length], life: 3 + Math.random() * 1.5 });
  }
  function drawConfetti(dt) {
    confetti = confetti.filter((c) => (c.life -= dt) > 0);
    confetti.forEach((c) => {
      c.vy += 700 * dt; c.vx *= 0.99; c.x += c.vx * dt; c.y += c.vy * dt; c.r += c.vr * dt;
      ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(c.r); ctx.fillStyle = c.c; ctx.fillRect(-5, -3, 10, 6); ctx.restore();
    });
  }

  // ---------- 메인 루프 ----------
  let last = performance.now();
  function frame(now) {
    let dt = Math.min(0.05, (now - last) / 1000); last = now;
    animT += dt;
    const sdt = dt * (+S.speed || 1);
    update(sdt);
    // 방향 전환 부드럽게
    runners.forEach((o) => { const hp = pathPos(o.r, o.q0 + o.s); const tgt = hp.hx >= 0 ? 1 : -1; o.face += (tgt - o.face) * Math.min(1, dt * 7); });
    updateCam(dt);
    render(dt);
    musicTick();
    requestAnimationFrame(frame);
  }

  function render(dt) {
    if (cv.width !== Math.round(cv.getBoundingClientRect().width * DPR)) resize();
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    setupProj();
    const th = THEMES[S.theme] || THEMES.sunset;
    drawSky(th, animT);
    drawGround();
    const focus = race.state === 'running' || race.state === 'done' ? (race.winner || ranking()[targetRank() - 1]) : null;
    const items = [];
    if (S.scene === 'city') city.items(S.theme, animT).forEach((it) => items.push(it));
    scenes.items(S.scene, S.theme, animT, track.width).forEach((it) => items.push(it));
    const D = track.D, W = track.width;
    items.push({ y: -0.7, fn: () => { drawPost(D + 0.2, -0.7, false); drawPost(-0.6, -0.7, false); } });
    items.push({ y: W + 0.7, fn: () => { drawPost(D + 0.2, W + 0.7, true, 'FINISH', '#ff6b4a'); drawPost(-0.6, W + 0.7, false); } });
    const labels = [];
    runners.forEach((o) => { const pos = pathPos(o.r, o.q0 + o.s); items.push({ y: pos.y, fn: () => { const l = drawRunner(o, o === focus); if (l) labels.push(l); } }); });
    items.sort((a, b) => a.y - b.y).forEach((it) => it.fn());
    layoutLabels(labels);
    labels.sort((a, b) => (a.focus ? 1 : 0) - (b.focus ? 1 : 0)).forEach(drawLabel);
    drawMinimap();
    drawConfetti(dt);
  }

  // ---------- UI ----------
  function setHud() {
    const st = { idle: '대기 중', countdown: '준비…', running: '달리는 중', done: '경기 끝' }[race.state];
    $('#hState').textContent = race.winner ? '당첨: ' + race.winner.name : st;
    $('#hArr').textContent = race.finished.length;
    const n = runners.length;
    $('#hMode').textContent = S.mode === 'first' ? '당첨: 1등' : S.mode === 'last' ? '당첨: 꼴찌' : `당첨: ${clamp(+S.nth || 1, 1, Math.max(1, n))}등`;
  }

  function renderArrivals() {
    const ol = $('#arrive'); ol.innerHTML = '';
    $('#arriveEmpty').style.display = race.finished.length ? 'none' : '';
    race.finished.forEach((o) => {
      const li = document.createElement('li');
      if (o === race.winner) li.className = 'win';
      li.innerHTML = `<span class="rk">${o.rank}</span><span class="dot"></span><span class="nm"></span><span class="tm">${o.ftime.toFixed(2)}초</span>`;
      li.querySelector('.dot').style.background = o.look.shirt;
      li.querySelector('.nm').textContent = o.name + (o === race.winner ? ' 🎉' : '');
      ol.appendChild(li);
    });
  }

  let wAnim = null;
  function showModal(o) {
    const n = runners.length;
    $('#wLbl').textContent = S.mode === 'first' ? '🥇 1등으로 들어온 당첨자' : S.mode === 'last' ? '🐢 꼴찌로 들어온 당첨자' : `🎯 ${o.rank}번째로 들어온 당첨자`;
    $('#wName').textContent = o.name;
    $('#modal').classList.add('show');
    renderArrivals(); setHud();
    const c = $('#wCv'), x = c.getContext('2d');
    let ph = 0, t0 = performance.now();
    cancelAnimationFrame(wAnim);
    const loop = (now) => {
      const t = (now - t0) / 1000; ph = t * 2 * Math.PI * 1.6;
      x.setTransform(1, 0, 0, 1, 0, 0); x.clearRect(0, 0, c.width, c.height);
      x.fillStyle = '#fbe7cf'; x.beginPath(); x.ellipse(200, 300, 150, 26, 0, 0, 7); x.fill();
      x.save(); x.translate(200, 300); const s = 2.6; x.scale(s, s);
      // 만세 점프
      x.translate(0, -Math.abs(Math.sin(t * 4)) * 8);
      Runner.draw(x, o.look, ph, { k: 0.75, t });
      x.restore();
      if ($('#modal').classList.contains('show')) wAnim = requestAnimationFrame(loop);
    };
    wAnim = requestAnimationFrame(loop);
    void n;
  }
  function hideModal() { $('#modal').classList.remove('show'); }

  $('#wClose').onclick = hideModal;
  $('#wAgain').onclick = () => { hideModal(); resetRace(); startRace(); };
  $('#wRemove').onclick = () => {
    if (!race.winner) return;
    const target = race.winner.name;
    // 텍스트에서 해당 이름 하나만 줄이기
    const toks = namesEl.value.split(/([,\n])/);
    let done = false;
    for (let i = 0; i < toks.length && !done; i++) {
      const raw = toks[i]; const tk = raw.trim();
      if (!tk || tk === ',' || tk === '\n') continue;
      const m = tk.match(/^(.*?)\s*[*xX×]\s*(\d+)$/);
      if (m && m[1].trim() === target) { const c = +m[2] - 1; toks[i] = c > 1 ? `${target}*${c}` : c === 1 ? target : ''; done = true; }
      else if (tk === target) { toks[i] = ''; done = true; }
    }
    namesEl.value = toks.join('').replace(/(,\s*){2,}/g, ', ').replace(/\n{2,}/g, '\n').replace(/^[,\s]+|[,\s]+$/g, '');
    store.set('runDraw.names', namesEl.value);
    hideModal(); build(false);
  };

  // 세그먼트 버튼
  function syncSeg() {
    $$('.seg').forEach((sg) => { const key = sg.dataset.key; sg.querySelectorAll('button').forEach((b) => b.classList.toggle('on', String(S[key]) === b.dataset.v)); });
    $('#nthBox').classList.toggle('show', S.mode === 'nth');
    $('#nth').value = S.nth;
    setHud();
  }
  $$('.seg').forEach((sg) => sg.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    const key = sg.dataset.key;
    if ((key === 'mode' || key === 'dist') && (race.state === 'countdown')) return;
    if (key === 'mode' && race.state !== 'idle') resetRace();
    S[key] = b.dataset.v; store.set('runDraw.settings', S); syncSeg();
    if (key === 'music') { audioInit(); musicRestart(); }
    if (key === 'dist') { hideModal(); build(false); }
  }));
  $('#nth').addEventListener('input', () => { S.nth = Math.max(1, +$('#nth').value || 1); store.set('runDraw.settings', S); if (race.state !== 'idle') resetRace(); setHud(); });

  let buildT = 0;
  namesEl.addEventListener('input', () => {
    store.set('runDraw.names', namesEl.value);
    clearTimeout(buildT); buildT = setTimeout(() => { if (race.state === 'running' || race.state === 'countdown') return; build(false); }, 250);
  });
  $('#fillNum').onclick = () => { const n = clamp(+$('#numN').value || 0, 2, 60); namesEl.value = Array.from({ length: n }, (_, i) => `${i + 1}번`).join(', '); store.set('runDraw.names', namesEl.value); build(false); };
  $('#clearNames').onclick = () => { namesEl.value = ''; store.set('runDraw.names', ''); build(false); namesEl.focus(); };
  $('#startBtn').onclick = startRace;
  $('#shuffle').onclick = () => { if (race.state === 'countdown') return; hideModal(); build(true); };
  $('#reset').onclick = () => { if (race.state === 'countdown') return; hideModal(); resetRace(); };

  // 즐겨찾기
  function favs() { return store.get('runDraw.favs', [{ name: '우리 반 (예시)', text: DEFAULT_NAMES }]); }
  function renderFavs() {
    const box = $('#favs'); box.innerHTML = '';
    favs().forEach((f, i) => {
      const c = document.createElement('span'); c.className = 'chip';
      c.innerHTML = '<b></b><span></span><i title="삭제">×</i>';
      c.querySelector('b').textContent = f.name;
      c.querySelector('span').textContent = parseNames(f.text).length;
      c.onclick = (e) => {
        if (e.target.tagName === 'I') { const a = favs(); a.splice(i, 1); store.set('runDraw.favs', a); renderFavs(); return; }
        if (race.state === 'countdown' || race.state === 'running') return;
        namesEl.value = f.text; store.set('runDraw.names', f.text); hideModal(); build(false);
      };
      box.appendChild(c);
    });
  }
  $('#favSave').onclick = () => {
    const nm = $('#favName').value.trim() || `명단 ${favs().length + 1}`;
    const a = favs().filter((f) => f.name !== nm); a.push({ name: nm, text: namesEl.value });
    store.set('runDraw.favs', a); $('#favName').value = ''; renderFavs();
  };

  // ---------- 소리 ----------
  const AU = { c: null, master: null, mus: null, step: 0, nextT: 0, kind: 'off' };
  function audioInit() {
    try {
      if (!AU.c) {
        AU.c = new (window.AudioContext || window.webkitAudioContext)();
        AU.master = AU.c.createGain(); AU.master.gain.value = 0.55; AU.master.connect(AU.c.destination);
        AU.mus = AU.c.createGain(); AU.mus.gain.value = 0.32; AU.mus.connect(AU.master);
      }
      if (AU.c.state === 'suspended') AU.c.resume();
    } catch (e) { /* 소리 없음 */ }
  }
  function tone(f, t, dur, type, vol, dest) {
    const c = AU.c; if (!c) return;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type || 'square'; o.frequency.setValueAtTime(f, t);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol || 0.2, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest || AU.master); o.start(t); o.stop(t + dur + 0.05);
  }
  let noiseBuf = null;
  function noise(t, dur, vol, hp, dest) {
    const c = AU.c; if (!c) return;
    if (!noiseBuf) { noiseBuf = c.createBuffer(1, c.sampleRate, c.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
    const s = c.createBufferSource(); s.buffer = noiseBuf;
    const f = c.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = hp || 1000;
    const g = c.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(dest || AU.master); s.start(t); s.stop(t + dur + 0.02);
  }
  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
  function sfxBeep(f) { if (!AU.c) return; tone(f, AU.c.currentTime, 0.18, 'square', 0.18); }
  function sfxGun() { if (!AU.c) return; const t = AU.c.currentTime; noise(t, 0.35, 0.9, 300); tone(990, t, 0.3, 'square', 0.15); }
  function sfxBlip(rank) { if (!AU.c) return; tone(rank === 1 ? 1320 : 880, AU.c.currentTime, 0.12, 'triangle', 0.15); }
  function sfxFanfare() {
    if (!AU.c) return; const t = AU.c.currentTime;
    [72, 76, 79, 84].forEach((m, i) => tone(mtof(m), t + i * 0.12, i === 3 ? 0.7 : 0.18, 'square', 0.16));
    noise(t + 0.4, 1.2, 0.18, 2000);
  }
  function musicRestart() { AU.step = 0; if (AU.c) AU.nextT = AU.c.currentTime + 0.05; }
  function leadProgress() {
    if (race.state !== 'running') return 0;
    let m = 0; runners.forEach((o) => { m = Math.max(m, o.s / track.D); }); return m;
  }
  function musicTick() {
    if (!AU.c || S.music === 'off') return;
    const c = AU.c;
    if (AU.nextT < c.currentTime) AU.nextT = c.currentTime + 0.05;
    const prog = leadProgress();
    const racing = race.state === 'running' || race.state === 'countdown';
    const tempo = racing ? 1 + 0.4 * clamp((prog - 0.55) / 0.45, 0, 1) : 0.85;
    const vol = racing ? 1 : 0.55;
    while (AU.nextT < c.currentTime + 0.15) {
      const st = AU.step, t = AU.nextT;
      if (S.music === 'fun') {
        const bpm = 150 * tempo, e = 60 / bpm / 2;
        const chords = [[60, 64, 67], [57, 60, 64], [53, 57, 60], [55, 59, 62]];
        const ch = chords[Math.floor(st / 8) % 4];
        tone(mtof(ch[0] - 24 + (st % 2 ? 12 : 0)), t, e * 0.9, 'triangle', 0.32 * vol, AU.mus);
        const mel = [0, 2, 1, 2, 0, 1, 2, 1, 2, 2, 1, 0, 1, 2, 0, 1];
        if (st % 16 !== 7 && st % 16 !== 15) tone(mtof(ch[mel[st % 16]] + 12), t, e * 0.7, 'square', 0.09 * vol, AU.mus);
        if (st % 4 === 0) { tone(110, t, 0.12, 'sine', 0.5 * vol, AU.mus); }
        if (st % 8 === 4) noise(t, 0.12, 0.25 * vol, 1500, AU.mus);
        noise(t, 0.03, 0.06 * vol, 7000, AU.mus);
        AU.nextT += e;
      } else {
        const bpm = 112 * tempo, e = 60 / bpm / 2;
        const roots = [45, 45, 41, 40];
        const r = roots[Math.floor(st / 16) % 4];
        tone(mtof(r - 12), t, e * 0.8, 'sawtooth', 0.12 * vol, AU.mus);
        if (st % 8 === 0 || st % 8 === 1) tone(70, t, 0.18, 'sine', 0.55 * vol, AU.mus);
        if (st % 2 === 0) tone(mtof(r + 24 + [0, 3, 7, 12][(st / 2) % 4]), t, e * 1.2, 'triangle', 0.06 * vol, AU.mus);
        if (st % 4 === 2) noise(t, 0.04, 0.08 * vol, 5000, AU.mus);
        AU.nextT += e;
      }
      AU.step++;
    }
  }

  // ---------- 시작 ----------
  resize();
  syncSeg();
  renderFavs();
  build(false);
  requestAnimationFrame(frame);
  window.__race = { race, runners: () => runners, cam, advance(sec) { const n = Math.round(sec * 60); for (let i = 0; i < n; i++) { update(1 / 60); runners.forEach((o) => { const hp = pathPos(o.r, o.q0 + o.s); o.face += ((hp.hx >= 0 ? 1 : -1) - o.face) * 0.12; }); updateCam(1 / 60); animT += 1 / 60; } render(0); return race.t; } };
})();
