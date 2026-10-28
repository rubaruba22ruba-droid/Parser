// Telegram-бот (long polling): приветствие с кнопкой «Играть» (закрепляется в чате), платежи Stars, команды админа.
import { readFile } from 'node:fs/promises';
import { cfg } from './config.mjs';
import { settings as S } from './settings.mjs';
import { one, run, q } from './db.mjs';
import { tg, tgUpload, notifyAdmins } from './tg.mjs';
import { addDeposit, getUser } from './wallet.mjs';
import { promoFor, usePromo, findUser } from './admin.mjs';
import { tonStatus, pollDeposits } from './ton.mjs';

const esc = s => String(s ?? '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const appKeyboard = () => cfg.webappUrl ? { inline_keyboard: [[{ text: '🎮 Играть', web_app: { url: cfg.webappUrl } }],
  [{ text: '💬 Поддержка', url: `https://t.me/${cfg.support.replace(/^@/, '')}` }]] } : undefined;
const kvGet = k => one('SELECT v FROM kv WHERE k=?', k)?.v;
const kvSet = (k, v) => run('INSERT INTO kv(k,v) VALUES(?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v', k, String(v));
const AVATAR_VERSION = '2';   // поменять — и бот при старте заново поставит аватарку из webapp/images/avatar.jpg

// Имя и аватарка бота — ставятся сами при запуске (один раз)
async function setupProfile() {
  const nm = await tg('getMyName').catch(() => null);
  if (nm && nm.name !== cfg.brand) await tg('setMyName', { name: cfg.brand }).then(() => console.log(`имя бота → ${cfg.brand}`)).catch(e => console.warn('setMyName', e.message));
  if (kvGet('avatar_v') === AVATAR_VERSION) return;
  const img = await readFile(new URL('../webapp/images/avatar.jpg', import.meta.url));
  try {
    await tgUpload('setMyProfilePhoto', { photo: JSON.stringify({ type: 'static', photo: 'attach://avatar' }) }, 'avatar', img, 'avatar.jpg', 'image/jpeg');
    kvSet('avatar_v', AVATAR_VERSION); console.log('аватарка бота поставлена');
  } catch (e) {
    console.warn('setMyProfilePhoto', e.message);
    if (kvGet('avatar_hint') === AVATAR_VERSION) return;
    kvSet('avatar_hint', AVATAR_VERSION);
    for (const id of cfg.adminIds) await tgUpload('sendPhoto', { chat_id: id, caption: 'Telegram не дал боту сменить аватарку сам. Поставь её в @BotFather → /setuserpic → выбери бота → отправь эту картинку.' }, 'photo', img, 'avatar.jpg', 'image/jpeg').catch(() => {});
  }
}

// Канал: бот должен быть админом (иначе не проверить подписку для Daily); пустую аватарку канала ставим сами
async function setupChannel(me) {
  if (!cfg.dailyChannel || cfg.subCheck !== 'real') return;   // чужой канал (подписка по клику) — ничего не трогаем
  const chat = '@' + cfg.dailyChannel;
  const m = await tg('getChatMember', { chat_id: chat, user_id: me.id }).catch(e => ({ status: 'error', error: e.message }));
  if (m.status !== 'administrator') {
    console.warn(`канал ${chat}: бот не админ (${m.error || m.status}) — подписку для Daily проверить нельзя`);
    if (kvGet('chan_hint') !== chat) { kvSet('chan_hint', chat); notifyAdmins(`📢 Добавь бота @${me.username} админом в канал ${chat} — без этого не работает проверка подписки для бесплатного кейса Daily.`); }
    return;
  }
  const info = await tg('getChat', { chat_id: chat }).catch(() => null);
  if (info && !info.photo && m.can_change_info) {
    const img = await readFile(new URL('../webapp/images/avatar.jpg', import.meta.url));
    await tgUpload('setChatPhoto', { chat_id: chat }, 'photo', img, 'avatar.jpg', 'image/jpeg').then(() => console.log(`аватарка канала ${chat} поставлена`)).catch(e => console.warn('setChatPhoto', e.message));
  }
  if (info && !info.description && m.can_change_info)
    await tg('setChatDescription', { chat_id: chat, description: `🎁 ${cfg.brand} — кейсы с NFT-подарками Telegram. Бесплатные кейсы каждый день.\nИграть: @${me.username}` }).catch(() => {});
  console.log(`канал ${chat} подключён`);
}

