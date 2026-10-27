import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { cfg } from './config.mjs';
import { one, run } from './db.mjs';
import { verifyInitData } from './auth.mjs';
import { routes, inventoryOf, ApiError } from './api.mjs';
import { adminRoutes, isAdmin } from './admin.mjs';
import { startDepositWatcher } from './ton.mjs';
import { startBot } from './bot.mjs';
import { getUser } from './wallet.mjs';

const WEB = resolve(new URL('../webapp/', import.meta.url).pathname) + sep;
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.ico': 'image/x-icon' };
const json = (res, code, obj) => { res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }); res.end(JSON.stringify(obj)); };
const origin = req => cfg.publicUrl || `https://${req.headers.host}`;

function upsertUser(tg, startParam) {
  const now = Date.now(), existing = getUser(tg.id);
  if (!existing) {
    const m = /^ref_(\d+)$/.exec(startParam || ''); const ref = m && Number(m[1]) !== tg.id && getUser(Number(m[1])) ? Number(m[1]) : null;
    run('INSERT INTO users(id,username,name,photo_url,referred_by,created,last_seen) VALUES(?,?,?,?,?,?,?)', tg.id, tg.username || '', tg.first_name || '', tg.photo_url || '', ref, now, now);
  } else run('UPDATE users SET username=?,name=?,photo_url=?,last_seen=? WHERE id=?', tg.username || '', tg.first_name || '', tg.photo_url || '', now, tg.id);
  return getUser(tg.id);
}

async function handleApi(req, res, url) {
  const name = url.pathname.slice(5);
  const m = /^inventory\/(\d+)$/.exec(name);
  const handler = m ? null : (routes[name] || adminRoutes[name]);
  if (!m && !handler) return json(res, 404, { error: 'not found' });
  let body = {};
  if (req.method === 'POST') { let raw = ''; for await (const ch of req) { raw += ch; if (raw.length > 1e5) return json(res, 413, { error: 'too big' }); } try { body = raw ? JSON.parse(raw) : {}; } catch { return json(res, 400, { error: 'bad json' }); } }
  for (const [k, v] of url.searchParams) if (!(k in body)) body[k] = v;
  const auth = verifyInitData(String(req.headers['x-telegram-init-data'] || ''));
  if (!auth) return json(res, 401, { error: 'Ошибка авторизации. Откройте приложение из Telegram' });
  const user = upsertUser(auth.user, auth.startParam);
  if (user.banned) return json(res, 403, { error: 'banned' });
  try {
    if (m) { if (Number(m[1]) !== user.id) throw new ApiError('forbidden', 403); return json(res, 200, inventoryOf(user)); }
    if (adminRoutes[name] && !isAdmin(user)) throw new ApiError('forbidden', 403);
    const out = await handler(user, body); json(res, 200, out);
  } catch (e) {
    if (e instanceof ApiError) return json(res, e.status, { success: false, error: e.message, ...(e.code ? { code: e.code } : {}) });
    if (adminRoutes[name]) return json(res, 400, { success: false, error: e.message });
    console.error('api', name, e); json(res, 500, { success: false, error: 'Ошибка сервера' });
  }
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://x');
    if (url.pathname.startsWith('/api/')) return await handleApi(req, res, url);
    if (url.pathname === '/config.js') {
      res.writeHead(200, { 'content-type': MIME['.js'], 'cache-control': 'no-store' });
      return res.end(`window.__BOT_USERNAME=${JSON.stringify(cfg.botUsername)};window.__BRAND=${JSON.stringify(cfg.brand)};window.__SUPPORT=${JSON.stringify(cfg.support)};
document.addEventListener('DOMContentLoaded',function(){document.title=window.__BRAND;document.querySelectorAll('[data-brand]').forEach(function(e){e.textContent=window.__BRAND});
document.querySelectorAll('[data-bot-link]').forEach(function(a){a.href='https://t.me/'+window.__BOT_USERNAME})});`);
    }
    if (url.pathname === '/tonconnect-manifest.json') return json(res, 200, { url: origin(req), name: cfg.brand, iconUrl: origin(req) + '/images/icon-180.png' });
    let p = decodeURIComponent(url.pathname); if (p.endsWith('/')) p += 'index.html';
    const file = resolve(WEB, '.' + p);
    if (!file.startsWith(WEB)) { res.writeHead(403); return res.end(); }
    const data = await readFile(file).catch(() => null);
    if (!data) { res.writeHead(404, { 'content-type': 'text/plain' }); return res.end('not found'); }
    const ext = extname(file);
    res.writeHead(200, { 'content-type': MIME[ext] || 'application/octet-stream', 'x-content-type-options': 'nosniff', 'cache-control': ['.png', '.svg', '.webp'].includes(ext) ? 'public, max-age=3600' : 'no-cache' });
    res.end(data);
  } catch (e) { console.error(e); res.writeHead(500); res.end('error'); }
});
server.listen(cfg.port, () => console.log(`casebot on :${cfg.port}${cfg.dev ? ' (DEV)' : ''}`));
if (!cfg.dev) startDepositWatcher();
if (cfg.botToken) startBot().catch(e => console.error('bot', e));
else console.warn('BOT_TOKEN не задан — бот и платежи Stars отключены');
