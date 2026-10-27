// .env рядом с package.json подхватывается всегда — даже если хостинг запускает просто «node index.js».
// Переменные, заданные в панели хостинга, важнее .env.
try { process.loadEnvFile(new URL('../.env', import.meta.url).pathname); } catch { }
const env = process.env;
// Публичный https-адрес: сами подставляют Render, Railway, Koyeb, Fly, Replit, Glitch; иначе — WEBAPP_URL из .env
const detected = env.WEBAPP_URL || env.PUBLIC_URL || env.RENDER_EXTERNAL_URL
  || (env.RAILWAY_PUBLIC_DOMAIN && 'https://' + env.RAILWAY_PUBLIC_DOMAIN)
  || (env.KOYEB_PUBLIC_DOMAIN && 'https://' + env.KOYEB_PUBLIC_DOMAIN)
  || (env.FLY_APP_NAME && `https://${env.FLY_APP_NAME}.fly.dev`)
  || (env.REPLIT_DEV_DOMAIN && 'https://' + env.REPLIT_DEV_DOMAIN)
  || (env.PROJECT_DOMAIN && `https://${env.PROJECT_DOMAIN}.glitch.me`) || '';
export const cfg = {
  port: Number(env.PORT || 8080),
  botToken: env.BOT_TOKEN || '',
  botUsername: (env.BOT_USERNAME || '').replace(/^@/, ''),
  // https-адрес Mini App. На Render/Railway подставляется сам — ссылка на мини-апп «вшивается» в бота автоматически.
  webappUrl: detected.replace(/\/$/, ''),
  brand: env.BRAND || 'Drade Drop',
  support: env.SUPPORT || '@entoni',            // куда писать для вывода подарков
  dev: env.DEV === '1',                         // DEV=1 — вход без Telegram (только локально)
  adminIds: (env.ADMIN_IDS || '').split(',').map(s => s.trim()).filter(Boolean).map(Number),
  dbPath: env.DB_PATH || new URL('../data.db', import.meta.url).pathname,
  // TON
  tonAddress: env.TON_ADDRESS || 'UQCvGGYFcqrPS3h_AXiVzVHvmUTKLJJ5DurV_VBhpMXcQtd3',
  tonApi: env.TON_API || 'https://toncenter.com/api/v2',
  tonApiKey: env.TON_API_KEY || '',
  starsPerTon: Number(env.STARS_PER_TON || 100), // фронтенд показывает курс 1 TON = 100 ⭐
  minDepositTon: Number(env.MIN_DEPOSIT_TON || 0.1),
  // вывод подарков: депозит за последние N дней
  withdrawMinTon: Number(env.WITHDRAW_MIN_TON || 50),
  withdrawWindowDays: Number(env.WITHDRAW_WINDOW_DAYS || 7),
  // ежедневный кейс
  dailyChannel: (env.DAILY_CHANNEL || '').replace(/^@/, ''), // канал для подписки (бот должен быть админом); пусто — без проверки
  dailyShares: Number(env.DAILY_SHARES || 3),
  referralPercent: Number(env.REFERRAL_PERCENT || 10),
  // апгрейд: шанс = ставка / цель × factor (не больше maxChance)
  upgradeFactor: Number(env.UPGRADE_FACTOR || 0.95),   // апгрейды заходят часто
  upgradeMaxChance: Number(env.UPGRADE_MAX_CHANCE || 0.92),
  upgradeMaxItems: 6,
  refPromoBonus: Number(env.REF_PROMO_BONUS || 10),
  publicUrl: detected.replace(/\/$/, ''),
  twaReturnUrl: env.TWA_RETURN_URL || '',        // напр. https://t.me/<bot>/<app>
};
