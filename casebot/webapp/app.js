const tg = window.Telegram?.WebApp; tg?.ready(); tg?.expand();
const initData = tg?.initData || ('dev:' + (new URLSearchParams(location.search).get('u') || 1));
let S = null, tab = 'cases', sel = new Set(), busy = false;
const $ = s => document.querySelector(s), view = $('#view');
const fmt = n => (Math.round(n * 100) / 100).toString();
const G = id => S.gifts.find(g => g.id === id);
const pct = p => p >= 0.1 ? (p * 100).toFixed(1) + '%' : p >= 0.001 ? (p * 100).toFixed(2) + '%' : '<0.1%';
const buzz = t => tg?.HapticFeedback?.impactOccurred?.(t || 'light');

async function api(name, body = {}) {
  const r = await fetch('/api/' + name, { method: 'POST', headers: { 'content-type': 'application/json', 'x-init-data': initData }, body: JSON.stringify(body) });
  const j = await r.json(); if (!r.ok) throw new Error(j.error || 'Ошибка'); return j;
}
function toast(t) { const el = $('#toast'); el.textContent = t; el.classList.add('show'); setTimeout(() => el.classList.remove('show'), 2200); }
function setUser(u) { S.user = u; $('#balv').textContent = fmt(u.balance); }
const card = (g, extra = '') => `<div class="it ${g.rarity}"><span class="e">${g.emoji}</span><span class="nm">${g.name}</span><span class="pv">${fmt(g.price)} TON</span>${extra}</div>`;

function renderCases() {
  view.innerHTML = `<h2>Кейсы</h2><div class="grid">${S.cases.map(c => `<div class="case" data-id="${c.id}"><span class="ico">${c.emoji}</span><div class="t">${c.title}</div><div class="n">${c.note}</div><span class="price">${c.price} TON</span></div>`).join('')}</div>`;
  view.querySelectorAll('.case').forEach(el => el.onclick = () => { buzz(); renderCase(el.dataset.id); });
}

function renderCase(id) {
  window.scrollTo(0, 0);
  const c = S.cases.find(x => x.id === id);
  const drops = [...c.drops].sort((a, b) => G(b.giftId).price - G(a.giftId).price);
  const best = G(drops[0].giftId), good = c.drops.filter(d => G(d.giftId).price >= c.price * 0.7).reduce((s, d) => s + d.p, 0);
  view.innerHTML = `<button class="back" id="bk">← Назад</button><h2>${c.emoji} ${c.title} — ${c.price} TON</h2>
  <div class="roulette" id="rl"><div class="pointer"></div><div class="strip" id="strip"></div></div>
  <div class="stats"><div class="stat"><b>70%</b>RTP</div><div class="stat"><b>${(good * 100).toFixed(0)}%</b>дроп ≥70% цены</div><div class="stat"><b>${fmt(best.price)}</b>макс. дроп TON</div></div>
  <div class="row"><button class="btn" id="o1">Открыть ×1 · ${c.price} TON</button><button class="btn sec" id="o5" style="flex:0 0 38%">×5</button></div>
  <h2>Что внутри</h2><div class="drops">${drops.map(d => card(G(d.giftId), `<span class="ch">${pct(d.p)}</span>`)).join('')}</div>`;
  $('#bk').onclick = renderCases;
  fillIdle(c);
  $('#o1').onclick = () => open(c, 1); $('#o5').onclick = () => open(c, 5);
}

const pick = c => { let x = Math.random(), a = 0; for (const d of c.drops) { a += d.p; if (x < a) return d.giftId; } return c.drops[0].giftId; };
function fillIdle(c) { // медленно дрейфующая лента, пока кейс не открыт
  const st = $('#strip'); st.style.transition = 'none'; st.style.transform = 'translateX(0)';
  st.innerHTML = Array.from({ length: 40 }, () => card(G(pick(c)))).join('');
  st.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-1100px)' }], { duration: 40000, iterations: Infinity });
}

async function open(c, count) {
  if (busy) return;
  if (S.user.balance + 1e-9 < c.price * count) { toast('Не хватает баланса — пополните'); return showDeposit(); }
  busy = true; $('#o1').disabled = $('#o5').disabled = true;
  let res; try { res = await api('open', { caseId: c.id, count }); } catch (e) { busy = false; $('#o1').disabled = $('#o5').disabled = false; return toast(e.message); }
  const wins = res.wins, first = G(wins[0].giftId);
  // лента: 60 случайных, выигрыш на позиции 48, случайное смещение внутри карточки
  const W = 110, N = 60, T = 48, st = $('#strip'), rl = $('#rl');
  st.getAnimations().forEach(a => a.cancel());
  st.style.transition = 'none'; st.style.transform = 'translateX(0)';
  st.innerHTML = Array.from({ length: N }, (_, i) => card(i === T ? first : G(pick(c)))).join('');
  const off = (Math.random() - .5) * 70, x = -(T * W + W / 2 - rl.clientWidth / 2 + off);
  st.getBoundingClientRect();
  st.style.transition = 'transform 6.2s cubic-bezier(.08,.62,.08,1)'; st.style.transform = `translateX(${x}px)`;
  let t = 0; const tick = setInterval(() => { buzz('light'); if (++t > 30) clearInterval(tick); }, 140);
  await new Promise(r => setTimeout(r, 6400)); clearInterval(tick);
  setUser(res.user); busy = false;
  showWins(wins, c);
}

