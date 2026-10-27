// Пополнение TON: TonConnect-платёж с уникальным комментарием + ручной перевод с комментарием dep<telegram_id>.
import { randomBytes } from 'node:crypto';
import { cfg } from './config.mjs';
import { settings as S } from './settings.mjs';
import { q, one, run } from './db.mjs';
import { addDeposit } from './wallet.mjs';
import { promoFor, usePromo } from './admin.mjs';
import { tg, notifyAdmins } from './tg.mjs';

// --- проверка адреса (base64url, CRC16-XMODEM) ---
const crc16 = b => { let c = 0; for (const x of b) { c ^= x << 8; for (let i = 0; i < 8; i++) c = c & 0x8000 ? ((c << 1) ^ 0x1021) & 0xffff : (c << 1) & 0xffff; } return c; };
export function validAddress(a) {
  try { const b = Buffer.from(a.replace(/-/g, '+').replace(/_/g, '/'), 'base64'); return b.length === 36 && crc16(b.subarray(0, 34)) === b.readUInt16BE(34); } catch { return false; }
}

// --- BOC текстового комментария: ячейка [uint32 0][utf8 text], без ссылок и CRC ---
export function commentBoc(text) {
  const t = Buffer.from(text, 'utf8'); if (t.length > 120) throw new Error('comment too long');
  const data = Buffer.concat([Buffer.alloc(4), t]);
  const cell = Buffer.concat([Buffer.from([0x00, data.length * 2]), data]);
  return Buffer.concat([Buffer.from([0xb5, 0xee, 0x9c, 0x72, 0x01, 0x01, 0x01, 0x01, 0x00, cell.length, 0x00]), cell]).toString('base64');
}

// адрес → «workchain:hex» — одинаково и для EQ…/UQ… (toncenter), и для 0:abcd… (TonConnect)
export function addrKey(a) {
  a = String(a || '').trim(); if (!a) return '';
  const raw = /^(-?\d+):([0-9a-fA-F]{64})$/.exec(a); if (raw) return `${Number(raw[1])}:${raw[2].toLowerCase()}`;
  try { const b = Buffer.from(a.replace(/-/g, '+').replace(/_/g, '/'), 'base64'); return b.length === 36 ? `${b.readInt8(1)}:${b.subarray(2, 34).toString('hex')}` : ''; } catch { return ''; }
}

export function createIntent(userId, amountTon, promo = null, fromAddress = '') {
  const nano = BigInt(Math.round(amountTon * 1e9));
  const id = randomBytes(6).toString('hex'), comment = 'cg' + id;
  run('INSERT INTO intents(id,user_id,amount_nano,amount_ton,comment,created,promo,from_addr) VALUES(?,?,?,?,?,?,?,?)', id, userId, nano.toString(), amountTon, comment, Date.now(), promo, addrKey(fromAddress));
  return { intentId: id, walletAddress: cfg.tonAddress, amountNano: nano.toString(), comment, commentBoc: commentBoc(comment) };
}

const call = async (method, params) => {
  const u = new URL(cfg.tonApi + '/' + method); for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  if (cfg.tonApiKey) u.searchParams.set('api_key', cfg.tonApiKey);
  const r = await fetch(u, { signal: AbortSignal.timeout(10000) }), j = await r.json();
  if (!j.ok) throw new Error('toncenter: ' + JSON.stringify(j).slice(0, 160)); return j.result;
};
export const walletBalance = async addr => Number(await call('getAddressBalance', { address: addr })) / 1e9;

// --- комментарий из BOC (если API сам не расшифровал): корневая ячейка [uint32 0][текст], хвост — по первой ссылке ---
export function commentFromBoc(b64) {
  try {
    const b = Buffer.from(String(b64), /^[0-9a-f]+$/i.test(b64) ? 'hex' : 'base64');
    if (b.readUInt32BE(0) !== 0xb5ee9c72) return '';
    const flags = b[4], hasIdx = flags & 0x80, size = flags & 7, off = b[5]; let p = 6;
    const rd = n => { let v = 0; for (let i = 0; i < n; i++) v = v * 256 + b[p++]; return v; };
    const cells = rd(size), roots = rd(size); rd(size); rd(off); const root = rd(size); p += (roots - 1) * size; if (hasIdx) p += cells * off;
    const list = [];
    for (let i = 0; i < cells; i++) {
      const d1 = b[p++], d2 = b[p++], refs = d1 & 7, len = Math.ceil(d2 / 2);
      const data = b.subarray(p, p + len); p += len; const r = []; for (let k = 0; k < refs; k++) r.push(rd(size));
      list.push({ data: d2 % 2 ? data.subarray(0, len - 1) : data, refs: r });   // нецелый байт в тексте не бывает — отбрасываем
    }
    let c = list[root]; if (!c || c.data.length < 4 || c.data.readUInt32BE(0) !== 0) return '';
    const parts = [c.data.subarray(4)];
    for (let guard = 0; c.refs.length && guard < 16; guard++) { c = list[c.refs[0]]; if (!c) break; parts.push(c.data); }
    return Buffer.concat(parts).toString('utf8');
  } catch { return ''; }
}
const toHex = h => /^[0-9a-f]{64}$/i.test(h) ? h.toLowerCase() : Buffer.from(String(h), 'base64').toString('hex');

