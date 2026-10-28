// Drade Drop — кешбек-кейс в настоящем 3D (three.js).
// Сумерки, загородная дорога: с неба падает ящик DRADE DROP, поднимает пыль, трясётся, крышка отлетает —
// из ящика бьёт свет и поднимается приз. Текстуры (асфальт, трава, доски, металл, табличка) рисуются кодом
// один раз и кэшируются; геометрия — обычные боксы с металлическим каркасом.
import * as THREE from './vendor/three.module.min.js';

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const easeOutCubic = k => 1 - Math.pow(1 - k, 3);
const easeOutBack = k => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2); };
const fmt = n => Math.round(Number(n) || 0).toLocaleString('ru-RU');
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const STAR = '<svg viewBox="0 0 14 15" width="16" height="16" fill="#FFCA5A" style="vertical-align:-2px"><path d="M6.64 12.19 3.5 14.1a.69.69 0 0 1-1.03-.76l.48-1.9a2.7 2.7 0 0 1 1.29-1.58l3.42-1.64a.32.32 0 0 0-.2-.6l-3.8.65A2.7 2.7 0 0 1 1.5 7.7L.3 6.7a.69.69 0 0 1 .39-1.22l3.67-.29a.69.69 0 0 0 .58-.42L6.36 1.34a.69.69 0 0 1 1.28 0l1.42 3.42c.1.24.32.4.58.42l3.69.29a.69.69 0 0 1 .4 1.22l-2.82 2.4a.69.69 0 0 0-.22.69l.87 3.6a.69.69 0 0 1-1.03.75l-3.16-1.94a.69.69 0 0 0-.72 0z"/></svg>';
const W = 1.45, H = 0.82, D = 0.95, LID = 0.11;   // размеры ящика, м

