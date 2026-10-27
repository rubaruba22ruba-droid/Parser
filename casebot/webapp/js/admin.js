/* Drade Drop — админ-панель (открывается из профиля в Mini App). */
(function () {
  const tg = window.Telegram && Telegram.WebApp;
  const initData = (tg && tg.initData) || window.__DEMO_INIT || '';
  const $ = id => document.getElementById(id), view = $('view');
  const fmt = n => Number(n || 0).toLocaleString('ru-RU');
  const pct = x => x == null ? '—' : (x * 100).toFixed(1) + '%';
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const toast = t => { const e = $('toast'); e.textContent = t; e.classList.add('on'); setTimeout(() => e.classList.remove('on'), 1800); };
  async function api(name, body) {
    const r = await fetch('/api/' + name, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Telegram-Init-Data': initData }, body: JSON.stringify(body || {}) });
    const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || 'Ошибка'); return j;
  }
  let data = null, tab = 'overview';

  const T = {
    async overview() {
      data = await api('admin/overview'); const s = data.stats;
      return `<div class="card"><h3>Сводка</h3><div class="grid2">
        <div class="kpi"><span>Игроки</span><b>${fmt(s.users)}</b><span>+${s.newUsers24h} за сутки</span></div>
        <div class="kpi"><span>Балансы игроков</span><b>${fmt(s.balances)} ⭐</b></div>
        <div class="kpi"><span>Депозиты 24ч</span><b>${s.deposits.d1.ton.toFixed(2)} TON</b><span>${s.deposits.d1.n} шт</span></div>
        <div class="kpi"><span>Депозиты 7д</span><b>${s.deposits.d7.ton.toFixed(2)} TON</b><span>всего ${s.deposits.all.ton.toFixed(2)} TON</span></div>
        <div class="kpi"><span>Апгрейды: факт. RTP</span><b>${pct(s.upgrade.rtp)}</b><span>${s.upgrade.n} шт</span></div>
        <div class="kpi"><span>Заявки на вывод</span><b>${s.pendingWithdrawals}</b></div></div></div>
        <div class="card"><h3>Кейсы: план / факт</h3>${data.cases.map(c => { const f = s.cases.find(x => x.case_id === c.id);
          return `<div class="row"><div><b>${esc(c.name)}</b> <span class="mute">${c.price ? fmt(c.price) + ' ⭐' : 'free'}</span></div><div class="mute">план ${pct(c.rtp)} · факт ${pct(f && f.rtp)} · ${f ? f.n : 0} откр.</div></div>`; }).join('')}</div>`;
    },
    async percent() {
      data = data || await api('admin/overview'); const s = data.settings;
      const f = (k, label, hint, step = 'any') => `<label class="f"><span>${label}</span><input name="${k}" type="number" step="${step}" value="${s[k]}">${hint ? `<div class="hint">${hint}</div>` : ''}</label>`;
      return `<form class="card" id="setForm"><h3>Свои проценты</h3>
        ${f('caseRtp', 'RTP кейсов (0.70 = 70%)', 'Какую долю цены кейса в среднем отдаёт кейс. Применяется ко всем кейсам, если у кейса не задан свой.')}
        ${f('generosity', 'Щедрость дропа', 'Больше — чаще выпадает «чуть дороже кейса», реже джекпоты. 3–6.')}
        ${f('generosityDown', 'Мелочь в проигрыше', 'Больше — проигрышный дроп тянется к самым дешёвым подаркам, а шанс «в плюс» растёт. 1–3.')}
        ${f('maxHit', 'Потолок шанса «в плюс» (0.66 = 66%)')}
        ${f('upgradeFactor', 'Апгрейд: множитель шанса', 'Шанс = ставка / цель × множитель. 0.6 → на x2 шанс 30%. Меньше — апгрейды чаще сливают.')}
        ${f('upgradeMaxChance', 'Апгрейд: максимальный шанс (0.6 = 60%)')}
        ${f('referralPercent', 'Реферальный % с депозитов друзей')}
        ${f('refPromoBonus', 'Бонус за ввод реф. промокода, ⭐')}
        ${f('withdrawMinTon', 'Вывод: минимум депозитов, TON')}
        ${f('withdrawWindowDays', 'Вывод: за сколько дней считать депозиты')}
        ${f('freeCooldownHours', 'Бесплатные кейсы: раз в N часов')}
        ${f('dailyShares', 'Daily: сколько шерингов нужно')}
        ${f('starsPerTon', 'Курс: ⭐ за 1 TON')}
        ${f('minDepositTon', 'Мин. пополнение, TON')}
        <button class="btn" type="submit">Сохранить</button></form>`;
    },
    async cases() {
      data = data || await api('admin/overview');
      return data.cases.map(c => `<form class="card case-f" data-id="${c.id}">
        <div class="row" style="border:0;padding-top:0"><h3 style="margin:0">${esc(c.name)} ${c.disabled ? '<span class="pill r">выкл</span>' : ''} ${c.manual ? '<span class="pill">ручные шансы</span>' : ''}</h3>
        <span class="mute">RTP ${pct(c.rtp)} · в плюс ${pct(c.hit)}</span></div>
        <div class="grid2"><label class="f"><span>Цена, ⭐</span><input name="price" type="number" value="${c.price}" ${c.free ? 'disabled' : ''}></label>
        <label class="f"><span>Свой RTP (пусто = общий)</span><input name="rtp" type="number" step="any" placeholder="${data.settings.caseRtp}" value="${(data.settings.cases[c.id] || {}).rtp ?? ''}"></label></div>
        <div class="mute">Шансы, % (можно править вручную — тогда RTP считается по ним):</div>
        <div class="items">${c.items.map(i => `<div class="it"><img src="${i.image}" alt=""><div class="n">${esc(i.name)}</div><div class="v">${fmt(i.value)} ⭐</div><input name="p_${i.id}" type="number" step="any" value="${(i.p * 100).toFixed(3)}"></div>`).join('')}</div>
        <div class="row" style="border:0"><label class="mute"><input type="checkbox" name="disabled" ${c.disabled ? 'checked' : ''} style="width:auto"> выключить кейс</label></div>
        <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn sm" name="save">Сохранить цену/RTP</button><button class="btn sm ghost" name="manual">Сохранить шансы вручную</button><button class="btn sm ghost" name="auto">Шансы авто</button></div></form>`).join('');
    },
    async users() {
      data = data || await api('admin/overview');
      return `<form class="card" id="grantForm"><h3>Выдать баланс</h3>
        <div class="hint">Твой баланс: <b>${fmt(data.me.balance)} ⭐</b> · твой ID ${data.me.id}</div>
        <label class="f"><span>Кому (пусто — себе, @username или ID)</span><input id="gTarget" name="target" placeholder="себе"></label>
        <label class="f"><span>Сколько ⭐ (минус — списать)</span><input id="gDelta" name="delta" type="number" value="1000"></label>
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px">${[1000, 10000, 100000, 1000000].map(v => `<button type="button" class="btn sm ghost" data-quick="${v}">+${fmt(v)}</button>`).join('')}</div>
        <div style="display:flex;gap:8px"><button class="btn g" name="go">Выдать</button><button type="button" class="btn ghost" data-self="1">Себе</button></div></form>
        <div class="card"><input id="uq" placeholder="Поиск: ID, @username или имя"></div><div class="card" id="ulist"><div class="a-empty">Введите запрос — или нажмите «±⭐» у юзера</div></div>`;
    },
    async withdrawals() {
      const list = await api('admin/withdrawals');
      return `<div class="card"><h3>Заявки на вывод</h3>${list.length ? list.map(w => `<div class="row"><div style="display:flex;gap:8px;align-items:center"><img src="${w.image}" style="width:36px;height:36px;object-fit:contain">
        <div><b>${esc(w.name)}</b> <span class="mute">${fmt(w.value)} ⭐</span><div class="mute">#${w.id} · ${w.user_id} @${esc(w.username || '—')} · деп. ${w.dep_ton.toFixed(1)} TON</div></div></div>
        ${w.state === 'pending' ? `<div style="display:flex;gap:6px"><button class="btn sm g" data-wd="${w.id}" data-st="done">Выдан</button><button class="btn sm r" data-wd="${w.id}" data-st="rejected">Отказ</button></div>` : `<span class="pill ${w.state === 'done' ? 'g' : 'r'}">${w.state === 'done' ? 'выдан' : 'отказ'}</span>`}</div>`).join('') : '<div class="a-empty">Заявок нет</div>'}</div>`;
    },
    async promos() {
      const list = await api('admin/promos');
      return `<form class="card" id="promoForm"><h3>Новый промокод</h3><div class="grid2"><label class="f"><span>Код</span><input name="code" placeholder="DRADE100"></label>
        <label class="f"><span>Тип</span><select name="type"><option value="stars">⭐ сразу на баланс</option><option value="bonus">+% к пополнению</option></select></label>
        <label class="f"><span>Значение (⭐ или %)</span><input name="value" type="number" step="any" value="100"></label><label class="f"><span>Активаций</span><input name="uses" type="number" value="100"></label></div>
        <button class="btn">Создать</button></form>
        <div class="card"><h3>Промокоды</h3>${list.length ? list.map(p => `<div class="row"><div><b>${esc(p.code)}</b> <span class="mute">${p.type === 'stars' ? `+${fmt(p.value)} ⭐` : `+${p.value}% к пополнению`}</span><div class="mute">осталось ${p.uses_left} · использовано ${p.used}</div></div><button class="btn sm r" data-del="${esc(p.code)}">Удалить</button></div>`).join('') : '<div class="a-empty">Пока нет</div>'}</div>`;
    },
    async broadcast() {
      return `<form class="card" id="bcForm"><h3>Рассылка всем игрокам</h3><textarea name="text" placeholder="Текст (можно &lt;b&gt;жирный&lt;/b&gt;)"></textarea><div class="hint">Отправляется через бота каждому, кто запускал бота.</div><button class="btn">Отправить</button></form>`;
    },
  };

  async function show(t) {
    tab = t; document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.t === t));
    try { view.innerHTML = await T[t](); } catch (e) { view.innerHTML = `<div class="a-empty">${esc(e.message)}</div>`; }
  }
  document.getElementById('tabs').addEventListener('click', e => { const b = e.target.closest('button'); if (b) show(b.dataset.t); });

  view.addEventListener('submit', async e => {
    e.preventDefault(); const f = e.target, fd = Object.fromEntries(new FormData(f));
    try {
      if (f.id === 'setForm') { const r = await api('admin/settings/save', fd); data.settings = r.settings; data.cases = r.cases; toast('Сохранено'); }
      else if (f.id === 'grantForm') {
        const r = await api('admin/user/balance', { target: fd.target, delta: fd.delta });
        toast(`Готово: ${r.id} теперь ${fmt(r.balance)} ⭐`); if (r.id === data.me.id) data.me.balance = r.balance; show('users');
      }
      else if (f.id === 'promoForm') { await api('admin/promo/create', fd); toast('Промокод создан'); show('promos'); }
      else if (f.id === 'bcForm') { const r = await api('admin/broadcast', fd); toast(`В очереди: ${r.queued}`); f.reset(); }
      else if (f.classList.contains('case-f')) {
        const btn = e.submitter && e.submitter.name, body = { id: f.dataset.id, disabled: !!fd.disabled };
        if (btn === 'save') Object.assign(body, { price: fd.price, rtp: fd.rtp });
        if (btn === 'manual') body.manual = Object.fromEntries(Object.entries(fd).filter(([k]) => k.startsWith('p_')).map(([k, v]) => [k.slice(2), v]));
        if (btn === 'auto') body.manual = null;
        await api('admin/case/save', body); data = null; toast('Сохранено'); show('cases');
      }
    } catch (err) { toast(err.message); }
  });
  view.addEventListener('click', async e => {
    const wd = e.target.closest('[data-wd]'), del = e.target.closest('[data-del]'), ub = e.target.closest('[data-ubal]'), ban = e.target.closest('[data-ban]');
    try {
      if (wd) { await api('admin/withdrawal/set', { id: wd.dataset.wd, state: wd.dataset.st }); toast('Готово'); show('withdrawals'); }
      if (del) { await api('admin/promo/delete', { code: del.dataset.del }); show('promos'); }
      if (ub) { $('gTarget').value = ub.dataset.ubal; $('gDelta').focus(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
      const qb = e.target.closest('[data-quick]'); if (qb) $('gDelta').value = qb.dataset.quick;
      const sb = e.target.closest('[data-self]'); if (sb) { $('gTarget').value = ''; const r = await api('admin/user/balance', { target: 'me', delta: $('gDelta').value }); data.me.balance = r.balance; toast(`Себе: теперь ${fmt(r.balance)} ⭐`); show('users'); }
      if (ban) { await api('admin/user/ban', { id: ban.dataset.ban, banned: ban.dataset.v === '1' }); searchUsers(); }
    } catch (err) { toast(err.message); }
  });
  let uqT = 0;
  async function searchUsers() {
    const q = ($('uq') || {}).value || ''; const list = await api('admin/users', { q });
    $('ulist').innerHTML = list.length ? list.map(u => `<div class="row"><div><b>${esc(u.name || '—')}</b> <span class="mute">@${esc(u.username || '—')} · ${u.id}</span>
      <div class="mute">${fmt(u.balance)} ⭐ · деп. ${u.dep_ton.toFixed(1)} TON · реф. ${u.refs}</div></div><div style="display:flex;gap:6px"><button class="btn sm ghost" data-ubal="${u.id}">±⭐</button>
      <button class="btn sm ${u.banned ? 'g' : 'r'}" data-ban="${u.id}" data-v="${u.banned ? 0 : 1}">${u.banned ? 'Разбан' : 'Бан'}</button></div></div>`).join('') : '<div class="a-empty">Никого</div>';
  }
  view.addEventListener('input', e => { if (e.target.id === 'uq') { clearTimeout(uqT); uqT = setTimeout(searchUsers, 300); } });
  if (tg) { tg.ready(); tg.expand(); }
  show('overview');
})();
