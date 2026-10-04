/* ==========================================================================
   Plush Pepe «Pink Latex» — герой первого экрана.

   Основа — ОРИГИНАЛЬНАЯ Lottie-анимация (opts.src): все 28 родных слоёв, дыхание, объятие сердца.
   Кадром управляем сами: один общий rAF-цикл на модуль, время считается честно, а нагрузка
   подстраивается под устройство (30 к/с и/или меньшее разрешение, если кадры долгие).
   «3D»: перспективный наклон всего холста (пружины с dt), парение, дыхание масштаба, параллакс тени.
   «Воздушный поцелуй»: глянцевое сердце-пузырь вылетает изо рта, в нём печатается текст и ссылка на бота.
   Запасной вариант (тихо, без ошибок): нарисованный кодом Pepe на canvas 2D — только если Lottie не загрузился.

   Контракт: window.NTFX.pepe.create(container, opts) -> { start(), nudge(v) }
   ========================================================================== */
(function () {
  'use strict';

  var win = window, doc = document;
  var FX = win.NTFX = win.NTFX || {};

  var PI = Math.PI, TAU = PI * 2;
  var VIEW = 1180;          /* запасной рисунок: сторона сцены в условных единицах */
  var OX = 54, OY = 36;     /* запасной рисунок: сдвиг эталонных координат внутрь сцены */

  /* ---------- Мелкие утилиты ---------- */
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function rand(a, b) { return a + Math.random() * (b - a); }
  function ease(u) { return u * u * (3 - 2 * u); }
  function noop() {}
  function now() { return win.performance && win.performance.now ? win.performance.now() : Date.now(); }
  function fx(n, d) { return n.toFixed(d); }

  /* пружина с лёгким перелётом (полунеявный шаг с подшагами) */
  function Spring(k, d) { this.x = 0; this.v = 0; this.t = 0; this.k = k; this.d = d; }
  Spring.prototype.step = function (dt) {
    var n = Math.max(1, Math.ceil(dt / 0.008)), h = dt / n;
    for (var i = 0; i < n; i++) {
      this.v += (this.k * (this.t - this.x) - this.d * this.v) * h;
      this.x += this.v * h;
    }
    return this.x;
  };

  /* критически демпфированная пружина: точное решение, без перелёта и дрожания, любой dt */
  function Crit(w) { this.x = 0; this.v = 0; this.t = 0; this.w = w; }
  Crit.prototype.step = function (dt) {
    var w = this.w, e = Math.exp(-w * dt), d = this.x - this.t, j = this.v + w * d;
    this.x = this.t + (d + j * dt) * e;
    this.v = (this.v - w * j * dt) * e;
    return this.x;
  };

  /* форма удара сердца: быстрый подъём, мягкий спад (u в 0..1) */
  function bump(u) {
    if (u <= 0 || u >= 1) return 0;
    if (u < 0.28) return 0.5 - 0.5 * Math.cos(PI * u / 0.28);
    return 0.5 + 0.5 * Math.cos(PI * (u - 0.28) / 0.72);
  }

  /* ==========================================================================
     ЗАПАСНОЙ РИСУНОК (используется только если оригинальная анимация не загрузилась)
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

  /* --------------------------------------------------------------------------
     Запасной Pepe: холст 2D внутри «рига» (host). Свой цикл не заводит — кадры даёт общий rAF.
     -------------------------------------------------------------------------- */
  function makeVector(opts, host, ptr) {
    if (!win.Path2D) return null;
    var reduce = !!opts.reduce, lite = !!opts.lite;
    var cv = doc.createElement('canvas');
    var ctx = cv.getContext ? cv.getContext('2d') : null;
    if (!ctx) return null;
    var cvs = cv.style;
    cvs.position = 'absolute'; cvs.left = '0'; cvs.top = '0'; cvs.width = '100%'; cvs.height = '100%'; cvs.display = 'block'; cvs.pointerEvents = 'none';
    host.appendChild(cv);

    var W = 0, K = 1;                       /* сторона канвы в px и px на условную единицу */
    var SP = null, gen = 0, built = false;
    var alive = true;
    var slow = false;                       /* режим экономии: включается сам, если кадры долгие */
    var wall = 0;                           /* время rAF, с */

    /* ---------- размер канвы ---------- */
    function setSize(px) { K = px / VIEW; cv.width = px; cv.height = px; }
    function fit() {
      var cs = host.clientWidth || 0;
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
      var usePtr = opts.pointer && ptr.on && (wall - ptr.t) < 6;
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
          var dx = ptr.x - ex, dy = ptr.y - ey, dist = Math.sqrt(dx * dx + dy * dy) || 1;
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

    /* ---------- цикл (вызывается общим rAF) ---------- */
    var simT = 0, lastT = 0, lastRaf = 0, lastDraw = 0, gov = { n: 0, bad: 0 };
    function step(now) {
      wall = now / 1000;
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

    return {
      cv: cv,
      build: function (done) {
        fit();
        if (!W) { done(false); return; }
        buildAll(function () { if (reduce) staticFrame(); done(true); });
      },
      resize: function () { if (fit()) buildAll(function () { if (reduce) staticFrame(); }); },
      step: step,
      reset: function () { lastT = 0; lastRaf = 0; },
      nudge: function (v) {
        if (reduce || !built) return;
        sway.v += v * 120;
        bendS.v += -v * 420;
        bobS.v += -Math.abs(v) * 90;
      }
    };
  }

  /* ==========================================================================
     ВОЗДУШНЫЙ ПОЦЕЛУЙ: глянцевое сердце-пузырь, в нём «печатается» текст; сердце — ссылка на бота.
     Обычный DOM/SVG: стили только через CSSOM, текст только через textContent.
     ========================================================================== */
  var NS = 'http://www.w3.org/2000/svg';
  var kissUid = 0;
  var HEART_D = 'M100 172 C96 168 8 112 8 58 C8 26 31 6 59 6 C78 6 93 17 100 33 C107 17 122 6 141 6 C169 6 192 26 192 58 C192 112 104 168 100 172 Z';
  var INK = '#1d0a13', RIM = '#3a0c25';
  var KFONT = 'Geologica, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

  function svgEl(tag, attrs, parent) {
    var e = doc.createElementNS(NS, tag);
    for (var k in attrs) { if (Object.prototype.hasOwnProperty.call(attrs, k)) e.setAttribute(k, attrs[k]); }
    if (parent) parent.appendChild(e);
    return e;
  }
  function easeOutBack(u) { var c1 = 1.15, c3 = c1 + 1, v = u - 1; return 1 + c3 * v * v * v + c1 * v * v; }

  /* env: { lay: {cw,ch,mx,my,narrow}, rect(): DOMRect, reduce, lite } */
  function makeKiss(cfg, parent, env) {
    var url = cfg && typeof cfg.url === 'string' ? cfg.url : '';
    var handle = cfg && typeof cfg.handle === 'string' ? cfg.handle.replace(/^@/, '') : '';
    var title = cfg && typeof cfg.title === 'string' ? cfg.title.replace(/\s+/g, ' ').trim().slice(0, 40) : '';
    if (!/^https:\/\/t\.me\/[A-Za-z0-9_]{3,64}$/.test(url) || !/^[A-Za-z0-9_]{3,64}$/.test(handle)) return null;
    var lay = env.lay, reduce = !!env.reduce, lite = !!env.lite;
    var full2 = '@' + handle;

    /* ---------- разметка ---------- */
    var layer = doc.createElement('div');
    var ls = layer.style;
    ls.position = 'absolute'; ls.left = '0'; ls.top = '0'; ls.width = '100%'; ls.height = '100%';
    ls.pointerEvents = 'none'; ls.zIndex = '3'; ls.overflow = 'visible';
    layer.setAttribute('data-kiss', '');

    var link = doc.createElement('a');
    link.href = url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.setAttribute('aria-label', 'Открыть @' + handle + ' в Telegram');
    layer.appendChild(link);
    var as = link.style;
    as.position = 'absolute'; as.left = '0'; as.top = '0'; as.display = 'block';
    as.pointerEvents = 'none'; as.cursor = 'pointer'; as.visibility = 'hidden'; as.opacity = '0';
    as.webkitTapHighlightColor = 'transparent'; as.outline = 'none'; as.textDecoration = 'none';
    as.transformOrigin = '50% 52%';

    var sv = svgEl('svg', { viewBox: '0 0 200 184', width: '100%', height: '100%', 'aria-hidden': 'true' }, link);
    sv.style.display = 'block'; sv.style.overflow = 'visible';
    /* мягкая тень под сердцем: несколько тёмных копий (без размытия) — отделяет его от пёстрого фона */
    var hc = 'translate(100 94) scale(S) translate(-100 -92)', hi;
    var HALO = [[1.16, 0.06], [1.1, 0.08], [1.05, 0.1]];
    for (hi = 0; hi < HALO.length; hi++) {
      svgEl('path', { d: HEART_D, fill: '#12040b', 'fill-opacity': String(HALO[hi][1]), transform: hc.replace('S', String(HALO[hi][0])) }, sv);
    }
    /* объём: тёмный низ -> средний тон -> свет сверху-слева (чёткие края, без свечения) */
    var gid = 'pkg' + (++kissUid);
    var defs = svgEl('defs', {}, sv);
    var rg = svgEl('radialGradient', { id: gid, cx: '.34', cy: '.26', r: '.92' }, defs);
    svgEl('stop', { offset: '0', 'stop-color': '#ffbfd5' }, rg);
    svgEl('stop', { offset: '.5', 'stop-color': '#f7a8c5' }, rg);
    svgEl('stop', { offset: '1', 'stop-color': '#ec88ac' }, rg);
    svgEl('path', { d: HEART_D, fill: 'url(#' + gid + ')', stroke: RIM, 'stroke-width': '3.6', 'stroke-linejoin': 'round' }, sv);
    /* блики: крупный глянцевый, малый, точка и отражённый свет по нижнему краю */
    svgEl('ellipse', { cx: '40', cy: '31', rx: '17', ry: '8.2', transform: 'rotate(-36 40 31)', fill: '#fff', 'fill-opacity': '.28' }, sv);
    svgEl('circle', { cx: '22.5', cy: '53', r: '3.3', fill: '#fff', 'fill-opacity': '.25' }, sv);
    svgEl('ellipse', { cx: '150', cy: '24', rx: '9.5', ry: '3.4', transform: 'rotate(-20 150 24)', fill: '#fff', 'fill-opacity': '.15' }, sv);
    svgEl('path', { d: 'M178 70 C174 100 142 134 110 154', fill: 'none', stroke: '#ffd3e3', 'stroke-width': '3', 'stroke-linecap': 'round', 'stroke-opacity': '.2' }, sv);
    svgEl('path', { d: HEART_D, fill: 'none', stroke: RIM, 'stroke-width': '3.6', 'stroke-linejoin': 'round' }, sv);

    function mkText(wt) {
      var t = svgEl('text', { x: '0', y: '0', fill: INK, 'font-family': KFONT, 'font-weight': wt, 'font-size': '12', 'text-anchor': 'start' }, sv);
      t.setAttribute('text-rendering', 'geometricPrecision');
      return t;
    }
    var tx1 = mkText('600'), tx2 = mkText('700');
    var caret = svgEl('rect', { x: '0', y: '0', width: '1.7', height: '12', rx: '.8', fill: INK }, sv);
    caret.style.opacity = '0';

    /* мелкие сердечки: след в полёте и разлёт при лопании (пул создаётся один раз) */
    var PCOL = ['#ff9fc4', '#f4b6cb', '#ff86b2', '#ffc7da'];
    var NP = lite ? 6 : 9, pool = [], pi;
    for (pi = 0; pi < NP; pi++) {
      var pe = doc.createElement('div');
      var ps = pe.style;
      ps.position = 'absolute'; ps.left = '0'; ps.top = '0'; ps.width = '26px'; ps.height = '24px';
      ps.pointerEvents = 'none'; ps.visibility = 'hidden'; ps.opacity = '0';
      var psv = svgEl('svg', { viewBox: '0 0 200 184', width: '100%', height: '100%', 'aria-hidden': 'true' }, pe);
      psv.style.display = 'block'; psv.style.overflow = 'visible';
      svgEl('path', { d: HEART_D, fill: PCOL[pi % PCOL.length], stroke: RIM, 'stroke-width': '10', 'stroke-linejoin': 'round' }, psv);
      svgEl('ellipse', { cx: '50', cy: '40', rx: '24', ry: '11', transform: 'rotate(-36 50 40)', fill: '#fff', 'fill-opacity': '.85' }, psv);
      layer.insertBefore(pe, link);
      pool.push({ el: pe, on: false, x: 0, y: 0, vx: 0, vy: 0, r: 0, vr: 0, age: 0, life: 1, s: 1, kind: 0 });
    }
    parent.appendChild(layer);

    /* ---------- измерение текста (canvas, не зависит от раскладки) ---------- */
    var mc = null;
    try { var mcv = doc.createElement('canvas'); mc = mcv.getContext ? mcv.getContext('2d') : null; } catch (e0) { mc = null; }
    function tw(str, px, wt) {
      if (!str) return 0;
      if (mc) { mc.font = wt + ' ' + px + 'px ' + KFONT; return mc.measureText(str).width; }
      return str.length * px * 0.6;
    }
    function fontsReady() {
      try { return !doc.fonts || !doc.fonts.check || (doc.fonts.check('700 16px Geologica', full2 + title) && doc.fonts.check('600 16px Geologica', title)); } catch (e1) { return true; }
    }

    /* ---------- план: размер сердца и текста под длину ---------- */
    var plan = null;
    function makePlan() {
      var narrow = lay.narrow;
      var base = narrow ? 132 : 146;
      var minPx = narrow ? 10.5 : 10.5;
      var wmax = Math.min(narrow ? 170 : 184, lay.cw * 0.5);
      var per2 = tw(full2, 100, 700) / 100;
      var per1 = title ? tw(title, 100, 600) / 100 : 0;
      var f2 = Math.min(148 / per2, 21);
      var W = base;
      var need = minPx * 200 / f2;
      if (need > W) W = Math.min(need, wmax);
      var f1 = title ? Math.min(148 / per1, f2 * 0.88, 18) : 0;
      var y1 = 0, y2;
      if (title) {
        var blk = f1 * 0.72 + 14 + f2 * 0.72, top = 67 - blk / 2;
        y1 = top + f1 * 0.72; y2 = y1 + 14 + f2 * 0.72;
      } else { y2 = 76; }
      var w1 = tw(title, f1, 600), w2 = tw(full2, f2, 700);
      var x1 = 100 - w1 / 2, x2 = 100 - w2 / 2;
      var cum1 = [0], cum2 = [0], i;
      for (i = 1; i <= title.length; i++) cum1.push(tw(title.slice(0, i), f1, 600));
      for (i = 1; i <= full2.length; i++) cum2.push(tw(full2.slice(0, i), f2, 700));
      plan = { W: W, H: W * 0.92, f1: f1, f2: f2, y1: y1, y2: y2, x1: x1, x2: x2, cum1: cum1, cum2: cum2 };
      tx1.setAttribute('font-size', fx(f1, 2)); tx1.setAttribute('x', fx(x1, 2)); tx1.setAttribute('y', fx(y1, 2));
      tx2.setAttribute('font-size', fx(f2, 2)); tx2.setAttribute('x', fx(x2, 2)); tx2.setAttribute('y', fx(y2, 2));
      as.width = fx(plan.W, 1) + 'px'; as.height = fx(plan.H, 1) + 'px';
    }
    function caretAt(line, n) {
      if (!plan) return;
      var f = line === 1 ? plan.f1 : plan.f2;
      var x = (line === 1 ? plan.x1 + plan.cum1[n] : plan.x2 + plan.cum2[n]) + 1.2;
      var y = line === 1 ? plan.y1 : plan.y2;
      caret.setAttribute('x', fx(x, 2));
      caret.setAttribute('y', fx(y - f * 0.8, 2));
      caret.setAttribute('height', fx(f * 1.0, 2));
    }

    /* ---------- траектории ---------- */
    var VARS_W = [
      { fx: 0.97, fy: 0.12, cx: 0.92, cy: 0.40 },
      { fx: 0.94, fy: 0.16, cx: 0.66, cy: 0.12 },
      { fx: 0.99, fy: 0.10, cx: 0.98, cy: 0.30 }
    ];
    var VARS_N = [
      { fx: 0.80, fy: 0.14, cx: 0.86, cy: 0.42 },
      { fx: 0.78, fy: 0.16, cx: 0.60, cy: 0.10 },
      { fx: 0.82, fy: 0.12, cx: 0.92, cy: 0.26 }
    ];
    var lastVar = -1, vr = null;
    var P0 = { x: 0, y: 0 }, P1 = { x: 0, y: 0 }, P2 = { x: 0, y: 0 };

    /* точки пути в px относительно сцены; конечную точку не выпускаем за экран */
    function aimPath() {
      var V = vr, W = plan.W, H = plan.H, cw = lay.cw, ch = lay.ch;
      var fxp = V.fx * cw, fyp = V.fy * ch;
      var r = env.rect(), vw = doc.documentElement.clientWidth || win.innerWidth || 0;
      if (r && vw) {
        var minX = 10 - r.left + W / 2, maxX = vw - 10 - r.left - W / 2;
        if (maxX > minX) fxp = clamp(fxp, minX, maxX);
        var minY = 8 - r.top + H / 2;
        if (r.top > 0 && r.top < win.innerHeight) fyp = Math.max(fyp, minY);
      }
      P0.x = lay.mx; P0.y = lay.my;
      P2.x = fxp; P2.y = fyp;
      P1.x = V.cx * cw; P1.y = V.cy * ch;
      if (r && vw) P1.x = clamp(P1.x, 10 - r.left + W * 0.25, vw - 10 - r.left - W * 0.25);
    }

    /* ---------- состояние ---------- */
    var phase = 0;                    /* 0 пауза, 1 подача, 2 живое сердце, 3 лопнуло */
    var t0 = 0, nextAt = 3.2, tries = 0;
    var typeT0 = -1, due1 = [], due2 = [], n1 = 0, n2 = 0, typeEnd = -1, lastKey = 0;
    var holdLeft = 3.5, popT = 0, hover = false, held = false, hv = 0;
    var hx = 0, hy = 0, hr = 0, hs = 0, ho = 0;   /* текущее положение сердца */
    var trailT = 0;
    var pose = { rx: 0, ry: 0, rz: 0, sq: 0 };

    link.addEventListener('pointerenter', function () { hover = true; });
    link.addEventListener('pointerleave', function () { hover = false; });
    link.addEventListener('focus', function () { hover = true; });
    link.addEventListener('blur', function () { hover = false; });
    link.addEventListener('pointerdown', function () { held = true; });
    function release() { held = false; }
    link.addEventListener('pointerup', release);
    link.addEventListener('pointercancel', release);

    function showHeart(on) {
      as.visibility = on ? 'visible' : 'hidden';
      as.pointerEvents = on ? 'auto' : 'none';
      if (!on) { as.opacity = '0'; caret.style.opacity = '0'; }
    }
    function placeHeart(x, y, rot, s, o) {
      as.opacity = fx(o, 3);
      as.transform = 'translate3d(' + fx(x - plan.W / 2, 2) + 'px,' + fx(y - plan.H / 2, 2) + 'px,0) rotate(' + fx(rot, 2) + 'deg) scale(' + fx(s, 4) + ')';
    }
    function setPart(p, x, y, rot, s, o) {
      var q = p.el.style;
      q.opacity = fx(o, 3);
      q.transform = 'translate3d(' + fx(x - 13, 1) + 'px,' + fx(y - 12, 1) + 'px,0) rotate(' + fx(rot, 1) + 'deg) scale(' + fx(s, 3) + ')';
    }
    function partOn(p, on) { p.on = on; p.el.style.visibility = on ? 'visible' : 'hidden'; if (!on) p.el.style.opacity = '0'; }
    function freePart(kind) {
      for (var i = 0; i < pool.length; i++) { if (!pool[i].on) { pool[i].kind = kind; return pool[i]; } }
      return null;
    }

    function begin(t) {
      /* шрифт ещё грузится — чуть подождём, чтобы измерение текста было точным */
      if (!fontsReady() && tries < 6) { tries++; nextAt = t + 0.35; return; }
      try { makePlan(); } catch (e3) { nextAt = t + 6; return; }
      var k = Math.floor(rand(0, 3));
      if (k === lastVar) k = (k + 1 + Math.floor(rand(0, 2))) % 3;
      lastVar = k;
      vr = (lay.narrow ? VARS_N : VARS_W)[k];
      phase = 1; t0 = t; tries = 0;
      typeT0 = -1; n1 = 0; n2 = 0; typeEnd = -1; hover = false; held = false; hv = 0; holdLeft = 3.5; trailT = 0;
      tx1.textContent = ''; tx2.textContent = ''; caret.style.opacity = '0';
      /* расписание печати: 35–60 мс на символ, пауза между строками */
      var acc = 0, i;
      due1.length = 0; due2.length = 0;
      for (i = 0; i < title.length; i++) { acc += rand(0.035, 0.06) + (title.charAt(i) === ' ' ? 0.045 : 0); due1.push(acc); }
      if (title.length) acc += 0.28;
      for (i = 0; i < full2.length; i++) { acc += rand(0.035, 0.06) + (i === 0 ? 0.05 : 0); due2.push(acc); }
      typeEnd = acc;
    }

    function pop(t) {
      phase = 3; popT = t;
      as.pointerEvents = 'none';
      caret.style.opacity = '0';
      var i, p, ang, sp, k = plan.W / 200, cnt = Math.min(NP, lite ? 6 : 9);
      for (i = 0; i < cnt; i++) {
        p = freePart(1); if (!p) break;
        ang = (i / cnt) * TAU + rand(-0.35, 0.35);
        sp = rand(120, 230) * (plan.W / 200);
        p.x = hx + Math.cos(ang) * plan.W * 0.18; p.y = hy + Math.sin(ang) * plan.W * 0.16;
        p.vx = Math.cos(ang) * sp; p.vy = Math.sin(ang) * sp - 40 * k;
        p.r = rand(-30, 30); p.vr = rand(-140, 140);
        p.age = 0; p.life = rand(0.85, 1.25); p.s = rand(0.7, 1.15) * (plan.W / 200) * 1.05;
        partOn(p, true);
        setPart(p, p.x, p.y, p.r, p.s, 1);
      }
    }

    function stepParts(dt) {
      var i, p, u, d = Math.exp(-2.4 * dt);
      for (i = 0; i < pool.length; i++) {
        p = pool[i];
        if (!p.on) continue;
        p.age += dt; u = p.age / p.life;
        if (u >= 1) { partOn(p, false); continue; }
        if (p.kind === 1) {
          p.vx *= d; p.vy = p.vy * d - 16 * dt;
          p.x += p.vx * dt; p.y += p.vy * dt; p.r += p.vr * dt;
          setPart(p, p.x, p.y, p.r, p.s * (1 - 0.55 * ease(u)), 1 - ease(clamp((u - 0.35) / 0.65, 0, 1)));
        } else {
          p.x += p.vx * dt; p.y += p.vy * dt; p.r += p.vr * dt;
          setPart(p, p.x, p.y, p.r, p.s * (1 - u) * 0.9, 0.85 * (1 - u));
        }
      }
    }

    /* позиция на квадратичной кривой */
    function bez(s, a, b, c) { var q = 1 - s; return q * q * a + 2 * q * s * b + s * s * c; }

    function step(t, dt) {
      var kt, u, s, i, p;
      if (phase === 0) {
        pose.rx = pose.ry = pose.rz = pose.sq = 0;
        stepParts(dt);
        if (t >= nextAt && lay.ok) begin(t);
        return;
      }
      kt = t - t0;
      stepParts(dt);
      /* Pepe «подаёт» поцелуй: короткий вдох-сжатие, затем наклон вперёд и в сторону поцелуя */
      if (phase === 1 || phase === 2) {
        if (kt < 0.28) { pose.rx = -3.6; pose.ry = -2.2; pose.rz = -1.1; pose.sq = -0.03; }
        else if (kt < 0.66) { pose.rx = -6.8; pose.ry = 4.2; pose.rz = 3.2; pose.sq = 0.034; }
        else { pose.rx = pose.ry = pose.rz = pose.sq = 0; }
      } else { pose.rx = pose.ry = pose.rz = pose.sq = 0; }

      if (phase === 1) {
        if (kt < 0.3) return;
        aimPath();
        phase = 2; showHeart(true);
        hx = P0.x; hy = P0.y; hr = -22; hs = 0.2; ho = 0;
        placeHeart(hx, hy, hr, hs, 0);
      }

      if (phase === 2) {
        aimPath();                                   /* сцена могла поменяться — путь живой */
        var FD = lite ? 1.35 : 1.6;
        u = clamp((kt - 0.3) / FD, 0, 1);
        s = 1 - Math.pow(1 - u, 2.2);
        var ft = kt - 0.3;
        hx = bez(s, P0.x, P1.x, P2.x);
        hy = bez(s, P0.y, P1.y, P2.y);
        var settle = clamp(u * 2, 0, 1);
        hx += Math.sin(ft * 1.35 + 0.3) * 4.2 * settle * (plan.W / 200);
        hy += Math.sin(ft * 1.75) * 5 * settle * (plan.W / 200);
        hr = -22 * (1 - u) * (1 - u) + Math.sin(ft * 1.5 + 0.4) * 3.4 * settle;
        hs = u < 1 ? 0.2 + 0.8 * easeOutBack(u) : 1;
        /* пульс и живой отклик на наведение */
        var tgt = (hover || held) ? 1 : 0;
        hv += (tgt - hv) * (1 - Math.exp(-dt * 9));
        if (u >= 1) hs *= 1 + 0.028 * (0.5 + 0.5 * Math.sin((t - t0) * 5.2));
        hs *= 1 + 0.05 * hv;
        ho = clamp(ft / 0.14, 0, 1);
        placeHeart(hx, hy, hr, hs, ho);

        /* след из мелких сердечек */
        if (!reduce && u > 0.08 && u < 0.8 && kt > trailT) {
          trailT = kt + (lite ? 0.2 : 0.13);
          p = freePart(0);
          if (p) {
            p.x = hx + rand(-8, 8); p.y = hy + rand(-6, 10); p.vx = rand(-14, 6); p.vy = rand(-16, 6); p.r = rand(-30, 30); p.vr = rand(-60, 60);
            p.age = 0; p.life = rand(0.6, 0.85); p.s = rand(0.55, 0.8) * (plan.W / 200); p.kind = 0;
            partOn(p, true);
            setPart(p, p.x, p.y, p.r, p.s * 0.9, 0.85);
          }
        }

        /* печать начинается, когда сердце почти доросло */
        if (typeT0 < 0 && u >= 0.62) { typeT0 = t; lastKey = t; }
        if (typeT0 >= 0) {
          var te = t - typeT0, nn1 = n1, nn2 = n2;
          while (nn1 < title.length && due1[nn1] <= te) nn1++;
          while (nn2 < full2.length && due2[nn2] <= te) nn2++;
          if (nn1 !== n1) { n1 = nn1; tx1.textContent = title.slice(0, n1); lastKey = t; }
          if (nn2 !== n2) { n2 = nn2; tx2.textContent = full2.slice(0, n2); lastKey = t; }
          var line = n1 < title.length ? 1 : 2;
          caretAt(line, line === 1 ? n1 : n2);
          var typing = te < typeEnd;
          var blink = (t - lastKey < 0.5) || (Math.floor((t - lastKey) * 2.2) % 2 === 0);
          caret.style.opacity = (te > typeEnd + 1.3) ? '0' : (typing || blink ? '1' : '0');
          if (!typing && u >= 1) {
            if (!hover && !held) holdLeft -= dt;
            if (holdLeft <= 0) pop(t);
          }
        }
      }

      if (phase === 3) {
        var pu = (t - popT) / 0.36;
        if (pu < 1) {
          var ps2 = pu < 0.28 ? 1 + 0.16 * (1 - Math.pow(1 - pu / 0.28, 2)) : (1.16) * (1 - ease((pu - 0.28) / 0.72));
          placeHeart(hx, hy, hr + pu * 8, Math.max(0.02, ps2 * hs), 1 - ease(clamp((pu - 0.3) / 0.7, 0, 1)));
        } else {
          if (as.visibility !== 'hidden') showHeart(false);
          var busy = false;
          for (i = 0; i < pool.length; i++) { if (pool[i].on) { busy = true; break; } }
          if (!busy) { phase = 0; nextAt = t + rand(2.8, 5.6); }
        }
      }
    }

    /* статичный экземпляр (prefers-reduced-motion): сердце с полным текстом рядом с Pepe */
    function showStatic() {
      if (!lay.ok) return;
      try { makePlan(); } catch (e4) { return; }
      vr = (lay.narrow ? VARS_N : VARS_W)[0];
      aimPath();
      tx1.textContent = title; tx2.textContent = full2;
      caret.style.opacity = '0';
      showHeart(true);
      placeHeart(P2.x, P2.y, -3, 1, 1);
    }

    return {
      pose: pose,
      step: step,
      showStatic: showStatic,
      active: function () { return phase !== 0; },
      remove: function () { if (layer.parentNode) layer.parentNode.removeChild(layer); },
      resetTimer: function (t) { nextAt = t; },
      layer: layer
    };
  }

  /* ==========================================================================
     ОРИГИНАЛ (Lottie): геометрия, измеренная по альфа-каналу всех кадров цикла
     ========================================================================== */
  var CYC = 180, FPS = 60, RATE = 0.5;   /* RATE: цикл идёт медленнее (≈6 с вместо 3 с) */
  /* рамка, в которую персонаж укладывается во ВСЕХ кадрах (композиция 512×512, масштаб слоя 63% учтён) */
  var CROP = { x: 96, y: 88, w: 332, h: 340 };
  /* объединённый bbox персонажа, центр масс по горизонтали (ax) и «земля» (gy — низ стоп) */
  var BODY = { x0: 108.5, x1: 414.3, y0: 101.3, y1: 416.8, ax: 242, gy: 414 };
  var MOUTH = { x: 270, y: 212 };      /* уголок рта: отсюда вылетает поцелуй */
  var FILL = 0.86;                     /* доля высоты сцены, которую занимает персонаж */
  var GROUND = 0.935;                  /* линия «земли» в долях высоты сцены */
  var PERSP = 900;                     /* перспектива наклона, px */

  /* кэш кадров: цикл запекается один раз (60 кадров, шаг 3) и дальше играется простым копированием.
     Так нагрузка постоянна и мала на любом устройстве, а Lottie больше не рисует 28 слоёв каждый кадр. */
  var N_SLOTS = 60, SLOT_STEP = CYC / N_SLOTS;
  var MEM_BUD = 58e6;                  /* байт на кэш кадров */
  var LIVE_MAX = 6.5;                  /* мс: если кадр с растеризацией дешевле — рисуем вживую (только мышь/десктоп) */
  var FILL_COST = 18;                  /* мс: целевая цена одного кадра при запекании (подгоняет разрешение) */
  var FILL_MS = 7;                     /* мс на тик, которые можно тратить на запекание */

  /* подгоняем данные: обрезаем пустые поля композиции, чтобы холст был минимальным.
     Если файл не тот (другие размеры/слои) — показываем композицию целиком, без обрезки. */
  function prepareData(d) {
    var g = { w: d.w, h: d.h, ax: d.w / 2, gy: d.h * 0.93, ch: d.h * 0.9, cw: d.w * 0.9, mx: d.w * 0.52, my: d.h * 0.4 };
    try {
      var l = d.layers.length === 1 ? d.layers[0] : null;
      var p = l && l.ks && l.ks.p;
      if (+d.w === 512 && +d.h === 512 && p && p.a === 0 && p.k && p.k.length >= 2 && p.k[0] === 256 && p.k[1] === 256) {
        p.k = [256 - CROP.x, 256 - CROP.y, p.k[2] || 0];
        d.w = CROP.w; d.h = CROP.h;
        g = { w: CROP.w, h: CROP.h, ax: BODY.ax - CROP.x, gy: BODY.gy - CROP.y, ch: BODY.y1 - BODY.y0, cw: BODY.x1 - BODY.x0,
              mx: MOUTH.x - CROP.x, my: MOUTH.y - CROP.y };
      }
    } catch (e) { /* без обрезки */ }
    return g;
  }

  /* ==========================================================================
     Создание героя
     ========================================================================== */
  function create(container, opts) {
    opts = opts || {};
    var STUB = { start: noop, nudge: noop };
    if (!container || !doc.createElement) return STUB;

    var reduce = !!opts.reduce, lite = !!opts.lite, hasPtr = !!opts.pointer && !reduce;
    var alive = true, started = false, visible = true, raf = 0;
    var mode = 'wait';                 /* wait — грузим оригинал; lottie; vector — запасной рисунок */
    var ready = false;                 /* персонаж показан */
    var G = null;                      /* геометрия оригинала в координатах композиции */
    var anim = null, lotLoaded = false, lotFailed = false, onWinErr = null;
    var fb = null, fbReady = false;
    var kiss = null;

    /* ---------- элементы ---------- */
    function abs(el) {
      var s = el.style;
      s.position = 'absolute'; s.left = '0'; s.top = '0'; s.right = 'auto'; s.bottom = 'auto'; s.margin = '0'; s.pointerEvents = 'none';
    }
    var shadow = doc.createElement('canvas');
    abs(shadow); shadow.style.display = 'block'; shadow.style.opacity = '0'; shadow.style.willChange = 'transform, opacity';
    var rig = doc.createElement('div');
    abs(rig); rig.style.width = '100%'; rig.style.height = '100%'; rig.style.opacity = '0';
    rig.style.willChange = 'transform, opacity'; rig.style.transformOrigin = '50% 58%';
    container.appendChild(shadow);
    container.appendChild(rig);

    /* мягкая контактная тень: один раз рисуем на маленьком canvas (никаких размытий в кадре) */
    (function drawShadow() {
      var c = shadow.getContext ? shadow.getContext('2d') : null;
      if (!c) return;
      var w = 256, h = 64;
      shadow.width = w; shadow.height = h;
      c.translate(w / 2, h / 2); c.scale(1, h / w);
      var g = c.createRadialGradient(0, 0, 0, 0, 0, w / 2);
      g.addColorStop(0, 'rgba(255,92,190,.2)'); g.addColorStop(0.6, 'rgba(255,92,190,.07)'); g.addColorStop(1, 'rgba(255,92,190,0)');
      c.fillStyle = g; c.beginPath(); c.arc(0, 0, w / 2, 0, TAU); c.fill();
      g = c.createRadialGradient(0, 0, 0, 0, 0, w * 0.41);
      g.addColorStop(0, 'rgba(0,0,0,.72)'); g.addColorStop(0.55, 'rgba(0,0,0,.36)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = g; c.beginPath(); c.arc(0, 0, w * 0.41, 0, TAU); c.fill();
    })();

    /* экран оригинала: размеры в CSS задаёт layout(), разрешение — плеер */
    var dc = doc.createElement('canvas');
    abs(dc); dc.style.display = 'block';
    var dctx = null;
    rig.appendChild(dc);

    /* ---------- размеры и положение ---------- */
    var lay = { cw: 0, ch: 0, mx: 0, my: 0, ok: false, narrow: false };
    var sc = 1;                         /* css-пикселей на единицу композиции */
    var onSized = noop;
    function layout() {
      var cw = container.clientWidth, ch = container.clientHeight;
      if (cw < 40 || ch < 40) return false;
      lay.cw = cw; lay.ch = ch; lay.narrow = cw < 470;
      var gy = ch * GROUND;
      if (G) {
        sc = Math.min(ch * FILL / G.ch, cw * 0.92 / G.cw);
        var hs = dc.style;
        hs.width = fx(G.w * sc, 1) + 'px'; hs.height = fx(G.h * sc, 1) + 'px';
        hs.left = fx(cw / 2 - G.ax * sc, 1) + 'px'; hs.top = fx(gy - G.gy * sc, 1) + 'px';
        lay.mx = cw / 2 - G.ax * sc + G.mx * sc;
        lay.my = gy - G.gy * sc + G.my * sc;
      } else if (fb) {
        lay.mx = cw * ((650 + OX) / VIEW); lay.my = ch * ((380 + OY) / VIEW);
      } else { lay.mx = cw * 0.58; lay.my = ch * 0.38; }
      /* тень: широкий мягкий эллипс под персонажем */
      var sw = cw * (G ? 0.8 : 0.9), ss = shadow.style;
      ss.width = fx(sw, 1) + 'px'; ss.height = fx(sw / 4, 1) + 'px';
      ss.left = fx(cw / 2 - sw / 2 + (G ? cw * 0.015 : 0), 1) + 'px';
      ss.top = fx(gy - sw / 8 - ch * 0.004, 1) + 'px';
      if (kiss && kiss.layer.parentNode !== container) {
        /* слой поцелуя лежит поверх сцены и совпадает с контейнером по рамке */
        var kl = kiss.layer.style;
        kl.left = container.offsetLeft + 'px'; kl.top = container.offsetTop + 'px';
        kl.width = container.offsetWidth + 'px'; kl.height = container.offsetHeight + 'px';
      }
      lay.ok = true;
      return true;
    }

    /* ---------- состояние движения ---------- */
    var simT = 0, lotT = 0, lastNow = 0;
    var wTilt = hasPtr ? 5.2 : 2.3;
    var sRX = new Crit(wTilt), sRY = new Crit(wTilt);
    var sScr = new Crit(5.5);                          /* отклик на прокрутку */
    var sLX = new Crit(7.5), sLY = new Crit(7.5), sLZ = new Crit(7.5);   /* наклон-подача поцелуя */
    var sSq = new Spring(230, 16);                      /* сквош/растяжение при поцелуе */
    var sAp = new Spring(66, 11.5);                     /* появление: масштаб и непрозрачность */
    var sSh = new Crit(2.6);                            /* появление тени */
    var ptr = { x: 0, y: 0, on: false, t: -99 };
    var rect = null, rectT = -9, rectDirty = true;
    var lastTf = '', lastShTf = '';

    function getRect() {
      if (!rect || rectDirty || simT - rectT > 0.4) { rect = container.getBoundingClientRect(); rectT = simT; rectDirty = false; }
      return rect;
    }

    /* ==========================================================================
       Плеер оригинала
       rc — рабочий холст за кадром (сюда рисует Lottie), dc — экран.
       live: каждый кадр рисуем заново; cache: цикл запечён в атласы, играем копированием.
       ========================================================================== */
    var rc = doc.createElement('canvas'), rctx = null;
    var pm = 'none';                    /* none | still | live | fill | cache */
    var pw = 0, ph = 0, dprUse = 1;     /* размер рабочего холста и текущее разрешение */
    var cache = null, bld = null;       /* готовый кэш и кэш в сборке */
    var fillCool = 0, probeMs = 0, lastKey = -1, xfade = true;
    var costEma = 0, costN = 0;

    function baseDpr() { return Math.max(0.8, Math.min(win.devicePixelRatio || 1, lite ? 1.25 : (hasPtr ? 2 : 1.15))); }
    function applySize() {
      pw = Math.max(8, Math.round(G.w * sc * dprUse)); ph = Math.max(8, Math.round(G.h * sc * dprUse));
      rc.width = pw; rc.height = ph;
      if (anim) { try { anim.resize(); } catch (e0) { /* игнор */ } }
    }
    /* кадр оригинала -> rc; false, если что-то сломалось */
    function renderLot(frame) {
      if (!anim) return false;
      var t0 = now();
      try { anim.goToAndStop(frame, true); } catch (e8) { return false; }
      var c = now() - t0;
      costEma = costN ? costEma * 0.88 + c * 0.12 : c;
      costN++;
      return true;
    }
    function present() {
      if (dc.width !== pw || dc.height !== ph) { dc.width = pw; dc.height = ph; dctx = null; }
      if (!dctx) dctx = dc.getContext('2d');
      if (!dctx) return;
      dctx.globalCompositeOperation = 'copy';
      dctx.globalAlpha = 1;
      dctx.drawImage(rc, 0, 0);
      dctx.globalCompositeOperation = 'source-over';
    }
    /* реальная цена кадра вместе с растеризацией (3 пробных кадра за кадром) */
    function probe() {
      var t = [], i, t0, pc = doc.createElement('canvas'), pcx = null;
      pc.width = 1; pc.height = 1;
      try { pcx = pc.getContext('2d', { willReadFrequently: true }); } catch (e1) { pcx = null; }
      for (i = 0; i < 4; i++) {
        t0 = now();
        if (!renderLot(21 + i * 38)) return -1;
        try { if (pcx) { pcx.drawImage(rc, 0, 0, 1, 1, 0, 0, 1, 1); pcx.getImageData(0, 0, 1, 1); } } catch (e3) { /* игнор */ }
        t.push(now() - t0);
      }
      t.shift(); t.sort(function (a, b) { return a - b; });
      return t[1];
    }

    function newBuild() {
      var cols = Math.max(1, Math.min(5, Math.floor(4096 / pw))), per = cols * 3;
      return { w: pw, h: ph, n: 0, cols: cols, per: per, atl: [], ctx: [] };
    }
    function putSlot(b, i) {
      var a = Math.floor(i / b.per), j = i % b.per;
      if (!b.atl[a]) {
        var left = Math.min(b.per, N_SLOTS - a * b.per), cv2 = doc.createElement('canvas');
        cv2.width = b.cols * b.w; cv2.height = Math.ceil(left / b.cols) * b.h;
        b.atl[a] = cv2; b.ctx[a] = cv2.getContext('2d');
        if (!b.ctx[a]) return false;
      }
      b.ctx[a].drawImage(rc, (j % b.cols) * b.w, Math.floor(j / b.cols) * b.h);
      return true;
    }
    function startBuild() {
      bld = newBuild();
      fillCool = 0;
    }
    function fillStep(dRaw) {
      if (fillCool > 0) { fillCool--; return; }
      var b = bld, t0 = now();
      do {
        if (!renderLot(b.n * SLOT_STEP)) { lotFail(); return; }
        try { if (!putSlot(b, b.n)) { cacheFail(); return; } } catch (e2) { cacheFail(); return; }
        b.n++;
      } while (b.n < N_SLOTS && now() - t0 < FILL_MS);
      if (dRaw > 30) fillCool = 1;                      /* не душим главный поток */
      if (b.n >= N_SLOTS) {
        cache = b; bld = null; lastKey = -1;
        pm = 'cache';
        if (dc.width !== cache.w || dc.height !== cache.h) { dc.width = cache.w; dc.height = cache.h; dctx = null; }
        if (!dctx) dctx = dc.getContext('2d');
        showSlot(0, 0);
        reveal();
      }
    }
    /* не вышло запечь (нет памяти и т.п.): играем вживую в сниженном разрешении */
    function cacheFail() {
      bld = null; cache = null;
      dprUse = Math.max(0.8, dprUse * 0.75); applySize();
      pm = 'live'; level = 1;
      present(); reveal();
    }
    function showSlot(i, q) {
      var c = cache, a, j, x, y, i1 = (i + 1) % c.n;
      function blit(k, op, al) {
        a = Math.floor(k / c.per); j = k % c.per;
        x = (j % c.cols) * c.w; y = Math.floor(j / c.cols) * c.h;
        dctx.globalCompositeOperation = op; dctx.globalAlpha = al;
        dctx.drawImage(c.atl[a], x, y, c.w, c.h, 0, 0, c.w, c.h);
      }
      if (q <= 0) blit(i, 'copy', 1);
      else { blit(i, 'copy', 1 - q); blit(i1, 'lighter', q); }
      dctx.globalCompositeOperation = 'source-over'; dctx.globalAlpha = 1;
    }
    /* кадр времени -> кэш; между соседними слотами плавное «перекрытие» (честный кроссфейд) */
    function playCache(frame) {
      var c = cache, pos = frame / SLOT_STEP, i = Math.floor(pos), f = pos - i, q = xfade ? Math.round(f * 3) : Math.round(f);
      i %= c.n;
      if (q >= (xfade ? 3 : 1)) { i = (i + 1) % c.n; q = 0; }
      var key = i * 4 + q;
      if (key === lastKey) return;
      lastKey = key;
      showSlot(i, xfade ? q / 3 : 0);
    }

    /* подготовка плеера после загрузки данных: меряем цену кадра и выбираем режим */
    function setupPlayer() {
      rctx = rc.getContext('2d');
      if (!rctx) { lotFail(); return; }
      dprUse = baseDpr();
      applySize();
      if (reduce) {
        if (!renderLot(0)) { lotFail(); return; }
        present(); pm = 'still'; reveal();
        return;
      }
      var c = probe();
      if (c < 0) { lotFail(); return; }
      probeMs = c;
      if (hasPtr && !lite && c <= LIVE_MAX) {
        pm = 'live';
        present(); reveal();
        return;
      }
      /* кэш: разрешение — по цене кадра и объёму памяти */
      var cssW = G.w * sc, cssH = G.h * sc;
      var dm = Math.sqrt(MEM_BUD / (4 * N_SLOTS * cssW * cssH));
      var dtm = dprUse * Math.sqrt(FILL_COST / Math.max(c, 0.5));
      var d = clamp(Math.min(dprUse, dm, dtm), 0.8, dprUse);
      if (d < dprUse - 0.02) { dprUse = d; applySize(); }
      pm = 'fill';
      startBuild();
    }
    /* вживую стало тяжело -> запекаем (кадр на экране замирает на пару секунд) */
    function toCache() {
      if (pm !== 'live') return;
      var c = probe();
      if (c < 0) { lotFail(); return; }
      probeMs = c;
      var cssW = G.w * sc, cssH = G.h * sc;
      var dm = Math.sqrt(MEM_BUD / (4 * N_SLOTS * cssW * cssH));
      var dtm = dprUse * Math.sqrt(FILL_COST / Math.max(c, 0.5));
      var d = clamp(Math.min(dprUse, dm, dtm), 0.8, dprUse);
      if (d < dprUse - 0.02) { dprUse = d; applySize(); }
      pm = 'fill';
      startBuild();
    }
    /* размер сцены изменился */
    function resizePlayer() {
      if (!G || !rctx || pm === 'none') return;
      if (pm === 'live') {
        dprUse = Math.min(dprUse, baseDpr());
        applySize(); present();
      } else if (pm === 'still') {
        dprUse = baseDpr(); applySize(); renderLot(0); present();
      } else {
        var want = Math.max(8, Math.round(G.w * sc * dprUse));
        var cur = cache ? cache.w : (bld ? bld.w : want);
        if (Math.abs(want - cur) / cur > 0.2) { applySize(); startBuild(); }   /* сильно другой размер — перезапекаем в фоне */
      }
    }

    /* ---------- Lottie: загрузка (JSON и библиотека параллельно) ---------- */
    function useFallback() {
      if (!alive || fb) return;
      mode = 'vector';
      fb = makeVector(opts, rig, ptr);
      if (!fb) return;
      fb.cv.style.opacity = '0';
      fb.cv.style.transition = 'opacity .7s ease';
      layout();
      fb.build(function (ok) {
        if (!ok || !alive) return;
        fbReady = true;
        fb.cv.style.opacity = '1';
        reveal();
      });
    }
    function lotDrop() {
      if (onWinErr) { win.removeEventListener('error', onWinErr); onWinErr = null; }
      try { if (anim) anim.destroy(); } catch (e1) { /* игнор */ }
      anim = null; bld = null; cache = null; pm = 'none';
      dc.style.display = 'none';
    }
    function lotFail() {
      if (lotFailed) return;
      lotFailed = true;
      lotDrop();
      G = null;
      if (alive) useFallback();
    }
    function onLoaded() {
      if (lotLoaded || !alive || !anim) return;
      lotLoaded = true;
      mode = 'lottie';
      try { anim.setSubframe(true); } catch (e2) { /* игнор */ }
      if (layout()) setupPlayer(); else onSized = setupPlayer;     /* сцена ещё без размера — дождёмся */
    }
    function attach(d) {
      var L = win.lottie;
      if (!alive || mode !== 'wait' || !L || typeof L.loadAnimation !== 'function') { if (alive && mode === 'wait') useFallback(); return; }
      G = prepareData(d);
      rctx = rc.getContext('2d');
      if (!rctx) { lotFail(); return; }
      rc.width = 8; rc.height = 8;
      layout();
      /* сбой внутри самой библиотеки (в том числе позже, при отрисовке): тихо возвращаем запасной рисунок */
      onWinErr = function (ev) {
        if (ev && typeof ev.filename === 'string' && ev.filename.indexOf('lottie.canvas') !== -1) {
          try { ev.preventDefault(); } catch (e4) { /* игнор */ }
          lotFail();
        }
      };
      win.addEventListener('error', onWinErr);
      try {
        anim = L.loadAnimation({
          renderer: 'canvas', loop: false, autoplay: false, animationData: d,
          rendererSettings: { context: rctx, preserveAspectRatio: 'xMidYMid meet', clearCanvas: true }
        });
      } catch (e5) { lotFail(); return; }
      if (!anim) { lotFail(); return; }
      anim.addEventListener('DOMLoaded', onLoaded);
      anim.addEventListener('data_failed', lotFail);
      anim.addEventListener('error', lotFail);
      if (anim.isLoaded) onLoaded();
    }
    function loadLottie(src) {
      if (!src || !win.fetch) { useFallback(); return; }
      var data = null;
      function go() {
        if (!alive || mode !== 'wait' || !data || !win.lottie) return;
        try { attach(data); } catch (e6) { lotFail(); }
      }
      if (!win.lottie) {
        try {
          var sc2 = doc.createElement('script');
          sc2.src = 'assets/js/lottie.canvas.min.js';
          sc2.async = true;
          sc2.onload = go;
          sc2.onerror = function () { if (mode === 'wait') useFallback(); };
          doc.head.appendChild(sc2);
        } catch (e7) { useFallback(); return; }
      }
      win.fetch(src, { credentials: 'same-origin' })
        .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
        .then(function (d) {
          var ok = d && typeof d === 'object' && Array.isArray(d.layers) && d.layers.length > 0 && d.w > 0 && d.h > 0 && d.op > d.ip;
          if (!ok) throw new Error('bad json');
          data = d; go();
        })
        .catch(function () { if (mode === 'wait') useFallback(); });
      /* совсем долгая загрузка: оставляем запасной рисунок */
      setTimeout(function () { if (alive && mode === 'wait') useFallback(); }, 15000);
    }

    /* ---------- появление ---------- */
    function reveal() {
      if (ready || !alive) return;
      ready = true;
      sAp.t = 1;
      gov.t0 = simT;
      if (kiss) kiss.resetTimer(simT + 3.2);
      if (reduce) {
        rig.style.opacity = '1'; shadow.style.opacity = '1';
        rig.style.transform = 'none';
        if (kiss) kiss.showStatic();
      } else sync();
    }

    /* ---------- «саморегуляция»: если кадры долгие — упрощаем ---------- */
    var level = hasPtr ? 0 : 1;        /* только вживую: 0 — до 60 к/с, 1 — 30 к/с (на телефоне сразу 30) */
    var gov = { n: 0, bad: 0, strikes: 0, t0: 0 };
    function govern(dRaf) {
      if (!ready || simT - gov.t0 < 2.4 || dRaf > 250 || bld) return;
      gov.n++;
      if (dRaf > 26) gov.bad++;
      if (gov.n >= 48) {
        if (gov.bad > 14) {
          gov.strikes++;
          if (gov.strikes >= 2) {
            gov.strikes = 0;
            if (win.__pd && win.__pd.nogov) { /* отладка */ }
            else if (mode === 'lottie' && pm === 'live') toCache();
            else if (pm === 'cache' && xfade) xfade = false;
          }
        } else gov.strikes = 0;
        gov.n = 0; gov.bad = 0;
      }
      /* вживую один кадр сам по себе дорогой (>8 мс) — запекаем */
      if (pm === 'live' && costN > 24 && costEma > 8 && !(win.__pd && win.__pd.nogov)) toCache();
    }

    /* ---------- главный цикл ---------- */
    function run() { return alive && started && visible && !doc.hidden && !reduce; }
    var lastRender = -99;
    function aim(wall) {
      var nx, ny, k = 1;
      if (hasPtr && ptr.on && wall - ptr.t < 7) {
        var r = getRect();
        var cx = r.left + r.width * 0.5, cy = r.top + r.height * 0.55;
        nx = clamp((ptr.x - cx) / (win.innerWidth * 0.42 || 1), -1, 1);
        ny = clamp((ptr.y - cy) / (win.innerHeight * 0.42 || 1), -1, 1);
      } else {
        /* без курсора: медленное «блуждание» */
        nx = Math.sin(simT * 0.31) * 0.62 + Math.sin(simT * 0.83 + 1.7) * 0.28;
        ny = Math.sin(simT * 0.23 + 0.6) * 0.42 + Math.sin(simT * 0.61) * 0.2;
        k = hasPtr ? 0.7 : 0.62;
      }
      sRY.t = nx * 9.5 * k;
      sRX.t = -ny * 7 * k + 0.6;
    }
    function tick(ts) {
      raf = 0;
      if (!run()) return;
      raf = win.requestAnimationFrame(tick);
      var dRaw = lastNow ? ts - lastNow : 16.7;
      lastNow = ts;
      var dt = Math.min(dRaw, 100) / 1000;
      simT += dt;
      var wall = ts / 1000;
      var K = lay.ch / 527;
      govern(dRaw);

      if (mode === 'lottie') {
        if (bld) fillStep(dRaw);
        /* время идёт честно; кадр берём из кэша или рисуем заново (при нагрузке — реже) */
        if (ready) {
          lotT += dt;
          var fr = (lotT * FPS * RATE) % CYC;
          if (pm === 'cache' && cache) { if (!(win.__pd && win.__pd.norender)) playCache(fr); }
          else if (pm === 'live' && ts - lastRender >= (level ? 30 : 15) - 2.5 && !(win.__pd && win.__pd.norender)) {
            lastRender = ts;
            if (!renderLot(fr)) { lotFail(); return; }
            present();
          }
        }
      } else if (mode === 'vector' && fb && fbReady) fb.step(ts);

      aim(wall);
      if (kiss && ready) kiss.step(simT, dt);
      var pz = kiss ? kiss.pose : null;
      sLX.t = pz ? pz.rx : 0; sLY.t = pz ? pz.ry : 0; sLZ.t = pz ? pz.rz : 0; sSq.t = pz ? pz.sq : 0;

      var rx = sRX.step(dt) + sLX.step(dt) + sScr.step(dt);
      var ry = sRY.step(dt) + sLY.step(dt);
      var rz = sLZ.step(dt) + sRY.x * 0.1;
      var sq = sSq.step(dt);
      var ap = sAp.step(dt);
      var shA = sSh.step(dt);

      /* парение и «дыхание» масштаба в такт оригинальному циклу (3 с) */
      var fl = Math.sin(simT * 1.17) * 0.62 + Math.sin(simT * 0.71 + 0.7) * 0.38;
      var ty = (fl * 5.2 - 4) * K + sScr.x * 1.1 * K + (1 - ap) * 16 * K;
      var tx = sRY.x * 0.9 * K;
      var cyc = (lotT * FPS * RATE) / CYC;
      var br = Math.sin(cyc * TAU + 0.5) * 0.0055;
      var sa = 0.86 + 0.14 * ap;
      var sx = (1 + br * 0.6 - sq * 0.5) * sa, sy = (1 + br + sq) * sa;
      var fy = lay.ch * (GROUND - 0.58);
      var tf = 'perspective(' + PERSP + 'px) translate3d(' + fx(tx, 2) + 'px,' + fx(ty, 2) + 'px,0) rotateX(' + fx(rx, 3) + 'deg) rotateY(' + fx(ry, 3) + 'deg) rotateZ(' + fx(rz, 3) + 'deg) translate(0,' + fx(fy, 1) + 'px) scale(' + fx(sx, 4) + ',' + fx(sy, 4) + ') translate(0,' + fx(-fy, 1) + 'px)';
      if (tf !== lastTf && !(win.__pd && win.__pd.notilt)) { rig.style.transform = tf; lastTf = tf; }
      rig.style.opacity = fx(ready ? ease(clamp(ap / 0.55, 0, 1)) : 0, 3);

      /* тень: параллакс (уходит против наклона), сжимается, когда персонаж выше */
      var lift = clamp((-(fl * 5.2 - 4) - 4) / 14, -0.5, 1);
      var sh = (1 - lift * 0.07) * (0.94 + 0.06 * ap);
      var shx = -ry * 1.5 * K;
      var shTf = 'translate3d(' + fx(shx, 2) + 'px,0,0) scale(' + fx(sh, 3) + ',' + fx(sh * (1 - rx * 0.012), 3) + ')';
      if (shTf !== lastShTf) { shadow.style.transform = shTf; lastShTf = shTf; }
      sSh.t = (mode === 'vector' && fb) ? 0 : 1;
      shadow.style.opacity = fx(clamp(shA, 0, 1) * (1 - lift * 0.18), 3);
    }
    function sync() {
      if (run()) { if (!raf) { lastNow = 0; if (fb) fb.reset(); raf = win.requestAnimationFrame(tick); } }
      else if (raf) { win.cancelAnimationFrame(raf); raf = 0; }
    }

    /* ---------- запуск ---------- */
    function onPointer(e) { ptr.x = e.clientX; ptr.y = e.clientY; ptr.on = true; ptr.t = now() / 1000; }
    function onLeave() { ptr.on = false; }
    var resizeTimer = 0;
    function onResize() {
      if (!alive) return;
      rectDirty = true;
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () {
        if (!layout()) return;
        if (onSized !== noop) { var f = onSized; onSized = noop; f(); return; }
        resizePlayer();
        if (fb) fb.resize();
        if (kiss && reduce && ready) kiss.showStatic();
      }, 140);
    }

    var api = {
      info: function () {
        return { mode: mode, pm: pm, level: level, dpr: dprUse, probe: probeMs, cost: costEma, ready: ready, w: lay.cw,
                 canvas: [dc.width, dc.height], cache: cache ? [cache.w, cache.h, cache.n] : null, bld: bld ? bld.n : null, xfade: xfade };
      },
      start: function () {
        if (started) return;
        started = true;
        layout();
        var parent = container.parentNode || container;
        if (opts.kiss) {
          kiss = makeKiss(opts.kiss, parent, { lay: lay, rect: getRect, reduce: reduce, lite: lite });
          if (kiss) layout();
        }
        sSh.t = 1;
        if (hasPtr) {
          win.addEventListener('pointermove', onPointer, { passive: true });
          doc.documentElement.addEventListener('mouseleave', onLeave);
        }
        if ('ResizeObserver' in win) {
          try { new win.ResizeObserver(onResize).observe(container); } catch (e11) { win.addEventListener('resize', onResize); }
        } else win.addEventListener('resize', onResize);
        if ('IntersectionObserver' in win) {
          try {
            new win.IntersectionObserver(function (es) { visible = !!es[es.length - 1].isIntersecting; sync(); }, { threshold: 0 }).observe(container);
          } catch (e12) { /* игнор */ }
        }
        doc.addEventListener('visibilitychange', sync);
        if (reduce) { shadow.style.opacity = '1'; }
        sync();
        loadLottie(opts.src);
      },
      nudge: function (v) {
        if (reduce || !started || !ready) return;
        v = clamp(+v || 0, -0.35, 0.35);
        sScr.v += -v * 260;
        rectDirty = true;
        if (fb) fb.nudge(v);
      }
    };
    FX.pepe.last = api;
    return api;
  }

  FX.pepe = { create: create };
})();
