// Админ-панель: статистика, свои проценты (RTP, апгрейд, рефералы, вывод), шансы и цены кейсов, юзеры, выводы, промокоды, рассылка.
import { cfg } from './config.mjs';
import { q, one, run, tx } from './db.mjs';
import { settings, saveSettings } from './settings.mjs';
import { rebuildCases, caseDefs, CASES, GIFT_BY_ID } from './catalog.mjs';
import { getUser } from './wallet.mjs';
import { tg } from './tg.mjs';

export const isAdmin = u => cfg.adminIds.includes(u.id) || (cfg.dev && cfg.adminIds.length === 0);
// Кому выдать: 'me' / пусто — себе, '@username' или username, либо Telegram ID
export function findUser(target, me) {
  const t = String(target ?? '').trim();
  if (!t || t.toLowerCase() === 'me' || t.toLowerCase() === 'себе') return getUser(me);
  if (/^\d+$/.test(t)) return getUser(Number(t));
  return one('SELECT * FROM users WHERE username=? COLLATE NOCASE', t.replace(/^@/, ''));
}
const DAY = 86400000;
const NUM_KEYS = ['caseRtp', 'hitTarget', 'bigWin', 'lossFloor', 'junkCap', 'maxItem', 'upgradeFactor', 'upgradeMaxChance', 'referralPercent', 'refPromoBonus', 'withdrawMinTon', 'withdrawWindowDays', 'starsPerTon', 'minDepositTon', 'dailyShares', 'freeCooldownHours'];

function caseView(c) {
  return { id: c.id, name: c.name, price: c.price, free: c.free, disabled: !!c.disabled, rtp: c.rtp, hit: c.hit, manual: !!(settings().cases[c.id] || {}).manual,
    items: c.items.map(i => { const g = GIFT_BY_ID.get(i.giftId); return { id: g.id, name: g.name, value: g.value, image: g.image, p: i.p }; }) };
}
function stats() {
  const since = t => Date.now() - t;
  const dep = t => one("SELECT COALESCE(SUM(ton),0) ton, COALESCE(SUM(stars),0) stars, COUNT(*) n FROM deposits WHERE kind!='admin' AND created>=?", since(t));
  const perCase = q("SELECT case_id, COUNT(*) n, SUM(price) inn, SUM(value) out FROM opens WHERE case_id!='upgrade' GROUP BY case_id");
  const upg = one("SELECT COUNT(*) n, COALESCE(SUM(price),0) inn, COALESCE(SUM(value),0) out FROM opens WHERE case_id='upgrade'");
  return {
    users: one('SELECT COUNT(*) n, COALESCE(SUM(balance),0) bal FROM users').n, balances: one('SELECT COALESCE(SUM(balance),0) b FROM users').b,
    newUsers24h: one('SELECT COUNT(*) n FROM users WHERE created>=?', since(DAY)).n,
    deposits: { d1: dep(DAY), d7: dep(7 * DAY), all: dep(Date.now()) },
    cases: perCase.map(r => ({ ...r, rtp: r.inn ? r.out / r.inn : null })), upgrade: { ...upg, rtp: upg.inn ? upg.out / upg.inn : null },
    pendingWithdrawals: one("SELECT COUNT(*) n FROM withdrawals WHERE state='pending'").n,
  };
}
let broadcasting = false;
async function broadcast(text) {
  if (!cfg.botToken) throw new Error('BOT_TOKEN не задан'); if (broadcasting) throw new Error('Рассылка уже идёт');
  broadcasting = true; const ids = q('SELECT id FROM users WHERE banned=0').map(r => r.id); let ok = 0;
  (async () => { for (const id of ids) { try { await tg('sendMessage', { chat_id: id, text, parse_mode: 'HTML' }); ok++; } catch { } await new Promise(r => setTimeout(r, 45)); } broadcasting = false; console.log(`рассылка: ${ok}/${ids.length}`); })();
  return { queued: ids.length };
}

