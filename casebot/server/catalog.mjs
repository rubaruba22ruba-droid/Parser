import { readFileSync } from 'node:fs';
import { computeCase } from './odds.mjs';
import { settings } from './settings.mjs';
const load = f => JSON.parse(readFileSync(new URL(f, import.meta.url), 'utf8'));
export const GIFTS = load('./gifts.json');
export const GIFT_BY_ID = new Map(GIFTS.map(g => [g.id, g]));
const DEFS = load('./cases.json').cases;
export let CASES = [], CASE_BY_ID = new Map();

// Пересчёт шансов (при старте и после изменения настроек в админке)
export function rebuildCases() {
  const s = settings();
  CASES = DEFS.map(d => {
    const o = s.cases[d.id] || {};
    return computeCase({ ...d, price: o.price ?? d.price, disabled: !!o.disabled }, GIFT_BY_ID,
      { model: s.oddsModel, rtp: o.rtp ?? s.caseRtp, hit: o.hit ?? s.hitTarget, tail: s.bigWin, floor: s.lossFloor ?? 0.5, junkCap: s.junkCap, maxItem: s.maxItem, manual: o.manual });
  });
  CASE_BY_ID = new Map(CASES.map(c => [c.id, c]));
  return CASES;
}
rebuildCases();
export const caseDefs = () => DEFS;

const fmtP = p => (p >= 0.1 ? (p * 100).toFixed(1) : p >= 0.001 ? (p * 100).toFixed(2) : '<0.1') + '%';
// Формат, который ждёт фронтенд: { caseN: { id, name, image, price, items:[{name,image,value,rarity,chance}] } }
export function casesForClient() {
  const out = {};
  for (const c of CASES) {
    if (c.disabled) continue;
    out[c.id] = { id: c.id, name: c.name, image: c.image, price: c.price, group: c.group,
      items: c.items.map(i => { const g = GIFT_BY_ID.get(i.giftId); return { name: g.name, image: g.image, value: g.value, rarity: i.rarity, chance: fmtP(i.p) }; }) };
  }
  return out;
}
