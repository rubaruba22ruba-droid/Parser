/* Демо-режим Drade Drop: тот же интерфейс, а «сервер» работает в браузере (баланс и инвентарь — в localStorage).
   Шансы и цены — те же, что на настоящем сервере (demo-data.json генерится из server/). */
(function () {
  const KEY = 'dd_demo_v3';
  let st; try { st = JSON.parse(localStorage.getItem(KEY)) || null; } catch (e) { st = null; }
  if (!st) st = { balance: 5000, inv: [], next: 1, free: {} };
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) { } };
  const noop = () => { };
  const user = { id: 1, first_name: 'Гость', username: 'demo' };
  window.__BOT_USERNAME = 'DradeDropBot'; window.__BRAND = 'Drade Drop'; window.__SUPPORT = '@entoni';
  window.Telegram = { WebApp: {
    initData: 'user=' + encodeURIComponent(JSON.stringify(user)) + '&demo=1', initDataUnsafe: { user }, version: '8.0', platform: 'web',
    ready: noop, expand: noop, close: noop, onEvent: noop, offEvent: noop, setHeaderColor: noop, setBackgroundColor: noop, isVersionAtLeast: () => true,
    showConfirm: (m, cb) => cb && cb(true), openTelegramLink: noop, openLink: noop, shareMessage: (id, cb) => cb && cb(true),
    openInvoice: (url, cb) => { const n = Number(String(url).split(':')[1]) || 0; st.balance += n; save(); setTimeout(() => cb && cb('paid'), 400); },
    HapticFeedback: { impactOccurred: noop, notificationOccurred: noop, selectionChanged: noop },
    BackButton: { show: noop, hide: noop, onClick: noop, offClick: noop }, MainButton: { show: noop, hide: noop } } };

  const data = fetch('demo-data.json').then(r => r.json());
  const roll = items => { let x = Math.random(), a = 0; for (const it of items) { a += it.p; if (x < a) return it; } return items[items.length - 1]; };
  const ok = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json' } });
  const fail = (msg, code) => ok({ success: false, error: msg, ...(code ? { code } : {}) }, 400);
  const invRow = i => ({ id: i.id, item_name: i.name, item_value: i.value, item_image: i.image, rarity: i.rarity });

  async function handle(path, body) {
    const D = await data, G = new Map(D.gifts.map(g => [g.id, g]));
    switch (path) {
      case 'check-ban': return ok({ banned: false });
      case 'admin/meta': return ok({ isAdmin: false });
      case 'get-cases': return ok(D.client);
      case 'get-balance': return ok({ balance: st.balance });
      case 'referral-count': return ok({ count: 0, spent: 0, available: 0 });
      case 'gifts': return ok(D.gifts);
      case 'upgrade/config': return ok(D.upgrade);
      case 'daily-case/status': {
        const t = st.free[body.caseId || 'case1'] || 0, opened = Date.now() - t < 86400000;
        return ok({ canOpen: !opened, freeCaseOpenedToday: opened, nextResetAt: new Date(t + 86400000).toISOString(), sharesDone: true, subscribed: true, shareCount: 3, needTasks: false });
      }
      case 'open-case': {
        const c = D.cases[body.caseId]; if (!c) return fail('Кейс не найден');
        const free = !c.price, count = free ? 1 : Math.min(Math.max(parseInt(body.count, 10) || 1, 1), 5), demo = !!body.isDemo && !free;
        if (free) { if (Date.now() - (st.free[c.id] || 0) < 86400000) return fail('Бесплатный кейс уже открыт. Попробуйте позже', 'cooldown'); st.free[c.id] = Date.now(); }
        else if (!demo) { if (st.balance < c.price * count) return fail(`Недостаточно Stars! Нужно ещё ${c.price * count - st.balance} ⭐`); st.balance -= c.price * count; }
        const gifts = [];
        for (let i = 0; i < count; i++) {
          const it = roll(c.items), g = G.get(it.giftId); let dbId = null;
          if (!demo) { dbId = st.next++; st.inv.unshift({ id: dbId, name: g.name, value: g.value, image: g.image, rarity: it.rarity, giftId: g.id }); }
          gifts.push({ name: g.name, image: g.image, value: g.value, rarity: it.rarity, dbId });
        }
        save(); return ok({ gifts, newBalance: st.balance, isDemo: demo, prizeTokens: [] });
      }
      case 'sell-item': { const k = st.inv.findIndex(i => i.id === Number(body.itemId)); if (k < 0) return fail('Предмет не найден'); const [it] = st.inv.splice(k, 1); st.balance += it.value; save(); return ok({ success: true, newBalance: st.balance, itemValue: it.value }); }
      case 'sell-all-items': { const total = st.inv.reduce((s, i) => s + i.value, 0), n = st.inv.length; st.inv = []; st.balance += total; save(); return ok({ success: true, newBalance: st.balance, soldCount: n, totalValue: total }); }
      case 'init-withdraw': return fail(`Для вывода нужно пополнить баланс минимум на ${D.withdrawMinTon} TON за последние ${D.withdrawWindowDays} дней. Вывод — через поддержку @entoni`);
      case 'upgrade': {
        const ids = body.inventoryItemIds || [], items = st.inv.filter(i => ids.includes(i.id)), t = G.get(body.targetGiftId);
        if (!items.length || !t) return fail('Выберите подарки и цель');
        const stake = items.reduce((s, i) => s + i.value, 0); if (t.value <= stake) return fail('Цель должна быть дороже ставки');
        const chance = Math.min(D.upgrade.maxChance, stake / t.value * D.upgrade.factor), r = Math.random(), win = r < chance;
        st.inv = st.inv.filter(i => !ids.includes(i.id));
        if (win) st.inv.unshift({ id: st.next++, name: t.name, value: t.value, image: t.image, rarity: 'legendary', giftId: t.id });
        save(); return ok({ win, chance, roll: r, stake });
      }
      case 'create-stars-invoice': { const n = parseInt(body.amount, 10); if (!(n > 0)) return fail('Введите сумму'); return ok({ success: true, invoice_url: 'demo:' + n }); }
      case 'ton/config': return ok({});
      case 'referral-data': return ok({ referrals: [], totalCount: 0 });
      case 'my-ref-promo': return ok({});
      case 'ref-promo-status': return ok({ canUseRefPromo: false });
      case 'referral-cases-status': return ok({ totalRefs: 0 });
      case 'check-promo': return ok({ valid: false });
      case 'daily-case/record-share': return ok({ shareCount: 3, sharesDone: true });
      case 'daily-case/verify': return ok({ success: true, subscribed: true, sharesDone: true, shareCount: 3 });
      default: return ok({});
    }
  }
  const orig = window.fetch.bind(window);
  window.fetch = function (url, opts) {
    const u = String(typeof url === 'string' ? url : (url && url.url) || '');
    const m = u.match(/\/api\/([^?]+)/);
    if (!m) return orig(url, opts);
    let path = m[1]; if (/^inventory\/\d+$/.test(path)) return Promise.resolve(ok(st.inv.map(invRow)));
    let body = {}; try { body = opts && opts.body ? JSON.parse(opts.body) : {}; } catch (e) { }
    const q = u.split('?')[1]; if (q) new URLSearchParams(q).forEach((v, k) => { if (!(k in body)) body[k] = v; });
    return handle(path, body);
  };
})();
