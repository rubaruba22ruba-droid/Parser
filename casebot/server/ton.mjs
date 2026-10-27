// Пополнение: пользователь шлёт TON на cfg.tonAddress с комментарием "dep<telegram_id>".
// Раз в 15 сек опрашиваем toncenter и зачисляем новые входящие транзакции (tx hash уникален — двойного зачисления нет).
import { cfg } from './config.mjs';
import { one, run, tx } from './db.mjs';
export async function pollDeposits(log = console.log) {
  const url = `${cfg.tonApi}/getTransactions?address=${cfg.tonAddress}&limit=50&archival=false` + (cfg.tonApiKey ? `&api_key=${cfg.tonApiKey}` : '');
  const r = await fetch(url); const j = await r.json();
  if (!j.ok) throw new Error('toncenter: ' + JSON.stringify(j).slice(0, 200));
  for (const t of j.result.reverse()) {
    const m = t.in_msg; if (!m || !m.source || !m.value) continue;
    const comment = (m.message || '').trim(); const mt = /^dep(\d+)$/.exec(comment); if (!mt) continue;
    const hash = t.transaction_id.hash; const amount = Number(m.value) / 1e9; const uid = Number(mt[1]);
    if (amount < cfg.minDeposit || one('SELECT 1 FROM deposits WHERE tx_hash=?', hash) || !one('SELECT 1 FROM users WHERE id=?', uid)) continue;
    tx(() => { run('INSERT INTO deposits VALUES(?,?,?,?)', hash, uid, amount, Date.now()); run('UPDATE users SET balance=balance+? WHERE id=?', amount, uid); });
    log(`deposit +${amount} TON -> ${uid}`);
  }
}
export function startDepositWatcher() { const t = () => pollDeposits().catch(e => console.error('poll', e.message)); t(); return setInterval(t, 15000); }