// ---------- процедурные текстуры ----------
if (!CanvasRenderingContext2D.prototype.roundRect) CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r) {   // старые WebView
  r = Math.min(r, w / 2, h / 2); this.moveTo(x + r, y); this.arcTo(x + w, y, x + w, y + h, r); this.arcTo(x + w, y + h, x, y + h, r); this.arcTo(x, y + h, x, y, r); this.arcTo(x, y, x + w, y, r); this.closePath();
};
function cnv(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d', { willReadFrequently: true })]; }
function grain(g, w, h, amt) { const im = g.getImageData(0, 0, w, h), d = im.data; for (let i = 0; i < d.length; i += 4) { const n = (Math.random() - .5) * amt; d[i] += n; d[i + 1] += n; d[i + 2] += n; } g.putImageData(im, 0, 0); }
function blots(g, w, h, n, light, dark, rmin, rmax) {
  for (let i = 0; i < n; i++) { const x = Math.random() * w, y = Math.random() * h, r = rmin + Math.random() * (rmax - rmin), gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, Math.random() < .5 ? light : dark); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(x - r, y - r, 2 * r, 2 * r); }
}
function toTex(c, repeat, srgb = true) {
  const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  return t;
}
const T = {};   // кэш текстур между открытиями
function roadTex() {
  const [c, g] = cnv(512, 512);
  g.fillStyle = '#2b2b2f'; g.fillRect(0, 0, 512, 512);
  blots(g, 512, 512, 46, 'rgba(78,78,84,.32)', 'rgba(8,8,10,.4)', 18, 90);
  grain(g, 512, 512, 50);
  for (let i = 0; i < 3200; i++) { const v = 130 + Math.random() * 90 | 0; g.fillStyle = `rgba(${v},${v},${v - 6},${Math.random() * .35})`; g.fillRect(Math.random() * 512, Math.random() * 512, 1 + Math.random() * 1.6, 1 + Math.random() * 1.6); }
  g.strokeStyle = 'rgba(6,6,8,.55)';
  for (let i = 0; i < 8; i++) { g.lineWidth = .6 + Math.random() * 1.3; g.beginPath(); let x = Math.random() * 512, y = Math.random() * 512; g.moveTo(x, y); for (let k = 0; k < 9; k++) { x += (Math.random() - .5) * 46; y += (Math.random() - .5) * 46; g.lineTo(x, y); } g.stroke(); }
  // разметка: прерывистая жёлтая по центру, сплошные белые по краям, потёртые
  const line = (x, y, w, h, col) => { g.fillStyle = col; g.fillRect(x, y, w, h); for (let i = 0; i < w * h / 7; i++) { g.fillStyle = `rgba(43,43,47,${.3 + Math.random() * .6})`; g.fillRect(x + Math.random() * w, y + Math.random() * h, 1.5, 1.5); } };
  line(250, 0, 12, 230, '#e3b93c'); line(28, 0, 9, 512, '#d8d6cf'); line(475, 0, 9, 512, '#d8d6cf');
  return toTex(c, [1, 22]);
}
function grassTex() {
  const [c, g] = cnv(512, 512);
  g.fillStyle = '#26331a'; g.fillRect(0, 0, 512, 512);
  blots(g, 512, 512, 60, 'rgba(92,110,40,.35)', 'rgba(12,18,8,.45)', 20, 80);
  const cols = ['#3d5222', '#2d4119', '#566b2b', '#1c2a10', '#6b7a33', '#45591f'];
  for (let i = 0; i < 9000; i++) { const x = Math.random() * 512, y = Math.random() * 512, l = 3 + Math.random() * 7, a = -Math.PI / 2 + (Math.random() - .5) * .9;
    g.strokeStyle = cols[i % cols.length]; g.lineWidth = .8 + Math.random(); g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke(); }
  grain(g, 512, 512, 24);
  return toTex(c, [26, 26]);
}
function gravelTex() {
  const [c, g] = cnv(256, 256);
  g.fillStyle = '#4a4136'; g.fillRect(0, 0, 256, 256); grain(g, 256, 256, 60);
  for (let i = 0; i < 1600; i++) { const v = 80 + Math.random() * 110 | 0; g.fillStyle = `rgb(${v},${v - 8},${v - 18})`; g.beginPath(); g.arc(Math.random() * 256, Math.random() * 256, .8 + Math.random() * 2.2, 0, 7); g.fill(); }
  return toTex(c, [2, 40]);
}
// доски ящика: тёплое дерево, щели, волокна, потёртые края; mark — функция поверх (табличка, трафарет)
function planks(w, h, rows, mark) {
  const [c, g] = cnv(w, h), ph = h / rows;
  for (let r = 0; r < rows; r++) {
    const base = [104 + Math.random() * 22, 72 + Math.random() * 14, 42 + Math.random() * 10];
    g.fillStyle = `rgb(${base.map(v => v | 0).join(',')})`; g.fillRect(0, r * ph, w, ph);
    for (let k = 0; k < 26; k++) {   // волокна
      const y0 = r * ph + Math.random() * ph, amp = 1 + Math.random() * 3, fr = .005 + Math.random() * .02;
      g.strokeStyle = `rgba(${Math.random() < .5 ? '40,24,10' : '150,110,70'},${.12 + Math.random() * .22})`; g.lineWidth = .6 + Math.random() * 1.4; g.beginPath();
      for (let x = 0; x <= w; x += 8) { const y = y0 + Math.sin(x * fr + k) * amp; x ? g.lineTo(x, y) : g.moveTo(x, y); } g.stroke();
    }
    if (Math.random() < .7) { const kx = Math.random() * w, ky = r * ph + ph * (.3 + Math.random() * .4), kr = 4 + Math.random() * 7;   // сучок
      const gr = g.createRadialGradient(kx, ky, 0, kx, ky, kr * 2); gr.addColorStop(0, 'rgba(45,25,10,.85)'); gr.addColorStop(.4, 'rgba(70,40,18,.5)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.beginPath(); g.ellipse(kx, ky, kr * 2.4, kr, 0, 0, 7); g.fill(); }
    g.fillStyle = 'rgba(20,12,6,.85)'; g.fillRect(0, r * ph, w, Math.max(2, h / 120));          // щель
    g.fillStyle = 'rgba(255,220,170,.10)'; g.fillRect(0, r * ph + Math.max(2, h / 120), w, 2); // фаска
  }
  grain(g, w, h, 26);
  blots(g, w, h, 18, 'rgba(160,130,90,.10)', 'rgba(20,12,6,.22)', 14, 60);
  const dirt = g.createLinearGradient(0, h * .65, 0, h); dirt.addColorStop(0, 'rgba(30,20,10,0)'); dirt.addColorStop(1, 'rgba(30,20,10,.45)'); g.fillStyle = dirt; g.fillRect(0, 0, w, h);
  if (mark) mark(g, w, h);
  return toTex(c);
}
function logoPlate(g, w, h) {
  const pw = w * .6, ph = h * .5, x = (w - pw) / 2, y = (h - ph) / 2 + h * .02, r = 18;
  g.save(); g.shadowColor = 'rgba(0,0,0,.6)'; g.shadowBlur = 14; g.shadowOffsetY = 6;
  g.fillStyle = '#141416'; g.beginPath(); g.roundRect(x, y, pw, ph, r); g.fill(); g.restore();
  g.lineWidth = 7; g.strokeStyle = '#ff9900'; g.beginPath(); g.roundRect(x + 6, y + 6, pw - 12, ph - 12, r - 4); g.stroke();
  [[x + 20, y + 20], [x + pw - 20, y + 20], [x + 20, y + ph - 20], [x + pw - 20, y + ph - 20]].forEach(([bx, by]) => {   // заклёпки
    const gr = g.createRadialGradient(bx - 2, by - 2, 0, bx, by, 7); gr.addColorStop(0, '#d9d9de'); gr.addColorStop(1, '#55565c'); g.fillStyle = gr; g.beginPath(); g.arc(bx, by, 6, 0, 7); g.fill(); });
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = '#ffffff'; g.font = `800 ${ph * .24 | 0}px Unbounded, "Exo 2", sans-serif`; g.fillText('DRADE', w / 2, y + ph * .33);
  const tw = pw * .56, th = ph * .34, ty = y + ph * .5;
  g.save(); g.translate(w / 2, ty + th / 2); g.transform(1, 0, -.15, 1, 0, 0); g.rotate(-.03);
  const og = g.createLinearGradient(-tw / 2, -th / 2, tw / 2, th / 2); og.addColorStop(0, '#ffc61a'); og.addColorStop(.55, '#ff9900'); og.addColorStop(1, '#ff6a00');
  g.fillStyle = og; g.beginPath(); g.roundRect(-tw / 2, -th / 2, tw, th, 10); g.fill();
  g.fillStyle = '#111'; g.font = `900 ${th * .7 | 0}px Unbounded, "Exo 2", sans-serif`; g.fillText('DROP', 0, 2); g.restore();
  g.fillStyle = 'rgba(255,255,255,.55)'; g.font = `800 ${ph * .085 | 0}px "Exo 2", sans-serif`; g.fillText('C A S H B A C K', w / 2, y + ph * .92);
}
function stencil(g, w, h) {
  g.save(); g.globalAlpha = .55; g.fillStyle = '#ff9900'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = `900 ${h * .2 | 0}px Unbounded, "Exo 2", sans-serif`; g.fillText('DD-777', w / 2, h * .45);
  g.font = `800 ${h * .09 | 0}px "Exo 2", sans-serif`; g.fillText('НЕ БРОСАТЬ · FRAGILE', w / 2, h * .68); g.restore();
  for (let i = 0; i < 260; i++) { g.fillStyle = `rgba(90,60,30,${Math.random() * .5})`; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); }   // облез трафарет
}
function hazard(g, w, h) {   // полоса «оса» по краю крышки
  const bh = h * .26; g.save(); g.beginPath(); g.rect(0, h - bh, w, bh); g.clip(); g.fillStyle = '#ff9900'; g.fillRect(0, h - bh, w, bh);
  g.fillStyle = '#141416'; for (let x = -bh; x < w + bh; x += bh * 1.4) { g.beginPath(); g.moveTo(x, h); g.lineTo(x + bh * .7, h); g.lineTo(x + bh * 1.4, h - bh); g.lineTo(x + bh * .7, h - bh); g.fill(); }
  g.restore(); grain(g, w, h, 20);
}
function metalTex() {
  const [c, g] = cnv(256, 256);
  g.fillStyle = '#9a9aa0'; g.fillRect(0, 0, 256, 256); grain(g, 256, 256, 70);
  g.strokeStyle = 'rgba(255,255,255,.25)'; for (let i = 0; i < 70; i++) { g.lineWidth = .5; g.beginPath(); const x = Math.random() * 256, y = Math.random() * 256; g.moveTo(x, y); g.lineTo(x + (Math.random() - .5) * 60, y + (Math.random() - .5) * 8); g.stroke(); }
  return toTex(c, [1, 1], false);
}
function radialTex(stops, size = 128) {
  const [c, g] = cnv(size, size), r = size / 2, gr = g.createRadialGradient(r, r, 0, r, r, r);
  stops.forEach(([o, col]) => gr.addColorStop(o, col)); g.fillStyle = gr; g.fillRect(0, 0, size, size); return toTex(c);
}
function smokeTex() {
  const [c, g] = cnv(128, 128);
  for (let i = 0; i < 14; i++) { const x = 64 + (Math.random() - .5) * 46, y = 64 + (Math.random() - .5) * 46, r = 22 + Math.random() * 26, gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, 'rgba(255,255,255,.22)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); }
  return toTex(c);
}
function starTex() {
  const [c, g] = cnv(64, 64), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(.2, 'rgba(255,220,150,.8)'); gr.addColorStop(1, 'rgba(255,160,40,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  g.fillStyle = '#fff'; g.beginPath(); g.moveTo(32, 0); g.lineTo(35, 29); g.lineTo(64, 32); g.lineTo(35, 35); g.lineTo(32, 64); g.lineTo(29, 35); g.lineTo(0, 32); g.lineTo(29, 29); g.fill();
  return toTex(c);
}
function beamTex() {
  const [c, g] = cnv(8, 256), gr = g.createLinearGradient(0, 256, 0, 0);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(.35, 'rgba(255,255,255,.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 8, 256);
  return toTex(c);
}
async function textures() {
  if (T.ready) return T;
  try { await Promise.race([Promise.all(['900 60px Unbounded', '800 60px Unbounded', '900 italic 60px "Exo 2"', '800 40px "Exo 2"'].map(f => document.fonts.load(f))), new Promise(r => setTimeout(r, 1500))]); } catch (e) { }
  T.road = roadTex(); T.grass = grassTex(); T.gravel = gravelTex(); T.metal = metalTex();
  T.front = planks(768, 432, 4, logoPlate); T.side = planks(512, 432, 4, stencil); T.back = planks(768, 432, 4); T.top = planks(768, 504, 5, hazard); T.lidSide = planks(512, 80, 1, hazard);
  T.smoke = smokeTex(); T.star = starTex(); T.beam = beamTex();
  T.glow = radialTex([[0, 'rgba(255,240,200,1)'], [.25, 'rgba(255,190,80,.55)'], [1, 'rgba(255,140,20,0)']]);
  T.lamp = radialTex([[0, 'rgba(255,240,210,1)'], [.2, 'rgba(255,190,110,.6)'], [1, 'rgba(255,150,60,0)']]);
  T.ready = true; return T;
}
export function warm() { return textures(); }

// ---------- сцена ----------
function skyDome() {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color('#0d0a1c') }, mid: { value: new THREE.Color('#3a1834') }, hor: { value: new THREE.Color('#ff7b2c') }, sun: { value: new THREE.Vector3(-0.55, 0.06, -0.83).normalize() } },
    vertexShader: 'varying vec3 vW; void main(){ vW = (modelMatrix * vec4(position,1.0)).xyz; gl_Position = projectionMatrix * viewMatrix * vec4(vW,1.0); }',
    fragmentShader: `uniform vec3 top, mid, hor, sun; varying vec3 vW;
      void main(){ vec3 d = normalize(vW); float h = d.y;
        vec3 c = mix(hor, mid, smoothstep(0.0, 0.22, h)); c = mix(c, top, smoothstep(0.22, 0.75, h));
        c = mix(c, vec3(0.16,0.08,0.07), smoothstep(0.0, -0.08, h));
        float s = max(dot(d, sun), 0.0); c += vec3(1.0,0.62,0.3) * pow(s, 220.0) * 2.0 + vec3(1.0,0.45,0.15) * pow(s, 6.0) * 0.45;
        gl_FragColor = vec4(c, 1.0); }` });
  return new THREE.Mesh(new THREE.SphereGeometry(260, 32, 16), mat);
}
function crate(t) {
  const g = new THREE.Group(), body = new THREE.Group(), lid = new THREE.Group();
  const wood = map => new THREE.MeshStandardMaterial({ map, roughness: .82, metalness: .02 });
  const steel = new THREE.MeshStandardMaterial({ color: '#4a4c53', roughness: .38, metalness: .88, roughnessMap: t.metal });
  const paint = new THREE.MeshStandardMaterial({ color: '#ff8f0a', roughness: .5, metalness: .35, roughnessMap: t.metal });
  const inside = new THREE.MeshStandardMaterial({ color: '#1a120a', roughness: 1, emissive: new THREE.Color('#ffb347'), emissiveIntensity: 0 });
  const bh = H - LID;
  const bodyMesh = new THREE.Mesh(new THREE.BoxGeometry(W, bh, D), [wood(t.side), wood(t.side), inside, wood(t.back), wood(t.front), wood(t.back)]);
  bodyMesh.position.y = bh / 2; body.add(bodyMesh);
  const lidMesh = new THREE.Mesh(new THREE.BoxGeometry(W + .04, LID, D + .04), [wood(t.lidSide), wood(t.lidSide), wood(t.top), wood(t.back), wood(t.lidSide), wood(t.lidSide)]);
  lid.add(lidMesh);
  const bar = (grp, sx, sy, sz, x, y, z, m = steel) => { const b = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), m); b.position.set(x, y, z); grp.add(b); return b; };
  const e = .075, hx = W / 2, hz = D / 2;
  // каркас корпуса: низ, стойки, верхний пояс
  for (const z of [-hz, hz]) { bar(body, W + e, e, e, 0, e / 2, z); bar(body, W + e, e, e, 0, bh - e / 2, z); }
  for (const x of [-hx, hx]) { bar(body, e, e, D + e, x, e / 2, 0); bar(body, e, e, D + e, x, bh - e / 2, 0); }
  for (const x of [-hx, hx]) for (const z of [-hz, hz]) bar(body, e, bh, e, x, bh / 2, z);
  for (const x of [-hx, hx]) for (const z of [-hz, hz]) { bar(body, .13, .13, .13, x, .065, z, paint); }   // нижние уголки — оранжевые
  // защёлки спереди и ручки по бокам
  for (const x of [-W * .3, W * .3]) { bar(body, .1, .14, .04, x, bh - .07, hz + .03); bar(lid, .1, .05, .05, x, -LID / 2 + .01, hz + .04 + .02); }
  for (const s of [-1, 1]) { const h = new THREE.Mesh(new THREE.TorusGeometry(.14, .024, 10, 24, Math.PI), steel); h.rotation.set(0, s * Math.PI / 2, 0); h.position.set(s * (hx + .045), bh * .62, 0); body.add(h); }
  // каркас крышки + верхние уголки
  for (const z of [-hz, hz]) bar(lid, W + e + .04, e, e, 0, 0, z + Math.sign(z) * .02);
  for (const x of [-hx, hx]) bar(lid, e, e, D + e + .04, x + Math.sign(x) * .02, 0, 0);
  for (const x of [-hx, hx]) for (const z of [-hz, hz]) bar(lid, .14, .14, .14, x + Math.sign(x) * .02, 0, z + Math.sign(z) * .02, paint);
  lid.position.y = bh + LID / 2;
  g.add(body, lid);
  g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return { g, body, lid, inside };
}

