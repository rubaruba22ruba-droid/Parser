/* Drade Drop — Апгрейдер. Ставишь подарки → выбираешь цель → стрелка решает; всё везение внизу колеса.
   Иногда (≈5.5% прокруток) в середине зоны цели открывается золотая зона «?» — NFT в 1.5–4× дороже цели
   (барабан в карточке цели). Слил — падает кешбек-кейс, открывается и крутит «Бонус за смелость». */
(function () {
  const STAR = '<svg class="ic-star" viewBox="0 0 14 15"><path d="M6.64 12.19 3.5 14.1a.69.69 0 0 1-1.03-.76l.48-1.9a2.7 2.7 0 0 1 1.29-1.58l3.42-1.64a.32.32 0 0 0-.2-.6l-3.8.65A2.7 2.7 0 0 1 1.5 7.7L.3 6.7a.69.69 0 0 1 .39-1.22l3.67-.29a.69.69 0 0 0 .58-.42L6.36 1.34a.69.69 0 0 1 1.28 0l1.42 3.42c.1.24.32.4.58.42l3.69.29a.69.69 0 0 1 .4 1.22l-2.82 2.4a.69.69 0 0 0-.22.69l.87 3.6a.69.69 0 0 1-1.03.75l-3.16-1.94a.69.69 0 0 0-.72 0z"/></svg>';
  const R = 112, C = 2 * Math.PI * R;
  const st = { inv: [], gifts: [], sel: [], target: null, tab: 'inv', spinning: false, angle: 180,
    cfg: { factor: 0.97, maxChance: 0.8, maxItems: 6, cashbackRate: 0.08 } };
  const $ = id => document.getElementById(id);
  const fmt = n => Number(n || 0).toLocaleString('ru-RU');
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const hdr = () => ({ 'Content-Type': 'application/json', 'X-Telegram-Init-Data': (window.Telegram && Telegram.WebApp.initData) || '' });
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const selItems = () => st.inv.filter(i => st.sel.includes(i.id));
  const stake = () => selItems().reduce((s, i) => s + i.item_value, 0);
  const NOZ = { c: 0, d: 0, q: 0, w0: 0.5, d0: 0.5, pool: [] };
  const zonesFor = (v, value) => v && value && window.DDZones ? DDZones(v, value, st.gifts, st.cfg) : NOZ;
  const zones = () => st.target ? zonesFor(stake(), st.target.value) : NOZ;
  // цель годится: NFT дороже ставки, но не настолько близко, чтобы шанс был выше максимума (≈ ×1.2)
  const canTarget = (x, v) => x.kind !== 'regular' && x.value > v && x.value <= v * 100 && !zonesFor(v, x.value).over;
  const pctTxt = x => (x * 100).toFixed(2) + '%';
  const riskLabel = c => c >= .6 ? 'безопасно' : c >= .3 ? 'нормально' : 'рискованно';

  // ---------- колесо ----------
  function arc(el, len, from) { if (!el) return; el.setAttribute('stroke-dasharray', `${(C * len).toFixed(2)} ${(C + 1).toFixed(1)}`); el.setAttribute('stroke-dashoffset', (-C * from).toFixed(2)); }
  function drawWin(c) { const w0 = .5 - c / 2; arc($('upgArc'), c, w0); arc($('upgArcGlow'), c, w0); }
  // золотая зона — сегмент кольца [d0, d0+d) (по центру низа): тёмная заливка, золотая кромка, «?» и вспышка за ней
  const pt = (r, a) => `${(150 + r * Math.sin(a)).toFixed(2)} ${(150 - r * Math.cos(a)).toFixed(2)}`;
  function sector(a0, a1, ri, ro) { const big = a1 - a0 > Math.PI ? 1 : 0; return `M${pt(ro, a0)} A${ro} ${ro} 0 ${big} 1 ${pt(ro, a1)} L${pt(ri, a1)} A${ri} ${ri} 0 ${big} 0 ${pt(ri, a0)} Z`; }
  function drawGold(z, on) {
    const g = $('upgGold'), b = $('upgBurst'); if (!g) return;
    g.toggleAttribute('hidden', !on); $('upgWheel').classList.toggle('gold', !!on);   // у SVG нет свойства .hidden — только атрибут
    if (!on) { if (b) b.classList.remove('hold'); return; }
    const a0 = z.d0 * 2 * Math.PI, a1 = (z.d0 + z.d) * 2 * Math.PI, am = (a0 + a1) / 2;
    $('ugSeg').setAttribute('d', sector(a0, a1, 94, 130)); $('ugGlow').setAttribute('d', sector(a0 - .03, a1 + .03, 90, 134));
    $('ugEdge').setAttribute('d', `M${pt(95.5, a0 + .02)} A95.5 95.5 0 0 1 ${pt(95.5, a1 - .02)}`);
    const q = $('ugQ'), c = pt(112, am).split(' '); q.setAttribute('x', c[0]); q.setAttribute('y', c[1]);
    g.classList.remove('pop'); void g.getBoundingClientRect(); g.classList.add('pop');
    if (b) b.classList.add('hold');
  }
  function ticks() {
    const g = $('upgTicks'); if (!g || g.childElementCount) return;
    for (let i = 0; i < 72; i++) {
      if (i === 0 || i === 18 || i === 54) continue;   // там подписи 100 / 50 / 50
      const a = i * 5 * Math.PI / 180, big = i % 6 === 0, r1 = big ? 131 : 134, r2 = 139;
      const l = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      l.setAttribute('x1', 150 + r1 * Math.sin(a)); l.setAttribute('y1', 150 - r1 * Math.cos(a)); l.setAttribute('x2', 150 + r2 * Math.sin(a)); l.setAttribute('y2', 150 - r2 * Math.cos(a));
      l.setAttribute('class', big ? 'upg-tick upg-tick-big' : 'upg-tick'); g.appendChild(l);
    }
  }
  // вспышка света у низа колеса (появление «?», попадание)
  function burst(kind) {
    const b = $('upgBurst'); if (!b) return; const hold = b.classList.contains('hold');
    b.className = 'upg-burst ' + kind + (hold ? ' hold' : ''); void b.offsetWidth; b.classList.add('go');
  }

  // ---------- отрисовка ----------
  function paint() {
    const v = stake(), t = st.target, items = selItems(), wheel = $('upgWheel');
    const z = zones();
    if (!st.hold) {   // после прокрутки колесо и карточка цели держат результат до следующего действия
      drawWin(z.c); drawGold(z, false);
      $('upgPct').textContent = pctTxt(z.c);
      $('upgLabel').textContent = !v ? 'выбери ставку' : !t ? 'выбери цель' : riskLabel(z.c);
      $('upgToBody').innerHTML = t ? `<img class="upg-target-img" src="${esc(t.image)}" alt=""><div class="upg-target-name">${esc(t.name)}</div>` : '<div class="upg-empty">Выбери цель ↓</div>';
      $('upgToVal').innerHTML = t ? `<span>${STAR} ${fmt(t.value)}</span>${v ? `<span class="upg-x">x${(t.value / v).toFixed(2)}</span>` : ''}` : '';
    }
    $('upgGo').disabled = !(v && t) || st.spinning;
    $('upgGo').innerHTML = st.spinning ? 'Крутим…' : (v && t ? `Апгрейд <small>${pctTxt(z.c)}</small>` : 'Апгрейд');
    $('upgFromBody').innerHTML = items.length
      ? `<div class="upg-stack upg-n${Math.min(items.length, 4)}">${items.slice(0, 4).map(i => `<img src="${esc(i.item_image)}" alt="">`).join('')}</div>${items.length > 4 ? `<div class="upg-more">+${items.length - 4}</div>` : ''}`
      : '<div class="upg-empty">Выбери подарки ↓</div>';
    $('upgFromVal').innerHTML = v ? `<span>${STAR} ${fmt(v)}</span>${items.length > 1 ? `<span class="upg-x">${items.length} шт.</span>` : ''}` : '';
  }
  function grid() {
    const g = $('upgGrid'); if (!g) return;
    document.querySelectorAll('.upg-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === st.tab));
    if (st.tab === 'inv') {
      if (!st.inv.length) { g.innerHTML = '<div class="upg-none">Инвентарь пуст — открой кейс, чтобы было что улучшать</div>'; return; }
      g.innerHTML = st.inv.map(i => `<button class="upg-item r-${i.rarity || 'common'} ${st.sel.includes(i.id) ? 'on' : ''}" data-id="${i.id}">
        <img src="${esc(i.item_image)}" alt="" loading="lazy"><span class="n">${esc(i.item_name)}</span><span class="v">${STAR} ${fmt(i.item_value)}</span><i class="chk"></i></button>`).join('');
    } else {
      const v = stake();
      const list = st.gifts.filter(x => v ? canTarget(x, v) : x.kind !== 'regular').sort((a, b) => a.value - b.value);
      g.innerHTML = list.length ? list.map(x => {
        const z = zonesFor(v, x.value);
        return `<button class="upg-item ${st.target && st.target.id === x.id ? 'on' : ''}" data-gift="${x.id}"><img src="${esc(x.image)}" alt="" loading="lazy"><span class="n">${esc(x.name)}</span><span class="v">${STAR} ${fmt(x.value)}</span>${v ? `<span class="c">${pctTxt(z.c)}</span>` : ''}</button>`;
      }).join('') : '<div class="upg-none">Нет подходящих целей: нужен подарок минимум в ×1.2 дороже ставки</div>';
    }
  }
  function clearResult() {
    st.hold = false; if (window.DDFX) DDFX.resetReel($('upgToSlot'));
    $('upgWheel').classList.remove('win', 'lose', 'dia'); $('upgToSlot').classList.remove('won'); $('upgFromSlot').classList.remove('burn'); drawGold(NOZ, false);
  }
  function onGrid(e) {
    const b = e.target.closest('.upg-item'); if (!b || st.spinning) return;
    clearResult();
    if (b.dataset.id) {
      const id = Number(b.dataset.id), k = st.sel.indexOf(id);
      if (k >= 0) st.sel.splice(k, 1); else if (st.sel.length < st.cfg.maxItems) st.sel.push(id); else return showAlert(`Максимум ${st.cfg.maxItems} подарков в ставке`);
      if (st.target && !(stake() && canTarget(st.target, stake()))) st.target = null;
    } else st.target = st.gifts.find(x => x.id === b.dataset.gift) || null;
    FX.haptic('light'); paint(); grid();
  }
  function mult(m) {
    clearResult();
    const v = stake(); if (!v) { st.tab = 'inv'; grid(); return showAlert('Сначала выбери подарки для ставки'); }
    const want = v * m, cand = st.gifts.filter(x => canTarget(x, v));
    if (!cand.length) return showAlert('Нет подходящих целей: нужен подарок минимум в ×1.2 дороже ставки');
    st.target = cand.reduce((a, b) => Math.abs(Math.log(b.value / want)) < Math.abs(Math.log(a.value / want)) ? b : a);
    document.querySelectorAll('#upgMults button[data-m]').forEach(b => b.classList.toggle('on', Number(b.dataset.m) === m));
    FX.haptic('medium'); paint(); st.tab = 'gifts'; grid();
  }
  // ---------- прокрутка ----------
  // Каждый раз свой характер: число оборотов, длительность и «доводка» в конце разные — одна прокрутка быстрее,
  // другая дольше и ползёт к концу. Стрелка всё равно встаёт ровно на бросок сервера.
  let fast = false; try { fast = localStorage.getItem('dd_fast') === '1'; } catch (e) { }
  function setFast(v) { fast = v; try { localStorage.setItem('dd_fast', v ? '1' : '0'); } catch (e) { } const b = $('upgFast'); if (b) { b.classList.toggle('on', v); b.setAttribute('aria-pressed', v); } }
  function setSound(on) { if (FX.setMuted) FX.setMuted(!on); const b = $('upgSound'); if (b) { b.classList.toggle('off', !on); b.setAttribute('aria-pressed', on); } }
  function profile() {
    if (fast) return { turns: 1 + (Math.random() < .5 ? 1 : 0), dur: 1100 + Math.random() * 800, pow: 3 + Math.random() };
    const kinds = [{ turns: 3, dur: 3800, pow: 3 }, { turns: 4, dur: 5000, pow: 3.6 }, { turns: 5, dur: 6200, pow: 4.2 }, { turns: 6, dur: 7400, pow: 5 }];
    const k = kinds[Math.random() * kinds.length | 0];
    return { turns: k.turns, dur: k.dur * (.9 + Math.random() * .2), pow: k.pow };
  }
  // hook = { at: 0…1, fn } — вызвать один раз, когда прокрутка пройдёт эту долю времени (так золото появляется на ходу)
  function spin(roll, hook) {
    return new Promise(res => {
      const p = profile(), needle = $('upgNeedle'), from = st.angle % 360, to = from + 360 * p.turns + ((roll * 360 - from) % 360 + 360) % 360, t0 = performance.now();
      const marks = document.querySelectorAll('#upgTicks .upg-tick-big');
      let lastTick = Math.floor(from / 30), lastFine = Math.floor(from / 10), lit = null, lastA = from, lastT = t0, tickT = 0;
      const ease = t => 1 - Math.pow(1 - t, p.pow), wh = FX.whirr ? FX.whirr() : null;
      (function f(now) {
        const k = Math.min(1, (now - t0) / p.dur), a = from + (to - from) * ease(k);
        needle.style.transform = `rotate(${a.toFixed(2)}deg)`; st.angle = a;
        if (wh) wh.set(Math.min(1, (a - lastA) / Math.max(1, now - lastT) * 1000 / 1400));
        lastA = a; lastT = now;
        const fk = Math.floor(a / 10); if (fk !== lastFine) { lastFine = fk; if (now - tickT > 55) { tickT = now; FX.tick(); } }   // на разгоне не трещит
        if (hook && !hook.done && k >= hook.at) { hook.done = true; hook.fn(); }
        const tk = Math.floor(a / 30);
        if (tk !== lastTick) { lastTick = tk; if (lit) lit.classList.remove('lit'); lit = marks[((tk % 12) + 12) % 12]; if (lit) lit.classList.add('lit'); }
        if (k < 1) requestAnimationFrame(f); else { if (lit) lit.classList.remove('lit'); if (wh) wh.stop(); FX.stop(0); res(); }
      })(t0);
    });
  }
  async function go() {
    if (st.spinning) return;
    if (!(st.target && stake())) return;
    clearResult(); st.spinning = true; paint();
    const wheel = $('upgWheel'), body = { inventoryItemIds: st.sel, targetGiftId: st.target.id };
    try {
      const r = await fetch('/api/upgrade', { method: 'POST', headers: hdr(), body: JSON.stringify(body) });
      const d = await r.json(); if (!r.ok) throw new Error(d.error || 'Ошибка');
      await playUpgrade(d);
      st.hold = true; st.sel = []; st.target = null; await loadInv();
    } catch (e) { showAlert(e.message); clearResult(); }
    wheel.classList.remove('spinning'); st.spinning = false; paint(); grid();
    try { if (typeof loadBalance === 'function') loadBalance().then(() => updateBalance && updateBalance()); } catch (e) { }
  }
  async function playUpgrade(d) {
    const wheel = $('upgWheel'), z = d.zones || zones(), target = st.target;
    drawWin(z.c); wheel.classList.add('spinning');
    // редкая золотая зона «?» ловится уже на ходу: стрелка крутится, и через треть прокрутки внизу вспыхивает золото
    const gold = d.gold ? { at: (fast ? .18 : .22) + Math.random() * .16, fn() { drawGold(z, true); burst('gold'); FX.tone(1568, .5, 'sine', .07); FX.tone(2349, .4, 'sine', .04, .06); FX.haptic('medium'); } } : null;
    await spin(d.roll, gold);
    wheel.classList.remove('spinning');
    if (d.diamond) {
      wheel.classList.add('win', 'dia'); burst('dia'); $('upgLabel').textContent = 'золото!';
      const rr = wheel.getBoundingClientRect(); DDFX.shards(rr.left + rr.width / 2, rr.bottom - rr.height * .1, 50, 1.1, 'gold'); DDFX.boom(.28); FX.haptic('heavy');
      await wait(fast ? 350 : 700);
      await DDFX.reel($('upgToSlot'), { pool: d.diamond.pool, prize: d.diamond.prize, ref: target.value, fast, kind: 'gold' });
      showToast(`${d.diamond.prize.name} — в инвентаре`, 'success', { title: 'Золото «?» зашло' });
    } else if (d.win) {
      wheel.classList.add('win'); burst('win'); $('upgLabel').textContent = 'победа';
      FX.win('legendary'); FX.confetti('#ffc61a', 150, .32); $('upgToSlot').classList.add('won');
      showToast(`${target.name} — в инвентаре`, 'success', { title: 'Залетело' });
      await wait(fast ? 700 : 1400);
    } else {
      wheel.classList.add('lose'); $('upgLabel').textContent = 'мимо';
      FX.lose(); $('upgFromSlot').classList.add('burn');
      await wait(fast ? 500 : 1100);
      if (d.cashback) await playCrate(d.cashback, d.stake);
      else showToast('Подарки сгорели. Попробуй ещё', 'error', { title: 'Не зашло' });
    }
    $('upgFromSlot').classList.remove('burn');
  }
  // ---------- кешбек-кейс после слива ----------
  // основной — 3D-сцена (js/crate3d.js): ящик падает, открывается, крутится лента «Бонус за смелость»;
  // без WebGL — запасной 2D-ящик ниже
  let crateMod = null;
  const loadCrate = () => crateMod || (crateMod = import(new URL('js/crate3d.js?v=2', document.baseURI).href).catch(e => { crateMod = null; throw e; }));
  async function playCrate(cb, stakeValue) {
    try { const m = await loadCrate(); await m.play(cb, { fast, stake: stakeValue, gifts: st.gifts, rate: st.cfg.cashbackRate }); }
    catch (e) { console.warn('3D-кейс не запустился, показываю 2D', e); await cashbackCrate(cb); }
  }

  // ---------- запасной 2D-ящик (без WebGL) ----------
  function cashbackCrate(cb) {
    return new Promise(done => {
      const ov = document.createElement('div'); ov.className = 'dd-cb';
      const prize = cb.type === 'gift'
        ? `<img class="dd-cb-gift" src="${cb.image}" alt=""><div class="dd-cb-name">${cb.name}</div><div class="dd-cb-val">${STAR} ${fmt(cb.value)} · в инвентаре</div>`
        : `<div class="dd-cb-stars">+${fmt(cb.value)} ${STAR}</div><div class="dd-cb-val">на баланс</div>`;
      ov.innerHTML = `<div class="dd-cb-stage">
          <div class="dd-cb-title">Кешбек-кейс</div><div class="dd-cb-hint">слил — держи утешительный дроп</div>
          <div class="dd-cb-floor"></div><canvas class="dd-cb-dust"></canvas>
          <div class="dd-cb-rays"></div>
          <img class="dd-cb-box" src="images/gifts/gift-25.webp" alt="">
          <div class="dd-cb-prize">${prize}</div>
          <button class="dd-cb-ok" type="button">Забрать</button></div>`;
      document.body.appendChild(ov);
      const stage = ov.querySelector('.dd-cb-stage'), box = ov.querySelector('.dd-cb-box'), cv = ov.querySelector('.dd-cb-dust');
      const T = fast ? .55 : 1;   // в быстром режиме всё быстрее
      requestAnimationFrame(() => ov.classList.add('on'));
      // 1) падение с гравитацией и приземление со сплющиванием
      const fall = box.animate([{ transform: 'translateY(-115vh) rotate(-14deg)' }, { transform: 'translateY(0) rotate(4deg)' }],
        { duration: 620 * T, easing: 'cubic-bezier(.55,0,1,.45)', fill: 'forwards' });
      fall.onfinish = () => {
        box.animate([{ transform: 'translateY(0) rotate(4deg) scale(1.18,.78)' }, { transform: 'translateY(-26px) rotate(-2deg) scale(.94,1.08)' }, { transform: 'translateY(0) rotate(0) scale(1)' }],
          { duration: 520 * T, easing: 'cubic-bezier(.34,1.56,.64,1)', fill: 'forwards' });
        stage.animate([{ transform: 'translate(0,0)' }, { transform: 'translate(-7px,5px)' }, { transform: 'translate(6px,-4px)' }, { transform: 'translate(-3px,2px)' }, { transform: 'translate(0,0)' }], { duration: 320 });
        dust(cv); FX.tone && FX.tone(70, .35, 'sine', .3, 0, 40); FX.haptic('heavy');
        // 2) тряска с тиками
        setTimeout(() => {
          box.animate([{ transform: 'rotate(0)' }, { transform: 'rotate(-9deg) scale(1.04)' }, { transform: 'rotate(8deg) scale(1.06)' }, { transform: 'rotate(-7deg) scale(1.08)' }, { transform: 'rotate(6deg) scale(1.1)' }, { transform: 'rotate(0) scale(1.12)' }],
            { duration: 720 * T, easing: 'ease-in-out', fill: 'forwards' });
          [0, 180, 360, 540].forEach(t => setTimeout(() => { FX.tick(); FX.haptic('light'); }, t * T));
        }, 560 * T);
        // 3) вспышка: коробка лопается, приз выезжает
        setTimeout(() => {
          box.animate([{ transform: 'scale(1.12)', opacity: 1, filter: 'brightness(1)' }, { transform: 'scale(1.7)', opacity: 0, filter: 'brightness(2.6)' }], { duration: 360, easing: 'ease-in', fill: 'forwards' });
          ov.classList.add('open'); FX.whoosh();
          if (cb.type === 'gift') { FX.win('legendary'); FX.confetti('#ffc61a', 170, .45); } else { FX.win(cb.value >= 100 ? 'mythic' : 'rare'); FX.confetti('#ff9900', 70, .45); }
        }, (560 + 760) * T);
      };
      let closed = false;
      const close = () => { if (closed) return; closed = true; ov.classList.remove('on'); setTimeout(() => { ov.remove(); done(); }, 260);
        try { if (typeof loadBalance === 'function') loadBalance().then(() => updateBalance && updateBalance()); } catch (e) { } };
      ov.querySelector('.dd-cb-ok').addEventListener('click', close);
    });
  }
  // облако пыли при приземлении
  function dust(cv) {
    const r = cv.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1); cv.width = r.width * dpr; cv.height = r.height * dpr;
    const g = cv.getContext('2d'); g.scale(dpr, dpr);
    const cx = r.width / 2, cy = r.height * .74, P = [];
    for (let i = 0; i < 34; i++) { const s = (Math.random() < .5 ? -1 : 1); P.push({ x: cx + s * Math.random() * 30, y: cy - Math.random() * 10, vx: s * (1.5 + Math.random() * 4.5), vy: -(.3 + Math.random() * 1.6), r: 10 + Math.random() * 16, a: .55 + Math.random() * .3 }); }
    let t = 0;
    (function f() {
      g.clearRect(0, 0, r.width, r.height); t++;
      for (const p of P) { p.x += p.vx; p.y += p.vy; p.vx *= .95; p.vy *= .96; p.r += .55; p.a *= .968;
        const gr = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r); gr.addColorStop(0, `rgba(215,205,190,${p.a})`); gr.addColorStop(1, 'rgba(215,205,190,0)');
        g.fillStyle = gr; g.beginPath(); g.arc(p.x, p.y, p.r, 0, 7); g.fill(); }
      if (t < 110) requestAnimationFrame(f); else g.clearRect(0, 0, r.width, r.height);
    })();
  }

  // «тест золота» — только админу: его апгрейды встают в «?», чтобы посмотреть анимацию. На остальных не влияет.
  function testUI() {
    const b = $('upgDiaTest'); if (!b) return; b.hidden = !st.cfg.canTest;
    b.classList.toggle('on', !!st.cfg.test); b.textContent = `Тест золота «?»: ${st.cfg.test ? 'вкл' : 'выкл'}`;
  }
  async function toggleTest() {
    try {
      const r = await fetch('/api/upgrade/diamond-test', { method: 'POST', headers: hdr(), body: JSON.stringify({ on: !st.cfg.test }) });
      const d = await r.json(); if (!r.ok) throw new Error(d.error || 'Ошибка');
      st.cfg.test = d.test; testUI(); FX.haptic('medium');
      showToast(d.test ? 'Твои апгрейды встают в золото «?» (если для цели оно есть)' : 'Снова обычные честные броски', 'success', { title: d.test ? 'Тест золота включён' : 'Тест выключен' });
    } catch (e) { showAlert(e.message); }
  }

  async function loadInv() {
    const uid = window.Telegram && Telegram.WebApp.initDataUnsafe && Telegram.WebApp.initDataUnsafe.user && Telegram.WebApp.initDataUnsafe.user.id; if (!uid) return;
    const r = await fetch(`/api/inventory/${uid}`, { headers: hdr() }); if (r.ok) st.inv = await r.json();
    st.sel = st.sel.filter(id => st.inv.some(i => i.id === id));
  }
  let inited = false;
  async function init() {
    ticks(); $('upgNeedle').style.transform = `rotate(${st.angle}deg)`;
    if (!inited) {
      inited = true;
      $('upgGrid').addEventListener('click', onGrid);
      document.querySelectorAll('.upg-tab').forEach(b => b.addEventListener('click', () => { st.tab = b.dataset.tab; grid(); }));
      document.querySelectorAll('#upgMults button[data-m]').forEach(b => b.addEventListener('click', () => mult(Number(b.dataset.m))));
      $('upgGo').addEventListener('click', go);
      $('upgFast').addEventListener('click', () => { setFast(!fast); FX.haptic('light'); }); setFast(fast);
      $('upgSound').addEventListener('click', () => { setSound(FX.isMuted()); FX.haptic('light'); }); setSound(!FX.isMuted());
      $('upgFromSlot').addEventListener('click', () => { if (st.spinning) return; st.tab = 'inv'; grid(); });
      $('upgToSlot').addEventListener('click', () => { if (st.spinning) return; clearResult(); st.tab = 'gifts'; grid(); });
      $('upgDiaTest').addEventListener('click', toggleTest);
    }
    try {
      const [g, c] = await Promise.all([fetch('/api/gifts', { headers: hdr() }).then(r => r.json()), fetch('/api/upgrade/config', { headers: hdr() }).then(r => r.json())]);
      st.gifts = g; st.cfg = Object.assign(st.cfg, c);
    } catch (e) { }
    testUI();
    setTimeout(() => loadCrate().then(m => m.warm()).catch(() => { }), 1200);   // заранее: three.js и текстуры ящика
    await loadInv(); paint(); grid();
  }

  window.showUpgradeSection = function () {
    ['casesCategories', 'case-selection'].forEach(id => { const el = $(id); if (el) el.style.display = 'none'; });
    $('case-opening') && $('case-opening').classList.remove('active');
    ['profile-section', 'deposit-section', 'friends-section'].forEach(id => $(id) && $(id).classList.add('hidden'));
    const s = $('upgrade-section'); s.classList.remove('hidden'); s.style.display = 'block';
    ['liveDropFeed', 'starsBanner'].forEach(id => { const el = $(id); if (el) el.style.display = 'none'; });
    $('topNav').style.display = 'flex'; window.scrollTo(0, 0); init();
  };
  window.hideAllShowCases = function () { const s = $('upgrade-section'); if (s) { s.classList.add('hidden'); s.style.display = 'none'; } };
})();

// Админ-панель — окном поверх мини-аппа (iframe), без перехода со страницы:
// при переходе Telegram на некоторых клиентах теряет данные входа, и после «назад» мини-апп ломался
window.showAdminPanel = function () {
  if (document.getElementById('ddAdmin')) return;
  const ov = document.createElement('div'); ov.id = 'ddAdmin'; ov.className = 'dd-admin-ov';
  ov.innerHTML = '<iframe src="admin.html?embed=1" title="Админка"></iframe>';
  document.body.appendChild(ov); document.body.style.overflow = 'hidden';
  try { const bb = Telegram.WebApp.BackButton; bb.onClick(window.closeAdminPanel); bb.show(); } catch (e) { }
};
window.closeAdminPanel = function () {
  const ov = document.getElementById('ddAdmin'); if (ov) ov.remove(); document.body.style.overflow = '';
  try { const bb = Telegram.WebApp.BackButton; bb.offClick(window.closeAdminPanel); bb.hide(); } catch (e) { }
  try { loadBalance().then(() => updateBalance()); } catch (e) { }   // админ мог выдать себе баланс
};
