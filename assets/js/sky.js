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
     Очередь заданий: кусками по ~10 мс на кадр, чтобы не блокировать главный поток
     ========================================================================== */
  function makeQueue(stats) {
    var q = { jobs: [], i: 0, cancel: false };
    q.add = function (f) { q.jobs.push(f); };
    q.insert = function (list) { q.jobs.splice.apply(q.jobs, [q.i, 0].concat(list)); };
    q.chunk = function (len, size, fn) {
      var list = [], s;
      for (s = 0; s < len; s += size) (function (a) { list.push(function () { fn(a, Math.min(len, a + size)); }); })(s);
      return list;
    };
    q.run = function (onEnd) {
      function pump() {
        if (q.cancel) return;
        var t = now(), s;
        do {
          s = now();
          q.jobs[q.i++]();
          s = now() - s;
          if (stats) { stats.work += s; if (s > stats.maxSlice) stats.maxSlice = s; stats.jobs.push(Math.round(s)); }
        } while (q.i < q.jobs.length && now() - t < 10);
        if (q.i < q.jobs.length) {
          if (win.requestAnimationFrame && !doc.hidden) win.requestAnimationFrame(pump); else setTimeout(pump, 30);
        } else if (onEnd) onEnd();
      }
      pump();
    };
    return q;
  }

  /* ==========================================================================
     Сцена: три слоя глубины (дальний, средний, ближний), рисуются один раз.
     Цветение собрано в «пулы» у краёв экрана и в правом верхнем углу; центр спокойный (там текст).
     Слои выше экрана на величину «хода» параллакса: при прокрутке они плавно сдвигаются с разной скоростью.
     ========================================================================== */
  function buildScene(o, done) {
    var stats = { work: 0, wall: 0, maxSlice: 0, jobs: [] };
    var q = makeQueue(stats), t0 = now();
    var W = o.W, H = o.H, lite = !!o.lite, reduce = !!o.reduce, seed = o.seed || 11;
    var small = W < 600, narrow = W < 980;
    var U = clamp(W / 1180, 0.4, 1.15);                 // масштаб толщин/шагов
    var FS = small ? 0.8 : 1;                           // масштаб цветов
    var mx = small ? 16 : 26, my = 14;                  // поля слоя под качание и параллакс курсора
    var TM = reduce ? 0 : Math.round(H * 0.75), TF = reduce ? 0 : Math.round(H * 0.3), TN = reduce ? 0 : Math.round(H * 1.2);
    var SH = H + TM, cw = W + 2 * mx, hm = SH + 2 * my;
    var X0 = mx, X1 = mx + W, Y0 = my, Y1 = my + SH;    // левый/правый край экрана и верх/низ сцены в координатах слоя
    var dpr = Math.min(win.devicePixelRatio || 1, lite ? 1 : small ? 1.25 : 1.5), cap = small ? 4.0e6 : 4.4e6;
    while (cw * hm * dpr * dpr > cap && dpr > 1) dpr -= 0.25;
    if (dpr < 1) dpr = 1;
    var PW = Math.round(cw * dpr), PH = Math.round(hm * dpr);
    var S = lite ? 64 : small ? 96 : 128;

    var work = mk(PW, PH), ctx = work.getContext('2d');
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    var sp, tree, ops = [], bokeh = [], farC = null, nearC = null;
    function reset() { ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; }
    reset();

    /* ---------- пулы цветения ---------- */
    var pools = [];
    /* крона: правый верхний угол, как в первом экране */
    var bw = Math.min(W, 1180), bh = (small || narrow) ? Math.min(520, 0.62 * H) : Math.min(800, 1.05 * H), ox = X1 - bw;
    var Dref = small ? 470 : Math.max(bw, 900);
    pools.push({
      crown: true,
      m: function (x, y) {
        var nx = (x - ox) / bw, ny = (y - Y0) / bh, mm;
        if (small) {
          var rr = Math.sqrt(Math.pow(1 - nx, 2) + Math.pow(ny * 0.8, 2));
          mm = 1 - smooth(0.26, 0.98, rr);
          mm *= 1 - smooth(0.34, 0.82, ny) * 0.85;
          mm *= 1 - 0.5 * smooth(0.3, 0.46, ny) * (1 - smooth(0.74, 0.96, nx));      // заголовок: приглушаем
        } else if (narrow) {                  // планшет: одна колонка, заголовок на всю ширину
          var r3 = Math.sqrt(Math.pow((1 - nx) * 0.98, 2) + Math.pow(ny * 1.12, 2));
          mm = 1 - smooth(0.34, 1.0, r3);
          mm *= 1 - 0.78 * smooth(120, 190, y - Y0) * (1 - smooth(430, 520, y - Y0)) * (1 - smooth(0.78 * bw, 0.97 * bw, x - ox));
        } else {
          var r2 = Math.sqrt(Math.pow((1 - nx) * 0.98, 2) + Math.pow(ny * 1.12, 2));
          mm = 1 - smooth(0.34, 1.0, r2);
          var tl = lerp(0.04, 0.4, smooth(0.14, 0.42, ny));
          mm *= smooth(tl, tl + 0.26, nx);
        }
        return mm;
      },
      light: function (x, y) {
        var d = Math.hypot((X1 - x) * 0.95, (y - Y0) * 1.1) / Dref;
        return clamp((1.22 - d * 1.15) * (small ? 0.82 : 1), 0, 1);
      }
    });
    /* края: ветка заходит из-за левого/правого края или снизу; side -1 слева, +1 справа */
    function addEdge(side, fy, reach, ry, lit, rise) {
      var p = { side: side, cx: side < 0 ? X0 : X1, cy: Y0 + fy * SH, rx: reach * W, ry: ry * H, lit: lit, rise: rise, ns: seed + 9 + pools.length * 7 };
      p.r = function (x, y) { var a = (x - p.cx) / p.rx, b = (y - p.cy) / p.ry; return Math.sqrt(a * a + b * b); };
      p.m = function (x, y) {                              // неровный контур: пятна цветения, а не эллипс
        var n = vnoise(x / (120 * U), y / (120 * U), p.ns);
        return 1 - smooth(0.1, 1.0, p.r(x, y) * (0.8 + 0.4 * n));
      };
      p.light = function (x, y) { return p.lit * clamp(1.12 - p.r(x, y) * 1.05, 0, 1); };
      pools.push(p);
    }
    var EP = small
      ? (reduce ? [[-1, 0.62, 0.6, 0.24, 0.78, 0], [1, 0.86, 0.6, 0.24, 0.8, 0], [-1, 1.0, 0.5, 0.2, 0.7, 1]]
                : [[-1, 0.40, 0.62, 0.26, 0.80, 0], [1, 0.58, 0.62, 0.26, 0.82, 0], [-1, 0.76, 0.60, 0.26, 0.76, 0], [1, 0.94, 0.56, 0.24, 0.72, 1]])
      : (reduce ? [[-1, 0.50, 0.27, 0.36, 0.80, 0], [1, 0.80, 0.28, 0.34, 0.80, 0], [-1, 1.0, 0.30, 0.34, 0.72, 1]]
                : [[-1, 0.50, 0.27, 0.40, 0.80, 0], [1, 0.71, 0.30, 0.42, 0.82, 0], [-1, 0.94, 0.32, 0.45, 0.76, 1], [1, 1.0, 0.20, 0.30, 0.62, 1]]);
    EP.forEach(function (e) { addEdge(e[0], e[1], e[2], e[3], e[4], e[5]); });

    function M(x, y) { var v = 0, i, t; for (i = 0; i < pools.length; i++) { t = pools[i].m(x, y); if (t > v) v = t; } return v; }
    var LX = 0.62, LY = -0.78;                          // свет — сверху справа
    function lightAt(x, y) { var v = 0, i, t; for (i = 0; i < pools.length; i++) { t = pools[i].light(x, y); if (t > v) v = t; } return v; }
    /* случайная точка внутри пула: для боке и световых кругов */
    function samplePool(R) {
      var pi = R() < 0.4 ? 0 : 1 + ((R() * (pools.length - 1)) | 0), p = pools[pi], u, x, y;
      if (p.crown) return { x: ox + lerp(0.45, 1.05, R()) * bw, y: Y0 + lerp(-0.04, 0.85, Math.pow(R(), 1.2)) * bh };
      u = Math.pow(R(), 1.3);
      x = p.side < 0 ? X0 - 0.03 * W + u * p.rx * 0.95 : X1 + 0.03 * W - u * p.rx * 0.95;
      y = p.cy + (R() - 0.5) * 1.7 * p.ry;
      return { x: x, y: y };
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
      var i, j, lm, ang, p, nl, x0, y0, dev, len;
      for (i = 0; i < limbs.length; i++) {
        lm = limbs[i];
        ang = lm[2] + (R() - 0.5) * 0.1 - (small ? 0.22 : 0);
        grow(ox + lm[0] * bw, Y0 + lm[1] * bh, ang, lm[3] * bw, lm[4] * U * (small ? 1.25 : 1), 0, false, lm[5], null);
      }
      /* пулы у краёв: 2–3 ветви от края внутрь, слегка провисают */
      for (i = 1; i < pools.length; i++) {
        p = pools[i]; nl = small ? 2 : 3;
        for (j = 0; j < nl; j++) {
          if (p.rise) {                                  // растёт снизу вверх
            x0 = p.cx - p.side * (R() * 0.1 - 0.02) * W; y0 = Y1 + (0.02 + R() * 0.04) * H;
            dev = 0.6 + R() * 0.6; ang = p.side < 0 ? -dev : -Math.PI + dev;
          } else {
            x0 = p.cx + p.side * (0.04 + R() * 0.03) * W; y0 = p.cy + (R() - 0.5) * p.ry * 0.9;
            dev = (R() - 0.5) * 0.9 + 0.1; ang = p.side < 0 ? dev : Math.PI - dev;
          }
          len = p.rx * (small ? 1.0 : 1.05) * (0.9 + R() * 0.5) * (j === 0 ? 1.1 : 0.88);
          grow(x0, y0, ang, len, (12 + R() * 4) * U * (small ? 1.25 : 1), 0, false, 0.25 + R() * 0.6, null);
        }
      }
      /* передние ветви: часть крупных рисуется поверх цветов */
      branches.forEach(function (b) { if (b.depth >= 1 && b.depth <= 2 && b.z > 0.55 && R() < 0.3) b.front = true; });
      return { branches: branches, nodes: nodes };
    }

    /* соцветия: цветы по 2–5 на черешках от узла + бутоны */
    function genFlowers() {
      var R = rng(seed * 977 + 31), nodes = tree.nodes, maxN = lite ? 150 : small ? 260 : 1100;
      var g = [], cell = 18 * Math.max(U, 0.6), gw = Math.ceil(cw / cell) + 2, gh = Math.ceil(hm / cell) + 2, i, j, k, nd;
      for (i = 0; i < gw * gh; i++) g.push(0);
      var cand = [];
      for (i = 0; i < nodes.length; i++) {
        nd = nodes[i];
        var m = M(nd.x, nd.y);
        if (m < 0.04) continue;
        var nz = vnoise(nd.x / (150 * U), nd.y / (150 * U), seed);
        var pr = Math.pow(m, 0.7) * (0.1 + 1.7 * smooth(0.28, 0.68, nz));
        if (R() < pr + (nd.tip ? 0.12 : 0)) { nd.nz = nz; nd.m = m; cand.push(nd); }
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
        var baseS = (nd.depth === 2 ? 36 : nd.depth === 3 ? 29 : 23) * FS * lerp(0.58, 1.22, zz) * lerp(0.82, 1, smooth(0.1, 0.8, nd.m));
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
        var o2 = ops[i], occ = 0, dd;
        for (dd = 1; dd <= 3; dd++) {
          var cxx = Math.floor((o2.x + LX * cell * dd) / cell) + 1, cyy = Math.floor((o2.y + LY * cell * dd) / cell) + 1;
          if (cxx >= 0 && cxx < gw && cyy >= 0 && cyy < gh) occ += g[cxx + cyy * gw] * (dd === 1 ? 1 : dd === 2 ? 0.7 : 0.45);
        }
        o2.L = clamp(o2.L * (1 - clamp(occ * 0.21, 0, 0.8)) + (o2.n - 0.5) * 0.1, 0, 1);
        o2.z = o2.z * 0.45 + o2.L * 0.55;
      }
      ops.sort(function (a, b) { return a.lay - b.lay || a.z - b.z; });
      stats.clusters = nCl; stats.flowers = ops.length;
    }

    /* ---------- рисование ---------- */
    function levelOf(L, n) {
      return clamp(Math.round(L * 3.3 + (n - 0.5) * 0.9), 0, 4);
    }
    function drawOps(list, from, to, c, sets) {
      var i, o2, spr, l, set;
      for (i = from; i < to; i++) {
        o2 = list[i];
        l = levelOf(o2.L, o2.n);
        if (o2.soft && l > (o2.lay === 2 ? 2 : 3)) l = o2.lay === 2 ? 2 : 3;
        set = o2.soft === 2 ? sets.s2 : o2.soft === 1 ? sets.s1 : sets.f;
        spr = set[o2.k][l] || sets.f[o2.k][l];
        put(c, dpr, spr, o2.x, o2.y, o2.s, o2.r, 0.62 + 0.38 * o2.L);
      }
      reset();
    }
    /* черешки соцветий */
    function drawPedicels(c) {
      var i, o2;
      c.lineCap = 'round';
      for (i = 0; i < ops.length; i++) {
        o2 = ops[i];
        c.strokeStyle = rgba(mixc([70, 36, 46], [168, 112, 124], o2.L), 0.5 + 0.3 * o2.L);
        c.lineWidth = Math.max(0.55, (o2.k >= 6 ? 1.0 : 0.8) * Math.max(U, 0.75));
        var mx2 = (o2.nx + o2.x) / 2, my2 = (o2.ny + o2.y) / 2 + Math.hypot(o2.x - o2.nx, o2.y - o2.ny) * 0.1;
        c.beginPath(); c.moveTo(o2.nx, o2.ny); c.quadraticCurveTo(mx2, my2, o2.x, o2.y); c.stroke();
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
      var i, p, g, rad;
      for (i = 0; i < pools.length; i++) {
        p = pools[i];
        if (p.crown) {
          rad = Math.min(bw, bh * 1.4) * 0.9;
          g = c.createRadialGradient(X1, Y0, 0, X1, Y0, rad);
          g.addColorStop(0, 'rgba(255,190,214,.07)'); g.addColorStop(0.35, 'rgba(226,120,164,.03)'); g.addColorStop(1, 'rgba(160,50,100,0)');
          c.fillStyle = g; c.fillRect(X1 - rad, Y0 - rad, 2 * rad, 2 * rad);
        } else {
          rad = p.rx * 1.25;
          c.save(); c.translate(p.cx, p.cy); c.scale(1, p.ry / p.rx);
          g = c.createRadialGradient(0, 0, 0, 0, 0, rad);
          g.addColorStop(0, 'rgba(255,190,214,.05)'); g.addColorStop(0.4, 'rgba(226,120,164,.022)'); g.addColorStop(1, 'rgba(160,50,100,0)');
          c.fillStyle = g; c.fillRect(-rad, -rad, 2 * rad, 2 * rad);
          c.restore();
        }
      }
    }
    function drawRays(c) {
      var defs = [[2.62, 70, 0.045], [2.38, 120, 0.04], [2.1, 56, 0.05], [2.8, 90, 0.035], [1.9, 140, 0.03]], i, j, d, len = Math.hypot(bw, bh) * 1.05;
      c.save(); c.globalCompositeOperation = 'lighter';
      for (i = 0; i < defs.length; i++) {
        d = defs[i];
        for (j = 0; j < 3; j++) {
          c.save(); c.translate(ox + bw * 1.04, Y0 - bh * 0.06); c.rotate(d[0]);
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
    /* виньетка: ветка растворяется в темноте; центр (под текстом) пустой */
    function applyMask() {
      var mw = Math.ceil(cw / 8), mh = Math.ceil(hm / 8), m = mk(mw, mh), mc = m.getContext('2d');
      var id = mc.createImageData(mw, mh), x, y, v, o2 = 0;
      for (y = 0; y < mh; y++) for (x = 0; x < mw; x++) {
        v = clamp(M((x + 0.5) * 8, (y + 0.5) * 8) * 1.35, 0, 1);
        id.data[o2++] = 0; id.data[o2++] = 0; id.data[o2++] = 0; id.data[o2++] = Math.round(smooth(0, 1, v) * 255);
      }
      mc.putImageData(id, 0, 0);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalCompositeOperation = 'destination-in';
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(m, 0, 0, PW, PH);
      reset();
    }

    /* ---------- задания: общие спрайты и средний слой ---------- */
    q.add(function () { sp = newSprites(); });
    (function () { for (var k = 0; k < 8; k++) (function (kk) { q.add(function () { addKind(sp, S, seed, kk); }); })(k); })();
    (function () { for (var k = 0; k < 8; k++) (function (kk) { q.add(function () { addSoft(sp, S, kk); }); })(k); })();
    q.add(function () { tree = genTree(); });
    q.add(function () { genFlowers(); });
    /* дальний план внутри среднего слоя: мелкие тёмные цветы и тонкие ветки, размытые */
    var farLayer = null;
    q.add(function () {
      var sc = 0.5, lw = Math.round(PW * sc), lh = Math.round(PH * sc);
      farLayer = mk(lw, lh);
      var c = farLayer.getContext('2d'), R = rng(seed * 53 + 9), i, o2, n = lite ? 80 : small ? 170 : 360, tries = 0;
      c.imageSmoothingQuality = 'high';
      var d = dpr * sc;
      c.setTransform(d, 0, 0, d, 0, 0); c.lineCap = 'round';
      tree.branches.forEach(function (b) {
        if (b.depth < 1 || !b.used || R() < 0.5) return;
        var p = b.pts, k;
        c.strokeStyle = 'rgba(40,20,30,.5)';
        for (k = 0; k < p.length - 1; k++) { c.lineWidth = Math.max(0.8, p[k].w * 0.9); c.beginPath(); c.moveTo(p[k].x + 14, p[k].y - 10); c.lineTo(p[k + 1].x + 14, p[k + 1].y - 10); c.stroke(); }
      });
      /* «тело» гроздьев: мягкие светящиеся пятна под цветами — склеивают кластеры в облака */
      for (i = 0; i < ops.length; i += 3) {
        o2 = ops[i];
        var Lm = clamp(o2.L, 0, 1), rad = (22 + R() * 26) * U * (o2.s / 30) * 1.6;
        var gm = c.createRadialGradient(o2.x, o2.y, 0, o2.x, o2.y, rad);
        gm.addColorStop(0, rgba(mixc([120, 44, 82], [236, 150, 186], Lm), 0.12 + 0.14 * Lm)); gm.addColorStop(1, rgba([120, 44, 82], 0));
        c.fillStyle = gm; c.beginPath(); c.arc(o2.x, o2.y, rad, 0, TAU); c.fill();
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
        o2 = arr[i];
        put(c, d, sp.f[o2.k][levelOf(o2.L, o2.n)], o2.x, o2.y, o2.s, o2.r, 0.4 + 0.35 * o2.L);
      }
      c.setTransform(1, 0, 0, 1, 0, 0); c.globalAlpha = 1;
    });
    q.add(function () {
      drawHaze(ctx);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      blurInto(ctx, farLayer, 1.8 * dpr, 0, 0, PW, PH);
      farLayer.width = farLayer.height = 0; farLayer = null;
      reset();
    });
    /* ветви (задний план), черешки */
    q.add(function () {
      var rr = rng(seed * 17 + 3), list = tree.branches.filter(function (b) { return !b.front && b.used; });
      list.sort(function (a, b) { return a.depth - b.depth; });
      list.forEach(function (b) { drawBranch(ctx, b, rr); });
    });
    q.add(function () { drawPedicels(ctx); });
    /* средний план: цветы кусками */
    q.add(function () {
      q.insert(q.chunk(ops.length, lite ? 80 : 130, function (a, b) { drawOps(ops, a, b, ctx, sp); }));
    });
    /* передние ветви поверх цветов */
    q.add(function () {
      var rr = rng(seed * 19 + 5);
      tree.branches.forEach(function (b) { if (b.front && b.used) drawBranch(ctx, b, rr); });
    });
    /* передний план: боке — крупные размытые цветы и световые круги */
    q.add(function () {
      var R = rng(seed * 71 + 13), i, n = lite ? 3 : small ? 6 : 14, tries = 0, c = ctx, pt;
      c.globalCompositeOperation = 'lighter';
      while (bokeh.length < n && tries < 300) {
        tries++;
        pt = samplePool(R);
        if (M(pt.x, pt.y) < 0.18) continue;
        bokeh.push({ x: pt.x, y: pt.y, s: (small ? 46 : 100) + R() * (small ? 50 : 150), r: R() * TAU, k: [0, 1, 2, 5][(R() * 4) | 0], l: 2 + ((R() * 2) | 0), a: (0.12 + R() * 0.12) * (small ? 0.7 : 1) });
      }
      for (i = 0; i < bokeh.length; i++) {
        var o2 = bokeh[i], spr = sp.s2[o2.k][o2.l];
        put(c, dpr, spr, o2.x, o2.y, o2.s, o2.r, o2.a * M(o2.x, o2.y));
      }
      reset();
      /* линзовые круги с лёгким кольцевым краем */
      var nd = lite ? 6 : small ? 12 : 30;
      c.globalCompositeOperation = 'lighter';
      for (i = 0; i < nd; i++) {
        pt = samplePool(R);
        var br = (4 + R() * R() * 34) * Math.max(U, 0.7), mm = M(pt.x, pt.y);
        if (mm < 0.12) continue;
        var a = (0.03 + R() * 0.07) * mm, g = c.createRadialGradient(pt.x, pt.y, 0, pt.x, pt.y, br);
        g.addColorStop(0, 'rgba(255,196,222,' + (a * 0.6).toFixed(3) + ')'); g.addColorStop(0.8, 'rgba(255,196,222,' + (a * 0.8).toFixed(3) + ')');
        g.addColorStop(0.94, 'rgba(255,222,236,' + (a * 1.5).toFixed(3) + ')'); g.addColorStop(1, 'rgba(255,196,222,0)');
        c.fillStyle = g; c.beginPath(); c.arc(pt.x, pt.y, br, 0, TAU); c.fill();
      }
      c.globalCompositeOperation = 'source-over';
    });
    /* россыпь мелких лепестков вокруг цветения: даёт «мерцание» и фактуру, как на плёнке */
    q.add(function () {
      var R = rng(seed * 83 + 21), n = lite ? 40 : small ? 80 : 260, i, set = [], v, spr, tries = 0, cnt = 0;
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

    /* ---------- дальний слой: тусклые силуэты ветвей и мелких цветов, едва двигается ---------- */
    var FP = small
      ? (reduce ? [[-1, 0.35, 0.5], [1, 0.62, 0.5], [-1, 0.9, 0.5]] : [[-1, 0.08, 0.55], [1, 0.26, 0.55], [-1, 0.45, 0.5], [1, 0.62, 0.5], [-1, 0.8, 0.55], [1, 0.96, 0.5]])
      : (reduce ? [[-1, 0.4, 0.34], [1, 0.66, 0.34], [-1, 0.92, 0.34]] : [[-1, 0.08, 0.36], [1, 0.26, 0.36], [-1, 0.44, 0.32], [1, 0.62, 0.36], [-1, 0.8, 0.38], [1, 0.96, 0.32]]);
    var fsc = small ? 0.62 : 0.5, fh = H + TF + 2 * my;
    q.add(function () {
      if (lite) return;
      farC = mk(cw * fsc, fh * fsc);
      var c = farC.getContext('2d');
      c.imageSmoothingQuality = 'high';
      FP.forEach(function (def, idx) {
        q.insert([function () { farPool(c, def, idx); }]);
      });
    });
    function farPool(c, def, idx) {
      var R = rng(seed * 53 + 9 + idx * 31), s = def[0], SHf = H + TF, cy = Y0 + def[1] * SHf, reach = def[2] * W, cx = s < 0 ? X0 : X1, dir = -s;
      var n = small ? 22 : 36, i, b, arr = [], o2, k, t, g;
      c.setTransform(fsc, 0, 0, fsc, 0, 0); c.lineCap = 'round';
      /* тонкие тёмные ветви */
      for (b = 0; b < 3; b++) {
        var xs = cx + s * 0.05 * W, ys = cy + (R() - 0.5) * 0.3 * H, xe = xs + dir * reach * (0.7 + R() * 0.5), ye = ys + (R() - 0.35) * 0.3 * H;
        var xc = (xs + xe) / 2, yc = (ys + ye) / 2 - (R() * 0.1 - 0.02) * H, px = xs, py = ys, w0 = (3 + R() * 2.5) * Math.max(U, 0.7);
        for (k = 1; k <= 18; k++) {
          t = k / 18;
          var qx = (1 - t) * (1 - t) * xs + 2 * (1 - t) * t * xc + t * t * xe, qy = (1 - t) * (1 - t) * ys + 2 * (1 - t) * t * yc + t * t * ye;
          c.strokeStyle = 'rgba(52,26,38,' + (0.62 * (1 - 0.55 * t)).toFixed(3) + ')'; c.lineWidth = w0 * (1 - t) + 0.7;
          c.beginPath(); c.moveTo(px, py); c.lineTo(qx, qy); c.stroke();
          px = qx; py = qy;
        }
      }
      for (i = 0; i < n; i++) {
        var rl = Math.pow(R(), 1.5) * reach * 1.12, fr = rl / reach;
        var L = clamp(0.06 + R() * 0.3 + 0.28 * (1 - fr), 0, 0.62);
        arr.push({ k: R() < 0.12 ? 6 : (R() * 4) | 0, x: cx + s * 0.04 * W + dir * rl, y: cy + (R() + R() + R() - 1.5) * 0.36 * H * (1 - 0.35 * fr),
          s: (10 + R() * 13) * FS * (1 - 0.25 * fr), r: R() * TAU, L: L, n: R() });
      }
      arr.sort(function (a, b2) { return a.L - b2.L; });
      /* мягкие пятна под цветами */
      for (i = 0; i < arr.length; i += 2) {
        o2 = arr[i];
        var rad = o2.s * 2.4;
        g = c.createRadialGradient(o2.x, o2.y, 0, o2.x, o2.y, rad);
        g.addColorStop(0, rgba(mixc([120, 44, 82], [236, 150, 186], o2.L), 0.1 + 0.12 * o2.L)); g.addColorStop(1, rgba([120, 44, 82], 0));
        c.fillStyle = g; c.beginPath(); c.arc(o2.x, o2.y, rad, 0, TAU); c.fill();
      }
      for (i = 0; i < arr.length; i++) {
        o2 = arr[i];
        var l = levelOf(o2.L, o2.n), spr = sp.s1[o2.k][l] || sp.f[o2.k][l];
        put(c, fsc, spr, o2.x, o2.y, o2.s, o2.r, 0.36 + 0.4 * o2.L);
      }
      c.setTransform(1, 0, 0, 1, 0, 0); c.globalAlpha = 1;
    }

    /* ---------- ближний слой: крупные размытые цветы и световые круги у краёв, быстрее всех ---------- */
    var nsc = small ? 0.5 : 0.4, nh = H + TN + 2 * my;
    q.add(function () {
      if (lite) return;
      nearC = mk(cw * nsc, nh * nsc);
      var c = nearC.getContext('2d'), R = rng(seed * 91 + 17), n = small ? 5 : 10, i, SHn = H + TN;
      c.imageSmoothingQuality = 'high';
      c.globalCompositeOperation = 'lighter';
      for (i = 0; i < n; i++) {
        var s = (i & 1) ? 1 : -1, y = Y0 + ((i + 0.5) / n + (R() - 0.5) * 0.05) * SHn, inw = R() * 0.07 * W;
        var x = s < 0 ? X0 - 0.02 * W + inw : X1 + 0.02 * W - inw;
        var size = (small ? 90 : 170) + R() * (small ? 80 : 220), k = [0, 1, 2, 5][(R() * 4) | 0], l = 2 + ((R() * 2) | 0);
        put(c, nsc, sp.s2[k][l], x, y, size, R() * TAU, 0.15 + R() * 0.13);
      }
      c.setTransform(nsc, 0, 0, nsc, 0, 0); c.globalAlpha = 1;
      for (i = 0; i < (small ? 8 : 18); i++) {
        var s2 = R() < 0.5 ? 1 : -1, by = Y0 + R() * SHn, bx = s2 < 0 ? X0 + R() * R() * 0.14 * W : X1 - R() * R() * 0.14 * W;
        var br = (4 + R() * R() * 34) * Math.max(U, 0.7), a = 0.04 + R() * 0.08;
        var g = c.createRadialGradient(bx, by, 0, bx, by, br);
        g.addColorStop(0, 'rgba(255,196,222,' + (a * 0.6).toFixed(3) + ')'); g.addColorStop(0.8, 'rgba(255,196,222,' + (a * 0.8).toFixed(3) + ')');
        g.addColorStop(0.94, 'rgba(255,222,236,' + (a * 1.5).toFixed(3) + ')'); g.addColorStop(1, 'rgba(255,196,222,0)');
        c.fillStyle = g; c.beginPath(); c.arc(bx, by, br, 0, TAU); c.fill();
      }
      c.setTransform(1, 0, 0, 1, 0, 0); c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
    });

    q.add(function () {                       // спрайты больше не нужны: сразу освобождаем память
      ['f', 's1', 's2'].forEach(function (g) { sp[g].forEach(function (row) { row.forEach(function (x) { if (x) x.c.width = x.c.height = 0; }); }); });
      sp = null;
    });
    q.add(function () { if (!lite) drawRays(ctx); });
    q.add(bloomPrep);
    q.add(bloom1);
    q.add(bloom2);
    q.add(applyMask);
    /* отдать готовое */
    var finished = false;
    q.add(function () {
      finished = true;
      stats.wall = now() - t0;
      stats.px = PW * PH + (farC ? farC.width * farC.height : 0) + (nearC ? nearC.width * nearC.height : 0);
      done({
        mid: work, far: farC, near: nearC, stats: stats,
        dims: { w: W, h: H, mx: mx, my: my, cw: cw, hm: hm, fh: fh, nh: nh, TM: TM, TF: TF, TN: TN, small: small }
      });
    });

    return {
      start: function () { q.run(); },
      cancel: function () {                      // незавершённая сборка освобождает память; готовые слои уже на странице
        q.cancel = true;
        if (!finished) { work.width = work.height = 0; if (farC) farC.width = farC.height = 0; if (nearC) nearC.width = nearC.height = 0; }
      },
      stats: stats
    };
  }

  /* ==========================================================================
     Лепестки и искры: один полноэкранный canvas над страницей.
     Мелкие частицы — точные по размеру спрайты (без масштабирования: нет мерцания), лепестки кувыркаются в 3D.
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

  /* Точка/круг заданного диаметра в пикселях устройства; kind: 0 чёткая искра, 1 мягкий диск, 2 диск с ободком (боке), 3 тёплый огонёк */
  function dotSprite(d, kind, col) {
    var n = Math.max(4, Math.ceil(d) + 4), cv = mk(n, n), c = cv.getContext('2d'), r = d / 2, m = n / 2;
    var g = c.createRadialGradient(m, m, 0, m, m, r + 1);
    var k = Math.max(0, r - 0.5) / (r + 1);
    if (kind === 0) {
      g.addColorStop(0, rgba(col, 1)); g.addColorStop(Math.min(0.92, k * 0.5), rgba(col, 0.98)); g.addColorStop(Math.min(0.98, k + 0.02), rgba(col, 0.5)); g.addColorStop(1, rgba(col, 0));
    } else if (kind === 1) {
      g.addColorStop(0, rgba(col, 0.95)); g.addColorStop(0.45, rgba(col, 0.5)); g.addColorStop(1, rgba(col, 0));
    } else if (kind === 2) {
      g.addColorStop(0, rgba(col, 0.34)); g.addColorStop(0.7, rgba(col, 0.5)); g.addColorStop(0.9, rgba(col, 0.95)); g.addColorStop(1, rgba(col, 0));
    } else {
      g.addColorStop(0, 'rgba(255,246,206,1)'); g.addColorStop(0.18, 'rgba(255,224,150,.92)'); g.addColorStop(0.5, 'rgba(255,184,92,.3)'); g.addColorStop(1, 'rgba(255,170,70,0)');
    }
    c.fillStyle = g; c.fillRect(0, 0, n, n);
    return { c: cv, h: n / 2 };
  }

  function createField(cv, opts, S) {
    var ctx = cv.getContext('2d');
    var lite = !!opts.lite, phone = !!opts.small, reduce = !!opts.reduce;
    var W = 0, H = 0, dpr = 1;
    var CNT = lite ? { dust: 40, bokeh: 0, small: 20, mid: 10, big: 0, gold: 2 }
      : phone ? { dust: 80, bokeh: 6, small: 40, mid: 24, big: 0, gold: 4 }
      : { dust: 170, bokeh: 14, small: 110, mid: 60, big: 4, gold: 7 };
    var DUST_D = [1.2, 1.7, 2.3, 3.1], BOKEH_D = [5, 7.5, 11], GOLD_D = [9, 14, 22];
    var WHITE = [255, 251, 253], PINK = [255, 222, 236];
    var sets = null, sprReady = false, spDpr = 0;              // спрайты строятся по частям, чтобы не блокировать поток
    var Pd = [], Pb = [], Ps = [], Pm = [], Pg = [], Pk = [];  // искры, боке, мелкие, средние, крупные лепестки, огоньки
    var raf = 0, running = false, tabOn = !doc.hidden, lastT = 0, t0 = 0, dtS = 0.0167, frame = 0;
    var ptr = { x: -9999, y: -9999, vx: 0, vy: 0, on: false };

    function rand(a, b) { return a + Math.random() * (b - a); }

    function sizeDpr() {
      dpr = Math.min(win.devicePixelRatio || 1, lite ? 1 : phone ? 1.25 : 1.5);
      var cap = phone ? 1.4e6 : 3.0e6;
      while (W * H * dpr * dpr > cap && dpr > 1) dpr -= 0.25;
      if (dpr < 1) dpr = 1;
      cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    }

    function buildSprites(done) {
      var q = makeQueue(null), ns = { dust: [[], []], bokeh: [[], []], gold: [], sm: [], md: [], bg: [] }, d = dpr, i, v;
      q.add(function () {
        for (i = 0; i < DUST_D.length; i++) { ns.dust[0][i] = dotSprite(DUST_D[i] * d, 0, WHITE); ns.dust[1][i] = dotSprite(DUST_D[i] * d, 0, PINK); }
        for (i = 0; i < BOKEH_D.length; i++) { ns.bokeh[0][i] = dotSprite(BOKEH_D[i] * d, 1, PINK); ns.bokeh[1][i] = dotSprite(BOKEH_D[i] * d, 2, PINK); }
        for (i = 0; i < GOLD_D.length; i++) ns.gold[i] = dotSprite(GOLD_D[i] * d, 3, WHITE);
      });
      var VT = [[4, 0], [4, 1], [3, 2], [4, 3]], VM = [[3, 0], [4, 1], [4, 2], [3, 3]];
      q.add(function () {
        var sd;
        for (v = 0; v < 4; v++) {
          ns.sm[v] = []; ns.md[v] = [];
          for (sd = 0; sd < 3; sd++) { ns.sm[v][sd] = petalSprite(16, VT[v][0], VT[v][1] + 5, sd); ns.md[v][sd] = petalSprite(36, VM[v][0], VM[v][1] + 5, sd); }
        }
      });
      if (CNT.big) for (v = 0; v < 3; v++) (function (vv) {
        q.add(function () { ns.bg[vv] = []; for (var s2 = 0; s2 < 3; s2++) ns.bg[vv][s2] = soften(petalSprite(88, [3, 2, 3][vv], [0, 1, 3][vv] + 5, s2), 88 * 0.08); });
      })(v);
      q.add(function () { sets = ns; spDpr = d; sprReady = true; });
      q.run(done);
    }

    /* ---------- появление частиц ---------- */
    function spawnDust(p, init) {
      var d = Math.pow(Math.random(), 0.8);
      p.d = d; p.cls = d < 0.34 ? 0 : d < 0.62 ? 1 : d < 0.86 ? 2 : 3; if (Math.random() < 0.12) p.cls = Math.min(3, p.cls + 1);
      p.col = Math.random() < 0.72 ? 0 : 1;
      p.alpha = lerp(0.4, 0.95, d) * rand(0.65, 1);
      p.vy0 = rand(2, 12) * lerp(0.5, 1, d); p.sway = lerp(2, 9, d) * rand(0.7, 1.3);
      p.tw = rand(0, TAU); p.twv = rand(0.5, 2.0); p.f1 = rand(0, TAU);
      p.vx = 0; p.vy = p.vy0;
      place(p, init);
    }
    function spawnBokeh(p, init) {
      p.d = rand(0.3, 1); p.cls = (Math.random() * 3) | 0; p.col = Math.random() < 0.5 ? 0 : 1;
      p.alpha = rand(0.16, 0.36); p.vy0 = rand(2, 9); p.sway = rand(3, 8);
      p.tw = rand(0, TAU); p.twv = rand(0.2, 0.6); p.f1 = rand(0, TAU);
      p.vx = 0; p.vy = p.vy0;
      place(p, init);
    }
    function spawnPetal(p, init, kind) {                       // 0 мелкий, 1 средний, 2 крупный
      var d = kind === 2 ? rand(0.85, 1) : Math.pow(Math.random(), 0.9);
      p.d = d;
      p.size = kind === 0 ? lerp(4, 9, d * rand(0.6, 1)) : kind === 1 ? lerp(10, 22, d * rand(0.5, 1)) : rand(60, 100);
      p.vy0 = kind === 2 ? rand(36, 66) : kind === 1 ? lerp(12, 40, d) : lerp(8, 30, d);
      p.sway = lerp(6, 28, d) * rand(0.7, 1.3) * (kind === 2 ? 0.8 : 1);
      p.f1 = rand(0, TAU); p.f1v = rand(0.9, 2.4) * (kind === 0 ? 1.3 : 1) * (Math.random() < 0.5 ? -1 : 1) * (kind === 2 ? 0.6 : 1);
      p.f2 = rand(0, TAU); p.f2v = rand(0.5, 1.3);
      p.rot = rand(0, TAU); p.spin = rand(-0.9, 0.9) * (kind === 2 ? 0.5 : 1);
      p.alpha = kind === 2 ? rand(0.3, 0.45) : kind === 1 ? lerp(0.5, 0.82, d) : lerp(0.42, 0.95, d);
      p.v = (Math.random() * (kind === 2 ? 3 : 4)) | 0;
      p.vx = 0; p.vy = p.vy0;
      place(p, init);
    }
    function spawnGold(p, init) {
      p.d = rand(0.4, 1); p.cls = (Math.random() * 3) | 0;
      p.alpha = rand(0.45, 0.85); p.vy0 = -rand(2, 8); p.sway = rand(3, 8);
      p.tw = rand(0, TAU); p.twv = rand(0.5, 1.1); p.f1 = rand(0, TAU);
      p.vx = 0; p.vy = p.vy0;
      place(p, init);
    }
    function place(p, init) {
      if (init) { p.x = rand(0, W); p.y = rand(0, H); }
      else if (Math.random() < 0.5) { p.x = W + 20; p.y = rand(-40, H); }
      else { p.x = rand(0, W + 20); p.y = -30; }
    }
    function spawnAll(init) {
      var i;
      for (i = 0; i < Pd.length; i++) spawnDust(Pd[i], init);
      for (i = 0; i < Pb.length; i++) spawnBokeh(Pb[i], init);
      for (i = 0; i < Ps.length; i++) spawnPetal(Ps[i], init, 0);
      for (i = 0; i < Pm.length; i++) spawnPetal(Pm[i], init, 1);
      for (i = 0; i < Pg.length; i++) spawnPetal(Pg[i], init, 2);
      for (i = 0; i < Pk.length; i++) spawnGold(Pk[i], init);
    }
    (function () {
      function fill(arr, n) { for (var i = 0; i < n; i++) arr.push({}); }
      fill(Pd, CNT.dust); fill(Pb, CNT.bokeh); fill(Ps, CNT.small); fill(Pm, CNT.mid); fill(Pg, CNT.big); fill(Pk, CNT.gold);
    })();

    /* ---------- рисование ---------- */
    /* кувырок в 3D: поворот вокруг длинной оси (ширина = cos), качка вокруг поперечной (длина) */
    function drawPetal(p, set, aMul) {
      var cs = Math.cos(p.f1), thick = Math.abs(cs), sy = Math.cos(0.75 * Math.sin(p.f2));
      var side = cs >= 0 ? 0 : 1;
      if (thick < 0.26) side = 2;
      var s = set[p.v][side];
      var k = p.size / s.fd * dpr, sx = Math.max(0.09, thick);
      var co = Math.cos(p.rot), si = Math.sin(p.rot), a = p.alpha * aMul;
      if (thick < 0.4) a *= 0.8 + 0.2 * thick / 0.4;
      ctx.globalAlpha = a;
      ctx.setTransform(co * sx * k, si * sx * k, -si * sy * k, co * sy * k, p.x * dpr, p.y * dpr);
      ctx.drawImage(s.c, -s.cx, -s.cy);
    }
    function draw(t) {
      var i, p, s, a;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, cv.width, cv.height);
      ctx.globalCompositeOperation = 'source-over';
      for (i = 0; i < Pb.length; i++) {
        p = Pb[i]; s = sets.bokeh[p.col][p.cls];
        a = p.alpha * (0.7 + 0.3 * Math.sin(t * p.twv + p.tw));
        ctx.globalAlpha = a;
        ctx.drawImage(s.c, p.x * dpr - s.h, p.y * dpr - s.h);
      }
      for (i = 0; i < Pd.length; i++) {
        p = Pd[i]; s = sets.dust[p.col][p.cls];
        a = Math.sin(t * p.twv + p.tw); a = a * a;
        ctx.globalAlpha = p.alpha * (0.3 + 0.7 * a);
        ctx.drawImage(s.c, p.x * dpr - s.h, p.y * dpr - s.h);
      }
      for (i = 0; i < Ps.length; i++) drawPetal(Ps[i], sets.sm, 1);
      for (i = 0; i < Pm.length; i++) drawPetal(Pm[i], sets.md, 1);
      for (i = 0; i < Pg.length; i++) drawPetal(Pg[i], sets.bg, 1);
      ctx.globalCompositeOperation = 'lighter';
      for (i = 0; i < Pk.length; i++) {
        p = Pk[i]; s = sets.gold[p.cls];
        a = 0.5 + 0.5 * Math.sin(t * p.twv + p.tw);
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalAlpha = p.alpha * (0.25 + 0.75 * a);
        ctx.drawImage(s.c, p.x * dpr - s.h, p.y * dpr - s.h);
      }
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    }

    /* ---------- движение ---------- */
    function push(p, R, dt, k) {                               // курсор отталкивает: импульс в скорость, дальше воздух возвращает ход
      var dx = p.x - ptr.x, dy = p.y - ptr.y, d2 = dx * dx + dy * dy, R2 = R * R;
      if (d2 < R2 && d2 > 1) {
        var d = Math.sqrt(d2), f = 1 - d / R;
        p.vx += dx / d * f * f * 620 * dt * k + ptr.vx * f * 0.5 * k;
        p.vy += dy / d * f * f * 620 * dt * k + ptr.vy * f * 0.5 * k;
        if (p.spin !== undefined) p.spin += (dx > 0 ? 1 : -1) * f * 3 * dt;
      }
    }
    function wrap(p, m) {
      if (p.y > H + m) { p.y = -m; p.x = rand(-m, W + m); }
      else if (p.y < -m) { p.y = H + m; p.x = rand(-m, W + m); }
      if (p.x < -m) { p.x = W + m; p.y = rand(-m, H + m); }
      else if (p.x > W + m) { p.x = -m; p.y = rand(-m, H + m); }
    }
    function step(ts) {
      raf = 0;
      var rawDt = lastT ? Math.min((ts - lastT) / 1000, 0.05) : 0.0167;
      lastT = ts;
      dtS += (rawDt - dtS) * 0.3;                              // сглаживаем неровные кадры: движение без рывков
      var dt = dtS;
      t0 += dt; frame++;
      if (S.tick) S.tick(dt, t0, frame);

      /* порыв от прокрутки затухает; параллакс: ближние частицы смещаются сильнее дальних */
      S.gust *= Math.exp(-dt * 2.2);
      var take = S.acc * (1 - Math.exp(-dt * 9)); S.acc -= take;
      var wind = -(22 + 14 * Math.sin(t0 * 0.21) + 6 * Math.sin(t0 * 0.53)), rate = 1 - Math.exp(-dt * 1.7);
      var gust = S.gust, i, p, df, area, tvx, tvy, m;
      var hasPtr = ptr.on;

      for (i = 0; i < Pd.length; i++) {                        // искры
        p = Pd[i]; df = lerp(0.35, 1, p.d);
        tvx = wind * df * 0.55 + Math.sin(t0 * 0.6 * p.twv + p.f1) * p.sway - gust * 0.12 * df;
        tvy = p.vy0 + Math.cos(t0 * 0.45 + p.tw * 1.3) * p.sway * 0.6;
        p.vx += (tvx - p.vx) * rate; p.vy += (tvy - p.vy) * rate;
        if (hasPtr) push(p, 110, dt, 0.6);
        p.x += p.vx * dt; p.y += p.vy * dt - take * (0.08 + 0.5 * p.d);
        wrap(p, 12);
      }
      for (i = 0; i < Pb.length; i++) {                        // боке
        p = Pb[i]; df = lerp(0.35, 1, p.d);
        tvx = wind * df * 0.4 + Math.sin(t0 * 0.3 + p.f1) * p.sway; tvy = p.vy0 + Math.cos(t0 * 0.25 + p.tw) * p.sway * 0.5;
        p.vx += (tvx - p.vx) * rate; p.vy += (tvy - p.vy) * rate;
        p.x += p.vx * dt; p.y += p.vy * dt - take * (0.1 + 0.55 * p.d);
        wrap(p, 20);
      }
      for (m = 0; m < 3; m++) {                                // лепестки: мелкие, средние, крупные
        var arr = m === 0 ? Ps : m === 1 ? Pm : Pg;
        for (i = 0; i < arr.length; i++) {
          p = arr[i]; df = lerp(0.35, 1, p.d);
          p.f1 += p.f1v * dt; p.f2 += p.f2v * dt; p.rot += p.spin * dt;
          /* лепесток ребром падает быстрее, плашмя — парит и скользит вбок */
          area = Math.abs(Math.cos(p.f1)) * 0.6 + 0.4;
          tvy = p.vy0 * lerp(1.3, 0.72, area);
          tvx = (wind + 10 * Math.sin(t0 * 0.7 + p.y * 0.004) + 6 * Math.sin(t0 * 1.7 + p.x * 0.006)) * df + Math.sin(p.f1) * p.sway * 0.7 - gust * 0.22 * (0.3 + p.d);
          p.vx += (tvx - p.vx) * rate; p.vy += (tvy - p.vy) * rate;
          if (hasPtr) push(p, 150, dt, 1);
          p.spin *= Math.exp(-dt * 0.5);
          p.x += p.vx * dt; p.y += p.vy * dt - take * (0.1 + 0.6 * p.d);
          wrap(p, p.size + 30);
        }
      }
      for (i = 0; i < Pk.length; i++) {                        // тёплые огоньки: медленно всплывают
        p = Pk[i];
        tvx = wind * 0.3 + Math.sin(t0 * 0.4 + p.f1) * p.sway; tvy = p.vy0 + Math.cos(t0 * 0.3 + p.tw) * p.sway * 0.5;
        p.vx += (tvx - p.vx) * rate; p.vy += (tvy - p.vy) * rate;
        p.x += p.vx * dt; p.y += p.vy * dt - take * (0.1 + 0.4 * p.d);
        wrap(p, 30);
      }
      ptr.vx *= 0.85; ptr.vy *= 0.85;
      draw(t0);
      if (running && tabOn) raf = win.requestAnimationFrame(step);
    }

    function kick() { if (!raf && running && tabOn) { lastT = 0; raf = win.requestAnimationFrame(step); } }

    function resize() {
      var w = cv.offsetWidth || win.innerWidth, h = cv.offsetHeight || win.innerHeight;
      if (W && Math.abs(w - W) < 2 && Math.abs(h - H) < 2) return false;
      var ow = W, oh = H, i, all = [Pd, Pb, Ps, Pm, Pg, Pk], j, p;
      W = w; H = h;
      sizeDpr();
      if (ow) for (j = 0; j < all.length; j++) for (i = 0; i < all[j].length; i++) { p = all[j][i]; p.x *= W / ow; p.y *= H / oh; }
      return true;
    }

    return {
      start: function (onReady) {
        resize();
        spawnAll(true);
        buildSprites(function () {
          if (reduce) draw(0); else { running = true; kick(); }
          if (onReady) onReady();
        });
        win.addEventListener('resize', function () {
          if (!resize()) return;
          if (sprReady && spDpr !== dpr) { sprReady = false; buildSprites(function () { if (reduce) draw(0); }); }
          else if (reduce && sprReady) draw(0);
        });
        if (reduce) return;
        doc.addEventListener('visibilitychange', function () { tabOn = !doc.hidden; if (tabOn) kick(); });
        win.addEventListener('pointermove', function (e) {
          if (e.pointerType === 'touch') return;
          ptr.vx = e.clientX - (ptr.x === -9999 ? e.clientX : ptr.x);
          ptr.vy = e.clientY - (ptr.y === -9999 ? e.clientY : ptr.y);
          ptr.x = e.clientX; ptr.y = e.clientY; ptr.on = true;
          S.px = e.clientX / W - 0.5; S.py = e.clientY / H - 0.5;
        }, { passive: true });
        doc.addEventListener('pointerleave', function () { ptr.on = false; ptr.x = ptr.y = -9999; });
      }
    };
  }

  /* ==========================================================================
     Подключение: слои сцены под страницей и поле частиц над ней
     ========================================================================== */
  FX.sky = {
    stats: null,
    init: function (o) {
      o = o || {};
      var cvP = doc.getElementById('skyFront') || doc.getElementById('skyBack'), wrap = doc.getElementById('canopy');
      var lite = !!o.lite, reduce = !!o.reduce;
      /* общее состояние прокрутки и курсора: читают и слои, и частицы */
      var S = { y: win.pageYOffset || 0, pos: win.pageYOffset || 0, max: 1, acc: 0, gust: 0, px: 0, py: 0, mpx: 0, mpy: 0, tick: null };
      var layers = [], lastT = 0;

      function measure() { S.max = Math.max(1, doc.documentElement.scrollHeight - win.innerHeight); }
      function place(t, force) {
        if (!layers.length) return;
        var p = clamp(S.pos / S.max, 0, 1), i, L, tx, ty, str;
        for (i = 0; i < layers.length; i++) {
          L = layers[i];
          tx = Math.sin(t * L.w + L.ph) * L.ax - S.mpx * L.px;
          ty = -p * L.travel + Math.cos(t * L.w * 0.8 + L.ph) * L.ay - S.mpy * L.py;
          str = 'translate3d(' + tx.toFixed(2) + 'px,' + ty.toFixed(2) + 'px,0)';
          if (force || str !== L.str) { L.el.style.transform = str; L.str = str; }
        }
      }
      S.tick = function (dt, t, frame) {
        if (frame % 40 === 1) measure();
        S.pos += (S.y - S.pos) * (1 - Math.exp(-dt * 6.5));
        if (Math.abs(S.y - S.pos) < 0.05) S.pos = S.y;
        S.mpx += (S.px - S.mpx) * (1 - Math.exp(-dt * 2.6)); S.mpy += (S.py - S.mpy) * (1 - Math.exp(-dt * 2.6));
        place(t, false);
      };

      if (!reduce) {
        win.addEventListener('scroll', function () {
          var y = win.pageYOffset || 0, now2 = now(), dtS = Math.max(16, now2 - (S.lt || now2 - 16)) / 1000, dy = y - S.y;
          S.gust = clamp(S.gust + clamp(dy / dtS, -2400, 2400) * 0.05, -140, 220);
          S.acc = clamp(S.acc + dy, -500, 500);
          S.y = y; S.lt = now2;
        }, { passive: true });
      }
      measure();

      var field = null;
      if (cvP && cvP.getContext) {
        field = createField(cvP, { lite: lite, reduce: reduce, small: win.innerWidth < 760 }, S);
        field.start(function () { cvP.classList.add('on'); });
      }
      if (!wrap) return;

      /* слои сцены: строим после первой отрисовки, кусками; готовые подменяем разом */
      var cur = null, built = null;
      function mount(res) {
        var d = res.dims, old = Array.prototype.slice.call(wrap.querySelectorAll('canvas')), i;
        var calm = d.small || lite;
        var defs = [
          { cv: res.far, h: d.fh, travel: d.TF, ax: 2, ay: 1.5, px: 3, py: 2, per: 17 },
          { cv: res.mid, h: d.hm, travel: d.TM, ax: 5, ay: 3, px: 7, py: 4, per: 13 },
          { cv: res.near, h: d.nh, travel: d.TN, ax: 9, ay: 5, px: 14, py: 8, per: 9 }
        ];
        layers = [];
        defs.forEach(function (df) {
          if (!df.cv) return;
          var el = df.cv;
          el.style.width = d.cw + 'px'; el.style.height = df.h + 'px';
          el.style.left = (-d.mx) + 'px'; el.style.top = (-d.my) + 'px';
          wrap.appendChild(el);
          if (!reduce) layers.push({ el: el, travel: df.travel, ax: calm ? df.ax * 0.5 : df.ax, ay: calm ? df.ay * 0.5 : df.ay, px: calm ? 0 : df.px, py: calm ? 0 : df.py, w: TAU / df.per, ph: Math.random() * TAU, str: '' });
        });
        measure(); place(0, true);
        for (i = 0; i < old.length; i++) { if (old[i].parentNode === wrap) wrap.removeChild(old[i]); old[i].width = old[i].height = 0; }
        built = d;
      }
      function build() {
        if (cur) cur.cancel();
        var W = wrap.offsetWidth || win.innerWidth, H = wrap.offsetHeight || win.innerHeight;
        cur = buildScene({ W: W, H: H, lite: lite, reduce: reduce, seed: 11 }, function (res) {
          mount(res); FX.sky.stats = res.stats; wrap.classList.add('on');
        });
        cur.start();
      }
      if (win.requestIdleCallback) win.requestIdleCallback(build, { timeout: 600 }); else setTimeout(build, 60);
      var rt = 0;
      win.addEventListener('resize', function () {
        clearTimeout(rt);
        rt = setTimeout(function () {
          var rw = wrap.offsetWidth, rh = wrap.offsetHeight;
          if (built && Math.abs(rw - built.w) < built.w * 0.04 && Math.abs(rh - built.h) < built.h * 0.1 && (rw < 600) === built.small) return;
          build();
        }, 300);
      });
    }
  };
})();
