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

// для /ton в боте: когда последний раз удалось проверить кошелёк, последняя ошибка, последние входящие переводы
export const tonStatus = { lastOk: 0, lastErr: '', lastErrAt: 0, recent: [] };
const remember = (t, ton, text, result) => {
  if (tonStatus.recent.some(r => r.hash === t.transaction_id.hash)) return;
  tonStatus.recent.unshift({ hash: t.transaction_id.hash, at: (t.utime || 0) * 1000, ton, text, from: t.in_msg.source, result });
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
    try { txs = await call('getTransactions', { address: cfg.tonAddress, limit: 50, archival: 'false' }); tonStatus.lastOk = Date.now(); }
    catch (e) { tonStatus.lastErr = e.message; tonStatus.lastErrAt = Date.now(); throw e; }
    const since = Number(kvGet('ton_since') || 0);
    // ждём оплату по заявкам за последние сутки (даже если клиент уже «сдался» или кошелёк сказал «отменено»)
    const open = q("SELECT * FROM intents WHERE status IN ('pending','expired') AND created>?", Date.now() - 86400000);
    for (const t of txs) {
      const m = t.in_msg; if (!m || !m.source || !m.value || m.value === '0') continue;
      const hash = t.transaction_id.hash;
      if (one('SELECT 1 FROM deposits WHERE ref=?', hash) || kvGet('tx:' + hash)) continue;      // уже обработан
      const nano = BigInt(m.value), ton = Number(nano) / 1e9, text = String(m.message || '').trim(), from = addrKey(m.source), at = (t.utime || 0) * 1000;
      // 1) по комментарию-метке заявки; 2) по адресу кошелька, подключённого при создании заявки (если кошелёк потерял комментарий)
      let intent = open.find(i => i.status !== 'completed' && i.comment.toLowerCase() === text.toLowerCase());
      if (!intent && from) intent = open.filter(i => i.status !== 'completed' && i.from_addr === from && at >= i.created - 120000).sort((x, y) => y.created - x.created)[0];
      if (intent) {
        const got = credit(intent.user_id, ton, hash, intent.promo);   // зачисляем сколько реально пришло
        intent.status = 'completed';
        run("UPDATE intents SET status='completed', credited=? WHERE id=?", got, intent.id);
        remember(t, ton, text, `зачислено ${got} ⭐ → ${intent.user_id}`);
        continue;
      }
      const mt = /^dep\s*(\d+)$/i.exec(text); // ручной перевод с любого кошелька с комментарием dep<id>
      if (mt && one('SELECT 1 FROM users WHERE id=?', Number(mt[1])) && ton >= S().minDepositTon) {
        const got = credit(Number(mt[1]), ton, hash, null); remember(t, ton, text, `зачислено ${got} ⭐ → ${mt[1]}`); continue;
      }
      if (at < since) continue;                                     // старые переводы до запуска бота не трогаем
      kvSet('tx:' + hash, 1);
      remember(t, ton, text, 'не опознан — сообщил админу');
      // похожая по сумме заявка за последний час — подскажем, кому скорее всего
      const guess = open.filter(i => Math.abs(i.amount_ton - ton) <= Math.max(0.01, i.amount_ton * 0.02) && at >= i.created - 120000 && at - i.created < 3600000).sort((x, y) => y.created - x.created)[0];
      const u = guess && one('SELECT id, username FROM users WHERE id=?', guess.user_id), stars = Math.floor(ton * S().starsPerTon);
      notifyAdmins(`💎 Пришло <b>${ton} TON</b> от <code>${m.source}</code>\nКомментарий: «${(text || '—').replace(/[<>&]/g, '')}»\nНе понял, кому зачислить.` +
        (u ? `\nПохоже на заявку ${u.id} @${u.username || '—'} на ${guess.amount_ton} TON:\n/give ${u.id} ${stars}` : `\nВыдай вручную: /give ID ${stars}`));
    }
    run("UPDATE intents SET status='expired' WHERE status='pending' AND created<?", Date.now() - 6 * 3600000);
  })().finally(() => { polling = null; }));
}
export function startDepositWatcher(log = console) {
  if (!validAddress(cfg.tonAddress)) log.error('⚠️ TON_ADDRESS не проходит проверку контрольной суммы:', cfg.tonAddress);
  if (!kvGet('ton_since')) kvSet('ton_since', Date.now());
  const tick = async () => {
    const hasPending = one("SELECT 1 FROM intents WHERE status='pending' AND created>?", Date.now() - 1800000);
    try { await pollDeposits(true); } catch (e) { log.error('ton poll:', e.message); }
    setTimeout(tick, hasPending ? 6000 : 45000);
  };
  tick();
}
