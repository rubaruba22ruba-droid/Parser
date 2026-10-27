// Генерит server/gifts.json из tools/gifts-raw.txt. Формат строки: "Имя|floor" или "Имя|?|оценка" (нет листингов).
import { readFileSync, writeFileSync } from 'node:fs';
const EMOJI = { Cups:'🏆',Lockets:'💖',Dogs:'🐕',Glasses:'🕶️',Helmets:'⛑️',Bracelets:'📿',Shards:'💠',Bags:'👜',Signs:'🪧',Gems:'💎',Watches:'⌚',Riders:'🚗',Rings:'💍',Dolls:'🪆',Bears:'🧸',Skulls:'💀',Birds:'🦜',Binkies:'🍼',Papakhas:'🧢',Charms:'✨',Stilettos:'👠',Dryers:'💨',Strikes:'🥊',Cigars:'🚬',Potions:'🧪',Balls:'🔮',Brooms:'🧹',Players:'📀',Bells:'🔔',Candles:'🕯️',Flowers:'🌸',Hats:'🎩',Stars:'⭐',Bundles:'🎁',Mittens:'🧤',Muffins:'🧁',Pens:'🖋️',Keys:'🔑',Chimps:'🐒',Boards:'🏄',Ties:'🎀',Calendars:'📅',Swords:'⚔️',Pendants:'🌙',Globes:'🔮',Pins:'📌',Hearts:'❤️',Amulets:'🧿',Jars:'🫙',Figures:'🗽',Pots:'🍯',Cakes:'🍰',Sparklers:'🎇',Posies:'💐',Doggs:'🐶',Baskets:'🧺',Notepads:'📒',Rockets:'🚀',Wreaths:'🎄',Years:'🎆',Canes:'🍬',Flames:'🔥',Eggs:'🥚',Brownies:'🍫',Drinks:'🥂',Creams:'🍦',Ramens:'🍜',Pops:'🍭',Snakes:'🐍',Packs:'🎒',Floats:'🦩',Boxes:'📦',Gadgets:'🎮',Books:'📕',Cupcakes:'🧁',Bricks:'🧱',Caps:'🧢',Roses:'🌹',Eyes:'👁️',Socks:'🧦',Signets:'💍',Lamps:'🪔',Cookies:'🍪',Lollipops:'🍭',Bunnies:'🐰',Frogs:'🐸',Bouquets:'💐',Pumpkins:'🎃',Arms:'💪',Oscars:'🏆',Bottles:'🧴',Pepes:'🐸',Peaches:'🍑',Cats:'🐱',Tongues:'👅',Wines:'🍷',Agarics:'🍄',Medals:'🥇',Stockings:'🧦' };
const rarity = v => v >= 100 ? 'legendary' : v >= 25 ? 'epic' : v >= 8 ? 'rare' : 'common';
const gifts = readFileSync(new URL('./gifts-raw.txt', import.meta.url), 'utf8').trim().split('\n').map(l => {
  const p = l.split('|'); const name = p[0];
  const listed = p[1] !== '?';
  const price = listed ? Number(p[1]) : Number(p[2]);
  const last = name.split(' ').pop();
  return { id: name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''), name, price, estimated: !listed,
    emoji: EMOJI[last] || '🎁', rarity: rarity(price) };
});
writeFileSync(new URL('../server/gifts.json', import.meta.url), JSON.stringify(gifts, null, 1));
console.log(gifts.length, 'gifts');