export const adminRoutes = {
  'admin/overview': u => ({ me: { id: u.id, balance: getUser(u.id).balance }, stats: stats(), settings: settings(), cases: CASES.map(caseView) }),
  'admin/settings/save': (u, b) => {
    const patch = {};
    for (const k of NUM_KEYS) if (b[k] !== undefined && b[k] !== '') { const v = Number(b[k]); if (!Number.isFinite(v) || v < 0) throw new Error(`Неверное значение ${k}`); patch[k] = v; }
    if (patch.caseRtp > 3 || patch.upgradeFactor > 1.5 || patch.upgradeMaxChance > 1 || patch.hitTarget > 0.95 || (patch.bigWin ?? settings().bigWin) > (patch.hitTarget ?? settings().hitTarget) || patch.junkCap > 1 || patch.lossFloor > 0.95) throw new Error('Слишком большое значение');
    saveSettings(patch); rebuildCases(); return { ok: true, settings: settings(), cases: CASES.map(caseView) };
  },
  'admin/case/save': (u, b) => {
    const def = caseDefs().find(d => d.id === b.id); if (!def) throw new Error('Нет кейса');
    const cur = { ...(settings().cases[def.id] || {}) };
    if (b.price !== undefined && b.price !== '') cur.price = Math.max(0, Math.round(Number(b.price)));
    if (b.rtp !== undefined) cur.rtp = b.rtp === '' || b.rtp === null ? undefined : Number(b.rtp);
    if (b.disabled !== undefined) cur.disabled = !!b.disabled;
    if (b.manual !== undefined) cur.manual = b.manual && Object.keys(b.manual).length ? Object.fromEntries(Object.entries(b.manual).map(([k, v]) => [k, Math.max(0, Number(v) || 0)])) : undefined;
    saveSettings({ cases: { ...settings().cases, [def.id]: cur } }); rebuildCases();
    return { ok: true, case: caseView(CASES.find(c => c.id === def.id)) };
  },
  'admin/users': (u, b) => {
    const s = String(b.q || '').trim(), like = `%${s.replace(/^@/, '')}%`;
    return q(`SELECT u.id, u.username, u.name, u.balance, u.banned, u.created, COALESCE((SELECT SUM(ton) FROM deposits d WHERE d.user_id=u.id AND d.kind!='admin'),0) dep_ton,
      (SELECT COUNT(*) FROM users r WHERE r.referred_by=u.id) refs FROM users u WHERE ?='' OR CAST(u.id AS TEXT)=? OR u.username LIKE ? OR u.name LIKE ? ORDER BY u.last_seen DESC LIMIT 50`, s, s, like, like);
  },
  'admin/user/balance': (u, b) => {
    const t = findUser(b.target ?? b.id, u.id); if (!t) throw new Error('Юзер не найден — он должен хотя бы раз открыть бота');
    const delta = Math.round(Number(b.delta) || 0); if (!delta) throw new Error('Укажите сумму');
    run('UPDATE users SET balance=MAX(0,balance+?) WHERE id=?', delta, t.id);
    run('INSERT INTO kv(k,v) VALUES(?,?)', 'grant:' + Date.now() + ':' + t.id, JSON.stringify({ by: u.id, to: t.id, delta }));
    return getUser(t.id);
  },
  'admin/user/ban': (u, b) => { run('UPDATE users SET banned=? WHERE id=?', b.banned ? 1 : 0, Number(b.id)); return getUser(Number(b.id)); },
  'admin/withdrawals': () => q(`SELECT w.id, w.user_id, w.state, w.created, i.name, i.value, i.image, us.username, COALESCE((SELECT SUM(ton) FROM deposits d WHERE d.user_id=w.user_id AND d.kind!='admin'),0) dep_ton
      FROM withdrawals w JOIN inventory i ON i.id=w.inv_id JOIN users us ON us.id=w.user_id ORDER BY (w.state='pending') DESC, w.id DESC LIMIT 100`),
  'admin/withdrawal/set': (u, b) => tx(() => {
    const w = one("SELECT * FROM withdrawals WHERE id=? AND state='pending'", Number(b.id)); if (!w) throw new Error('Заявка не найдена');
    const done = b.state === 'done'; run('UPDATE withdrawals SET state=?, updated=? WHERE id=?', done ? 'done' : 'rejected', Date.now(), w.id);
    run('UPDATE inventory SET state=? WHERE id=?', done ? 'withdrawn' : 'owned', w.inv_id);
    if (cfg.botToken) tg('sendMessage', { chat_id: w.user_id, text: done ? '✅ Ваш подарок выдан. Спасибо за игру!' : '❌ Заявка на вывод отклонена, подарок вернулся в инвентарь.' }).catch(() => {});
    return { ok: true };
  }),
  'admin/promos': () => q('SELECT * FROM promos ORDER BY created DESC'),
  'admin/promo/create': (u, b) => {
    const code = String(b.code || '').trim(); if (!/^[A-Za-z0-9_-]{3,32}$/.test(code)) throw new Error('Код: 3–32 символа (латиница, цифры, _ -)');
    const type = b.type === 'bonus' ? 'bonus' : 'stars', value = Number(b.value); if (!(value > 0)) throw new Error('Значение > 0');
    run('INSERT INTO promos(code,type,value,uses_left,created) VALUES(?,?,?,?,?) ON CONFLICT(code) DO UPDATE SET type=excluded.type, value=excluded.value, uses_left=excluded.uses_left', code, type, value, Math.max(1, parseInt(b.uses, 10) || 100), Date.now());
    return { ok: true };
  },
  'admin/promo/delete': (u, b) => { run('DELETE FROM promos WHERE code=?', String(b.code)); return { ok: true }; },
  'admin/broadcast': (u, b) => { const t = String(b.text || '').trim(); if (!t) throw new Error('Пустой текст'); return broadcast(t); },
};

// ---- промокоды для игроков ----
export function promoFor(code, type) {
  const p = one('SELECT * FROM promos WHERE code=?', String(code || '').trim());
  return p && p.type === type && p.uses_left > 0 ? p : null;
}
export function usePromo(p, userId) {
  const r = run('INSERT OR IGNORE INTO promo_uses(code,user_id,created) VALUES(?,?,?)', p.code, userId, Date.now());
  if (!r.changes) return false;
  run('UPDATE promos SET uses_left=uses_left-1, used=used+1 WHERE code=?', p.code); return true;
}