const STAR3D = 'images/star3d.webp';   // звезда — настоящий 3D-рендер (starSnapshot ниже), не рисунок
function prizeTexture(cb) {
  const url = cb.type === 'gift' && cb.image ? cb.image : STAR3D;
  return new Promise(res => new THREE.TextureLoader().load(url, tx => { tx.colorSpace = THREE.SRGBColorSpace; res(tx); }, undefined, () => res(null)));
}

// ---------- лента «Бонус за смелость» ----------
// Что могло выпасть из кешбека — та же раскладка, что на сервере: обычно 2–8% ставки звёздами, иногда до 30%, редко до 100%;
// от 300 ⭐ — NFT близкой цены. Лента крутится и встаёт на настоящем призе.
const GIFT_ICON = '<svg viewBox="0 0 24 24"><rect x="3" y="8" width="18" height="13" rx="2"/><path d="M3 12h18M12 8v13M12 8c-1.5-3-5-4-6-2s2 3 6 2zm0 0c1.5-3 5-4 6-2s-2 3-6 2z"/></svg>';
function bonusItems(cb, stake, gifts, rate, n, at) {
  const scale = (rate || .08) / .0802, nft = (gifts || []).filter(g => g.kind !== 'regular'), out = [];
  for (let i = 0; i < n; i++) {
    const r = Math.random(), x = r < .15 ? .98 + Math.random() * .02 : r < .4 ? .85 + Math.random() * .13 : Math.random();   // в ленте чаще показываем «жирные» варианты
    const k = x < .85 ? .02 + x / .85 * .06 : x < .98 ? .08 + (x - .85) / .13 * .22 : .3 + (x - .98) / .02 * .7;
    const v = Math.max(1, Math.round((stake || 100) * k * scale));
    const g = v >= 300 ? nft.filter(g => g.value <= v * 1.25 && g.value >= v * .6).sort((a, b) => Math.abs(a.value - v) - Math.abs(b.value - v))[0] : null;
    out.push(g ? { type: 'gift', value: g.value, name: g.name, image: g.image } : { type: 'stars', value: v });
  }
  out[at] = cb; return out;
}
const bonusCard = it => `<div class="dd-bonus-item" style="--g:${it.type === 'gift' ? '163,91,255' : it.value >= 100 ? '255,170,30' : '120,130,160'}">
  <img src="${esc(it.type === 'gift' ? it.image : STAR3D)}" alt="" draggable="false"><b>${it.type === 'gift' ? '' : '+'}${fmt(it.value)} ${STAR}</b></div>`;
