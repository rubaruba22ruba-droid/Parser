/* Drade Drop — апгрейд: формулы зон (те же, что server/diamond.mjs), искры/осколки и «барабан» в карточке цели (золото «?»).
   Барабан — как на видео: карточка цели превращается в вертикальную ленту NFT, у каждого своё свечение,
   лента тормозит и встаёт на выигрыше; затем вспышка, лучи и плашка «выше цели ×N». */
(function () {
  const STAR = '<svg class="ic-star" viewBox="0 0 14 15"><path d="M6.64 12.19 3.5 14.1a.69.69 0 0 1-1.03-.76l.48-1.9a2.7 2.7 0 0 1 1.29-1.58l3.42-1.64a.32.32 0 0 0-.2-.6l-3.8.65A2.7 2.7 0 0 1 1.5 7.7L.3 6.7a.69.69 0 0 1 .39-1.22l3.67-.29a.69.69 0 0 0 .58-.42L6.36 1.34a.69.69 0 0 1 1.28 0l1.42 3.42c.1.24.32.4.58.42l3.69.29a.69.69 0 0 1 .4 1.22l-2.82 2.4a.69.69 0 0 0-.22.69l.87 3.6a.69.69 0 0 1-1.03.75l-3.16-1.94a.69.69 0 0 0-.72 0z"/></svg>';
  const fmt = n => Math.round(Number(n) || 0).toLocaleString('ru-RU');
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const lite = matchMedia('(prefers-reduced-motion: reduce)').matches || (navigator.hardwareConcurrency || 8) <= 4;
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const byValue = (a, b) => a.value - b.value || (a.id < b.id ? -1 : 1);

  // ---------- зоны колеса и исход броска (копия server/diamond.mjs) ----------
  // вся выдача (цель/золото + кешбек-ящик при сливе) = ставка × factor; over — цель слишком близко к ставке
  function zones(stake, target, gifts, s) {
    const F = Number(s.factor), maxC = s.maxChance, mt = target / stake;
    const k = clamp(Number(s.cashbackRate) || 0, 0, F * 0.9), cN0 = (F - k) / (mt - k);
    const d = clamp(Number(s.diamondZone ?? 0.05), 0, 0.3), q0 = clamp(Number(s.diamondChance ?? 0.055), 0, 1);
    const lo = target * (s.diamondMin || 1.5), hi = target * (s.diamondMax || 4);
    const pool = d > 0 && q0 > 0 ? gifts.filter(g => g.kind !== 'regular' && g.value >= lo && g.value <= hi).sort(byValue) : [];
    const Z = (c, d, q, pool) => ({ c, d, q, w0: 0.5 - c / 2, d0: 0.5 - d / 2, pool, over: cN0 > maxC + 1e-9 });
    if (!pool.length) return Z(clamp(cN0, 0, maxC), 0, 0, []);
    const inv = pool.reduce((a, g) => a + 1 / g.value, 0), m = pool.length / inv / target;
    const q = Math.min(q0, 0.5 * cN0 / (d * m)), g = q * d * (m - 1), cN = cN0 - g * k / (mt - k);
    let c = cN - g;
    if (c < d) c = (cN - q * d * m) / (1 - q);
    return Z(clamp(c, 0, maxC), d, q, pool.map(g => ({ ...g, p: 1 / g.value / inv })));
  }
  zones.outcome = (z, x, y) => (z.d > 0 && y < z.q && x >= z.d0 && x < z.d0 + z.d) ? 'diamond' : (x >= z.w0 && x < z.w0 + z.c ? 'win' : 'lose');
  zones.pick = (pool, u) => { let a = 0; for (const g of pool) { a += g.p; if (u < a) return g; } return pool[pool.length - 1]; };
  window.DDZones = zones;

  // ---------- звук ----------
  function chime(base, vol, when) { [[1, 1.3], [2.76, .65], [5.4, .38], [8.93, .2]].forEach(([r, d], i) => FX.tone(base * r, d, 'sine', vol / (1 + i * 1.3), when || 0)); }
  let lastGlass = 0;
  function glass(k) { const now = performance.now(); if (now - lastGlass < 32) return; lastGlass = now; FX.tone(2500 + (k % 5) * 90 + Math.random() * 200, .05, 'sine', .07); FX.tone(5200 + Math.random() * 400, .025, 'sine', .02); FX.haptic('tick'); }
  function boom(vol) { FX.tone(120, .7, 'sine', vol || .3, 0, 36); if (FX.noise) FX.noise(.45, .08, 0, 900, 110, .8); }

  // ---------- частицы (один canvas поверх всего) ----------
  const P = { cv: null, g: null, list: [], raf: 0, w: 0, h: 0, star: null };
  const PAL = { ice: [[125, 244, 255], [191, 239, 255], [120, 150, 255], [95, 216, 255], [235, 250, 255]], gold: [[255, 214, 90], [255, 170, 40], [255, 240, 190], [255, 140, 30], [255, 255, 255]] };
  function canvas() {
    if (!P.star) {
      const s = document.createElement('canvas'); s.width = s.height = 64; const g = s.getContext('2d'), r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(.25, 'rgba(255,240,210,.7)'); r.addColorStop(1, 'rgba(255,200,120,0)'); g.fillStyle = r; g.fillRect(0, 0, 64, 64);
      g.fillStyle = '#fff'; g.beginPath(); g.moveTo(32, 0); g.lineTo(35, 29); g.lineTo(64, 32); g.lineTo(35, 35); g.lineTo(32, 64); g.lineTo(29, 35); g.lineTo(0, 32); g.lineTo(29, 29); g.fill(); P.star = s;
    }
    if (!P.cv || !P.cv.isConnected) { P.cv = document.createElement('canvas'); P.cv.className = 'dd-fx'; document.body.appendChild(P.cv); P.g = P.cv.getContext('2d'); P.w = 0; }
    const dpr = Math.min(1.25, devicePixelRatio || 1);
    if (P.w !== innerWidth || P.h !== innerHeight) { P.w = innerWidth; P.h = innerHeight; P.cv.width = innerWidth * dpr; P.cv.height = innerHeight * dpr; P.g.setTransform(dpr, 0, 0, dpr, 0, 0); }
    if (!P.raf) P.raf = requestAnimationFrame(loop);
  }
  function shards(x, y, n, power, pal) {
    canvas(); n = lite ? Math.round(n * .55) : n; const C = PAL[pal] || PAL.ice;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, v = (3 + Math.random() * 8) * (power || 1), k = 3 + (Math.random() * 2 | 0), r = 3 + Math.random() * 8, pts = [];
      for (let j = 0; j < k; j++) { const an = j / k * Math.PI * 2 + Math.random() * .9; pts.push([Math.cos(an) * r * (.5 + Math.random() * .7), Math.sin(an) * r * (.5 + Math.random() * .7)]); }
      P.list.push({ t: 'shard', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 2, rot: Math.random() * 6, vr: (Math.random() - .5) * .5, pts, c: C[i % C.length], life: 0, max: 60 + Math.random() * 45 });
    }
    for (let i = 0; i < n * .8; i++) { const a = Math.random() * Math.PI * 2, v = (2 + Math.random() * 9) * (power || 1); P.list.push({ t: 'spark', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 1.5, s: 6 + Math.random() * 14, life: 0, max: 35 + Math.random() * 45, rot: Math.random() * 3 }); }
  }
  function loop() {
    const g = P.g, L = P.list; g.clearRect(0, 0, P.w, P.h);
    for (let i = L.length - 1; i >= 0; i--) {
      const p = L[i]; p.life++; if (p.life > p.max) { L.splice(i, 1); continue; }
      const k = p.life / p.max;
      if (p.t === 'shard') {
        p.vy += .3; p.vx *= .985; p.x += p.vx; p.y += p.vy; p.rot += p.vr;
        const gl = (Math.sin(p.rot * 2.3 + p.life * .15) + 1) / 2, c = p.c, m = .35 + gl * .6;
        g.save(); g.translate(p.x, p.y); g.rotate(p.rot); g.globalAlpha = Math.min(1, (1 - k) * 1.6);
        g.fillStyle = `rgb(${c[0] + (255 - c[0]) * m * .6 | 0},${c[1] + (255 - c[1]) * m * .6 | 0},${c[2] + (255 - c[2]) * m * .6 | 0})`;
        g.beginPath(); p.pts.forEach(([px, py], j) => j ? g.lineTo(px, py) : g.moveTo(px, py)); g.closePath(); g.fill();
        g.fillStyle = `rgba(255,255,255,${.25 + gl * .55})`; g.beginPath(); g.moveTo(0, 0); g.lineTo(p.pts[0][0], p.pts[0][1]); g.lineTo(p.pts[1][0], p.pts[1][1]); g.closePath(); g.fill(); g.restore();
      } else {
        p.vy += .1; p.vx *= .96; p.vy *= .96; p.x += p.vx; p.y += p.vy; p.rot += .03;
        g.save(); g.globalAlpha = 1 - k; g.translate(p.x, p.y); g.rotate(p.rot); g.drawImage(P.star, -p.s / 2, -p.s / 2, p.s, p.s); g.restore();
      }
    }
    if (L.length) P.raf = requestAnimationFrame(loop); else { P.raf = 0; g.clearRect(0, 0, P.w, P.h); }
  }

  // ---------- барабан в карточке цели ----------
  // цвет свечения за NFT — по тому, во сколько раз он дороже ref (цели или ставки)
  const TIERS = [[0.6, '120,130,150'], [1, '61,139,255'], [1.6, '64,200,255'], [2.2, '163,91,255'], [3, '255,79,168'], [Infinity, '255,190,40']];
  const tier = m => TIERS.find(t => m < t[0])[1];
  function tile(g, ref) { const c = tier(g.value / ref); return `<div class="ur-tile" style="--g:${c}"><img src="${esc(g.image)}" alt="" decoding="async" draggable="false"></div>`; }
  async function preload(urls) { await Promise.all([...new Set(urls)].map(u => new Promise(r => { const i = new Image(); i.onload = i.onerror = () => (i.decode ? i.decode().catch(() => { }) : Promise.resolve()).then(r); i.src = u; setTimeout(r, 2000); }))); }

  // slot — .upg-slot-target; kind: 'gold'; prize {name,value,image}; ref — цена цели
  async function reel(slot, { pool, prize, ref, fast, kind }) {
    const box = slot.querySelector('.upg-reel'), N = fast ? 20 : 32, AT = N - 3;
    const list = []; for (let i = 0; i < N; i++) list.push(pool[Math.random() * pool.length | 0]);
    list[AT] = prize;
    if (pool.length > 1) {   // «чуть-чуть не хватило»: соседи выигрыша — самые дорогие из пула
      const top = [...pool].sort((a, b) => b.value - a.value), alt = top.filter(g => g.id !== prize.id);
      list[AT + 1] = alt[0]; list[AT - 1] = alt[Math.min(alt.length - 1, 1)] || alt[0];
    }
    await preload(list.map(g => g.image));
    box.innerHTML = `<div class="ur-track">${list.map(g => tile(g, ref)).join('')}</div><i class="ur-scale l"></i><i class="ur-scale r"></i><i class="ur-mark l"></i><i class="ur-mark r"></i><div class="ur-res"></div>`;
    box.hidden = false; slot.classList.add('reeling'); box.className = 'upg-reel ' + kind;
    const track = box.querySelector('.ur-track'), H = box.clientHeight, marks = box.querySelectorAll('.ur-mark');
    const tiles = track.children; for (const t of tiles) t.style.height = H + 'px';
    const end = AT * H, over = H * (.18 + Math.random() * .14), dur = fast ? 1900 : 3600 + Math.random() * 900;
    let last = -1;
    await new Promise(done => {
      const t0 = performance.now();
      (function f(now) {
        const k = Math.min(1, (now - t0) / dur);
        let y;
        if (k < 1) y = (end + over) * (1 - Math.pow(1 - k, 4));                    // разгон и долгое торможение с проскоком
        const t2 = now - t0 - dur, back = 380;
        if (k >= 1) y = end + over * Math.max(0, 1 - easeBack(Math.min(1, t2 / back)));
        track.style.transform = `translate3d(0,${-y.toFixed(1)}px,0)`;
        const idx = Math.round(y / H); if (idx !== last) { last = idx; glass(idx); marks.forEach(m => m.animate([{ opacity: 1, transform: 'translateY(-50%) scale(1.5)' }, { opacity: .8, transform: 'translateY(-50%) scale(1)' }], { duration: 150 })); }
        if (k < 1 || t2 < back) requestAnimationFrame(f); else { track.style.transform = `translate3d(0,${-end}px,0)`; done(); }
      })(t0);
    });
    // выигрыш: вспышка, лучи, плашка множителя
    const m = prize.value / ref, up = m >= 1;
    const win = tiles[AT]; win.classList.add('win');
    box.classList.add('done', up ? 'up' : 'down');
    box.querySelector('.ur-res').innerHTML = `<div class="ur-val">${STAR} ${fmt(prize.value)}</div>
      <div class="ur-chip">выше цели ×${m.toFixed(2).replace('.', ',')}</div><div class="ur-name">${esc(prize.name)}</div>`;
    const r = slot.getBoundingClientRect();
    shards(r.left + r.width / 2, r.top + r.height / 2, up ? 46 : 18, up ? 1 : .6, 'gold');
    if (up) { boom(.26); [1, 1.26, 1.5, 2].forEach((x, i) => chime(1046.5 * x, .09, i * .07)); FX.haptic('heavy'); setTimeout(() => FX.haptic('success'), 120); }
    else { FX.tone(660, .25, 'triangle', .08, 0, 520); FX.haptic('medium'); }
    await wait(fast ? 900 : 1500);
  }
  function easeBack(k) { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2); }
  function resetReel(slot) { const box = slot && slot.querySelector('.upg-reel'); if (!box) return; box.hidden = true; box.innerHTML = ''; box.className = 'upg-reel'; slot.classList.remove('reeling'); }

  window.DDFX = { shards, chime, boom, glass, reel, resetReel };
})();