function welcome(name) {
  return `👋 <b>Приветствую${name ? ', ' + esc(name) : ''}!</b>\n\n` +
    `🎁 Ты в <b>${esc(cfg.brand)}</b> — здесь открывают кейсы с настоящими NFT-подарками Telegram.\n\n` +
    `🆓 2 бесплатных кейса каждый день\n🔥 ${Math.round((S().hitTarget || 0.6) * 100)}% открытий — подарок дороже кейса\n` +
    `🚀 Апгрейдер: поставь подарки — забери дороже\n💎 Пополнение через TON и Telegram Stars\n📤 Вывод подарков прямо в Telegram\n\n` +
    `Жми «Играть» 👇 и забирай первый подарок!`;
}

// Баннер загружаем файлом один раз, дальше шлём по file_id — работает на любом хостинге, даже без публичного адреса картинок
async function sendBanner(chatId, caption) {
  const kv = one("SELECT v FROM kv WHERE k='banner_file_id'");
  if (kv) {
    try { return await tg('sendPhoto', { chat_id: chatId, photo: kv.v, caption, parse_mode: 'HTML', reply_markup: appKeyboard() }); }
    catch (e) { run("DELETE FROM kv WHERE k='banner_file_id'"); }   // file_id протух (другой бот) — загрузим заново
  }
  const img = await readFile(new URL('../webapp/images/banner.jpg', import.meta.url));
  const msg = await tgUpload('sendPhoto', { chat_id: chatId, caption, parse_mode: 'HTML', reply_markup: appKeyboard() ? JSON.stringify(appKeyboard()) : undefined }, 'photo', img, 'banner.jpg', 'image/jpeg');
  const fid = msg.photo && msg.photo[msg.photo.length - 1].file_id;
  if (fid) run("INSERT INTO kv(k,v) VALUES('banner_file_id',?) ON CONFLICT(k) DO UPDATE SET v=excluded.v", fid);
  return msg;
}

// Закрепляем приветствие в чате (старое — открепляем, чтобы не копились)
async function pinWelcome(chatId, messageId) {
  const key = 'pin:' + chatId, prev = one('SELECT v FROM kv WHERE k=?', key);
  if (prev && Number(prev.v) !== messageId) await tg('unpinChatMessage', { chat_id: chatId, message_id: Number(prev.v) }).catch(() => {});
  await tg('pinChatMessage', { chat_id: chatId, message_id: messageId, disable_notification: true });
  run('INSERT INTO kv(k,v) VALUES(?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v', key, String(messageId));
}

