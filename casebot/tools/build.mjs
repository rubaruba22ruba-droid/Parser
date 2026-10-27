// Каталог подарков + кейсы с шансами под RTP 70%.   node tools/build.mjs  (потом python3 tools/case_art.py)
// В игру попадают ТОЛЬКО подарки с реальной 3D-картинкой webapp/images/gifts/<id>.webp.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const ROOT = new URL('../', import.meta.url).pathname;
const RTP = 0.70, STARS_PER_TON = 100;
const slug = n => n.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// ---------- каталог ----------
const all = readFileSync(ROOT + 'tools/gifts-raw.txt', 'utf8').trim().split('\n').filter(l => l && !l.startsWith('#')).map(l => {
  const p = l.split('|'), listed = p[1] !== '?', ton = Number(listed ? p[1] : p[2]);
  return { id: slug(p[0]), name: p[0], value: Math.round(ton * STARS_PER_TON), ton, estimated: !listed, kind: 'nft' };
});
// обычные подарки Telegram (цена в ⭐)
for (const [name, value] of [['Heart', 15], ['Bear', 15], ['Gift', 25], ['Cake', 50], ['Trophy', 100], ['Diamond', 100]])
  all.push({ id: slug(name) + '-' + value, name, value, ton: value / STARS_PER_TON, estimated: false, kind: 'regular' });
const gifts = [], missing = [];
for (const g of all) {
  if (existsSync(ROOT + `webapp/images/gifts/${g.id}.webp`)) gifts.push({ ...g, image: `images/gifts/${g.id}.webp` });
  else missing.push(g.name);
}
const G = new Map(gifts.map(g => [g.id, g]));

// ---------- кейсы: 2 бесплатных + 9 платных (разные ценовые диапазоны) ----------
// free: фиксированные шансы. Платные: веса подбираются так, чтобы RTP = 70% ровно.
const DEFS = [
  { id: 'case1', name: 'Daily', price: 0, theme: ['#ff4d8d', '#831843', '#ff9ec4'], free: [['heart-15', 0.97], ['snake-boxes', 0.03]], art: ['snake-boxes', 'heart-15', 'heart-15', 'heart-15', 'heart-15'] },
  { id: 'case2', name: 'Free', price: 0, theme: ['#38bdf8', '#1e3a8a', '#a5f3fc'], free: [['heart-15', 0.98], ['santa-hats', 0.02]], art: ['santa-hats', 'heart-15', 'heart-15', 'heart-15', 'heart-15'] },
  // ФАРМ
  { id: 'case4', name: 'Hearts', price: 25, theme: ['#f43f5e', '#881337', '#fda4af'], items: ['heart-15', 'bear-15', 'gift-25', 'cake-50', 'trophy-100', 'diamond-100', 'santa-hats', 'pet-snakes'] },
  { id: 'case5', name: 'Sweet', price: 75, theme: ['#fb923c', '#7c2d12', '#fed7aa'], items: ['heart-15', 'gift-25', 'cake-50', 'trophy-100', 'diamond-100', 'ginger-cookies', 'homemade-cakes', 'whip-cupcakes', 'berry-boxes'] },
  { id: 'case6', name: 'Party', price: 199, theme: ['#22d3ee', '#164e63', '#a5f3fc'], items: ['cake-50', 'trophy-100', 'diamond-100', 'spiced-wines', 'xmas-stockings', 'hypno-lollipops', 'vice-creams', 'jelly-bunnies', 'party-sparklers', 'valentine-boxes', 'sky-stilettos'] },
  // ОБЫЧНЫЕ
  { id: 'case3', name: 'Wonderland', price: 450, theme: ['#a78bfa', '#3b0764', '#e9d5ff'], items: ['trophy-100', 'diamond-100', 'witch-hats', 'spy-agarics', 'big-years', 'mousse-cakes', 'spring-baskets', 'jacks-in-the-box', 'top-hats', 'mad-pumpkins', 'eternal-roses', 'signet-rings'] },
  { id: 'case8', name: 'Turtles', price: 790, theme: ['#4ade80', '#14532d', '#bbf7d0'], items: ['fresh-socks', 'lush-bouquets', 'mood-packs', 'instant-ramens', 'pool-floats', 'tama-gadgets', 'timeless-books', 'party-sparklers', 'mirage-lamps', 'trapped-hearts', 'skull-flowers', 'artisan-bricks', 'joyful-bundles', 'kissed-frogs', 'sharp-tongues'] },
  { id: 'case9', name: 'Magic', price: 1990, theme: ['#c026d3', '#4a044e', '#f5d0fe'], items: ['hex-pots', 'witch-hats', 'victory-medals', 'evil-eyes', 'skull-flowers', 'algorithm-cups', 'eternal-roses', 'sky-stilettos', 'signet-rings', 'vintage-cigars', 'scared-cats', 'genie-lamps', 'magic-potions', 'mighty-arms'] },
  // ALL IN
  { id: 'case12', name: 'Royal', price: 4990, theme: ['#facc15', '#713f12', '#fef08a'], items: ['top-hats', 'eternal-roses', 'sky-stilettos', 'signet-rings', 'kissed-frogs', 'sharp-tongues', 'scared-cats', 'genie-lamps', 'gem-signets', 'mini-oscars', 'perfume-bottles', 'mighty-arms', 'precious-peaches'] },
  { id: 'case13', name: 'Peach', price: 12990, theme: ['#fb7185', '#701a75', '#fecdd3'], items: ['scared-cats', 'genie-lamps', 'magic-potions', 'gem-signets', 'mini-oscars', 'perfume-bottles', 'mighty-arms', 'precious-peaches', 'durov-s-caps'] },
  { id: 'case14', name: 'Plush Pepe', price: 49990, theme: ['#34d399', '#064e3b', '#a7f3d0'], items: ['magic-potions', 'perfume-bottles', 'mighty-arms', 'precious-peaches', 'durov-s-caps', 'plush-pepes'] },
];

