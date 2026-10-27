// Каталог подарков + определения кейсов.   node tools/build.mjs   (потом python3 tools/case_art.py)
// В игру попадают ТОЛЬКО подарки с реальной 3D-картинкой webapp/images/gifts/<id>.webp.
// Шансы считает сервер (server/odds.mjs) — их можно менять в админке без пересборки.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { computeCase } from '../server/odds.mjs';

const ROOT = new URL('../', import.meta.url).pathname;
const STARS_PER_TON = 100;
const slug = n => n.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const all = readFileSync(ROOT + 'tools/gifts-raw.txt', 'utf8').trim().split('\n').filter(l => l && !l.startsWith('#')).map(l => {
  const p = l.split('|'), listed = p[1] !== '?', ton = Number(listed ? p[1] : p[2]);
  return { id: slug(p[0]), name: p[0], value: Math.round(ton * STARS_PER_TON), ton, estimated: !listed, kind: 'nft' };
});
for (const [name, value] of [['Heart', 15], ['Bear', 15], ['Gift', 25], ['Cake', 50], ['Trophy', 100], ['Diamond', 100]])
  all.push({ id: slug(name) + '-' + value, name, value, ton: value / STARS_PER_TON, estimated: false, kind: 'regular' });
const gifts = [], missing = [];
for (const g of all) (existsSync(ROOT + `webapp/images/gifts/${g.id}.webp`) ? gifts.push({ ...g, image: `images/gifts/${g.id}.webp` }) : missing.push(g.name));
const G = new Map(gifts.map(g => [g.id, g]));

// 2 бесплатных + 9 платных. Цены в ⭐ (1 TON = 100 ⭐). Разные диапазоны: 49 ⭐ … 129 990 ⭐.
const DEFS = [
  { id: 'case1', name: 'Daily', price: 0, theme: ['#ff4d8d', '#831843', '#ff9ec4'], free: [['heart-15', 0.96], ['snow-globes', 0.04]], art: ['snow-globes', 'heart-15', 'heart-15', 'heart-15', 'heart-15'] },
  { id: 'case2', name: 'Free', price: 0, theme: ['#38bdf8', '#1e3a8a', '#a5f3fc'], free: [['heart-15', 0.97], ['xmas-stockings', 0.03]], art: ['xmas-stockings', 'heart-15', 'heart-15', 'heart-15', 'heart-15'] },
  // ФАРМ
  { id: 'case4', name: 'Hearts', price: 49, theme: ['#f43f5e', '#881337', '#fda4af'], items: ['heart-15', 'bear-15', 'gift-25', 'cake-50', 'trophy-100', 'diamond-100', 'big-years', 'mood-packs'] },
  { id: 'case5', name: 'Sweet', price: 449, theme: ['#fb923c', '#7c2d12', '#fed7aa'], items: ['cake-50', 'trophy-100', 'homemade-cakes', 'hypno-lollipops', 'whip-cupcakes', 'berry-boxes', 'jelly-bunnies', 'vice-creams', 'mousse-cakes', 'ginger-cookies', 'bunny-muffins', 'love-candles'] },
  { id: 'case6', name: 'Party', price: 399, theme: ['#22d3ee', '#164e63', '#a5f3fc'], items: ['trophy-100', 'diamond-100', 'pet-snakes', 'santa-hats', 'spiced-wines', 'hypno-lollipops', 'instant-ramens', 'pool-floats', 'tama-gadgets', 'party-sparklers', 'jacks-in-the-box', 'snow-globes', 'jolly-chimps', 'hanging-stars', 'joyful-bundles', 'record-players', 'crystal-balls', 'love-potions'] },
  // ОБЫЧНЫЕ
  { id: 'case3', name: 'Wonderland', price: 790, theme: ['#a78bfa', '#3b0764', '#e9d5ff'], items: ['diamond-100', 'big-years', 'mousse-cakes', 'spring-baskets', 'spy-agarics', 'hypno-lollipops', 'eternal-candles', 'hex-pots', 'jolly-chimps', 'bunny-muffins', 'snow-mittens', 'witch-hats', 'top-hats', 'sleigh-bells', 'flying-brooms', 'crystal-balls', 'mad-pumpkins', 'cupid-charms', 'eternal-roses'] },
  { id: 'case8', name: 'Love', price: 1490, theme: ['#fb7185', '#9f1239', '#fecdd3'], items: ['diamond-100', 'big-years', 'lush-bouquets', 'love-candles', 'sakura-flowers', 'valentine-boxes', 'love-potions', 'trapped-hearts', 'sky-stilettos', 'cupid-charms', 'diamond-rings', 'toy-bears', 'bonded-rings', 'heart-lockets'] },
  { id: 'case9', name: 'Magic', price: 2490, theme: ['#c026d3', '#4a044e', '#f5d0fe'], items: ['hex-pots', 'witch-hats', 'skull-flowers', 'crystal-balls', 'mad-pumpkins', 'eternal-roses', 'electric-skulls', 'genie-lamps', 'voodoo-dolls', 'vintage-cigars', 'kissed-frogs', 'sharp-tongues', 'magic-potions', 'scared-cats'] },
  // ALL IN
  { id: 'case12', name: 'Royal', price: 7990, theme: ['#facc15', '#713f12', '#fef08a'], items: ['witch-hats', 'top-hats', 'crystal-balls', 'sky-stilettos', 'bling-binkies', 'rare-birds', 'signet-rings', 'neko-helmets', 'bonded-rings', 'kissed-frogs', 'sharp-tongues', 'low-riders', 'gem-signets', 'swiss-watches', 'mini-oscars', 'ion-gems', 'artisan-bricks', 'perfume-bottles', 'westside-signs', 'loot-bags', 'mighty-arms', 'heroic-helmets'] },
  { id: 'case13', name: 'Durov', price: 24990, theme: ['#60a5fa', '#1e3a8a', '#bfdbfe'], items: ['cupid-charms', 'rare-birds', 'signet-rings', 'neko-helmets', 'swiss-watches', 'mini-oscars', 'ion-gems', 'artisan-bricks', 'perfume-bottles', 'westside-signs', 'loot-bags', 'astral-shards', 'nail-bracelets', 'mighty-arms', 'heroic-helmets', 'durov-s-glasses', 'precious-peaches', 'scared-cats', 'durov-s-caps', 'resistance-dogs'] },
  { id: 'case14', name: 'Plush Pepe', price: 129990, theme: ['#34d399', '#064e3b', '#a7f3d0'], items: ['magic-potions', 'mini-oscars', 'perfume-bottles', 'loot-bags', 'mighty-arms', 'heroic-helmets', 'durov-s-glasses', 'precious-peaches', 'scared-cats', 'durov-s-caps', 'resistance-dogs', 'heart-lockets', 'algorithm-cups', 'intelligence-cups', 'plush-pepes'] },
];