// --- входящие переводы на кошелёк: несколько источников, берём первый ответивший ---
// toncenter v2 без архивных нод иногда отвечает LITE_SERVER_UNKNOWN на каждый запрос — поэтому основной v3 (индексатор)
const PROVIDERS = [
  ['toncenter v3', async () => {
    const u = `https://toncenter.com/api/v3/transactions?account=${encodeURIComponent(cfg.tonAddress)}&limit=50&offset=0&sort=desc`;
    const r = await fetch(u, { headers: cfg.tonApiKey ? { 'X-API-Key': cfg.tonApiKey } : {}, signal: AbortSignal.timeout(12000) });
    const j = await r.json(); if (!Array.isArray(j.transactions)) throw new Error(JSON.stringify(j).slice(0, 160));
    return j.transactions.map(t => { const m = t.in_msg || {}, mc = m.message_content || {};
      return { hash: t.hash, utime: t.now, source: m.source, value: m.value, text: (mc.decoded && mc.decoded.comment) || commentFromBoc(mc.body || '') }; });
  }],
  ['tonapi', async () => {
    const r = await fetch(`https://tonapi.io/v2/blockchain/accounts/${encodeURIComponent(cfg.tonAddress)}/transactions?limit=50`, { signal: AbortSignal.timeout(12000) });
    const j = await r.json(); if (!Array.isArray(j.transactions)) throw new Error(JSON.stringify(j).slice(0, 160));
    return j.transactions.map(t => { const m = t.in_msg || {};
      return { hash: t.hash, utime: t.utime, source: m.source && m.source.address, value: m.value, text: (m.decoded_body && m.decoded_body.text) || commentFromBoc(m.raw_body || '') }; });
  }],
  ['toncenter v2', async () => (await call('getTransactions', { address: cfg.tonAddress, limit: 50, archival: 'true' })).map(t => {
    const m = t.in_msg || {}; return { hash: t.transaction_id.hash, utime: t.utime, source: m.source, value: m.value, text: m.message || commentFromBoc((m.msg_data && m.msg_data.body) || '') }; })],
];
async function fetchIncoming() {
  const errs = [];
  for (const [name, get] of PROVIDERS) {
    try { const list = await get(); tonStatus.provider = name; return list; }
    catch (e) { errs.push(`${name}: ${String(e.message).slice(0, 120)}`); }
  }
  throw new Error(errs.join(' | '));
}

// для /ton в боте: когда последний раз удалось проверить кошелёк, последняя ошибка, последние входящие переводы
export const tonStatus = { lastOk: 0, lastErr: '', lastErrAt: 0, provider: '', recent: [] };
const remember = (t, ton, result) => {
  if (tonStatus.recent.some(r => r.hash === t.hash)) return;
  tonStatus.recent.unshift({ hash: t.hash, at: t.utime * 1000, ton, text: t.text, from: t.source, result });
  tonStatus.recent.length = Math.min(tonStatus.recent.length, 10);
};
const kvGet = k => one('SELECT v FROM kv WHERE k=?', k)?.v;
const kvSet = (k, v) => run('INSERT INTO kv(k,v) VALUES(?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v', k, String(v));

function credit(userId, ton, hash, promoCode) {
  const stars = Math.floor(ton * S().starsPerTon);
  const promo = promoCode ? promoFor(promoCode, 'bonus') : null, bonus = promo && usePromo(promo, userId) ? Math.floor(stars * promo.value / 100) : 0;
  if (!addDeposit({ ref: hash, kind: 'ton', userId, stars, ton, bonus })) return 0;
  tg('sendMessage', { chat_id: userId, text: `✅ Баланс пополнен на ${stars + bonus} ⭐ (${ton} TON)${bonus ? ` — с бонусом ${promo.value}%` : ''}` }).catch(() => {});
  console.log(`TON: +${ton} TON → ${userId} (${stars + bonus} ⭐)`);
  return stars + bonus;
}

