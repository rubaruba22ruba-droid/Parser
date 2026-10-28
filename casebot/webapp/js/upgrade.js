/* Drade Drop — Апгрейдер в стиле CaseBattle: ставишь подарки → выбираешь цель → стрелка на колесе решает. */
(function () {
  const STAR = '<svg viewBox="0 0 14 15" width="13" height="13" fill="#FFCA5A" style="vertical-align:-1px"><path d="M6.64 12.19 3.5 14.1a.69.69 0 0 1-1.03-.76l.48-1.9a2.7 2.7 0 0 1 1.29-1.58l3.42-1.64a.32.32 0 0 0-.2-.6l-3.8.65A2.7 2.7 0 0 1 1.5 7.7L.3 6.7a.69.69 0 0 1 .39-1.22l3.67-.29a.69.69 0 0 0 .58-.42L6.36 1.34a.69.69 0 0 1 1.28 0l1.42 3.42c.1.24.32.4.58.42l3.69.29a.69.69 0 0 1 .4 1.22l-2.82 2.4a.69.69 0 0 0-.22.69l.87 3.6a.69.69 0 0 1-1.03.75l-3.16-1.94a.69.69 0 0 0-.72 0z"/></svg>';
  const C = 2 * Math.PI * 104;
  const st = { inv: [], gifts: [], sel: [], target: null, tab: 'inv', spinning: false, angle: 0, cfg: { factor: 0.9, maxChance: 0.75, maxItems: 6 } };
  const $ = id => document.getElementById(id);
  const fmt = n => Number(n || 0).toLocaleString('ru-RU');
  const hdr = () => ({ 'Content-Type': 'application/json', 'X-Telegram-Init-Data': (window.Telegram && Telegram.WebApp.initData) || '' });
  const selItems = () => st.inv.filter(i => st.sel.includes(i.id));
  const stake = () => selItems().reduce((s, i) => s + i.item_value, 0);
  const NOZ = { c: 0, d: 0, d0: 0, pool: [] };
  // зоны колеса: зелёная [0,c) — цель, алмаз [d0, d0+d) внизу — NFT в 1.5–4× дороже цели (формула — js/diamond.js)
  const zonesFor = (v, value) => v && value && window.DDZones ? DDZones(v, value, st.gifts, st.cfg) : NOZ;
  const zones = () => st.target ? zonesFor(stake(), st.target.value) : NOZ;
  const chance = () => zones().c;
  function drawZones(z) {
    const dA = $('upgDiaArc'), dG = $('upgDiaGlow'), badge = $('upgDiaBadge'), on = z.d > 0;
    [dA, dG].forEach(e => { if (!e) return; e.style.display = on ? '' : 'none';
      if (on) { e.setAttribute('stroke-dasharray', `${(C * z.d).toFixed(2)} ${C.toFixed(1)}`); e.setAttribute('stroke-dashoffset', (-C * z.d0).toFixed(2)); } });
    if (badge) { badge.hidden = !on; if (on) { const a = (z.d0 + z.d / 2) * 2 * Math.PI; badge.style.left = (50 + 43.33 * Math.sin(a)).toFixed(2) + '%'; badge.style.top = (50 - 43.33 * Math.cos(a)).toFixed(2) + '%'; } }
    const dp = $('upgDiaPct'); if (dp) dp.textContent = on ? `💎 алмаз ${(z.d * 100).toFixed(2)}%` : '';
  }

  function ticks() {
    const g = $('upgTicks'); if (!g || g.childElementCount) return;
    for (let i = 0; i < 72; i++) {
      const a = i * 5 * Math.PI / 180, r1 = i % 6 ? 88 : 84, r2 = 92;
      const l = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      l.setAttribute('x1', 120 + r1 * Math.sin(a)); l.setAttribute('y1', 120 - r1 * Math.cos(a)); l.setAttribute('x2', 120 + r2 * Math.sin(a)); l.setAttribute('y2', 120 - r2 * Math.cos(a));
      l.setAttribute('class', i % 6 ? 'upg-tick' : 'upg-tick upg-tick-big'); g.appendChild(l);
    }
  }
  function paint() {
    const z = zones(), c = z.c;
    $('upgArc').setAttribute('stroke-dasharray', `${(C * c).toFixed(1)} ${C.toFixed(1)}`);
    drawZones(z);
    $('upgPct').textContent = (c * 100).toFixed(2) + '%';
    const items = selItems(), v = stake();
    $('upgFromBody').innerHTML = items.length
      ? `<div class="upg-stack upg-n${Math.min(items.length, 4)}">${items.slice(0, 4).map(i => `<img src="${i.item_image}" alt="">`).join('')}</div>${items.length > 4 ? `<div class="upg-more">+${items.length - 4}</div>` : ''}`
      : '<div class="upg-empty">Выбери подарки<br>из инвентаря ↓</div>';
    $('upgFromVal').innerHTML = v ? `${STAR} ${fmt(v)}` : '';
    const t = st.target;
    $('upgToBody').innerHTML = t ? `<img class="upg-target-img" src="${t.image}" alt=""><div class="upg-target-name">${t.name}</div>` : '<div class="upg-empty">Выбери<br>подарок ↓</div>';
    $('upgToVal').innerHTML = t ? `${STAR} ${fmt(t.value)}${v ? ` <span class="upg-x">x${(t.value / v).toFixed(2)}</span>` : ''}` : '';
    $('upgGo').disabled = !(v && t) || st.spinning;
    $('upgGo').textContent = st.spinning ? 'Крутим…' : (v && t ? `Улучшить · ${(c * 100).toFixed(1)}%` : 'Улучшить');
    $('upgWheel').style.setProperty('--chance', c);
  }
  function grid() {
    const g = $('upgGrid'); if (!g) return;
    document.querySelectorAll('.upg-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === st.tab));
    if (st.tab === 'inv') {
      if (!st.inv.length) { g.innerHTML = '<div class="upg-none">Инвентарь пуст — открой кейс, чтобы было что улучшать</div>'; return; }
      g.innerHTML = st.inv.map(i => `<button class="upg-item r-${i.rarity || 'common'} ${st.sel.includes(i.id) ? 'on' : ''}" data-id="${i.id}">
        <img src="${i.item_image}" alt="" loading="lazy"><span class="n">${i.item_name}</span><span class="v">${STAR} ${fmt(i.item_value)}</span><i class="chk"></i></button>`).join('');
    } else {
      const v = stake();
      const list = st.gifts.filter(x => x.kind !== 'regular' && (!v || (x.value > v && x.value <= v * 100))).sort((a, b) => a.value - b.value);
      g.innerHTML = list.length ? list.map(x => {
        const z = zonesFor(v, x.value);
        return `<button class="upg-item ${st.target && st.target.id === x.id ? 'on' : ''}" data-gift="${x.id}"><img src="${x.image}" alt="" loading="lazy"><span class="n">${x.name}</span><span class="v">${STAR} ${fmt(x.value)}</span>${v ? `<span class="c">${(z.c * 100).toFixed(1)}%${z.d ? ' 💎' : ''}</span>` : ''}</button>`;
      }).join('') : '<div class="upg-none">Нет подарков дороже ставки</div>';
    }
  }
  function onGrid(e) {
    const b = e.target.closest('.upg-item'); if (!b || st.spinning) return;
    if (b.dataset.id) {
      const id = Number(b.dataset.id), k = st.sel.indexOf(id);
      if (k >= 0) st.sel.splice(k, 1); else if (st.sel.length < st.cfg.maxItems) st.sel.push(id); else return showAlert(`Максимум ${st.cfg.maxItems} подарков в ставке`);
      if (st.target && st.target.value <= stake()) st.target = null;
    } else st.target = st.gifts.find(x => x.id === b.dataset.gift) || null;
    FX.haptic('light'); paint(); grid();
  }
  function mult(m) {
    const v = stake(); if (!v) { st.tab = 'inv'; grid(); return showAlert('Сначала выбери подарки для ставки'); }
    const want = v * m, cand = st.gifts.filter(x => x.kind !== 'regular' && x.value > v);
    if (!cand.length) return showAlert('Нет подарков дороже ставки');
    st.target = cand.reduce((a, b) => Math.abs(Math.log(b.value / want)) < Math.abs(Math.log(a.value / want)) ? b : a);
    document.querySelectorAll('#upgMults button').forEach(b => b.classList.toggle('on', Number(b.dataset.m) === m));
    FX.haptic('medium'); paint(); st.tab = 'gifts'; grid();
  }

  // Стрелка делает 5+ оборотов и встаёт ровно на roll (0..1 по кругу от верхней точки).
  // Звук — как у ленты кейса: щелчок на каждой крупной отметке (через 30°), к концу всё реже, в конце — «тук».
  // быстрая крутка: 2 оборота за 1.4 с вместо 5 оборотов за 6 с (выбор запоминается)
  let fast = false; try { fast = localStorage.getItem('dd_fast') === '1'; } catch (e) { }
  function setFast(v) { fast = v; try { localStorage.setItem('dd_fast', v ? '1' : '0'); } catch (e) { } const b = $('upgFast'); if (b) { b.classList.toggle('on', v); b.setAttribute('aria-pressed', v); } }
  function spin(roll) {
    return new Promise(res => {
      const turns = fast ? 2 : 5, dur = fast ? 1400 : 6000;
      const needle = $('upgNeedle'), from = st.angle % 360, to = from + 360 * turns + ((roll * 360 - from) % 360 + 360) % 360, t0 = performance.now();
      const marks = document.querySelectorAll('#upgTicks .upg-tick-big');
      let lastTick = Math.floor(from / 30), lit = null;
      const ease = t => 1 - Math.pow(1 - t, 3.5);
      (function f(now) {
        const k = Math.min(1, (now - t0) / dur), a = from + (to - from) * ease(k);
        needle.style.transform = `rotate(${a.toFixed(2)}deg)`; st.angle = a;
        const tk = Math.floor(a / 30);
        if (tk !== lastTick) {
          lastTick = tk; FX.tick();
          if (lit) lit.classList.remove('lit'); lit = marks[((tk % 12) + 12) % 12]; if (lit) lit.classList.add('lit');
        }
        if (k < 1) requestAnimationFrame(f); else { if (lit) lit.classList.remove('lit'); FX.stop(0); res(); }
      })(t0);
    });
  }
  async function go() {
    if (st.spinning || !st.target || !stake()) return;
    st.spinning = true; paint(); const wheel = $('upgWheel'); wheel.classList.remove('win', 'lose'); wheel.classList.add('spinning');
    if (window.revealSpinner) revealSpinner(wheel);
    try {
      const r = await fetch('/api/upgrade', { method: 'POST', headers: hdr(), body: JSON.stringify({ inventoryItemIds: st.sel, targetGiftId: st.target.id }) });
      const d = await r.json(); if (!r.ok) throw new Error(d.error || 'Ошибка');
      if (d.zones) { drawZones(d.zones); $('upgArc').setAttribute('stroke-dasharray', `${(C * d.zones.c).toFixed(1)} ${C.toFixed(1)}`); }   // зоны — как посчитал сервер
      FX.whoosh(); await spin(d.roll);
      wheel.classList.remove('spinning');
      if (d.diamond && window.DDDiamond) {
        // алмаз: колесо кристаллизуется → сцена с барабаном NFT
        await DDDiamond.hit(wheel, fast);
        await DDDiamond.scene(d.diamond, st.target, fast);
        DDDiamond.unhit(wheel);
        showToast(`${d.diamond.prize.name} теперь в инвентаре`, 'success', { title: 'Алмаз! 💎' });
      } else {
        wheel.classList.add(d.win ? 'win' : 'lose');
        if (d.win) { FX.win('legendary'); FX.confetti('#ffc61a', 160, 0.3); $('upgToSlot').classList.add('won'); showToast(`${st.target.name} теперь в инвентаре`, 'success', { title: 'Залетело! 🔥' }); }
        else { FX.lose(); $('upgFromSlot').classList.add('burn'); if (!d.cashback) showToast('Подарки сгорели. Попробуй ещё', 'error', { title: 'Не зашло 😅' }); }
        await new Promise(r2 => setTimeout(r2, fast ? 600 : 1500));
        if (!d.win && d.cashback) await cashbackCrate(d.cashback);
      }
      $('upgToSlot').classList.remove('won'); $('upgFromSlot').classList.remove('burn'); wheel.classList.remove('win', 'lose');
      st.sel = []; st.target = null; await loadInv();
    } catch (e) { showAlert('⚠️ ' + e.message); wheel.classList.remove('spinning'); if (window.DDDiamond) DDDiamond.unhit(wheel); }
    st.spinning = false; paint(); grid();
  }

  // ---------- кешбек-кейс после слива: падает коробка, пыль, тряска, вспышка, приз ----------
  function cashbackCrate(cb) {
    return new Promise(done => {
      const ov = document.createElement('div'); ov.className = 'dd-cb';
      const prize = cb.type === 'gift'
        ? `<img class="dd-cb-gift" src="${cb.image}" alt=""><div class="dd-cb-name">${cb.name}</div><div class="dd-cb-val">${STAR} ${fmt(cb.value)} · в инвентаре</div>`
        : `<div class="dd-cb-stars">+${fmt(cb.value)} <span>⭐</span></div><div class="dd-cb-val">на баланс</div>`;
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

  // «тест алмаза» — только админу: его апгрейды встают в алмаз, чтобы посмотреть анимацию
  function testUI() {
    const b = $('upgDiaTest'); if (!b) return; b.hidden = !st.cfg.canTest;
    b.classList.toggle('on', !!st.cfg.test); b.textContent = `💎 Тест алмаза: ${st.cfg.test ? 'вкл' : 'выкл'}`;
  }
  async function toggleTest() {
    try {
      const r = await fetch('/api/upgrade/diamond-test', { method: 'POST', headers: hdr(), body: JSON.stringify({ on: !st.cfg.test }) });
      const d = await r.json(); if (!r.ok) throw new Error(d.error || 'Ошибка');
      st.cfg.test = d.test; testUI(); FX.haptic('medium');
      showToast(d.test ? 'Твои апгрейды встают в алмаз (цель — с алмазной зоной)' : 'Обычные честные броски', 'success', { title: d.test ? 'Тест алмаза включён' : 'Тест выключен' });
    } catch (e) { showAlert('⚠️ ' + e.message); }
  }

  async function loadInv() {
    const uid = window.Telegram && Telegram.WebApp.initDataUnsafe && Telegram.WebApp.initDataUnsafe.user && Telegram.WebApp.initDataUnsafe.user.id; if (!uid) return;
    const r = await fetch(`/api/inventory/${uid}`, { headers: hdr() }); if (r.ok) st.inv = await r.json();
    st.sel = st.sel.filter(id => st.inv.some(i => i.id === id));
  }
  let inited = false;
  async function init() {
    ticks();
    if (!inited) {
      inited = true;
      $('upgGrid').addEventListener('click', onGrid);
      document.querySelectorAll('.upg-tab').forEach(b => b.addEventListener('click', () => { st.tab = b.dataset.tab; grid(); }));
      document.querySelectorAll('#upgMults button').forEach(b => b.addEventListener('click', () => mult(Number(b.dataset.m))));
      $('upgGo').addEventListener('click', go);
      $('upgFast').addEventListener('click', () => { setFast(!fast); FX.haptic('light'); }); setFast(fast);
      $('upgFromSlot').addEventListener('click', () => { st.tab = 'inv'; grid(); });
      $('upgToSlot').addEventListener('click', () => { st.tab = 'gifts'; grid(); });
      $('upgDiaTest').addEventListener('click', toggleTest);
    }
    try {
      const [g, c] = await Promise.all([fetch('/api/gifts', { headers: hdr() }).then(r => r.json()), fetch('/api/upgrade/config', { headers: hdr() }).then(r => r.json())]);
      st.gifts = g; st.cfg = Object.assign(st.cfg, c);
    } catch (e) { }
    testUI();
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
