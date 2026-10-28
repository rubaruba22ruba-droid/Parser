import { cfg } from './config.mjs';
import { settings as S } from './settings.mjs';
import { q, one, run, tx } from './db.mjs';
import { CASE_BY_ID, GIFT_BY_ID, GIFTS, casesForClient } from './catalog.mjs';
import { getUser, depositedTon, depositedStars, referralStats } from './wallet.mjs';
import { createIntent, pollDeposits, walletBalance } from './ton.mjs';
import { tg, botLink, notifyAdmins } from './tg.mjs';
import { isAdmin, promoFor, usePromo } from './admin.mjs';
import { nextRoll, publicState, rotate } from './fair.mjs';
import { upgradeZones, pickDiamond } from './diamond.mjs';

export class ApiError extends Error { constructor(msg, status = 400, code) { super(msg); this.status = status; this.code = code; } }
const DAY = 86400000, today = () => new Date().toISOString().slice(0, 10);
const nextUtcMidnight = () => { const d = new Date(); d.setUTCHours(24, 0, 0, 0); return d.toISOString(); };
const balanceOf = id => getUser(id).balance;
const invRow = r => ({ id: r.id, item_name: r.name, item_value: r.value, item_image: r.image, rarity: r.rarity, gift_id: r.gift_id, case_id: r.case_id });

// ---------- кейсы ----------
// выбор подарка по броску x ∈ [0,1): идём по списку кейса (как он показан — от дорогого к дешёвому), копим шансы
function pick(c, x) {
  let a = 0;
  for (const it of c.items) { a += it.p; if (x < a) return it; }
  return c.items[c.items.length - 1];
}
async function isSubscribed(userId) {
  if (!cfg.dailyChannel) return true;
  if (cfg.dev) return true;
  if (cfg.subCheck === 'click') return !!one('SELECT 1 FROM kv WHERE k=?', 'sub:' + userId);   // нажал «перейти в канал» — засчитано
  try { const m = await tg('getChatMember', { chat_id: '@' + cfg.dailyChannel, user_id: userId }, 8000); return ['member', 'administrator', 'creator'].includes(m.status); } catch { return false; }
}
async function freeStatus(u, caseId) {
  const rec = one('SELECT opened_at FROM free_opens WHERE user_id=? AND case_id=?', u.id, caseId);
  const cd = S().freeCooldownHours * 3600000, opened = !!rec && Date.now() - rec.opened_at < cd;
  const needTasks = caseId === 'case1';
  const shareCount = needTasks ? (one('SELECT n FROM daily_shares WHERE user_id=? AND day=?', u.id, today())?.n || 0) : 0;
  const sharesDone = !needTasks || shareCount >= S().dailyShares;
  const subscribed = !needTasks || await isSubscribed(u.id);
  return { canOpen: !opened && sharesDone && subscribed, freeCaseOpenedToday: opened, nextResetAt: opened ? new Date(rec.opened_at + cd).toISOString() : nextUtcMidnight(),
    sharesDone, shareCount, subscribed, needTasks, channelUsername: cfg.dailyChannel ? '@' + cfg.dailyChannel : null };
}

