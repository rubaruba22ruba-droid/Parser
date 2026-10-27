export const cfg = {
  port: Number(process.env.PORT || 8080),
  botToken: process.env.BOT_TOKEN || '',
  dev: process.env.DEV === '1',            // DEV=1 — вход без Telegram (только для локальной проверки)
  adminIds: (process.env.ADMIN_IDS || '').split(',').filter(Boolean).map(Number),
  tonAddress: process.env.TON_ADDRESS || 'UQCvGGYFcqrPS3h_AXiVzVHvmUTKLJJ5DurV_VBhpMXcQtd3',
  tonApi: process.env.TON_API || 'https://toncenter.com/api/v2',
  tonApiKey: process.env.TON_API_KEY || '',
  dbPath: process.env.DB_PATH || new URL('../data.db', import.meta.url).pathname,
  minDeposit: Number(process.env.MIN_DEPOSIT || 1),
  sellRate: Number(process.env.SELL_RATE || 1), // за сколько от floor можно продать подарок за баланс
};
