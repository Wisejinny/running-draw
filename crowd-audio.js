/*
 * crowd-audio.js — 관중 함성·박수·긴장감 효과음 (Web Audio 로 직접 합성)
 *   FxAudio.create(() => audioContext, () => destinationNode)
 *   .tick(dt, { racing, done, prog, E })   매 프레임 호출: 함성 크기, 박수, 심장박동, 스네어 롤, 상승음을 알아서 만듦
 *   .horn()      첫 번째 선수가 결승선을 통과할 때: 에어혼 + 함성 폭발 + 심벌
 *   .cheer()     다른 선수가 들어올 때의 작은 환호
 *   .sport(kind) 종목별 발소리·물소리 (thud / tick / splash / whoosh)
 *   .stop()      소리 끄기
 */
(function (global) {
  'use strict';
  function create(getCtx, getDest) {
    let c = null, bus = null, crowd = null, riser = null, noiseBuf = null;
    const acc = { hb: 0, sn: 0, clap: 0 };
    let level = 0;
    function ensure() {
      c = getCtx(); if (!c) return false;
      if (bus) return true;
      bus = c.createGain(); bus.gain.value = 0.95; bus.connect(getDest());
      noiseBuf = c.createBuffer(1, c.sampleRate * 3, c.sampleRate);
      const d = noiseBuf.getChannelData(0); let b = 0;
      for (let i = 0; i < d.length; i++) { const w = Math.random() * 2 - 1; b = 0.97 * b + 0.03 * w; d[i] = (w * 0.55 + b * 8) * 0.6; }
      const src = c.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
      const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 700; bp.Q.value = 0.45;
      const pk = c.createBiquadFilter(); pk.type = 'peaking'; pk.frequency.value = 1900; pk.gain.value = 7;
      const g = c.createGain(); g.gain.value = 0;
      src.connect(bp); bp.connect(pk); pk.connect(g); g.connect(bus); src.start();
      const lfo = c.createOscillator(); lfo.frequency.value = 0.4; const lg = c.createGain(); lg.gain.value = 0; lfo.connect(lg); lg.connect(g.gain); lfo.start();
      crowd = { g, lg, bp };
      const ro = c.createOscillator(); ro.type = 'sawtooth'; ro.frequency.value = 180;
      const rf = c.createBiquadFilter(); rf.type = 'lowpass'; rf.frequency.value = 1000;
      const rg = c.createGain(); rg.gain.value = 0; ro.connect(rf); rf.connect(rg); rg.connect(bus); ro.start();
      riser = { o: ro, f: rf, g: rg };
      return true;
    }
    function osc(type, f, t, dur, vol, o) {
      o = o || {};
      const x = c.createOscillator(), g = c.createGain();
      x.type = type; x.frequency.setValueAtTime(f, t); if (o.to) x.frequency.exponentialRampToValueAtTime(o.to, t + (o.toT || dur));
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + (o.a || 0.01)); if (o.hold) g.gain.setValueAtTime(vol, t + o.hold); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      let n = x; if (o.lp) { const f2 = c.createBiquadFilter(); f2.type = 'lowpass'; f2.frequency.value = o.lp; x.connect(f2); n = f2; }
      n.connect(g); g.connect(o.dest || bus); x.start(t); x.stop(t + dur + 0.05);
    }
    function noise(t, dur, vol, ftype, f, q, o) {
      o = o || {};
      const s = c.createBufferSource(); s.buffer = noiseBuf; const fl = c.createBiquadFilter(); fl.type = ftype; fl.frequency.setValueAtTime(f, t); if (o.to) fl.frequency.exponentialRampToValueAtTime(o.to, t + dur); fl.Q.value = q || 0.8;
      const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + (o.a || 0.004)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      s.connect(fl); fl.connect(g); g.connect(bus); s.start(t, Math.random() * 2); s.stop(t + dur + 0.05);
    }
    const clap = (t, v) => { for (let i = 0; i < 2; i++) noise(t + i * 0.012, 0.09, 0.13 * v, 'bandpass', 1500 + Math.random() * 1800, 1.1); };

    function tick(dt, st) {
      if (!ensure()) return;
      const now = c.currentTime, E = st.E || 0;
      const on = st.racing || st.done;
      crowd.g.gain.setTargetAtTime(on ? 0.035 + 0.5 * Math.pow(E, 1.15) : 0, now, 0.3);
      crowd.lg.gain.setTargetAtTime(on ? 0.09 * E : 0, now, 0.3);
      crowd.bp.frequency.setTargetAtTime(650 + 520 * E, now, 0.4);
      // 박수 (흥분할수록 빠르고 많이)
      if (on && E > 0.12) {
        acc.clap += dt * (3 + 17 * E);
        while (acc.clap >= 1) { acc.clap -= 1; clap(now + Math.random() * 0.08, 0.5 + 0.7 * E); }
      }
      // 결승이 다가올 때의 긴장감
      level = st.racing ? Math.max(0, Math.min(1, (st.prog - 0.6) / 0.4)) : 0;
      riser.g.gain.setTargetAtTime(level > 0 ? 0.015 + 0.075 * level : 0, now, 0.15);
      riser.o.frequency.setTargetAtTime(150 + 950 * Math.pow(level, 1.4), now, 0.12);
      riser.f.frequency.setTargetAtTime(500 + 2400 * level, now, 0.12);
      if (level > 0) {
        acc.hb += dt;
        const iv = 0.62 - 0.4 * level;
        if (acc.hb >= iv) { acc.hb = 0; osc('sine', 85, now, 0.2, 0.55, { to: 38 }); osc('sine', 70, now + 0.13, 0.17, 0.32, { to: 35 }); }
        if (level > 0.45) {
          acc.sn += dt * (6 + 16 * ((level - 0.45) / 0.55));
          while (acc.sn >= 1) { acc.sn -= 1; noise(now, 0.07, 0.07 + 0.14 * level, 'highpass', 2200, 0.7); osc('triangle', 190, now, 0.06, 0.05 + 0.06 * level); }
        }
      }
    }
    function roar(t, dur, vol) {
      noise(t, dur, vol, 'bandpass', 600, 0.5, { a: 0.35, to: 1100 });
      noise(t + 0.05, dur * 0.9, vol * 0.7, 'bandpass', 1500, 0.6, { a: 0.3, to: 2300 });
      osc('sawtooth', 300, t, dur, vol * 0.12, { to: 480, a: 0.3, lp: 1400 });
    }
    function horn() {
      if (!ensure()) return;
      const t = c.currentTime;
      for (const f of [466, 587, 698]) { osc('sawtooth', f, t, 1.2, 0.17, { hold: 0.85, a: 0.03, lp: 2400 }); osc('square', f * 1.005, t, 1.2, 0.07, { hold: 0.85, a: 0.03, lp: 2000 }); }
      noise(t, 1.8, 0.4, 'highpass', 5200, 0.7, { a: 0.01 });
      roar(t + 0.05, 2.6, 0.7);
      for (let i = 0; i < 16; i++) clap(t + 0.4 + i * 0.12 + Math.random() * 0.05, 1.1);
      osc('sine', 110, t, 0.5, 0.7, { to: 40 });
    }
    function cheer() { if (!ensure()) return; roar(c.currentTime, 1.0, 0.3); for (let i = 0; i < 4; i++) clap(c.currentTime + i * 0.1, 0.8); }
    function sport(kind, v) {
      if (!ensure()) return; const t = c.currentTime, g = 0.5 + Math.min(0.5, (v || 0) * 0.03);
      if (kind === 'thud') { osc('sine', 120, t, 0.12, 0.5 * g, { to: 55 }); noise(t, 0.07, 0.12 * g, 'lowpass', 400, 0.7); }
      else if (kind === 'tick') noise(t, 0.025, 0.07 * g, 'highpass', 5000, 0.8);
      else if (kind === 'splash') noise(t, 0.26, 0.22 * g, 'bandpass', 1400, 0.7, { to: 700 });
      else if (kind === 'whoosh') noise(t, 0.32, 0.2 * g, 'bandpass', 600, 0.6, { a: 0.1, to: 2400 });
    }
    function stop() {
      if (!bus) return; const now = c.currentTime;
      crowd.g.gain.setTargetAtTime(0, now, 0.15); riser.g.gain.setTargetAtTime(0, now, 0.08); acc.hb = acc.sn = acc.clap = 0;
    }
    return { tick, horn, cheer, sport, stop };
  }
  global.FxAudio = { create };
})(window);
