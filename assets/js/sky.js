/* ==========================================================================
   Ночная сакура: ветка с гроздьями цветов (рисуется один раз на canvas) + живые лепестки.
   Цветок: 5 лепестков с выемкой, просвечивание, прожилки, тычинки, разные ракурсы и бутоны.
   Ветка: рекурсивное ветвление, кора с рефлексом, гроздья на черешках, глубина резкости, свечение.
   Лепестки: 3D-кувырок, инерция и ветер, отталкивание от курсора, порыв от прокрутки.
   Работает без сети и без картинок: всё рисуется кодом.
   ========================================================================== */
(function () {
  'use strict';

  var win = window, doc = document;
  var FX = win.NTFX = win.NTFX || {};
  var TAU = Math.PI * 2;

  /* ---------- Утилиты ---------- */
  function rng(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function smooth(a, b, x) { var t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }
  function mk(w, h) { var c = doc.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; }
  function now() { return win.performance && performance.now ? performance.now() : Date.now(); }
  function angDiff(a, b) { var d = (a - b) % TAU; if (d > Math.PI) d -= TAU; else if (d < -Math.PI) d += TAU; return d; }
  function rgba(c, a) { return 'rgba(' + (c[0] | 0) + ',' + (c[1] | 0) + ',' + (c[2] | 0) + ',' + clamp(a, 0, 1).toFixed(3) + ')'; }
  function mixc(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }

  /* Шум значений: для «пятен» плотности цветения */
  function hash2(ix, iy, s) {
    var h = (Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(s, 2246822519)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }
  function vnoise(x, y, s) {
    var ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
    fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
    return lerp(lerp(hash2(ix, iy, s), hash2(ix + 1, iy, s), fx), lerp(hash2(ix, iy + 1, s), hash2(ix + 1, iy + 1, s), fx), fy);
  }

  /* ctx.filter есть не везде (Safari): проверяем по факту, иначе — запасной путь размытия */
  var FILTER = null;
  function canFilter() {
    if (FILTER !== null) return FILTER;
    FILTER = false;
    try {
      var s = mk(16, 16), sc = s.getContext('2d'), d = mk(16, 16), dc = d.getContext('2d');
      if (typeof dc.filter !== 'string') return FILTER;
      sc.fillStyle = '#fff'; sc.fillRect(6, 6, 4, 4);
      dc.filter = 'blur(3px)'; dc.drawImage(s, 0, 0);
      FILTER = dc.getImageData(3, 8, 1, 1).data[3] > 2;
    } catch (e) { FILTER = false; }
    return FILTER;
  }

  /* Размытие src → c в прямоугольник (dx,dy,dw,dh); px — в пикселях приёмника.
     Без ctx.filter: уменьшение в два шага и растяжение обратно. */
  function blurInto(c, src, px, dx, dy, dw, dh) {
    if (px < 0.25) { c.drawImage(src, dx, dy, dw, dh); return; }
    if (canFilter()) {
      c.save(); c.filter = 'blur(' + px.toFixed(2) + 'px)'; c.drawImage(src, dx, dy, dw, dh); c.restore();
      return;
    }
    var f = Math.max(2, Math.round(px * 1.15));
    var w1 = Math.max(2, Math.ceil(src.width / f)), h1 = Math.max(2, Math.ceil(src.height / f));
    var t = mk(w1, h1), tc = t.getContext('2d');
    tc.imageSmoothingEnabled = true; tc.imageSmoothingQuality = 'high';
    tc.drawImage(src, 0, 0, w1, h1);
    var t2 = mk(Math.max(2, w1 >> 1), Math.max(2, h1 >> 1)), t2c = t2.getContext('2d');
    t2c.imageSmoothingEnabled = true; t2c.imageSmoothingQuality = 'high';
    t2c.drawImage(t, 0, 0, t2.width, t2.height);
    tc.clearRect(0, 0, w1, h1);
    tc.drawImage(t2, 0, 0, w1, h1);
    c.save(); c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high';
    c.drawImage(t, dx, dy, dw, dh); c.restore();
  }

  /* ==========================================================================
     Цвета: пять уровней освещённости — от «в тени, бордово-пурпурный» до «освещённый белый»
     ========================================================================== */
  var PAL = [
    { tip: [150, 96, 128], mid: [116, 62, 94], base: [84, 36, 64], eye: [54, 14, 36], vein: [74, 22, 48], rim: [190, 140, 168] },
    { tip: [212, 160, 188], mid: [182, 112, 148], base: [140, 66, 104], eye: [96, 26, 60], vein: [118, 40, 80], rim: [236, 196, 216] },
    { tip: [243, 212, 227], mid: [226, 164, 190], base: [188, 100, 138], eye: [140, 32, 78], vein: [162, 60, 104], rim: [252, 232, 241] },
    { tip: [252, 237, 244], mid: [241, 202, 220], base: [216, 138, 170], eye: [168, 46, 94], vein: [196, 100, 138], rim: [255, 248, 251] },
    { tip: [255, 251, 253], mid: [251, 228, 237], base: [234, 160, 188], eye: [186, 60, 104], vein: [220, 130, 164], rim: [255, 255, 255] }
  ];
  /* Бутоны всегда глубже по цвету; [тело-тёмное, тело-светлое, кончик] */
  var BUD = [
    [[70, 22, 46], [112, 38, 74], [150, 70, 110]],
    [[120, 40, 78], [170, 66, 112], [210, 120, 156]],
    [[168, 58, 106], [212, 96, 142], [240, 168, 196]],
    [[196, 78, 120], [232, 122, 160], [252, 206, 224]],
    [[214, 98, 136], [244, 148, 184], [255, 230, 240]]
  ];
  var ANTHER = [246, 200, 146], FILAMENT = [255, 228, 238], CALYX = [104, 38, 50];

  /* ==========================================================================
     Спрайты цветов
     ========================================================================== */
  function cubTo(p, x0, y0, x1, y1, x2, y2, x3, y3, n) {
    for (var i = 1; i <= n; i++) {
      var t = i / n, u = 1 - t, a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
      p.push([a * x0 + b * x1 + c * x2 + d * x3, a * y0 + b * y1 + c * y2 + d * y3]);
    }
  }
  function quadTo(p, x0, y0, x1, y1, x2, y2, n) {
    for (var i = 1; i <= n; i++) {
      var t = i / n, u = 1 - t;
      p.push([u * u * x0 + 2 * u * t * x1 + t * t * x2, u * u * y0 + 2 * u * t * y1 + t * t * y2]);
    }
  }
  /* Лепесток: (u вдоль 0..1, v поперёк), основание в (0,0). Узкое основание, широкая дистальная часть,
     выемка на конце, случайная асимметрия и изгиб. */
  function petalShape(r, w, nk) {
    var sk = (r() - 0.5) * 0.26, nd = (0.1 + r() * 0.09) * (nk === undefined ? 1 : nk), e1 = (r() - 0.5) * 0.08, e2 = (r() - 0.5) * 0.08;
    var bend = (r() - 0.5) * 0.2, lo = 0.3 + r() * 0.12, c1 = 0.24 + r() * 0.1, c2 = 0.54 + r() * 0.12, h2 = 1.15 + r() * 0.16;
    var wr = w * (1 + sk), wl = w * (1 - sk), p = [[0, 0]], i;
    cubTo(p, 0, 0, c1, 0.26 * wr, c2, h2 * wr, 1 + e1, lo * wr, 11);
    quadTo(p, 1 + e1, lo * wr, 1 - 2 * nd, 0, 1 + e2, -lo * wl, 7);
    cubTo(p, 1 + e2, -lo * wl, c2, -h2 * wl, c1, -0.26 * wl, 0, 0, 11);
    p.pop();
    for (i = 0; i < p.length; i++) p[i][1] += bend * p[i][0] * p[i][0];
    return p;
  }
  /* Гладкий замкнутый контур через середины отрезков */
  function smoothPath(c, p, dx, dy) {
    var n = p.length, i, a, b;
    c.beginPath();
    c.moveTo((p[n - 1][0] + p[0][0]) / 2 + dx, (p[n - 1][1] + p[0][1]) / 2 + dy);
    for (i = 0; i < n; i++) {
      a = p[i]; b = p[(i + 1) % n];
      c.quadraticCurveTo(a[0] + dx, a[1] + dy, (a[0] + b[0]) / 2 + dx, (a[1] + b[1]) / 2 + dy);
    }
    c.closePath();
  }
  /* Тень от лепестка только на то, что уже нарисовано под ним (source-atop): без тёмного ореола снаружи */
  var OFF = 3000;
  function castShadow(c, p, color, blur, oy) {
    c.save();
    c.globalCompositeOperation = 'source-atop';
    c.shadowColor = color; c.shadowBlur = blur; c.shadowOffsetX = -OFF; c.shadowOffsetY = oy;
    smoothPath(c, p, OFF, 0);
    c.fillStyle = '#000'; c.fill();
    c.restore();
  }

  /* Позы цветка: наклон (рад), подъём кончиков, «чашность», длина/ширина лепестков */
  var KINDS = [
    { tilt: 0.10, lift: 0.06, cup: 0.10, len: 1.0, wid: 1.0, stam: 1.0 },     // 0 анфас
    { tilt: 0.18, lift: 0.10, cup: 0.14, len: 0.97, wid: 1.06, stam: 1.0 },   // 1 анфас, чуть иначе
    { tilt: 0.62, lift: 0.12, cup: 0.18, len: 1.0, wid: 1.0, stam: 1.0 },     // 2 наклон ~35°
    { tilt: 0.98, lift: 0.14, cup: 0.20, len: 1.0, wid: 1.0, stam: 1.0 },     // 3 наклон ~56°
    { tilt: 1.30, lift: 0.14, cup: 0.22, len: 0.98, wid: 1.0, stam: 1.0 },    // 4 почти сбоку
    { tilt: 0.42, lift: 0.46, cup: 0.52, len: 0.82, wid: 0.94, stam: 1.5 }    // 5 полураскрытый
  ];

  function flowerSprite(S, pal, K, seed) {
    var r = rng(seed), cv = mk(S, S), c = cv.getContext('2d');
    var R = S * 0.42, cx = S / 2, cy = S / 2, ca = Math.cos(K.tilt), sa = Math.sin(K.tilt);
    var px = Math.max(0.5, S / 128), ps = [], k, j, q;
    var a0 = r() * TAU;

    function P3(x, y, z) { return [cx + x, cy + y * ca - z * sa]; }

    for (k = 0; k < 5; k++) {
      (function () {
        var th = a0 + k * TAU / 5 + (r() - 0.5) * 0.24, len = R * K.len * (0.9 + r() * 0.17);
        var sh = petalShape(r, (0.62 + r() * 0.1) * K.wid), lift = K.lift * (0.75 + r() * 0.5);
        var ct = Math.cos(th), st = Math.sin(th), pts = [], zs = 0, i;
        function map(u, v) {
          var X = (u * ct - v * st) * len, Y = (u * st + v * ct) * len, Z = len * (lift * Math.pow(Math.max(u, 0), 1.6) + K.cup * v * v * u);
          return [cx + X, cy + Y * ca - Z * sa, Y * sa + Z * ca];
        }
        for (i = 0; i < sh.length; i++) { var m = map(sh[i][0], sh[i][1]); pts.push([m[0], m[1]]); zs += m[2]; }
        ps.push({ p: pts, z: zs / sh.length + k * 0.01, tip: map(1, 0), map: map, th: th, len: len, w: sh });
      })();
    }
    ps.sort(function (a, b) { return a.z - b.z; });

    /* чашелистик позади: виден у наклонённых цветков */
    if (K.tilt > 0.5) {
      var cp = P3(0, 0, -R * 0.1);
      c.fillStyle = rgba(mixc(CALYX, pal.base, 0.2), 0.95);
      c.beginPath(); c.ellipse(cp[0], cp[1] + R * 0.02, R * 0.15, R * 0.1 * (0.4 + ca * 0.6), 0, 0, TAU); c.fill();
    }
    /* подложка: закрывает щели между узкими основаниями лепестков */
    var pl0 = P3(0, 0, 0), gpl = c.createRadialGradient(pl0[0], pl0[1], 0, pl0[0], pl0[1], R * 0.42);
    gpl.addColorStop(0, rgba(pal.base, 1)); gpl.addColorStop(0.7, rgba(pal.mid, 1)); gpl.addColorStop(1, rgba(pal.mid, 0));
    c.fillStyle = gpl; c.beginPath(); c.ellipse(pl0[0], pl0[1], R * 0.42, R * 0.42 * ca, 0, 0, TAU); c.fill();

    for (j = 0; j < ps.length; j++) {
      q = ps[j];
      castShadow(c, q.p, rgba(pal.eye, 0.55), R * 0.09, R * 0.02);
      /* заливка: у основания насыщеннее, к краю светлее и прозрачнее (просвечивание) */
      var g = c.createLinearGradient(cx, cy, q.tip[0], q.tip[1]);
      g.addColorStop(0, rgba(pal.base, 0.99)); g.addColorStop(0.42, rgba(pal.mid, 0.97)); g.addColorStop(1, rgba(pal.tip, 0.9));
      smoothPath(c, q.p, 0, 0);
      c.fillStyle = g; c.fill();
      c.save();
      c.clip();
      /* тёмное «глазко» у основания */
      var gb = c.createRadialGradient(cx, cy, 0, cx, cy, R * 0.55);
      gb.addColorStop(0, rgba(pal.eye, 0.75)); gb.addColorStop(0.5, rgba(pal.base, 0.22)); gb.addColorStop(1, rgba(pal.base, 0));
      c.fillStyle = gb; c.fillRect(0, 0, S, S);
      /* прожилки */
      c.lineWidth = 0.6 * px; c.lineCap = 'round';
      for (var vi = -2; vi <= 2; vi++) {
        var a1 = q.map(0.08, 0), a2 = q.map(0.5 + r() * 0.1, vi * 0.07), a3 = q.map(0.74 + r() * 0.12, vi * 0.16);
        c.strokeStyle = rgba(pal.vein, vi === 0 ? 0.36 : 0.24);
        c.beginPath(); c.moveTo(a1[0], a1[1]); c.quadraticCurveTo(a2[0], a2[1], a3[0], a3[1]); c.stroke();
      }
      /* контровой свет: края светлее и прозрачнее */
      smoothPath(c, q.p, 0, 0);
      c.lineJoin = 'round';
      c.strokeStyle = rgba(pal.rim, 0.26); c.lineWidth = R * 0.15; c.stroke();
      c.strokeStyle = rgba(pal.rim, 0.34); c.lineWidth = R * 0.055; c.stroke();
      c.restore();
    }

    /* центр: «глазок», тычинки с пыльниками, пестик */
    var ce = P3(0, 0, R * 0.05), ge = c.createRadialGradient(ce[0], ce[1], 0, ce[0], ce[1], R * 0.2);
    ge.addColorStop(0, rgba(pal.eye, 0.9)); ge.addColorStop(1, rgba(pal.eye, 0));
    c.fillStyle = ge; c.beginPath(); c.arc(ce[0], ce[1], R * 0.2, 0, TAU); c.fill();

    var ns = 13 + ((r() * 6) | 0), sl;
    for (j = 0; j < ns; j++) {
      var ph = r() * TAU, l = R * (0.26 + r() * 0.3) * (0.9 + 0.2 * K.stam), zt = l * (0.18 + r() * 0.3) * K.stam;
      var t1 = P3(Math.cos(ph) * l, Math.sin(ph) * l, zt), m1 = P3(Math.cos(ph) * l * 0.5, Math.sin(ph) * l * 0.5, zt * 0.2 + R * 0.04);
      c.strokeStyle = rgba(FILAMENT, 0.8); c.lineWidth = 0.75 * px;
      c.beginPath(); c.moveTo(ce[0], ce[1]); c.quadraticCurveTo(m1[0], m1[1] - R * 0.02, t1[0], t1[1]); c.stroke();
      c.fillStyle = rgba(mixc(ANTHER, pal.base, 0.15 + r() * 0.25), 0.98);
      sl = R * (0.032 + r() * 0.012);
      c.beginPath(); c.ellipse(t1[0], t1[1], sl * 1.2, sl, ph, 0, TAU); c.fill();
    }
    var pt = P3(R * 0.02, -R * 0.02, R * 0.46);
    c.strokeStyle = rgba(mixc(FILAMENT, pal.base, 0.3), 0.95); c.lineWidth = 1.3 * px;
    c.beginPath(); c.moveTo(ce[0], ce[1]); c.lineTo(pt[0], pt[1]); c.stroke();
    c.fillStyle = 'rgba(232,236,176,.95)'; c.beginPath(); c.arc(pt[0], pt[1], R * 0.04, 0, TAU); c.fill();

    return { c: cv, fd: R * 2, cx: cx, cy: cy };
  }

  /* Бутон: плотный тёмно-розовый; open=1 — недораскрытый: светлые кончики трёх лепестков, видны тычинки */
  function budSprite(S, lvl, open, seed) {
    var r = rng(seed), cv = mk(S, S), c = cv.getContext('2d'), px = Math.max(0.5, S / 128);
    var R = S * 0.42, bx = S / 2, by = S * 0.82, L = R * (open ? 0.98 : 0.92), Wb = R * (open ? 0.27 : 0.24), bc = BUD[lvl], k;
    function body(h, w) {
      c.beginPath(); c.moveTo(bx, by);
      c.bezierCurveTo(bx + w * 1.5, by - h * 0.12, bx + w * 1.3, by - h * 0.7, bx + w * 0.1, by - h);
      c.bezierCurveTo(bx - w * 1.3, by - h * 0.7, bx - w * 1.5, by - h * 0.12, bx, by);
      c.closePath();
    }
    function lobe(x, y, rx, ry, rot, light) {
      c.save(); c.translate(x, y); c.rotate(rot);
      var gp = c.createLinearGradient(0, ry, 0, -ry);
      gp.addColorStop(0, rgba(bc[1], 1)); gp.addColorStop(0.55, rgba(mixc(bc[1], bc[2], 0.6), 1)); gp.addColorStop(1, rgba(light, 1));
      c.fillStyle = gp; c.beginPath(); c.ellipse(0, 0, rx, ry, 0, 0, TAU); c.fill();
      c.strokeStyle = rgba([255, 244, 249], 0.5); c.lineWidth = 1 * px; c.stroke();
      c.restore();
    }
    /* черешок */
    c.strokeStyle = rgba([150, 98, 100], 0.9); c.lineWidth = 1.6 * px;
    c.beginPath(); c.moveTo(bx, by + R * 0.3); c.lineTo(bx, by); c.stroke();
    var bh = open ? L * 0.8 : L;
    body(bh, Wb);
    var g = c.createLinearGradient(bx - Wb * 1.3, 0, bx + Wb * 1.3, 0);
    g.addColorStop(0, rgba(bc[0], 1)); g.addColorStop(0.5, rgba(bc[1], 1)); g.addColorStop(1, rgba(mixc(bc[0], bc[1], 0.5), 1));
    c.fillStyle = g; c.fill();
    c.save(); c.clip();
    var gt = c.createLinearGradient(0, by, 0, by - bh);
    gt.addColorStop(0, rgba(bc[0], 0.55)); gt.addColorStop(0.6, rgba(bc[1], 0)); gt.addColorStop(1, rgba(bc[2], open ? 0.8 : 0.5));
    c.fillStyle = gt; c.fillRect(0, 0, S, S);
    c.lineWidth = 0.7 * px; c.strokeStyle = rgba(bc[0], 0.5);
    for (k = -1; k <= 1; k++) {
      c.beginPath(); c.moveTo(bx + k * Wb * 0.2, by);
      c.quadraticCurveTo(bx + k * Wb * 1.2 + Wb * 0.4, by - bh * 0.5, bx + k * Wb * 0.1, by - bh * 0.95); c.stroke();
    }
    c.strokeStyle = rgba(bc[2], 0.4); c.lineWidth = R * 0.08; body(bh, Wb); c.stroke();
    c.restore();
    if (open) {
      var lt = [255, 236, 244];
      lobe(bx - Wb * 0.7, by - L * 0.74, Wb * 0.7, L * 0.3, -0.38, lt);
      lobe(bx + Wb * 0.7, by - L * 0.74, Wb * 0.7, L * 0.3, 0.38, lt);
      c.fillStyle = rgba(ANTHER, 0.95); c.beginPath(); c.arc(bx, by - L * 0.9, R * 0.035, 0, TAU); c.fill();
      lobe(bx, by - L * 0.74, Wb * 0.82, L * 0.34, 0, lt);
    }
    /* чашелистик */
    c.beginPath(); c.moveTo(bx - Wb * 0.7, by - L * 0.26); c.quadraticCurveTo(bx - Wb * 1.1, by - L * 0.04, bx - Wb * 0.16, by + R * 0.05);
    c.lineTo(bx + Wb * 0.16, by + R * 0.05); c.quadraticCurveTo(bx + Wb * 1.1, by - L * 0.04, bx + Wb * 0.7, by - L * 0.26);
    c.quadraticCurveTo(bx, by - L * 0.15, bx - Wb * 0.7, by - L * 0.26); c.closePath();
    var gc = c.createLinearGradient(0, by - L * 0.26, 0, by + R * 0.05);
    gc.addColorStop(0, rgba(mixc(CALYX, [170, 80, 80], 0.5), 1)); gc.addColorStop(1, rgba(CALYX, 1));
    c.fillStyle = gc; c.fill();
    return { c: cv, fd: R * 2, cx: bx, cy: by };
  }

  /* Размытая копия спрайта (глубина резкости): с запасом по краям */
  function soften(spr, px) {
    var pad = Math.ceil(px * 2.4), w = spr.c.width + pad * 2, h = spr.c.height + pad * 2;
    var t = mk(w, h), o = mk(w, h);
    t.getContext('2d').drawImage(spr.c, pad, pad);
    blurInto(o.getContext('2d'), t, px, 0, 0, w, h);
    return { c: o, fd: spr.fd, cx: spr.cx + pad, cy: spr.cy + pad };
  }

  /* Набор: f[вид][уровень света], s1 — слегка мягкие, s2 — сильно размытые (боке). Строится по видам. */
  function newSprites() { var o = { f: [], s1: [], s2: [] }, k; for (k = 0; k < 8; k++) { o.f[k] = []; o.s1[k] = []; o.s2[k] = []; } return o; }
  function addKind(out, S, seed, k) {
    for (var l = 0; l < 5; l++) {
      out.f[k][l] = k < 6 ? flowerSprite(S, PAL[l], KINDS[k], seed + k * 101 + l * 7) : budSprite(S, l, k === 7 ? 1 : 0, seed + k * 101 + l * 7);
    }
  }
  var SOFT1 = [0, 1, 2, 3, 5, 6], SOFT2 = [0, 1, 2, 5];
  function addSoft(out, S, k) {
    var l;
    if (SOFT1.indexOf(k) >= 0) for (l = 0; l < 5; l++) out.s1[k][l] = soften(out.f[k][l], S * 0.03);
    if (SOFT2.indexOf(k) >= 0) for (l = 2; l < 5; l++) out.s2[k][l] = soften(out.f[k][l], S * 0.065);
  }

  /* Нарисовать спрайт: x,y — центр (у бутона — основание); size — диаметр цветка в CSS px */
  function put(c, d, spr, x, y, size, rot, a) {
    var s = size / spr.fd * d, co = Math.cos(rot) * s, si = Math.sin(rot) * s;
    c.globalAlpha = a;
    c.setTransform(co, si, -si, co, x * d, y * d);
    c.drawImage(spr.c, -spr.cx, -spr.cy);
  }

  /* ==========================================================================
     Ветка: строится один раз, кусками, чтобы не блокировать главный поток
     ========================================================================== */
  /* маска «где ветка может быть»: от угла, с тёмными полями слева (там текст) */
  function makeMask(W, H, narrow) {
    var small = W < 600;
    return function (x, y) {
      var nx = x / W, ny = y / H, m;
      if (small) {
        var rr = Math.sqrt(Math.pow((1 - nx) * 1.0, 2) + Math.pow(ny * 0.8, 2));
        m = 1 - smooth(0.26, 0.98, rr);
        m *= 1 - smooth(0.34, 0.82, ny) * 0.85;
        m *= 1 - 0.5 * smooth(0.3, 0.46, ny) * (1 - smooth(0.74, 0.96, nx));      // заголовок: приглушаем
      } else if (narrow) {                  // планшет: одна колонка, заголовок на всю ширину
        var r3 = Math.sqrt(Math.pow((1 - nx) * 0.98, 2) + Math.pow(ny * 1.12, 2));
        m = 1 - smooth(0.34, 1.0, r3);
        m *= 1 - 0.78 * smooth(120, 190, y) * (1 - smooth(430, 520, y)) * (1 - smooth(0.78 * W, 0.97 * W, x));
      } else {
        var r2 = Math.sqrt(Math.pow((1 - nx) * 0.98, 2) + Math.pow(ny * 1.12, 2));
        m = 1 - smooth(0.34, 1.0, r2);
        var tl = lerp(0.04, 0.4, smooth(0.14, 0.42, ny));
        m *= smooth(tl, tl + 0.26, nx);
      }
      return m;
    };
  }

  function buildCanopy(canvas, opts, done) {
    var token = { cancel: false, stats: { work: 0, wall: 0, maxSlice: 0, jobs: [] } };
    var t0 = now();
    var W = Math.max(200, canvas.offsetWidth || canvas.getBoundingClientRect().width), H = Math.max(200, canvas.offsetHeight || canvas.getBoundingClientRect().height);
    var lite = !!opts.lite, small = W < 600, seed = opts.seed || 11;
    var dpr = Math.min(win.devicePixelRatio || 1, lite ? 1 : 2);
    while (W * H * dpr * dpr > 4.6e6 && dpr > 1) dpr -= 0.25;
    if (dpr < 1) dpr = 1;
    var PW = Math.round(W * dpr), PH = Math.round(H * dpr);
    var U = clamp(W / 1180, 0.4, 1.15);                 // масштаб толщин/шагов
    var FS = small ? 0.8 : 1;                           // масштаб цветов
    var narrow = !!opts.narrow, M = makeMask(W, H, narrow);
    var S = lite ? 64 : small ? 96 : 128;
    token.dims = { w: W, h: H, narrow: narrow };

    /* первая сборка — прямо в видимый (ещё прозрачный) canvas: растеризация распределяется по кадрам;
       пересборка при ресайзе — в запасной canvas с мгновенной подменой */
    var direct = !!opts.direct, work;
    if (direct) { canvas.width = PW; canvas.height = PH; work = canvas; } else work = mk(PW, PH);
    var ctx = work.getContext('2d');
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    var sp, tree, ops = [], bokeh = [];

    function reset() { ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; }
    reset();

    /* свет — сверху справа */
    var LX = 0.62, LY = -0.78, Dref = small ? 470 : Math.max(W, 900);
    function lightAt(x, y) {
      var d = Math.hypot((W - x) * 0.95, y * 1.1) / Dref;
      return clamp((1.22 - d * 1.15) * (small ? 0.82 : 1), 0, 1);
    }

    /* ---------- дерево ---------- */
    function genTree() {
      var R = rng(seed * 131 + 5), branches = [], nodes = [];
      var density = lite ? 0.55 : small ? 0.75 : 1;
      function grow(x, y, ang, len, w0, depth, front, z, parent) {
        var step = (depth < 2 ? 14 : 9) * Math.max(U, 0.6);
        var n = Math.max(3, Math.round(len / step)), pts = [], turn = 0, i, t;
        var curl = depth === 0 ? 0.07 : depth === 1 ? 0.16 : 0.26;
        var grav = depth === 0 ? 0.008 : depth === 1 ? 0.012 : 0.012;
        var wob = depth === 0 ? 0.02 : depth === 1 ? 0.05 : 0.09, wf = 0.4 + R() * 0.4, wp = R() * TAU;
        for (i = 0; i <= n; i++) {
          t = i / n;
          pts.push({ x: x, y: y, a: ang, w: Math.max(0.35 * U, w0 * (1 - 0.86 * Math.pow(t, 0.85))) });
          turn = turn * 0.8 + (R() - 0.5) * curl;
          ang += turn + angDiff(Math.PI / 2, ang) * grav + Math.cos(i * wf + wp) * wob;
          x += Math.cos(ang) * step; y += Math.sin(ang) * step;
        }
        var br = { pts: pts, depth: depth, front: front, z: z, parent: parent, used: depth <= 1 };
        branches.push(br);
        var nk = depth === 0 ? 9 + ((R() * 4) | 0) : depth === 1 ? 5 + ((R() * 3) | 0) : depth === 2 ? 4 + ((R() * 3) | 0) : depth === 3 ? 2 + ((R() * 3) | 0) : 0;
        nk = Math.round(nk * density);
        var k, tt, idx, pp, side, ca, cl, ex, ey;
        for (k = 0; k < nk; k++) {
          tt = lerp(0.08, 0.95, (k + R() * 0.8) / nk);
          idx = Math.min(n, Math.round(tt * n)); pp = pts[idx];
          side = (k & 1) ? 1 : -1; if (R() < 0.25) side = -side;
          ca = pp.a + side * (0.5 + R() * 0.75);
          cl = len * (depth === 0 ? 0.28 + R() * 0.3 : 0.36 + R() * 0.32) * (1 - 0.35 * tt);
          if (cl < 9 * Math.max(U, 0.7)) continue;
          ex = pp.x + Math.cos(ca) * cl * 0.7; ey = pp.y + Math.sin(ca) * cl * 0.7;
          if (Math.max(M(pp.x, pp.y), M(ex, ey)) < 0.04 + R() * 0.16) continue;
          grow(pp.x, pp.y, ca, cl, pp.w * 0.66, depth + 1, front, clamp(z + (R() - 0.5) * 0.25, 0, 1), br);
        }
        /* узлы для соцветий: на кончике и вдоль веточки */
        if (depth >= 2) {
          var np = depth === 2 ? 3 : depth === 3 ? 2 : 0, j, e = pts[n];
          nodes.push({ x: e.x, y: e.y, a: e.a, depth: depth, tip: true, br: br, z: z });
          for (j = 0; j < np; j++) {
            idx = Math.round(lerp(0.28, 0.92, R()) * n); pp = pts[idx];
            nodes.push({ x: pp.x, y: pp.y, a: pp.a + (R() < 0.5 ? -1 : 1) * (0.5 + R() * 0.6), depth: depth, tip: false, br: br, z: z });
          }
        }
        return br;
      }
      var limbs = [
        [1.08, 0.00, 2.86, 0.95, 18, 0.85], [1.08, 0.10, 2.58, 0.80, 15, 0.55], [1.04, -0.04, 3.05, 0.72, 11, 0.3],
        [1.08, 0.26, 2.22, 0.62, 12, 0.8], [1.08, 0.42, 1.95, 0.5, 10, 0.45], [0.98, -0.05, 2.45, 0.52, 8, 0.15]
      ];
      var i, lm, ang;
      for (i = 0; i < limbs.length; i++) {
        lm = limbs[i];
        ang = lm[2] + (R() - 0.5) * 0.1 - (small ? 0.22 : 0);
        grow(lm[0] * W, lm[1] * H, ang, lm[3] * W, lm[4] * U * (small ? 1.25 : 1), 0, false, lm[5], null);
      }
      /* передние ветви: часть крупных рисуется поверх цветов */
      branches.forEach(function (b) { if (b.depth >= 1 && b.depth <= 2 && b.z > 0.55 && R() < 0.3) b.front = true; });
      return { branches: branches, nodes: nodes };
    }

    /* соцветия: цветы по 2–5 на черешках от узла + бутоны */
    function genFlowers() {
      var R = rng(seed * 977 + 31), nodes = tree.nodes, maxN = lite ? 110 : small ? 150 : 520;
      var g = [], cell = 18 * Math.max(U, 0.6), gw = Math.ceil(W / cell) + 2, gh = Math.ceil(H / cell) + 2, i, j, k, nd;
      for (i = 0; i < gw * gh; i++) g.push(0);
      var cand = [];
      for (i = 0; i < nodes.length; i++) {
        nd = nodes[i];
        var m = M(nd.x, nd.y);
        if (m < 0.04) continue;
        var nz = vnoise(nd.x / (150 * U), nd.y / (150 * U), seed);
        var pr = Math.pow(m, 0.7) * (0.1 + 1.7 * smooth(0.28, 0.68, nz));
        if (R() < pr + (nd.tip ? 0.12 : 0)) { nd.nz = nz; cand.push(nd); }
      }
      if (cand.length > maxN) {                              // равномерно прореживаем
        var keep = [], stepN = cand.length / maxN;
        for (i = 0; i < maxN; i++) keep.push(cand[Math.floor(i * stepN)]);
        cand = keep;
      }
      var nCl = cand.length;
      for (i = 0; i < cand.length; i++) {
        nd = cand[i];
        var rn = R(), nF = (rn < 0.2 ? 2 : rn < 0.55 ? 3 : rn < 0.82 ? 4 : 5) + (nd.nz > 0.62 && R() < 0.6 ? 1 : 0);
        var zz = nd.z;
        var baseS = (nd.depth === 2 ? 36 : nd.depth === 3 ? 29 : 23) * FS * lerp(0.58, 1.22, zz) * lerp(1, 0.8, smooth(0, 0.9, Math.hypot((W - nd.x) / W, nd.y / H)));
        var fan = 0.5 + R() * 0.45, budDone = false, near = zz > 0.7 && R() < 0.16;
        var nzc = vnoise(nd.x / (110 * U) + 7, nd.y / (110 * U) + 3, seed + 5);
        var Lc = lightAt(nd.x, nd.y) * lerp(0.62, 1.05, zz) + (nzc - 0.5) * 0.9 + (R() - 0.5) * 0.18;
        for (var br0 = nd.br; br0 && !br0.used; br0 = br0.parent) br0.used = true;
        nd.br.used = true;
        for (j = 0; j < nF; j++) {
          var ang = nd.a + (j - (nF - 1) / 2) * fan + (R() - 0.5) * 0.5;
          var sz = baseS * (0.72 + R() * 0.55) * (near ? 1.35 : 1);
          var pl = sz * (0.55 + R() * 0.55);
          var fx = nd.x + Math.cos(ang) * pl, fy = nd.y + Math.sin(ang) * pl + pl * 0.16;
          var dang = Math.atan2(fy - nd.y, fx - nd.x);
          var kr = R(), kind;
          if (!budDone && nF >= 3 && R() < 0.55) { kind = R() < 0.55 ? 6 : 7; budDone = true; }
          else kind = kr < 0.24 ? 0 : kr < 0.42 ? 1 : kr < 0.6 ? 2 : kr < 0.74 ? 3 : kr < 0.82 ? 4 : kr < 0.94 ? 5 : 6;
          var rot = kind <= 1 ? R() * TAU : dang + Math.PI / 2 + (R() - 0.5) * 0.5;
          var op = { k: kind, x: fx, y: fy, s: sz * (kind >= 6 ? 0.9 : 1), r: rot, L: Lc + (R() - 0.5) * 0.18, z: R(), n: R(), soft: 0, lay: 1, nx: nd.x, ny: nd.y, depth: nd.depth };
          if (near) { op.soft = 1; op.lay = 2; }                                   // ближний расфокус — спереди
          else if (zz < 0.32 && R() < 0.7) { op.soft = 1; op.lay = 0; }            // дальний расфокус — сзади
          else if (R() < 0.1) op.soft = 1;                                          // слегка мягкие среди резких
          ops.push(op);
          var ci = Math.floor(fx / cell) + 1 + (Math.floor(fy / cell) + 1) * gw;
          if (ci >= 0 && ci < g.length) g[ci] += op.s / 30;
        }
      }
      /* самозатенение: чем больше цветов между цветком и источником света, тем темнее */
      for (i = 0; i < ops.length; i++) {
        var o = ops[i], occ = 0, dd;
        for (dd = 1; dd <= 3; dd++) {
          var cxx = Math.floor((o.x + LX * cell * dd) / cell) + 1, cyy = Math.floor((o.y + LY * cell * dd) / cell) + 1;
          if (cxx >= 0 && cxx < gw && cyy >= 0 && cyy < gh) occ += g[cxx + cyy * gw] * (dd === 1 ? 1 : dd === 2 ? 0.7 : 0.45);
        }
        o.L = clamp(o.L * (1 - clamp(occ * 0.21, 0, 0.8)) + (o.n - 0.5) * 0.1, 0, 1);
        o.z = o.z * 0.45 + o.L * 0.55;
      }
      ops.sort(function (a, b) { return a.lay - b.lay || a.z - b.z; });
      token.stats.clusters = nCl; token.stats.flowers = ops.length;
    }

    /* ---------- рисование ---------- */
    function levelOf(L, n) {
      return clamp(Math.round(L * 3.3 + (n - 0.5) * 0.9), 0, 4);
    }
    function drawOps(list, from, to, c, sets) {
      var i, o, spr, l, set;
      for (i = from; i < to; i++) {
        o = list[i];
        l = levelOf(o.L, o.n);
        if (o.soft && l > (o.lay === 2 ? 2 : 3)) l = o.lay === 2 ? 2 : 3;
        set = o.soft === 2 ? sets.s2 : o.soft === 1 ? sets.s1 : sets.f;
        spr = set[o.k][l] || sets.f[o.k][l];
        put(c, dpr, spr, o.x, o.y, o.s, o.r, 0.62 + 0.38 * o.L);
      }
      reset();
    }
    /* черешки соцветий */
    function drawPedicels(c) {
      var i, o;
      c.lineCap = 'round';
      for (i = 0; i < ops.length; i++) {
        o = ops[i];
        c.strokeStyle = rgba(mixc([70, 36, 46], [168, 112, 124], o.L), 0.5 + 0.3 * o.L);
        c.lineWidth = Math.max(0.55, (o.k >= 6 ? 1.0 : 0.8) * Math.max(U, 0.75));
        var mx = (o.nx + o.x) / 2, my = (o.ny + o.y) / 2 + Math.hypot(o.x - o.nx, o.y - o.ny) * 0.1;
        c.beginPath(); c.moveTo(o.nx, o.ny); c.quadraticCurveTo(mx, my, o.x, o.y); c.stroke();
      }
    }
    /* ветка: лента с сужением, тёмная кора, светлая кромка со стороны света, чечевички */
    function drawBranch(c, br, rr) {
      var p = br.pts, n = p.length, i, a, b, nxv, nyv, w;
      if (n < 2) return;
      var L = [], Rr = [];
      for (i = 0; i < n; i++) {
        var nx = -Math.sin(p[i].a), ny = Math.cos(p[i].a);
        L.push([p[i].x + nx * p[i].w / 2, p[i].y + ny * p[i].w / 2]);
        Rr.push([p[i].x - nx * p[i].w / 2, p[i].y - ny * p[i].w / 2]);
      }
      var dpt = br.depth, base = dpt === 0 ? [30, 18, 25] : dpt === 1 ? [40, 21, 29] : dpt === 2 ? [52, 25, 35] : [66, 30, 40];
      c.beginPath();
      c.moveTo(L[0][0], L[0][1]);
      for (i = 1; i < n; i++) c.lineTo(L[i][0], L[i][1]);
      for (i = n - 1; i >= 0; i--) c.lineTo(Rr[i][0], Rr[i][1]);
      c.closePath();
      c.fillStyle = rgba(base, 0.97); c.fill();
      /* тень на стороне от света и светлая кромка со стороны света */
      c.lineCap = 'round';
      for (i = 0; i < n - 1; i++) {
        a = p[i]; b = p[i + 1]; w = (a.w + b.w) / 2;
        nxv = -Math.sin(a.a); nyv = Math.cos(a.a);
        var dl = nxv * LX + nyv * LY, sgn = dl >= 0 ? 1 : -1, k = Math.abs(dl);
        if (w > 1.2) {
          c.strokeStyle = 'rgba(10,4,8,' + (0.4 * k).toFixed(3) + ')'; c.lineWidth = w * 0.36;
          c.beginPath(); c.moveTo(a.x - nxv * sgn * w * 0.28, a.y - nyv * sgn * w * 0.28); c.lineTo(b.x - nxv * sgn * w * 0.28, b.y - nyv * sgn * w * 0.28); c.stroke();
        }
        if (w > 2) {
          c.strokeStyle = rgba(dpt >= 2 ? [186, 112, 134] : [150, 98, 122], (dpt >= 2 ? 0.42 : 0.4) * Math.pow(k, 0.9) * Math.min(1, (w - 2) / 3));
          c.lineWidth = Math.max(0.6, w * 0.13);
          c.beginPath(); c.moveTo(a.x + nxv * sgn * (a.w / 2 - 0.2), a.y + nyv * sgn * (a.w / 2 - 0.2)); c.lineTo(b.x + nxv * sgn * (b.w / 2 - 0.2), b.y + nyv * sgn * (b.w / 2 - 0.2)); c.stroke();
        }
      }
      /* кора: чечевички (светлые чёрточки поперёк) и крапины */
      if (p[0].w > 3.2 * U) {
        for (i = 0; i < n - 1; i++) {
          a = p[i];
          if (rr() < 0.42) {
            var off = (rr() - 0.5) * a.w * 0.8, len = a.w * (0.14 + rr() * 0.22);
            var cx = a.x + (-Math.sin(a.a)) * off, cy = a.y + Math.cos(a.a) * off;
            c.strokeStyle = 'rgba(176,120,138,' + (0.14 + rr() * 0.16).toFixed(3) + ')'; c.lineWidth = 0.9;
            c.beginPath(); c.moveTo(cx - Math.cos(a.a) * len, cy - Math.sin(a.a) * len); c.lineTo(cx + Math.cos(a.a) * len, cy + Math.sin(a.a) * len); c.stroke();
          }
          if (rr() < 0.5) {
            c.fillStyle = rr() < 0.5 ? 'rgba(8,3,6,.22)' : 'rgba(120,70,90,.14)';
            c.fillRect(a.x + (rr() - 0.5) * a.w * 0.8, a.y + (rr() - 0.5) * a.w * 0.8, 1.3, 1.3);
          }
        }
      }
    }

    /* ---------- дымка и лучи ---------- */
    function drawHaze(c) {
      var rad = Math.min(W, H * 1.4) * 0.9;
      var g = c.createRadialGradient(W * 1.0, 0, 0, W * 1.0, 0, rad);
      g.addColorStop(0, 'rgba(255,190,214,.07)'); g.addColorStop(0.35, 'rgba(226,120,164,.03)'); g.addColorStop(1, 'rgba(160,50,100,0)');
      c.fillStyle = g; c.fillRect(0, 0, W, H);
    }
    function drawRays(c) {
      var defs = [[2.62, 70, 0.045], [2.38, 120, 0.04], [2.1, 56, 0.05], [2.8, 90, 0.035], [1.9, 140, 0.03]], i, j, d, len = Math.hypot(W, H) * 1.05;
      c.save(); c.globalCompositeOperation = 'lighter';
      for (i = 0; i < defs.length; i++) {
        d = defs[i];
        for (j = 0; j < 3; j++) {
          c.save(); c.translate(W * 1.04, -H * 0.06); c.rotate(d[0]);
          var wd = d[1] * U * (0.5 + j * 0.5), g = c.createLinearGradient(0, 0, len, 0);
          g.addColorStop(0, 'rgba(255,208,230,' + (d[2] / 3).toFixed(4) + ')'); g.addColorStop(0.55, 'rgba(255,190,220,' + (d[2] / 6).toFixed(4) + ')'); g.addColorStop(1, 'rgba(255,190,220,0)');
          c.fillStyle = g; c.beginPath(); c.moveTo(0, -wd * 0.15); c.lineTo(len, -wd * 1.4); c.lineTo(len, wd * 1.4); c.lineTo(0, wd * 0.15); c.closePath(); c.fill();
          c.restore();
        }
      }
      c.restore();
    }

    /* ---------- свечение: размытые самые светлые зоны добавляются поверх ---------- */
    var bl = null;
    function bloomPrep() {
      var f = lite ? 8 : 4, w = Math.ceil(PW / f), h = Math.ceil(PH / f), a = mk(w, h), ac = a.getContext('2d');
      ac.imageSmoothingQuality = 'high';
      ac.drawImage(work, 0, 0, w, h);
      ac.globalCompositeOperation = 'multiply'; ac.drawImage(a, 0, 0);      // возведение в квадрат: остаются самые светлые
      bl = { a: a, w: w, h: h };
    }
    function bloomAdd(src, w, h, blur, alpha) {
      var b = mk(w, h);
      blurInto(b.getContext('2d'), src, blur, 0, 0, w, h);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = alpha;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(b, 0, 0, PW, PH);
      reset();
      b.width = b.height = 0;
    }
    var bk = small ? 0.6 : 1;
    function bloom1() { bloomAdd(bl.a, bl.w, bl.h, lite ? 3 : 4, (lite ? 0.2 : 0.28) * bk); }
    function bloom2() {
      if (lite) { bl.a.width = bl.a.height = 0; bl = null; return; }
      var w = Math.ceil(bl.w * 0.4), h = Math.ceil(bl.h * 0.4), s2 = mk(w, h), sc = s2.getContext('2d');
      sc.imageSmoothingQuality = 'high'; sc.drawImage(bl.a, 0, 0, w, h);
      bloomAdd(s2, w, h, 7, 0.2 * bk);
      s2.width = s2.height = 0; bl.a.width = bl.a.height = 0; bl = null;
    }
    /* виньетка: ветка растворяется в темноте; поля слева — тёмные (под текстом) */
    function applyMask() {
      var mw = Math.ceil(W / 8), mh = Math.ceil(H / 8), m = mk(mw, mh), mc = m.getContext('2d');
      var id = mc.createImageData(mw, mh), x, y, v, o = 0;
      for (y = 0; y < mh; y++) for (x = 0; x < mw; x++) {
        v = clamp(M((x + 0.5) * 8, (y + 0.5) * 8) * 1.35 + 0.0, 0, 1);
        id.data[o++] = 0; id.data[o++] = 0; id.data[o++] = 0; id.data[o++] = Math.round(smooth(0, 1, v) * 255);
      }
      mc.putImageData(id, 0, 0);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalCompositeOperation = 'destination-in';
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(m, 0, 0, PW, PH);
      reset();
    }

    /* ---------- задания ---------- */
    var jobs = [], ji = 0, farLayer = null;
    function insert(list) { jobs.splice.apply(jobs, [ji, 0].concat(list)); }
    function chunk(len, size, fn) {
      var list = [], s;
      for (s = 0; s < len; s += size) (function (a) { list.push(function () { fn(a, Math.min(len, a + size)); }); })(s);
      return list;
    }

    jobs.push(function () { sp = newSprites(); });
    (function () { for (var k = 0; k < 8; k++) (function (kk) { jobs.push(function () { addKind(sp, S, seed, kk); }); })(k); })();
    (function () { for (var k = 0; k < 8; k++) (function (kk) { jobs.push(function () { addSoft(sp, S, kk); }); })(k); })();
    jobs.push(function () { tree = genTree(); });
    jobs.push(function () { genFlowers(); });
    /* дальний план: мелкие тёмные цветы и тонкие ветки, размытые */
    jobs.push(function () {
      var sc = 0.5, lw = Math.round(PW * sc), lh = Math.round(PH * sc);
      farLayer = mk(lw, lh);
      var c = farLayer.getContext('2d'), R = rng(seed * 53 + 9), i, o, n = lite ? 70 : small ? 150 : 260, tries = 0;
      c.imageSmoothingQuality = 'high';
      var d = dpr * sc;
      /* дальние ветки */
      c.setTransform(d, 0, 0, d, 0, 0); c.lineCap = 'round';
      tree.branches.forEach(function (b) {
        if (b.depth < 1 || !b.used || R() < 0.5) return;
        var p = b.pts, k;
        c.strokeStyle = 'rgba(40,20,30,.5)';
        for (k = 0; k < p.length - 1; k++) { c.lineWidth = Math.max(0.8, p[k].w * 0.9); c.beginPath(); c.moveTo(p[k].x + 14, p[k].y - 10); c.lineTo(p[k + 1].x + 14, p[k + 1].y - 10); c.stroke(); }
      });
      /* «тело» гроздьев: мягкие светящиеся пятна под цветами — склеивают кластеры в облака */
      var mc2 = c;
      for (i = 0; i < ops.length; i += 3) {
        o = ops[i];
        var Lm = clamp(o.L, 0, 1), rad = (22 + R() * 26) * U * (o.s / 30) * 1.6;
        var gm = mc2.createRadialGradient(o.x, o.y, 0, o.x, o.y, rad);
        gm.addColorStop(0, rgba(mixc([120, 44, 82], [236, 150, 186], Lm), 0.12 + 0.14 * Lm)); gm.addColorStop(1, rgba([120, 44, 82], 0));
        mc2.fillStyle = gm; mc2.beginPath(); mc2.arc(o.x, o.y, rad, 0, TAU); mc2.fill();
      }
      var arr = [];
      while (arr.length < n && tries < n * 6) {
        tries++;
        var src = ops[(R() * ops.length) | 0], x = src.x + (R() - 0.5) * 120 * U, y = src.y + (R() - 0.5) * 120 * U;
        if (M(x, y) < 0.05) continue;
        var L = clamp(lightAt(x, y) * 0.6 + (R() - 0.5) * 0.3, 0, 0.7);
        arr.push({ k: R() < 0.1 ? 6 : (R() * 4) | 0, x: x, y: y, s: (10 + R() * 12) * FS, r: R() * TAU, L: L, n: R(), z: R() * 0.5 + L * 0.5 });
      }
      arr.sort(function (a, b) { return a.z - b.z; });
      for (i = 0; i < arr.length; i++) {
        o = arr[i];
        put(c, d, sp.f[o.k][levelOf(o.L, o.n)], o.x, o.y, o.s, o.r, 0.4 + 0.35 * o.L);
      }
      c.setTransform(1, 0, 0, 1, 0, 0); c.globalAlpha = 1;
    });
    jobs.push(function () {
      drawHaze(ctx);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      blurInto(ctx, farLayer, 1.8 * dpr, 0, 0, PW, PH);
      farLayer.width = farLayer.height = 0; farLayer = null;
      reset();
    });
    /* ветви (задний план), черешки */
    jobs.push(function () {
      var rr = rng(seed * 17 + 3), list = tree.branches.filter(function (b) { return !b.front && b.used; });
      list.sort(function (a, b) { return a.depth - b.depth; });
      list.forEach(function (b) { drawBranch(ctx, b, rr); });
      drawPedicels(ctx);
    });
    /* средний план: цветы кусками */
    jobs.push(function () {
      insert(chunk(ops.length, lite ? 80 : 130, function (a, b) { drawOps(ops, a, b, ctx, sp); }));
    });
    /* передние ветви поверх цветов */
    jobs.push(function () {
      var rr = rng(seed * 19 + 5);
      tree.branches.forEach(function (b) { if (b.front && b.used) drawBranch(ctx, b, rr); });
    });
    /* передний план: боке — крупные размытые цветы и световые круги */
    jobs.push(function () {
      var R = rng(seed * 71 + 13), i, n = lite ? 3 : small ? 5 : 11, tries = 0, c = ctx;
      c.globalCompositeOperation = 'lighter';
      while (bokeh.length < n && tries < 200) {
        tries++;
        var x = lerp(0.45, 1.05, R()) * W, y = lerp(-0.04, 0.85, Math.pow(R(), 1.2)) * H;
        if (M(x, y) < 0.18) continue;
        bokeh.push({ x: x, y: y, s: (small ? 46 : 100) + R() * (small ? 50 : 150), r: R() * TAU, k: [0, 1, 2, 5][(R() * 4) | 0], l: 2 + ((R() * 2) | 0), a: (0.12 + R() * 0.12) * (small ? 0.7 : 1) });
      }
      for (i = 0; i < bokeh.length; i++) {
        var o = bokeh[i], spr = sp.s2[o.k][o.l];
        put(c, dpr, spr, o.x, o.y, o.s, o.r, o.a * M(o.x, o.y));
      }
      reset();
      /* линзовые круги с лёгким кольцевым краем */
      var nd = lite ? 6 : small ? 12 : 26;
      c.globalCompositeOperation = 'lighter';
      for (i = 0; i < nd; i++) {
        var bx = lerp(0.3, 1.02, R()) * W, by = Math.pow(R(), 1.3) * H * 0.95, br = (4 + R() * R() * 34) * Math.max(U, 0.7);
        var mm = M(bx, by);
        if (mm < 0.12) continue;
        var a = (0.03 + R() * 0.07) * mm, g = c.createRadialGradient(bx, by, 0, bx, by, br);
        g.addColorStop(0, 'rgba(255,196,222,' + (a * 0.6).toFixed(3) + ')'); g.addColorStop(0.8, 'rgba(255,196,222,' + (a * 0.8).toFixed(3) + ')');
        g.addColorStop(0.94, 'rgba(255,222,236,' + (a * 1.5).toFixed(3) + ')'); g.addColorStop(1, 'rgba(255,196,222,0)');
        c.fillStyle = g; c.beginPath(); c.arc(bx, by, br, 0, TAU); c.fill();
      }
      c.globalCompositeOperation = 'source-over';
    });
    /* россыпь мелких лепестков вокруг кроны: даёт «мерцание» и фактуру, как на плёнке */
    jobs.push(function () {
      var R = rng(seed * 83 + 21), n = lite ? 30 : small ? 60 : 140, i, set = [], v, spr, tries = 0, cnt = 0;
      for (v = 0; v < 4; v++) set.push(petalSprite(lite ? 32 : 48, [3, 4, 2, 3][v], v + 5, 0));
      while (cnt < n && tries < n * 8) {
        tries++;
        var src = ops[(R() * ops.length) | 0], x = src.x + (R() - 0.5) * 220 * U, y = src.y + (R() - 0.3) * 240 * U, m = M(x, y);
        if (m < 0.1 || R() > m + 0.2) continue;
        cnt++;
        spr = set[(R() * 4) | 0];
        var sz = (5 + R() * R() * 12) * FS, rot = R() * TAU, sx = 0.3 + R() * 0.7, k = sz / spr.fd * dpr, co = Math.cos(rot), si = Math.sin(rot);
        ctx.globalAlpha = 0.35 + R() * 0.5 * (0.4 + 0.6 * lightAt(x, y));
        ctx.setTransform(co * sx * k, si * sx * k, -si * k, co * k, x * dpr, y * dpr);
        ctx.drawImage(spr.c, -spr.cx, -spr.cy);
      }
      reset();
    });
    jobs.push(function () {                       // спрайты больше не нужны: сразу освобождаем память
      ['f', 's1', 's2'].forEach(function (g) { sp[g].forEach(function (row) { row.forEach(function (x) { if (x) x.c.width = x.c.height = 0; }); }); });
      sp = null;
    });
    jobs.push(function () { if (!lite) drawRays(ctx); });
    jobs.push(bloomPrep);
    jobs.push(bloom1);
    jobs.push(bloom2);
    jobs.push(function () { applyMask(); });
    /* показать готовое */
    jobs.push(function () {
      if (!direct) {
        canvas.width = PW; canvas.height = PH;
        canvas.getContext('2d').drawImage(work, 0, 0);
        work.width = work.height = 0;
      }
      if (done) done(token);
    });

    function pump() {
      if (token.cancel) { if (!direct) work.width = work.height = 0; return; }
      var t = now(), s;
      do {
        s = now();
        jobs[ji++]();
        s = now() - s;
        token.stats.work += s; if (s > token.stats.maxSlice) token.stats.maxSlice = s;
        token.stats.jobs.push(Math.round(s));
      } while (ji < jobs.length && now() - t < 10);
      if (ji < jobs.length) {
        if (win.requestAnimationFrame && !doc.hidden) win.requestAnimationFrame(pump); else setTimeout(pump, 16);
      } else token.stats.wall = now() - t0;
    }
    token.start = pump;
    return token;
  }

  /* ==========================================================================
     Падающие лепестки
     ========================================================================== */
  function petalSprite(h, lvl, variant, side) {
    var pal = PAL[lvl], r = rng(variant * 977 + 13), sh = petalShape(r, 0.5, 0.4), pad = Math.ceil(h * 0.14);
    var W = Math.round(h * 0.86) + pad * 2, H = Math.round(h * 1.04) + pad * 2;
    var cv = mk(W, H), c = cv.getContext('2d'), i, p = [], px = Math.max(0.5, h / 90);
    var bx = W / 2, by = H - pad - h * 0.02;
    for (i = 0; i < sh.length; i++) p.push([bx + sh[i][1] * h * 0.92, by - sh[i][0] * h * 0.92]);
    var base = side === 1 ? mixc(pal.base, pal.eye, 0.3) : mixc(pal.base, [238, 120, 168], 0.35);
    var mid = side === 1 ? mixc(pal.mid, pal.base, 0.5) : mixc(pal.mid, [248, 176, 204], 0.25);
    var tip = side === 1 ? mixc(pal.tip, pal.mid, 0.45) : pal.tip;
    var g = c.createLinearGradient(bx, by, bx, by - h * 0.92);
    g.addColorStop(0, rgba(base, 0.97)); g.addColorStop(0.5, rgba(mid, 0.94)); g.addColorStop(1, rgba(tip, 0.86));
    /* лёгкое свечение вокруг: просвечивающий лепесток в контровом свете */
    c.save();
    c.shadowColor = side === 1 ? 'rgba(255,170,205,.22)' : 'rgba(255,196,222,.5)'; c.shadowBlur = h * 0.1;
    smoothPath(c, p, 0, 0); c.fillStyle = g; c.fill();
    c.restore();
    c.save(); c.clip();
    c.lineWidth = 0.6 * px; c.lineCap = 'round';
    for (i = -2; i <= 2; i++) {
      c.strokeStyle = rgba(pal.vein, side === 1 ? 0.14 : (i === 0 ? 0.34 : 0.22));
      c.beginPath(); c.moveTo(bx, by - h * 0.06);
      c.quadraticCurveTo(bx + i * h * 0.04, by - h * 0.5, bx + i * h * 0.1, by - h * (0.72 + (i === 0 ? 0.08 : 0)));
      c.stroke();
    }
    /* изгиб: одна сторона светлее, другая глубже */
    var gs = c.createLinearGradient(bx - h * 0.35, 0, bx + h * 0.35, 0);
    gs.addColorStop(0, 'rgba(255,255,255,' + (side === 1 ? 0.04 : 0.14) + ')'); gs.addColorStop(1, rgba(pal.base, 0.3));
    c.fillStyle = gs; c.fillRect(0, 0, W, H);
    smoothPath(c, p, 0, 0); c.lineJoin = 'round';
    c.strokeStyle = rgba(pal.rim, side === 1 ? 0.2 : 0.42); c.lineWidth = h * 0.12; c.stroke();
    c.restore();
    if (side === 2) {                                          // ребром к зрителю: ярче
      c.globalCompositeOperation = 'source-atop'; c.fillStyle = 'rgba(255,240,246,.4)'; c.fillRect(0, 0, W, H);
    }
    return { c: cv, fd: h, cx: bx, cy: by - h * 0.46 };
  }

  function createPetals(back, front, opts) {
    opts = opts || {};
    var ctxB = back.getContext('2d'), ctxF = front.getContext('2d');
    var W = 0, H = 0, dpr = 1, lite = !!opts.lite, small = !!opts.small;
    /* на телефоне и слабых устройствах второй полноэкранный слой не нужен: крупные лепестки рисуем в заднем */
    var oneLayer = small || lite;
    if (oneLayer) front.style.display = 'none';
    var ctxFront = oneLayer ? ctxB : ctxF;

    var HS = lite ? 56 : 80, VARS = [[3, 0], [4, 1], [4, 2], [3, 3]], sets = [[], [], []], dof, v, sd, spr;
    for (dof = 0; dof < 3; dof++) for (v = 0; v < VARS.length; v++) {
      sets[dof][v] = [];
      for (sd = 0; sd < 3; sd++) {
        spr = petalSprite(HS, VARS[v][0], VARS[v][1] + 5, sd);
        sets[dof][v][sd] = dof ? soften(spr, HS * (dof === 1 ? 0.035 : 0.08)) : spr;
      }
    }

    var nBack = lite ? 16 : small ? 26 : 60;
    var nFront = lite ? 1 : small ? 2 : 4;
    var P = [], i;

    var ptr = { x: -9999, y: -9999, vx: 0, vy: 0, on: false };
    var gust = 0, lastY = win.pageYOffset || 0, lastT = 0, t0 = 0, raf = 0, running = false, tabOn = !doc.hidden;

    function rand(a, b) { return a + Math.random() * (b - a); }

    function spawn(p, initial) {
      var fr = p.front;
      var d = fr ? rand(0.85, 1) : Math.pow(Math.random(), 0.9) * 0.82;
      p.d = d;
      p.size = fr ? rand(56, 96) : (d < 0.3 ? rand(5, 10) : d < 0.62 ? rand(10, 20) : rand(20, 36));     // длина лепестка, px
      p.vy0 = fr ? rand(54, 92) : lerp(12, 44, d);
      p.sway = lerp(8, 30, d) * rand(0.7, 1.3);
      p.f1 = rand(0, TAU); p.f1v = rand(0.9, 2.4) * (Math.random() < 0.5 ? -1 : 1) * (fr ? 0.6 : 1);
      p.f2 = rand(0, TAU); p.f2v = rand(0.5, 1.3);
      p.rot = rand(0, TAU); p.spin = rand(-0.9, 0.9) * (fr ? 0.5 : 1);
      p.alpha = fr ? rand(0.5, 0.8) : lerp(0.6, 1, d);
      p.v = (Math.random() * VARS.length) | 0;
      p.dof = fr ? 2 : (d < 0.2 ? 1 : 0);
      p.vx = 0; p.vy = p.vy0;
      p.x = initial ? rand(0, W) : (W * (1.12 - 0.85 * Math.pow(Math.random(), 1.4)) + rand(0, 60));
      p.y = initial ? rand(-H * 0.1, H) : -rand(30, 240) - p.size;
    }
    for (i = 0; i < nBack + nFront; i++) P.push({ front: i >= nBack });

    function resize() {
      dpr = Math.min(win.devicePixelRatio || 1, lite ? 1 : small ? 1.25 : 1.75);
      W = win.innerWidth; H = win.innerHeight;
      while (W * H * dpr * dpr > 2.6e6 && dpr > 1) dpr -= 0.25;
      if (dpr < 1) dpr = 1;
      (oneLayer ? [back] : [back, front]).forEach(function (c) { c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); });
    }

    /* кувырок в 3D: поворот вокруг длинной оси (ширина = cos), качка вокруг поперечной (длина) */
    function drawOne(c, p) {
      var cs = Math.cos(p.f1), thick = Math.abs(cs), sy = Math.cos(0.75 * Math.sin(p.f2));
      var side = cs >= 0 ? 0 : 1;
      if (thick < 0.26) side = 2;
      var s = sets[p.dof][p.v][side];
      var k = p.size / s.fd * dpr, sx = Math.max(0.09, thick);
      var co = Math.cos(p.rot), si = Math.sin(p.rot), a = p.alpha;
      /* слева — текст: лепестки там слабее и прозрачнее */
      if (W >= 980) a *= p.front ? 0.15 + 0.85 * smooth(0.3, 0.8, p.x / W) : 0.4 + 0.6 * smooth(0.16, 0.6, p.x / W);
      else if (p.front) a *= 0.7;
      if (thick < 0.4) a *= 0.8 + 0.2 * thick / 0.4;
      /* быстрые: размытие движением — бледная копия сзади по ходу */
      var spd = Math.hypot(p.vx, p.vy), thr = p.front ? 120 : 80;
      if (spd > thr) {
        var gk = Math.min(0.06, (spd - thr) / 3000 + 0.02), ga = a * 0.38;
        c.globalAlpha = ga;
        c.setTransform(co * sx * k, si * sx * k, -si * sy * k, co * sy * k, (p.x - p.vx * gk) * dpr, (p.y - p.vy * gk) * dpr);
        c.drawImage(s.c, -s.cx, -s.cy);
      }
      c.globalAlpha = a;
      c.setTransform(co * sx * k, si * sx * k, -si * sy * k, co * sy * k, p.x * dpr, p.y * dpr);
      c.drawImage(s.c, -s.cx, -s.cy);
    }

    function draw() {
      ctxB.setTransform(1, 0, 0, 1, 0, 0); ctxB.clearRect(0, 0, back.width, back.height);
      if (!oneLayer) { ctxF.setTransform(1, 0, 0, 1, 0, 0); ctxF.clearRect(0, 0, front.width, front.height); }
      for (var n = 0; n < P.length; n++) drawOne(P[n].front ? ctxFront : ctxB, P[n]);
      ctxB.globalAlpha = ctxF.globalAlpha = 1;
    }

    function step(ts) {
      raf = 0;
      var dt = lastT ? Math.min((ts - lastT) / 1000, 0.05) : 0.016;
      lastT = ts;
      t0 += dt;

      /* порыв от прокрутки затухает */
      gust *= Math.exp(-dt * 2.2);
      var wind = -(26 + 14 * Math.sin(t0 * 0.21));
      var rate = 1 - Math.exp(-dt * 1.7);

      for (var n = 0; n < P.length; n++) {
        var p = P[n], df = lerp(0.35, 1, p.d);
        p.f1 += p.f1v * dt; p.f2 += p.f2v * dt; p.rot += p.spin * dt;
        /* лепесток ребром падает быстрее, плашмя — парит и скользит вбок */
        var area = Math.abs(Math.cos(p.f1)) * 0.6 + 0.4;
        var tvy = p.vy0 * lerp(1.3, 0.72, area) + gust * (0.3 + p.d) * 0.7;
        var tvx = (wind + 10 * Math.sin(t0 * 0.7 + p.y * 0.004) + 6 * Math.sin(t0 * 1.7 + p.x * 0.006)) * df
          + Math.sin(p.f1) * p.sway * 0.7 - gust * 0.2;
        p.vx += (tvx - p.vx) * rate;
        p.vy += (tvy - p.vy) * rate;

        /* курсор отталкивает лепестки: импульс в скорость, дальше сопротивление воздуха возвращает ход */
        if (ptr.on) {
          var dx = p.x - ptr.x, dy = p.y - ptr.y, d2 = dx * dx + dy * dy, R2 = 150 * 150;
          if (d2 < R2 && d2 > 1) {
            var d = Math.sqrt(d2), f = (1 - d / 150);
            p.vx += dx / d * f * f * 620 * dt + ptr.vx * f * 0.5;
            p.vy += dy / d * f * f * 620 * dt + ptr.vy * f * 0.5;
            p.spin += (dx > 0 ? 1 : -1) * f * 3 * dt;
          }
        }
        p.spin *= Math.exp(-dt * 0.5);
        p.x += p.vx * dt; p.y += p.vy * dt;
        if (p.y > H + 90 || p.x < -140) spawn(p, false);
      }
      ptr.vx *= 0.85; ptr.vy *= 0.85;
      draw();
      if (running && tabOn) raf = requestAnimationFrame(step);
    }

    function kick() { if (!raf && running && tabOn) { lastT = 0; raf = requestAnimationFrame(step); } }

    function onScroll() {
      var y = win.pageYOffset || 0, now2 = performance.now();
      var dtS = Math.max(16, now2 - (onScroll.t || now2 - 16)) / 1000;
      gust = clamp(gust + clamp((y - lastY) / dtS, -2400, 2400) * 0.05, -140, 220);
      lastY = y; onScroll.t = now2;
    }

    resize();
    for (i = 0; i < P.length; i++) spawn(P[i], true);

    return {
      start: function () {
        if (opts.reduce) { draw(); win.addEventListener('resize', function () { resize(); for (var k = 0; k < P.length; k++) spawn(P[k], true); draw(); }); return; }
        running = true; kick();
        win.addEventListener('resize', function () { resize(); });
        win.addEventListener('scroll', onScroll, { passive: true });
        doc.addEventListener('visibilitychange', function () { tabOn = !doc.hidden; kick(); });
        win.addEventListener('pointermove', function (e) {
          if (e.pointerType === 'touch') return;
          ptr.vx = e.clientX - (ptr.x === -9999 ? e.clientX : ptr.x);
          ptr.vy = e.clientY - (ptr.y === -9999 ? e.clientY : ptr.y);
          ptr.x = e.clientX; ptr.y = e.clientY; ptr.on = true;
        }, { passive: true });
        doc.addEventListener('pointerleave', function () { ptr.on = false; ptr.x = ptr.y = -9999; });
      }
    };
  }

  FX.sky = {
    stats: null,
    init: function (o) {
      o = o || {};
      var small = win.innerWidth < 760;
      var back = doc.getElementById('skyBack'), front = doc.getElementById('skyFront');
      if (back && front && back.getContext) {
        var petals = createPetals(back, front, { lite: o.lite, reduce: o.reduce, small: small });
        petals.start();
      }
      var cv = doc.querySelector('#canopy canvas'), wrap = doc.getElementById('canopy');
      if (cv && wrap && cv.getContext) {
        var cur = null, built = null;
        /* ветку строим после первой отрисовки кусками; готовая проявляется классом "on" */
        var build = function () {
          if (cur) cur.cancel = true;
          var tk = buildCanopy(cv, { lite: o.lite, seed: 11, narrow: win.innerWidth < 980, direct: !wrap.classList.contains('on') }, function (t) {
            built = t.dims; FX.sky.stats = t.stats; wrap.classList.add('on');
          });
          cur = tk; tk.start();
        };
        if (win.requestIdleCallback) win.requestIdleCallback(build, { timeout: 600 }); else setTimeout(build, 60);
        var rt = 0;
        win.addEventListener('resize', function () {
          clearTimeout(rt);
          rt = setTimeout(function () {
            var rw = cv.offsetWidth, rh = cv.offsetHeight;
            if (built && built.narrow === (win.innerWidth < 980) && Math.abs(rw - built.w) < built.w * 0.04 && Math.abs(rh - built.h) < built.h * 0.08) return;
            build();
          }, 300);
        });
      }
    }
  };
})();