function confetti(color) {
  for (let i = 0; i < 40; i++) { const e = document.createElement('i'); e.className = 'confetti'; e.style.left = Math.random() * 100 + 'vw';
    e.style.background = color; e.style.animationDuration = 1.8 + Math.random() * 1.6 + 's'; e.style.animationDelay = Math.random() * .4 + 's'; document.body.appendChild(e); setTimeout(() => e.remove(), 4000); }
}
const RC = { common: '#8b90a8', rare: '#3b9cff', epic: '#b04dff', legendary: '#ffb020' };
function showWins(wins, c) {
  const gs = wins.map(w => ({ ...w, g: G(w.giftId) })), total = gs.reduce((s, w) => s + w.g.price, 0), best = gs.reduce((a, b) => b.g.price > a.g.price ? b : a).g;
  confetti(RC[best.rarity]); buzz('heavy');
  const m = $('#modal'); m.classList.remove('hidden');
  m.innerHTML = `<div class="sheet ${best.rarity}"><div style="color:var(--mu)">Вам выпало</div>
    ${gs.length === 1 ? `<span class="win">${best.emoji}</span><h2>${best.name}</h2>` : `<div class="wins">${gs.map(w => card(w.g)).join('')}</div>`}
    <h2 style="color:${total >= c.price * gs.length ? 'var(--ok)' : 'var(--tx)'}">${fmt(total)} TON</h2>
    <div class="row"><button class="btn" id="sl">Продать за ${fmt(total)} TON</button><button class="btn sec" id="ke">Оставить</button></div></div>`;
  $('#ke').onclick = () => { m.classList.add('hidden'); fillIdle(c); };
  $('#sl').onclick = async () => { try { const r = await api('sell', { ids: wins.map(w => w.invId) }); setUser(r.user); toast('+' + fmt(r.sold) + ' TON'); } catch (e) { toast(e.message); } m.classList.add('hidden'); fillIdle(c); };
}

async function renderInv() {
  const r = await api('inventory'); setUser(r.user); sel.clear();
  const draw = () => {
    const total = r.items.filter(i => sel.has(i.id)).reduce((s, i) => s + i.value, 0);
    view.innerHTML = `<h2>Инвентарь</h2>` + (r.items.length ? `<div class="inv">${r.items.map(i => { const g = G(i.giftId); return `<div class="it ${g.rarity} ${sel.has(i.id) ? 'sel' : ''}" data-id="${i.id}"><span class="e">${g.emoji}</span><span class="nm">${g.name}</span><span class="pv">${fmt(i.value)} TON</span></div>`; }).join('')}</div>
    <div class="row" style="margin-top:14px"><button class="btn" id="sa">${sel.size ? 'Продать выбранные · ' + fmt(total) + ' TON' : 'Продать всё · ' + fmt(r.items.reduce((s, i) => s + i.value, 0)) + ' TON'}</button>${sel.size === 1 ? '<button class="btn sec" id="wd" style="flex:0 0 40%">Вывести</button>' : ''}</div>` : '<p style="color:var(--mu)">Пока пусто — откройте первый кейс 🎁</p>');
    view.querySelectorAll('.inv .it').forEach(el => el.onclick = () => { const id = +el.dataset.id; sel.has(id) ? sel.delete(id) : sel.add(id); buzz(); draw(); });
    $('#sa') && ($('#sa').onclick = async () => { const ids = sel.size ? [...sel] : r.items.map(i => i.id); const s = await api('sell', { ids }); setUser(s.user); toast('+' + fmt(s.sold) + ' TON'); renderInv(); });
    $('#wd') && ($('#wd').onclick = async () => { try { await api('withdraw', { id: [...sel][0] }); toast('Заявка на вывод создана'); renderInv(); } catch (e) { toast(e.message); } });
  };
  draw();
}

function showDeposit() {
  const u = S.user, m = $('#modal'); m.classList.remove('hidden');
  const link = `ton://transfer/${u.depositAddress}?text=${u.depositComment}`;
  m.innerHTML = `<div class="sheet"><h2>Пополнение TON</h2><p style="color:var(--mu)">Отправьте TON на адрес <b>обязательно с комментарием</b> — баланс зачислится автоматически (до минуты). Мин. ${u.minDeposit} TON.</p>
    <div style="text-align:left;color:var(--mu);font-size:12px">Адрес</div><code id="ad">${u.depositAddress}</code>
    <div style="text-align:left;color:var(--mu);font-size:12px">Комментарий (обязательно)</div><code id="cm">${u.depositComment}</code>
    <div class="row"><button class="btn sec" id="cp">Копировать адрес</button><button class="btn sec" id="cc">Копировать комм.</button></div><br>
    <a href="${link}"><button class="btn">Открыть кошелёк</button></a><br><button class="back" id="cl">Закрыть</button></div>`;
  const copy = (t, msg) => { navigator.clipboard?.writeText(t); toast(msg); buzz(); };
  $('#cp').onclick = () => copy(u.depositAddress, 'Адрес скопирован'); $('#cc').onclick = () => copy(u.depositComment, 'Комментарий скопирован');
  $('#cl').onclick = () => m.classList.add('hidden');
}

$('#bal').onclick = showDeposit;
document.querySelectorAll('nav button').forEach(b => b.onclick = () => { if (busy) return; document.querySelectorAll('nav button').forEach(x => x.classList.toggle('on', x === b)); tab = b.dataset.tab; tab === 'cases' ? renderCases() : renderInv(); });
api('init').then(d => { S = d; setUser(d.user); renderCases(); }).catch(e => view.innerHTML = `<p>Ошибка входа: ${e.message}. Откройте приложение из Telegram.</p>`);
