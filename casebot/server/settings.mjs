// Настройки, которые админ меняет из панели (хранятся в БД, таблица kv). Значения по умолчанию — из .env.
import { cfg } from './config.mjs';
import { one, run } from './db.mjs';

const DEFAULTS = () => ({
  caseRtp: Number(process.env.CASE_RTP || 0.70),   // средняя выдача кейсов (0.70 = 70%)
  generosity: 2.2,                                  // чем больше — тем чаще «чуть дороже кейса», тем реже джекпоты
  maxHit: 0.6,                                      // потолок шанса «в плюс»
  upgradeFactor: cfg.upgradeFactor,                 // шанс апгрейда = ставка / цель × factor
  upgradeMaxChance: cfg.upgradeMaxChance,
  referralPercent: cfg.referralPercent,
  refPromoBonus: cfg.refPromoBonus,
  withdrawMinTon: cfg.withdrawMinTon,
  withdrawWindowDays: cfg.withdrawWindowDays,
  starsPerTon: cfg.starsPerTon,
  minDepositTon: cfg.minDepositTon,
  dailyShares: cfg.dailyShares,
  freeCooldownHours: 24,
  cases: {},          // { caseId: { price?, rtp?, disabled?, manual?: {giftId: %} } }
});
let cache = null;
export function settings() {
  if (cache) return cache;
  const row = one("SELECT v FROM kv WHERE k='settings'");
  cache = { ...DEFAULTS(), ...(row ? JSON.parse(row.v) : {}) };
  return cache;
}
export function saveSettings(patch) {
  const next = { ...settings(), ...patch };
  run("INSERT INTO kv(k,v) VALUES('settings',?) ON CONFLICT(k) DO UPDATE SET v=excluded.v", JSON.stringify(next));
  cache = next; return next;
}
