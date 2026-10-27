import { createHmac, timingSafeEqual } from 'node:crypto';
import { cfg } from './config.mjs';
// Проверка подписи Telegram WebApp initData (HMAC-SHA256 от токена бота).
export function verifyInitData(initData) {
  if (!initData) return null;
  if (cfg.dev && initData.startsWith('dev:')) { const id = Number(initData.slice(4)) || 1; return { user: { id, username: 'dev' + id, first_name: 'Dev ' + id }, startParam: '' }; }
  if (cfg.dev && /(^|&)dev=1(&|$)/.test(initData)) { try { return { user: JSON.parse(new URLSearchParams(initData).get('user')), startParam: '' }; } catch { return null; } }
  if (!cfg.botToken) return null;
  const p = new URLSearchParams(initData), hash = p.get('hash'); if (!hash) return null;
  p.delete('hash');
  const str = [...p.entries()].map(([k, v]) => `${k}=${v}`).sort().join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(cfg.botToken).digest();
  const calc = createHmac('sha256', secret).update(str).digest(), got = Buffer.from(hash, 'hex');
  if (got.length !== calc.length || !timingSafeEqual(got, calc)) return null;
  if (Date.now() / 1000 - Number(p.get('auth_date') || 0) > 86400 * 2) return null;
  try { return { user: JSON.parse(p.get('user')), startParam: p.get('start_param') || '' }; } catch { return null; }
}
