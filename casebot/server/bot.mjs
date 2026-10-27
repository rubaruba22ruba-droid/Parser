// Минимальный бот на long-polling: /start -> кнопка открытия Mini App (WEBAPP_URL).
import { cfg } from './config.mjs';
const api = (m, b) => fetch(`https://api.telegram.org/bot${cfg.botToken}/${m}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) }).then(r => r.json());
export async function startBot() {
  let off = 0; const url = process.env.WEBAPP_URL;
  for (;;) {
    try {
      const j = await api('getUpdates', { offset: off, timeout: 30 });
      for (const u of j.result || []) {
        off = u.update_id + 1; const m = u.message; if (!m?.text?.startsWith('/start')) continue;
        await api('sendMessage', { chat_id: m.chat.id, text: '🎁 Открывай кейсы и выигрывай NFT-подарки!', reply_markup: url ? { inline_keyboard: [[{ text: '🎮 Играть', web_app: { url } }]] } : undefined });
      }
    } catch (e) { console.error('bot', e.message); await new Promise(r => setTimeout(r, 3000)); }
  }
}
