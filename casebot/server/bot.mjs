// Telegram-бот (long polling): приветствие → Mini App, платежи Stars, команды админа.
import { cfg } from './config.mjs';
import { settings as S } from './settings.mjs';
import { one, run, q } from './db.mjs';
import { tg } from './tg.mjs';
import { addDeposit, getUser } from './wallet.mjs';
import { promoFor, usePromo } from './admin.mjs';

const esc = s => String(s ?? '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const appKeyboard = () => cfg.webappUrl ? { inline_keyboard: [[{ text: '🎮 Играть', web_app: { url: cfg.webappUrl } }], [{ text: '💬 Поддержка', url: `https://t.me/${cfg.support.replace(/^@/, '')}` }]] } : undefined;

function welcome(name) {
  return `👋 <b>Привет${name ? ', ' + esc(name) : ''}!</b>\n\n` +
    `🎁 Добро пожаловать в <b>${esc(cfg.brand)}</b> — кейсы с настоящими NFT-подарками Telegram.\n\n` +
    `🆓 2 бесплатных кейса каждый день\n🔥 Кейсы от 25 ⭐ до ALL IN с Plush Pepe\n🚀 Апгрейдер: поставь подарки — забери дороже\n💎 Пополнение через TON и Telegram Stars\n\n` +
    `Жми «Играть» 👇 и забирай первый подарок!`;
}

async function onStart(m) {
  const from = m.from, param = (m.text.split(/\s+/)[1] || '');
  if (!getUser(from.id)) {
    const r = /^ref_(\d+)$/.exec(param); const ref = r && Number(r[1]) !== from.id && getUser(Number(r[1])) ? Number(r[1]) : null;
    run('INSERT INTO users(id,username,name,referred_by,created,last_seen) VALUES(?,?,?,?,?,?)', from.id, from.username || '', from.first_name || '', ref, Date.now(), Date.now());
  }
  const caption = welcome(from.first_name);
  if (cfg.publicUrl) { // приветствие с баннером (webapp/images/banner.jpg)
    try { return await tg('sendPhoto', { chat_id: m.chat.id, photo: `${cfg.publicUrl}/images/banner.jpg`, caption, parse_mode: 'HTML', reply_markup: appKeyboard() }); } catch (e) { console.error('banner', e.message); }
  }
  await tg('sendMessage', { chat_id: m.chat.id, text: caption, parse_mode: 'HTML', reply_markup: appKeyboard(), link_preview_options: { is_disabled: true } });
}

async function adminCommand(m) {
  const [cmd, a, b] = m.text.trim().split(/\s+/), say = t => tg('sendMessage', { chat_id: m.chat.id, text: t, parse_mode: 'HTML' });
  if (cmd === '/stats') {
    const o = one('SELECT COUNT(*) n, COALESCE(SUM(price),0) inn, COALESCE(SUM(value),0) out FROM opens WHERE price>0');
    const u = one('SELECT COUNT(*) n, COALESCE(SUM(balance),0) bal FROM users'), d = one("SELECT COALESCE(SUM(ton),0) t FROM deposits WHERE kind!='admin'");
    return say(`📊 Пользователей: ${u.n}\nБаланс игроков: ${u.bal} ⭐\nДепозиты: ${d.t.toFixed(2)} TON\nОткрытий платных: ${o.n}\nПринято: ${o.inn} ⭐ · Выдано: ${o.out} ⭐\nФактический RTP: ${o.inn ? (o.out / o.inn * 100).toFixed(1) : '—'}% (план ${Math.round(S().caseRtp * 100)}%)`);
  }
  if (cmd === '/wd') {
    const rows = q("SELECT w.id, w.user_id, i.name, i.value, u.username FROM withdrawals w JOIN inventory i ON i.id=w.inv_id JOIN users u ON u.id=w.user_id WHERE w.state='pending' ORDER BY w.id");
    return say(rows.length ? rows.map(r => `#${r.id} · ${esc(r.name)} (${r.value} ⭐) · ${r.user_id} @${esc(r.username || '—')}`).join('\n') + '\n\n/done &lt;id&gt; — выдан · /reject &lt;id&gt; — вернуть' : 'Заявок нет');
  }
  if (cmd === '/done' || cmd === '/reject') {
    const w = one("SELECT * FROM withdrawals WHERE id=? AND state='pending'", Number(a)); if (!w) return say('Заявка не найдена');
    run('UPDATE withdrawals SET state=?, updated=? WHERE id=?', cmd === '/done' ? 'done' : 'rejected', Date.now(), w.id);
    run('UPDATE inventory SET state=? WHERE id=?', cmd === '/done' ? 'withdrawn' : 'owned', w.inv_id);
    tg('sendMessage', { chat_id: w.user_id, text: cmd === '/done' ? '✅ Ваш подарок выдан. Спасибо за игру!' : '❌ Заявка на вывод отклонена, подарок вернулся в инвентарь.' }).catch(() => {});
    return say(`Заявка #${w.id}: ${cmd === '/done' ? 'выдан' : 'отклонена'}`);
  }
  if (cmd === '/give') {
    const uid = Number(a), n = parseInt(b, 10); if (!getUser(uid) || !Number.isFinite(n)) return say('Использование: /give &lt;user_id&gt; &lt;звёзды&gt;');
    run('UPDATE users SET balance=balance+? WHERE id=?', n, uid); return say(`Баланс ${uid}: ${getUser(uid).balance} ⭐`);
  }
  if (cmd === '/ban') { run('UPDATE users SET banned=1 WHERE id=?', Number(a)); return say('Заблокирован'); }
}

async function onUpdate(u) {
  if (u.pre_checkout_query) return tg('answerPreCheckoutQuery', { pre_checkout_query_id: u.pre_checkout_query.id, ok: true });
  const m = u.message; if (!m) return;
  if (m.successful_payment) {
    const p = m.successful_payment, mt = /^stars:(\d+):(\d+)(?::([\w-]+))?$/.exec(p.invoice_payload || '');
    if (mt && Number(mt[1]) === m.from.id && p.currency === 'XTR') {
      const stars = p.total_amount, promo = mt[3] ? promoFor(mt[3], 'bonus') : null, bonus = promo && usePromo(promo, m.from.id) ? Math.floor(stars * promo.value / 100) : 0;
      addDeposit({ ref: 'xtr:' + p.telegram_payment_charge_id, kind: 'stars', userId: m.from.id, stars, ton: stars / S().starsPerTon, bonus });
      await tg('sendMessage', { chat_id: m.chat.id, text: `✅ Баланс пополнен на ${stars + bonus} ⭐${bonus ? ` (с бонусом ${promo.value}%)` : ''}` });
    }
    return;
  }
  if (!m.text) return;
  if (m.text.startsWith('/start')) return onStart(m);
  if (m.text.startsWith('/support')) return tg('sendMessage', { chat_id: m.chat.id, text: `💬 Поддержка и вывод подарков: ${cfg.support}\nДля вывода нужен депозит от ${S().withdrawMinTon} TON за последние ${S().withdrawWindowDays} дней.` });
  if (cfg.adminIds.includes(m.from.id) && /^\/(stats|wd|done|reject|give|ban)\b/.test(m.text)) return adminCommand(m);
  if (m.chat.type === 'private') await tg('sendMessage', { chat_id: m.chat.id, text: 'Нажми «Играть», чтобы открыть кейсы 👇', reply_markup: appKeyboard() });
}

export async function startBot() {
  const me = await tg('getMe'); if (!cfg.botUsername) cfg.botUsername = me.username;
  await tg('setMyCommands', { commands: [{ command: 'start', description: 'Открыть игру' }, { command: 'support', description: 'Поддержка и вывод подарков' }] }).catch(() => {});
  if (cfg.webappUrl) await tg('setChatMenuButton', { menu_button: { type: 'web_app', text: '🎮 Играть', web_app: { url: cfg.webappUrl } } }).catch(() => {});
  else console.warn('WEBAPP_URL не задан — кнопка «Играть» не появится. Укажите https-адрес сервера.');
  await tg('setMyDescription', { description: `🎁 ${cfg.brand} — кейсы с NFT-подарками Telegram.\n\n🆓 Бесплатные кейсы каждый день\n🚀 Апгрейдер\n💎 Пополнение TON и Stars\n\nНажми «Старт» 👇` }).catch(() => {});
  await tg('setMyShortDescription', { short_description: `Кейсы с NFT-подарками Telegram · бесплатные кейсы · апгрейдер` }).catch(() => {});
  console.log(`bot @${cfg.botUsername} запущен`);
  let offset = 0;
  for (;;) {
    try {
      const ups = await tg('getUpdates', { offset, timeout: 30, allowed_updates: ['message', 'pre_checkout_query'] }, 45000);
      for (const u of ups) { offset = u.update_id + 1; onUpdate(u).catch(e => console.error('update', e.message)); }
    } catch (e) { console.error('poll', e.message); await new Promise(r => setTimeout(r, 3000)); }
  }
}
