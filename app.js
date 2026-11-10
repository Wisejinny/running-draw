/* app.js — 경주 뽑기: 육상 · 경주마 · 사이클 · 조정 · 스키 · 수영 */
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
  const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const TAU = Math.PI * 2;
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* 무시 */ } }
  };

  // ---------- 설정 ----------
  const S = Object.assign({ mode: 'first', nth: 2, cam: 'follow', speed: '1', music: 'off', sport: 'track', dist: '100', scene: 'stadium', hurdle: 'off' }, store.get('runDraw.settings', {}));
  if (!['stadium', 'rivercity', 'nightcity', 'greenhills', 'goldenmist', 'bluesky'].includes(S.scene)) S.scene = 'stadium';
  if (S.music === 'fun') S.music = 'dance'; else if (S.music === 'tense') S.music = 'beat';
  const DEFAULT_NAMES = '김민준, 이서연, 박지호, 최하은, 정우진, 강수아, 조예준, 윤지우';
  const namesEl = $('#names');
  namesEl.value = store.get('runDraw.names', DEFAULT_NAMES);

  function parseNames(txt) {
    const out = [];
    txt.split(/[,\n]/).map((s) => s.trim()).filter(Boolean).forEach((tok) => {
      const m = tok.match(/^(.*?)\s*[*xX×]\s*(\d+)$/);
      if (m && m[1].trim()) { const n = clamp(+m[2], 1, 10); for (let i = 0; i < n; i++) out.push(m[1].trim()); }
      else out.push(tok);
    });
    return out.slice(0, 60);
  }

  // ---------- 상태 ----------
  const track = { lanes: 8, laneW: 1.9, width: 15.2, W: 15.2, rIn: 0, D: 100, hurdles: [] };
  let runners = [];
  let seedBase = store.get('runDraw.seed', (Math.random() * 1e9) | 0);
  const race = { state: 'idle', t: 0, finished: [], winner: null, declaredAt: 0, doneAt: 0, bell: false, token: 0 };
  let excite = 0.08, animT = 0, terrainFn = null;
  let SPORTS = null, sp = null;
  const curDist = () => sp.dists.find((d) => d.v === S.dist) || sp.dists[0];
  const V0 = () => track.D / sp.time(track.D) * (track.hurdles.length ? 0.9 : 1);
  const posOf = (o) => sp.pos(o.r, o.q0 + o.s);

  function build(reshuffle) {
    sp = SPORTS[S.sport] || SPORTS.track;
    if (!sp.dists.some((d) => d.v === S.dist)) S.dist = sp.defDist;
    if (reshuffle) { seedBase = (Math.random() * 1e9) | 0; store.set('runDraw.seed', seedBase); }
    const names = parseNames(namesEl.value);
    const n = names.length;
    const rng = mulberry(seedBase);
    const order = names.map((_, i) => i);
    for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
    const maxLanes = sp.oval ? 8 : 12;
    track.lanes = clamp(n, 3, maxLanes); track.laneW = sp.laneW; track.width = track.W = track.lanes * sp.laneW;
    const base0 = sp.oval ? sp.oval.R0 : 0;
    runners = order.map((ni, i) => {
      const r = n <= track.lanes ? base0 + (i + Math.floor((track.lanes - n) / 2) + 0.5) * sp.laneW : base0 + (i + 0.5) * track.W / n;
      const lr = mulberry(hash(names[ni]) ^ (seedBase + i * 7919));
      return { name: names[ni], idx: i, r, sport: S.sport, look: Sprites.makeLook(S.sport, lr), q0: 0, s: 0, v: 0, ph: lr() * TAU, face: 1, k: 0 };
    });
    track.rIn = runners.length ? Math.min(...runners.map((o) => o.r)) : base0 + sp.laneW / 2;
    const dd = curDist();
    track.D = sp.D ? sp.D(dd, track) : dd.D(track);
    track.hurdles = [];
    if (sp.hurdles && S.hurdle === 'on') { const gap = (track.D - 13 - 10.5) / 9; for (let i = 0; i < 10; i++) track.hurdles.push(13 + i * gap); }
    runners.forEach((o) => { o.q0 = sp.q0(o.r, track.D); });
    terrainFn = sp.terrain ? (x) => sp.terrain(x, track) : null;
    sp.setup(track);
    cam.inited = false;
    $('#cnt').textContent = n + '명';
    $('#hTot').textContent = n;
    resetRace();
  }

  // ---------- 경주 상태 ----------
  function resetRace() {
    race.state = 'idle'; race.t = 0; race.finished = []; race.winner = null; race.bell = false; race.doneAt = 0; race.token++;
    excite = 0.08;
    runners.forEach((o) => {
      const rr = Math.random;
      Object.assign(o, {
        s: 0, v: 0, fin: false, rank: 0, ftime: 0, face: 1, k: 0,
        react: 0.08 + rr() * 0.28, base: 0.965 + rr() * 0.07,
        w1: 0.5 + rr() * 0.9, w2: 1.1 + rr() * 1.4, p1: rr() * 6.28, p2: rr() * 6.28,
        ev: 0, evT: 1.5 + rr() * 2, kick: rr() * 0.14 - 0.03, stumble: 0, oops: 0,
        stride: 3.9 + rr() * 0.5, hi: 0, jump: -1, clip: false, knocked: [], cyc: 0
      });
    });
    const f = fx(); if (f) f.stop();
    renderArrivals();
    setHud();
    $('#startBtn').disabled = runners.length < 2;
  }

  function startRace() {
    if (runners.length < 2) return;
    if (race.state !== 'idle') resetRace();
    hideModal();
    race.state = 'countdown';
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

  // 관중 열기: 선두가 결승에 다가갈수록, 접전일수록 높아짐
  function updateExcite(dt) {
    let tgt = 0.08;
    if (race.state === 'running' || race.state === 'done') {
      const r = ranking(), p1 = r.length ? Math.min(1, r[0].s / track.D) : 0;
      let close = 0;
      if (r.length > 1 && !race.finished.length) close = clamp(1 - ((r[0].s - r[1].s) / track.D) / 0.05, 0, 1);
      tgt = 0.15 + 0.5 * smoothstep(0.4, 1, p1) + 0.25 * close * smoothstep(0.55, 1, p1);
      if (race.finished.length) tgt = race.state === 'done' ? 0.5 : 1;
      if (race.state === 'done' && performance.now() - race.doneAt > 6000) tgt = 0.05;
    }
    excite += (tgt - excite) * Math.min(1, dt * (tgt > excite ? 2.6 : 0.7));
  }

  const BEATS = { thud: [0, 0.14, 0.52], tick: [0], splash: [0.02], whoosh: [0, 0.5], step: [] };

  function update(dt) {
    if (race.state !== 'running' && race.state !== 'done') {
      runners.forEach((o) => { o.k += (0 - o.k) * Math.min(1, dt * 4); });
      return;
    }
    race.t += dt;
    const v0 = V0(), cad = sp.cad;
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
      // 허들 (육상 전용)
      if (track.hurdles.length && o.hi < track.hurdles.length) {
        const hx = track.hurdles[o.hi];
        if (o.jump < 0 && o.s >= hx - 1.9) { o.jump = hx - 1.9; o.clip = Math.random() < 0.08; }
        if (o.jump >= 0 && o.clip && o.s >= hx && !o.knocked[o.hi]) { o.knocked[o.hi] = true; o.stumble = 0.45; o.oops = 1.0; sfxHurdle(); }
        if (o.jump >= 0 && o.s >= o.jump + 3.1) { o.jump = -1; o.hi++; }
      }
      if (cad.mode === 'time') o.ph += o.v > 0.3 ? dt * TAU * cad.hz(o.v) : dt * TAU * 0.12;
      else o.ph += (o.v * dt * TAU) / (cad.len * (o.stride / 4.15));
      const kt = race.t < o.react ? 0.15 : clamp(o.v / (v0 * 0.8), 0, 1);
      o.k += (kt - o.k) * Math.min(1, dt * 6);
      if (!o.fin && o.s >= track.D) {
        o.fin = true;
        o.ftime = race.t - (o.s - track.D) / Math.max(o.v, 0.1);
        just.push(o);
      }
    }
    // 선두의 발소리·물소리 (종목별)
    const lead = ranking()[0];
    if (lead && !lead.fin && lead.v > 1) {
      const fr = (lead.ph / TAU) % 1, prev = lead.cyc; lead.cyc = fr;
      const f = fx();
      if (f) for (const b of (BEATS[sp.sfx] || [])) if ((prev < b && fr >= b) || (fr < prev - 0.5 && b === 0)) f.sport(sp.sfx, lead.v);
    }
    if (sp.bell && !race.bell && lead && track.D > sp.lapLen(track.rIn) * 1.01 && lead.s >= track.D - sp.lapLen(track.rIn)) { race.bell = true; sfxBell(); }
    if (just.length) {
      just.sort((a, b) => a.ftime - b.ftime);
      for (const o of just) {
        race.finished.push(o); o.rank = race.finished.length;
        const f = fx();
        if (o.rank === 1) { if (f) f.horn(); } else { sfxBlip(o.rank); if (f && o.rank <= 3) f.cheer(); }
        checkWinner(o);
      }
      renderArrivals();
      if (race.finished.length === runners.length) { race.state = 'done'; race.doneAt = performance.now(); }
    }
    setHud();
  }

  function checkWinner(o) {
    if (race.winner) return;
    if (o.rank === targetRank()) {
      race.winner = o; race.declaredAt = performance.now();
      const tok = race.token;
      setTimeout(() => { if (tok !== race.token) return; sfxFanfare(); showModal(o); burst(); }, 1400);
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
    const W = track.W, D = track.D, cfg = sp.cam(W), ov = sp.oval;
    const R = ov ? ov.R0 + W : 0;
    if (S.cam === 'all') {
      if (ov) return { x: 0, y: 0, back: (ov.L + 2 * R) * 0.5 + 18, ratio: 0.5 };
      return { x: D / 2, y: W / 2, back: Math.min(D * 0.6 + 18, 190), ratio: 0.5 };
    }
    if (!runners.length) return { x: 0, y: W / 2, back: cfg.back, ratio: cfg.ratio };
    if (race.state === 'idle' || race.state === 'countdown') {
      if (ov) { const o = runners[runners.length >> 1], p = posOf(o); return { x: p.x + p.hx * cfg.ahead * 0.4, y: p.y, back: cfg.back * (1 + 0.3 * clamp(-p.y / R, 0, 1)) + 4, ratio: cfg.ratio }; }
      return { x: 5, y: W / 2, back: cfg.back + 2, ratio: cfg.ratio };
    }
    if (race.winner && performance.now() - race.declaredAt > 2200) {
      const fin = sp.finish(track);
      return { x: fin.x + 3, y: (fin.y0 + fin.y1) / 2, back: cfg.back + 4, ratio: cfg.ratio };
    }
    const f = race.winner && performance.now() - race.declaredAt > 400 ? race.winner : ranking()[targetRank() - 1];
    const p = posOf(f), list = ranking();
    const spread = Math.abs(list[0].s - list[list.length - 1].s);
    let back = cfg.back + clamp(spread * cfg.spread, 0, cfg.maxSpread);
    if (ov) back *= 1 + 0.3 * clamp(-p.y / R, 0, 1);
    return { x: p.x + p.hx * cfg.ahead, y: ov ? p.y + p.hy * cfg.ahead : W / 2, back, ratio: cfg.ratio };
  }

  function updateCam(dt) {
    const t = camTarget();
    if (!cam.inited) { Object.assign(cam, t); cam.inited = true; return; }
    const a = Math.min(1, dt * 3.2);
    cam.x += (t.x - cam.x) * a; cam.y += (t.y - cam.y) * a; cam.back += (t.back - cam.back) * Math.min(1, dt * 1.6);
    cam.ratio += ((t.ratio || 0.45) - cam.ratio) * Math.min(1, dt * 1.6);
  }

  function setupProj() {
    HZ = CH * 0.4;
    F = (CH * 0.66 - HZ) / cam.ratio;
  }
  const camY = () => cam.y + cam.back;
  const camH = () => cam.back * cam.ratio;
  function proj(X, Y, Z) {
    const zc = camY() - Y;
    const k = F / zc;
    const dz = terrainFn ? terrainFn(X) - terrainFn(cam.x) : 0;
    return { x: CW / 2 + (X - cam.x) * k, y: HZ + (camH() - (Z || 0) - dz) * k, k, zc };
  }
  const NEAR = 0.6;

  function clipPoly(pts) {
    const lim = camY() - NEAR, out = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      const ain = a.y <= lim, bin = b.y <= lim;
      if (ain) out.push(a);
      if (ain !== bin) { const t = (lim - a.y) / (b.y - a.y); out.push({ x: a.x + (b.x - a.x) * t, y: lim, z: (a.z || 0) + ((b.z || 0) - (a.z || 0)) * t }); }
    }
    return out;
  }
  function polyPath(pts) {
    const c = clipPoly(pts);
    if (c.length < 3) return;
    c.forEach((p, i) => { const s = proj(p.x, p.y, p.z || 0); i ? ctx.lineTo(s.x, s.y) : ctx.moveTo(s.x, s.y); });
    ctx.closePath();
  }
  function quad(pts, color) { ctx.beginPath(); polyPath(pts); ctx.fillStyle = color; ctx.fill(); }
  function roundRect(x, y, w, h, r) {
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }

  // ---------- 사진 배경 ----------
  // hz: 사진에서 지평선 높이 비율. surface/lines: 육상 트랙 색
  const PHOTO = {
    stadium: { file: 'bg/stadium.jpg', hz: 0.54, surface: '#b9604c', lines: '#ffffff' },
    rivercity: { file: 'bg/rivercity.jpg', hz: 0.55, surface: '#b8a58d', lines: '#ffffff' },
    nightcity: { file: 'bg/nightcity.jpg', hz: 0.55, surface: '#5b4458', lines: '#ffd6f0' },
    greenhills: { file: 'bg/greenhills.jpg', hz: 0.55, surface: '#c9a77d', lines: '#ffffff' },
    goldenmist: { file: 'bg/goldenmist.jpg', hz: 0.55, surface: '#bda585', lines: '#fff6dc' },
    bluesky: { file: 'bg/bluesky.jpg', hz: 0.55, surface: '#6aa655', lines: '#ffffff' },
    racecourse: { file: 'bg/racecourse.jpg', hz: 0.55, surface: '#b9895a', lines: '#ffffff' },
    velodrome: { file: 'bg/velodrome.jpg', hz: 0.55, surface: '#d4a05a', lines: '#ffffff' },
    regatta: { file: 'bg/regatta.jpg', hz: 0.55, surface: '#2a7fa6', lines: '#ffffff' },
    skislope: { file: 'bg/skislope.jpg', hz: 0.55, surface: '#eef3f8', lines: '#9fb4cc' },
    pool: { file: 'bg/pool.jpg', hz: 0.55, surface: '#2cc6e8', lines: '#ffffff' }
  };
  const photoCache = {};
  function getPhoto(key) {
    let p = photoCache[key];
    if (p) return p;
    p = photoCache[key] = { img: new Image(), ready: false, top: '#9fb8d0', bot: '#7a8a6a' };
    p.img.onload = () => {
      p.ready = true;
      try {
        const c = document.createElement('canvas'); c.width = 16; c.height = 16; const g = c.getContext('2d');
        const avg = (sy, sh) => { g.clearRect(0, 0, 16, 16); g.drawImage(p.img, 0, sy, p.img.naturalWidth, sh, 0, 0, 16, 16); const d = g.getImageData(0, 0, 16, 16).data; let r = 0, gg = 0, b = 0; for (let i = 0; i < d.length; i += 4) { r += d[i]; gg += d[i + 1]; b += d[i + 2]; } const n = d.length / 4; return 'rgb(' + Math.round(r / n) + ',' + Math.round(gg / n) + ',' + Math.round(b / n) + ')'; };
        p.top = avg(0, Math.max(2, p.img.naturalHeight * 0.03)); p.bot = avg(p.img.naturalHeight * 0.97, Math.max(2, p.img.naturalHeight * 0.03));
      } catch (e) { /* 색 추출 실패해도 사진은 그대로 */ }
    };
    p.img.src = PHOTO[key].file;
    return p;
  }
  const photoKey = () => (sp.usesScene ? S.scene : sp.photo);
  function drawPhotoBg() {
    const key = photoKey(), def = PHOTO[key], p = getPhoto(key);
    if (!p.ready) { const g = ctx.createLinearGradient(0, 0, 0, CH); g.addColorStop(0, '#cfe1ef'); g.addColorStop(0.4, '#e9eef0'); g.addColorStop(1, def.surface); ctx.fillStyle = g; ctx.fillRect(0, 0, CW, CH); return; }
    const iw = p.img.naturalWidth, ih = p.img.naturalHeight;
    const sc = Math.max(CW * 1.18 / iw, HZ / (def.hz * ih), (CH - HZ) / ((1 - def.hz) * ih));
    const dy = HZ - def.hz * ih * sc, w = iw * sc, h = ih * sc;
    const ov = sp.oval, R = ov ? ov.R0 + track.W : 0;
    const a0 = ov ? -(ov.L / 2 + R) : 0, a1 = ov ? ov.L / 2 + R : track.D;
    const pan = clamp((cam.x - a0) / Math.max(1, a1 - a0), 0, 1) * Math.max(0, w - CW);
    ctx.fillStyle = p.top; ctx.fillRect(0, 0, CW, Math.max(0, dy) + 2);
    ctx.drawImage(p.img, -pan, dy, w, h);
    if (dy + h < CH) { ctx.fillStyle = p.bot; ctx.fillRect(0, dy + h - 1, CW, CH - (dy + h) + 2); }
  }

  // ---------- 바닥·결승선·장식 ----------
  function drawGround() {
    sp.ground(track);
    const fin = sp.finish(track);
    if (!sp.noFinish) {
      const sq = Math.max(0.4, (fin.y1 - fin.y0) / 36), cols = Math.ceil((fin.y1 - fin.y0) / sq);
      for (let row = 0; row < 2; row++) for (let c = 0; c < cols; c++) {
        const y0 = fin.y0 + c * sq, y1 = Math.min(fin.y1, y0 + sq);
        quad([{ x: fin.x + row * sq, y: y0 }, { x: fin.x + (row + 1) * sq, y: y0 }, { x: fin.x + (row + 1) * sq, y: y1 }, { x: fin.x + row * sq, y: y1 }], (row + c) % 2 ? '#222' : '#fff');
      }
    }
    if (!sp.noStart) {
      const hw = track.laneW * 0.48;
      runners.forEach((o) => {
        const p = sp.pos(o.r, o.q0), nx = -p.hy, ny = p.hx, d = 0.07;
        const Q = (a, b) => ({ x: p.x + nx * a + p.hx * b, y: p.y + ny * a + p.hy * b, z: p.lift || 0 });
        quad([Q(-hw, -d), Q(hw, -d), Q(hw, d), Q(-hw, d)], 'rgba(255,255,255,0.95)');
      });
    }
  }

  // 결승 아치 (기둥 + 현수막)
  function drawPost(x, y, withBanner, text, color, ya, yb) {
    const H = 3.1;
    const b = proj(x, y, 0), t = proj(x, y, H);
    if (b.zc < 1) return;
    ctx.strokeStyle = '#f5f5f5'; ctx.lineWidth = Math.max(2, 0.14 * b.k);
    ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(t.x, t.y); ctx.stroke();
    if (withBanner) {
      const a1 = proj(x, ya, H), a2 = proj(x, yb, H), b1 = proj(x, ya, H - 0.75), b2 = proj(x, yb, H - 0.75);
      if (a1.zc < 1 || a2.zc < 1) return;
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.moveTo(a1.x, a1.y); ctx.lineTo(a2.x, a2.y); ctx.lineTo(b2.x, b2.y); ctx.lineTo(b1.x, b1.y); ctx.closePath(); ctx.fill();
      const mx = (a1.x + a2.x + b1.x + b2.x) / 4, my = (a1.y + a2.y + b1.y + b2.y) / 4;
      const fs = Math.abs(b2.y - a2.y + b1.y - a1.y) / 2 * 0.7;
      if (fs > 6) {
        ctx.save(); ctx.translate(mx, my);
        const ang = a2.x >= a1.x ? Math.atan2(a2.y - a1.y, a2.x - a1.x) : Math.atan2(a1.y - a2.y, a1.x - a2.x);
        ctx.transform(Math.cos(ang), Math.sin(ang), 0, 1, 0, 0);
        ctx.fillStyle = '#fff'; ctx.font = '800 ' + fs + "px 'Noto Sans KR',sans-serif"; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(text, 0, 0); ctx.restore();
      }
    }
  }

  // ---------- 참가자 ----------
  function drawRunner(o, focus) {
    const pos = posOf(o), meta = Sprites.meta[S.sport], lift0 = pos.lift || 0;
    const p = proj(pos.x, pos.y, lift0);
    if (p.zc < 1.2) return null;
    const sc = p.k * meta.unit * o.look.h;
    const u = o.jump >= 0 ? clamp((o.s - o.jump) / 3.1, 0, 1) : -1;
    const lift = u >= 0 ? Math.sin(Math.PI * u) * 0.78 : 0;
    const pj = lift ? proj(pos.x, pos.y, lift0 + lift) : p;
    if (meta.shadow) {
      const shs = 1 - lift * 0.4;
      ctx.fillStyle = 'rgba(30,15,5,0.22)';
      ctx.beginPath(); ctx.ellipse(p.x, p.y, meta.shadow[0] * sc * shs, meta.shadow[1] * sc * shs, 0, 0, 7); ctx.fill();
    }
    ctx.save(); ctx.translate(pj.x, pj.y);
    if (sp.sprRot) ctx.rotate(sp.sprRot(pos.x, track));
    const f = Math.abs(o.face) < 0.3 ? Math.sign(o.face || 1) * 0.3 : o.face;
    ctx.scale(f * sc, sc);
    let ph = o.ph;
    if (u > 0.08 && u < 0.92) { ph = Math.PI / 2; ctx.rotate(0.22 * Math.sin(Math.PI * u)); }
    Sprites.draw(S.sport, ctx, o, { ph, k: o.k, t: animT + o.idx, s: o.s, v: o.v, lean: pos.lean || 0 });
    ctx.restore();
    const head = proj(pos.x, pos.y, lift0 + meta.labelZ(o) + lift);
    return { o, x: head.x, y: head.y, k: p.k, focus };
  }

  // 허들 한 개 (육상)
  function drawHurdle(x, r, knocked) {
    const hw = Math.min(track.laneW, track.W / Math.max(1, runners.length)) * 0.42, H = 0.76;
    const L0 = proj(x, r - hw, 0), L1 = proj(x, r + hw, 0);
    if (L0.zc < 1.2 || L1.zc < 1.2) return;
    if (L0.x < -200 || L0.x > CW + 200) return;
    ctx.lineCap = 'round';
    if (!knocked) {
      const T0 = proj(x, r - hw, H), T1 = proj(x, r + hw, H);
      ctx.strokeStyle = '#9aa0a8'; ctx.lineWidth = Math.max(1.2, 0.05 * L0.k);
      ctx.beginPath(); ctx.moveTo(L0.x, L0.y); ctx.lineTo(T0.x, T0.y); ctx.moveTo(L1.x, L1.y); ctx.lineTo(T1.x, T1.y); ctx.stroke();
      const F0 = proj(x + 0.35, r - hw, 0), F1 = proj(x + 0.35, r + hw, 0);
      ctx.beginPath(); ctx.moveTo(L0.x, L0.y); ctx.lineTo(F0.x, F0.y); ctx.moveTo(L1.x, L1.y); ctx.lineTo(F1.x, F1.y); ctx.stroke();
      const n = 6, bh = 0.12;
      for (let i = 0; i < n; i++) {
        const a = proj(x, r - hw + (2 * hw * i) / n, H), b = proj(x, r - hw + (2 * hw * (i + 1)) / n, H);
        const a2 = proj(x, r - hw + (2 * hw * i) / n, H - bh), b2 = proj(x, r - hw + (2 * hw * (i + 1)) / n, H - bh);
        ctx.fillStyle = i % 2 ? '#1f2328' : '#ffffff';
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(b2.x, b2.y); ctx.lineTo(a2.x, a2.y); ctx.closePath(); ctx.fill();
      }
    } else {
      const a = proj(x + 0.7, r - hw, 0.08), b = proj(x + 0.7, r + hw, 0.08);
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = Math.max(2, 0.1 * L0.k);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      ctx.strokeStyle = '#9aa0a8'; ctx.lineWidth = Math.max(1.2, 0.05 * L0.k);
      ctx.beginPath(); ctx.moveTo(L0.x, L0.y); ctx.lineTo(a.x, a.y); ctx.moveTo(L1.x, L1.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }
    ctx.lineCap = 'butt';
  }

  // 이름표 겹침 방지: 가까운(화면 아래) 이름표부터 자리 잡고, 겹치면 위로 올림
  function layoutLabels(labels) {
    const placed = [];
    labels.sort((a, b) => b.y - a.y).forEach((L) => {
      const o = L.o;
      L.fs = clamp(L.k * 0.42, 10, 17);
      ctx.font = '800 ' + L.fs + "px 'Noto Sans KR',sans-serif";
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
    ctx.font = '800 ' + fs + "px 'Noto Sans KR',sans-serif";
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
      ctx.font = '800 ' + fs * 1.1 + "px 'Jua',sans-serif"; ctx.fillStyle = '#ff4757';
      ctx.fillText('앗!', L.x + w / 2 + fs, y - 2);
    }
  }

  // 진행 막대 (오른쪽 위): 출발 ~ 결승
  function drawProgress() {
    const w = Math.min(250, CW * 0.4), h = 46, x0 = CW - w - 12, y0 = 12;
    ctx.fillStyle = 'rgba(255,255,255,0.85)'; roundRect(x0, y0, w, h, 12); ctx.fill();
    const lx = x0 + 18, rx = x0 + w - 18, ly = y0 + 30;
    const X = (p) => lx + (rx - lx) * clamp(p, 0, 1);
    ctx.strokeStyle = '#d98a6a'; ctx.lineWidth = 6; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(rx, ly); ctx.stroke(); ctx.lineCap = 'butt';
    ctx.fillStyle = '#7a6250'; ctx.font = "700 10px 'Noto Sans KR',sans-serif"; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    const ticks = sp.ticks(track, curDist());
    ticks.forEach((tk, i) => { ctx.textAlign = i === 0 ? 'left' : i === ticks.length - 1 ? 'right' : 'center'; ctx.fillText(tk.label, i === 0 ? lx - 6 : i === ticks.length - 1 ? rx + 6 : X(tk.p), y0 + 16); });
    const focus = race.state === 'running' || race.state === 'done' ? (race.winner || ranking()[targetRank() - 1]) : null;
    runners.forEach((o) => {
      ctx.fillStyle = o.look.shirt; ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(X(o.s / track.D), ly, o === focus ? 5 : 3.5, 0, 7); ctx.fill(); ctx.stroke();
    });
  }

  // ---------- 색종이 ----------
  let confetti = [];
  function burst() {
    const cols = ['#ff6b4a', '#ffb347', '#3498db', '#2ecc71', '#e84393', '#f6c344', '#8e44ad'];
    for (let i = 0; i < 180; i++) confetti.push({ x: CW / 2 + (Math.random() - 0.5) * 240, y: CH * 0.35, vx: (Math.random() - 0.5) * 760, vy: -300 - Math.random() * 520, r: Math.random() * 6.28, vr: (Math.random() - 0.5) * 12, c: cols[i % cols.length], life: 3 + Math.random() * 1.5 });
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
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    animT += dt;
    step(dt);
    render(dt);
    musicTick();
    requestAnimationFrame(frame);
  }
  function step(dt) {
    update(dt * (+S.speed || 1));
    runners.forEach((o) => { const hp = posOf(o); const tgt = hp.hx >= 0 ? 1 : -1; o.face += (tgt - o.face) * Math.min(1, dt * 7); });
    updateExcite(dt);
    updateCam(dt);
    const f = fx();
    if (f) f.tick(dt, { racing: race.state === 'running', done: race.state === 'done' && performance.now() - race.doneAt < 6000, prog: leadProgress(), E: excite });
  }

  function render(dt) {
    if (cv.width !== Math.round(cv.getBoundingClientRect().width * DPR)) resize();
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    setupProj();
    drawPhotoBg();
    drawGround();
    const focus = race.state === 'running' || race.state === 'done' ? (race.winner || ranking()[targetRank() - 1]) : null;
    const items = sp.items(track).slice();
    const fin = sp.finish(track), D = track.D;
    if (!sp.noArch) {
      items.push({ y: fin.y0 - 0.7, fn: () => { drawPost(fin.x + 0.2, fin.y0 - 0.7, false); } });
      items.push({ y: fin.y1 + 0.7, fn: () => { drawPost(fin.x + 0.2, fin.y1 + 0.7, true, 'FINISH', '#ff6b4a', fin.y0 - 0.7, fin.y1 + 0.7); } });
    }
    track.hurdles.forEach((hx, hi) => runners.forEach((o) => items.push({ y: o.r - 0.05, fn: () => drawHurdle(hx, o.r, !!o.knocked[hi]) })));
    void D;
    const labels = [];
    runners.forEach((o) => { const pos = posOf(o); items.push({ y: pos.y, fn: () => { const l = drawRunner(o, o === focus); if (l) labels.push(l); } }); });
    items.sort((a, b) => a.y - b.y).forEach((it) => it.fn());
    layoutLabels(labels);
    labels.sort((a, b) => (a.focus ? 1 : 0) - (b.focus ? 1 : 0)).forEach(drawLabel);
    drawProgress();
    drawConfetti(dt);
  }

  // ---------- UI ----------
  function setHud() {
    const st = { idle: '대기 중', countdown: '준비…', running: sp ? sp.verb : '달리는 중', done: '경기 끝' }[race.state];
    $('#hState').textContent = race.winner ? '당첨: ' + race.winner.name : st;
    $('#hArr').textContent = race.finished.length;
    const n = runners.length;
    $('#hMode').textContent = S.mode === 'first' ? '당첨: 1등' : S.mode === 'last' ? '당첨: 꼴찌' : '당첨: ' + clamp(+S.nth || 1, 1, Math.max(1, n)) + '등';
  }

  function renderArrivals() {
    const ol = $('#arrive'); ol.innerHTML = '';
    $('#arriveEmpty').style.display = race.finished.length ? 'none' : '';
    race.finished.forEach((o) => {
      const li = document.createElement('li');
      if (o === race.winner) li.className = 'win';
      li.innerHTML = '<span class="rk">' + o.rank + '</span><span class="dot"></span><span class="nm"></span><span class="tm">' + o.ftime.toFixed(2) + '초</span>';
      li.querySelector('.dot').style.background = o.look.shirt;
      li.querySelector('.nm').textContent = o.name + (o === race.winner ? ' 🎉' : '');
      ol.appendChild(li);
    });
  }

  let wAnim = null;
  const WIN_SC = { track: 2.6, horse: 2.1, cycle: 2.7, rowing: 0.8, ski: 2.6, swim: 2.6 };
  function showModal(o) {
    $('#wLbl').textContent = S.mode === 'first' ? '🥇 1등으로 들어온 당첨자' : S.mode === 'last' ? '🐢 꼴찌로 들어온 당첨자' : '🎯 ' + o.rank + '번째로 들어온 당첨자';
    $('#wName').textContent = o.name;
    $('#modal').classList.add('show');
    renderArrivals(); setHud();
    const c = $('#wCv'), x = c.getContext('2d');
    const t0 = performance.now(), sport = o.sport || S.sport;
    cancelAnimationFrame(wAnim);
    const loop = (now) => {
      const t = (now - t0) / 1000, ph = t * TAU * (sport === 'swim' || sport === 'rowing' ? 0.9 : 1.6);
      x.setTransform(1, 0, 0, 1, 0, 0); x.clearRect(0, 0, c.width, c.height);
      x.fillStyle = '#fbe7cf'; x.beginPath(); x.ellipse(200, 300, 150, 26, 0, 0, 7); x.fill();
      x.save(); x.translate(200, sport === 'swim' ? 290 : 300);
      if (sport === 'rowing' || sport === 'swim') { x.fillStyle = sport === 'swim' ? 'rgba(44,198,232,0.55)' : 'rgba(60,140,190,0.45)'; x.fillRect(-190, 4, 380, 40); }
      const s = WIN_SC[sport] || 2.4; x.scale(s, s);
      if (sport === 'track') x.translate(0, -Math.abs(Math.sin(t * 4)) * 8);
      Sprites.draw(sport, x, o, { ph, k: 0.75, t, s: t * 8, v: 8, lean: Math.sin(t * 2) });
      x.restore();
      if ($('#modal').classList.contains('show')) wAnim = requestAnimationFrame(loop);
    };
    wAnim = requestAnimationFrame(loop);
  }
  function hideModal() { $('#modal').classList.remove('show'); }

  $('#wClose').onclick = hideModal;
  $('#wAgain').onclick = () => { hideModal(); resetRace(); startRace(); };
  $('#wRemove').onclick = () => {
    if (!race.winner) return;
    const target = race.winner.name;
    const toks = namesEl.value.split(/([,\n])/);
    let done = false;
    for (let i = 0; i < toks.length && !done; i++) {
      const tk = toks[i].trim();
      if (!tk || tk === ',' || tk === '\n') continue;
      const m = tk.match(/^(.*?)\s*[*xX×]\s*(\d+)$/);
      if (m && m[1].trim() === target) { const c = +m[2] - 1; toks[i] = c > 1 ? target + '*' + c : c === 1 ? target : ''; done = true; }
      else if (tk === target) { toks[i] = ''; done = true; }
    }
    namesEl.value = toks.join('').replace(/(,\s*){2,}/g, ', ').replace(/\n{2,}/g, '\n').replace(/^[,\s]+|[,\s]+$/g, '');
    store.set('runDraw.names', namesEl.value);
    hideModal(); build(false);
  };

  // 설정 버튼들
  function renderSportButtons() {
    const box = $('[data-key="sport"]');
    box.innerHTML = Object.values(SPORTS).map((s) => '<button data-v="' + s.id + '"><span class="ic">' + s.icon + '</span>' + s.label + '</button>').join('');
  }
  function syncSeg() {
    const sg = $('[data-key="dist"]');
    sg.innerHTML = sp.dists.map((d) => '<button data-v="' + d.v + '">' + d.label + '</button>').join('');
    sg.style.gridAutoColumns = '1fr';
    $$('.seg').forEach((el) => { const key = el.dataset.key; el.querySelectorAll('button').forEach((b) => b.classList.toggle('on', String(S[key]) === b.dataset.v)); });
    $('#nthBox').classList.toggle('show', S.mode === 'nth');
    $('#nth').value = S.nth;
    $('#secHurdle').hidden = !sp.hurdles;
    $('#secScene').hidden = !sp.usesScene;
    $('#secDist').querySelector('.sec-h').textContent = sp.oval ? '거리 (트랙 ' + (S.sport === 'cycle' ? '바퀴 수' : '길이') + ')' : '거리';
    document.title = '경주 뽑기 · ' + sp.label;
    setHud();
  }
  $$('.seg').forEach((sgEl) => sgEl.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    const key = sgEl.dataset.key;
    if (['mode', 'dist', 'hurdle', 'sport', 'scene'].includes(key) && race.state === 'countdown') return;
    if (key === 'mode' && race.state !== 'idle') resetRace();
    S[key] = b.dataset.v; store.set('runDraw.settings', S);
    if (key === 'music') { audioInit(); musicRestart(); }
    if (key === 'sport' || key === 'dist' || key === 'hurdle') { hideModal(); build(false); }
    syncSeg();
  }));
  $('#nth').addEventListener('input', () => { S.nth = Math.max(1, +$('#nth').value || 1); store.set('runDraw.settings', S); if (race.state !== 'idle') resetRace(); setHud(); });

  let buildT = 0;
  namesEl.addEventListener('input', () => {
    store.set('runDraw.names', namesEl.value);
    clearTimeout(buildT); buildT = setTimeout(() => { if (race.state === 'running' || race.state === 'countdown') return; build(false); }, 250);
  });
  $('#fillNum').onclick = () => { const n = clamp(+$('#numN').value || 0, 2, 60); namesEl.value = Array.from({ length: n }, (_, i) => (i + 1) + '번').join(', '); store.set('runDraw.names', namesEl.value); build(false); };
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
    const nm = $('#favName').value.trim() || '명단 ' + (favs().length + 1);
    const a = favs().filter((f) => f.name !== nm); a.push({ name: nm, text: namesEl.value });
    store.set('runDraw.favs', a); $('#favName').value = ''; renderFavs();
  };

  // ---------- 소리 ----------
  const AU = { c: null, master: null, mus: null, step: 0, nextT: 0 };
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
  let fxa = null;
  function fx() { if (!fxa && AU.c) fxa = FxAudio.create(() => AU.c, () => AU.master); return fxa; }
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
  function sfxHurdle() { if (!AU.c) return; const t = AU.c.currentTime; noise(t, 0.18, 0.5, 600); tone(140, t, 0.15, 'triangle', 0.25); }
  function sfxBell() { if (!AU.c) return; const t = AU.c.currentTime; for (let i = 0; i < 12; i++) { tone(2100, t + i * 0.11, 0.3, 'sine', 0.2); tone(4300, t + i * 0.11, 0.2, 'sine', 0.06); } }
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
  const music = Music.create(() => AU.c, () => AU.mus);
  function musicTick() {
    if (!AU.c || S.music === 'off' || !music.genres.includes(S.music)) return;
    const c = AU.c;
    if (AU.nextT < c.currentTime) AU.nextT = c.currentTime + 0.05;
    const prog = leadProgress();
    const racing = race.state === 'running' || race.state === 'countdown';
    const tempo = racing ? 1 + 0.25 * clamp((prog - 0.6) / 0.4, 0, 1) : 1;
    const vol = racing ? 1 : 0.6;
    while (AU.nextT < c.currentTime + 0.15) {
      AU.nextT += music.play(S.music, AU.step, AU.nextT, vol, tempo);
      AU.step++;
    }
  }

  // ---------- 시작 ----------
  SPORTS = Sports.create({
    ctx, proj: (X, Y, Z) => proj(X, Y, Z), quad, polyPath, clamp, mulberry,
    cam: () => cam, CW: () => CW, CH: () => CH, HZ: () => HZ,
    time: () => animT, E: () => excite, raceState: () => race.state,
    scene: () => PHOTO[S.scene] || PHOTO.stadium
  });
  if (!SPORTS[S.sport]) S.sport = 'track';
  sp = SPORTS[S.sport];
  renderSportButtons();
  resize();
  renderFavs();
  build(false);
  syncSeg();
  requestAnimationFrame(frame);
  // 개발용: 숨겨진 창에서도 경주를 빨리 돌려 보기
  window.__race = {
    race, runners: () => runners, cam, track, S,
    advance(sec) { const n = Math.round(sec * 60); for (let i = 0; i < n; i++) { step(1 / 60); animT += 1 / 60; } render(0); return race.t; },
    sport: () => sp
  };
})();
