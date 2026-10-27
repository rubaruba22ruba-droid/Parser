import { createHmac, timingSafeEqual } from 'node:crypto';
import { cfg } from './config.mjs';
// Проверка Telegram WebApp initData (HMAC-SHA256 по токену бота).
export function verifyInitData(initData) {
  if (cfg.dev && initData.startsWith('dev:')) { const id = Number(initData.slice(4)) || 1; return { id, username: 'dev' + id, first_name: 'Dev' }; }
  if (!cfg.botToken) return null;
  const p = new URLSearchParams(initData); const hash = p.get('hash'); if (!hash) return null;
  p.delete('hash');
  const str = [...p.entries()].map(([k, v]) => `${k}=${v}`).sort().join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(cfg.botToken).digest();
  const calc = createHmac('sha256', secret).update(str).digest();
  const got = Buffer.from(hash, 'hex');
  if (got.length !== calc.length || !timingSafeEqual(got, calc)) return null;
  if (Date.now() / 1000 - Number(p.get('auth_date') || 0) > 86400) return null;
  try { return JSON.parse(p.get('user')); } catch { return null; }
}
