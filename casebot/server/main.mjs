import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { randomInt } from 'node:crypto';
import { cfg } from './config.mjs';
import { q, one, run, tx } from './db.mjs';
import { verifyInitData } from './auth.mjs';
import { CASES, CASE_BY_ID, GIFTS, GIFT_BY_ID, RTP_TARGET } from './cases.mjs';
import { startDepositWatcher } from './ton.mjs';
import { startBot } from './bot.mjs';

const WEB = new URL('../webapp/', import.meta.url).pathname;
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
const r2 = n => Math.round(n * 100) / 100;

function roll(c) { // криптостойкий выбор по весам
  const x = randomInt(0, 1e9) / 1e9; let acc = 0;
  for (const d of c.drops) { acc += d.p; if (x < acc) return { d, x }; }
  return { d: c.drops[c.drops.length - 1], x };
}
const me = u => ({ id: u.id, name: u.name, username: u.username, balance: r2(u.balance), depositAddress: cfg.tonAddress, depositComment: 'dep' + u.id, minDeposit: cfg.minDeposit });

const api = {
  init: u => ({ user: me(u), gifts: GIFTS, rtp: RTP_TARGET,
    cases: CASES.map(c => ({ id: c.id, title: c.title, emoji: c.emoji, price: c.price, note: c.note, winChance: c.winChance,
      drops: c.drops.map(d => ({ giftId: d.giftId, p: d.p })) })) }),
  inventory: u => ({ items: q("SELECT id,gift_id AS giftId,value,case_id AS caseId FROM inventory WHERE user_id=? AND state='owned' ORDER BY id DESC", u.id), user: me(u) }),
  open: (u, b) => {
    const c = CASE_BY_ID.get(b.caseId); if (!c) throw new Error('Нет такого кейса');
    const n = Math.min(Math.max(Number(b.count) || 1, 1), 5);
    return tx(() => {
      const cur = one('SELECT balance FROM users WHERE id=?', u.id);
      if (cur.balance + 1e-9 < c.price * n) throw new Error('Недостаточно баланса');
      run('UPDATE users SET balance=balance-? WHERE id=?', c.price * n, u.id);
      const wins = [];
      for (let i = 0; i < n; i++) {
        const { d, x } = roll(c); const g = GIFT_BY_ID.get(d.giftId);
        const ins = run('INSERT INTO inventory(user_id,gift_id,value,case_id,created) VALUES(?,?,?,?,?)', u.id, g.id, g.price, c.id, Date.now());
        run('INSERT INTO opens(user_id,case_id,price,gift_id,value,roll,created) VALUES(?,?,?,?,?,?,?)', u.id, c.id, c.price, g.id, g.price, x, Date.now());
        wins.push({ invId: Number(ins.lastInsertRowid), giftId: g.id });
      }
      return { wins, user: me(one('SELECT * FROM users WHERE id=?', u.id)) };
    });
  },
  sell: (u, b) => tx(() => {
    const ids = [].concat(b.ids || []).map(Number);
    let sum = 0;
    for (const id of ids) {
      const it = one("SELECT * FROM inventory WHERE id=? AND user_id=? AND state='owned'", id, u.id); if (!it) continue;
      run("UPDATE inventory SET state='sold' WHERE id=?", id); sum += it.value * cfg.sellRate;
    }
    run('UPDATE users SET balance=balance+? WHERE id=?', sum, u.id);
    return { sold: r2(sum), user: me(one('SELECT * FROM users WHERE id=?', u.id)) };
  }),
  withdraw: (u, b) => tx(() => {
    const it = one("SELECT * FROM inventory WHERE id=? AND user_id=? AND state='owned'", Number(b.id), u.id); if (!it) throw new Error('Подарок не найден');
    run("UPDATE inventory SET state='withdraw' WHERE id=?", it.id);
    run('INSERT INTO withdrawals(user_id,inv_id,created) VALUES(?,?,?)', u.id, it.id, Date.now());
    return { ok: true };
  }),
  stats: (u) => { if (!cfg.adminIds.includes(u.id)) throw new Error('forbidden');
    const o = one('SELECT COUNT(*) n, SUM(price) inn, SUM(value) out FROM opens');
    return { opens: o.n, in: o.inn, out: o.out, rtp: o.inn ? o.out / o.inn : null, pendingWithdrawals: q("SELECT * FROM withdrawals WHERE state='pending'") }; },
};

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://x');
    if (url.pathname.startsWith('/api/')) {
      const name = url.pathname.slice(5); if (req.method !== 'POST' || !api[name]) { res.writeHead(404); return res.end(); }
      let body = ''; for await (const ch of req) { body += ch; if (body.length > 1e5) throw new Error('big'); }
      const b = body ? JSON.parse(body) : {};
      const tg = verifyInitData(String(req.headers['x-init-data'] || ''));
      if (!tg) { res.writeHead(401, { 'content-type': 'application/json' }); return res.end('{"error":"auth"}'); }
      run('INSERT INTO users(id,username,name,created) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET username=excluded.username,name=excluded.name', tg.id, tg.username || '', tg.first_name || '', Date.now());
      const user = one('SELECT * FROM users WHERE id=?', tg.id);
      try { const out = api[name](user, b); res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify(out)); }
      catch (e) { res.writeHead(400, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ error: e.message })); }
    }
    let p = normalize(url.pathname).replace(/^(\.\.[/\\])+/, ''); if (p.endsWith('/')) p += 'index.html';
    const data = await readFile(join(WEB, p)).catch(() => null);
    if (!data) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream', 'cache-control': 'no-cache' }); res.end(data);
  } catch (e) { res.writeHead(500); res.end('error'); }
});
server.listen(cfg.port, () => console.log('casebot on :' + cfg.port));
if (!cfg.dev) startDepositWatcher();
if (cfg.botToken) startBot();
