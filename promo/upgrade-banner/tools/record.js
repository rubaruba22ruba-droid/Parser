// node record.js <demoDir> <outDir> <seed>
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const [demo, out, seed = '7'] = process.argv.slice(2);
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.glb': 'model/gltf-binary' };
const srv = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/index.html';
  const f = path.join(demo, p); fs.readFile(f, (e, b) => { if (e) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream' }); r.end(b); }); });
srv.listen(8765, async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required', '--force-device-scale-factor=2.5'] });
  const ctx = await b.newContext({ viewport: { width: 432, height: 768 }, deviceScaleFactor: 2.5 });
  await ctx.addInitScript(s => {
    let x = Number(s) >>> 0; Math.random = () => { x = (x + 0x6D2B79F5) >>> 0; let t = x; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
    localStorage.setItem('dd_fast', '0');
    localStorage.setItem('dd_demo_v5', JSON.stringify({ balance: 12500, next: 10, free: {}, dtest: true,
      inv: [{ id: 3, name: 'Witch Hats', value: 1000, image: 'images/gifts/witch-hats.webp', rarity: 'epic', giftId: 'witch-hats' },
            { id: 2, name: 'Record Players', value: 1300, image: 'images/gifts/record-players.webp', rarity: 'epic', giftId: 'record-players' },
            { id: 1, name: 'Bow Ties', value: 700, image: 'images/gifts/bow-ties.webp', rarity: 'rare', giftId: 'bow-ties' }] }));
  }, seed);
  const pg = await ctx.newPage(); fs.mkdirSync(out, { recursive: true }); const cdp = await ctx.newCDPSession(pg); const frames = []; cdp.on('Page.screencastFrame', f => { const n = frames.length; fs.writeFileSync(path.join(out, String(n).padStart(5, '0') + '.jpg'), Buffer.from(f.data, 'base64')); frames.push(f.metadata.timestamp); cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {}); }); await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 95, maxWidth: 1080, maxHeight: 1920, everyNthFrame: 1 }); pg.on('console', m => console.log('C:', m.text())); pg.on('pageerror', e => console.log('E:', e.message)); const t0 = Date.now(); const mark = n => console.log(n, ((Date.now() - t0) / 1000).toFixed(2));
  await pg.goto('http://127.0.0.1:8765/'); await pg.waitForTimeout(2500);
  await pg.evaluate(() => window.showUpgradeSection()); 
  await pg.addStyleTag({ content: '#upgDiaTest{display:none!important}' });
  await pg.waitForTimeout(1500); mark('ready');
  await pg.$eval('.upg-item[data-id="3"]', e => e.click()); mark('pick'); await pg.waitForTimeout(700);
  await pg.$eval('#upgMults button[data-m="5"]', e => e.click()); mark('x5'); await pg.waitForTimeout(800);
  await pg.evaluate(() => scrollTo(0, 0)); await pg.$eval('#upgGo', e => e.click()); mark('go');
  await pg.waitForFunction(() => !document.getElementById('upgGo').textContent.includes('Крутим'), null, { timeout: 30000 }); mark('done'); console.log('PRIZE', await pg.evaluate(() => document.getElementById('upgToSlot').innerText.replace(/\s+/g,' ')));
  await pg.waitForTimeout(1200); mark('end'); await cdp.send('Page.stopScreencast'); fs.writeFileSync(path.join(out, 'ts.json'), JSON.stringify({ frames, t0: t0 / 1000 }));
  await ctx.close(); await b.close(); srv.close();
});
