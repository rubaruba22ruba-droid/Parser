/* ==========================================================================
   Ночная сакура: ветка с цветами (рисуется один раз на canvas) + живые лепестки.
   Лепестки: глубина (размер/скорость/размытие), ветер, кувырок, отталкивание от курсора,
   «порыв» от скорости прокрутки. Работает без сети, без картинок.
   ========================================================================== */
(function () {
  'use strict';

  var win = window, doc = document;
  var FX = win.NTFX = win.NTFX || {};

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
  function mk(w, h) { var c = doc.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; }
  function supportsFilter(ctx) { return 'filter' in ctx; }

  /* Палитры цветов: от освещённых к глубоким теням */
  var PAL = [
    { base: '#e8a0ba', mid: '#f8cbdb', tip: '#fff3f7', edge: 'rgba(160,60,100,.30)', stamen: '#c8587f', center: '#e07a9c' },
    { base: '#d9779a', mid: '#f0a9c1', tip: '#fbdde8', edge: 'rgba(130,40,80,.36)', stamen: '#b8446f', center: '#cf5f86' },
    { base: '#b04a70', mid: '#d67d9d', tip: '#efb3c8', edge: 'rgba(100,25,60,.42)', stamen: '#9c3a60', center: '#b8537a' },
    { base: '#ead0da', mid: '#f8e8ef', tip: '#ffffff', edge: 'rgba(160,80,110,.25)', stamen: '#cf6a8d', center: '#e892ae' }
  ];

  /* Один лепесток: основание снизу (+y), кончик с выемкой сверху (−y). Центр — в (0,0). */
  function petalPath(c, h, w) {
    c.beginPath();
    c.moveTo(0, h * 0.5);
    c.bezierCurveTo(w * 1.05, h * 0.26, w * 1.0, -h * 0.36, w * 0.24, -h * 0.5);
    c.quadraticCurveTo(0, -h * 0.4, -w * 0.24, -h * 0.5);
    c.bezierCurveTo(-w * 1.0, -h * 0.36, -w * 1.05, h * 0.26, 0, h * 0.5);
    c.closePath();
  }

  /* Спрайт падающего лепестка */
  function petalSprite(h, pal) {
    var w = h * 0.5;
    var cv = mk(w * 2 + 4, h + 4), c = cv.getContext('2d');
    c.translate(cv.width / 2, cv.height / 2);
    petalPath(c, h, w);
    var g = c.createLinearGradient(0, h * 0.5, 0, -h * 0.5);
    g.addColorStop(0, pal.base); g.addColorStop(0.55, pal.mid); g.addColorStop(1, pal.tip);
    c.fillStyle = g; c.fill();
    c.lineWidth = Math.max(0.6, h / 60); c.strokeStyle = pal.edge; c.stroke();
    /* бледная жилка */
    c.beginPath(); c.moveTo(0, h * 0.42); c.lineTo(0, -h * 0.2);
    c.strokeStyle = 'rgba(255,255,255,.22)'; c.lineWidth = Math.max(0.5, h / 90); c.stroke();
    return cv;
  }

  /* Размытие без ctx.filter (Safari): уменьшить и растянуть обратно */
  function softSprite(src, factor) {
    var s = mk(Math.max(2, src.width / factor), Math.max(2, src.height / factor));
    var c = s.getContext('2d');
    c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high';
    c.drawImage(src, 0, 0, s.width, s.height);
    var o = mk(src.width, src.height), oc = o.getContext('2d');
    oc.imageSmoothingEnabled = true; oc.imageSmoothingQuality = 'high';
    oc.drawImage(s, 0, 0, o.width, o.height);
    return o;
  }

  /* Спрайт цветка: 5 лепестков, тычинки */
  function flowerSprite(size, pal) {
    var cv = mk(size, size), c = cv.getContext('2d'), R = size / 2;
    var plen = R * 0.94, pw = R * 0.5, k, s;
    for (k = 0; k < 5; k++) {
      c.save();
      c.translate(R, R);
      c.rotate(k * Math.PI * 2 / 5);
      c.beginPath();
      c.moveTo(0, -plen * 0.05);
      c.bezierCurveTo(pw * 1.0, -plen * 0.2, pw * 1.0, -plen * 0.88, pw * 0.22, -plen);
      c.quadraticCurveTo(0, -plen * 0.9, -pw * 0.22, -plen);
      c.bezierCurveTo(-pw * 1.0, -plen * 0.88, -pw * 1.0, -plen * 0.2, 0, -plen * 0.05);
      c.closePath();
      var g = c.createLinearGradient(0, 0, 0, -plen);
      g.addColorStop(0, pal.base); g.addColorStop(0.5, pal.mid); g.addColorStop(1, pal.tip);
      c.fillStyle = g; c.globalAlpha = 0.97; c.fill();
      c.globalAlpha = 1; c.lineWidth = Math.max(0.5, size / 110); c.strokeStyle = pal.edge; c.stroke();
      c.restore();
    }
    c.fillStyle = pal.center; c.beginPath(); c.arc(R, R, R * 0.1, 0, Math.PI * 2); c.fill();
    c.strokeStyle = pal.stamen; c.fillStyle = pal.stamen; c.lineWidth = Math.max(0.6, size / 100);
    for (s = 0; s < 9; s++) {
      var a = s * Math.PI * 2 / 9 + 0.3, l = R * (0.24 + (s % 3) * 0.05);
      c.beginPath(); c.moveTo(R, R); c.lineTo(R + Math.cos(a) * l, R + Math.sin(a) * l); c.stroke();
      c.beginPath(); c.arc(R + Math.cos(a) * l, R + Math.sin(a) * l, Math.max(0.7, size / 70), 0, Math.PI * 2); c.fill();
    }
    return cv;
  }

  /* ==========================================================================
     Ветка: рисуется один раз
     ========================================================================== */
  function bez(p0, p1, p2, p3, t) {
    var u = 1 - t;
    return [
      u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
      u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1]
    ];
  }

  function buildCanopy(canvas, opts) {
    opts = opts || {};
    var rect = canvas.getBoundingClientRect();
    var W = Math.max(200, rect.width), H = Math.max(200, rect.height);
    var dpr = Math.min(win.devicePixelRatio || 1, opts.lite ? 1 : 2);
    while (W * H * dpr * dpr > 4.6e6 && dpr > 1) dpr -= 0.25;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    var ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    var R = rng(opts.seed || 11);
    var small = W < 600;
    var nBack = opts.lite ? 150 : small ? 260 : 560;
    var nMid = opts.lite ? 80 : small ? 130 : 280;
    var nBokeh = opts.lite ? 6 : small ? 9 : 16;
    var canBlur = supportsFilter(ctx);

    var sprites = PAL.map(function (p) { return flowerSprite(opts.lite ? 64 : 96, p); });

    /* ветви: из правого верхнего угла к левому нижнему */
    var B = [
      [[W * 1.04, H * 0.00], [W * 0.82, H * 0.12], [W * 0.58, H * 0.10], [W * 0.20, H * 0.30]],
      [[W * 1.04, H * 0.10], [W * 0.90, H * 0.30], [W * 0.72, H * 0.40], [W * 0.46, H * 0.62]],
      [[W * 0.96, -H * 0.03], [W * 0.74, H * 0.00], [W * 0.54, H * 0.02], [W * 0.30, -H * 0.02]],
      [[W * 1.04, H * 0.28], [W * 0.94, H * 0.44], [W * 0.86, H * 0.58], [W * 0.70, H * 0.84]],
      [[W * 1.04, H * 0.04], [W * 0.88, H * 0.08], [W * 0.70, H * 0.22], [W * 0.56, H * 0.36]]
    ];

    function scatterPoint() {
      var b = B[(R() * B.length) | 0];
      var t = Math.pow(R(), 1.15);
      var p = bez(b[0], b[1], b[2], b[3], t);
      var spread = 18 + t * (small ? 46 : 86);
      var gx = (R() + R() + R() - 1.5) * spread, gy = (R() + R() + R() - 1.5) * spread;
      return { x: p[0] + gx, y: p[1] + gy, t: t };
    }
    function lightAt(x, y, t) {
      var d = Math.hypot(W - x, y) / Math.hypot(W, H);       // близость к «источнику света» в углу
      return clamp(1.05 - d * 1.5 + (R() - 0.5) * 0.45 - t * 0.2, 0, 1);
    }
    function pickSprite(L) {
      var r = R();
      if (L > 0.72) return r < 0.5 ? 0 : r < 0.78 ? 3 : 1;
      if (L > 0.42) return r < 0.45 ? 1 : r < 0.75 ? 0 : 2;
      return r < 0.6 ? 2 : 1;
    }
    function drawFlower(ctx, spr, x, y, size, rot, alpha) {
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(x, y); ctx.rotate(rot);
      ctx.drawImage(spr, -size / 2, -size / 2, size, size);
      ctx.restore();
    }

    var i, p;
    function layer() {
      var c = mk(canvas.width, canvas.height), x = c.getContext('2d');
      x.setTransform(dpr, 0, 0, dpr, 0, 0);
      return { c: c, x: x };
    }
    /* вставить слой целиком с одним размытием (быстро) */
    function blit(l, blurPx, mode) {
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      if (mode) ctx.globalCompositeOperation = mode;
      if (canBlur && blurPx > 0) ctx.filter = 'blur(' + (blurPx * dpr).toFixed(1) + 'px)';
      ctx.drawImage(l.c, 0, 0);
      ctx.restore();
    }

    /* 1. дальний план: мелкие, тёмные, слегка размытые */
    var lb = layer();
    for (i = 0; i < nBack; i++) {
      p = scatterPoint();
      var L = lightAt(p.x, p.y, p.t) * 0.7;
      drawFlower(lb.x, sprites[pickSprite(L)], p.x, p.y, lerp(18, 9, p.t) * (0.7 + R() * 0.8), R() * 6.28, 0.3 + L * 0.4);
    }
    blit(lb, 2.2);

    /* 2. ветви */
    ctx.lineCap = 'round';
    B.forEach(function (b) {
      var steps = 60, k;
      for (k = 0; k < steps; k++) {
        var t0 = k / steps, t1 = (k + 1) / steps;
        var a = bez(b[0], b[1], b[2], b[3], t0), c2 = bez(b[0], b[1], b[2], b[3], t1);
        ctx.strokeStyle = 'rgba(26,13,18,' + lerp(0.95, 0.5, t0).toFixed(2) + ')';
        ctx.lineWidth = lerp(small ? 5 : 10, 1.6, t0);
        ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(c2[0], c2[1]); ctx.stroke();
      }
    });

    /* 3. средний план: чёткие цветы */
    for (i = 0; i < nMid; i++) {
      p = scatterPoint();
      var L2 = lightAt(p.x, p.y, p.t);
      drawFlower(ctx, sprites[pickSprite(L2)], p.x, p.y, lerp(40, 18, p.t) * (0.65 + R() * 0.75) * (small ? 0.8 : 1), R() * 6.28, 0.5 + L2 * 0.4);
    }

    /* 4. боке: крупные расфокусированные цветы */
    var bk = layer();
    for (i = 0; i < nBokeh; i++) {
      p = scatterPoint();
      var sz = (small ? 60 : 100) + R() * (small ? 70 : 150);
      drawFlower(bk.x, sprites[R() < 0.6 ? 1 : 0], p.x, p.y, sz, R() * 6.28, 0.14 + R() * 0.14);
    }
    blit(bk, small ? 10 : 16, 'lighter');

    /* 5. плавное затухание от угла — края остаются чёрными */
    ctx.save();
    ctx.globalCompositeOperation = 'destination-in';
    var rad = Math.min(W * 1.02, H * 1.45);
    var g = ctx.createRadialGradient(W, 0, rad * 0.05, W, 0, rad);
    g.addColorStop(0, 'rgba(0,0,0,1)');
    g.addColorStop(0.5, 'rgba(0,0,0,.92)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  /* ==========================================================================
     Лепестки
     ========================================================================== */
  function createPetals(back, front, opts) {
    opts = opts || {};
    var ctxB = back.getContext('2d'), ctxF = front.getContext('2d');
    var W = 0, H = 0, dpr = 1;
    var canBlur = supportsFilter(ctxB);

    /* спрайты: чёткие и размытые для переднего плана */
    var sharp = PAL.map(function (p) { return petalSprite(72, p); });
    var soft = sharp.map(function (s) { return softSprite(s, 3); });

    var nBack = opts.lite ? 14 : opts.small ? 26 : 46;
    var nFront = opts.lite ? 1 : opts.small ? 2 : 4;
    var P = [], i;

    var ptr = { x: -9999, y: -9999, vx: 0, vy: 0, on: false };
    var gust = 0, lastY = win.pageYOffset || 0, lastT = 0;
    var t0 = 0, raf = 0, running = false, tabOn = !doc.hidden;

    function rand(a, b) { return a + Math.random() * (b - a); }

    function spawn(p, initial) {
      var front = p.front;
      var d = front ? rand(0.85, 1) : Math.pow(Math.random(), 0.9) * 0.82;
      p.d = d;
      p.size = front ? rand(46, 78) : lerp(8, 28, d);
      p.vy = front ? rand(70, 120) : lerp(14, 44, d);
      p.sway = lerp(10, 36, d) * rand(0.7, 1.3);
      p.swayF = rand(0.5, 1.3);
      p.phase = rand(0, 6.28);
      p.rot = rand(0, 6.28);
      p.spin = rand(-1.2, 1.2) * (front ? 0.5 : 1);
      p.flip = rand(0, 6.28);
      p.flipF = rand(1.2, 3.2);
      p.alpha = front ? rand(0.55, 0.85) : lerp(0.35, 0.95, d);
      p.v = front ? (Math.random() < 0.55 ? 1 : 0) : Math.floor(rand(0, PAL.length));
      p.ox = 0;
      p.x = initial ? rand(0, W) : rand(W * 0.2, W * 1.15);
      p.y = initial ? rand(-H * 0.1, H) : -rand(30, 240);
      p.px = 0; p.py = 0;             // импульс от курсора
    }
    for (i = 0; i < nBack + nFront; i++) { P.push({ front: i >= nBack }); }

    function resize() {
      dpr = Math.min(win.devicePixelRatio || 1, opts.lite ? 1 : 1.75);
      W = win.innerWidth; H = win.innerHeight;
      [back, front].forEach(function (c) { c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); });
    }

    function draw() {
      ctxB.setTransform(dpr, 0, 0, dpr, 0, 0); ctxB.clearRect(0, 0, W, H);
      ctxF.setTransform(dpr, 0, 0, dpr, 0, 0); ctxF.clearRect(0, 0, W, H);
      for (var n = 0; n < P.length; n++) {
        var p = P[n], c = p.front ? ctxF : ctxB;
        var sp = (p.front ? soft : sharp)[p.v];
        var h = p.size, w = h * (sp.width / sp.height);
        var sy = Math.max(0.18, Math.abs(Math.cos(p.flip)));
        c.save();
        c.globalAlpha = p.alpha;
        c.translate(p.x + p.px, p.y + p.py);
        c.rotate(p.rot);
        c.scale(1, sy);
        c.drawImage(sp, -w / 2, -h / 2, w, h);
        c.restore();
      }
    }

    function step(ts) {
      raf = 0;
      var dt = lastT ? Math.min((ts - lastT) / 1000, 0.05) : 0.016;
      lastT = ts;
      t0 += dt;

      /* порыв от прокрутки затухает */
      gust *= Math.exp(-dt * 2.4);
      var wind = -(24 + 16 * Math.sin(t0 * 0.21)) - gust * 0.25;

      for (var n = 0; n < P.length; n++) {
        var p = P[n];
        var df = lerp(0.35, 1, p.d);
        p.phase += dt * p.swayF;
        p.x += (wind * df + Math.sin(p.phase) * p.sway * 0.55) * dt;
        p.y += (p.vy + gust * (0.35 + p.d)) * dt;
        p.rot += p.spin * dt;
        p.flip += p.flipF * dt;

        /* курсор отталкивает лепестки (плавно, с затуханием) */
        if (ptr.on) {
          var dx = p.x - ptr.x, dy = p.y - ptr.y, d2 = dx * dx + dy * dy, R2 = 150 * 150;
          if (d2 < R2 && d2 > 1) {
            var d = Math.sqrt(d2), f = (1 - d / 150) * 340 * dt;
            p.px += dx / d * f + ptr.vx * 0.02;
            p.py += dy / d * f + ptr.vy * 0.02;
          }
        }
        p.px *= Math.exp(-dt * 1.1);
        p.py *= Math.exp(-dt * 1.1);

        if (p.y > H + 90 || p.x < -140) spawn(p, false);
      }
      ptr.vx *= 0.85; ptr.vy *= 0.85;
      draw();
      if (running && tabOn) raf = requestAnimationFrame(step);
    }

    function kick() { if (!raf && running && tabOn) { lastT = 0; raf = requestAnimationFrame(step); } }

    function onScroll() {
      var y = win.pageYOffset || 0, now = performance.now();
      var dtS = Math.max(16, now - (onScroll.t || now - 16)) / 1000;
      gust = clamp(gust + clamp((y - lastY) / dtS, -2400, 2400) * 0.05, -140, 220);
      lastY = y; onScroll.t = now;
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
        /* ветку рисуем после первой отрисовки, чтобы не задерживать страницу */
        var run = function () { buildCanopy(cv, { lite: o.lite, seed: 11 }); wrap.classList.add('on'); };
        if (win.requestIdleCallback) win.requestIdleCallback(run, { timeout: 600 }); else setTimeout(run, 60);
        var rt = 0;
        win.addEventListener('resize', function () {
          clearTimeout(rt);
          rt = setTimeout(function () { buildCanopy(cv, { lite: o.lite, seed: 11 }); }, 250);
        });
      }
    }
  };
})();
