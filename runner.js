/*
 * runner.js — 달리는 학생 캐릭터 (Canvas 2D, 측면 뷰)
 *
 * API (시그니처 유지)
 *   Runner.makeLook(rng) -> look 객체
 *   Runner.draw(ctx, look, phase, o)
 *     원점은 주자 아래 지면, +x 방향, 키 약 100 단위
 *     phase: 라디안, 2π = 왼발 + 오른발 한 주기
 *     o.k: 0(편안한 준비 자세) ~ 1(전력질주), o.t: 경과 초
 *   Runner.shade(hex, amt) -> 색 밝게(+)/어둡게(-)
 */
(function (global) {
  'use strict';

  function shade(hex, amt) {
    let c = hex.replace('#', '');
    if (c.length === 3) c = c.split('').map((x) => x + x).join('');
    let r = parseInt(c.slice(0, 2), 16), g = parseInt(c.slice(2, 4), 16), b = parseInt(c.slice(4, 6), 16);
    const t = amt < 0 ? 0 : 255, p = Math.abs(amt);
    r = Math.round((t - r) * p + r); g = Math.round((t - g) * p + g); b = Math.round((t - b) * p + b);
    return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
  }

  const SKIN = ['#fde0c8', '#f6cfae', '#f1c27d', '#e0ac69', '#c68642', '#a86b3c', '#8d5524'];
  const HAIR = ['#302925', '#38271f', '#493124', '#66432e', '#805538', '#a57643', '#c99f67', '#353542'];
  const SHIRT = ['#ed9187', '#88b9db', '#b49bce', '#91c3a5', '#edbf79', '#83c5b9', '#e8a0bc', '#eed17e',
    '#80bec7', '#a49bd5', '#f0aaa0', '#78a7ce', '#fffaf0', '#63767b', '#edaf80', '#acd0e8', '#b6cb89'];
  const BOTTOM = ['#3e4c58', '#4b555a', '#485c88', '#354e77', '#629b94', '#ac6664', '#73808d', '#845c77', '#fffaf0', '#63879e'];
  const SHOE = ['#fffaf0', '#ec858d', '#7aace2', '#85bd9b', '#e9b66f', '#52616d', '#e99eaf', '#e6cd89', '#9ab8e4'];
  const ACCENT = ['#fffaf0', '#f5d986', '#e99b8c', '#b7dfbb', '#8e93c6', '#f0b3a4', '#43535e'];
  const TAU = Math.PI * 2, HR = 11.5, TOR = 27, TH = 23, SH = 22, UA = 14, FA = 13;
  const STANCE = 0.36, TOE = 9.5, ANKLE = 4.5, ROLL = 0.78;
  const clamp = (v) => Math.max(0, Math.min(1, v));
  const smooth = (v) => { v = clamp(v); return v * v * (3 - 2 * v); };
  const mix = (a, b, t) => a + (b - a) * t;
  const lerp = (a, b, t) => ({ x: mix(a.x, b.x, t), y: mix(a.y, b.y, t) });

  // 색 계산은 외형 생성 시 한 번만 한다. 이전 look 객체도 그대로 사용할 수 있다.
  function details(L) {
    return {
      hairLight: shade(L.hairColor, 0.13), ear: shade(L.skin, -0.09),
      shirtFold: shade(L.shirt, -0.09), hem: shade(L.bottomColor, -0.13),
      hatShade: shade(L.hatColor, -0.13), shoeAccent: L.shoeAccent || L.accent
    };
  }

  function makeLook(rng) {
    const pick = (a) => a[Math.floor(rng() * a.length)];
    const gender = rng() < 0.5 ? 'girl' : 'boy';
    const hair = gender === 'boy'
      ? pick(['short', 'short', 'buzz', 'spiky', 'curly', 'side', 'cap', 'side'])
      : pick(['ponytail', 'ponytail', 'bob', 'long', 'bun', 'pigtails', 'curly', 'short', 'ponytail']);
    const shirt = pick(SHIRT);
    let accent = pick(ACCENT);
    if (accent === shirt) accent = '#43535e';
    const top = pick(['tee', 'tee', 'tank', 'jersey', 'long', 'tee']);
    const bottom = gender === 'boy'
      ? pick(['shorts', 'shorts', 'long', 'shorts'])
      : pick(['shorts', 'leggings', 'shorts', 'long']);
    let bottomColor = pick(BOTTOM);
    if (bottomColor === shirt) bottomColor = '#4b555a';
    const socks = pick(['none', 'ankle', 'crew', 'crew']);
    const look = {
      gender, hair, top, bottom, socks,
      skin: pick(SKIN), hairColor: pick(HAIR), shirt, accent, bottomColor,
      sockColor: pick(['#fffaf0', '#fffaf0', accent, shirt]),
      shoe: pick(SHOE), sole: pick(['#fffaf0', '#edece6', '#52616d']),
      glasses: rng() < 0.15,
      headband: hair !== 'cap' && rng() < 0.18,
      wristband: rng() < 0.25,
      hatColor: pick(SHIRT),
      h: 0.92 + rng() * 0.16, // 키 배율은 호출하는 앱에서 적용
      bulk: 0.9 + rng() * 0.25
    };
    look.bib = rng() < 0.55 ? 1 + Math.floor(rng() * 99) : 0;
    look.shoeAccent = pick(ACCENT);
    look.clip = hair !== 'cap' && rng() < 0.16;
    look.d = {
      skin: shade(look.skin, -0.13), shirt: shade(look.shirt, -0.14), bottomColor: shade(look.bottomColor, -0.14),
      sockColor: shade(look.sockColor, -0.12), shoe: shade(look.shoe, -0.15), sole: shade(look.sole, -0.12), accent: shade(look.accent, -0.13)
    };
    look.detail = details(look);
    return look;
  }

  function seg(ctx, a, b, w, col) {
    ctx.strokeStyle = col; ctx.lineWidth = w;
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
  }
  function circle(ctx, x, y, r, col) {
    ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
  }

  // 끝점의 위치와 속도를 함께 지정하는 삼차 보간. 접지 경계에서도 속도가 이어진다.
  function cubic(a, b, va, vb, f, span) {
    const f2 = f * f, f3 = f2 * f;
    return (2 * f3 - 3 * f2 + 1) * a + (f3 - 2 * f2 + f) * span * va
      + (-2 * f3 + 3 * f2) * b + (f3 - f2) * span * vb;
  }
  // [위상, 발목 x/y, 신발 각도, x/y/각도의 속도]. 뒤꿈치 회수 → 무릎 전진 → 착지.
  const SWING = [
    [STANCE, -13 - TOE * Math.cos(ROLL) + ANKLE * Math.sin(ROLL),
      -TOE * Math.sin(ROLL) - ANKLE * Math.cos(ROLL), ROLL, -26 / STANCE, 0, 0],
    [0.52, -15, -37, 0.90, 100, 0, 0],
    [0.70, 6, -30, 0.10, 105, 88, -4],
    [0.84, 15, -15, -0.20, 0, 110, 0],
    [1, 3.5, -ANKLE, 0, -26 / STANCE, 0, 0]
  ];

  function legPose(u, k, readyX) {
    let x, y, a;
    if (u < STANCE) {
      // 몸의 전진량과 반대인 등속 후퇴. 지지 구간의 밑창은 지면에 고정된다.
      a = ROLL * smooth((u - 0.18) / (STANCE - 0.18));
      x = 13 - 26 * u / STANCE;
      y = 0;
    } else {
      let i = 0;
      while (i < SWING.length - 2 && u > SWING[i + 1][0]) i++;
      const A = SWING[i], B = SWING[i + 1], span = B[0] - A[0], f = (u - A[0]) / span;
      const ax = cubic(A[1], B[1], A[4], B[4], f, span);
      const ay = cubic(A[2], B[2], A[5], B[5], f, span);
      a = cubic(A[3], B[3], A[6], B[6], f, span);
      x = ax + TOE * Math.cos(a) - ANKLE * Math.sin(a);
      y = ay + TOE * Math.sin(a) + ANKLE * Math.cos(a);
    }
    // 발끝 지지점을 섞으면 출발 중에도 밑창이 땅 아래로 내려가지 않는다.
    x = mix(readyX + TOE, x, k); y *= k; a *= k;
    const c = Math.cos(a), s = Math.sin(a);
    return { x: x - TOE * c, y: y - TOE * s, a,
      ankle: { x: x - TOE * c + ANKLE * s, y: y - TOE * s - ANKLE * c } };
  }

  function legPoints(hip, foot) {
    // 발목 위치를 먼저 고정한 두 관절 역기구학. 무릎은 늘 앞쪽으로 굽힌다.
    const dx = foot.ankle.x - hip.x, dy = foot.ankle.y - hip.y;
    const d = Math.max(0.001, Math.sqrt(dx * dx + dy * dy));
    const along = (TH * TH - SH * SH + d * d) / (2 * d);
    const bend = Math.sqrt(Math.max(0, TH * TH - along * along));
    foot.knee = { x: hip.x + dx * along / d + dy * bend / d,
      y: hip.y + dy * along / d - dx * bend / d };
    return foot;
  }

  function drawShoe(ctx, L, P, far) {
    const C = far ? L.d : L;
    ctx.save(); ctx.translate(P.x, P.y); ctx.rotate(P.a);
    ctx.fillStyle = C.shoe;
    ctx.beginPath(); ctx.moveTo(-5, -1.6); ctx.lineTo(-4.7, -6);
    ctx.quadraticCurveTo(-1, -7.2, 2.4, -5.2);
    ctx.quadraticCurveTo(3.8, -3.5, 7, -3.5);
    ctx.quadraticCurveTo(11, -3.4, 10.5, -1.5);
    ctx.quadraticCurveTo(10.1, -1, 9.5, 0); ctx.lineTo(-3.5, 0);
    ctx.quadraticCurveTo(-5, 0, -5, -1.6); ctx.fill();
    // 두 가지 색 패널과 둥근 앞코
    ctx.fillStyle = far ? C.accent : L.detail.shoeAccent;
    ctx.beginPath(); ctx.moveTo(-4.6, -5.3); ctx.lineTo(-1.6, -5.7);
    ctx.lineTo(2.7, -1.3); ctx.lineTo(-0.4, -1.3); ctx.closePath(); ctx.fill();
    ctx.fillStyle = C.sole;
    ctx.beginPath(); ctx.moveTo(6.4, -3.4); ctx.quadraticCurveTo(11, -3.5, 10.5, -1.5);
    ctx.lineTo(6, -1.5); ctx.closePath(); ctx.fill();
    seg(ctx, { x: -3.8, y: -0.7 }, { x: 8.8, y: -0.7 }, 1.4, C.sole);
    seg(ctx, { x: 1.3, y: -4.3 }, { x: 3.7, y: -3.2 }, 1.1, C.sole);
    ctx.restore();
  }

  function drawLeg(ctx, L, hip, P, far) {
    const C = far ? L.d : L, bw = 8.1 * L.bulk;
    const full = L.bottom === 'long' || L.bottom === 'leggings';
    seg(ctx, hip, P.knee, full ? bw + (L.bottom === 'long' ? 1.5 : 0) : bw, full ? C.bottomColor : C.skin);
    seg(ctx, P.knee, P.ankle, full ? bw - 0.9 : bw - 1.6, full ? C.bottomColor : C.skin);
    if (!full) {
      // 밑단이 열린 사다리꼴 반바지. 허벅지 방향을 따라 천이 벌어진다.
      const end = lerp(hip, P.knee, 0.45), dx = (P.knee.x - hip.x) / TH, dy = (P.knee.y - hip.y) / TH;
      const w = bw * 0.69, e = bw * 0.64;
      ctx.fillStyle = C.bottomColor;
      ctx.beginPath(); ctx.moveTo(hip.x - dy * w, hip.y + dx * w);
      ctx.quadraticCurveTo(end.x - dy * (e + 1), end.y + dx * (e + 1), end.x - dy * e, end.y + dx * e);
      ctx.lineTo(end.x + dy * e, end.y - dx * e);
      ctx.quadraticCurveTo(hip.x + dy * (w + 1), hip.y - dx * (w + 1), hip.x + dy * w, hip.y - dx * w);
      ctx.closePath(); ctx.fill();
      seg(ctx, { x: end.x - dy * e, y: end.y + dx * e }, { x: end.x + dy * e, y: end.y - dx * e }, 1.3,
        far ? C.bottomColor : L.detail.hem);
    }
    if (L.socks !== 'none') {
      const from = L.socks === 'crew' && !full ? 0.64 : 0.91;
      seg(ctx, lerp(P.knee, P.ankle, from), P.ankle, bw - 0.8, C.sockColor);
      if (L.socks === 'crew' && !full) seg(ctx, lerp(P.knee, P.ankle, 0.65), lerp(P.knee, P.ankle, 0.69), bw - 0.6, C.accent);
    }
    drawShoe(ctx, L, P, far);
  }

  function drawArm(ctx, L, sh, swing, k, far) {
    const C = far ? L.d : L;
    const beta = -0.10 + k * (0.10 + 1.03 * swing);
    // 앞팔은 조금 더 접고, 뒷손은 골반 옆까지 내려온다.
    const bend = 0.18 + k * (1.30 + 0.35 * Math.max(0, swing));
    const el = { x: sh.x + Math.sin(beta) * UA, y: sh.y + Math.cos(beta) * UA };
    const g = beta + bend;
    const hand = { x: el.x + Math.sin(g) * FA, y: el.y + Math.cos(g) * FA };
    const aw = 6.1 * L.bulk;
    seg(ctx, sh, el, aw, C.skin); seg(ctx, el, hand, aw - 0.6, C.skin);
    if (L.top === 'long') {
      seg(ctx, sh, el, aw + 1.8, C.shirt);
      seg(ctx, el, lerp(el, hand, 0.80), aw + 0.6, C.shirt);
    } else if (L.top !== 'tank') {
      seg(ctx, sh, lerp(sh, el, 0.43), aw + 3.1, C.shirt);
    }
    if (L.wristband) seg(ctx, lerp(el, hand, 0.78), lerp(el, hand, 0.86), aw + 0.5, C.accent);
    ctx.fillStyle = C.skin;
    ctx.beginPath(); ctx.ellipse(hand.x, hand.y, 3.0 * L.bulk, 3.5 * L.bulk, -g, 0, TAU); ctx.fill();
    circle(ctx, hand.x + 1.5, hand.y - 0.7, 1.7 * L.bulk, C.skin);
  }

  function drawTorso(ctx, L, hip, lean, turn) {
    const w = 9.1 * L.bulk * (1 + 0.045 * turn);
    ctx.save(); ctx.translate(hip.x, hip.y); ctx.rotate(lean);
    // 둥근 골반과 허리 밴드
    ctx.fillStyle = L.bottomColor;
    ctx.beginPath(); ctx.moveTo(-w * 0.85, -7); ctx.lineTo(w * 0.85, -7);
    ctx.quadraticCurveTo(w + 1, -2, w * 0.84, 3.2);
    ctx.quadraticCurveTo(0, 5.8, -w * 0.87, 2.8);
    ctx.quadraticCurveTo(-w - 1, -2, -w * 0.85, -7); ctx.fill();
    // 어깨는 둥글고 허리로 갈수록 좁아지는 셔츠
    ctx.fillStyle = L.shirt;
    ctx.beginPath(); ctx.moveTo(-3.7, -TOR - 1);
    ctx.quadraticCurveTo(-w + 0.5, -TOR - 1, -w, -TOR + 4);
    ctx.quadraticCurveTo(-w + 0.3, -15, -w * 0.79, -6);
    ctx.quadraticCurveTo(0, -3.6, w * 0.86, -5.6);
    ctx.quadraticCurveTo(w * 0.83, -15, w, -TOR + 4);
    ctx.quadraticCurveTo(w, -TOR - 0.8, 3.8, -TOR - 1);
    ctx.quadraticCurveTo(0, -TOR + 3, -3.7, -TOR - 1); ctx.fill();
    ctx.fillStyle = L.detail.shirtFold;
    ctx.beginPath(); ctx.moveTo(-w + 1, -TOR + 5);
    ctx.quadraticCurveTo(-w * 0.4, -14, -w * 0.65, -5.7);
    ctx.lineTo(-w * 0.79, -6); ctx.closePath(); ctx.fill();
    seg(ctx, { x: -3.4, y: -TOR - 0.3 }, { x: 3.4, y: -TOR - 0.3 }, 1.5, L.accent);
    if (L.top === 'jersey') seg(ctx, { x: w * 0.62, y: -24 }, { x: w * 0.61, y: -7 }, 2.4, L.accent);
    if (L.bib) {
      ctx.fillStyle = '#fffaf0';
      ctx.beginPath(); ctx.moveTo(-1.5, -22); ctx.lineTo(6, -22);
      ctx.quadraticCurveTo(7, -22, 7, -21); ctx.lineTo(7, -13.5);
      ctx.quadraticCurveTo(7, -12.5, 6, -12.5); ctx.lineTo(-1.5, -12.5);
      ctx.quadraticCurveTo(-2.5, -12.5, -2.5, -13.5); ctx.lineTo(-2.5, -21);
      ctx.quadraticCurveTo(-2.5, -22, -1.5, -22); ctx.fill();
      ctx.fillStyle = '#52616d'; ctx.font = 'bold 7px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(String(L.bib), 2.25, -17);
    }
    ctx.restore();
  }

  function hairCap(ctx, r, extra, buzz) {
    ctx.beginPath(); ctx.moveTo(-r * 0.63, r * 0.65);
    ctx.bezierCurveTo(-r * 1.35, r * 0.2, -r * 1.3, -r - extra, -1, -r - extra);
    ctx.quadraticCurveTo(r * 0.85, -r - extra, r * 0.93, -r * 0.35);
    if (buzz) {
      ctx.quadraticCurveTo(r * 0.25, -r * 0.58, -r * 0.25, -r * 0.18);
    } else {
      ctx.quadraticCurveTo(r * 0.55, -r * 0.17, r * 0.28, -r * 0.47);
      ctx.quadraticCurveTo(r * 0.02, -r * 0.09, -r * 0.24, -r * 0.28);
    }
    ctx.quadraticCurveTo(-r * 0.39, r * 0.15, -r * 0.63, r * 0.65);
    ctx.closePath(); ctx.fill();
  }

  function drawHairBack(ctx, L, p, k, t) {
    // 몸의 바운스보다 늦은 위상. 꼬리 끝은 뿌리보다 한 번 더 늦게 따라온다.
    const lag = k * Math.sin(p * 2 - 0.95) + (1 - k) * Math.sin(t * 2.2 - 0.5) * 0.12;
    const tip = k * Math.sin(p * 2 - 1.55);
    ctx.fillStyle = L.hairColor;
    if (L.hair === 'long' || L.hair === 'bob') {
      const long = L.hair === 'long', ex = -13 - (long ? 6 : 1) * k + 2 * tip;
      const ey = long ? 24 - 7 * k + 2.8 * lag : 12 + 0.7 * lag;
      ctx.beginPath(); ctx.moveTo(0, -12);
      ctx.bezierCurveTo(-14, -15, -17, -3, ex, ey - 3);
      ctx.quadraticCurveTo(ex + 5, ey + 3, -3, ey - 1);
      ctx.quadraticCurveTo(0, 5, 2, -7); ctx.closePath(); ctx.fill();
    } else if (L.hair === 'ponytail' || L.hair === 'pigtails') {
      const count = L.hair === 'pigtails' ? 2 : 1;
      for (let i = 0; i < count; i++) {
        const tx = -9 + i * 3, ty = -6 + i * 9;
        const ex = tx - (6 + 12 * k) + tip * (2.4 - i * 0.6);
        const ey = ty + (count === 1 ? 17 : 12) - 12 * k + lag * 3 + i * tip;
        ctx.fillStyle = L.hairColor;
        ctx.beginPath(); ctx.moveTo(tx + 1, ty - 2.6);
        ctx.bezierCurveTo(tx - 9, ty - 7 - 2 * lag, ex - 4, ey - 7, ex, ey);
        ctx.quadraticCurveTo(ex + 7, ey + 3, tx - 1, ty + 3);
        ctx.closePath(); ctx.fill(); circle(ctx, tx, ty, 2.4, L.accent);
      }
    } else if (L.hair === 'bun') {
      circle(ctx, -8, -11.5, 5.8, L.hairColor);
      seg(ctx, { x: -11, y: -14 }, { x: -8, y: -15 }, 1.4, L.detail.hairLight);
      seg(ctx, { x: -9.5, y: -7 }, { x: -6, y: -9 }, 2, L.accent);
    }
  }

  function drawHead(ctx, L, hc, p, k, t) {
    ctx.save(); ctx.translate(hc.x, hc.y);
    ctx.rotate(0.025 + k * (0.035 + 0.015 * Math.sin(2 * p - 0.3)));
    const r = HR;
    drawHairBack(ctx, L, p, k, t);
    ctx.fillStyle = L.skin;
    ctx.beginPath(); ctx.ellipse(0, 0, r, r * 0.98, 0, 0, TAU); ctx.fill();
    // 볼과 턱은 둥글게, 코는 작은 돌출로 표현
    circle(ctx, r * 0.94, 0.8, 2.1, L.skin);
    ctx.fillStyle = L.hairColor;
    switch (L.hair) {
      case 'buzz':
        hairCap(ctx, r, -0.3, true); break;
      case 'spiky':
        ctx.beginPath(); ctx.moveTo(-8, 7);
        ctx.quadraticCurveTo(-15, -1, -11, -9);
        ctx.quadraticCurveTo(-10, -7, -9, -7);
        ctx.lineTo(-9, -15); ctx.quadraticCurveTo(-6, -13, -5, -10);
        ctx.lineTo(-2, -16); ctx.quadraticCurveTo(1, -13, 1, -11);
        ctx.lineTo(5, -14); ctx.quadraticCurveTo(7, -11, 7, -8);
        ctx.lineTo(11, -10); ctx.quadraticCurveTo(13, -4, 7, -3.5);
        ctx.lineTo(2, -5); ctx.quadraticCurveTo(-4, -3, -8, 7); ctx.fill(); break;
      case 'curly':
        hairCap(ctx, r, 0.6, false);
        for (let i = 0; i < 8; i++) {
          const a = Math.PI * (0.73 + i * 0.176);
          circle(ctx, Math.cos(a) * 10.6, Math.sin(a) * 10.6 - 1, 3.8 + (i % 2) * 0.4, L.hairColor);
        }
        break;
      case 'side':
        hairCap(ctx, r, 1.0, false);
        ctx.beginPath(); ctx.moveTo(-5, -11);
        ctx.bezierCurveTo(7, -16, 15, -9, 10.5, -3.8);
        ctx.quadraticCurveTo(5, -7.5, -1, -5.7); ctx.closePath(); ctx.fill(); break;
      case 'cap':
        hairCap(ctx, r, 0.2, true);
        ctx.fillStyle = L.hatColor;
        ctx.beginPath(); ctx.moveTo(-12, -2);
        ctx.bezierCurveTo(-13, -18, 10, -18, 12, -2); ctx.closePath(); ctx.fill();
        ctx.fillStyle = L.detail.hatShade;
        ctx.beginPath(); ctx.moveTo(4, -3.2); ctx.quadraticCurveTo(19, -4, 18, -0.5);
        ctx.quadraticCurveTo(14, 1, 7, -0.8); ctx.closePath(); ctx.fill();
        seg(ctx, { x: -0.5, y: -12 }, { x: 2.5, y: -5 }, 1.2, L.accent);
        circle(ctx, -1, -13.2, 1.4, L.hatColor); break;
      case 'bob':
        hairCap(ctx, r, 1.2, false);
        ctx.beginPath(); ctx.moveTo(-10, -3); ctx.lineTo(-6, -2);
        ctx.quadraticCurveTo(-6, 5, -5, 11); ctx.quadraticCurveTo(-13, 14, -12, 5); ctx.fill(); break;
      case 'short':
        hairCap(ctx, r, 0.9, false);
        ctx.beginPath(); ctx.moveTo(-7, -8); ctx.quadraticCurveTo(-6, -16, 1, -12.2);
        ctx.quadraticCurveTo(8, -14, 9, -7); ctx.quadraticCurveTo(3, -10, -7, -8); ctx.fill(); break;
      default: // 묶은 머리와 긴 머리의 매끈한 가르마
        hairCap(ctx, r, 0.8, false);
    }
    if (L.hair !== 'cap' && L.hair !== 'buzz') {
      ctx.strokeStyle = L.detail.hairLight; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(-8, -7.5); ctx.quadraticCurveTo(-5.5, -12, 0, -10.5); ctx.stroke();
    }
    if (L.headband && L.hair !== 'cap') {
      ctx.strokeStyle = L.accent; ctx.lineWidth = 2.7;
      ctx.beginPath(); ctx.arc(-0.7, -0.2, 11.3, Math.PI * 1.08, Math.PI * 1.80); ctx.stroke();
    }
    if (L.clip) seg(ctx, { x: -2.5, y: -6.8 }, { x: 1.2, y: -7.5 }, 2.1, L.accent);
    circle(ctx, -2.5, 1.6, 2.8, L.skin);
    circle(ctx, -2.8, 1.8, 1.3, L.detail.ear);
    const blink = Math.sin(t * 1.9 + L.h * 27) > 0.993 ? 0.18 : 1;
    ctx.fillStyle = '#3d302c';
    ctx.beginPath(); ctx.ellipse(6, -0.9, 1.35, 1.85 * blink, 0, 0, TAU); ctx.fill();
    if (blink === 1) circle(ctx, 6.35, -1.5, 0.43, '#fffaf0');
    ctx.strokeStyle = L.hairColor; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(3.8, -4.5 - 0.7 * k); ctx.quadraticCurveTo(6, -5.1, 8, -4.3); ctx.stroke();
    const alpha = ctx.globalAlpha;
    ctx.globalAlpha = alpha * 0.30;
    ctx.fillStyle = '#ed8e89'; ctx.beginPath(); ctx.ellipse(4.2, 3.5, 2.6, 1.7, -0.15, 0, TAU); ctx.fill();
    const mouth = smooth((k - 0.38) / 0.55);
    ctx.globalAlpha = alpha * (1 - mouth); ctx.strokeStyle = '#814c48'; ctx.lineWidth = 1.1;
    ctx.beginPath(); ctx.arc(7.1, 3.4, 2.1, 0.1, Math.PI * 0.77); ctx.stroke();
    ctx.globalAlpha = alpha * mouth; ctx.fillStyle = '#814c48';
    ctx.beginPath(); ctx.ellipse(8.2, 5, 1.6, 0.5 + 1.6 * mouth, -0.13, 0, TAU); ctx.fill();
    ctx.globalAlpha = alpha;
    if (L.glasses) {
      ctx.strokeStyle = '#53616b'; ctx.lineWidth = 1.05;
      ctx.beginPath(); ctx.arc(6, -0.8, 3.2, 0, TAU);
      ctx.moveTo(2.8, -1); ctx.lineTo(-1.8, -0.7); ctx.moveTo(9.2, -0.8); ctx.lineTo(11, -0.2); ctx.stroke();
    }
    ctx.restore();
  }

  function draw(ctx, L, phase, o) {
    o = o || {};
    const intensity = clamp(o.k == null ? 1 : o.k), k = smooth(intensity), t = o.t || 0;
    const u = ((phase / TAU) % 1 + 1) % 1, p = u * TAU;
    if (!L.detail) L.detail = details(L);
    ctx.save();
    try {
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      // 지지 중간에 가장 낮고, 양발이 뜬 구간에 가장 높다. 호흡은 발 위치에 영향을 주지 않는다.
      const breathe = Math.sin(t * 2.2) * 0.45 * (1 - k);
      const hip = { x: -1.2 * k, y: mix(-47, -46.5 + 3.4 * Math.cos(2 * p - TAU * 0.36), k) + breathe };
      const turn = k * Math.sin(p - 0.3);
      const nearHip = { x: hip.x + 0.7, y: hip.y }, farHip = { x: hip.x - 0.9, y: hip.y + 0.4 };
      const Pn = legPoints(nearHip, legPose(u, k, 3.5));
      const Pf = legPoints(farHip, legPose((u + 0.5) % 1, k, -5));
      const lean = 0.025 + 0.20 * k + 0.022 * turn;
      const sh = { x: hip.x + Math.sin(lean) * TOR, y: hip.y - Math.cos(lean) * TOR };
      const hc = { x: sh.x + 1.3 + 2 * k, y: sh.y - 14.5 };
      const swing = -Math.cos(p - TAU * 0.74);
      // 뒤쪽 팔다리 → 앞쪽 다리 → 몸통 → 머리 → 앞팔 순서로 겹친다.
      drawArm(ctx, L, { x: sh.x - 1.2 - turn, y: sh.y + 1.6 }, -swing, k, true);
      drawLeg(ctx, L, farHip, Pf, true);
      drawLeg(ctx, L, nearHip, Pn, false);
      drawTorso(ctx, L, hip, lean, turn);
      seg(ctx, { x: sh.x, y: sh.y - 0.3 }, { x: hc.x - 1, y: hc.y + 8 }, 6.5, L.skin);
      drawHead(ctx, L, hc, p, k, t);
      drawArm(ctx, L, { x: sh.x + 1 + turn, y: sh.y + 1 }, swing, k, false);
    } finally {
      ctx.restore();
    }
  }

  global.Runner = { makeLook, draw, shade };
})(window);
