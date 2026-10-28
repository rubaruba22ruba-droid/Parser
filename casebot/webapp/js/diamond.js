/* Drade Drop — алмазная зона апгрейда.
   Стрелка встала в алмаз внизу колеса → колесо кристаллизуется, летят осколки → открывается сцена
   «Алмазный дроп»: 3D-барабан перебирает NFT в 1.5–4 раза дороже цели и останавливается на выигрыше.
   Всё — настоящие картинки подарков; рисуются только свет, осколки и искры. */
(function () {
  const STAR = '<svg viewBox="0 0 14 15" width="13" height="13" fill="#FFCA5A" style="vertical-align:-1px"><path d="M6.64 12.19 3.5 14.1a.69.69 0 0 1-1.03-.76l.48-1.9a2.7 2.7 0 0 1 1.29-1.58l3.42-1.64a.32.32 0 0 0-.2-.6l-3.8.65A2.7 2.7 0 0 1 1.5 7.7L.3 6.7a.69.69 0 0 1 .39-1.22l3.67-.29a.69.69 0 0 0 .58-.42L6.36 1.34a.69.69 0 0 1 1.28 0l1.42 3.42c.1.24.32.4.58.42l3.69.29a.69.69 0 0 1 .4 1.22l-2.82 2.4a.69.69 0 0 0-.22.69l.87 3.6a.69.69 0 0 1-1.03.75l-3.16-1.94a.69.69 0 0 0-.72 0z"/></svg>';
  const GEM = 'images/gifts/diamond-100.webp';
  const fmt = n => Math.round(Number(n) || 0).toLocaleString('ru-RU');
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const lite = matchMedia('(prefers-reduced-motion: reduce)').matches || (navigator.hardwareConcurrency || 8) <= 4;

  // ---------- зоны колеса: та же формула, что server/diamond.mjs ----------
  window.DDZones = function (stake, target, gifts, s) {
    const cN = stake / target * s.factor, share = Math.max(0, Math.min(0.9, Number(s.diamondShare) || 0));
    const lo = target * (s.diamondMin || 1.5), hi = target * (s.diamondMax || 4);
    const pool = share > 0 ? gifts.filter(g => g.kind !== 'regular' && g.value >= lo && g.value <= hi).sort((a, b) => a.value - b.value || (a.id < b.id ? -1 : 1)) : [];
    if (!pool.length) return { c: Math.min(s.maxChance, cN), d: 0, d0: 0, pool: [] };
    const inv = pool.reduce((a, g) => a + 1 / g.value, 0), mean = pool.length / inv;
    const c = Math.min(s.maxChance, (1 - share) * cN), d = Math.min(0.2, share * cN * target / mean);
    return { c, d, d0: Math.max(c + 0.01, 0.5 - d / 2), pool: pool.map(g => ({ ...g, p: 1 / g.value / inv })) };
  };

  // ---------- звук: стекло, кристалл, гул ----------
  const audio = () => (FX.isMuted && FX.isMuted()) || !FX.ctx ? null : FX.ctx();
  let noiseBuf = null;
  function noise(dur, vol, when, f0, f1, q) {
    const c = audio(); if (!c) return;
    if (!noiseBuf) { noiseBuf = c.createBuffer(1, c.sampleRate * 1.5, c.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
    const t = c.currentTime + (when || 0), src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    src.buffer = noiseBuf; f.type = 'bandpass'; f.Q.value = q || 1.2; f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + Math.min(0.08, dur / 3)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(c.destination); src.start(t); src.stop(t + dur + 0.05);
  }
  function pad(freqs, dur, vol, when) {
    const c = audio(); if (!c) return;
    const t = c.currentTime + (when || 0), g = c.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.35); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); g.connect(c.destination);
    for (const f of freqs) for (const det of [-5, 5]) { const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = f; o.detune.value = det; o.connect(g); o.start(t); o.stop(t + dur + 0.05); }
  }
  // колокольчик-кристалл: неровные обертоны, у высоких короче хвост
  function chime(base, vol, when) { [[1, 1.4], [2.76, .7], [5.4, .4], [8.93, .22]].forEach(([r, d], i) => FX.tone(base * r, d, 'sine', vol / (1 + i * 1.3), when || 0)); }
  let lastGlass = 0;
  function glass(k) {
    const now = performance.now(); if (now - lastGlass < 30) return; lastGlass = now;
    FX.tone(2700 + (k || 0) * 40 + Math.random() * 260, 0.05, 'sine', 0.07); FX.tone(5400 + Math.random() * 500, 0.025, 'sine', 0.022); FX.haptic('tick');
  }
  function boom(vol) { FX.tone(120, 0.7, 'sine', vol || 0.3, 0, 36); noise(0.45, 0.08, 0, 900, 110, 0.8); }

  // ---------- частицы: осколки алмаза и искры (один canvas поверх всего) ----------
  const FXC = { cv: null, g: null, parts: [], ambient: 0, raf: 0, w: 0, h: 0, sprite: null, star: null };
  function sprites() {
    if (FXC.sprite) return;
    const s = document.createElement('canvas'); s.width = s.height = 64; const g = s.getContext('2d'), r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(.25, 'rgba(190,245,255,.75)'); r.addColorStop(.6, 'rgba(95,216,255,.18)'); r.addColorStop(1, 'rgba(95,216,255,0)');
    g.fillStyle = r; g.fillRect(0, 0, 64, 64); FXC.sprite = s;
    const t = document.createElement('canvas'); t.width = t.height = 64; const h = t.getContext('2d');
    h.drawImage(s, 16, 16, 32, 32); h.fillStyle = '#fff';
    h.beginPath(); h.moveTo(32, 0); h.lineTo(35, 29); h.lineTo(64, 32); h.lineTo(35, 35); h.lineTo(32, 64); h.lineTo(29, 35); h.lineTo(0, 32); h.lineTo(29, 29); h.closePath(); h.fill();
    FXC.star = t;
  }
  function fxCanvas() {
    sprites();
    if (!FXC.cv || !FXC.cv.isConnected) { FXC.cv = document.createElement('canvas'); FXC.cv.className = 'dd-dia-fx'; document.body.appendChild(FXC.cv); FXC.g = FXC.cv.getContext('2d'); }
    const dpr = Math.min(1.25, devicePixelRatio || 1);
    if (FXC.w !== innerWidth || FXC.h !== innerHeight) { FXC.w = innerWidth; FXC.h = innerHeight; FXC.cv.width = innerWidth * dpr; FXC.cv.height = innerHeight * dpr; FXC.g.setTransform(dpr, 0, 0, dpr, 0, 0); }
    if (!FXC.raf) FXC.raf = requestAnimationFrame(fxLoop);
  }
  const SH = [[125, 244, 255], [191, 239, 255], [157, 123, 255], [95, 216, 255], [235, 250, 255]];
  function shards(x, y, n, power, up) {
    fxCanvas(); n = lite ? Math.round(n * .55) : n;
    for (let i = 0; i < n; i++) {
      const a = up ? -Math.PI / 2 + (Math.random() - .5) * 2.6 : Math.random() * Math.PI * 2, v = (3 + Math.random() * 9) * (power || 1), k = 3 + (Math.random() * 2 | 0), r = 4 + Math.random() * 9;
      const pts = []; for (let j = 0; j < k; j++) { const an = j / k * Math.PI * 2 + Math.random() * .9; pts.push([Math.cos(an) * r * (.5 + Math.random() * .7), Math.sin(an) * r * (.5 + Math.random() * .7)]); }
      FXC.parts.push({ t: 'shard', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, rot: Math.random() * 6, vr: (Math.random() - .5) * .5, pts, c: SH[i % SH.length], life: 0, max: 70 + Math.random() * 50 });
    }
    for (let i = 0; i < n * .7; i++) {
      const a = Math.random() * Math.PI * 2, v = (2 + Math.random() * 10) * (power || 1);
      FXC.parts.push({ t: 'spark', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 1.5, s: 6 + Math.random() * 16, life: 0, max: 40 + Math.random() * 50, rot: Math.random() * 3 });
    }
  }
  function twinkle(n, box) {
    fxCanvas(); const b = box || { x: 0, y: 0, w: innerWidth, h: innerHeight };
    for (let i = 0; i < n; i++) FXC.parts.push({ t: 'twinkle', x: b.x + Math.random() * b.w, y: b.y + Math.random() * b.h, vx: (Math.random() - .5) * .3, vy: -.2 - Math.random() * .5, s: 8 + Math.random() * 18, life: 0, max: 50 + Math.random() * 60, rot: Math.random() * 3 });
  }
  function fxLoop() {
    const g = FXC.g, P = FXC.parts; g.clearRect(0, 0, FXC.w, FXC.h);
    if (FXC.ambient && Math.random() < (lite ? .25 : .5)) twinkle(1);
    for (let i = P.length - 1; i >= 0; i--) {
      const p = P[i]; p.life++;
      if (p.life > p.max) { P.splice(i, 1); continue; }
      const k = p.life / p.max;
      if (p.t === 'shard') {
        p.vy += .34; p.vx *= .985; p.vy *= .985; p.x += p.vx; p.y += p.vy; p.rot += p.vr;
        const glint = (Math.sin(p.rot * 2.3 + p.life * .15) + 1) / 2, c = p.c, m = .35 + glint * .65, a = Math.min(1, (1 - k) * 1.6);
        g.save(); g.translate(p.x, p.y); g.rotate(p.rot); g.globalAlpha = a;
        g.fillStyle = `rgb(${c[0] + (255 - c[0]) * m * .6 | 0},${c[1] + (255 - c[1]) * m * .6 | 0},${c[2] + (255 - c[2]) * m * .6 | 0})`;
        g.beginPath(); p.pts.forEach(([px, py], j) => j ? g.lineTo(px, py) : g.moveTo(px, py)); g.closePath(); g.fill();
        // светлая грань — одна из сторон к центру
        g.fillStyle = `rgba(255,255,255,${.25 + glint * .6})`; g.beginPath(); g.moveTo(0, 0); g.lineTo(p.pts[0][0], p.pts[0][1]); g.lineTo(p.pts[1][0], p.pts[1][1]); g.closePath(); g.fill();
        if (glint > .86) { g.globalAlpha = a * (glint - .86) * 7; g.drawImage(FXC.star, -12, -12, 24, 24); }
        g.restore();
      } else {
        if (p.t === 'spark') { p.vy += .12; p.vx *= .96; p.vy *= .96; } p.x += p.vx; p.y += p.vy; p.rot += .02;
        const a = p.t === 'twinkle' ? Math.sin(k * Math.PI) : (1 - k), s = p.s * (p.t === 'twinkle' ? .6 + Math.sin(k * Math.PI) * .6 : 1);
        g.save(); g.globalAlpha = Math.max(0, a); g.translate(p.x, p.y); g.rotate(p.rot); g.drawImage(FXC.star, -s / 2, -s / 2, s, s); g.restore();
      }
    }
    if (P.length || FXC.ambient) FXC.raf = requestAnimationFrame(fxLoop); else { FXC.raf = 0; g.clearRect(0, 0, FXC.w, FXC.h); }
  }

  // ---------- 1) стрелка в алмазе: колесо кристаллизуется ----------
  async function hit(wheel, fast) {
    const badge = wheel.querySelector('.upg-dia'), r = (badge || wheel).getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
    wheel.classList.add('dia-hit');
    const pct = wheel.querySelector('.upg-pct'), lab = wheel.querySelector('.upg-label');
    if (pct) { pct.dataset.was = pct.textContent; pct.textContent = 'АЛМАЗ'; }
    if (lab) lab.textContent = 'дроп ×1.5–4';
    const fl = document.createElement('div'); fl.className = 'dd-dia-flash'; fl.style.setProperty('--x', x + 'px'); fl.style.setProperty('--y', y + 'px'); document.body.appendChild(fl);
    for (let i = 0; i < 3; i++) { const w = document.createElement('div'); w.className = 'dd-dia-wave'; w.style.left = x + 'px'; w.style.top = y + 'px'; w.style.animationDelay = i * 0.12 + 's'; document.body.appendChild(w); setTimeout(() => w.remove(), 1400); }
    setTimeout(() => fl.remove(), 900);
    shards(x, y, 46, 1.1, true);
    boom(.28); chime(1568, .14); chime(2349, .08, .06); noise(.4, .09, 0, 7000, 2600, .7);
    FX.haptic('heavy'); setTimeout(() => FX.haptic('success'), 120);
    await wait(fast ? 650 : 1150);
  }
  function unhit(wheel) {
    wheel.classList.remove('dia-hit');
    const pct = wheel.querySelector('.upg-pct'), lab = wheel.querySelector('.upg-label');
    if (pct && pct.dataset.was) pct.textContent = pct.dataset.was; if (lab) lab.textContent = 'шанс апгрейда';
  }

  // ---------- 2) сцена «Алмазный дроп»: 3D-барабан ----------
  // цвет карточки по тому, во сколько раз NFT дороже цели: синий → фиолетовый → розовый → золотой
  const TIERS = [[2, '61,139,255'], [2.75, '163,91,255'], [3.5, '255,79,168'], [Infinity, '255,198,26']];
  function card(g, target) {
    const m = g.value / target.value, c = TIERS.find(x => m < x[0])[1];
    return `<div class="dd-dc" style="--c:rgb(${c});--cg:rgba(${c},.5)"><div class="dd-dc-in"><img src="${esc(g.image)}" alt="" decoding="async" draggable="false">
      <div class="dd-dc-info"><div class="dd-dc-name">${esc(g.name)}</div><div class="dd-dc-val">${STAR} ${fmt(g.value)}</div></div>
      <div class="dd-dc-x">×${m.toFixed(1).replace('.', ',')}</div></div><i class="dd-dc-shade"></i></div>`;
  }
  function strip(pool, prize, n, at) {
    // перед выигрышем (сверху — он «подъедет» следующим) кладём самый дорогой: чуть-чуть не хватило
    const out = [], rnd = () => pool[Math.random() * pool.length | 0];
    for (let i = 0; i < n; i++) out.push(rnd());
    out[at] = prize;
    if (pool.length > 1) {
      const top = pool[pool.length - 1], alt = pool.filter(g => g.id !== prize.id);
      out[at - 1] = top.id !== prize.id ? top : alt[alt.length - 1];
      out[at + 1] = alt[Math.random() * alt.length | 0];
      for (let i = 1; i < n; i++) if (out[i].id === out[i - 1].id && i !== at && i - 1 !== at) out[i] = alt[Math.random() * alt.length | 0] || out[i];
    }
    return out;
  }
  async function preload(urls) { await Promise.all([...new Set(urls)].map(u => new Promise(r => { const i = new Image(); i.onload = i.onerror = () => (i.decode ? i.decode().catch(() => { }) : Promise.resolve()).then(r); i.src = u; setTimeout(r, 2500); }))); }

  async function scene(dia, target, fast) {
    const prize = dia.prize, pool = dia.pool && dia.pool.length ? dia.pool : [prize];
    const lo = pool[0].value, hi = pool[pool.length - 1].value;
    const AT = 4, SPIN = fast ? 22 : 34, N = AT + SPIN + 5, items = strip(pool, prize, N, AT);
    await preload(items.map(g => g.image).concat(GEM));

    const ov = document.createElement('div'); ov.className = 'dd-dia' + (fast ? ' fast' : '');
    const title = 'АЛМАЗНЫЙ ДРОП'.split('').map((ch, i) => `<span style="--i:${i}">${ch === ' ' ? '&nbsp;' : ch}</span>`).join('');
    ov.innerHTML = `
      <div class="dd-dia-bg"><i class="b1"></i><i class="b2"></i><i class="b3"></i></div>
      <div class="dd-dia-beams"></div>
      <div class="dd-dia-stage">
        <div class="dd-dia-head">
          <div class="dd-dia-gem"><i class="halo"></i><img src="${GEM}" alt=""><b class="glint"></b></div>
          <div class="dd-dia-title">${title}</div>
          <div class="dd-dia-sub">NFT в 1,5–4 раза дороже цели · ${STAR} ${fmt(lo)}${hi !== lo ? ` – ${fmt(hi)}` : ''}</div>
        </div>
        <div class="dd-dia-reel">
          <div class="dd-dia-burst"></div>
          <div class="dd-dia-drum">${items.map(g => card(g, target)).join('')}</div>
          <div class="dd-dia-glow"></div><div class="dd-dia-frame"><i></i></div>
          <i class="dd-dia-mark l"></i><i class="dd-dia-mark r"></i>
          <div class="dd-dia-speed"></div>
        </div>
        <div class="dd-dia-res">
          <div class="dd-dia-res-name">${esc(prize.name)}</div>
          <div class="dd-dia-res-row"><span class="dd-dia-res-val">${STAR} <b>0</b></span><span class="dd-dia-res-x">×${(prize.value / target.value).toFixed(2).replace('.', ',')} к цели</span></div>
          <div class="dd-dia-res-note">${dia.test ? 'тест админа · ' : ''}уже в инвентаре</div>
        </div>
        <button class="dd-dia-ok" type="button">Забрать</button>
      </div>`;
    document.body.appendChild(ov); document.body.style.overflow = 'hidden';
    setTimeout(() => document.body.classList.add('dd-dia-open'), 450);
    const reel = ov.querySelector('.dd-dia-reel'), cards = [...ov.querySelectorAll('.dd-dc')], gem = ov.querySelector('.dd-dia-gem'), frame = ov.querySelector('.dd-dia-frame');
    const marks = ov.querySelectorAll('.dd-dia-mark'), speed = ov.querySelector('.dd-dia-speed'), glowEl = ov.querySelector('.dd-dia-glow'), shades = cards.map(c => c.querySelector('.dd-dc-shade'));
    const beams = ov.querySelector('.dd-dia-beams').animate([{ transform: 'rotate(0deg)' }, { transform: 'rotate(360deg)' }], { duration: 24000, iterations: Infinity });

    // барабан: карточка k на угле (k − p)·α; радиус подобран так, чтобы соседние карточки стыковались
    const H = cards[0].offsetHeight, A = 32 * Math.PI / 180, R = H / (2 * Math.tan(A / 2)) * 1.04;
    let shown = new Set();
    function place(p) {
      const lo2 = Math.max(0, Math.floor(p - 3)), hi2 = Math.min(N - 1, Math.ceil(p + 3)), now = new Set();
      for (let k = lo2; k <= hi2; k++) {
        const u = k - p, th = u * A; if (Math.abs(th) > 1.62) continue;
        const el = cards[k]; now.add(k);
        el.style.transform = `translate3d(-50%,-50%,0) translate3d(0,${(R * Math.sin(th)).toFixed(1)}px,${(R * (Math.cos(th) - 1)).toFixed(1)}px) rotateX(${(-th).toFixed(4)}rad)`;
        el.style.opacity = Math.min(1, (1.62 - Math.abs(th)) / .62).toFixed(3);          // край барабана гаснет
        shades[k].style.opacity = Math.min(.9, (1 - Math.cos(th)) * 1.5).toFixed(3);      // глубина
      }
      for (const k of shown) if (!now.has(k)) cards[k].style.visibility = 'hidden';
      for (const k of now) if (!shown.has(k)) cards[k].style.visibility = 'visible';
      shown = now;
    }
    const P0 = AT + SPIN; place(P0);

    requestAnimationFrame(() => ov.classList.add('on'));
    FXC.ambient = 1; fxCanvas();
    noise(.7, .07, 0, 300, 3200, .9); pad([523.25, 659.25, 783.99], 2.6, .035);
    await wait(fast ? 380 : 900);

    // прокрутка: замах вверх → разгон → долгое торможение → проскок на треть карточки → возврат
    const T1 = fast ? 2300 : 5200, T0 = 260, T2 = 560, over = 0.36 + Math.random() * 0.12;
    let lastIdx = Math.round(P0), lastP = P0, lastT = performance.now();
    await new Promise(done => {
      const t0 = performance.now();
      (function f(now) {
        const t = now - t0; let p;
        if (t < T0) { const k = t / T0; p = P0 + 0.3 * Math.sin(k * Math.PI / 2); }
        else if (t < T0 + T1) { const k = (t - T0) / T1, e = 1 - Math.pow(1 - k, 4.2); p = P0 + 0.3 - (P0 + 0.3 - (AT - over)) * e; }
        else if (t < T0 + T1 + T2) { const k = (t - T0 - T1) / T2, e = 1 - Math.pow(1 - k, 3) * Math.cos(k * 2.2); p = AT - over + over * Math.min(1.04, e); }
        else p = AT;
        place(p);
        const idx = Math.round(p), dt = Math.max(1, now - lastT), v = Math.abs(p - lastP) / dt * 1000;
        if (idx !== lastIdx) { lastIdx = idx; glass(idx); marks.forEach(m => m.animate([{ transform: 'translateY(-50%) scale(1.5)', opacity: 1 }, { transform: 'translateY(-50%) scale(1)', opacity: .75 }], { duration: 160 }));
          glowEl.animate([{ opacity: 1 }, { opacity: .55 }], { duration: 220 }); }
        speed.style.opacity = Math.min(.9, v / 26).toFixed(2); beams.playbackRate = 1 + Math.min(14, v / 3);
        lastP = p; lastT = now;
        if (t < T0 + T1 + T2) requestAnimationFrame(f); else { place(AT); done(); }
      })(t0);
    });

    // ---------- 3) выигрыш ----------
    beams.playbackRate = 1; speed.style.opacity = 0;
    ov.classList.add('done');
    const win = cards[AT]; win.classList.add('win');
    cards.forEach((c, k) => { if (k !== AT) c.classList.add('out'); });
    win.animate([{ transform: 'translate3d(-50%,-50%,0) scale(1)' }, { transform: 'translate3d(-50%,-50%,0) scale(1.16)' }, { transform: 'translate3d(-50%,-50%,0) scale(1.08)' }],
      { duration: 700, easing: 'cubic-bezier(.34,1.56,.64,1)', fill: 'forwards' });
    frame.animate([{ opacity: 1, transform: 'translate(-50%,-50%) scale(1)' }, { opacity: 0, transform: 'translate(-50%,-50%) scale(1.25)' }], { duration: 600, easing: 'ease-out', fill: 'forwards' });
    glowEl.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 600, fill: 'forwards' });
    const rr = reel.getBoundingClientRect(), cx = rr.left + rr.width / 2, cy = rr.top + rr.height / 2;
    for (let i = 0; i < 3; i++) { const w = document.createElement('div'); w.className = 'dd-dia-wave'; w.style.left = cx + 'px'; w.style.top = cy + 'px'; w.style.animationDelay = i * 0.14 + 's'; document.body.appendChild(w); setTimeout(() => w.remove(), 1500); }
    shards(cx, cy, 64, 1.25); twinkle(lite ? 8 : 18, { x: rr.left, y: rr.top, w: rr.width, h: rr.height });
    gem.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.35) rotate(-8deg)' }, { transform: 'scale(1)' }], { duration: 650, easing: 'cubic-bezier(.34,1.56,.64,1)' });
    boom(.32); [1, 1.26, 1.5, 2, 2.52].forEach((r, i) => chime(1046.5 * r, .1, i * .075)); pad([1046.5, 1318.5, 1568, 2093], 3, .04, .1);
    FX.haptic('heavy'); setTimeout(() => FX.haptic('success'), 140);
    if (FX.confetti) FX.confetti('#7df4ff', lite ? 90 : 170, .45, ['#7df4ff', '#ffffff', '#bfefff', '#a98bff', '#5fd8ff']);
    const vb = ov.querySelector('.dd-dia-res-val b'), t0 = performance.now(), from = target.value;
    (function cnt(now) { const k = Math.min(1, (now - t0) / 1100); vb.textContent = fmt(from + (prize.value - from) * (1 - Math.pow(1 - k, 3))); if (k < 1) requestAnimationFrame(cnt); })(t0);

    return new Promise(done => {
      let closed = false;
      const close = () => {
        if (closed) return; closed = true; ov.classList.add('bye'); FXC.ambient = 0; document.body.classList.remove('dd-dia-open');
        setTimeout(() => { beams.cancel(); ov.remove(); document.body.style.overflow = ''; done(); }, 320);
      };
      ov.querySelector('.dd-dia-ok').addEventListener('click', close);
    });
  }

  window.DDDiamond = { hit, unhit, scene, shards };
})();
