const env = process.env;
export const cfg = {
  port: Number(env.PORT || 8080),
  botToken: env.BOT_TOKEN || '',
  botUsername: (env.BOT_USERNAME || '').replace(/^@/, ''),
  webappUrl: env.WEBAPP_URL || '',              // https-адрес Mini App
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
  upgradeFactor: Number(env.UPGRADE_FACTOR || 0.9),
  upgradeMaxChance: Number(env.UPGRADE_MAX_CHANCE || 0.75),
  upgradeMaxItems: 6,
  refPromoBonus: Number(env.REF_PROMO_BONUS || 10),
  publicUrl: (env.PUBLIC_URL || env.WEBAPP_URL || '').replace(/\/$/, ''),
  twaReturnUrl: env.TWA_RETURN_URL || '',        // напр. https://t.me/<bot>/<app>
};