async function openCase(u, b) {
  const c = CASE_BY_ID.get(String(b.caseId)); if (!c || c.disabled) throw new ApiError('Кейс не найден', 404);
  const isFree = c.free, isRef = !!c.referralPrice;
  const count = isFree || isRef ? 1 : Math.min(Math.max(parseInt(b.count, 10) || 1, 1), 5);
  const demo = !!b.isDemo && !isFree && !isRef;
  if (isFree) {
    const st = await freeStatus(u, c.id);
    if (st.freeCaseOpenedToday) throw new ApiError('Бесплатный кейс уже открыт. Попробуйте позже', 400, 'cooldown');
    if (!st.canOpen) throw new ApiError('Сначала выполните условия кейса');
  }
  const gifts = [];
  const result = tx(() => {
    const cur = getUser(u.id);
    if (isRef) {
      const rs = referralStats(u.id); if (rs.available < c.referralPrice) throw new ApiError('Недостаточно рефералов');
      run('UPDATE users SET ref_spent=ref_spent+? WHERE id=?', c.referralPrice, u.id);
    } else if (!isFree && !demo) {
      if (cur.balance < c.price * count) throw new ApiError(`Недостаточно Stars! Нужно ещё ${c.price * count - cur.balance} ⭐`);
      run('UPDATE users SET balance=balance-? WHERE id=?', c.price * count, u.id);
    }
    if (isFree) {   // повторная проверка внутри транзакции: два одновременных запроса не откроют бесплатный кейс дважды
      const rec = one('SELECT opened_at FROM free_opens WHERE user_id=? AND case_id=?', u.id, c.id);
      if (rec && Date.now() - rec.opened_at < S().freeCooldownHours * 3600000) throw new ApiError('Бесплатный кейс уже открыт. Попробуйте позже', 400, 'cooldown');
      run('INSERT INTO free_opens(user_id,case_id,opened_at) VALUES(?,?,?) ON CONFLICT(user_id,case_id) DO UPDATE SET opened_at=excluded.opened_at', u.id, c.id, Date.now());
    }
    for (let i = 0; i < count; i++) {
      const r = demo ? { x: Math.random() } : nextRoll(u.id);           // демо не тратит броски честной игры
      const it = pick(c, r.x), g = GIFT_BY_ID.get(it.giftId); let dbId = null;
      if (!demo) {
        dbId = Number(run('INSERT INTO inventory(user_id,gift_id,name,value,image,rarity,case_id,created) VALUES(?,?,?,?,?,?,?,?)', u.id, g.id, g.name, g.value, g.image, it.rarity, c.id, Date.now()).lastInsertRowid);
        run('INSERT INTO opens(user_id,case_id,price,gift_id,value,created,nonce,seed_hash,roll) VALUES(?,?,?,?,?,?,?,?,?)', u.id, c.id, c.price, g.id, g.value, Date.now(), r.nonce, r.serverSeedHash, r.x);
      }
      gifts.push({ name: g.name, image: g.image, value: g.value, rarity: it.rarity, dbId, fair: r.nonce ? { nonce: r.nonce, roll: r.x } : null });
    }
    return { gifts, newBalance: getUser(u.id).balance, isDemo: demo, prizeTokens: [] };
  });
  return result;
}

// ---------- вывод ----------
function initWithdraw(u, b) {
  const it = one("SELECT * FROM inventory WHERE id=? AND user_id=? AND state='owned'", Number(b.itemId), u.id); if (!it) throw new ApiError('Предмет не найден');
  const dep = depositedTon(u.id);
  if (it.value > S().withdrawFreeMax && dep + 1e-9 < S().withdrawMinTon)   // до withdrawFreeMax ⭐ — без условия депозита
    throw new ApiError(`Для вывода нужно пополнить баланс минимум на ${S().withdrawMinTon} TON за последние ${S().withdrawWindowDays} дней (сейчас ${dep.toFixed(2)} TON). Вывод — через поддержку ${cfg.support}`);
  const id = tx(() => {
    // только если подарок всё ещё в инвентаре (не продан и не поставлен в апгрейд параллельным запросом)
    if (!run("UPDATE inventory SET state='withdraw' WHERE id=? AND state='owned'", it.id).changes) throw new ApiError('Предмет не найден или уже продан');
    return Number(run('INSERT INTO withdrawals(user_id,inv_id,created,updated) VALUES(?,?,?,?)', u.id, it.id, Date.now(), Date.now()).lastInsertRowid); });
  notifyAdmins(`📤 <b>Заявка на вывод #${id}</b>\n🎁 ${it.name} — ${it.value} ⭐\n👤 ${u.name || ''} @${u.username || '—'} · ID <code>${u.id}</code>\n\nОтправь подарок вручную и нажми «Выдал».`,
    { inline_keyboard: [[{ text: '✅ Выдал', callback_data: `wd:done:${id}` }, { text: '❌ Отклонить', callback_data: `wd:rej:${id}` }]] }).catch(() => {});
  return { success: true, withdrawalId: id, message: `Заявка #${id} отправлена — поддержка ${cfg.support} отправит подарок вручную` };
}

