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
  function confetti(color, n, originY) {
    if (!cv) { cv = document.createElement('canvas'); cv.className = 'dd-confetti'; document.body.appendChild(cv); cx2 = cv.getContext('2d'); }
    const dpr = Math.min(2, window.devicePixelRatio || 1); cv.width = innerWidth * dpr; cv.height = innerHeight * dpr; cx2.setTransform(dpr, 0, 0, dpr, 0, 0);
    const cols = [color, '#ffffff', '#facc15', '#a78bfa', '#22d3ee'];
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

  // ---- лента кейса: тики при прохождении карточки через центр + размытие от скорости ----
  const slot = { last: null, lastT: 0, idx: null };
  function slotFrame(pos, el, step) {
    const now = performance.now();
    if (slot.last !== null) {
      const v = Math.abs(pos - slot.last) / Math.max(1, now - slot.lastT);   // px/ms
      el.style.filter = v > 0.25 ? `blur(${Math.min(3.2, (v - 0.25) * 1.6).toFixed(2)}px)` : '';
    }
    const idx = Math.floor(-pos / (step || 123)); if (slot.idx !== null && idx !== slot.idx) tick();
    slot.idx = idx; slot.last = pos; slot.lastT = now;
  }
  function slotReset(el) { slot.last = null; slot.idx = null; if (el) el.style.filter = ''; }

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

  function setMuted(m) { muted = m; try { localStorage.setItem('dd_muted', m ? '1' : '0'); } catch (e) { } }
  window.FX = { tick, win, lose, whoosh, haptic, confetti, slotFrame, slotReset, decorateWin, RARITY, setMuted, isMuted: () => muted };
})();
