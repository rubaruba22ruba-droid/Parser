/* Drade Drop — пополнение TON через Tonkeeper по ссылке (без подключения кошелька).
   Заявка на сервере даёт адрес, сумму и комментарий-метку; Tonkeeper открывается с уже заполненным переводом,
   мини-апп ждёт зачисления. Сервер найдёт перевод и сам, даже если окно закрыть. */
(function () {
  const $ = id => document.getElementById(id);
  const hdr = () => ({ 'Content-Type': 'application/json', 'X-Telegram-Init-Data': (window.Telegram && Telegram.WebApp.initData) || '' });
  const RATE = 100, MIN = 0.1, MAX = 500;
  let cur = null, timer = null, until = 0;

  const amount = () => { const v = parseFloat(String($('tpAmount').value || '').replace(',', '.')); return Number.isFinite(v) ? v : 0; };
  function refresh() {
    const a = amount();
    $('tpPreview').textContent = '≈' + Math.floor(a * RATE).toLocaleString('ru-RU') + ' ★';
    $('tpPay').disabled = !(a >= MIN && a <= MAX);
  }
  const tkLink = d => `https://app.tonkeeper.com/transfer/${d.walletAddress}?amount=${d.amountNano}&text=${encodeURIComponent(d.comment)}`;
  function openLink(url) {
    try { if (window.Telegram && Telegram.WebApp.openLink) return Telegram.WebApp.openLink(url); } catch (e) { }
    window.open(url, '_blank');
  }
  async function copy(text) {
    try { await navigator.clipboard.writeText(text); }
    catch (e) { const t = document.createElement('textarea'); t.value = text; document.body.appendChild(t); t.select(); try { document.execCommand('copy'); } catch (_) { } t.remove(); }
    if (window.showAlert) showAlert('Скопировано', 'success');
  }
  function show(wait) { $('tpForm').hidden = wait; $('tpWait').hidden = !wait; }
  function stop() { clearTimeout(timer); timer = null; }

  async function poll() {
    if (!cur) return;
    try {
      const r = await fetch('/api/ton/check-payment', { method: 'POST', headers: hdr(), body: JSON.stringify({ intentId: cur.intentId }) });
      const d = await r.json().catch(() => ({}));
      if (d.status === 'completed') {
        stop(); cur = null; show(false); $('tpAmount').value = ''; $('tpPromo').value = ''; refresh();
        try { await loadBalance(); updateBalance(); } catch (e) { }
        if (window.FX) FX.win('legendary');
        if (window.showAlert) showAlert(`Баланс пополнен на ${Number(d.credited || 0).toLocaleString('ru-RU')} ★`, 'success', { title: 'Пополнение' });
        return;
      }
    } catch (e) { }
    if (Date.now() < until) timer = setTimeout(poll, 4000);
  }

  async function pay() {
    const a = amount(); if (!(a >= MIN && a <= MAX)) return;
    const btn = $('tpPay'); btn.disabled = true; const label = btn.textContent; btn.textContent = 'Создаём платёж…';
    try {
      const r = await fetch('/api/ton/deposit-intent', { method: 'POST', headers: hdr(), body: JSON.stringify({ amountTon: a, promoCode: $('tpPromo').value.trim() || undefined }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.success) throw new Error(d.error || 'Не удалось создать платёж');
      cur = d;
      $('tpAddr').textContent = d.walletAddress.slice(0, 6) + '…' + d.walletAddress.slice(-6);
      $('tpSum').textContent = (Number(d.amountNano) / 1e9) + ' TON';
      $('tpComment').textContent = d.comment;
      show(true); openLink(tkLink(d));
      stop(); until = Date.now() + 15 * 60000; timer = setTimeout(poll, 5000);
    } catch (e) { if (window.showAlert) showAlert(e.message, 'error'); }
    btn.textContent = label; refresh();
  }

  function init() {
    if (!$('tpPay')) return;
    $('tpAmount').addEventListener('input', refresh);
    document.querySelectorAll('.dd-tp-quick [data-ton]').forEach(b => b.addEventListener('click', () => { $('tpAmount').value = b.dataset.ton; refresh(); if (window.FX) FX.haptic('light'); }));
    $('tpPay').addEventListener('click', pay);
    $('tpOpen').addEventListener('click', () => cur && openLink(tkLink(cur)));
    $('tpCancel').addEventListener('click', () => { stop(); cur = null; show(false); });
    document.querySelectorAll('.dd-tp-row [data-copy]').forEach(b => b.addEventListener('click', () => {
      if (!cur) return; const k = b.dataset.copy;
      copy(k === 'addr' ? cur.walletAddress : k === 'sum' ? String(Number(cur.amountNano) / 1e9) : cur.comment);
    }));
    // вернулись из Tonkeeper — сразу проверим
    document.addEventListener('visibilitychange', () => { if (!document.hidden && cur) { stop(); until = Math.max(until, Date.now() + 10 * 60000); poll(); } });
    refresh();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