// ---------- апгрейд (как на CaseBattle) ----------
// Ставка — 1..6 подарков. Шанс = ставка/цель × factor. roll ∈ [0,1): выигрыш, если roll < chance;
// клиент ставит стрелку колеса ровно на roll·360°, поэтому что видно на колесе — то и выпало.
function upgrade(u, b) {
  const ids = [...new Set([].concat(b.inventoryItemIds ?? b.inventoryItemId ?? []).map(Number))].filter(Number.isFinite);
  if (!ids.length || ids.length > cfg.upgradeMaxItems) throw new ApiError(`Выберите от 1 до ${cfg.upgradeMaxItems} подарков`);
  const t = GIFT_BY_ID.get(String(b.targetGiftId)); if (!t || t.kind === 'regular') throw new ApiError('Подарок не найден');
  return tx(() => {
    const items = ids.map(id => one("SELECT * FROM inventory WHERE id=? AND user_id=? AND state='owned'", id, u.id));
    if (items.some(x => !x)) throw new ApiError('Предмет не найден');
    const stake = items.reduce((s, x) => s + x.value, 0);
    if (t.value <= stake || t.value > stake * 100) throw new ApiError('Цель должна быть дороже ставки');
    const z = upgradeZones(stake, t.value, GIFTS, S());
    // тест алмаза: админ включил его себе — бросок ставится в алмаз (не тратит честный nonce, в истории помечен admin-test)
    const test = z.d > 0 && isAdmin(u) && !!one("SELECT 1 FROM kv WHERE k=? AND v='1'", 'dtest:' + u.id);
    const r = test ? { x: z.d0 + z.d * Math.random(), nonce: null, serverSeedHash: 'admin-test' } : nextRoll(u.id), roll = r.x;
    const win = roll < z.c, dia = !win && z.d > 0 && roll >= z.d0 && roll < z.d0 + z.d;
    const prize = win ? t : dia ? pickDiamond(z.pool, (roll - z.d0) / z.d) : null;
    for (const x of items) run("UPDATE inventory SET state=? WHERE id=?", prize ? 'upgraded' : 'upgrade_lost', x.id);
    let item = null;
    if (prize) item = Number(run('INSERT INTO inventory(user_id,gift_id,name,value,image,rarity,case_id,created) VALUES(?,?,?,?,?,?,?,?)', u.id, prize.id, prize.name, prize.value, prize.image, 'legendary', dia ? 'diamond' : 'upgrade', Date.now()).lastInsertRowid);
    run('INSERT INTO opens(user_id,case_id,price,gift_id,value,created,nonce,seed_hash,roll) VALUES(?,?,?,?,?,?,?,?,?)', u.id, dia ? 'diamond' : 'upgrade', stake, prize ? prize.id : '', prize ? prize.value : 0, Date.now(), r.nonce, r.serverSeedHash, roll);
    const cb = prize ? null : cashback(u, stake);
    const pub = g => ({ id: g.id, name: g.name, value: g.value, image: g.image });
    return { win, chance: z.c, roll, stake, itemId: item, fair: { nonce: r.nonce }, cashback: cb,
      zones: { c: z.c, d: z.d, d0: z.d0 }, diamond: dia ? { prize: { ...pub(prize), itemId: item, mult: prize.value / t.value }, pool: z.pool.map(pub), test } : null };
  });
}

