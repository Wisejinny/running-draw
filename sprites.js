/*
 * sprites.js — 종목별 참가자 그림 (Canvas 2D, 측면 뷰, 앞쪽 = +x)
 *   Sprites.makeLook(sport, rng)           -> 모습(look) 객체. Runner.makeLook 의 성별·피부·머리·옷 + 종목별 장비
 *   Sprites.draw(sport, ctx, o, e)         -> 원점 = 땅(또는 수면) 위의 몸 중심. 단위 1 = 2cm
 *        e = { ph: 동작 위상(라디안), k: 강도 0~1, t: 시간(초), s: 달린 거리(m), v: 속도 }
 *   Sprites.meta[sport]                    -> { unit, labelZ(m), shadow:[w,h]|null }
 * 달리기(track)는 runner.js 의 Runner.draw 를 그대로 쓴다.
 */
(function (global) {
  'use strict';
  const TAU = Math.PI * 2;
  const sh = (c, a) => Runner.shade(c, a);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const ease = (x) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };

  function seg(ctx, a, b, w, col) { ctx.strokeStyle = col; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }
  function circ(ctx, x, y, r, col) { ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); }
  function ell(ctx, x, y, rx, ry, rot, col) { ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(x, y, rx, ry, rot || 0, 0, TAU); ctx.fill(); }
  function rrect(ctx, x, y, w, h, r, col) {
    ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); ctx.fill();
  }
  // 두 마디 관절(무릎·팔꿈치) 계산. fwd 쪽으로 꺾임
  function ik(hip, tgt, L1, L2, fwd) {
    let dx = tgt.x - hip.x, dy = tgt.y - hip.y, d = Math.hypot(dx, dy);
    const maxd = L1 + L2 - 0.01;
    if (d > maxd) { tgt = { x: hip.x + dx * maxd / d, y: hip.y + dy * maxd / d }; dx = tgt.x - hip.x; dy = tgt.y - hip.y; d = maxd; }
    if (d < 0.5) d = 0.5;
    const a = (L1 * L1 - L2 * L2 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, L1 * L1 - a * a));
    const ux = dx / d, uy = dy / d, mx = hip.x + ux * a, my = hip.y + uy * a;
    const k1 = { x: mx - uy * h, y: my + ux * h }, k2 = { x: mx + uy * h, y: my - ux * h };
    return { knee: (k1.x * fwd.x + k1.y * fwd.y) >= (k2.x * fwd.x + k2.y * fwd.y) ? k1 : k2, end: tgt };
  }

  const COATS = ['#8a4b2a', '#b5601f', '#2a2523', '#a7a9ad', '#d9ac5f', '#5a3420', '#e8e6e0', '#6e3b22'];
  const BRIGHT = ['#ff4757', '#1e90ff', '#ffd32a', '#2ed573', '#ff9f43', '#a55eea', '#00cec9', '#fd79a8', '#ffffff', '#ff6b35'];
  const FRAMES = ['#e74c3c', '#2980b9', '#f1c40f', '#1e272e', '#16a085', '#8e44ad', '#ecf0f1', '#ff7f50'];

  function makeLook(sport, rng) {
    const L = Runner.makeLook(rng);
    const pick = (a) => a[Math.floor(rng() * a.length)];
    if (sport !== 'track') L.h = 0.97 + rng() * 0.06;
    if (sport === 'horse') {
      L.coat = pick(COATS); L.mane = L.coat === '#d9ac5f' ? '#f1dca0' : sh(L.coat, -0.45);
      if (L.coat === '#e8e6e0') L.mane = '#cfcfd2';
      L.sock = rng() < 0.55; L.blaze = rng() < 0.45; L.cloth = pick(BRIGHT);
    } else if (sport === 'cycle') {
      L.frame = pick(FRAMES); L.disc = rng() < 0.5; L.rim = pick(['#2b2b2f', '#c9ced6', '#ffd32a']); L.aero = rng() < 0.7;
    } else if (sport === 'rowing') {
      L.hull = pick(BRIGHT); L.oar = pick(BRIGHT);
      if (L.oar === L.hull) L.oar = '#ffffff';
    } else if (sport === 'ski') {
      L.ski = pick(BRIGHT); L.goggle = pick(['#ffb400', '#2f3542', '#00bbf9', '#ff4757', '#c9ced6']); L.pole = pick(['#2f3542', '#c9ced6', '#ff6b35']);
    } else if (sport === 'swim') {
      L.cap = pick(BRIGHT); L.goggle = pick(['#2f3542', '#00bbf9', '#ff4757', '#ffffff']); L.suit = pick(['#1e272e', '#2d3436', '#273c75', '#c0392b', '#2f9e8f', '#6d214f', '#ffffff']);
    }
    return L;
  }

  // ---------------------------------------------------------------- 경주마 + 기수
  function horse(ctx, o, e) {
    const L = o.look, k = e.k, t = e.t, cyc = e.ph;
    const coat = L.coat, dk = sh(coat, -0.3), lt = sh(coat, 0.2);
    const bob = -Math.abs(Math.sin(cyc)) * 5 * k;
    function leg(hx, off, front, col, far) {
      const p = cyc + off * TAU, s = Math.sin(p), c = Math.cos(p);
      const hip = { x: hx, y: -62 };
      const th = k * ((front ? 0.95 : 0.8) * s + (front ? 0.2 : -0.08)) + (1 - k) * 0.02;
      const bend = (1 - k) * 0.05 + k * (0.15 + (front ? 1.45 : 1.15) * Math.pow(Math.max(0, c), 1.4));
      const knee = { x: hip.x + Math.sin(th) * 30, y: hip.y + Math.cos(th) * 30 };
      const a2 = th - bend;
      const ank = { x: knee.x + Math.sin(a2) * 29, y: knee.y + Math.cos(a2) * 29 };
      ctx.lineCap = 'round';
      seg(ctx, hip, knee, front ? 11 : 13, col);
      seg(ctx, knee, ank, 6.5, col);
      if (L.sock) seg(ctx, { x: ank.x - Math.sin(a2) * 12, y: ank.y - Math.cos(a2) * 12 }, ank, 6.8, far ? '#cfcfcf' : '#f4f4f4');
      ell(ctx, ank.x + 2.5, ank.y + 1, 4.8, 3.2, a2 * -1 + 0.2, '#2a2a2e');
    }
    ctx.save();
    ctx.translate(0, bob * 0.6); ctx.rotate(Math.sin(cyc + 0.6) * 0.045 * k);
    // 꼬리
    const sway = Math.sin(t * 9 + cyc) * 0.18 * k;
    ctx.strokeStyle = L.mane; ctx.lineCap = 'round'; ctx.lineWidth = 8;
    ctx.beginPath(); ctx.moveTo(-42, -80); ctx.quadraticCurveTo(-72 - 12 * k, -80 + 12 * sway, -88 - 20 * k, -62 + 26 * sway + (1 - k) * 12); ctx.stroke();
    ctx.strokeStyle = sh(L.mane, 0.15); ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(-44, -80); ctx.quadraticCurveTo(-74 - 12 * k, -76, -94 - 20 * k, -56 + 22 * sway + (1 - k) * 12); ctx.stroke();
    leg(-30, 0.1, false, dk, true); leg(26, 0.62, true, dk, true);
    // 몸통
    ell(ctx, 0, -72, 42, 19, 0, coat); ell(ctx, 23, -73, 22, 20, 0, coat); ell(ctx, -26, -74, 23, 19.5, 0, coat);
    ell(ctx, -2, -58, 38, 6, 0, lt); ell(ctx, -6, -86, 34, 7, 0, lt);
    // 목·머리
    ctx.fillStyle = coat; ctx.beginPath(); ctx.moveTo(30, -92); ctx.quadraticCurveTo(48, -98, 61, -118); ctx.lineTo(76, -112); ctx.quadraticCurveTo(60, -84, 42, -58); ctx.closePath(); ctx.fill();
    ctx.save(); ctx.translate(71, -108); ctx.rotate(0.95);
    ell(ctx, 0, 0, 18, 8.5, 0, coat); ell(ctx, 13, 0, 7.5, 6.8, 0, dk);
    if (L.blaze) ell(ctx, 2, 0, 12, 2.2, 0, '#f4f4f4');
    ctx.restore();
    circ(ctx, 73, -112, 1.8, '#1b1714'); circ(ctx, 78, -97, 1.1, '#3a1d12');
    ctx.fillStyle = coat; ctx.beginPath(); ctx.moveTo(60, -121); ctx.lineTo(63, -131); ctx.lineTo(67, -120); ctx.closePath(); ctx.fill();
    // 갈기
    ctx.fillStyle = L.mane; ctx.beginPath(); ctx.moveTo(26, -94);
    ctx.quadraticCurveTo(42 - 4 * k, -104 + 4 * Math.sin(t * 10), 59, -126 + 2 * sway); ctx.lineTo(64, -121);
    ctx.quadraticCurveTo(44, -97, 30, -85); ctx.closePath(); ctx.fill();
    // 안장 천 + 번호
    rrect(ctx, -14, -93, 24, 17, 3, L.cloth);
    ctx.fillStyle = (L.cloth === '#ffffff' || L.cloth === '#ffd32a') ? '#1e272e' : '#ffffff';
    ctx.font = '800 12px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(String(o.idx + 1), -2, -84);
    leg(-30, 0.0, false, coat, false); leg(26, 0.52, true, coat, false);
    // 기수 (웅크린 자세)
    const jb = Math.sin(cyc * 2 + 1) * 1.6 * k;
    const hip = { x: -4, y: -98 + jb }, lean = 1.12 + 0.08 * k, tl = 30;
    const sho = { x: hip.x + Math.sin(lean) * tl, y: hip.y - Math.cos(lean) * tl };
    const head = { x: sho.x + 9, y: sho.y - 7 };
    const knee = { x: 11, y: -88 }, boot = { x: 3, y: -73 };
    seg(ctx, hip, knee, 11, '#f4f4f4'); seg(ctx, knee, boot, 8, '#1d1d1f');
    seg(ctx, hip, sho, 17, L.shirt);
    ctx.lineWidth = 3.5; ctx.strokeStyle = L.accent; ctx.beginPath(); ctx.moveTo(hip.x + 6, hip.y - 3); ctx.lineTo(sho.x - 2, sho.y + 6); ctx.stroke();
    const hand = { x: 47, y: -101 + jb * 0.5 };
    const el = ik(sho, hand, 15, 16, { x: 0, y: 1 }).knee;
    seg(ctx, sho, el, 6.2, L.shirt); seg(ctx, el, hand, 5.4, L.skin); circ(ctx, hand.x, hand.y, 3.2, L.skin);
    ctx.strokeStyle = '#3a2a1e'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(hand.x, hand.y); ctx.lineTo(80, -99); ctx.stroke();
    if (L.gender === 'girl') {
      ctx.strokeStyle = L.hairColor; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(head.x - 8, head.y - 2);
      ctx.quadraticCurveTo(head.x - 20, head.y + 2 + 4 * Math.sin(t * 11), head.x - 30 - 6 * k, head.y + 8 + 3 * Math.sin(t * 9)); ctx.stroke();
    }
    circ(ctx, head.x, head.y, 8.4, L.skin);
    ctx.fillStyle = L.hatColor; ctx.beginPath(); ctx.arc(head.x - 0.5, head.y - 1.5, 9.8, Math.PI * 1.03, Math.PI * 2.02); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(head.x + 4, head.y - 3); ctx.lineTo(head.x + 15, head.y - 1); ctx.lineTo(head.x + 4, head.y - 0.5); ctx.fill();
    seg(ctx, { x: head.x - 3, y: head.y + 0.5 }, { x: head.x + 8, y: head.y + 0.5 }, 3.2, L.goggle || '#2f3542');
    ctx.restore();
  }

  // ---------------------------------------------------------------- 사이클
  function cyclist(ctx, o, e) {
    const L = o.look, k = e.k, t = e.t;
    const pp = e.ph, wp = e.s / 0.35;
    const RW = { x: -25, y: -17 }, FW = { x: 25, y: -17 }, BB = { x: 0, y: -20 };
    const seatTop = { x: -13, y: -52 }, head = { x: 20, y: -45 };
    // 뒷바퀴·앞바퀴
    function wheel(c, disc) {
      ctx.strokeStyle = '#26262b'; ctx.lineWidth = 3.4; ctx.beginPath(); ctx.arc(c.x, c.y, 16.3, 0, TAU); ctx.stroke();
      ctx.strokeStyle = L.rim; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(c.x, c.y, 14.4, 0, TAU); ctx.stroke();
      if (disc) { circ(ctx, c.x, c.y, 14, sh(L.frame, -0.1)); ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.arc(c.x, c.y, 9, wp, wp + 1.4); ctx.stroke(); }
      else { ctx.strokeStyle = 'rgba(80,80,90,0.7)'; ctx.lineWidth = 0.9; ctx.beginPath(); for (let i = 0; i < 10; i++) { const a = wp + i * TAU / 10; ctx.moveTo(c.x, c.y); ctx.lineTo(c.x + Math.cos(a) * 14.4, c.y + Math.sin(a) * 14.4); } ctx.stroke(); }
      circ(ctx, c.x, c.y, 2, '#444');
    }
    const crank = 9;
    const pedA = { x: BB.x + Math.cos(pp) * crank, y: BB.y + Math.sin(pp) * crank };
    const pedB = { x: BB.x - Math.cos(pp) * crank, y: BB.y - Math.sin(pp) * crank };
    const hip = { x: -12, y: -57 + Math.sin(pp * 2) * 0.6 * k };
    const lean = 1.08, tl = 29;
    const sho = { x: hip.x + Math.sin(lean) * tl, y: hip.y - Math.cos(lean) * tl };
    const hd = { x: sho.x + 8, y: sho.y - (L.aero ? 4 : 6) };
    const hand = { x: 26, y: -45 };
    function drawLeg(ped, far) {
      const col = far ? sh(L.bottomColor, -0.25) : L.bottomColor;
      const r = ik(hip, { x: ped.x - 2, y: ped.y - 2 }, 25, 26, { x: 1, y: 0.2 });
      seg(ctx, hip, r.knee, 12, col); seg(ctx, r.knee, r.end, 8, far ? sh(L.skin, -0.18) : L.skin);
      ell(ctx, ped.x + 2, ped.y - 1, 7, 3.4, 0.05, far ? sh(L.shoe, -0.2) : L.shoe);
    }
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    drawLeg(pedB, true);
    const fa = ik(sho, hand, 16, 17, { x: 0, y: 1 });
    seg(ctx, sho, fa.knee, 6, sh(L.shirt, -0.2)); seg(ctx, fa.knee, hand, 5.2, sh(L.skin, -0.15));
    wheel(RW, L.disc); wheel(FW, false);
    // 프레임
    const fr = L.frame;
    ctx.lineWidth = 3.6; ctx.strokeStyle = fr;
    ctx.beginPath(); ctx.moveTo(BB.x, BB.y); ctx.lineTo(seatTop.x, seatTop.y); ctx.lineTo(head.x - 2, head.y); ctx.lineTo(BB.x, BB.y); ctx.moveTo(head.x - 2, head.y); ctx.lineTo(head.x + 1, head.y - 4);
    ctx.moveTo(BB.x, BB.y); ctx.lineTo(RW.x, RW.y); ctx.moveTo(seatTop.x, seatTop.y); ctx.lineTo(RW.x, RW.y); ctx.stroke();
    ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(head.x + 1, head.y - 3); ctx.lineTo(FW.x, FW.y); ctx.stroke();
    seg(ctx, { x: head.x + 1, y: head.y - 4 }, { x: 25, y: -47 }, 3, '#2a2a2e'); seg(ctx, { x: 25, y: -47 }, { x: 29, y: -42 }, 3, '#2a2a2e');
    seg(ctx, { x: seatTop.x, y: seatTop.y }, { x: seatTop.x, y: seatTop.y - 3 }, 3, '#2a2a2e'); seg(ctx, { x: seatTop.x - 6, y: seatTop.y - 3.5 }, { x: seatTop.x + 6, y: seatTop.y - 3 }, 3.6, '#1f1f23');
    ctx.strokeStyle = '#8b8f98'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(BB.x, BB.y); ctx.lineTo(pedA.x, pedA.y); ctx.lineTo(pedB.x, pedB.y); ctx.stroke();
    circ(ctx, BB.x, BB.y, 5, '#b8bcc4');
    // 몸
    seg(ctx, hip, sho, 17, L.shirt);
    ctx.strokeStyle = L.accent; ctx.lineWidth = 3.4; ctx.beginPath(); ctx.moveTo(hip.x + 4, hip.y - 4); ctx.lineTo(sho.x - 3, sho.y + 7); ctx.stroke();
    circ(ctx, hip.x, hip.y + 1, 8.6, L.bottomColor);
    drawLeg(pedA, false);
    const na = ik(sho, { x: hand.x + 2, y: hand.y }, 16, 17, { x: 0, y: 1 });
    seg(ctx, sho, na.knee, 6.4, L.shirt); seg(ctx, na.knee, hand, 5.4, L.skin); circ(ctx, hand.x + 1, hand.y, 3.2, L.skin);
    // 머리·헬멧
    if (L.gender === 'girl') { ctx.strokeStyle = L.hairColor; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(hd.x - 9, hd.y); ctx.quadraticCurveTo(hd.x - 20, hd.y + 4 + 3 * Math.sin(t * 9), hd.x - 28 - 5 * k, hd.y + 11 + 2 * Math.sin(t * 8)); ctx.stroke(); }
    circ(ctx, hd.x, hd.y, 8, L.skin);
    if (L.aero) {
      ctx.fillStyle = L.hatColor; ctx.beginPath(); ctx.moveTo(hd.x + 8, hd.y - 1); ctx.quadraticCurveTo(hd.x + 6, hd.y - 12, hd.x - 6, hd.y - 11); ctx.quadraticCurveTo(hd.x - 18, hd.y - 9, hd.x - 26, hd.y + 1); ctx.quadraticCurveTo(hd.x - 12, hd.y + 3, hd.x + 1, hd.y + 1); ctx.closePath(); ctx.fill();
    } else {
      ctx.fillStyle = L.hatColor; ctx.beginPath(); ctx.arc(hd.x - 0.5, hd.y - 1, 9.4, Math.PI * 1.02, Math.PI * 2.0); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(hd.x + 3, hd.y - 3); ctx.lineTo(hd.x + 12, hd.y - 1); ctx.lineTo(hd.x + 3, hd.y); ctx.fill();
    }
    ctx.fillStyle = 'rgba(20,25,40,0.85)'; ctx.beginPath(); ctx.ellipse(hd.x + 5.5, hd.y + 0.2, 4.3, 2.4, 0.2, 0, TAU); ctx.fill();
    ctx.fillStyle = L.accent; ctx.font = '800 7px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(String(o.idx + 1), hip.x + 2, hip.y - 14);
  }

  // ---------------------------------------------------------------- 조정 (싱글 스컬)
  function rower(ctx, o, e) {
    const L = o.look, k = e.k, t = e.t, u = ((e.ph / TAU) % 1 + 1) % 1, DR = 0.42;
    let s = u < DR ? ease(u / DR) : 1 - ease((u - DR) / (1 - DR));
    const leanS = u < DR ? ease((u - 0.08) / (DR - 0.08)) : 1 - ease((u - DR) / 0.4);
    const idle = clamp(k * 3, 0, 1);
    s = lerp(0.3, s, idle);
    const lean = lerp(-0.2, -0.55 + 0.95 * leanS, idle);
    // 물거품·그림자
    ell(ctx, 0, 2.5, 218, 3.6, 0, 'rgba(255,255,255,0.45)');
    ell(ctx, 212, 2, 12, 3, 0, 'rgba(255,255,255,0.7)');
    const lock = { x: -18, y: -25 }, inb = 40, outb = 135;
    const sx = -24 + 22 * s;
    const hip = { x: sx, y: -18 };
    const sho = { x: hip.x + Math.sin(lean) * 28, y: hip.y - Math.cos(lean) * 28 };
    const hd = { x: sho.x + Math.sin(lean) * 7 - 2, y: sho.y - Math.cos(lean) * 7 - 7 };
    const hand = { x: lerp(-64, 6, s), y: lerp(-27, -33, s) + (u > DR && idle > 0.5 ? 8 * Math.sin(Math.PI * (u - DR) / (1 - DR)) : 0) };
    const phi = Math.atan2(hand.x - lock.x, inb);
    const air = idle > 0.5 && u > DR ? ease((u - DR) / 0.08) * (1 - ease((u - 0.92) / 0.08)) * 17 : 0;
    function oar(sign, far) {
      const tx = lock.x - Math.sin(phi) * outb;
      const ty = -air + sign * Math.cos(phi) * outb * 0.3 + (far ? -2 : 2);
      const col = far ? sh('#e6d8b8', -0.2) : '#e6d8b8';
      ctx.lineCap = 'round';
      seg(ctx, { x: hand.x - 3, y: hand.y + (far ? -1 : 0) }, lock, 3, col); seg(ctx, lock, { x: tx, y: ty }, 3, col);
      const ang = Math.atan2(ty - lock.y, tx - lock.x);
      ctx.save(); ctx.translate(tx, ty); ctx.rotate(ang); rrect(ctx, -2, -5, 34, 10, 4, far ? sh(L.oar, -0.25) : L.oar); ctx.restore();
      // 노가 물에 들어가는 순간·빠지는 순간 물방울
      const dc = Math.min(Math.abs(u - 0.02), Math.abs(u - (DR + 0.01)), 1);
      if (!far && k > 0.2 && dc < 0.07) {
        const a = 1 - dc / 0.07;
        ctx.fillStyle = 'rgba(255,255,255,' + (0.8 * a).toFixed(2) + ')';
        for (let i = 0; i < 7; i++) { const q = i * 0.9 + t * 7; circ(ctx, tx + 6 + Math.cos(q) * (6 + i * 3.2), ty - 4 - Math.abs(Math.sin(q)) * (6 + 5 * a) - i, 1.4 + (i % 3) * 0.4, ctx.fillStyle); }
      }
      // 노 젓는 자리 소용돌이
      if (!far && k > 0.2 && u < DR + 0.1) ell(ctx, tx - 10 + (u * 40), 3, 12, 2.6, 0, 'rgba(255,255,255,0.55)');
    }
    oar(-1, true);
    // 선체
    ctx.fillStyle = L.hull; ctx.beginPath(); ctx.moveTo(-208, -9); ctx.quadraticCurveTo(0, -15, 214, -8); ctx.quadraticCurveTo(0, 6, -208, -9); ctx.closePath(); ctx.fill();
    ctx.fillStyle = sh(L.hull, -0.28); ctx.beginPath(); ctx.moveTo(-200, -4); ctx.quadraticCurveTo(0, 3, 206, -4); ctx.quadraticCurveTo(0, 6, -200, -4); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(-170, -11); ctx.quadraticCurveTo(0, -14.5, 180, -9.5); ctx.stroke();
    ctx.fillStyle = L.oar; ctx.beginPath(); ctx.moveTo(206, -8.2); ctx.lineTo(214, -8); ctx.lineTo(209, -5.5); ctx.fill();
    // 리거 + 스트레처
    seg(ctx, { x: lock.x, y: lock.y }, { x: lock.x + 3, y: -10 }, 2.4, '#9aa0a8'); seg(ctx, { x: lock.x + 18, y: lock.y }, { x: lock.x + 14, y: -10 }, 2.4, '#9aa0a8');
    rrect(ctx, sx - 7, -13, 14, 3.6, 1.8, '#2a2a2e'); rrect(ctx, -56, -17, 4, 11, 1, '#4a4f5a');
    // 다리
    const foot = { x: -50, y: -14 };
    const lg = ik(hip, foot, 23, 24, { x: 0, y: -1 });
    seg(ctx, hip, lg.knee, 12, L.bottomColor); seg(ctx, lg.knee, lg.end, 8.6, L.skin);
    ell(ctx, foot.x + 2, foot.y, 6, 3.2, 0, L.shoe);
    // 몸통·팔
    seg(ctx, hip, sho, 17, L.shirt);
    ctx.strokeStyle = L.accent; ctx.lineWidth = 3.4; ctx.beginPath(); ctx.moveTo(hip.x - 4, hip.y - 6); ctx.lineTo(sho.x - 2, sho.y + 6); ctx.stroke();
    circ(ctx, hip.x, hip.y + 1, 8.8, L.bottomColor);
    const ar = ik(sho, hand, 17, 18, { x: 0, y: 1 });
    seg(ctx, sho, ar.knee, 6.6, L.shirt); seg(ctx, ar.knee, ar.end, 5.4, L.skin); circ(ctx, ar.end.x, ar.end.y, 3.4, L.skin);
    // 머리 (진행 반대쪽 = 왼쪽을 바라봄)
    if (L.gender === 'girl') { ctx.strokeStyle = L.hairColor; ctx.lineWidth = 5.5; ctx.beginPath(); ctx.moveTo(hd.x + 6, hd.y - 4); ctx.quadraticCurveTo(hd.x + 16, hd.y + 2 + 2 * Math.sin(t * 3), hd.x + 20, hd.y + 12); ctx.stroke(); }
    circ(ctx, hd.x, hd.y, 8.4, L.skin);
    ctx.fillStyle = L.hairColor; ctx.beginPath(); ctx.arc(hd.x + 1, hd.y - 1, 8.9, Math.PI * 1.1, Math.PI * 2.15); ctx.closePath(); ctx.fill();
    if (L.hair === 'cap' || L.headband || L.gender === 'boy') { ctx.fillStyle = L.hatColor; ctx.beginPath(); ctx.arc(hd.x + 1, hd.y - 2, 9.2, Math.PI * 1.05, Math.PI * 2.0); ctx.closePath(); ctx.fill(); ctx.beginPath(); ctx.moveTo(hd.x - 4, hd.y - 4); ctx.lineTo(hd.x - 14, hd.y - 2); ctx.lineTo(hd.x - 4, hd.y - 1); ctx.fill(); }
    circ(ctx, hd.x - 4, hd.y - 0.5, 1.4, '#2b1d14');
    oar(1, false);
  }

  // ---------------------------------------------------------------- 스키 (알파인 활강)
  function skier(ctx, o, e) {
    const L = o.look, k = e.k, t = e.t, ph = e.ph;
    const bob = Math.sin(ph * 2) * 3 * k, sway = e.lean || 0;
    const crouch = 5 + bob + sway * 3;
    // 스키 판 (먼 쪽·가까운 쪽)
    function ski(off, col) {
      ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(-46, -3 + off); ctx.lineTo(48, -3 + off); ctx.quadraticCurveTo(58, -4 + off, 63, -9 + off);
      ctx.lineTo(60, -6.5 + off); ctx.quadraticCurveTo(54, -1 + off, 46, -0.5 + off); ctx.lineTo(-46, -0.5 + off); ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.65)'; ctx.fillRect(-14, -2.4 + off, 34, 1.2);
    }
    ski(-2.5, sh(L.ski, -0.3));
    const hip = { x: -9, y: -48 + crouch };
    const lean = 0.98, tl = 27;
    const sho = { x: hip.x + Math.sin(lean) * tl, y: hip.y - Math.cos(lean) * tl };
    const hd = { x: sho.x + 9, y: sho.y - 7 };
    function leg(dx, far) {
      const col = far ? sh(L.bottomColor, -0.25) : L.bottomColor;
      const bt = { x: -1 + dx, y: -13 }, kn = { x: 13 + dx, y: -34 + crouch * 0.5 };
      seg(ctx, hip, kn, 13, col); seg(ctx, kn, bt, 10, col);
      rrect(ctx, bt.x - 6, -14, 15, 11, 3, far ? '#1d1f24' : '#26282e');
    }
    leg(-3, true);
    // 먼 쪽 팔 + 폴
    const handB = { x: 26, y: -50 + crouch * 0.5 };
    const tipB = { x: -50, y: -4 };
    seg(ctx, handB, tipB, 1.8, sh(L.pole, -0.3));
    const eb = ik(sho, handB, 15, 16, { x: 0, y: 1 }).knee;
    seg(ctx, sho, eb, 6, sh(L.shirt, -0.25)); seg(ctx, eb, handB, 5.2, '#2a2a2e');
    ski(1.5, L.ski);
    seg(ctx, hip, sho, 17, L.shirt);
    ctx.strokeStyle = L.accent; ctx.lineWidth = 3.6; ctx.beginPath(); ctx.moveTo(hip.x + 3, hip.y - 4); ctx.lineTo(sho.x - 3, sho.y + 7); ctx.stroke();
    circ(ctx, hip.x, hip.y + 1, 9, L.bottomColor);
    leg(3, false);
    const hand = { x: 29, y: -47 + crouch * 0.5 };
    seg(ctx, hand, { x: -42, y: -2 }, 1.9, L.pole); circ(ctx, -42, -2, 2.6, '#444');
    const en = ik(sho, hand, 15, 16, { x: 0, y: 1 }).knee;
    seg(ctx, sho, en, 6.4, L.shirt); seg(ctx, en, hand, 5.6, '#26282e'); circ(ctx, hand.x + 1, hand.y, 3.4, '#26282e');
    // 머리 (헬멧 + 고글)
    if (L.gender === 'girl') { ctx.strokeStyle = L.hairColor; ctx.lineWidth = 5.4; ctx.beginPath(); ctx.moveTo(hd.x - 8, hd.y + 1); ctx.quadraticCurveTo(hd.x - 19, hd.y + 5 + 3 * Math.sin(t * 10), hd.x - 28 - 5 * k, hd.y + 11 + 2 * Math.sin(t * 8)); ctx.stroke(); }
    circ(ctx, hd.x, hd.y, 8.2, L.skin);
    ctx.fillStyle = L.hatColor; ctx.beginPath(); ctx.arc(hd.x - 0.5, hd.y - 1, 10, Math.PI * 1.0, Math.PI * 2.05); ctx.closePath(); ctx.fill();
    rrect(ctx, hd.x - 1, hd.y - 4.5, 12, 7, 3, '#1f2128'); rrect(ctx, hd.x + 1, hd.y - 3.4, 9.5, 4.8, 2.4, L.goggle);
    ctx.strokeStyle = L.goggle; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(hd.x - 1, hd.y - 1); ctx.lineTo(hd.x - 8, hd.y - 0.5); ctx.stroke();
    ctx.fillStyle = L.accent; ctx.font = '800 7px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(String(o.idx + 1), hip.x + 5, hip.y - 12);
  }

  // ---------------------------------------------------------------- 수영 (자유형)
  function swimmer(ctx, o, e) {
    const L = o.look, k = e.k, t = e.t, ph = e.ph;
    const skin = L.skin;
    const breathe = clamp((Math.sin(ph / 2 + 1.2) - 0.55) * 4, 0, 1) * k; // 두 번에 한 번 숨 쉼
    const roll = Math.sin(ph) * 0.12 * k;
    // 수면 아래 몸 (반투명)
    ctx.save(); ctx.globalAlpha = 0.62;
    ell(ctx, -8, 5, 34, 7.5, roll * 0.2, sh(skin, -0.05));
    ell(ctx, -22, 7, 22, 6, 0, L.suit);
    // 다리 발차기
    ctx.lineCap = 'round';
    for (let i = 0; i < 2; i++) {
      const kk = Math.sin(ph * 4 + i * Math.PI) * 6 * k;
      seg(ctx, { x: -38, y: 6 }, { x: -64, y: 7 + kk }, 7, sh(skin, -0.1 - i * 0.08));
      ell(ctx, -68, 7 + kk, 5, 2.5, 0, sh(skin, -0.12));
    }
    ctx.restore();
    // 발차기 물보라
    if (k > 0.15) {
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      for (let i = 0; i < 6; i++) { const q = t * 14 + i * 1.3; circ(ctx, -66 - i * 4 + Math.sin(q) * 2, -1 - Math.abs(Math.sin(q * 1.3)) * 5 * k, 1.5 + (i % 3) * 0.7, ctx.fillStyle); }
      ell(ctx, -60, 1.5, 22, 3.2, 0, 'rgba(255,255,255,0.5)');
    }
    // 등·어깨 (물 위로 살짝)
    ctx.save(); ctx.translate(0, 0); ctx.rotate(roll * 0.5);
    ctx.fillStyle = sh(skin, -0.02); ctx.beginPath(); ctx.ellipse(8, 1.5, 22, 5.5, 0, Math.PI, TAU); ctx.fill();
    ctx.fillStyle = L.suit; ctx.beginPath(); ctx.ellipse(-14, 2, 20, 5, 0, Math.PI, TAU); ctx.fill();
    ctx.restore();
    // 팔 (바퀴 돌듯: 먼 팔과 가까운 팔이 반 바퀴 차이)
    function arm(off, far) {
      const sho = { x: 18, y: 1 };
      const th = (((ph + off) % TAU) + TAU) % TAU; // 0~π: 물속에서 당김, π~2π: 물 밖에서 회복
      let hx, hy, ex, ey;
      if (th < Math.PI) {
        const q = th / Math.PI;
        hx = sho.x + Math.cos(q * Math.PI) * 36; hy = sho.y + Math.sin(q * Math.PI) * 14 + 3;
        ex = (sho.x + hx) / 2; ey = hy + 7 * Math.sin(q * Math.PI);
      } else {
        const q = (th - Math.PI) / Math.PI;       // 팔꿈치를 높이 들고 손은 아래로 늘어뜨려 앞으로
        const sn = Math.sin(q * Math.PI);
        ex = sho.x + lerp(-20, 22, q); ey = sho.y - 19 * sn - 2;
        hx = sho.x + lerp(-34, 38, q); hy = sho.y + 2 - 11 * sn;
      }
      const inAir = th >= Math.PI, col = far ? sh(skin, -0.12) : skin;
      ctx.save(); ctx.globalAlpha = inAir ? 1 : 0.5;
      seg(ctx, sho, { x: ex, y: ey }, 7, col); seg(ctx, { x: ex, y: ey }, { x: hx, y: hy }, 6, col); circ(ctx, hx, hy, 3.4, col);
      ctx.restore();
      if (th > Math.PI * 0.02 && th < Math.PI * 0.18 && k > 0.2) { ctx.fillStyle = 'rgba(255,255,255,0.85)'; for (let i = 0; i < 4; i++) circ(ctx, hx + 4 + i * 3, hy - 2 - (i % 2) * 3, 1.5, ctx.fillStyle); }
    }
    arm(Math.PI, true);
    // 머리 (캡 + 고글)
    const hx = 36, hy = -1 - breathe * 2;
    ell(ctx, hx - 3, 2.5, 13, 3, 0, 'rgba(255,255,255,0.6)');
    ctx.save(); ctx.translate(hx, hy); ctx.rotate(-breathe * 0.7);
    circ(ctx, 0, 0, 8.6, skin);
    ctx.fillStyle = L.cap; ctx.beginPath(); ctx.arc(-1, -0.6, 9.3, Math.PI * 1.0, Math.PI * 2.0); ctx.lineTo(8, 2); ctx.lineTo(-9, 2); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(-6, -7, 10, 2);
    if (breathe < 0.3) { rrect(ctx, 1, -2.4, 8, 4.4, 2.2, L.goggle); ctx.strokeStyle = L.goggle; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(1, -0.5); ctx.lineTo(-8, -0.5); ctx.stroke(); }
    else { rrect(ctx, 2, -3.5, 7, 4, 2, L.goggle); ell(ctx, 7, 4.2, 2.6, 1.7 + breathe * 1.4, 0, '#7a2e2e'); }
    ctx.restore();
    // 헤드 앞 물결
    ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.arc(hx + 12, 3, 8 + 2 * Math.sin(t * 6), Math.PI * 1.1, Math.PI * 1.9); ctx.stroke();
    arm(0, false);
    if (L.gender === 'girl' && breathe > 0.3) { ctx.strokeStyle = L.hairColor; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(hx - 8, hy + 3); ctx.lineTo(hx - 12, hy + 6); ctx.stroke(); }
    ctx.fillStyle = L.accent; ctx.font = '800 6.5px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.globalAlpha = 0.9;
    ctx.fillText(String(o.idx + 1), -12, -1); ctx.globalAlpha = 1;
  }

  const META = {
    track: { unit: 0.021, labelZ: (o) => 2.1 * o.look.h + 0.25, shadow: [20, 4.5] },
    horse: { unit: 0.022, labelZ: () => 3.0, shadow: [60, 8] },
    cycle: { unit: 0.022, labelZ: () => 2.15, shadow: [42, 5] },
    rowing: { unit: 0.024, labelZ: () => 2.0, shadow: null },
    ski: { unit: 0.026, labelZ: () => 2.0, shadow: [44, 4] },
    swim: { unit: 0.024, labelZ: () => 0.85, shadow: null }
  };
  const FN = { horse, cycle: cyclist, rowing: rower, ski: skier, swim: swimmer };

  function draw(sport, ctx, o, e) {
    if (sport === 'track') return Runner.draw(ctx, o.look, e.ph, { k: e.k, t: e.t });
    ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    FN[sport](ctx, o, e);
    ctx.restore();
  }

  global.Sprites = { makeLook, draw, meta: META };
})(window);
