// Настройки, которые админ меняет из панели (хранятся в БД, таблица kv). Значения по умолчанию — из .env.
import { cfg } from './config.mjs';
import { one, run } from './db.mjs';

const DEFAULTS = () => ({
  caseRtp: Number(process.env.CASE_RTP || 0.97),   // средняя выдача кейсов (0.97 = 97%): больше — чаще дорогие и джекпоты
  hitTarget: 0.6,                                   // доля открытий, где подарок дороже цены кейса (0.6 = 60%)
  bigWin: 0.1,                                      // из них крупные выигрыши (x1.5 цены и дороже) — 10% открытий
  lossFloor: 0.5,                                   // проигрыш не дешевле 50% цены кейса (кейс не «сливает»)
  junkCap: 0.04,                                    // мусор (< 25% цены кейса) — не чаще 4% открытий
  maxItem: 0.25,                                    // один подарок — не больше 25% открытий (разнообразие дропа)
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