function spinBonus(box, items, at, fast) {
  return new Promise(done => {
    const track = box.querySelector('.dd-bonus-track'), cards = track.children, w = cards[0].offsetWidth + 6, win = box.querySelector('.dd-bonus-win').clientWidth;
    const end = at * w + w / 2 - win / 2 + (Math.random() - .5) * w * .6, dur = fast ? 1700 : 3000, t0 = performance.now();
    let last = -1;
    (function f(now) {
      const k = Math.min(1, (now - t0) / dur), x = end * (1 - Math.pow(1 - k, 4));
      track.style.transform = `translate3d(${-x.toFixed(1)}px,0,0)`;
      const i = Math.floor((x + win / 2) / w); if (i !== last) { last = i; try { window.FX && FX.tick(); } catch (e) { } }
      if (k < 1) requestAnimationFrame(f); else { cards[at].classList.add('win'); done(); }
    })(t0);
  });
}

// ---------- проигрывание ----------
export async function play(cb, { fast = false, stake = 0, gifts = [], rate = .08 } = {}) {
  const t = await textures(), prizeTex = await prizeTexture(cb);
  const K = fast ? .62 : 1, NB = fast ? 26 : 40, AT = NB - 5, items = bonusItems(cb, stake, gifts, rate, NB, AT);
  const ov = document.createElement('div'); ov.className = 'dd-crate';
  const prizeHtml = cb.type === 'gift' ? `<div class="dd-crate-name">${esc(cb.name)}</div><div class="dd-crate-val">${STAR} ${fmt(cb.value)} · в инвентаре</div>`
    : `<div class="dd-crate-name">+${fmt(cb.value)} ${STAR}</div><div class="dd-crate-val">на баланс</div>`;
  ov.innerHTML = `<div class="dd-crate-win"><canvas></canvas>
      <div class="dd-crate-top"><b>Кешбек-кейс</b><span>не зашло — держи бонус за смелость</span></div></div>
    <div class="dd-bonus"><div class="dd-bonus-h">${GIFT_ICON}<div><b>Бонус за смелость</b><span>бонус выдаётся случайно</span></div></div>
      <div class="dd-bonus-win"><i class="dd-bonus-ptr"></i><i class="dd-bonus-line"></i><div class="dd-bonus-track">${items.map(bonusCard).join('')}</div></div></div>
    <div class="dd-crate-res">${prizeHtml}</div>
    <button class="dd-crate-ok" type="button">Забрать</button>`;
  document.body.appendChild(ov); document.body.style.overflow = 'hidden';
  const cv = ov.querySelector('canvas'), win = ov.querySelector('.dd-crate-win');
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true, powerPreference: 'high-performance' }); }
  catch (e) { ov.remove(); document.body.style.overflow = ''; throw e; }
  const dpr = Math.min(devicePixelRatio || 1, 1.75), size = () => { const r = win.getBoundingClientRect(); return [Math.max(10, r.width), Math.max(10, r.height)]; };
  let [cw, ch] = size();
  renderer.setPixelRatio(dpr); renderer.setSize(cw, ch, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene(); scene.fog = new THREE.FogExp2('#4a2129', 0.034);
  const cam = new THREE.PerspectiveCamera(38, cw / ch, 0.1, 400);
  scene.add(skyDome());
  // окружение для металла: небо в маленькую карту отражений
  const pm = new THREE.PMREMGenerator(renderer), envScene = new THREE.Scene(); envScene.add(skyDome());
  const env = pm.fromScene(envScene, 0.04).texture; scene.environment = env;

  const hemi = new THREE.HemisphereLight('#ffb27a', '#1b120e', .75); scene.add(hemi);
  const sun = new THREE.DirectionalLight('#ffb36b', 2.6); sun.position.set(-6, 5.5, -7); sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024); Object.assign(sun.shadow.camera, { left: -3.2, right: 3.2, top: 3.2, bottom: -3.2, near: 1, far: 30 }); sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.02;
  scene.add(sun);
  const key = new THREE.DirectionalLight('#ffe2c4', 1.1); key.position.set(4, 3.2, 5); scene.add(key);

  // дорога по диагонали, обочины, трава
  const world = new THREE.Group(); world.rotation.y = -0.5; scene.add(world);
  const road = new THREE.Mesh(new THREE.PlaneGeometry(7, 132), new THREE.MeshStandardMaterial({ map: t.road, roughness: .93 })); road.rotation.x = -Math.PI / 2; road.position.z = -50; road.receiveShadow = true; world.add(road);
  for (const s of [-1, 1]) { const sh = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 132), new THREE.MeshStandardMaterial({ map: t.gravel, roughness: 1 })); sh.rotation.x = -Math.PI / 2; sh.position.set(s * 4.2, -0.004, -50); sh.receiveShadow = true; world.add(sh); }
  const grass = new THREE.Mesh(new THREE.PlaneGeometry(220, 220), new THREE.MeshStandardMaterial({ map: t.grass, roughness: 1 })); grass.rotation.x = -Math.PI / 2; grass.position.set(0, -0.012, -60); grass.receiveShadow = true; world.add(grass);
  // деревья в дымке и фонари
  // ели: три яруса конусов на стволе, вдали от дороги — в дымке это силуэты на фоне заката
  const N = 70, tierGeo = [new THREE.ConeGeometry(1.15, 1.9, 8), new THREE.ConeGeometry(.88, 1.6, 8), new THREE.ConeGeometry(.58, 1.3, 8)], trunkGeo = new THREE.CylinderGeometry(.1, .15, 1.1, 6);
  const needle = new THREE.MeshStandardMaterial({ color: '#16200f', roughness: 1 }), bark = new THREE.MeshStandardMaterial({ color: '#2a1d14', roughness: 1 });
  const tiers = tierGeo.map(gm => new THREE.InstancedMesh(gm, needle, N)), trunks = new THREE.InstancedMesh(trunkGeo, bark, N);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), ps = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < N; i++) {
    const side = i % 2 ? 1 : -1, x = side * (8.5 + Math.random() * 22), z = -8 - Math.random() * 95, s = .7 + Math.random() * .8;
    q.setFromAxisAngle(up, Math.random() * 6); sc.set(s, s * (.9 + Math.random() * .3), s);
    [1.6, 2.6, 3.45].forEach((y, k) => { ps.set(x, y * sc.y, z); m4.compose(ps, q, sc); tiers[k].setMatrixAt(i, m4); });
    ps.set(x, .55 * sc.y, z); m4.compose(ps, q, sc); trunks.setMatrixAt(i, m4);
  }
  world.add(...tiers, trunks);
  const poleMat = new THREE.MeshStandardMaterial({ color: '#2b2b30', roughness: .6, metalness: .6 });
  for (const z of [-7, -24, -41, -58]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(.05, .07, 5, 8), poleMat); pole.position.set(4.6, 2.5, z); world.add(pole);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(1.2, .06, .06), poleMat); arm.position.set(4.05, 4.95, z); world.add(arm);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: t.lamp, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: true }));
    glow.position.set(3.5, 4.85, z); glow.scale.set(2.4, 2.4, 1); world.add(glow);
  }

  // ящик
  const C = crate(t); scene.add(C.g);
  const inner = new THREE.PointLight('#ffb347', 0, 5, 1.6); inner.position.set(0, H - .2, 0); scene.add(inner);
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(.82, .6, 3.4, 40, 1, true),
    new THREE.MeshBasicMaterial({ map: t.beam, color: '#ffcf7a', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
  beam.position.y = H + 1.6; scene.add(beam);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: t.glow, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0, fog: false }));
  halo.position.set(0, H + .95, 0); halo.scale.set(2.6, 2.6, 1); scene.add(halo);
  const prize = new THREE.Sprite(new THREE.SpriteMaterial({ map: prizeTex, transparent: true, depthWrite: false, fog: false, toneMapped: false }));
  prize.position.set(0, H * .6, 0); prize.scale.set(.01, .01, 1); prize.visible = false; scene.add(prize);

  // пыль, камешки, искры
  const dust = [], chips = [], sparks = [];
  const chipGeo = new THREE.BoxGeometry(.045, .03, .04), chipMat = new THREE.MeshStandardMaterial({ color: '#6b6258', roughness: 1 });
  function impactFX() {
    for (let i = 0; i < 34; i++) {
      const a = Math.random() * Math.PI * 2, r = .45 + Math.random() * .45, sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t.smoke, color: '#c9b49a', transparent: true, opacity: 0, depthWrite: false }));
      sp.position.set(Math.cos(a) * r, .12 + Math.random() * .2, Math.sin(a) * r); const s0 = .5 + Math.random() * .5; sp.scale.set(s0, s0, 1); scene.add(sp);
      dust.push({ sp, vx: Math.cos(a) * (1.4 + Math.random() * 2.4), vz: Math.sin(a) * (1.4 + Math.random() * 2.4), vy: .2 + Math.random() * .5, s0, life: 0, max: 1.3 + Math.random() * .9, rot: (Math.random() - .5) * 2 });
    }
    for (let i = 0; i < 16; i++) { const m = new THREE.Mesh(chipGeo, chipMat), a = Math.random() * Math.PI * 2; m.position.set(Math.cos(a) * .7, .05, Math.sin(a) * .55); m.castShadow = true; scene.add(m);
      chips.push({ m, vx: Math.cos(a) * (1 + Math.random() * 2), vz: Math.sin(a) * (1 + Math.random() * 2), vy: 1.5 + Math.random() * 2.2, r: Math.random() * 10 }); }
  }
  const sparkGeo = new THREE.BufferGeometry(), NS = 70, sp3 = new Float32Array(NS * 3), sv = [];
  for (let i = 0; i < NS; i++) { sp3.set([0, -10, 0], i * 3); sv.push({ a: Math.random() * 6.28, r: .1 + Math.random() * .6, v: .4 + Math.random() * 1.2, y: 0, on: false }); }
  sparkGeo.setAttribute('position', new THREE.BufferAttribute(sp3, 3));
  const sparkPts = new THREE.Points(sparkGeo, new THREE.PointsMaterial({ map: t.star, size: .14, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, color: '#ffd28a' }));
  scene.add(sparkPts);

  const camBase = new THREE.Vector3(2.75, 1.32, 4.95), look = new THREE.Vector3(-.05, .52, 0);
  cam.position.copy(camBase); cam.lookAt(look);
  const fall0 = 7.5, tFall0 = .5 * K, fallDur = .62 * K, g = 2 * fall0 / (fallDur * fallDur);
  const tImpact = tFall0 + fallDur, tShake = tImpact + .6 * K, tOpen = tShake + .62 * K;
  let tRise = Infinity, tText = Infinity;   // задаются, когда лента бонуса остановится
  let shakeAmp = 0, opened = false, impacted = false, shook = [false, false, false], textShown = false, whistle = false;
  const bonus = ov.querySelector('.dd-bonus');
  const lidV = new THREE.Vector3(), lidR = new THREE.Vector3();
  C.g.position.y = fall0; C.g.rotation.set(.3, .5, -.22);

  requestAnimationFrame(() => ov.classList.add('on'));
  const FX = window.FX || {};
  const sfx = (fn, ...a) => { try { FX[fn] && FX[fn](...a); } catch (e) { } };
  // шейдеры компилируем до старта, а время анимации копим по кадрам (не больше 1/20 с за кадр):
  // на медленном телефоне сцена чуть замедлится, но падение ящика никогда не проскочит
  try { renderer.compile(scene, cam); renderer.render(scene, cam); } catch (e) { }
  let last = performance.now(), raf = 0, closed = false, time = 0;

  function frame(now) {
    const dt = Math.min(.05, Math.max(0, (now - last) / 1000)); last = now; time += dt;
    // падение → удар → отскок
    if (time >= tFall0 && !whistle) { whistle = true; sfx('tone', 1500, fallDur + .05, 'sine', .05, 0, 260); sfx('noise', fallDur, .05, 0, 900, 3200, .8); }
    if (time < tImpact) {
      const k = Math.max(0, time - tFall0); C.g.position.y = Math.max(0, fall0 - .5 * g * k * k);
      const kk = clamp(k / fallDur, 0, 1); C.g.rotation.set(.3 * (1 - kk), .5 - .5 * kk + .05, -.22 * (1 - kk));
    } else {
      if (!impacted) { impacted = true; impactFX(); shakeAmp = .16; sfx('tone', 92, .8, 'sine', .32, 0, 34); sfx('noise', .9, .22, 0, 1400, 140, .7); sfx('haptic', 'heavy'); }
      const k = time - tImpact, b = .32 * K;
      C.g.position.y = k < b ? Math.sin(k / b * Math.PI) * .16 * (1 - k / b * .3) : 0;
      if (time < tShake) C.g.rotation.set(0, .05, k < b ? Math.sin(k / b * Math.PI) * .07 : 0);
    }
    // тряска перед открытием: три рывка, сквозь щели пробивается свет
    if (time >= tShake && time < tOpen) {
      const k = (time - tShake) / (tOpen - tShake), j = Math.floor(k * 3);
      if (!shook[j]) { shook[j] = true; sfx('tick'); sfx('tone', 150 + j * 40, .1, 'triangle', .18, 0, 90); sfx('haptic', 'light'); }
      const ph = (k * 3) % 1, amp = Math.sin(ph * Math.PI) * (.05 + j * .02);
      C.g.rotation.set(0, .05, (j % 2 ? 1 : -1) * amp); C.g.position.y = Math.sin(ph * Math.PI) * .05;
      C.lid.position.y = H - LID / 2 + Math.sin(ph * Math.PI) * (.02 + j * .015);
      inner.intensity = 2 + j * 4 + Math.sin(now / 30) * 1.5; C.inside.emissiveIntensity = .4 + j * .4;
    }
    // крышка отлетает, свет, приз
    if (time >= tOpen && !opened) {
      opened = true; C.g.rotation.set(0, .05, 0); C.g.position.y = 0;
      lidV.set(-.6, 4.6, -1.2); lidR.set(-3.2, 1.2, 1.4); shakeAmp = .08;
      sfx('noise', .5, .25, 0, 3200, 700, .9); sfx('tone', 520, .35, 'triangle', .12, 0, 1400); sfx('haptic', 'heavy');
      sv.forEach(s => { s.on = true; s.y = H * .7; });
      bonus.classList.add('on');
      setTimeout(() => spinBonus(bonus, items, AT, fast).then(() => {
        sfx('win', cb.type === 'gift' ? 'legendary' : 'rare'); sfx('haptic', 'success');
        tRise = time; tText = time + .75 * K;
      }), 280);
    }
    if (opened) {
      const k = time - tOpen;
      lidV.y -= 9.8 * dt; C.lid.position.addScaledVector(lidV, dt); C.lid.rotation.x += lidR.x * dt; C.lid.rotation.z += lidR.z * dt; C.lid.rotation.y += lidR.y * dt;
      if (C.lid.position.y < -2) C.lid.visible = false;
      inner.intensity = 26 * Math.min(1, k * 3) * (1 - Math.min(.5, k * .2)) + Math.sin(now / 90) * 1.5; C.inside.emissiveIntensity = 2.2;
      beam.material.opacity = Math.min(.42, k * 1.2) * (.85 + Math.sin(now / 180) * .15); beam.rotation.y += dt * .6;
      halo.material.opacity = Math.min(1, k * 2);
      halo.scale.setScalar(2.4 + Math.sin(now / 260) * .15);
    }
    if (time >= tRise && prize.material.map) {
      const k = clamp((time - tRise) / (.85 * K), 0, 1), e = easeOutBack(k);
      prize.visible = true; const s = .05 + 1.18 * e; prize.scale.set(s, s, 1);
      prize.position.y = H * .6 + (1.05 + .1 * Math.sin(now / 420)) * easeOutCubic(k) + (k >= 1 ? .04 * Math.sin(now / 420) : 0);
      prize.material.rotation = Math.sin(now / 900) * .06; halo.position.y = prize.position.y;
    }
    if (time >= tText && !textShown) { textShown = true; ov.classList.add('done'); }
    if (time >= tRise && !prize.material.map && !textShown) { textShown = true; ov.classList.add('done'); }
    // частицы
    for (let i = dust.length - 1; i >= 0; i--) {
      const d = dust[i]; d.life += dt; const k = d.life / d.max;
      if (k >= 1) { scene.remove(d.sp); d.sp.material.dispose(); dust.splice(i, 1); continue; }
      d.vx *= 1 - 2.2 * dt; d.vz *= 1 - 2.2 * dt; d.sp.position.x += d.vx * dt; d.sp.position.z += d.vz * dt; d.sp.position.y += d.vy * dt * (1 - k);
      const s = d.s0 + k * 1.9; d.sp.scale.set(s, s, 1); d.sp.material.opacity = (k < .12 ? k / .12 : 1 - (k - .12) / .88) * .62; d.sp.material.rotation += d.rot * dt;
    }
    for (const c of chips) { if (c.m.position.y <= 0.015 && c.vy < 0) { c.vy *= -.3; c.vx *= .5; c.vz *= .5; } c.vy -= 9.8 * dt; c.m.position.x += c.vx * dt; c.m.position.z += c.vz * dt; c.m.position.y = Math.max(.015, c.m.position.y + c.vy * dt); c.m.rotation.x += c.r * dt; }
    if (opened) { for (let i = 0; i < NS; i++) { const s = sv[i]; s.y += s.v * dt; if (s.y > H + 3) { s.y = H * .7; s.r = .1 + Math.random() * .6; } s.a += dt * 1.4; sp3[i * 3] = Math.cos(s.a) * s.r; sp3[i * 3 + 1] = s.y; sp3[i * 3 + 2] = Math.sin(s.a) * s.r; } sparkGeo.attributes.position.needsUpdate = true; }
    // камера: медленный наезд + тряска
    shakeAmp *= Math.pow(.02, dt);
    const drift = Math.min(1, time / 6);
    cam.position.set(camBase.x - drift * .35 + (Math.random() - .5) * shakeAmp, camBase.y - drift * .05 + (Math.random() - .5) * shakeAmp, camBase.z - drift * .55 + (Math.random() - .5) * shakeAmp * .5);
    cam.lookAt(look.x, look.y + (opened ? Math.min(.35, (time - tOpen) * .5) : 0), look.z);
    renderer.render(scene, cam);
    if (!closed) raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);
  const onResize = () => { [cw, ch] = size(); renderer.setSize(cw, ch, false); cam.aspect = cw / ch; cam.updateProjectionMatrix(); };
  addEventListener('resize', onResize);

  return new Promise(done => {
    ov.querySelector('.dd-crate-ok').addEventListener('click', () => {
      if (closed) return; closed = true; cancelAnimationFrame(raf); removeEventListener('resize', onResize);
      ov.classList.add('bye');
      setTimeout(() => {
        scene.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) [].concat(o.material).forEach(m => m.dispose()); });
        env.dispose(); pm.dispose(); if (cb.type === 'gift' && prizeTex.image instanceof HTMLImageElement) prizeTex.dispose();
        renderer.dispose(); renderer.forceContextLoss(); ov.remove(); document.body.style.overflow = ''; done();
      }, 300);
    });
  });
}