// ---------- кешбек-ящик после слива апгрейда ----------
// В среднем cashbackRate ставки (8% ≈ в 12 раз дешевле): обычно 2–8% звёздами, иногда до 30%, редко — до 100% (подарок).
// Сумма от 300 ⭐ — NFT-подарок близкой цены, если такой есть; иначе звёзды. Бросок — тот же честный HMAC.
function cashback(u, stake) {
  if (!(S().cashbackRate > 0)) return null;
  const r = nextRoll(u.id), x = r.x, scale = S().cashbackRate / 0.0802;
  const k = x < 0.85 ? 0.02 + x / 0.85 * 0.06 : x < 0.98 ? 0.08 + (x - 0.85) / 0.13 * 0.22 : 0.3 + (x - 0.98) / 0.02 * 0.7;
  const value = Math.max(1, Math.round(stake * k * scale));
  let gift = null;
  if (value >= 300) gift = GIFTS.filter(g => g.kind === 'nft' && g.value <= value * 1.25 && g.value >= value * 0.6).sort((a, b) => Math.abs(a.value - value) - Math.abs(b.value - value))[0] || null;
  let out;
  if (gift) {
    const id = Number(run('INSERT INTO inventory(user_id,gift_id,name,value,image,rarity,case_id,created) VALUES(?,?,?,?,?,?,?,?)', u.id, gift.id, gift.name, gift.value, gift.image, 'legendary', 'cashback', Date.now()).lastInsertRowid);
    out = { type: 'gift', value: gift.value, name: gift.name, image: gift.image, itemId: id };
  } else {
    run('UPDATE users SET balance=balance+? WHERE id=?', value, u.id);
    out = { type: 'stars', value };
  }
  run('INSERT INTO opens(user_id,case_id,price,gift_id,value,created,nonce,seed_hash,roll) VALUES(?,?,?,?,?,?,?,?,?)', u.id, 'cashback', 0, gift ? gift.id : 'stars', out.value, Date.now(), r.nonce, r.serverSeedHash, x);
  return { ...out, nonce: r.nonce, newBalance: getUser(u.id).balance };
}

// ---------- промо / рефералы ----------
const refEarnings = id => Math.floor(one("SELECT COALESCE(SUM(d.stars),0) s FROM deposits d JOIN users r ON r.id=d.user_id WHERE r.referred_by=? AND d.kind!='admin'", id).s * S().referralPercent / 100);
async function prepareShare(u) {
  if (!cfg.botToken) throw new ApiError('Бот не настроен', 500);
  const link = `${botLink()}?start=ref_${u.id}`;
  const r = await tg('savePreparedInlineMessage', { user_id: u.id, allow_user_chats: true, allow_bot_chats: false, allow_group_chats: false, allow_channel_chats: false,
    result: { type: 'article', id: 'share' + Date.now(), title: cfg.brand, description: 'Открывай кейсы с NFT-подарками', input_message_content: { message_text: `🎁 ${cfg.brand} — открывай кейсы и выигрывай NFT-подарки Telegram! Бесплатные кейсы каждый день.` },
      reply_markup: { inline_keyboard: [[{ text: '🎮 Играть', url: link }]] } } });
  return { msgId: r.id };
}

