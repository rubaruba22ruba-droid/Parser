/* Drade Drop — эффекты: звук (WebAudio, без файлов), вибрация Telegram, размытие ленты, конфетти, лучи. */
(function () {
  const RARITY = { uncommon: '#b4bed2', common: '#3b82f6', rare: '#22d3ee', epic: '#8b5cf6', purple: '#ec4899', mythic: '#ef4444', legendary: '#facc15' };
  let ctx = null, muted = false;
  try { muted = localStorage.getItem('dd_muted') === '1'; } catch (e) { }
  const ac = () => { if (!ctx) { try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { } } if (ctx && ctx.state === 'suspended') ctx.resume(); return ctx; };
  document.addEventListener('pointerdown', ac, { once: true });

  function tone(freq, dur, type, vol, when, slideTo) {
    const c = ac(); if (!c || muted) return;
    const t = c.currentTime + (when || 0), o = c.createOscillator(), g = c.createGain();
    o.type = type || 'sine'; o.frequency.setValueAtTime(freq, t); if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol || 0.15, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(c.destination); o.start(t); o.stop(t + dur + 0.02);
  }
  const haptic = (kind) => { try { const h = Telegram.WebApp.HapticFeedback; if (kind === 'tick') h.selectionChanged(); else if (kind === 'success' || kind === 'error') h.notificationOccurred(kind); else h.impactOccurred(kind || 'light'); } catch (e) { } };

  let lastTick = 0;
  function tick() { const now = performance.now(); if (now - lastTick < 28) return; lastTick = now; tone(1650 + Math.random() * 300, 0.035, 'square', 0.035); haptic('tick'); }
  function win(rarity) {
    const big = ['purple', 'mythic', 'legendary'].includes(rarity);
    [523, 659, 784, 1047].concat(big ? [1319, 1568] : []).forEach((f, i) => tone(f, 0.22, 'triangle', 0.11, i * 0.07));
    if (big) tone(196, 0.6, 'sawtooth', 0.04, 0, 392);
    haptic(big ? 'success' : 'medium');
  }
  function lose() { tone(220, 0.35, 'sawtooth', 0.07, 0, 90); tone(110, 0.4, 'sine', 0.12, 0.05, 60); haptic('error'); }
  function whoosh() { tone(300, 0.5, 'sine', 0.05, 0, 1200); }

  // ---- конфетти на canvas ----
  let cv = null, cx2 = null, parts = [], raf = 0;
  function confetti(color, n, originY, palette) {
    if (!cv) { cv = document.createElement('canvas'); cv.className = 'dd-confetti'; document.body.appendChild(cv); cx2 = cv.getContext('2d'); }
    const dpr = Math.min(2, window.devicePixelRatio || 1); cv.width = innerWidth * dpr; cv.height = innerHeight * dpr; cx2.setTransform(dpr, 0, 0, dpr, 0, 0);
    const cols = palette || [color, '#ffffff', '#facc15', '#a78bfa', '#22d3ee'];
    for (let i = 0; i < (n || 120); i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.2, v = 7 + Math.random() * 9;
      parts.push({ x: innerWidth / 2, y: innerHeight * (originY || 0.42), vx: Math.cos(a) * v, vy: Math.sin(a) * v, r: 3 + Math.random() * 5, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4, c: cols[i % cols.length], life: 0, shape: i % 3 });
    }
    if (!raf) loop();
  }
  function loop() {
    cx2.clearRect(0, 0, innerWidth, innerHeight);
    parts = parts.filter(p => p.life < 170 && p.y < innerHeight + 30);
    for (const p of parts) {
      p.life++; p.vy += 0.28; p.vx *= 0.985; p.x += p.vx; p.y += p.vy; p.rot += p.vr;
      cx2.save(); cx2.globalAlpha = Math.max(0, 1 - p.life / 170); cx2.translate(p.x, p.y); cx2.rotate(p.rot); cx2.fillStyle = p.c;
      if (p.shape === 0) cx2.fillRect(-p.r, -p.r / 2, p.r * 2, p.r); else if (p.shape === 1) { cx2.beginPath(); cx2.arc(0, 0, p.r / 1.4, 0, 7); cx2.fill(); }
      else { cx2.beginPath(); for (let k = 0; k < 8; k++) { const rr = k % 2 ? p.r * 0.4 : p.r * 1.2, an = k * Math.PI / 4; cx2.lineTo(Math.cos(an) * rr, Math.sin(an) * rr); } cx2.fill(); }
      cx2.restore();
    }
    raf = parts.length ? requestAnimationFrame(loop) : 0; if (!raf) cx2.clearRect(0, 0, innerWidth, innerHeight);
  }

  // ---- лента кейса: тик, когда карточка проходит через центр (без blur — он съедает кадры на телефонах) ----
  const slot = { idx: null };
  function slotFrame(pos, el, step) {
    const idx = Math.floor(-pos / (step || 123)); if (slot.idx !== null && idx !== slot.idx) tick();
    slot.idx = idx;
  }
  function slotReset() { slot.idx = null; }
  // колонка x2–x5 встала: глухой «тук» с вибрацией, каждая следующая — чуть выше
  function stop(i) { tone(180 + (i || 0) * 40, 0.09, 'triangle', 0.16, 0, 120); tone(900 + (i || 0) * 80, 0.03, 'square', 0.04); haptic('rigid'); }

  // ---- окно выигрыша: лучи, свечение по редкости, счётчик стоимости ----
  function decorateWin(items) {
    const card = document.getElementById('winModalCard'); if (!card) return;
    const best = (items || []).reduce((a, b) => (b.value || 0) > (a.value || 0) ? b : a, items[0] || {});
    const color = RARITY[best.rarity] || '#8b5cf6';
    card.style.setProperty('--win-c', color); card.classList.remove('dd-win-in'); void card.offsetWidth; card.classList.add('dd-win-in');
    if (!card.querySelector('.dd-rays')) { const r = document.createElement('div'); r.className = 'dd-rays'; card.prepend(r); }
    const val = document.getElementById('winItemValue');
    if (val) { const target = items.reduce((s, i) => s + (i.value || 0), 0), t0 = performance.now(); const step = (t) => { const k = Math.min(1, (t - t0) / 900); val.textContent = Math.round(target * (1 - Math.pow(1 - k, 3))).toLocaleString('ru-RU'); if (k < 1) requestAnimationFrame(step); }; requestAnimationFrame(step); }
    win(best.rarity); confetti(color, ['purple', 'mythic', 'legendary'].includes(best.rarity) ? 190 : 90);
  }

  // гул вращения колеса: шум через полосовой фильтр + низкий «мотор»; set(0..1) — скорость, stop() — плавно глушит
  let noiseBuf = null;
  function nbuf(c) { if (!noiseBuf) { noiseBuf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; } return noiseBuf; }
  // шумовой удар/шорох: полосовой фильтр едет от f0 к f1 (пыль, хлопок, свист)
  function noise(dur, vol, when, f0, f1, q) {
    const c = ac(); if (!c || muted) return;
    const t = c.currentTime + (when || 0), src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    src.buffer = nbuf(c); f.type = 'bandpass'; f.Q.value = q || 1; f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + Math.min(0.03, dur / 4)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(c.destination); src.start(t, Math.random()); src.stop(t + dur + 0.05);
  }
  function whirr() {
    const c = ac(); if (!c || muted) return null;
    const t = c.currentTime, out = c.createGain(); out.gain.setValueAtTime(0.0001, t); out.gain.exponentialRampToValueAtTime(1, t + 0.12); out.connect(c.destination);
    const src = c.createBufferSource(); src.buffer = nbuf(c); src.loop = true;
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 1.4; bp.frequency.value = 500;
    const ng = c.createGain(); ng.gain.value = 0; src.connect(bp).connect(ng).connect(out);
    const osc = c.createOscillator(); osc.type = 'sawtooth'; osc.frequency.value = 55;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 320;
    const og = c.createGain(); og.gain.value = 0; osc.connect(lp).connect(og).connect(out);
    src.start(t); osc.start(t);
    return {
      set(s) { const n = c.currentTime; bp.frequency.setTargetAtTime(380 + s * 2600, n, 0.05); ng.gain.setTargetAtTime(0.012 + s * 0.085, n, 0.05);
        osc.frequency.setTargetAtTime(48 + s * 95, n, 0.05); og.gain.setTargetAtTime(0.01 + s * 0.05, n, 0.06); },
      stop() { const n = c.currentTime; out.gain.setTargetAtTime(0.0001, n, 0.08); src.stop(n + 0.6); osc.stop(n + 0.6); }
    };
  }

  function setMuted(m) { muted = m; try { localStorage.setItem('dd_muted', m ? '1' : '0'); } catch (e) { } }
  window.FX = { tick, stop, tone, win, lose, whoosh, haptic, confetti, slotFrame, slotReset, decorateWin, RARITY, setMuted, isMuted: () => muted, ctx: ac, whirr, noise };
})();