// статичный кадр ящика на прозрачном фоне — для значка «Кешбек-кейс» на экране апгрейда
export async function snapshot(px = 256) {
  const t = await textures(), cv = document.createElement('canvas');
  const renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setSize(px, px, false); renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.setClearColor(0, 0);
  const scene = new THREE.Scene(), pm = new THREE.PMREMGenerator(renderer), es = new THREE.Scene(); es.add(skyDome()); scene.environment = pm.fromScene(es, .04).texture;
  scene.add(new THREE.HemisphereLight('#ffd2a8', '#2a1d14', 1.1));
  const l1 = new THREE.DirectionalLight('#fff0dc', 2.4); l1.position.set(3, 4, 5); scene.add(l1);
  const l2 = new THREE.DirectionalLight('#ff9a3c', 1.6); l2.position.set(-4, 2, -3); scene.add(l2);
  const C = crate(t); C.g.rotation.y = -.55; C.g.position.y = -H / 2; scene.add(C.g);
  const cam = new THREE.PerspectiveCamera(30, 1, .1, 50); cam.position.set(0, 1.25, 3.9); cam.lookAt(0, 0, 0);
  renderer.render(scene, cam); const url = cv.toDataURL('image/png');
  renderer.dispose(); return url;
}

// 3D-звезда (золото с фаской) на прозрачном фоне — картинка звёздных призов (images/star3d.webp)
export async function starSnapshot(px = 320) {
  const cv = document.createElement('canvas');
  const renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setSize(px, px, false); renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.15; renderer.setClearColor(0, 0);
  // студийное окружение: тёплый фон + белые софтбоксы — золото отражает свет, а не тёмное небо
  const scene = new THREE.Scene(), pm = new THREE.PMREMGenerator(renderer), es = new THREE.Scene();
  es.add(new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), new THREE.MeshBasicMaterial({ color: '#7a4210', side: THREE.BackSide })));
  [[0, 0, 30, 30, 18], [-25, 18, 10, 16, 10], [25, -6, 14, 14, 10], [0, 30, 0, 40, 14]].forEach(([x, y, z, w, h]) => {
    const pl = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: '#fff4dc', side: THREE.DoubleSide })); pl.position.set(x, y, z); pl.lookAt(0, 0, 0); es.add(pl); });
  scene.environment = pm.fromScene(es, .03).texture;
  const shape = new THREE.Shape();
  for (let i = 0; i < 10; i++) { const r = i % 2 ? .44 : 1, a = Math.PI / 2 + i * Math.PI / 5, x = Math.cos(a) * r, y = Math.sin(a) * r; i ? shape.lineTo(x, y) : shape.moveTo(x, y); }
  const geo = new THREE.ExtrudeGeometry(shape, { depth: .26, bevelEnabled: true, bevelThickness: .16, bevelSize: .12, bevelSegments: 6, curveSegments: 6 }); geo.center();
  const star = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: '#ffbf2e', metalness: .92, roughness: .26 }));
  star.rotation.set(-.12, .32, 0); scene.add(star);
  scene.add(new THREE.HemisphereLight('#fff1cc', '#5a2a00', .9));
  const l1 = new THREE.DirectionalLight('#ffffff', 3.2); l1.position.set(-2, 3, 4); scene.add(l1);
  const l2 = new THREE.DirectionalLight('#ff9a3c', 1.8); l2.position.set(3, -1, 2); scene.add(l2);
  const cam = new THREE.PerspectiveCamera(30, 1, .1, 50); cam.position.set(0, 0, 4.6); cam.lookAt(0, 0, 0);
  renderer.render(scene, cam); const url = cv.toDataURL('image/png'); renderer.dispose(); return url;
}
