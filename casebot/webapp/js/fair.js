/* Drade Drop — «Правила и честная игра»: RTP, проверка бросков (provably fair), правила, политика конфиденциальности.
   Открывается окном поверх мини-аппа: window.showFairPage(). */
(function () {
  const hdr = () => ({ 'Content-Type': 'application/json', 'X-Telegram-Init-Data': (window.Telegram && Telegram.WebApp.initData) || '' });
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const pct = x => (Math.round(x * 1000) / 10).toString().replace('.', ',') + '%';
  const support = () => window.__SUPPORT || '@RelayerDrade', brand = () => window.__BRAND || 'Drade Drop';

  // тот же расчёт, что на сервере: первые 52 бита HMAC-SHA256(serverSeed, "clientSeed:nonce") / 2^52
  async function rollOf(serverSeed, clientSeed, nonce) {
    const enc = new TextEncoder(), key = await crypto.subtle.importKey('raw', enc.encode(serverSeed), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(`${clientSeed}:${nonce}`)));
    const hex = [...sig].map(b => b.toString(16).padStart(2, '0')).join('');
    return parseInt(hex.slice(0, 13), 16) / 2 ** 52;
  }

  function html(st) {
    const rtp = st.caseRtp ?? .499, uf = st.upgradeFactor ?? .499, cb = st.cashbackRate ?? .08;
    return `
    <div class="fp-head"><button class="fp-back" type="button" aria-label="Назад">←</button><b>Правила и честная игра</b></div>
    <div class="fp-body">
      <section class="fp-card fp-hot">
        <h3>Честно и без подкрутки</h3>
        <div class="fp-kpis">
          <div><b>${pct(rtp)}</b><span>RTP кейсов</span></div>
          <div><b>${pct(uf)}</b><span>RTP апгрейда</span></div>
          <div><b>≈${pct(cb)}</b><span>кешбек при сливе</span></div>
        </div>
        <p>RTP — сколько в среднем возвращается от потраченного на длинной дистанции. ${pct(rtp)} значит: за много открытий кейсы в среднем отдают подарками около половины их цены. В каждом отдельном открытии может выпасть и дешевле, и в разы дороже.</p>
        <p>Каждый результат — случайное число от 0 до 1, которое считается по формуле ниже. Мы заранее публикуем отпечаток (хэш) секретного сида, поэтому подменить исход после ставки невозможно — это можно проверить самому.</p>
      </section>

      <section class="fp-card">
        <h3>Твои сиды</h3>
        <div class="fp-row"><span>Хэш серверного сида</span><code id="fpHash">${esc(st.serverSeedHash || '—')}</code></div>
        <label class="fp-row"><span>Клиентский сид (можно поменять)</span><input id="fpClient" value="${esc(st.clientSeed || '')}" maxlength="64" autocomplete="off"></label>
        <div class="fp-row"><span>Сделано бросков (nonce)</span><code id="fpNonce">${st.nonce ?? 0}</code></div>
        <button class="fp-btn" id="fpRotate" type="button">Сменить сиды и раскрыть старый</button>
        <div id="fpRevealed" class="fp-revealed" hidden></div>
      </section>

      <section class="fp-card">
        <h3>Проверить бросок</h3>
        <p class="fp-mute">Бросок = первые 13 hex-символов HMAC-SHA256(серверный сид, «клиентский сид:nonce»), делённые на 16¹³. В кейсе идём по списку подарков сверху вниз (как в «Содержимом кейса») и складываем шансы: выпадает подарок, на котором сумма впервые стала больше броска. Апгрейд выигран, если бросок меньше шанса на колесе.</p>
        <input id="fvServer" placeholder="Серверный сид (раскрытый)" autocomplete="off">
        <input id="fvClient" placeholder="Клиентский сид" autocomplete="off">
        <input id="fvNonce" placeholder="Nonce (номер броска)" inputmode="numeric" autocomplete="off">
        <button class="fp-btn fp-btn-2" id="fvGo" type="button">Посчитать</button>
        <div id="fvOut" class="fp-out"></div>
      </section>

      <section class="fp-card fp-text">
        <h3>Правила</h3>
        <ol>
          <li>${esc(brand())} — развлекательная игра в Telegram. Только для лиц старше 18 лет.</li>
          <li>Звёзды ⭐ — внутренняя валюта игры. Пополнение — TON (1 TON = 100 ⭐) или Telegram Stars. Звёзды не обмениваются обратно на деньги.</li>
          <li>Кейсы: подарок определяется броском честной игры по шансам, указанным в кейсе. Средний возврат кейсов — ${pct(rtp)}.</li>
          <li>Апгрейд: шанс = стоимость ставки ÷ стоимость цели × ${String(uf).replace('.', ',')}. При проигрыше подарки ставки сгорают, а из кешбек-кейса выпадает утешительный приз — в среднем около ${pct(cb)} ставки.</li>
          <li>Вывод подарков: подарки до 600 ⭐ — сразу по заявке; дороже — при пополнениях от 50 TON за последние 7 дней. Подарок отправляет поддержка ${esc(support())} вручную, обычно в течение 24 часов. Бесплатные подарки, полученные с нарушениями, не выводятся.</li>
          <li>Запрещены мультиаккаунты, злоупотребление промокодами и рефералами, использование ошибок сервиса. За нарушения аккаунт блокируется, баланс и подарки аннулируются.</li>
          <li>Играй только на сумму, которую готов потерять. Это игра, а не способ заработка.</li>
        </ol>
      </section>

      <section class="fp-card fp-text">
        <h3>Политика конфиденциальности</h3>
        <p><b>Что мы храним.</b> Данные, которые передаёт Telegram при входе в мини-апп: ID, имя, username и фото профиля. А также историю игры (открытия, апгрейды, выигрыши), пополнения и выводы, адреса TON-кошельков, с которых приходила оплата, и сиды честной игры.</p>
        <p><b>Зачем.</b> Чтобы работали баланс, инвентарь, начисления и выводы, для защиты от мошенничества и для ответов поддержки.</p>
        <p><b>Кому передаём.</b> Никому не продаём. Данные уходят только туда, без чего сервис не работает: Telegram (сообщения бота и платежи Stars) и публичным API блокчейна TON (проверка входящих переводов).</p>
        <p><b>Сколько храним.</b> Пока аккаунт активен. Удалить данные можно по запросу в поддержку ${esc(support())} — после закрытия незавершённых выводов.</p>
        <p><b>Контакты.</b> Вопросы по правилам и данным — ${esc(support())}.</p>
      </section>
    </div>`;
  }

  async function open() {
    if (document.getElementById('fairPage')) return;
    let st = {};
    try { const r = await fetch('/api/fair/state', { method: 'POST', headers: hdr() }); if (r.ok) st = await r.json(); } catch (e) { }
    const ov = document.createElement('div'); ov.id = 'fairPage'; ov.className = 'fp'; ov.innerHTML = html(st);
    document.body.appendChild(ov); document.body.style.overflow = 'hidden';
    const close = () => { ov.remove(); document.body.style.overflow = ''; try { Telegram.WebApp.BackButton.offClick(close); Telegram.WebApp.BackButton.hide(); } catch (e) { } };
    ov.querySelector('.fp-back').addEventListener('click', close);
    try { Telegram.WebApp.BackButton.onClick(close); Telegram.WebApp.BackButton.show(); } catch (e) { }
    ov.querySelector('#fpRotate').addEventListener('click', async () => {
      try {
        const r = await fetch('/api/fair/rotate', { method: 'POST', headers: hdr(), body: JSON.stringify({ clientSeed: ov.querySelector('#fpClient').value }) });
        const d = await r.json(); if (!r.ok) throw new Error(d.error || 'Ошибка');
        const rv = d.revealed, box = ov.querySelector('#fpRevealed'); box.hidden = false;
        box.innerHTML = `<b>Старый серверный сид раскрыт</b><code>${esc(rv.serverSeed)}</code><span>хэш: ${esc(rv.serverSeedHash)}</span><span>клиентский сид: ${esc(rv.clientSeed)} · бросков: ${rv.nonce}</span>`;
        ov.querySelector('#fvServer').value = rv.serverSeed; ov.querySelector('#fvClient').value = rv.clientSeed; ov.querySelector('#fvNonce').value = rv.nonce || 1;
        ov.querySelector('#fpHash').textContent = d.current.serverSeedHash; ov.querySelector('#fpNonce').textContent = d.current.nonce;
        ov.querySelector('#fpClient').value = d.current.clientSeed;
        if (window.showAlert) showAlert('Новые сиды установлены', 'success');
      } catch (e) { if (window.showAlert) showAlert(e.message, 'error'); }
    });
    ov.querySelector('#fvGo').addEventListener('click', async () => {
      const s = ov.querySelector('#fvServer').value.trim(), c = ov.querySelector('#fvClient').value.trim(), n = parseInt(ov.querySelector('#fvNonce').value, 10), out = ov.querySelector('#fvOut');
      if (!s || !c || !(n >= 1)) { out.textContent = 'Заполни все три поля'; return; }
      try {
        const x = await rollOf(s, c, n);
        const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))].map(b => b.toString(16).padStart(2, '0')).join('');
        out.innerHTML = `Бросок №${n}: <b>${x.toFixed(10)}</b><br><span>sha256(сид) = ${hash.slice(0, 20)}… — сверь с хэшем, который был до игры</span>`;
      } catch (e) { out.textContent = 'Проверка недоступна в этом браузере'; }
    });
  }
  window.showFairPage = open;
})();