const defs = DEFS.map(d => {
  const ids = d.free ? d.free.map(x => x[0]) : d.items;
  const lost = ids.filter(id => !G.has(id)); if (lost.length) console.warn(`⚠ ${d.id}: нет картинки/цены → убраны: ${lost.join(', ')}`);
  const items = ids.filter(id => G.has(id));
  const art = (d.art || [...items].sort((a, b) => G.get(b).value - G.get(a).value)).filter(id => G.has(id)).slice(0, 5);
  return { id: d.id, name: d.name, price: d.price, image: `images/cases/${d.id}.webp`, theme: d.theme, art, items, ...(d.free ? { free: d.free.filter(x => G.has(x[0])) } : {}) };
});
writeFileSync(ROOT + 'server/gifts.json', JSON.stringify(gifts, null, 1));
writeFileSync(ROOT + 'server/cases.json', JSON.stringify({ starsPerTon: STARS_PER_TON, cases: defs }, null, 1));
console.log(`подарков с реальной 3D-картинкой: ${gifts.length}/${all.length}` + (missing.length ? `; ждут картинку: ${missing.join(', ')}` : ''));
for (const d of defs) {
  const c = computeCase(d, G, {});
  const top = G.get(c.items[0].giftId);
  console.log(d.id.padEnd(7), d.name.padEnd(11), String(d.price || 'FREE').padStart(6), '⭐ ·', String(c.items.length).padStart(2), 'шт ·',
    c.rtp ? `RTP ${(c.rtp * 100).toFixed(1)}% · дороже кейса: ${(c.hit * 100).toFixed(0)}%` : 'бесплатный', '· топ:', top.name, top.value + '⭐');
}