let lastPoll = 0, polling = null;
export function pollDeposits(force = false) {
  if (polling) return polling;
  if (!force && Date.now() - lastPoll < 2500) return Promise.resolve();
  lastPoll = Date.now();
  return (polling = (async () => {
    let txs;
    try { txs = await fetchIncoming(); tonStatus.lastOk = Date.now(); }
    catch (e) { tonStatus.lastErr = e.message; tonStatus.lastErrAt = Date.now(); throw e; }
    const since = Number(kvGet('ton_since') || 0);
    // ждём оплату по заявкам за последние сутки (даже если клиент уже «сдался» или кошелёк сказал «отменено»)
    const open = q("SELECT * FROM intents WHERE status IN ('pending','expired') AND created>?", Date.now() - 86400000);
    for (const raw of txs) {
      if (!raw.hash || !raw.source || !raw.value || String(raw.value) === '0') continue;
      const hash = toHex(raw.hash), legacy = Buffer.from(hash, 'hex').toString('base64');   // раньше хранили base64 из v2
      const t = { ...raw, hash, text: String(raw.text || '').trim(), utime: Number(raw.utime) || 0 };
      if (one('SELECT 1 FROM deposits WHERE ref IN (?,?)', hash, legacy) || kvGet('tx:' + hash) || kvGet('tx:' + legacy)) continue;  // уже обработан
      const nano = BigInt(String(t.value)), ton = Number(nano) / 1e9, text = t.text, from = addrKey(t.source), at = t.utime * 1000;
      // 1) по комментарию-метке заявки; 2) по адресу кошелька, подключённого при создании заявки (если кошелёк потерял комментарий)
      let intent = open.find(i => i.status !== 'completed' && text && i.comment.toLowerCase() === text.toLowerCase());
      if (!intent && from) intent = open.filter(i => i.status !== 'completed' && i.from_addr === from && at >= i.created - 120000).sort((x, y) => y.created - x.created)[0];
      if (intent) {
        const got = credit(intent.user_id, ton, hash, intent.promo);   // зачисляем сколько реально пришло
        intent.status = 'completed';
        run("UPDATE intents SET status='completed', credited=? WHERE id=?", got, intent.id);
        remember(t, ton, `зачислено ${got} ⭐ → ${intent.user_id}`);
        continue;
      }
      const mt = /^dep\s*(\d+)$/i.exec(text); // ручной перевод с любого кошелька с комментарием dep<id>
      if (mt && one('SELECT 1 FROM users WHERE id=?', Number(mt[1])) && ton >= S().minDepositTon) {
        const got = credit(Number(mt[1]), ton, hash, null); remember(t, ton, `зачислено ${got} ⭐ → ${mt[1]}`); continue;
      }
      if (at < since) continue;                                     // переводы старше суток до первого запуска не трогаем
      kvSet('tx:' + hash, 1);
      remember(t, ton, 'не опознан — сообщил админу');
      // похожая по сумме заявка за последний час — подскажем, кому скорее всего
      const guess = open.filter(i => Math.abs(i.amount_ton - ton) <= Math.max(0.01, i.amount_ton * 0.02) && at >= i.created - 120000 && at - i.created < 3600000).sort((x, y) => y.created - x.created)[0];
      const u = guess && one('SELECT id, username FROM users WHERE id=?', guess.user_id), stars = Math.floor(ton * S().starsPerTon);
      notifyAdmins(`💎 Пришло <b>${ton} TON</b> от <code>${t.source}</code>\nКомментарий: «${(text || '—').replace(/[<>&]/g, '')}»\nНе понял, кому зачислить.` +
        (u ? `\nПохоже на заявку ${u.id} @${u.username || '—'} на ${guess.amount_ton} TON:\n/give ${u.id} ${stars}` : `\nВыдай вручную: /give ID ${stars}`));
    }
    run("UPDATE intents SET status='expired' WHERE status='pending' AND created<?", Date.now() - 6 * 3600000);
  })().finally(() => { polling = null; }));
}
export function startDepositWatcher(log = console) {
  if (!validAddress(cfg.tonAddress)) log.error('⚠️ TON_ADDRESS не проходит проверку контрольной суммы:', cfg.tonAddress);
  if (!kvGet('ton_since')) kvSet('ton_since', Date.now() - 86400000);   // при первом запуске разбираем и переводы за последние сутки
  const tick = async () => {
    const hasPending = one("SELECT 1 FROM intents WHERE status='pending' AND created>?", Date.now() - 1800000);
    try { await pollDeposits(true); } catch (e) { log.error('ton poll:', e.message); }
    setTimeout(tick, hasPending ? 6000 : 45000);
  };
  tick();
}