const rarityOf = r => r >= 10 ? 'legendary' : r >= 4 ? 'mythic' : r >= 2 ? 'purple' : r >= 1 ? 'epic' : r >= 0.6 ? 'rare' : r >= 0.3 ? 'common' : 'uncommon';
function solve(pool, p, sigma = 0.7) { // веса — гауссиана в лог-цене; центр подбирается бисекцией под RTP
  const w = mu => pool.map(g => Math.exp(-Math.pow(Math.log(g.value / p) - mu, 2) / (2 * sigma * sigma)));
  const rtp = mu => { const ws = w(mu); return ws.reduce((s, x, i) => s + x * pool[i].value, 0) / ws.reduce((s, x) => s + x, 0) / p; };
  let lo = -8, hi = 8; if (rtp(lo) > RTP || rtp(hi) < RTP) throw new Error('RTP не достижим для пула');
  for (let i = 0; i < 100; i++) { const m = (lo + hi) / 2; rtp(m) < RTP ? lo = m : hi = m; }
  const ws = w((lo + hi) / 2), t = ws.reduce((s, x) => s + x, 0);
  return pool.map((g, i) => ({ giftId: g.id, p: ws[i] / t }));
}

const need = id => { const g = G.get(id); if (!g) throw new Error(`нет картинки/цены для ${id}`); return g; };
const cases = DEFS.map(d => {
  let items;
  if (d.free) items = d.free.map(([id, p]) => ({ giftId: need(id).id, p, rarity: need(id).kind === 'regular' ? 'uncommon' : 'legendary' }));
  else items = solve(d.items.map(need), d.price).map(it => ({ ...it, rarity: rarityOf(G.get(it.giftId).value / d.price) }));
  items.sort((a, b) => G.get(b.giftId).value - G.get(a.giftId).value);
  const ref = d.price || 1, ev = items.reduce((s, x) => s + x.p * G.get(x.giftId).value, 0);
  const nft = items.filter(x => G.get(x.giftId).kind === 'nft');
  const art = d.art || [...(nft.length ? nft : items)].slice(0, 1).concat(items.filter(x => !nft.slice(0, 1).includes(x)).slice(0, 4)).map(x => x.giftId);
  return { id: d.id, name: d.name, price: d.price, free: !!d.free, image: `images/cases/${d.id}.webp`, theme: d.theme, art, items,
    rtp: d.free ? null : ev / ref, hit: d.free ? null : items.filter(x => G.get(x.giftId).value >= d.price).reduce((s, x) => s + x.p, 0) };
});

writeFileSync(ROOT + 'server/gifts.json', JSON.stringify(gifts, null, 1));
writeFileSync(ROOT + 'server/cases.json', JSON.stringify({ rtp: RTP, starsPerTon: STARS_PER_TON, cases }, null, 1));
console.log(`подарков с реальной 3D-картинкой: ${gifts.length}; без картинки (не используются): ${missing.length}`);
for (const c of cases) console.log(c.id.padEnd(7), c.name.padEnd(11), String(c.price || 'FREE').padStart(6), '⭐ ·', String(c.items.length).padStart(2), 'подарков ·',
  c.rtp ? `RTP ${(c.rtp * 100).toFixed(1)}% · окуп ${(c.hit * 100).toFixed(0)}%` : 'бесплатный', '· топ:', G.get(c.items[0].giftId).name, G.get(c.items[0].giftId).value + '⭐');
