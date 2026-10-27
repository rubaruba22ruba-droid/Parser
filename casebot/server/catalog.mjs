import { readFileSync } from 'node:fs';
const load = f => JSON.parse(readFileSync(new URL(f, import.meta.url), 'utf8'));
export const GIFTS = load('./gifts.json');
const CASES_FILE = load('./cases.json');
export const RTP = CASES_FILE.rtp;
export const GIFT_BY_ID = new Map(GIFTS.map(g => [g.id, g]));
export const CASES = CASES_FILE.cases;
export const CASE_BY_ID = new Map(CASES.map(c => [c.id, c]));

const fmtP = p => (p >= 0.1 ? (p * 100).toFixed(1) : p >= 0.001 ? (p * 100).toFixed(2) : '<0.1') + '%';
// Формат кейсов, который ждёт фронтенд: { caseN: { id, name, image, price, items:[{name,image,value,rarity,chance}] } }
export function casesForClient() {
  const out = {};
  for (const c of CASES) {
    out[c.id] = {
      id: c.id, name: c.name, image: c.image, price: c.price,
      ...(c.referralPrice ? { referralOnly: true, referralPrice: c.referralPrice } : {}),
      items: c.items.map(i => { const g = GIFT_BY_ID.get(i.giftId); return { name: g.name, image: g.image, value: g.value, rarity: i.rarity, chance: fmtP(i.p) }; }),
    };
  }
  return out;
}