async function onStart(m) {
  const from = m.from, param = (m.text.split(/\s+/)[1] || '');
  if (!getUser(from.id)) {
    const r = /^ref_(\d+)$/.exec(param); const ref = r && Number(r[1]) !== from.id && getUser(Number(r[1])) ? Number(r[1]) : null;
    run('INSERT INTO users(id,username,name,referred_by,created,last_seen) VALUES(?,?,?,?,?,?)', from.id, from.username || '', from.first_name || '', ref, Date.now(), Date.now());
  }
  const caption = welcome(from.first_name);
  let msg = null;
  try { msg = await sendBanner(m.chat.id, caption); } catch (e) { console.error('banner', e.message); }
  if (!msg) msg = await tg('sendMessage', { chat_id: m.chat.id, text: caption, parse_mode: 'HTML', reply_markup: appKeyboard(), link_preview_options: { is_disabled: true } });
  if (m.chat.type === 'private') await pinWelcome(m.chat.id, msg.message_id).catch(e => console.error('pin', e.message));
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
  if (cmd === '/done' || cmd === '/reject') { const r = settleWithdrawal(Number(a), cmd === '/done'); return say(r ? `Заявка #${r.id}: ${cmd === '/done' ? 'выдан' : 'отклонена'}` : 'Заявка не найдена'); }
  if (cmd === '/give') {   // /give me 10000 · /give @username 500 · /give 123456 -100
    const t = findUser(a, m.from.id), n = parseInt(b, 10);
    if (!t || !Number.isFinite(n)) return say('Использование: /give me|@username|id сумма\nПример: /give me 10000');
    run('UPDATE users SET balance=MAX(0,balance+?) WHERE id=?', n, t.id); return say(`✅ ${n > 0 ? '+' : ''}${n} ⭐ → ${t.id} @${esc(t.username || '—')}\nБаланс: ${getUser(t.id).balance} ⭐`);
  }
  if (cmd === '/ton') {   // проверка пополнений TON: видно ли кошелёк, какие переводы пришли и куда зачислены
    await pollDeposits(true).catch(() => {});
    const ago = t => t ? `${Math.round((Date.now() - t) / 1000)} с назад` : 'ни разу';
    const pend = one("SELECT COUNT(*) n FROM intents WHERE status='pending'").n;
    return say(`💎 Кошелёк: <code>${cfg.tonAddress}</code>\nПоследняя проверка: ${ago(tonStatus.lastOk)}` +
      (tonStatus.lastErr && tonStatus.lastErrAt > tonStatus.lastOk ? `\n⚠️ Ошибка: ${esc(tonStatus.lastErr)}` : '') + `\nЖдут оплаты: ${pend}\n\n` +
      (tonStatus.recent.length ? tonStatus.recent.map(r => `• ${r.ton} TON «${esc(r.text || '—')}» — ${esc(r.result)}`).join('\n') : 'Новых входящих переводов с запуска бота не было'));
  }
  if (cmd === '/ban') { run('UPDATE users SET banned=1 WHERE id=?', Number(a)); return say('Заблокирован'); }
}

// заявка на вывод: выдан (подарок списан) или отклонена (подарок вернулся в инвентарь)
function settleWithdrawal(id, done) {
  const w = one("SELECT * FROM withdrawals WHERE id=? AND state='pending'", id); if (!w) return null;
  run('UPDATE withdrawals SET state=?, updated=? WHERE id=?', done ? 'done' : 'rejected', Date.now(), w.id);
  run('UPDATE inventory SET state=? WHERE id=?', done ? 'withdrawn' : 'owned', w.inv_id);
  tg('sendMessage', { chat_id: w.user_id, text: done ? '✅ Ваш подарок выдан. Спасибо за игру!' : '❌ Заявка на вывод отклонена, подарок вернулся в инвентарь.' }).catch(() => {});
  return w;
}

// кнопки «Выдал» / «Отклонить» под заявкой у админа
async function onCallback(cq) {
  const m = /^wd:(done|rej):(\d+)$/.exec(cq.data || '');
  if (!m || !cfg.adminIds.includes(cq.from.id)) return tg('answerCallbackQuery', { callback_query_id: cq.id }).catch(() => {});
  const w = settleWithdrawal(Number(m[2]), m[1] === 'done');
  await tg('answerCallbackQuery', { callback_query_id: cq.id, text: w ? (m[1] === 'done' ? 'Отмечено: выдан' : 'Отклонено, подарок вернулся игроку') : 'Заявка уже закрыта' }).catch(() => {});
  if (w && cq.message) await tg('editMessageText', { chat_id: cq.message.chat.id, message_id: cq.message.message_id, parse_mode: 'HTML',
    text: `${esc(cq.message.text || '')}\n\n${m[1] === 'done' ? '✅ Выдан' : '❌ Отклонён'} — ${esc(cq.from.first_name || 'админ')}` }).catch(() => {});
}

