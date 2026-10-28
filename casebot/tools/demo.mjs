// Сборка демо-превью (без сервера): node tools/demo.mjs <папка>
import { readFileSync, writeFileSync, mkdirSync, cpSync, rmSync } from 'node:fs';
import { GIFTS, CASES, casesForClient } from '../server/catalog.mjs';
import { settings } from '../server/settings.mjs';

const ROOT = new URL('../', import.meta.url).pathname, OUT = process.argv[2] || '/tmp/dd-demo';
rmSync(OUT, { recursive: true, force: true }); mkdirSync(OUT, { recursive: true });
for (const d of ['css', 'js', 'fonts', 'images']) cpSync(ROOT + 'webapp/' + d, OUT + '/' + d, { recursive: true });
cpSync(ROOT + 'webapp/invite_user.svg', OUT + '/invite_user.svg');
cpSync(ROOT + 'tools/demo/demo.js', OUT + '/js/demo.js');
const s = settings();
writeFileSync(OUT + '/demo-data.json', JSON.stringify({
  client: casesForClient(), gifts: GIFTS.map(g => ({ id: g.id, name: g.name, value: g.value, image: g.image, kind: g.kind })),
  cases: Object.fromEntries(CASES.map(c => [c.id, { id: c.id, price: c.price, items: c.items.map(i => ({ giftId: i.giftId, p: i.p, rarity: i.rarity })) }])),
  upgrade: { factor: s.upgradeFactor, maxChance: s.upgradeMaxChance, maxItems: 6, cashbackRate: s.cashbackRate }, withdrawMinTon: s.withdrawMinTon, withdrawWindowDays: s.withdrawWindowDays,
}));
let html = readFileSync(ROOT + 'webapp/index.html', 'utf8');
const head = html.slice(html.indexOf('<head>') + 6, html.indexOf('</head>')), body = html.slice(html.indexOf('<body>') + 6, html.lastIndexOf('</body>'));
const keep = head.split('\n').filter(l => !/telegram-web-app|tonconnect|tgs-player|sweetalert|http-equiv|<meta charset|preconnect|dns-prefetch/.test(l)).join('\n')
  .replace(/<script>\s*\(function \(\) \{\s*var blocked[\s\S]*?<\/script>/, '');
let page = `<title>Drade Drop</title>\n<style>:root{color-scheme:dark}html,body{background:#0c0c0d}</style>\n${keep}\n${body}`;
page = page.replace('<script src="/config.js"></script>', '<script src="js/demo.js"></script>').replace(/\?v=\d+/g, '');
writeFileSync(OUT + '/index.html', page);
console.log('demo →', OUT);
