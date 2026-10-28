// Настройки, которые админ меняет из панели (хранятся в БД, таблица kv). Значения по умолчанию — из .env.
import { cfg } from './config.mjs';
import { one, run } from './db.mjs';

const DEFAULTS = () => ({
  v: 2,                                             // версия настроек (2 — честная модель, RTP 49.9%)
  oddsModel: 'fair',                                // fair — шанс ∝ цена^-k (честно); juicy — «сочный дроп» (поля ниже)
  caseRtp: Number(process.env.CASE_RTP || 0.499),  // средняя выдача кейсов (0.499 = 49.9%)
  cashbackRate: 0.08,                               // кешбек-ящик после слива апгрейда: в среднем 8% ставки (≈ в 12 раз дешевле)
  diamondShare: 0.2,                                // алмазная зона апгрейда: 20% RTP апгрейда уходит в алмаз (на x2 алмаз ≈ 2% круга)
  diamondMin: 1.5, diamondMax: 4,                   // из алмаза — NFT в 1.5–4 раза дороже цели
  hitTarget: 0.6,                                   // доля открытий, где подарок дороже цены кейса (0.6 = 60%)
  bigWin: 0.1,                                      // из них крупные выигрыши (x1.5 цены и дороже) — 10% открытий
  lossFloor: 0.5,                                   // проигрыш не дешевле 50% цены кейса (кейс не «сливает»)
  junkCap: 0.04,                                    // мусор (< 25% цены кейса) — не чаще 4% открытий
  maxItem: 0.25,                                    // один подарок — не больше 25% открытий (разнообразие дропа)
  upgradeFactor: cfg.upgradeFactor,                 // шанс апгрейда = ставка / цель × factor
  upgradeMaxChance: cfg.upgradeMaxChance,
  referralPercent: cfg.referralPercent,
  refPromoBonus: cfg.refPromoBonus,
  withdrawFreeMax: 600,                             // подарки до 600 ⭐ — вывод сразу заявкой, без условия депозита
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
  const saved = row ? JSON.parse(row.v) : {};
  if (row && (saved.v || 1) < 2) {   // переход на честную модель: RTP 49.9% в кейсах и апгрейде
    const d = DEFAULTS(); Object.assign(saved, { v: 2, oddsModel: d.oddsModel, caseRtp: d.caseRtp, upgradeFactor: d.upgradeFactor, upgradeMaxChance: d.upgradeMaxChance, cashbackRate: d.cashbackRate });
    run("UPDATE kv SET v=? WHERE k='settings'", JSON.stringify(saved));
  }
  cache = { ...DEFAULTS(), ...saved };
  return cache;
}
export function saveSettings(patch) {
  const next = { ...settings(), ...patch };
  run("INSERT INTO kv(k,v) VALUES('settings',?) ON CONFLICT(k) DO UPDATE SET v=excluded.v", JSON.stringify(next));
  cache = next; return next;
}