async function onUpdate(u) {
  if (u.callback_query) return onCallback(u.callback_query);
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
  if (cfg.adminIds.includes(m.from.id) && /^\/(stats|wd|done|reject|give|ban|ton)\b/.test(m.text)) return adminCommand(m);
  if (m.chat.type === 'private') await tg('sendMessage', { chat_id: m.chat.id, text: 'Нажми «Играть», чтобы открыть кейсы 👇', reply_markup: appKeyboard() });
}

async function refreshPinnedButtons() {
  const rows = q("SELECT k, v FROM kv WHERE k LIKE 'pin:%'");
  for (const r of rows) {
    await tg('editMessageReplyMarkup', { chat_id: Number(r.k.slice(4)), message_id: Number(r.v), reply_markup: appKeyboard() }).catch(() => {});
    await new Promise(res => setTimeout(res, 40));
  }
  if (rows.length) console.log(`кнопка «Играть» обновлена в ${rows.length} закреплённых сообщениях`);
}

export async function startBot() {
  const me = await tg('getMe'); if (!cfg.botUsername) cfg.botUsername = me.username;
  // сменили токен (другой бот): file_id баннера, аватарка и закрепы были у старого бота — сбрасываем
  const prevBot = kvGet('bot_id');
  if (prevBot && prevBot !== String(me.id)) { run("DELETE FROM kv WHERE k IN ('banner_file_id','avatar_v','avatar_hint','chan_hint','webapp_url') OR k LIKE 'pin:%'"); console.log(`новый бот @${me.username} — сбросил кэш старого бота`); }
  kvSet('bot_id', me.id);
  setupProfile().catch(e => console.warn('profile', e.message));
  setupChannel(me).catch(e => console.warn('channel', e.message));
  await tg('setMyCommands', { commands: [{ command: 'start', description: 'Открыть игру' }, { command: 'support', description: 'Поддержка и вывод подарков' }] }).catch(() => {});
  if (cfg.webappUrl) await tg('setChatMenuButton', { menu_button: { type: 'web_app', text: '🎮 Играть', web_app: { url: cfg.webappUrl } } }).catch(() => {});
  else console.warn('⚠ Не знаю https-адрес мини-аппа — кнопки «Играть» не будет. Впиши в .env строку WEBAPP_URL=https://твой-домен и перезапусти.');
  // ссылка мини-аппа сменилась (например, после перезапуска с новой https-ссылкой) — чиним кнопку в закреплённых приветствиях
  const prevUrl = one("SELECT v FROM kv WHERE k='webapp_url'");
  if (cfg.webappUrl) {
    run("INSERT INTO kv(k,v) VALUES('webapp_url',?) ON CONFLICT(k) DO UPDATE SET v=excluded.v", cfg.webappUrl);
    if (prevUrl && prevUrl.v !== cfg.webappUrl) refreshPinnedButtons().catch(e => console.error('pins', e.message));
  }
  await tg('setMyDescription', { description: `🎁 ${cfg.brand} — кейсы с NFT-подарками Telegram.\n\n🆓 Бесплатные кейсы каждый день\n🚀 Апгрейдер\n💎 Пополнение TON и Stars\n\nНажми «Старт» 👇` }).catch(() => {});
  await tg('setMyShortDescription', { short_description: `Кейсы с NFT-подарками Telegram · бесплатные кейсы · апгрейдер` }).catch(() => {});
  console.log(`bot @${cfg.botUsername} запущен`);
  let offset = 0;
  for (;;) {
    try {
      const ups = await tg('getUpdates', { offset, timeout: 30, allowed_updates: ['message', 'pre_checkout_query', 'callback_query'] }, 45000);
      for (const u of ups) { offset = u.update_id + 1; onUpdate(u).catch(e => console.error('update', e.message)); }
    } catch (e) { console.error('poll', e.message); await new Promise(r => setTimeout(r, 3000)); }
  }
}
