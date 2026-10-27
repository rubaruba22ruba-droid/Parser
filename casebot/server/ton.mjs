// Пополнение TON: TonConnect-платёж с уникальным комментарием + ручной перевод с комментарием dep<telegram_id>.
import { randomBytes } from 'node:crypto';
import { cfg } from './config.mjs';
import { q, one, run } from './db.mjs';
import { addDeposit } from './wallet.mjs';

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

export function createIntent(userId, amountTon) {
  const nano = BigInt(Math.round(amountTon * 1e9));
  const id = randomBytes(6).toString('hex'), comment = 'cg' + id;
  run('INSERT INTO intents(id,user_id,amount_nano,amount_ton,comment,created) VALUES(?,?,?,?,?,?)', id, userId, nano.toString(), amountTon, comment, Date.now());
  return { intentId: id, walletAddress: cfg.tonAddress, amountNano: nano.toString(), comment, commentBoc: commentBoc(comment) };
}

const call = async (method, params) => {
  const u = new URL(cfg.tonApi + '/' + method); for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  if (cfg.tonApiKey) u.searchParams.set('api_key', cfg.tonApiKey);
  const r = await fetch(u, { signal: AbortSignal.timeout(10000) }), j = await r.json();
  if (!j.ok) throw new Error('toncenter: ' + JSON.stringify(j).slice(0, 160)); return j.result;
};
export const walletBalance = async addr => Number(await call('getAddressBalance', { address: addr })) / 1e9;

let lastPoll = 0, polling = null;
export function pollDeposits(force = false) {
  if (polling) return polling;
  if (!force && Date.now() - lastPoll < 2500) return Promise.resolve();
  lastPoll = Date.now();
  return (polling = (async () => {
    const txs = await call('getTransactions', { address: cfg.tonAddress, limit: 50, archival: 'false' });
    const pending = q("SELECT * FROM intents WHERE status='pending'");
    for (const t of txs) {
      const m = t.in_msg; if (!m || !m.source || !m.value) continue;
      const hash = t.transaction_id.hash, nano = BigInt(m.value), text = String(m.message || '').trim();
      const intent = pending.find(i => i.comment === text);
      if (intent) {
        if (nano * 100n < BigInt(intent.amount_nano) * 99n) continue; // недоплата (>1%) — не засчитываем
        const ton = Number(nano) / 1e9, stars = Math.floor(ton * cfg.starsPerTon);
        if (addDeposit({ ref: hash, kind: 'ton', userId: intent.user_id, stars, ton })) run("UPDATE intents SET status='completed', credited=? WHERE id=?", stars, intent.id);
        else run("UPDATE intents SET status='completed' WHERE id=?", intent.id);
        continue;
      }
      const mt = /^dep(\d+)$/.exec(text); // ручной перевод с любого кошелька
      if (mt && one('SELECT 1 FROM users WHERE id=?', Number(mt[1]))) {
        const ton = Number(nano) / 1e9; if (ton < cfg.minDepositTon) continue;
        addDeposit({ ref: hash, kind: 'ton', userId: Number(mt[1]), stars: Math.floor(ton * cfg.starsPerTon), ton });
      }
    }
    run("UPDATE intents SET status='expired' WHERE status='pending' AND created<?", Date.now() - 6 * 3600000);
  })().finally(() => { polling = null; }));
}
export function startDepositWatcher(log = console) {
  if (!validAddress(cfg.tonAddress)) log.error('⚠️ TON_ADDRESS не проходит проверку контрольной суммы:', cfg.tonAddress);
  const tick = async () => {
    const hasPending = one("SELECT 1 FROM intents WHERE status='pending' AND created>?", Date.now() - 1800000);
    try { await pollDeposits(true); } catch (e) { log.error('ton poll:', e.message); }
    setTimeout(tick, hasPending ? 6000 : 45000);
  };
  tick();
}
