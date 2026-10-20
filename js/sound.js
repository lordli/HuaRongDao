/*
 * 音效與震動回饋。
 * 音效用 Web Audio 即時合成（不需要音檔）：木塊「咚」、碰壁的悶聲、提示的鈴聲、過關的五聲音階。
 * 瀏覽器規定要等使用者第一次點擊或按鍵後才能發聲，所以在那之前不建立 AudioContext。
 */
(function (root) {
  'use strict';
  const HRD = root.HRD;
  const AC = root.AudioContext || root.webkitAudioContext;

  let ctx = null, master = null, noise = null;

  function unlock() {
    if (!AC) return;
    if (ctx) { if (ctx.state === 'suspended') ctx.resume().catch(() => {}); return; }
    try {
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.55;
      master.connect(ctx.destination);
      noise = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.06), ctx.sampleRate);
      const data = noise.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    } catch (e) {
      ctx = null;
    }
  }
  ['pointerdown', 'keydown'].forEach((t) => document.addEventListener(t, unlock, { capture: true, passive: true }));

  const soundOn = () => HRD.store.setting('sound') !== false;
  const hapticsOn = () => HRD.store.setting('haptics') !== false;
  /* 只有觸控裝置才把震動當成功能（桌機 Chrome 也有 vibrate，但不會震） */
  const touchDevice = () => !!(root.matchMedia && root.matchMedia('(pointer: coarse)').matches);
  const canVibrate = () => typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function' && touchDevice();

  function live() {
    if (!soundOn() || !ctx) return null;
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    const vol = HRD.settings ? Number(HRD.settings.get('volume')) : 0.8;
    master.gain.value = 0.7 * Math.max(0, Math.min(1, isNaN(vol) ? 0.8 : vol));
    return ctx;
  }

  /* 一個音：可從較高的音滑下來，快速起音、指數衰減 */
  function tone(c, freq, at, dur, opt) {
    const o = c.createOscillator(), g = c.createGain();
    o.type = opt.type || 'triangle';
    if (opt.from) {
      o.frequency.setValueAtTime(opt.from, at);
      o.frequency.exponentialRampToValueAtTime(freq, at + 0.025);
    } else {
      o.frequency.setValueAtTime(freq, at);
    }
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(opt.vol, at + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    o.connect(g).connect(master);
    o.start(at);
    o.stop(at + dur + 0.02);
  }

  /* 木頭碰撞的短促雜音 */
  function knock(c, at, vol, freq) {
    const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = noise;
    f.type = 'bandpass';
    f.frequency.value = freq;
    f.Q.value = 1.4;
    g.gain.setValueAtTime(vol, at);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.05);
    s.connect(f).connect(g).connect(master);
    s.start(at);
  }

  /* 撥弦（像古箏）：基音加一個高八度泛音，聲音較長 */
  function pluck(c, freq, at, dur, vol) {
    tone(c, freq, at, dur, { type: 'triangle', vol: vol });
    tone(c, freq * 2, at, dur * 0.6, { type: 'sine', vol: vol * 0.3 });
  }

  const PITCH = { king: 150, tall: 220, wide: 220, soldier: 320 };

  const sounds = {
    move(type) {
      const c = live(); if (!c) return;
      const f = (PITCH[type] || 240) * (0.97 + Math.random() * 0.06);
      const t = c.currentTime;
      tone(c, f, t, 0.11, { type: 'triangle', vol: 0.32, from: f * 1.7 });
      knock(c, t, 0.12, 1700);
    },
    blocked() {
      const c = live(); if (!c) return;
      tone(c, 92, c.currentTime, 0.14, { type: 'sine', vol: 0.28, from: 135 });
    },
    select() {
      const c = live(); if (!c) return;
      tone(c, 720, c.currentTime, 0.05, { type: 'sine', vol: 0.07 });
    },
    undo() {
      const c = live(); if (!c) return;
      tone(c, 200, c.currentTime, 0.09, { type: 'triangle', vol: 0.22, from: 290 });
    },
    hint() {
      const c = live(); if (!c) return;
      const t = c.currentTime;
      pluck(c, 880, t, 0.5, 0.16);
      pluck(c, 1318.5, t + 0.12, 0.7, 0.13);
    },
    win() {
      const c = live(); if (!c) return;
      const t = c.currentTime + 0.05;
      // D 宮五聲音階往上撥：D E F# A B，最後回到高八度 D
      [587.33, 659.25, 739.99, 880, 987.77].forEach((f, i) => pluck(c, f, t + i * 0.11, 0.9, 0.17));
      pluck(c, 1174.66, t + 0.62, 1.6, 0.2);
      pluck(c, 587.33, t + 0.62, 1.6, 0.12);
    },
  };

  const PATTERN = { move: 8, blocked: [12, 40, 12], select: 0, undo: 6, hint: 0, win: [30, 60, 30, 60, 90] };

  function buzz(name) {
    const p = PATTERN[name];
    if (!p || !hapticsOn() || !canVibrate()) return;
    try { navigator.vibrate(p); } catch (e) { /* 部分瀏覽器不允許 */ }
  }

  /* HRD.fx.move('king') 之類：同時發聲與震動 */
  const fx = {};
  Object.keys(sounds).forEach((name) => {
    fx[name] = (arg) => {
      try { sounds[name](arg); } catch (e) { /* 音效失敗不影響遊戲 */ }
      buzz(name);
    };
  });
  fx.place = fx.move;
  fx.remove = fx.blocked;
  fx.canVibrate = canVibrate;
  fx.touchDevice = touchDevice;
  fx.unlock = unlock;

  HRD.fx = fx;
})(window);
