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

// 2 бесплатных + 18 платных в 4 разделах. Цены в ⭐ (1 TON = 100 ⭐): 49 ⭐ … 129 990 ⭐.
const DEFS = [
  { id: 'case1', name: 'Daily', price: 0, group: 'free', theme: ['#ffb000', '#7c2d00', '#ffe29a'], free: [['heart-15', 0.96], ['snow-globes', 0.04]], art: ['snow-globes', 'heart-15', 'heart-15'] },
  { id: 'case2', name: 'Free', price: 0, group: 'free', theme: ['#ffd21f', '#713f12', '#fff3b0'], free: [['heart-15', 0.97], ['xmas-stockings', 0.03]], art: ['xmas-stockings', 'heart-15', 'heart-15'] },
  // ДЛЯ РАЗОГРЕВА
  { id: 'case4', name: 'Hearts', price: 49, group: 'farm', theme: ['#ff5c8a', '#6b0f2a', '#ffc2d4'], items: ['heart-15', 'bear-15', 'gift-25', 'cake-50', 'trophy-100', 'diamond-100', 'big-years', 'mood-packs'] },
  { id: 'case5', name: 'Sweet', price: 199, group: 'farm', theme: ['#ff9f43', '#6b2d00', '#ffd9a8'], items: ['heart-15', 'gift-25', 'cake-50', 'trophy-100', 'homemade-cakes', 'hypno-lollipops', 'whip-cupcakes', 'berry-boxes', 'jelly-bunnies', 'vice-creams', 'mousse-cakes', 'ginger-cookies', 'bunny-muffins', 'love-candles', 'ice-creams'] },
  { id: 'case6', name: 'Party', price: 399, group: 'farm', theme: ['#22d3ee', '#083344', '#a5f3fc'], items: ['gift-25', 'cake-50', 'trophy-100', 'diamond-100', 'pet-snakes', 'santa-hats', 'spiced-wines', 'instant-ramens', 'pool-floats', 'tama-gadgets', 'party-sparklers', 'jacks-in-the-box', 'snow-globes', 'jolly-chimps', 'hanging-stars', 'joyful-bundles', 'record-players', 'crystal-balls', 'love-potions', 'surge-boards'] },
  // ГОРЯЧЕНЬКОЕ
  { id: 'case3', name: 'Wonderland', price: 790, group: 'hot', theme: ['#a78bfa', '#2e1065', '#e9d5ff'], items: ['cake-50', 'trophy-100', 'diamond-100', 'spy-agarics', 'hypno-lollipops', 'big-years', 'mousse-cakes', 'spring-baskets', 'eternal-candles', 'hex-pots', 'jolly-chimps', 'bunny-muffins', 'snow-mittens', 'witch-hats', 'top-hats', 'sleigh-bells', 'flying-brooms', 'crystal-balls', 'mad-pumpkins', 'cupid-charms', 'eternal-roses'] },
  { id: 'case8', name: 'Love', price: 1490, group: 'hot', theme: ['#fb7185', '#6b0f1f', '#fecdd3'], items: ['trophy-100', 'diamond-100', 'big-years', 'lush-bouquets', 'hanging-stars', 'joyful-bundles', 'love-candles', 'sakura-flowers', 'valentine-boxes', 'crystal-balls', 'love-potions', 'trapped-hearts', 'sky-stilettos', 'cupid-charms', 'eternal-roses', 'diamond-rings', 'toy-bears', 'bonded-rings', 'heart-lockets'] },
  { id: 'case9', name: 'Magic', price: 2490, group: 'hot', theme: ['#c026d3', '#3b0442', '#f5d0fe'], art: ['genie-lamps', 'magic-potions', 'kissed-frogs', 'crystal-balls', 'voodoo-dolls', 'sharp-tongues'], items: ['hypno-lollipops', 'evil-eyes', 'hex-pots', 'witch-hats', 'skull-flowers', 'crystal-balls', 'love-potions', 'trapped-hearts', 'mad-pumpkins', 'cupid-charms', 'eternal-roses', 'bling-binkies', 'rare-birds', 'electric-skulls', 'genie-lamps', 'voodoo-dolls', 'vintage-cigars', 'kissed-frogs', 'sharp-tongues', 'magic-potions', 'scared-cats'] },
  // ТЕМАТИЧЕСКИЕ
  { id: 'case22', name: 'Удача', price: 590, group: 'theme', theme: ['#22c55e', '#052e16', '#bbf7d0'], art: ['money-pots', 'clover-pins', 'genie-lamps', 'liberty-figures', 'lol-pops'], items: ['trophy-100', 'diamond-100', 'clover-pins', 'money-pots', 'lol-pops', 'easter-eggs', 'jester-hats', 'liberty-figures', 'lunar-snakes', 'evil-eyes', 'hanging-stars', 'crystal-balls', 'genie-lamps'] },
  { id: 'case20', name: 'День рождения', price: 690, group: 'theme', theme: ['#f472b6', '#4a0d2e', '#fbcfe8'], art: ['b-day-candles', 'homemade-cakes', 'party-sparklers', 'cookie-hearts', 'bow-ties'], items: ['cake-50', 'trophy-100', 'diamond-100', 'homemade-cakes', 'b-day-candles', 'cookie-hearts', 'party-sparklers', 'desk-calendars', 'bow-ties', 'jacks-in-the-box', 'joyful-bundles', 'record-players', 'love-potions', 'toy-bears'] },
  { id: 'case23', name: 'Новый год', price: 790, group: 'theme', theme: ['#ef4444', '#3a0808', '#fde68a'], art: ['winter-wreaths', 'candy-canes', 'holiday-drinks', 'sleigh-bells', 'santa-hats'], items: ['trophy-100', 'diamond-100', 'santa-hats', 'spiced-wines', 'candy-canes', 'holiday-drinks', 'winter-wreaths', 'ginger-cookies', 'snow-globes', 'snow-mittens', 'sleigh-bells', 'jingle-bells', 'toy-bears'] },
  { id: 'case15', name: 'Зима', price: 990, group: 'theme', theme: ['#7dd3fc', '#082f49', '#e0f2fe'], art: ['snow-globes', 'toy-bears', 'santa-hats', 'jingle-bells', 'snow-mittens', 'xmas-stockings'], items: ['trophy-100', 'diamond-100', 'santa-hats', 'spiced-wines', 'xmas-stockings', 'ginger-cookies', 'snow-globes', 'eternal-candles', 'snow-mittens', 'sleigh-bells', 'jingle-bells', 'eternal-roses', 'diamond-rings', 'toy-bears'] },
  { id: 'case19', name: 'Снуп Догг', price: 1290, group: 'theme', theme: ['#a855f7', '#1e0b3a', '#fde68a'], art: ['snoop-doggs', 'westside-signs', 'swag-bags', 'snoop-cigars', 'record-players'], items: ['trophy-100', 'diamond-100', 'snoop-doggs', 'swag-bags', 'fresh-socks', 'top-hats', 'record-players', 'snoop-cigars', 'bling-binkies', 'vintage-cigars', 'low-riders', 'westside-signs'] },
  { id: 'case21', name: 'Космос', price: 1490, group: 'theme', theme: ['#818cf8', '#0c0a3e', '#c7d2fe'], art: ['astral-shards', 'stellar-rockets', 'moon-pendants', 'light-swords', 'star-notepads'], items: ['trophy-100', 'diamond-100', 'stellar-rockets', 'moon-pendants', 'star-notepads', 'light-swords', 'surge-boards', 'hanging-stars', 'crystal-balls', 'electric-skulls', 'ion-gems', 'astral-shards'] },
  { id: 'case16', name: 'Хэллоуин', price: 1990, group: 'theme', theme: ['#ff8a00', '#3a1200', '#ffd29a'], art: ['mad-pumpkins', 'scared-cats', 'witch-hats', 'magic-potions', 'skull-flowers', 'voodoo-dolls'], items: ['spy-agarics', 'evil-eyes', 'hex-pots', 'witch-hats', 'skull-flowers', 'flying-brooms', 'crystal-balls', 'trapped-hearts', 'mad-pumpkins', 'electric-skulls', 'voodoo-dolls', 'magic-potions', 'scared-cats'] },
  { id: 'case18', name: 'Бойцовский клуб', price: 2990, group: 'theme', theme: ['#ef4444', '#3b0606', '#fecaca'], art: ['khabib-s-papakhas', 'ufc-strikes', 'mighty-arms', 'heroic-helmets', 'victory-medals', 'neko-helmets'], items: ['instant-ramens', 'timeless-books', 'fresh-socks', 'victory-medals', 'input-keys', 'ionic-dryers', 'ufc-strikes', 'khabib-s-papakhas', 'neko-helmets', 'mighty-arms', 'heroic-helmets'] },
  { id: 'case17', name: 'Гангста', price: 4990, group: 'theme', theme: ['#a3e635', '#14240a', '#ecfccb'], art: ['low-riders', 'durov-s-glasses', 'westside-signs', 'swiss-watches', 'snoop-cigars', 'bling-binkies'], items: ['fresh-socks', 'top-hats', 'snoop-cigars', 'bling-binkies', 'rare-birds', 'diamond-rings', 'signet-rings', 'vintage-cigars', 'sharp-tongues', 'low-riders', 'gem-signets', 'swiss-watches', 'westside-signs', 'durov-s-glasses'] },
  // ALL IN
  { id: 'case12', name: 'Royal', price: 7990, group: 'allin', theme: ['#ffc61a', '#3d2a00', '#fff1b8'], items: ['witch-hats', 'top-hats', 'crystal-balls', 'sky-stilettos', 'bling-binkies', 'rare-birds', 'signet-rings', 'neko-helmets', 'bonded-rings', 'kissed-frogs', 'sharp-tongues', 'low-riders', 'gem-signets', 'swiss-watches', 'mini-oscars', 'ion-gems', 'artisan-bricks', 'perfume-bottles', 'westside-signs', 'loot-bags', 'mighty-arms', 'heroic-helmets'] },
  { id: 'case13', name: 'Durov', price: 24990, group: 'allin', theme: ['#60a5fa', '#0b1d40', '#bfdbfe'], items: ['cupid-charms', 'rare-birds', 'signet-rings', 'neko-helmets', 'swiss-watches', 'mini-oscars', 'ion-gems', 'artisan-bricks', 'perfume-bottles', 'westside-signs', 'loot-bags', 'astral-shards', 'nail-bracelets', 'mighty-arms', 'heroic-helmets', 'durov-s-glasses', 'precious-peaches', 'scared-cats', 'durov-s-caps', 'resistance-dogs'] },
  { id: 'case14', name: 'Plush Pepe', price: 129990, group: 'allin', theme: ['#34d399', '#022c22', '#a7f3d0'], items: ['magic-potions', 'mini-oscars', 'perfume-bottles', 'loot-bags', 'mighty-arms', 'heroic-helmets', 'durov-s-glasses', 'precious-peaches', 'scared-cats', 'durov-s-caps', 'resistance-dogs', 'heart-lockets', 'algorithm-cups', 'intelligence-cups', 'plush-pepes'] },
];

