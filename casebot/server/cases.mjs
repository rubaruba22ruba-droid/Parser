// Кейсы и шансы. Веса подбираются бисекцией так, чтобы RTP каждого кейса = RTP_TARGET.
import { readFileSync } from 'node:fs';
export const RTP_TARGET = 0.70;
export const GIFTS = JSON.parse(readFileSync(new URL('./gifts.json', import.meta.url), 'utf8'));

// min/max — границы стоимости подарков в пуле как доля цены кейса; tag — тематический фильтр (по имени)
const DEFS = [
  { id: 'starter',  title: 'Стартовый', emoji: '🌱', price: 5,   min: 0.6, max: 2.2,  note: 'Для первого шага' },
  { id: 'classic',  title: 'Классик',   emoji: '🎯', price: 10,  min: 0.5, max: 2.5,  note: 'Каждый второй дроп окупается' },
  { id: 'love',     title: 'Love',      emoji: '💘', price: 10,  min: 0.3, max: 3,  tag: /Love|Heart|Cupid|Valentine|Rose|Posies|Bouquet|Sakura|Candle|Ring|Berry|Brownie|Cookie|Kiss|Peach|Locket|Charm|Pendant|Lol|Tongue/i, note: 'Подарки-сердечки' },
  { id: 'winter',   title: 'Winter',    emoji: '❄️', price: 10,  min: 0.3, max: 3,  tag: /Snow|Santa|Xmas|Sleigh|Jingle|Winter|Candy|Holiday|Ginger|Mitten|Hanging|Spiced|Jolly|Joyful|Star|Wreath|Big Year|Ice/i, note: 'Новогодний кейс' },
  { id: 'gold',     title: 'Gold',      emoji: '🥇', price: 25,  min: 0.4, max: 3,  note: 'Больше редких дропов' },
  { id: 'premium',  title: 'Premium',   emoji: '💎', price: 60,  min: 0.4, max: 3,  note: 'Эпики каждые несколько открытий' },
  { id: 'whale',    title: 'Whale',     emoji: '🐳', price: 150, min: 0.45, max: 6,  note: 'Крупные подарки' },
  { id: 'legend',   title: 'Legend',    emoji: '👑', price: 500, min: 0.4, max: 6,  note: 'Лучшие подарки коллекции' },
];

function solve(pool, price) {
  const rtp = a => { let s = 0, w = 0; for (const g of pool) { const x = Math.pow(g.price, -a); s += x * g.price; w += x; } return s / w / price; };
  let lo = -3, hi = 8;
  if (rtp(lo) < RTP_TARGET || rtp(hi) > RTP_TARGET) throw new Error('RTP не достижим для пула');
  for (let i = 0; i < 80; i++) { const m = (lo + hi) / 2; (rtp(m) > RTP_TARGET ? lo = m : hi = m); }
  const a = (lo + hi) / 2;
  const ws = pool.map(g => Math.pow(g.price, -a)); const tot = ws.reduce((x, y) => x + y, 0);
  return pool.map((g, i) => ({ giftId: g.id, p: ws[i] / tot }));
}

export const CASES = DEFS.map(d => {
  let pool = GIFTS.filter(g => g.price >= d.price * d.min && g.price <= d.price * d.max && (!d.tag || d.tag.test(g.name)));
  if (d.tag) { // тематика: добавляем нейтральные подарки, чтобы пул не был пустым/однобоким
    const extra = GIFTS.filter(g => g.price >= d.price * d.min && g.price <= d.price * d.max && !pool.includes(g));
    pool = pool.concat(extra.filter(g => g.price >= d.price * 2).slice(0, 4));
  }
  const drops = solve(pool, d.price);
  const byId = new Map(GIFTS.map(g => [g.id, g]));
  const rtp = drops.reduce((s, x) => s + x.p * byId.get(x.giftId).price, 0) / d.price;
  const winChance = drops.filter(x => byId.get(x.giftId).price >= d.price).reduce((s, x) => s + x.p, 0);
  return { ...d, tag: undefined, drops, rtp, winChance };
});

export const CASE_BY_ID = new Map(CASES.map(c => [c.id, c]));
export const GIFT_BY_ID = new Map(GIFTS.map(g => [g.id, g]));
