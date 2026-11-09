/*
 * music.js — Web Audio로 직접 연주하는 배경 음악 4종 (모두 이 앱을 위해 새로 만든 곡)
 *   beat  : 비트 있는 힙합풍 (92 BPM, 붐뱁 드럼 + 일렉 피아노)
 *   cheer : 응원가 (128 BPM, 큰북 + 박수 짝짝짝 + 금관 멜로디 + 함성)
 *   dance : 댄스 (124 BPM, 쿵쿵 4비트 킥 + 신스 아르페지오 + 펌핑 패드)
 *   calm  : 잔잔한 피아노 (76 BPM, 아르페지오 + 따뜻한 패드)
 * Music.create(() => audioContext, () => destinationNode)
 *   .play(genre, step, time, vol)  — 16분음표 한 칸을 예약하고, 그 칸의 길이(초)를 돌려줌
 */
(function (global) {
  'use strict';
  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

  function create(getCtx, getDest) {
    let noiseBuf = null;
    function noiseSrc(c) {
      if (!noiseBuf) { noiseBuf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
      const s = c.createBufferSource(); s.buffer = noiseBuf; return s;
    }
    // 기본 음 하나: 오실레이터 → (필터) → 엔벨로프
    function note(f, t, dur, o) {
      const c = getCtx(); o = o || {};
      const osc = c.createOscillator(), g = c.createGain();
      osc.type = o.type || 'sine'; osc.frequency.setValueAtTime(f, t);
      if (o.detune) osc.detune.setValueAtTime(o.detune, t);
      if (o.slide) osc.frequency.exponentialRampToValueAtTime(o.slide, t + (o.slideT || dur));
      const a = o.attack || 0.006, vol = o.vol || 0.2;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + a);
      if (o.sustain) g.gain.setValueAtTime(vol, t + Math.max(a, dur - (o.release || 0.08)));
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      let node = osc;
      if (o.lp) { const fl = c.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.setValueAtTime(o.lp, t); if (o.lpEnd) fl.frequency.exponentialRampToValueAtTime(o.lpEnd, t + dur); fl.Q.value = o.q || 0.7; node.connect(fl); node = fl; }
      node.connect(g); g.connect(o.dest || getDest());
      osc.start(t); osc.stop(t + dur + 0.05);
    }
    function nz(t, dur, vol, o) {
      const c = getCtx(); o = o || {};
      const s = noiseSrc(c), f = c.createBiquadFilter(), g = c.createGain();
      f.type = o.type || 'highpass'; f.frequency.value = o.f || 1000; f.Q.value = o.q || 0.7;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + (o.attack || 0.002)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      s.connect(f); f.connect(g); g.connect(getDest());
      s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.02);
    }
    // 드럼
    const kick = (t, v) => note(150, t, 0.32, { slide: 42, slideT: 0.12, vol: 0.9 * v });
    const snare = (t, v) => { nz(t, 0.18, 0.45 * v, { f: 1800 }); note(185, t, 0.1, { type: 'triangle', vol: 0.25 * v }); };
    const hat = (t, v, open) => nz(t, open ? 0.18 : 0.04, (open ? 0.12 : 0.1) * v, { f: 7500 });
    const clap = (t, v) => { for (let i = 0; i < 3; i++) nz(t + i * 0.011, 0.12, 0.35 * v, { type: 'bandpass', f: 1400, q: 1.2 }); };
    const shaker = (t, v) => nz(t, 0.05, 0.05 * v, { f: 6000, attack: 0.02 });
    const bigDrum = (t, v) => { note(95, t, 0.45, { slide: 50, slideT: 0.2, vol: 0.8 * v }); nz(t, 0.12, 0.2 * v, { type: 'lowpass', f: 400 }); };

    // ---------- 곡 정의 ----------
    const SONGS = {
      // 비트: Am7 - Fmaj7 - Cmaj7 - G (붐뱁, 스윙 하이햇)
      beat: {
        bpm: 92,
        play(st, t, e, v) {
          const bar = Math.floor(st / 16) % 4, s = st % 16;
          const chords = [[57, 60, 64, 67], [53, 57, 60, 64], [48, 52, 55, 59], [55, 59, 62, 65]];
          const ch = chords[bar];
          const sw = (s % 2) ? e * 0.18 : 0; // 스윙
          if (s === 0 || s === 10 || (s === 7 && bar % 2)) kick(t, v);
          if (s === 4 || s === 12) snare(t, v);
          if (s % 2 === 0) hat(t + sw, v * (s % 4 ? 0.6 : 1));
          if (s === 14) hat(t, v, true);
          // 베이스
          const bl = { 0: 0, 3: 0, 6: 7, 10: 0, 12: 5, 14: 3 };
          if (bl[s] !== undefined) note(mtof(ch[0] - 24 + bl[s]), t, e * 1.8, { type: 'triangle', vol: 0.38 * v, lp: 600 });
          // 일렉 피아노 코드 (오프비트)
          if (s === 0 || s === 6 || s === 11) ch.forEach((m, i) => note(mtof(m), t + i * 0.008, e * 3, { type: 'triangle', vol: 0.05 * v, lp: 2200, lpEnd: 900 }));
          // 짧은 리드 훅
          const hook = [76, null, 74, 72, null, 69, null, null, 72, null, 74, null, 76, 79, null, null];
          if (bar % 2 === 1 && hook[s]) note(mtof(hook[s]), t + sw, e * 1.6, { type: 'sine', vol: 0.09 * v });
        }
      },
      // 응원가: C - F - G - C 행진 리듬 + 박수 "짝짝 짝짝짝" + 함성
      cheer: {
        bpm: 128,
        play(st, t, e, v) {
          const bar = Math.floor(st / 16) % 8, s = st % 16;
          if (s % 4 === 0) bigDrum(t, v);
          if (s === 8 && bar % 2 === 1) bigDrum(t + e, v * 0.7);
          // 박수: 짝 짝 / 짝짝짝 (마디마다 번갈아)
          const clapA = [4, 12], clapB = [8, 10, 12];
          if ((bar % 2 ? clapB : clapA).includes(s)) clap(t, v);
          if (s % 2 === 0) hat(t, v * 0.5);
          const roots = [48, 53, 55, 48, 48, 53, 55, 55];
          if (s % 4 === 0) note(mtof(roots[bar] - 12), t, e * 3.5, { type: 'sawtooth', vol: 0.16 * v, lp: 500 });
          // 금관 멜로디 (새로 만든 4마디 x 2)
          const mel = [
            [67, null, 67, null, 72, null, 72, null, 71, null, 69, null, 67, null, null, null],
            [65, null, 65, null, 69, null, 72, null, 74, null, 72, null, 69, null, null, null],
            [67, null, 71, null, 74, null, 74, null, 76, null, 74, null, 71, null, 67, null],
            [72, null, null, null, 76, null, null, null, 79, null, null, null, 84, null, null, null],
            [67, null, 67, 67, 72, null, 72, null, 76, null, 74, null, 72, null, null, null],
            [69, null, 69, 69, 72, null, 77, null, 76, null, 74, null, 72, null, null, null],
            [71, null, 71, 71, 74, null, 79, null, 77, null, 76, null, 74, null, null, null],
            [79, null, 76, null, 72, null, 74, null, 72, null, null, null, null, null, null, null]
          ][bar];
          if (mel[s]) {
            note(mtof(mel[s]), t, e * 1.9, { type: 'sawtooth', vol: 0.09 * v, lp: 2600, attack: 0.02 });
            note(mtof(mel[s] - 12), t, e * 1.9, { type: 'square', vol: 0.04 * v, lp: 1400, attack: 0.02 });
          }
          // 함성 "와~" (4마디마다)
          if (s === 0 && bar % 4 === 3) nz(t, 1.6, 0.12 * v, { type: 'bandpass', f: 900, q: 0.5, attack: 0.25 });
        }
      },
      // 댄스: Am - F - C - G, 4비트 킥, 오프비트 오픈햇, 16분 아르페지오
      dance: {
        bpm: 124,
        play(st, t, e, v) {
          const bar = Math.floor(st / 16) % 4, s = st % 16;
          const chords = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]];
          const ch = chords[bar];
          if (s % 4 === 0) kick(t, v);
          if (s % 4 === 2) hat(t, v, true);
          if (s === 4 || s === 12) clap(t, v * 0.8);
          if (s % 2 === 1) hat(t, v * 0.5);
          // 오프비트 베이스 (옥타브 튕김)
          if (s % 4 === 2) note(mtof(ch[0] - 24 + (s % 8 === 6 ? 12 : 0)), t, e * 1.6, { type: 'sawtooth', vol: 0.22 * v, lp: 700, lpEnd: 250 });
          // 16분 아르페지오 (필터가 마디마다 열림)
          const arp = [0, 1, 2, 1, 2, 0, 1, 2][s % 8];
          const open = 900 + (s / 16) * 2600;
          note(mtof(ch[arp] + 12 + (s >= 12 ? 12 : 0)), t, e * 0.9, { type: 'square', vol: 0.06 * v, lp: open });
          // 펌핑 패드 (킥 뒤에서 커지는 느낌)
          if (s % 4 === 1) ch.forEach((m) => note(mtof(m), t, e * 2.6, { type: 'sawtooth', vol: 0.025 * v, lp: 1800, attack: e * 1.2, detune: 7 }));
        }
      },
      // 잔잔한: Cmaj7 - Am7 - Fmaj7 - G6 피아노 아르페지오 + 패드
      calm: {
        bpm: 76,
        play(st, t, e, v) {
          const bar = Math.floor(st / 16) % 4, s = st % 16;
          const chords = [[48, 55, 59, 64, 67], [45, 52, 55, 60, 64], [41, 48, 52, 57, 60], [43, 50, 55, 59, 64]];
          const ch = chords[bar];
          if (s === 0) {
            note(mtof(ch[0] - 12), t, e * 15, { type: 'sine', vol: 0.18 * v, attack: 0.02 });
            ch.slice(1, 4).forEach((m) => note(mtof(m), t, e * 16, { type: 'triangle', vol: 0.025 * v, attack: e * 4, sustain: true, release: e * 4, lp: 1200 }));
          }
          const pat = [1, null, 2, null, 3, null, 4, null, 3, null, 2, null, 4, null, 3, null];
          if (pat[s] != null) {
            const m = ch[pat[s]] + 12;
            note(mtof(m), t, e * 6, { type: 'triangle', vol: 0.07 * v, lp: 3000, lpEnd: 800 });
            note(mtof(m) * 2, t, e * 2, { type: 'sine', vol: 0.015 * v });
          }
          if (s % 4 === 2) shaker(t, v * 0.6);
        }
      }
    };

    function play(genre, st, t, v, tempoMul) {
      const song = SONGS[genre];
      if (!song) return 0.1;
      const e = 60 / (song.bpm * (genre === 'calm' ? Math.min(tempoMul, 1.12) : tempoMul)) / 4;
      song.play(st, t, e, v);
      return e;
    }
    return { play, genres: Object.keys(SONGS) };
  }

  global.Music = { create };
})(window);