const defs = DEFS.map(d => {
  const ids = d.free ? d.free.map(x => x[0]) : d.items;
  const lost = ids.filter(id => !G.has(id)); if (lost.length) console.warn(`⚠ ${d.id}: нет картинки/цены → убраны: ${lost.join(', ')}`);
  const items = ids.filter(id => G.has(id));
  const art = (d.art || [...items].sort((a, b) => G.get(b).value - G.get(a).value)).filter(id => G.has(id)).slice(0, 5);
  return { id: d.id, name: d.name, price: d.price, group: d.group, image: `images/cases/${d.id}.webp`, theme: d.theme, art, items, ...(d.free ? { free: d.free.filter(x => G.has(x[0])) } : {}) };
});
writeFileSync(ROOT + 'server/gifts.json', JSON.stringify(gifts, null, 1));
writeFileSync(ROOT + 'server/cases.json', JSON.stringify({ starsPerTon: STARS_PER_TON, cases: defs }, null, 1));
console.log(`подарков с реальной 3D-картинкой: ${gifts.length}/${all.length}` + (missing.length ? `; ждут картинку: ${missing.join(', ')}` : ''));
for (const d of defs) {
  const c = computeCase(d, G, { model: 'fair', rtp: 0.499 });
  const top = G.get(c.items[0].giftId);
  console.log(d.id.padEnd(7), d.name.padEnd(11), String(d.price || 'FREE').padStart(6), '⭐ ·', String(c.items.length).padStart(2), 'шт ·',
    c.rtp ? `RTP ${(c.rtp * 100).toFixed(1)}% · дороже кейса: ${(c.hit * 100).toFixed(0)}%` : 'бесплатный', '· топ:', top.name, top.value + '⭐');
}
