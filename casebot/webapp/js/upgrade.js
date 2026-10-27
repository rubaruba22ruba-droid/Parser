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
  const chance = () => { const v = stake(); return v && st.target ? Math.min(st.cfg.maxChance, v / st.target.value * st.cfg.factor) : 0; };

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
    const c = chance();
    $('upgArc').setAttribute('stroke-dasharray', `${(C * c).toFixed(1)} ${C.toFixed(1)}`);
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
        const ch = v ? Math.min(st.cfg.maxChance, v / x.value * st.cfg.factor) : 0;
        return `<button class="upg-item ${st.target && st.target.id === x.id ? 'on' : ''}" data-gift="${x.id}"><img src="${x.image}" alt="" loading="lazy"><span class="n">${x.name}</span><span class="v">${STAR} ${fmt(x.value)}</span>${v ? `<span class="c">${(ch * 100).toFixed(1)}%</span>` : ''}</button>`;
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

  function spin(roll) { // стрелка делает 6+ оборотов и останавливается ровно на roll (0..1 по кругу от верхней точки)
    return new Promise(res => {
      const needle = $('upgNeedle'), from = st.angle % 360, to = from + 360 * 6 + ((roll * 360 - from) % 360 + 360) % 360, dur = 5600, t0 = performance.now();
      let lastTick = Math.floor(from / 5);
      const ease = t => 1 - Math.pow(1 - t, 4.2);
      (function f(now) {
        const k = Math.min(1, (now - t0) / dur), a = from + (to - from) * ease(k);
        needle.style.transform = `rotate(${a}deg)`; st.angle = a;
        const tk = Math.floor(a / 5); if (tk !== lastTick) { lastTick = tk; FX.tick(); }
        if (k < 1) requestAnimationFrame(f); else res();
      })(t0);
    });
  }
  async function go() {
    if (st.spinning || !st.target || !stake()) return;
    st.spinning = true; paint(); const wheel = $('upgWheel'); wheel.classList.remove('win', 'lose'); wheel.classList.add('spinning');
    try {
      const r = await fetch('/api/upgrade', { method: 'POST', headers: hdr(), body: JSON.stringify({ inventoryItemIds: st.sel, targetGiftId: st.target.id }) });
      const d = await r.json(); if (!r.ok) throw new Error(d.error || 'Ошибка');
      FX.whoosh(); await spin(d.roll);
      wheel.classList.remove('spinning'); wheel.classList.add(d.win ? 'win' : 'lose');
      if (d.win) { FX.win('legendary'); FX.confetti('#4ade80', 160, 0.3); $('upgToSlot').classList.add('won'); showToast(`${st.target.name} теперь в инвентаре`, 'success', { title: 'Апгрейд удался!' }); }
      else { FX.lose(); $('upgFromSlot').classList.add('burn'); showToast('Подарки сгорели. Попробуй ещё', 'error', { title: 'Не повезло' }); }
      await new Promise(r2 => setTimeout(r2, 1700));
      $('upgToSlot').classList.remove('won'); $('upgFromSlot').classList.remove('burn'); wheel.classList.remove('win', 'lose');
      st.sel = []; st.target = null; await loadInv();
    } catch (e) { showAlert('⚠️ ' + e.message); wheel.classList.remove('spinning'); }
    st.spinning = false; paint(); grid();
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
      $('upgFromSlot').addEventListener('click', () => { st.tab = 'inv'; grid(); });
      $('upgToSlot').addEventListener('click', () => { st.tab = 'gifts'; grid(); });
    }
    try {
      const [g, c] = await Promise.all([fetch('/api/gifts', { headers: hdr() }).then(r => r.json()), fetch('/api/upgrade/config', { headers: hdr() }).then(r => r.json())]);
      st.gifts = g; st.cfg = Object.assign(st.cfg, c);
    } catch (e) { }
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