export const routes = {
  'check-ban': u => ({ banned: !!u.banned }),
  'admin/meta': u => ({ isAdmin: isAdmin(u) }),
  'get-cases': () => casesForClient(),
  'get-balance': u => ({ balance: u.balance }),
  'referral-count': u => referralStats(u.id),
  'gifts': () => GIFTS.map(g => ({ id: g.id, name: g.name, value: g.value, image: g.image, kind: g.kind })),
  'upgrade/config': u => ({ factor: S().upgradeFactor, maxChance: S().upgradeMaxChance, maxItems: cfg.upgradeMaxItems, cashbackRate: S().cashbackRate,
    diamondShare: S().diamondShare, diamondMin: S().diamondMin, diamondMax: S().diamondMax,
    canTest: isAdmin(u), test: isAdmin(u) && !!one("SELECT 1 FROM kv WHERE k=? AND v='1'", 'dtest:' + u.id) }),
  // админ включает себе «тест алмаза»: его апгрейды встают в алмаз, чтобы посмотреть анимацию. Другим игрокам не влияет.
  'upgrade/diamond-test': (u, b) => {
    if (!isAdmin(u)) throw new ApiError('Только для админа', 403);
    const on = b.on === true || b.on === 1 || b.on === '1' || b.on === 'true';
    run("INSERT INTO kv(k,v) VALUES(?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v", 'dtest:' + u.id, on ? '1' : '0');
    return { test: on };
  },
  // честная игра: текущий хэш сида, смена пары с раскрытием старого сида, параметры для правил
  'fair/state': u => ({ ...publicState(u.id), caseRtp: S().caseRtp, upgradeFactor: S().upgradeFactor, cashbackRate: S().cashbackRate, diamondShare: S().diamondShare, diamondMin: S().diamondMin, diamondMax: S().diamondMax }),
  'fair/rotate': (u, b) => rotate(u.id, b.clientSeed),
  'log-client-error': () => ({ ok: true }),
  'check-promo': () => ({ valid: false }),
  'confirm-prize': () => ({ success: false, error: 'not used' }),
  'open-case': openCase,
  'upgrade': upgrade,
  'init-withdraw': initWithdraw,
  'check-deposit': (u, b) => ({ hasDeposit: depositedStars(u.id, 24) >= (Number(b.minAmount) || 0) }),

  'sell-item': (u, b) => tx(() => {
    const it = one("SELECT * FROM inventory WHERE id=? AND user_id=? AND state='owned'", Number(b.itemId), u.id); if (!it) throw new ApiError('Предмет не найден или уже продан');
    run("UPDATE inventory SET state='sold' WHERE id=?", it.id); run('UPDATE users SET balance=balance+? WHERE id=?', it.value, u.id);
    return { success: true, newBalance: balanceOf(u.id), itemValue: it.value };
  }),
  'sell-all-items': u => tx(() => {
    const items = q("SELECT * FROM inventory WHERE user_id=? AND state='owned'", u.id); const total = items.reduce((s, i) => s + i.value, 0);
    run("UPDATE inventory SET state='sold' WHERE user_id=? AND state='owned'", u.id); run('UPDATE users SET balance=balance+? WHERE id=?', total, u.id);
    return { success: true, newBalance: balanceOf(u.id), soldCount: items.length, totalValue: total };
  }),

  // --- TON / Stars ---
  'ton/config': () => ({ twaReturnUrl: cfg.twaReturnUrl, starsPerTon: S().starsPerTon }),
  'ton/deposit-intent': (u, b) => {
    const amount = Number(b.amountTon); if (!Number.isFinite(amount) || amount < S().minDepositTon || amount > 500) throw new ApiError(`Сумма от ${S().minDepositTon} до 500 TON`);
    const promo = b.promoCode ? promoFor(b.promoCode, 'bonus') : null; if (b.promoCode && !promo) throw new ApiError('Промокод не найден или закончился');
    return { success: true, ...createIntent(u.id, Math.round(amount * 1e9) / 1e9, promo?.code, b.fromAddress), bonusPercent: promo?.value };
  },
  'ton/check-payment': async (u, b) => {
    const it = one('SELECT * FROM intents WHERE id=? AND user_id=?', String(b.intentId), u.id); if (!it) throw new ApiError('Платёж не найден', 404);
    if (it.status === 'pending') { try { await pollDeposits(); } catch (e) { console.error('check-payment', e.message); } }
    const cur = one('SELECT * FROM intents WHERE id=?', it.id);
    return { status: cur.status, credited: cur.status === 'completed' ? cur.credited || Math.floor(cur.amount_ton * S().starsPerTon) : 0 };
  },
  'ton/wallet-info': async (u, b) => { const addr = String(b.address || ''); let balance = null; try { balance = (await walletBalance(addr)).toFixed(2); } catch { } return { addressFormatted: addr, balance }; },
  'create-stars-invoice': async (u, b) => {
    const amount = parseInt(b.amount, 10); if (!(amount >= 1 && amount <= 100000)) throw new ApiError('Сумма от 1 до 100000 ⭐');
    if (!cfg.botToken) throw new ApiError('Бот не настроен', 500);
    const promo = b.promoCode ? promoFor(b.promoCode, 'bonus') : null; if (b.promoCode && !promo) throw new ApiError('Промокод не найден или закончился');
    const url = await tg('createInvoiceLink', { title: `Пополнение ${amount} ⭐`, description: `Пополнение баланса ${cfg.brand}`, payload: `stars:${u.id}:${amount}${promo ? ':' + promo.code : ''}`, provider_token: '', currency: 'XTR', prices: [{ label: 'Stars', amount }] });
    return { success: true, invoice_url: url, bonusPercent: promo?.value };
  },

  // --- бесплатные кейсы ---
  'daily-case/status': async (u, b) => freeStatus(u, ['case1', 'case2'].includes(b.caseId) ? b.caseId : 'case1'),
  'daily-case/prepare-share': (u) => prepareShare(u),
  'referral/prepare-share': (u) => prepareShare(u),
  'daily-case/record-share': u => {
    run('INSERT INTO daily_shares(user_id,day,n) VALUES(?,?,1) ON CONFLICT(user_id,day) DO UPDATE SET n=MIN(n+1,?)', u.id, today(), S().dailyShares);
    const n = one('SELECT n FROM daily_shares WHERE user_id=? AND day=?', u.id, today()).n; return { shareCount: n, sharesDone: n >= S().dailyShares };
  },
  'daily-case/channel-click': u => { run("INSERT INTO kv(k,v) VALUES(?,?) ON CONFLICT(k) DO NOTHING", 'sub:' + u.id, String(Date.now())); return { ok: true }; },
  'daily-case/verify': async u => { const st = await freeStatus(u, 'case1'); return { success: st.canOpen, subscribed: st.subscribed, sharesDone: st.sharesDone, shareCount: st.shareCount }; },

  // --- рефералы ---
  'referral-cases-status': u => ({ totalRefs: referralStats(u.id).count }),
  'referral-data': (u, b) => {
    const days = { '1d': 1, '7d': 7, '30d': 30 }[b.period]; const since = days ? Date.now() - days * DAY : 0;
    const rows = q(`SELECT r.id, r.username, r.name, r.photo_url, COALESCE((SELECT SUM(stars) FROM deposits d WHERE d.user_id=r.id AND d.kind!='admin' AND d.created>=?),0) total_deposits FROM users r WHERE r.referred_by=? AND r.created>=? ORDER BY r.created DESC LIMIT 200`, since, u.id, since);
    return { referrals: rows, totalCount: rows.length };
  },
  'my-ref-promo': u => { const p = one('SELECT * FROM ref_promos WHERE user_id=?', u.id); return p ? { code: p.code, earnings: refEarnings(u.id) } : {}; },
  'create-ref-promo': (u, b) => {
    const code = String(b.code || '').trim(); if (!/^[A-Za-z0-9_-]{5,32}$/.test(code)) throw new ApiError('Промокод: 5–32 символа, латиница, цифры, _ и -');
    const taken = one('SELECT user_id FROM ref_promos WHERE code=? COLLATE NOCASE', code); if (taken && taken.user_id !== u.id) throw new ApiError('Такой промокод уже занят');
    run('INSERT INTO ref_promos(code,user_id) VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET code=excluded.code', code, u.id); return { success: true, code };
  },
  'ref-promo-status': () => ({ canUseRefPromo: true }),
  'use-ref-promo': (u, b) => tx(() => {
    const admin = promoFor(b.code, 'stars');   // промокод от админа: ⭐ сразу на баланс, один раз на человека
    if (admin) { if (!usePromo(admin, u.id)) throw new ApiError('Вы уже активировали этот промокод'); run('UPDATE users SET balance=balance+? WHERE id=?', Math.round(admin.value), u.id); return { success: true, bonus: Math.round(admin.value), newBalance: balanceOf(u.id) }; }
    const cur = getUser(u.id); if (cur.used_ref_promo) throw new ApiError('Вы уже вводили реферальный промокод');
    const p = one('SELECT * FROM ref_promos WHERE code=? COLLATE NOCASE', String(b.code || '').trim()); if (!p) throw new ApiError('Промокод не найден');
    if (p.user_id === u.id) throw new ApiError('Нельзя использовать свой промокод');
    run('UPDATE users SET used_ref_promo=1, balance=balance+?, referred_by=COALESCE(referred_by,?) WHERE id=?', S().refPromoBonus, p.user_id, u.id);
    run('UPDATE ref_promos SET uses=uses+1 WHERE code=?', p.code); return { success: true, bonus: S().refPromoBonus, newBalance: balanceOf(u.id) };
  }),
};
export const inventoryOf = u => q("SELECT * FROM inventory WHERE user_id=? AND state='owned' ORDER BY id DESC", u.id).map(invRow);
