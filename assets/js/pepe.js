/* ==========================================================================
   Plush Pepe «Pink Latex» — анимированный герой первого экрана.

   Рисунок целиком кодом, на canvas 2D: детали («спрайты») запекаются один раз
   (градиенты, мягкие тени, блики латекса), а каждый кадр лишь раскладываются
   с пружинной инерцией — поэтому 60 fps без тяжёлых фильтров.
   Если задан opts.src (Lottie JSON), оригинальная анимация плавно подменяет рисунок.

   Контракт: window.NTFX.pepe.create(container, opts) -> { start(), nudge(v) }
   ========================================================================== */
(function () {
  'use strict';

  var win = window, doc = document;
  var FX = win.NTFX = win.NTFX || {};

  var PI = Math.PI, TAU = PI * 2;
  var VIEW = 1180;          /* сторона сцены в условных единицах (эталон ~1080 + поля) */
  var OX = 54, OY = 36;     /* сдвиг эталонных координат внутрь сцены */

  /* ---------- Мелкие утилиты ---------- */
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function rand(a, b) { return a + Math.random() * (b - a); }
  function ease(u) { return u * u * (3 - 2 * u); }
  function noop() {}

  /* пружина: следует за target с инерцией и лёгким перелётом */
  function Spring(k, d) { this.x = 0; this.v = 0; this.t = 0; this.k = k; this.d = d; }
  Spring.prototype.step = function (dt) {
    var n = Math.max(1, Math.ceil(dt / 0.008)), h = dt / n;
    for (var i = 0; i < n; i++) {
      this.v += (this.k * (this.t - this.x) - this.d * this.v) * h;
      this.x += this.v * h;
    }
    return this.x;
  };

  /* форма удара сердца: быстрый подъём, мягкий спад (u в 0..1) */
  function bump(u) {
    if (u <= 0 || u >= 1) return 0;
    if (u < 0.28) return 0.5 - 0.5 * Math.cos(PI * u / 0.28);
    return 0.5 + 0.5 * Math.cos(PI * (u - 0.28) / 0.72);
  }

  /* ==========================================================================
     Геометрия (эталонные координаты ~1080×1080, как на скриншоте Telegram)
     ========================================================================== */
  var GEO = {
    body: 'M 160 262 C 128 222 170 168 240 156 C 300 146 350 170 392 152 C 420 112 462 86 522 86 ' +
          'C 580 86 626 122 640 176 C 660 244 672 330 662 402 C 656 460 696 514 708 596 ' +
          'C 720 690 702 766 658 804 C 612 852 482 874 360 864 C 276 858 210 836 172 778 ' +
          'C 140 726 156 676 142 628 C 130 580 150 540 134 490 C 118 436 106 392 120 340 ' +
          'C 128 308 140 286 160 262 Z',
    legR: 'M 612 722 C 690 712 790 752 836 782 C 850 750 858 706 880 670 C 906 636 956 640 962 694 ' +
          'C 968 756 944 836 908 874 C 882 900 836 896 800 878 C 740 848 676 836 628 812 Z',
    footL: 'M 98 884 C 86 832 126 792 190 788 C 246 784 324 778 334 832 C 342 882 302 926 264 964 ' +
           'C 228 1000 160 1004 124 980 C 98 962 104 918 98 884 Z',
    heart: 'M 0 190 C -40 160 -180 70 -180 -50 C -180 -140 -120 -190 -70 -190 C -30 -190 -8 -160 0 -130 ' +
           'C 8 -160 30 -190 70 -190 C 120 -190 180 -140 180 -50 C 180 70 40 160 0 190 Z',
    armL: 'M 252 648 C 336 668 446 656 526 608 C 566 585 600 550 628 516',
    armR: 'M 714 522 C 756 586 702 626 618 616 C 560 610 522 592 490 572',
    mouth: 'M 266 402 C 260 380 286 372 332 380 C 432 394 540 380 628 338 C 662 322 670 348 650 378 ' +
           'C 622 424 540 462 430 468 C 340 472 278 466 266 438 C 262 426 264 413 266 402 Z',
    mouthLine: 'M 306 424 C 404 436 546 418 638 363',
    seam: 'M 214 232 C 204 304 214 424 232 522 C 246 584 238 640 226 700',
    seam2: 'M 168 800 C 210 818 262 822 320 806'
  };

  /* параметры глаз: кольцо (контур), белок, зрачок-пуговица, наклон, позиция */
  var EYE = [
    { x: 362, y: 286, rx: 109, ry: 85, ix: 98, iy: 74, pr: 67, tilt: -9 },
    { x: 570, y: 233, rx: 93, ry: 76, ix: 83, iy: 66, pr: 57, tilt: -6 }
  ];
  var HEART_AT = { x: 522, y: 607, rot: 3.5 };
  var BODY_PIV = { x: 470, y: 866 };

  /* ==========================================================================
     Рисование спрайтов
     ========================================================================== */
  var SS = 1;               /* пикселей спрайта на условную единицу */
  var SBB = [0, 0, 1, 1];   /* рамка текущего спрайта */

  function sprite(bb, fn) {
    var w = Math.max(1, Math.ceil((bb[2] - bb[0]) * SS)), h = Math.max(1, Math.ceil((bb[3] - bb[1]) * SS));
    var cv = doc.createElement('canvas');
    cv.width = w; cv.height = h;
    var c = cv.getContext('2d');
    SBB = bb;
    c.setTransform(SS, 0, 0, SS, -bb[0] * SS, -bb[1] * SS);
    fn(c);
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalCompositeOperation = 'source-over';
    return { cv: cv, x: bb[0], y: bb[1], w: w / SS, h: h / SS, s: SS };
  }

  function atop(c) { c.globalCompositeOperation = 'source-atop'; }
  function behind(c) { c.globalCompositeOperation = 'destination-over'; }

  /* проверка: работает ли «тень вне кадра» (нужна и в Safari/iOS); иначе — запасное размытие */
  var SOFT_OK = null;
  function softWorks() {
    if (SOFT_OK !== null) return SOFT_OK;
    try {
      var t = doc.createElement('canvas'); t.width = 24; t.height = 24;
      var x = t.getContext('2d');
      x.shadowColor = '#000'; x.shadowBlur = 2; x.shadowOffsetX = 300; x.shadowOffsetY = 0;
      x.fillRect(-294, 6, 12, 12);
      SOFT_OK = x.getImageData(12, 12, 1, 1).data[3] > 128;
    } catch (e) { SOFT_OK = false; }
    return SOFT_OK;
  }
  /* запасной путь: форма рисуется в уменьшенную канву и растягивается вверх ступенями ×2 (билинейное размытие) */
  function softFallback(c, sigma, color, fn) {
    var d = clamp(Math.round(sigma * SS / 1.6), 1, 14), w = c.canvas.width, h = c.canvas.height;
    var t = doc.createElement('canvas');
    t.width = Math.max(1, Math.ceil(w / d)); t.height = Math.max(1, Math.ceil(h / d));
    var tc = t.getContext('2d'), k = SS / d;
    tc.setTransform(k, 0, 0, k, -SBB[0] * k, -SBB[1] * k);
    tc.fillStyle = color; tc.strokeStyle = color;
    fn(tc);
    var src = t, f = d, u, uc;
    while (f > 2) {
      u = doc.createElement('canvas'); u.width = src.width * 2; u.height = src.height * 2;
      uc = u.getContext('2d'); uc.imageSmoothingEnabled = true; uc.drawImage(src, 0, 0, u.width, u.height);
      src = u; f /= 2;
    }
    c.save();
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.imageSmoothingEnabled = true;
    c.drawImage(src, 0, 0, w, h);
    c.restore();
  }
  /* мягкая заливка: форму fn рисует за кадром, в спрайт попадает только размытая тень (без ctx.filter) */
  function soft(c, sigma, color, fn) {
    if (!softWorks()) { softFallback(c, sigma, color, fn); return; }
    var off = c.canvas.width + 400;
    c.save();
    c.shadowColor = color;
    c.shadowBlur = Math.max(0, sigma * 2 * SS);
    c.shadowOffsetX = off;
    c.shadowOffsetY = 0;
    c.translate(-off / SS, 0);
    c.fillStyle = '#000';
    c.strokeStyle = '#000';
    fn(c);
    c.restore();
  }
  function ellPath(c, x, y, rx, ry, rot) { c.beginPath(); c.ellipse(x, y, rx, ry, (rot || 0) * PI / 180, 0, TAU); }
  /* мягкий эллиптический блик/тень */
  function blob(c, sigma, color, x, y, rx, ry, rot) {
    soft(c, sigma, color, function (c) { ellPath(c, x, y, rx, ry, rot); c.fill(); });
  }
  /* мягкая линия (контур вдоль пути) */
  function line(c, sigma, color, w, d, dash, dx, dy) {
    var p = new Path2D(d);
    soft(c, sigma, color, function (c) {
      if (dx || dy) c.translate(dx, dy);
      c.lineWidth = w; c.lineCap = 'round'; c.lineJoin = 'round';
      if (dash) c.setLineDash(dash);
      c.stroke(p);
    });
  }
  /* затемнение края формы внутрь (объём) */
  function innerEdge(c, P, w, sigma, color) {
    soft(c, sigma, color, function (c) { c.lineWidth = w; c.lineJoin = 'round'; c.stroke(P); });
  }
  /* контур, который ложится ПОД форму */
  function outline(c, P, w, color) {
    behind(c);
    c.lineJoin = 'round'; c.lineCap = 'round';
    c.lineWidth = w * 2; c.strokeStyle = color;
    c.stroke(P);
  }
  /* отражённый свет по краю: размытая обводка, видимая только в части формы по градиенту */
  function rim(c, P, w, sigma, color, x0, y0, x1, y1, amax) {
    var t = doc.createElement('canvas');
    t.width = c.canvas.width; t.height = c.canvas.height;
    var tc = t.getContext('2d');
    tc.setTransform(SS, 0, 0, SS, -SBB[0] * SS, -SBB[1] * SS);
    soft(tc, sigma, color, function (k) { k.lineWidth = w; k.lineJoin = 'round'; k.stroke(P); });
    tc.globalCompositeOperation = 'destination-in';
    var g = tc.createLinearGradient(x0, y0, x1, y1);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,' + amax + ')');
    tc.fillStyle = g;
    tc.fillRect(SBB[0], SBB[1], SBB[2] - SBB[0], SBB[3] - SBB[1]);
    c.save();
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.drawImage(t, 0, 0);
    c.restore();
  }
  function linGrad(c, x0, y0, x1, y1, stops) {
    var g = c.createLinearGradient(x0, y0, x1, y1);
    for (var i = 0; i < stops.length; i += 2) g.addColorStop(stops[i], stops[i + 1]);
    return g;
  }
  function radGrad(c, x, y, r, stops, fx, fy) {
    var g = c.createRadialGradient(fx === undefined ? x : fx, fy === undefined ? y : fy, 0, x, y, r);
    for (var i = 0; i < stops.length; i += 2) g.addColorStop(stops[i], stops[i + 1]);
    return g;
  }

  /* цвета латекса */
  var OL = '#a30f74';      /* контур */
  var P = null;            /* Path2D всех форм (создаются при сборке) */

  /* --- тело+голова --- */
  function buildBody() {
    return sprite([98, 68, 732, 886], function (c) {
      c.fillStyle = linGrad(c, 0, 90, 0, 870, [0, '#ff9ee1', 0.22, '#ff66c9', 0.5, '#ff30b0', 0.8, '#e91d9d', 1, '#c80f88']);
      c.fill(P.body);
      atop(c);
      /* мягкий свет слева-сверху */
      c.fillStyle = radGrad(c, 270, 250, 440, [0, 'rgba(255,205,246,.55)', 1, 'rgba(255,205,246,0)']);
      c.fillRect(60, 40, 740, 900);
      /* тени: правый бок, низ, края */
      blob(c, 46, 'rgba(120,0,90,.55)', 780, 470, 120, 340, 0);
      blob(c, 46, 'rgba(120,0,90,.6)', 470, 960, 400, 130, 0);
      innerEdge(c, P.body, 60, 20, 'rgba(122,0,88,.85)');
      /* отражённый свет по правому и нижнему краю */
      rim(c, P.body, 16, 5, 'rgba(255,150,228,.95)', 260, 240, 700, 840, 0.95);
      rim(c, P.body, 10, 3, 'rgba(255,170,236,.8)', 500, 380, 120, 380, 0.5);
      /* ореолы вокруг глаз и скулы (рельеф лица) */
      blob(c, 9, 'rgba(176,14,128,.5)', 366, 322, 122, 92, -9);
      blob(c, 9, 'rgba(176,14,128,.5)', 572, 268, 106, 82, -6);
      blob(c, 12, 'rgba(255,196,242,.88)', 364, 288, 128, 100, -9);
      blob(c, 12, 'rgba(255,196,242,.88)', 570, 236, 112, 90, -6);
      blob(c, 14, 'rgba(255,190,240,.7)', 468, 272, 70, 58, -8);
      blob(c, 14, 'rgba(255,170,236,.42)', 456, 410, 232, 72, -9);
      /* мягкие блики на выпуклостях */
      blob(c, 18, 'rgba(255,230,249,.4)', 272, 198, 112, 36, -14);
      line(c, 12, 'rgba(255,214,244,.55)', 30, 'M 166 372 C 150 450 160 560 176 652');
      blob(c, 14, 'rgba(255,196,240,.5)', 290, 770, 96, 28, 18);
      /* чёткие зеркальные блики */
      line(c, 1.6, 'rgba(255,255,255,.55)', 7, 'M 152 334 Q 142 400 150 470');
      /* стёжка-шов: тёмная нитка и светлая кромка рядом */
      line(c, 0.4, 'rgba(255,215,245,.55)', 4, 'M 217 233 C 207 305 217 425 235 523 C 249 585 241 641 229 701', [2, 11]);
      line(c, 0.5, 'rgba(140,0,98,.7)', 4, GEO.seam, [2, 11]);
      line(c, 0.4, 'rgba(255,215,245,.45)', 3.4, 'M 171 801 C 213 819 265 823 323 807', [2, 10]);
      line(c, 0.5, 'rgba(140,0,98,.6)', 3.4, GEO.seam2, [2, 10]);
      outline(c, P.body, 6.5, OL);
    });
  }

  /* --- блики головы: отдельный слой, чуть «скользит» по поверхности при наклоне --- */
  function buildGloss() {
    return sprite([96, 80, 640, 306], function (c) {
      c.save();
      c.clip(P.body);
      blob(c, 16, 'rgba(255,238,252,.55)', 268, 196, 118, 40, -14);
      blob(c, 12, 'rgba(255,238,252,.55)', 506, 138, 80, 26, -6);
      line(c, 1.8, 'rgba(255,255,255,.95)', 12, 'M 212 198 Q 252 168 322 164');
      line(c, 1.6, 'rgba(255,255,255,.9)', 8, 'M 212 224 L 214 228');
      line(c, 1.6, 'rgba(255,255,255,.9)', 9, 'M 440 128 Q 480 106 536 108');
      c.restore();
      /* у края формы блики гаснут, чтобы при сдвиге не вылезать за контур */
      c.globalCompositeOperation = 'destination-out';
      soft(c, 7, 'rgba(0,0,0,1)', function (k) { k.lineWidth = 34; k.lineJoin = 'round'; k.stroke(P.body); });
    });
  }

  /* --- правая нога (за телом) --- */
  function buildLegR() {
    return sprite([594, 630, 984, 914], function (c) {
      c.fillStyle = linGrad(c, 0, 640, 0, 900, [0, '#ff62c7', 0.45, '#ff2dae', 1, '#cf1190']);
      c.fill(P.legR);
      atop(c);
      blob(c, 30, 'rgba(100,0,70,.7)', 604, 790, 70, 120, 0);
      innerEdge(c, P.legR, 50, 16, 'rgba(120,0,88,.8)');
      blob(c, 20, 'rgba(120,0,88,.5)', 800, 880, 190, 40, 14);
      rim(c, P.legR, 14, 4, 'rgba(255,150,228,.95)', 700, 700, 940, 900, 0.9);
      line(c, 9, 'rgba(255,196,240,.75)', 18, 'M 660 744 C 730 746 790 772 828 796');
      blob(c, 9, 'rgba(255,214,246,.85)', 912, 706, 20, 54, 14);
      line(c, 1.6, 'rgba(255,255,255,.95)', 8, 'M 906 672 C 900 690 897 708 898 728');
      line(c, 1.6, 'rgba(255,255,255,.8)', 7, 'M 676 740 C 720 738 760 752 790 770');
      outline(c, P.legR, 6.5, OL);
    });
  }

  /* --- левая стопа (спереди) --- */
  function buildFootL() {
    return sprite([78, 768, 354, 1014], function (c) {
      c.fillStyle = linGrad(c, 0, 790, 0, 1000, [0, '#ff62c7', 0.5, '#ff2fae', 1, '#d1128f']);
      c.fill(P.footL);
      atop(c);
      innerEdge(c, P.footL, 50, 16, 'rgba(120,0,88,.8)');
      blob(c, 18, 'rgba(120,0,88,.55)', 270, 960, 120, 40, -30);
      /* складка стопы */
      line(c, 2, 'rgba(120,0,88,.7)', 6, 'M 262 886 C 250 912 246 934 252 958');
      line(c, 1.5, 'rgba(255,170,230,.6)', 4, 'M 268 888 C 257 912 253 934 259 958');
      rim(c, P.footL, 14, 4, 'rgba(255,150,228,.95)', 120, 820, 330, 1000, 0.9);
      blob(c, 12, 'rgba(255,214,246,.85)', 168, 838, 52, 24, -25);
      line(c, 1.8, 'rgba(255,255,255,.95)', 9, 'M 130 846 Q 150 820 196 814');
      outline(c, P.footL, 6.5, OL);
      /* тень от тела не нужна: стопа спереди */
    });
  }

  /* --- трубка (рука): мягкая «сосиска» с объёмом --- */
  function tube(c, d, W, blobs) {
    var path = new Path2D(d);
    function silhouette(extra) {
      c.lineCap = 'round'; c.lineJoin = 'round';
      c.lineWidth = W + extra * 2;
      c.stroke(path);
      for (var i = 0; i < blobs.length; i++) {
        ellPath(c, blobs[i][0], blobs[i][1], blobs[i][2] + extra, blobs[i][3] + extra, blobs[i][4]);
        c.fill();
      }
    }
    c.fillStyle = '#ff35b4'; c.strokeStyle = '#ff35b4';
    silhouette(0);
    atop(c);
    /* нижняя тень, верхний свет, блики (свет падает сверху-слева) */
    line(c, W * 0.2, 'rgba(120,0,90,.8)', W * 0.8, d, null, W * 0.1, W * 0.34);
    line(c, W * 0.14, 'rgba(255,170,232,.85)', W * 0.46, d, null, -W * 0.1, -W * 0.2);
    line(c, W * 0.035, 'rgba(255,255,255,.92)', W * 0.12, d, [W * 2.4, W * 0.9, W * 0.7, W * 0.9], -W * 0.16, -W * 0.3);
    line(c, W * 0.05, 'rgba(255,128,214,.9)', W * 0.16, d, null, W * 0.12, W * 0.46);
    behind(c);
    c.fillStyle = OL; c.strokeStyle = OL;
    silhouette(6);
    /* тень от руки на то, что за ней (рисуется последней, под рукой) */
    soft(c, 12, 'rgba(6,0,4,.62)', function (k) {
      k.translate(4, 14);
      k.lineCap = 'round'; k.lineJoin = 'round'; k.lineWidth = W + 10;
      k.stroke(path);
      for (var i = 0; i < blobs.length; i++) { ellPath(k, blobs[i][0], blobs[i][1], blobs[i][2] + 5, blobs[i][3] + 5, blobs[i][4]); k.fill(); }
    });
  }

  function buildArmL() {
    return sprite([184, 444, 712, 752], function (c) { tube(c, GEO.armL, 84, [[628, 516, 46, 50, 30]]); });
  }
  function buildArmR() {
    return sprite([394, 450, 814, 726], function (c) { tube(c, GEO.armR, 90, [[490, 572, 58, 56, 20]]); });
  }

  /* --- чёрное блестящее сердце (локальные координаты, центр в 0,0) --- */
  function buildHeart() {
    return sprite([-218, -222, 238, 248], function (c) {
      c.fillStyle = linGrad(c, -130, -190, 150, 190, [0, '#3c3c46', 0.4, '#16161b', 1, '#07070a']);
      c.fill(P.heart);
      atop(c);
      innerEdge(c, P.heart, 46, 14, 'rgba(0,0,0,.8)');
      /* отражение окружения: розовая полоса снизу и холодный блик сверху */
      blob(c, 18, 'rgba(255,100,196,.34)', 30, 150, 110, 26, -16);
      blob(c, 16, 'rgba(214,220,240,.62)', -96, -104, 66, 44, -38);
      blob(c, 12, 'rgba(190,196,220,.34)', 96, -118, 50, 26, 25);
      /* чёткие блики лопастей */
      line(c, 2.4, 'rgba(255,255,255,.88)', 15, 'M -150 -52 C -150 -108 -118 -146 -72 -150');
      line(c, 2.2, 'rgba(255,255,255,.55)', 8, 'M -128 -26 C -134 -50 -134 -62 -132 -70');
      line(c, 2.2, 'rgba(255,255,255,.62)', 9, 'M 98 -150 C 126 -146 148 -122 154 -92');
      /* тонкий розовый ободок отражённого света */
      rim(c, P.heart, 8, 2.2, 'rgba(255,120,206,.95)', -60, -40, 100, 200, 0.95);
      behind(c);
      c.lineJoin = 'round'; c.lineWidth = 12; c.strokeStyle = '#0a0a0e';
      c.stroke(P.heart);
      /* тень сердца на тело */
      soft(c, 16, 'rgba(8,0,5,.66)', function (k) { k.translate(8, 14); k.lineWidth = 12; k.lineJoin = 'round'; k.fill(P.heart); k.stroke(P.heart); });
    });
  }
  /* маленькое розовое сердечко-лепесток (то же сердце, уменьшенное) */
  function buildPetal() {
    return sprite([-58, -58, 58, 60], function (c) {
      var H = P.petal;
      c.fillStyle = linGrad(c, -27, -51, 32, 51, [0, '#ffb4e6', 0.5, '#ff4fc0', 1, '#d1128f']);
      c.fill(H);
      atop(c);
      innerEdge(c, H, 13, 4.3, 'rgba(150,0,100,.7)');
      blob(c, 3.8, 'rgba(255,230,250,.85)', -21, -30, 14, 8, -35);
      line(c, 0.6, 'rgba(255,255,255,.9)', 4.4, 'M -38 -16 C -38 -29 -31 -38 -21 -39');
      behind(c);
      c.lineJoin = 'round'; c.lineWidth = 12; c.strokeStyle = OL; c.stroke(H);
    });
  }

  /* --- глаза --- */
  function buildEyeBase(e) {
    return sprite([-e.rx - 28, -e.ry - 12, e.rx + 28, e.ry + 38], function (c) {
      /* контур-кольцо: глянцевый тёмно-серый пластик */
      ellPath(c, 0, 0, e.rx, e.ry, 0);
      c.fillStyle = radGrad(c, 0, 0, e.rx * 1.1, [0, '#4a4954', 0.7, '#34333c', 1, '#1f1e25'], -e.rx * 0.3, -e.ry * 0.5);
      c.fill();
      /* белок со сферической тенью */
      ellPath(c, 0, 0, e.ix, e.iy, 0);
      c.fillStyle = radGrad(c, 0, 0, e.ix * 1.15, [0, '#ffffff', 0.55, '#f6f4ff', 0.9, '#d8d3ee', 1, '#bdb6df'], -e.ix * 0.12, -e.iy * 0.2);
      c.fill();
      behind(c);
      soft(c, 8, 'rgba(70,0,52,.55)', function (k) { k.translate(0, 8); ellPath(k, 0, 0, e.rx, e.ry, 0); k.fill(); });
    });
  }
  function buildEyeOver(e) {
    var m = 6;
    return sprite([-e.ix - m, -e.iy - m, e.ix + m, e.iy + m], function (c) {
      /* тень века сверху и по краям */
      c.fillStyle = linGrad(c, 0, -e.iy, 0, e.iy * 0.2, [0, 'rgba(78,40,120,.5)', 0.55, 'rgba(78,40,120,.12)', 1, 'rgba(78,40,120,0)']);
      c.fillRect(-e.ix - m, -e.iy - m, 2 * e.ix + 2 * m, 2 * e.iy + 2 * m);
      /* выпуклый блик роговицы */
      blob(c, 4, 'rgba(255,255,255,.62)', -e.ix * 0.42, -e.iy * 0.5, e.ix * 0.3, e.iy * 0.13, -22);
      blob(c, 1.4, 'rgba(255,255,255,.95)', -e.ix * 0.52, -e.iy * 0.46, e.ix * 0.12, e.iy * 0.07, -22);
      blob(c, 3, 'rgba(255,255,255,.3)', e.ix * 0.5, e.iy * 0.56, e.ix * 0.28, e.iy * 0.07, 12);
    });
  }
  function buildPupil(r) {
    return sprite([-r - 12, -r - 12, r + 12, r + 12], function (c) {
      ellPath(c, 0, 0, r, r, 0);
      c.fillStyle = '#0a3d46'; c.fill();
      ellPath(c, 0, 0, r * 0.9, r * 0.9, 0);
      c.fillStyle = radGrad(c, 0, 0, r * 1.05, [0, '#52c3cb', 0.45, '#2a8a94', 0.85, '#1a6670', 1, '#0f4a54'], -r * 0.3, -r * 0.38);
      c.fill();
      /* фаска пуговицы */
      ellPath(c, 0, 0, r * 0.7, r * 0.7, 0);
      c.lineWidth = r * 0.07; c.strokeStyle = 'rgba(6,46,56,.55)'; c.stroke();
      ellPath(c, r * 0.02, r * 0.03, r * 0.72, r * 0.72, 0);
      c.lineWidth = r * 0.035; c.strokeStyle = 'rgba(150,235,240,.28)'; c.stroke();
      /* три отверстия пуговицы */
      var holes = [[0, -0.31], [-0.29, 0.2], [0.29, 0.2]];
      for (var i = 0; i < 3; i++) {
        var hx = holes[i][0] * r, hy = holes[i][1] * r;
        ellPath(c, hx, hy, r * 0.115, r * 0.115, 0); c.fillStyle = '#073942'; c.fill();
        ellPath(c, hx, hy + r * 0.012, r * 0.088, r * 0.088, 0); c.fillStyle = '#f4ffff'; c.fill();
      }
      /* глянец */
      blob(c, 3, 'rgba(255,255,255,.4)', -r * 0.38, -r * 0.5, r * 0.34, r * 0.14, -35);
    });
  }

  /* --- рот: полоса зубов с серым контуром --- */
  function buildMouth() {
    return sprite([230, 312, 694, 502], function (c) {
      c.lineJoin = 'round'; c.lineCap = 'round';
      c.fillStyle = '#3d3c46'; c.strokeStyle = '#3d3c46';
      c.lineWidth = 22; c.stroke(P.mouth);
      c.fillStyle = linGrad(c, 0, 340, 0, 460, [0, '#ffffff', 0.5, '#ece9fb', 1, '#c4bfe6']);
      c.fill(P.mouth);
      atop(c);
      innerEdge(c, P.mouth, 26, 8, 'rgba(110,90,170,.55)');
      line(c, 2, 'rgba(255,255,255,.85)', 7, 'M 300 392 C 400 404 520 392 612 352');
      /* линия улыбки */
      behind(c);
      c.globalCompositeOperation = 'source-over';
      c.strokeStyle = '#14131a'; c.lineWidth = 11;
      c.stroke(new Path2D(GEO.mouthLine));
      /* тень рта на кожу */
      behind(c);
      soft(c, 7, 'rgba(100,0,72,.5)', function (k) { k.translate(0, 10); k.lineWidth = 24; k.lineJoin = 'round'; k.fill(P.mouth); k.stroke(P.mouth); });
      c.globalCompositeOperation = 'source-over';
    });
  }

  /* --- пятно тени на земле --- */
  function buildShadow() {
    return sprite([-402, -84, 402, 84], function (c) {
      c.fillStyle = radGrad(c, 0, 0, 420, [0, 'rgba(255,90,190,.2)', 0.55, 'rgba(255,90,190,.07)', 1, 'rgba(255,90,190,0)']);
      c.save(); c.scale(1, 0.2); c.beginPath(); c.arc(0, 0, 420, 0, TAU); c.fill(); c.restore();
      c.fillStyle = radGrad(c, 0, 0, 330, [0, 'rgba(0,0,0,.78)', 0.6, 'rgba(0,0,0,.4)', 1, 'rgba(0,0,0,0)']);
      c.save(); c.scale(1, 0.15); c.beginPath(); c.arc(0, 0, 330, 0, TAU); c.fill(); c.restore();
    });
  }

  /* ==========================================================================
     Персонаж: сборка, анимация, цикл
     ========================================================================== */
  function create(container, opts) {
    opts = opts || {};
    var STUB = { start: noop, nudge: noop };
    if (!win.Path2D || !container) return STUB;

    var reduce = !!opts.reduce, lite = !!opts.lite;
    var cv = doc.createElement('canvas');
    var ctx = cv.getContext ? cv.getContext('2d') : null;
    if (!ctx) return STUB;
    container.appendChild(cv);

    var W = 0, K = 1;                       /* сторона канвы в px и px на условную единицу */
    var SP = null, gen = 0, built = false;
    var alive = true, started = false, visible = true, raf = 0;
    var slow = false;                       /* режим экономии: включается сам, если кадры долгие */
    var lot = { anim: null, ready: false }; /* оригинальная Lottie-анимация */

    /* ---------- размер канвы ---------- */
    function setSize(px) { K = px / VIEW; cv.width = px; cv.height = px; }
    function fit() {
      var cs = container.clientWidth || 0;
      if (cs < 40) return false;
      var dpr = Math.min(win.devicePixelRatio || 1, lite ? 1.25 : (opts.pointer ? 2 : 1.75));
      var px = Math.round(cs * dpr);
      if (px === W) return false;
      W = px;
      setSize(slow ? Math.round(px * 0.72) : px);
      return true;
    }

    /* ---------- сборка спрайтов (по одному за тик, чтобы не фризить страницу) ---------- */
    function makeJobs() {
      return [
        ['shadow', buildShadow], ['legR', buildLegR], ['body', buildBody], ['gloss', buildGloss], ['footL', buildFootL],
        ['eyeBL', function () { return buildEyeBase(EYE[0]); }], ['eyeBR', function () { return buildEyeBase(EYE[1]); }],
        ['eyeOL', function () { return buildEyeOver(EYE[0]); }], ['eyeOR', function () { return buildEyeOver(EYE[1]); }],
        ['pupL', function () { return buildPupil(EYE[0].pr); }], ['pupR', function () { return buildPupil(EYE[1].pr); }],
        ['mouth', buildMouth], ['heart', buildHeart], ['armL', buildArmL], ['armR', buildArmR],
        ['petal', buildPetal]
      ];
    }
    function buildAll(done) {
      var myGen = ++gen, jobs = makeJobs(), i = 0, out = {};
      P = {};
      for (var k in GEO) { if (Object.prototype.hasOwnProperty.call(GEO, k)) P[k] = new Path2D(GEO[k]); }
      P.petal = new Path2D(GEO.heart.replace(/-?\d+(\.\d+)?/g, function (n) { return String(Math.round(parseFloat(n) * 27) / 100); }));
      function one() {
        SS = W / VIEW;
        try { out[jobs[i][0]] = jobs[i][1](); } catch (e) { return false; }
        i++;
        return true;
      }
      function finish() { SP = out; built = true; done(); }
      function step() {
        if (myGen !== gen || !alive) return;
        if (!one()) return;
        if (i < jobs.length) setTimeout(step, 0); else finish();
      }
      if (reduce) { while (i < jobs.length) { if (!one()) return; } finish(); }
      else setTimeout(step, 0);
    }

    /* ---------- состояние анимации ---------- */
    var ringP = [new Path2D(), new Path2D()], innerP = [new Path2D(), new Path2D()], ei;
    for (ei = 0; ei < 2; ei++) {
      ringP[ei].ellipse(0, 0, EYE[ei].rx, EYE[ei].ry, 0, 0, TAU);
      innerP[ei].ellipse(0, 0, EYE[ei].ix, EYE[ei].iy, 0, 0, TAU);
    }
    var sway = new Spring(70, 9), bendS = new Spring(60, 7), bobS = new Spring(95, 11);
    var lagY = new Spring(170, 15), lagX = new Spring(130, 14), armS = new Spring(150, 13);
    var gz = [new Spring(300, 25), new Spring(300, 25), new Spring(300, 25), new Spring(300, 25)]; /* x,y левого; x,y правого */
    var headX = new Spring(60, 10), headY = new Spring(60, 10);

    var pointer = { x: 0, y: 0, t: -99, on: false };
    var wander = { x: -0.1, y: 0.05, next: 1 };
    var sacc = { x: 0, y: 0, next: 0.5 };
    var blinkAt = 2.2, blinks = [], petals = [];
    var act = null, nextAct = 5.5 + rand(0, 2.5), lastAct = -1;
    var hb = 0;                              /* фаза сердцебиения 0..1 */
    var tw = { t0: -9, next: 2.8 };           /* искра на блике сердца */
    var rect = null, rectT = -9;
    var bx = 0, by = 0;                      /* результат bodyMap */
    var B = { rot: 0, sx: 1, sy: 1, fy: 0, fx: 0, bend: 0 };   /* поза тела в этом кадре */
    var A = { y: 0, sy: 0, sx: 0, breath: 0, lid: 0, beat: 0, foot: 0, head: 0 }; /* вклад «шалости» */

    function warp(y) {
      var h = (BODY_PIV.y - y) / (BODY_PIV.y - 90);
      h = h < 0 ? 0 : h > 1 ? 1 : h;
      return B.bend * h * h;
    }
    /* точка эталонного пространства -> положение после движения тела (в bx, by) */
    function bodyMap(x, y) {
      var dx = x + warp(y) - BODY_PIV.x, dy = y - BODY_PIV.y;
      var cs = Math.cos(B.rot), sn = Math.sin(B.rot);
      bx = BODY_PIV.x + B.fx + (cs * B.sx * dx - sn * B.sy * dy);
      by = BODY_PIV.y + B.fy + (sn * B.sx * dx + cs * B.sy * dy);
    }
    /* матрица: поворот/масштаб вокруг (ax,ay), сдвиг (tx,ty) */
    function setM(ax, ay, tx, ty, rot, sx, sy) {
      var c = Math.cos(rot), s = Math.sin(rot);
      var a = c * sx, b = s * sx, cc = -s * sy, d = c * sy;
      var e = ax + tx - (a * ax + cc * ay), f = ay + ty - (b * ax + d * ay);
      ctx.setTransform(K * a, K * b, K * cc, K * d, K * (e + OX), K * (f + OY));
    }
    function img(sp) { ctx.drawImage(sp.cv, sp.x, sp.y, sp.w, sp.h); }

    /* «шалость» раз в 6–10 с: прыжок, вздох, сердечко-лепесток, ножки */
    function updateAct(t) {
      var u, q, f, l;
      A.y = A.sy = A.sx = A.breath = A.lid = A.beat = A.foot = A.head = 0;
      if (!act && t > nextAct) {
        var kind = Math.floor(rand(0, 4));
        if (kind === lastAct) kind = (kind + 1) % 4;
        lastAct = kind;
        act = { k: kind, t0: t, dur: [1.0, 2.8, 1.7, 1.5][kind] };
        if (kind === 2) petals.push({ t0: t + 0.1, ph: rand(0, TAU) });
        if (kind === 0) blinks.push(t + 0.62);
      }
      if (!act) return;
      u = (t - act.t0) / act.dur;
      if (u >= 1) { act = null; nextAct = t + rand(6, 10); return; }
      if (act.k === 0) {                         /* прыжок */
        if (u < 0.16) { q = ease(u / 0.16); A.sy = -0.05 * q; A.sx = 0.028 * q; }
        else if (u < 0.7) { f = (u - 0.16) / 0.54; A.y = -34 * 4 * f * (1 - f); A.sy = 0.038 * Math.sin(f * PI); A.sx = -0.016 * Math.sin(f * PI); }
        else { l = (u - 0.7) / 0.3; A.sy = -0.042 * Math.sin(l * PI) * (1 - l * 0.4); A.sx = 0.02 * Math.sin(l * PI); }
        A.head = -1.2 * Math.sin(u * PI);
      } else if (act.k === 1) {                  /* глубокий вздох */
        A.breath = u < 0.55 ? ease(u / 0.55) : 1 - ease((u - 0.55) / 0.45);
        A.lid = u > 0.5 ? 0.2 * Math.sin((u - 0.5) / 0.5 * PI) : 0;
        A.sy = u > 0.55 ? -0.012 * Math.sin((u - 0.55) / 0.45 * PI) : 0;
        A.head = -1.5 * A.breath;
        if (u > 0.9 && !act.blinked) { act.blinked = true; blinks.push(t); }
      } else if (act.k === 2) {                  /* сильный «тук» и сердечко */
        A.beat = 0.9 * bump(u / 0.4);
      } else {                                   /* ножки и наклон головы */
        A.foot = Math.sin(u * PI * 4) * Math.sin(u * PI);
        A.head = 1.5 * Math.sin(u * PI * 2);
      }
    }

    /* ---------- кадр ---------- */
    function frame(t, dt) {
      var i;
      updateAct(t);

      /* дыхание, парение, сердцебиение */
      var breath = Math.sin(t * 1.43) * 0.6 + Math.sin(t * 0.67 + 1.2) * 0.4;
      var fl = Math.sin(t * 1.05) * 0.62 + Math.sin(t * 0.61 + 0.7) * 0.38;
      var floatY = -9 - fl * 9;
      var hr = 1.25 + 0.08 * Math.sin(t * 0.21);
      hb += dt / hr; if (hb >= 1) hb -= 1;
      var tau = hb * hr;
      var beat = (bump(tau / 0.17) + 0.62 * bump((tau - 0.22) / 0.14)) * (1 + A.beat);
      var br = breath * (1 + A.breath * 1.5) + A.breath * 1.4;

      /* взгляд: курсор или «блуждание» */
      var usePtr = opts.pointer && pointer.on && (t - pointer.t) < 6;
      if (usePtr && (t - rectT > 0.12 || !rect)) { rect = cv.getBoundingClientRect(); rectT = t; }
      usePtr = usePtr && rect && rect.width > 0;
      if (!usePtr && t > wander.next) {
        var big = Math.random() < 0.4;
        wander.x = rand(big ? -1 : -0.5, big ? 0.5 : 0.7);
        wander.y = rand(-0.5, 0.45);
        wander.next = t + rand(1.1, 3.0);
      }
      if (t > sacc.next) { sacc.x = rand(-0.08, 0.08); sacc.y = rand(-0.06, 0.06); sacc.next = t + rand(0.5, 1.6); }
      var gxAvg = 0, gyAvg = 0;
      for (i = 0; i < 2; i++) {
        var gtx, gty;
        if (usePtr) {
          var k = rect.width / VIEW;
          var ex = rect.left + (EYE[i].x + OX) * k, ey = rect.top + (EYE[i].y + OY) * k;
          var dx = pointer.x - ex, dy = pointer.y - ey, dist = Math.sqrt(dx * dx + dy * dy) || 1;
          var amt = Math.min(1, dist / (rect.width * 0.42));
          gtx = dx / dist * amt; gty = dy / dist * amt;
        } else { gtx = wander.x; gty = wander.y; }
        gz[i * 2].t = clamp(gtx + sacc.x, -1, 1);
        gz[i * 2 + 1].t = clamp(gty + sacc.y, -1, 1);
        gxAvg += gz[i * 2].step(dt) * 0.5; gyAvg += gz[i * 2 + 1].step(dt) * 0.5;
      }
      headX.t = gxAvg * 6; headY.t = gyAvg * 4;
      var hX = headX.step(dt), hY = headY.step(dt);

      /* моргание: иногда двойное */
      if (t > blinkAt) {
        blinks.push(t);
        if (Math.random() < 0.2) blinks.push(t + 0.27);
        blinkAt = t + rand(2.0, 5.0);
      }
      var lid = 0;
      for (i = blinks.length - 1; i >= 0; i--) {
        var bu = (t - blinks[i]) / 0.21;
        if (bu >= 1) { blinks.splice(i, 1); continue; }
        if (bu > 0) {
          var cl = bu < 0.36 ? Math.sin(bu / 0.36 * PI / 2) : Math.cos((bu - 0.36) / 0.64 * PI / 2);
          if (cl > lid) lid = cl;
        }
      }
      lid = Math.min(1, lid + A.lid);

      /* пружины: тело, лицо и руки отстают друг от друга */
      bobS.t = floatY + A.y; var bodyY = bobS.step(dt);
      lagY.t = bodyY; var lagYv = lagY.step(dt) - bodyY;
      lagX.t = 0; var lagXv = lagX.step(dt);
      armS.t = bodyY; var armLag = armS.step(dt) - bodyY;
      sway.t = Math.sin(t * 0.86) * 0.5 + Math.sin(t * 0.47 + 2) * 0.35 + hX * 0.12 + A.head;
      var swayV = sway.step(dt);
      bendS.t = Math.sin(t * 1.2 + 0.4) * 1.2 + hX * 0.3;
      var bendV = clamp(bendS.step(dt), -16, 16);

      B.rot = swayV * PI / 180 * 0.8;
      B.sx = 1 - 0.006 * br + A.sx;
      B.sy = 1 + 0.011 * br + A.sy - 0.004 * beat;
      B.fy = bodyY; B.fx = 0;
      B.bend = (lite || slow) ? 0 : bendV + br * 1.4;

      /* ===== рисуем ===== */
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, cv.width, cv.height);

      /* тень на земле: сжимается, когда персонаж выше */
      var lift = clamp((-bodyY - 9) / 40, -0.4, 1.2), ss = 1 - lift * 0.14;
      setM(0, 0, 500, 1004, 0, ss, ss);
      ctx.globalAlpha = clamp(1 - lift * 0.35, 0.5, 1);
      if (!slow) img(SP.shadow);
      ctx.globalAlpha = 1;

      /* правая нога (за телом) и левая стопа (перед телом) */
      bodyMap(640, 770);
      setM(640, 770, bx - 640, by - 770, B.rot + A.foot * 0.03 + Math.sin(t * 0.9) * 0.008, 1, 1);
      img(SP.legR);
      drawBody();
      bodyMap(370, 170);
      setM(370, 170, bx - 370 + (-swayV * 1.6 + hX * 0.9), by - 170 + (-swayV * 0.3 + lagYv * 0.5 - br * 0.8), B.rot, B.sx, B.sy);
      img(SP.gloss);
      bodyMap(220, 860);
      setM(220, 860, bx - 220, by - 860, B.rot + Math.sin(t * 1.1 + 1) * 0.012 + A.foot * 0.05, 1, 1);
      img(SP.footL);

      /* лицо: чуть отстаёт от тела и поворачивается за взглядом */
      var fOffX = hX * 0.7 + lagXv * 0.5, fOffY = hY * 0.6 + lagYv * 0.9;
      var faceRot = (swayV * 0.35 + hX * 0.05) * PI / 180;
      for (i = 0; i < 2; i++) drawEye(i, fOffX, fOffY, faceRot, lid);

      bodyMap(460, 395);
      setM(460, 395, bx - 460 + fOffX, by - 395 + fOffY, B.rot + faceRot * 1.1, 1 + 0.008 * br, 1 + 0.02 * br + 0.01 * beat);
      img(SP.mouth);

      /* сердце: пульс «тук-тук» */
      bodyMap(HEART_AT.x, HEART_AT.y);
      var hs = 1 + 0.062 * beat;
      setM(0, 0, bx + lagXv * 0.2, by + armLag * 0.5 + 3 * beat, B.rot + HEART_AT.rot * PI / 180 + 0.01 * beat * Math.sin(t * 9), hs, hs * (1 - 0.01 * beat));
      img(SP.heart);
      if (t > tw.next) { tw.t0 = t; tw.next = t + rand(3.6, 6.4); }
      var tu = (t - tw.t0) / 0.7;
      if (tu >= 0 && tu < 1) sparkle(-124, -120, 30 * Math.sin(tu * PI), Math.sin(tu * PI));

      /* руки сжимаются в такт сердцу */
      var sq = beat * 3.2;
      bodyMap(252, 648);
      setM(252, 648, bx - 252 + sq * 0.8, by - 648 - armLag * 0.4 - sq * 0.6 - br * 1.2, B.rot - 0.004 * beat, 1 + 0.004 * beat, 1);
      img(SP.armL);
      bodyMap(714, 522);
      setM(714, 522, bx - 714 - sq * 0.9, by - 522 - armLag * 0.4 + sq * 0.3 - br * 1.2, B.rot + 0.004 * beat, 1 - 0.004 * beat, 1);
      img(SP.armR);

      /* сердечко-лепесток вылетает и растворяется */
      for (i = petals.length - 1; i >= 0; i--) {
        var p = petals[i], pu = (t - p.t0) / 3.2;
        if (pu >= 1) { petals.splice(i, 1); continue; }
        if (pu < 0) continue;
        var e1 = 1 - Math.pow(1 - pu, 2.2);
        var sc = (0.25 + 0.75 * ease(clamp(pu / 0.2, 0, 1))) * (1 + 0.15 * pu);
        ctx.globalAlpha = clamp(pu / 0.06, 0, 1) * (1 - ease(clamp((pu - 0.55) / 0.45, 0, 1)));
        bodyMap(590 + 150 * e1 + Math.sin(pu * 6.5 + p.ph) * 24 * pu, 455 - 330 * e1);
        setM(0, 0, bx, by, Math.sin(pu * 5 + p.ph) * 0.35, sc, sc);
        img(SP.petal);
      }
      ctx.globalAlpha = 1;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    }

    /* четырёхлучевая искра */
    function sparkle(x, y, L, a) {
      var w = L * 0.17;
      ctx.globalAlpha = a; ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.moveTo(x, y - L); ctx.quadraticCurveTo(x + w, y - w, x + L, y); ctx.quadraticCurveTo(x + w, y + w, x, y + L);
      ctx.quadraticCurveTo(x - w, y + w, x - L, y); ctx.quadraticCurveTo(x - w, y - w, x, y - L);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    function drawEye(i, fx, fy, faceRot, lid) {
      var e = EYE[i], g0 = gz[i * 2].x, g1 = gz[i * 2 + 1].x;
      bodyMap(e.x, e.y);
      setM(0, 0, bx + fx, by + fy, B.rot + faceRot + e.tilt * PI / 180, 1, 1);
      img(i ? SP.eyeBR : SP.eyeBL);
      /* зрачок внутри белка (в системе координат глаза) */
      var cr = Math.cos(-e.tilt * PI / 180), sr = Math.sin(-e.tilt * PI / 180);
      var ax = 0.95 * (e.ix - e.pr) + 12, ay = (e.iy - e.pr) + 8;
      var px = (g0 * cr - g1 * sr) * ax, py = (g0 * sr + g1 * cr) * ay - 2;
      var n = Math.sqrt(px * px / (ax * ax) + py * py / (ay * ay));
      if (n > 1) { px /= n; py /= n; }
      ctx.save();
      ctx.clip(innerP[i]);
      var ps = i ? SP.pupR : SP.pupL, oo = i ? SP.eyeOR : SP.eyeOL;
      ctx.drawImage(ps.cv, ps.x + px, ps.y + py, ps.w, ps.h);
      ctx.drawImage(oo.cv, oo.x, oo.y, oo.w, oo.h);
      ctx.restore();
      if (lid > 0.015) drawLid(e, lid, ringP[i]);
    }

    /* тело рисуется полосами со сдвигом: верх мягко «гнётся» (кусочно-линейный изгиб) */
    function drawBody() {
      var sp = SP.body;
      var N = (lite || slow) ? 1 : 6;
      setM(BODY_PIV.x, BODY_PIV.y, B.fx, B.fy, B.rot, B.sx, B.sy);
      if (N === 1 || Math.abs(B.bend) < 0.05) { img(sp); return; }
      var rows = sp.cv.height, sh = Math.ceil(rows / N), y0, hh, u0, u1, w0, w1, sl;
      for (var i = 0; i < N; i++) {
        y0 = i * sh;
        if (y0 >= rows) break;
        hh = Math.min(sh + 2, rows - y0);
        u0 = sp.y + y0 / sp.s; u1 = sp.y + (y0 + sh) / sp.s;
        w0 = warp(u0); w1 = warp(u1);
        sl = (w1 - w0) / (u1 - u0);
        ctx.save();
        ctx.transform(1, 0, sl, 1, w0 - sl * u0, 0);
        ctx.drawImage(sp.cv, 0, y0, sp.cv.width, hh, sp.x, u0, sp.w, hh / sp.s);
        ctx.restore();
      }
    }

    /* веко: кожа-латекс закрывает глаз сверху вниз */
    function drawLid(e, cl, ring) {
      var rx = e.rx, ry = e.ry;
      ctx.save();
      ctx.clip(ring);
      var y0 = -ry - 4 + cl * (2 * ry + 12);
      var sag = 16 * Math.sin(cl * PI) + 4;
      var g = ctx.createRadialGradient(-rx * 0.25, -ry * 0.6, 4, 0, 0, rx * 1.15);
      g.addColorStop(0, '#ffb6ec'); g.addColorStop(0.55, '#ff8ad8'); g.addColorStop(1, '#ff58c4');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(-rx - 8, -ry - 8); ctx.lineTo(rx + 8, -ry - 8); ctx.lineTo(rx + 8, y0 - sag * 0.2);
      ctx.quadraticCurveTo(0, y0 + sag * 1.7, -rx - 8, y0 - sag * 0.2);
      ctx.closePath();
      ctx.fill();
      /* край века чуть темнее: выпуклость, а не наклейка */
      ctx.lineWidth = 18; ctx.strokeStyle = 'rgba(170,12,124,.4)';
      ctx.stroke(ring);
      ctx.lineWidth = 6; ctx.lineCap = 'round'; ctx.strokeStyle = 'rgba(163,15,116,.75)';
      ctx.beginPath();
      ctx.moveTo(-rx - 8, y0 - sag * 0.2); ctx.quadraticCurveTo(0, y0 + sag * 1.7, rx + 8, y0 - sag * 0.2);
      ctx.stroke();
      if (cl > 0.5) {
        ctx.globalAlpha = clamp((cl - 0.5) / 0.4, 0, 1);
        ctx.fillStyle = 'rgba(255,244,253,.55)';
        ctx.beginPath(); ctx.ellipse(-rx * 0.34, -ry * 0.52, rx * 0.32, ry * 0.1, -0.25, 0, TAU); ctx.fill();
      }
      if (cl > 0.8) {
        ctx.globalAlpha = (cl - 0.8) / 0.2;
        ctx.lineWidth = 9; ctx.strokeStyle = '#3d3c46';
        ctx.beginPath(); ctx.moveTo(-rx * 0.82, ry * 0.06); ctx.quadraticCurveTo(0, ry * 0.78, rx * 0.82, ry * 0.06); ctx.stroke();
        ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(255,190,236,.6)';
        ctx.beginPath(); ctx.moveTo(-rx * 0.8, ry * 0.2); ctx.quadraticCurveTo(0, ry * 0.92, rx * 0.8, ry * 0.2); ctx.stroke();
      }
      ctx.restore();
    }

    /* ---------- цикл ---------- */
    var simT = 0, lastT = 0, lastRaf = 0, lastDraw = 0, gov = { n: 0, bad: 0 };
    function run() { return alive && started && visible && !doc.hidden && !reduce && !lot.ready; }
    function tick(now) {
      raf = 0;
      if (!run()) return;
      raf = win.requestAnimationFrame(tick);
      var dRaf = lastRaf ? now - lastRaf : 16.7;
      lastRaf = now;
      if (!built) { lastT = now; return; }
      /* следим за плавностью: если кадры стабильно долгие — переходим в экономный режим (без изгиба, 30 к/с) */
      if (!slow && !lite && simT > 4 && dRaf < 250) {
        gov.n++;
        if (dRaf > 24) gov.bad++;
        if (gov.n >= 90) { if (gov.bad > 54) { slow = true; if (W) setSize(Math.round(W * 0.72)); } gov.n = 0; gov.bad = 0; }
      }
      if ((lite || slow) && now - lastDraw < 29) return;
      var dt = lastT ? (now - lastT) / 1000 : 0.016;
      lastT = now; lastDraw = now;
      dt = Math.min(dt, 0.05);
      simT += dt;
      frame(simT, dt);
    }
    function sync() {
      if (run()) { if (!raf) { lastT = 0; lastRaf = 0; raf = win.requestAnimationFrame(tick); } }
      else if (raf) { win.cancelAnimationFrame(raf); raf = 0; }
      if (lot.anim) { try { if (visible && !doc.hidden && !reduce) lot.anim.play(); else lot.anim.pause(); } catch (e1) { /* игнор */ } }
    }

    /* статичный кадр (reduce): нейтральная поза */
    function staticFrame() {
      if (!built) return;
      blinks = []; blinkAt = 1e9; nextAct = 1e9; petals = []; sacc.next = 1e9; wander.next = 1e9;
      var i;
      for (i = 0; i < 4; i++) { gz[i].x = 0; gz[i].t = 0; }
      gz[0].x = gz[2].x = -0.1; gz[1].x = gz[3].x = 0.04;
      wander.x = -0.1; wander.y = 0.04;
      frame(0.62, 0.016);
    }

    /* ---------- Lottie: оригинальная анимация владельца подменяет рисунок ----------
       JSON сначала читаем сами и проверяем: битый файл или 404 тихо оставляют наш рисунок. */
    function loadLottie(src) {
      if (!win.fetch) return;
      function attach(data) {
        var L = win.lottie;
        if (!alive || !L || typeof L.loadAnimation !== 'function') return;
        var host = doc.createElement('div');
        host.style.position = 'absolute'; host.style.left = '0'; host.style.top = '0';
        host.style.width = '100%'; host.style.height = '100%';
        host.style.opacity = '0'; host.style.pointerEvents = 'none';
        host.style.transition = 'opacity .8s ease';
        container.appendChild(host);
        var anim = null, shown = false, timer = 0;
        /* сбой внутри lottie (в том числе позже, при отрисовке): возвращаем свой рисунок */
        function onErr(ev) {
          if (ev && typeof ev.filename === 'string' && ev.filename.indexOf('lottie.canvas') !== -1) {
            try { ev.preventDefault(); } catch (e0) { /* игнор */ }
            drop();
          }
        }
        function drop() {
          win.removeEventListener('error', onErr);
          clearTimeout(timer);
          if (lot.anim === anim) lot.anim = null;
          try { if (anim) anim.destroy(); } catch (e1) { /* игнор */ }
          if (host.parentNode) host.parentNode.removeChild(host);
          if (lot.ready || shown) { lot.ready = false; cv.style.opacity = '1'; sync(); }
        }
        win.addEventListener('error', onErr);
        try {
          anim = L.loadAnimation({
            container: host, renderer: 'canvas', loop: !reduce, autoplay: !reduce, animationData: data,
            rendererSettings: { preserveAspectRatio: 'xMidYMid meet', clearCanvas: true }
          });
        } catch (e2) { drop(); return; }
        if (!anim) { drop(); return; }
        lot.anim = anim;
        anim.addEventListener('DOMLoaded', function () {
          if (shown || !alive) return;
          shown = true;
          if (reduce) { try { anim.goToAndStop(0, true); } catch (e3) { /* игнор */ } }
          /* кроссфейд: рисунок гаснет, Lottie проявляется; потом наш цикл останавливается */
          cv.style.transition = 'opacity .8s ease';
          host.style.opacity = '1';
          cv.style.opacity = '0';
          timer = setTimeout(function () { lot.ready = true; sync(); }, 900);
        });
        anim.addEventListener('data_failed', drop);
      }
      function withLib(cb) {
        if (win.lottie) { cb(); return; }
        try {
          var sc = doc.createElement('script');
          sc.src = 'assets/js/lottie.canvas.min.js';
          sc.async = true;
          sc.onload = cb;
          sc.onerror = noop;
          doc.head.appendChild(sc);
        } catch (e4) { /* игнор */ }
      }
      win.fetch(src, { credentials: 'same-origin' })
        .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
        .then(function (d) {
          var ok = d && typeof d === 'object' && Array.isArray(d.layers) && d.layers.length > 0 && d.w > 0 && d.h > 0 && d.op > d.ip;
          if (ok && alive) withLib(function () { try { attach(d); } catch (e5) { /* игнор */ } });
        })
        .catch(noop);
    }

    /* ---------- запуск ---------- */
    function onPointer(e) { pointer.x = e.clientX; pointer.y = e.clientY; pointer.t = simT; pointer.on = true; }
    function onLeave() { pointer.on = false; }
    var resizeTimer = 0;
    function onResize() {
      if (!alive) return;
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () {
        if (fit() && !lot.ready) buildAll(function () { if (reduce) staticFrame(); });
      }, 160);
    }

    return {
      start: function () {
        if (started) return;
        started = true;
        fit();
        if (W) buildAll(function () { if (reduce) staticFrame(); });
        if (opts.pointer && !reduce) {
          win.addEventListener('pointermove', onPointer, { passive: true });
          doc.documentElement.addEventListener('mouseleave', onLeave);
        }
        if ('ResizeObserver' in win) {
          try { new win.ResizeObserver(onResize).observe(container); } catch (e6) { win.addEventListener('resize', onResize); }
        } else win.addEventListener('resize', onResize);
        if ('IntersectionObserver' in win) {
          try {
            new win.IntersectionObserver(function (es) { visible = !!es[es.length - 1].isIntersecting; sync(); }, { threshold: 0 }).observe(container);
          } catch (e7) { /* игнор */ }
        }
        doc.addEventListener('visibilitychange', sync);
        sync();
        if (opts.src) loadLottie(opts.src);
      },
      nudge: function (v) {
        if (reduce || !started || !built) return;
        v = clamp(+v || 0, -0.35, 0.35);
        sway.v += v * 120;
        bendS.v += -v * 420;
        bobS.v += -Math.abs(v) * 90;
      }
    };
  }

  FX.pepe = { create: create };
})();
