import { cfg } from './config.mjs';
export async function tg(method, body = {}, timeoutMs = 40000) {
  if (!cfg.botToken) throw new Error('BOT_TOKEN не задан');
  const r = await fetch(`https://api.telegram.org/bot${cfg.botToken}/${method}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs) });
  const j = await r.json(); if (!j.ok) throw new Error(`${method}: ${j.description}`); return j.result;
}
// то же, но с файлом (multipart): tgUpload('sendPhoto', {chat_id, caption}, 'photo', buffer, 'banner.jpg', 'image/jpeg')
export async function tgUpload(method, fields, fileField, buf, filename, type, timeoutMs = 60000) {
  if (!cfg.botToken) throw new Error('BOT_TOKEN не задан');
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) if (v !== undefined && v !== null) fd.append(k, String(v));
  fd.append(fileField, new Blob([buf], { type }), filename);
  const r = await fetch(`https://api.telegram.org/bot${cfg.botToken}/${method}`, { method: 'POST', body: fd, signal: AbortSignal.timeout(timeoutMs) });
  const j = await r.json(); if (!j.ok) throw new Error(`${method}: ${j.description}`); return j.result;
}
export const botLink = () => `https://t.me/${cfg.botUsername}`;
export async function notifyAdmins(text) { for (const id of cfg.adminIds) { try { await tg('sendMessage', { chat_id: id, text, parse_mode: 'HTML' }); } catch (e) { console.error('notify', id, e.message); } } }
