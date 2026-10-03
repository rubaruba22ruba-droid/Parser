/* ==========================================================================
   NFT Tracker — рендер страницы из data/site.json + анимации.

   Безопасность:
   • весь текст вставляется через textContent (никакого innerHTML с данными);
   • ссылки строятся только как https://t.me/<handle>, handle проходит проверку по маске;
   • страница не встраивается в чужой <iframe>.

   Анимации: Anime.js (интро, появление кристалла) + Motion (появление при скролле).
   Только transform/opacity, мягкие кривые, без «прыжков». Учитывает prefers-reduced-motion
   и слабые устройства.
   ========================================================================== */
(function () {
  'use strict';

  var doc = document;
  var root = doc.documentElement;

  /* ---------- Защита от clickjacking (CSP через <meta> не умеет frame-ancestors) ---------- */
  if (window.top !== window.self) {
    try { window.top.location.href = window.self.location.href; } catch (e) { /* cross-origin */ }
    root.style.display = 'none';
    return;
  }

  var SVG_NS = 'http://www.w3.org/2000/svg';
  var XLINK_NS = 'http://www.w3.org/1999/xlink';
  var HANDLE_RE = /^[A-Za-z][A-Za-z0-9_]{4,31}$/;
  var EASE = [0.16, 1, 0.3, 1];

  var mq = function (q) { return !!(window.matchMedia && window.matchMedia(q).matches); };
  var reduceMotion = mq('(prefers-reduced-motion: reduce)');
  var finePointer = mq('(hover: hover) and (pointer: fine)');
  var conn = navigator.connection || {};
  var weak = (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 2) ||
             (navigator.deviceMemory && navigator.deviceMemory <= 2) ||
             !!conn.saveData;
  if (weak) root.classList.add('lite');

  /* ---------- Утилиты ---------- */
  function $(sel, ctx) { return (ctx || doc).querySelector(sel); }
  function $$(sel, ctx) { return Array.prototype.slice.call((ctx || doc).querySelectorAll(sel)); }

  function clean(v, max) { return typeof v === 'string' ? v.trim().slice(0, max || 400) : ''; }
  function list(v, max) { return Array.isArray(v) ? v.slice(0, max || 20) : []; }

  function tgUrl(handle) {
    handle = clean(handle, 40).replace(/^@/, '');
    return HANDLE_RE.test(handle) ? 'https://t.me/' + handle : null;
  }
  function atHandle(handle) { return '@' + clean(handle, 40).replace(/^@/, ''); }

  function el(tag, cls, text) {
    var n = doc.createElement(tag);
    if (cls) n.className = cls;
    if (text) n.textContent = text;
    return n;
  }
  function svgEl(tag, attrs) {
    var n = doc.createElementNS(SVG_NS, tag);
    for (var k in attrs) { if (Object.prototype.hasOwnProperty.call(attrs, k)) n.setAttribute(k, attrs[k]); }
    return n;
  }
  function icon(name) {
    var s = svgEl('svg', { 'class': 'ico', 'aria-hidden': 'true', focusable: 'false' });
    var u = svgEl('use', { href: '#i-' + name });
    u.setAttributeNS(XLINK_NS, 'xlink:href', '#i-' + name);
    s.appendChild(u);
    return s;
  }
  function tgLink(handle, cls) {
    var url = tgUrl(handle);
    if (!url) return null;
    var a = el('a', cls);
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    return a;
  }
  function reveal(node, delay) {
    node.setAttribute('data-reveal', '');
    if (delay) node.setAttribute('data-delay', String(delay));
    return node;
  }
  function rule() {
    var r = el('div', 'rule');
    r.setAttribute('data-rule', '');
    return r;
  }

  /* ---------- Шапка ---------- */
  function renderHeader(d) {
    var host = $('#top');
    var wrap = el('div', 'wrap top__in');

    var brand = el('a', 'brand');
    brand.href = '#hero';
    brand.appendChild(icon('gem'));
    brand.appendChild(el('span', '', clean(d.brand, 40)));
    wrap.appendChild(brand);

    var nav = el('nav', 'nav');
    nav.setAttribute('aria-label', 'Разделы');
    list(d.nav, 5).forEach(function (n) {
      var href = clean(n && n.href, 30);
      var label = clean(n && n.label, 30);
      if (!/^#[a-z0-9_-]+$/i.test(href) || !label) return;
      var a = el('a', '', label);
      a.href = href;
      nav.appendChild(a);
    });
    wrap.appendChild(nav);
    host.appendChild(wrap);
  }

  /* ---------- Hero ---------- */
  function renderHero(d) {
    var h = d.hero || {};
    var host = $('#hero');
    var wrap = el('div', 'wrap hero__in');

    var copy = el('div', 'hero__copy');
    copy.appendChild(el('p', 'label kicker', clean(h.kicker, 60)));

    var title = clean(h.title, 120);
    var h1 = el('h1', 'title');
    h1.id = 'hero-title';
    h1.setAttribute('aria-label', title);
    var words = title.split(/\s+/);
    var accent = Math.max(0, Math.min(parseInt(h.accentWords, 10) || 0, words.length));
    words.forEach(function (w, i) {
      var outer = el('span', 'w');
      outer.setAttribute('aria-hidden', 'true');
      outer.appendChild(el('span', 'wi' + (i >= words.length - accent ? ' wi--accent' : ''), w));
      h1.appendChild(outer);
      if (i < words.length - 1) h1.appendChild(doc.createTextNode(' '));
    });
    copy.appendChild(h1);
    copy.appendChild(el('p', 'lead', clean(h.lead, 200)));

    var ol = el('ol', 'steps');
    list(h.steps, 4).forEach(function (s, i) {
      var li = el('li');
      li.appendChild(el('span', '', '0' + (i + 1)));
      li.appendChild(doc.createTextNode(clean(s, 40)));
      ol.appendChild(li);
    });
    copy.appendChild(ol);

    if (clean(h.scroll, 40)) {
      var more = el('a', 'more');
      more.href = '#trackers';
      more.appendChild(el('span', '', clean(h.scroll, 40)));
      more.appendChild(icon('down'));
      copy.appendChild(more);
    }
    wrap.appendChild(copy);
    wrap.appendChild(renderStage(d.lot || {}));
    host.appendChild(wrap);
  }

  function renderStage(m) {
    var stage = el('div', 'stage');
    var inner = el('div', 'stage__in');
    var canvas = el('canvas');
    canvas.setAttribute('aria-hidden', 'true');
    inner.appendChild(canvas);

    var t = el('div', 'ticket');
    var top = el('div', 'ticket__top');
    top.appendChild(el('span', 'label', clean(m.tag, 30)));
    t.appendChild(top);
    var name = el('div', 'ticket__name', clean(m.name, 40));
    name.appendChild(el('small', '', clean(m.number, 16)));
    t.appendChild(name);
    var row = el('div', 'ticket__row');
    var price = el('span', 'ticket__price');
    price.appendChild(icon('star'));
    price.appendChild(el('b', '', clean(m.price, 12)));
    row.appendChild(price);
    row.appendChild(el('span', 'ticket__below', clean(m.below, 30)));
    t.appendChild(row);
    inner.appendChild(t);

    stage.appendChild(inner);
    return stage;
  }

  /* ---------- Трекеры ---------- */
  function renderTrackers(d) {
    var tr = d.trackers || {};
    var host = $('#trackers');
    var wrap = el('div', 'wrap sec');

    var head = el('div', 'sec__head');
    head.appendChild(rule());
    var h2 = el('h2', 'h2', clean(tr.title, 60));
    h2.id = 'trackers-title';
    head.appendChild(reveal(h2));
    wrap.appendChild(head);

    var grid = el('div', 'plans');
    list(tr.items, 3).forEach(function (t, i) {
      if (!t) return;
      var kind = t.id === 'premium' ? 'premium' : 'free';
      var card = reveal(el('article', 'plan plan--' + kind), i * 0.12);

      var top = el('div', 'plan__top');
      top.appendChild(el('span', 'label', clean(t.label, 30)));
      top.appendChild(el('span', 'label', '0' + (i + 1)));
      card.appendChild(top);

      var price = el('p', 'plan__price');
      price.appendChild(el('b', '', clean(t.price, 20)));
      if (clean(t.priceNote, 60)) price.appendChild(el('span', '', clean(t.priceNote, 60)));
      card.appendChild(price);

      if (clean(t.lead, 120)) card.appendChild(el('p', 'plan__lead', clean(t.lead, 120)));

      var ul = el('ul', 'plan__points');
      list(t.points, 6).forEach(function (p) { ul.appendChild(el('li', '', clean(p, 90))); });
      card.appendChild(ul);

      var foot = el('div', 'plan__foot');
      foot.appendChild(el('span', 'plan__handle', atHandle(t.handle)));
      var btn = tgLink(t.handle, 'btn ' + (kind === 'premium' ? 'btn--solid' : 'btn--line'));
      if (btn) {
        btn.appendChild(el('span', '', clean(t.cta, 40) || 'Открыть'));
        btn.appendChild(icon('arrow'));
        foot.appendChild(btn);
      }
      card.appendChild(foot);
      grid.appendChild(card);
    });
    wrap.appendChild(grid);
    host.appendChild(wrap);
  }

  /* ---------- Поддержка ---------- */
  function renderSupport(d) {
    var s = d.support || {};
    var host = $('#support');
    var wrap = el('div', 'wrap sec');
    wrap.appendChild(rule());

    var inner = el('div', 'support__in');
    var head = el('div', 'support__head');
    var h2 = el('h2', 'h2', clean(s.title, 80));
    h2.id = 'support-title';
    head.appendChild(reveal(h2));
    inner.appendChild(head);
    inner.appendChild(reveal(el('p', 'support__text', clean(s.text, 160)), 0.08));

    var link = tgLink(s.handle, 'support__link');
    if (link) {
      link.appendChild(el('span', '', atHandle(s.handle)));
      link.appendChild(icon('arrow'));
      inner.appendChild(reveal(link, 0.16));
    }
    wrap.appendChild(inner);
    host.appendChild(wrap);
  }

  /* ---------- Подвал ---------- */
  function renderFooter(d) {
    var f = d.footer || {};
    var wrap = el('div', 'wrap');
    wrap.appendChild(el('span', '', '© ' + new Date().getFullYear() + ' ' + clean(f.left, 60)));
    wrap.appendChild(el('span', '', clean(f.right, 120)));
    $('#foot').appendChild(wrap);
  }

  /* ==========================================================================
     Кристалл: тонкие линии на canvas. Без свечения и градиентов.
     Огранка + орбита с точкой («трекер» следит за лотом).
     ========================================================================== */
  function createGem(canvas) {
    var ctx = canvas.getContext && canvas.getContext('2d');
    if (!ctx) return null;

    var INK = [239, 234, 225];
    var ACC = [205, 184, 148];
    var LIGHT = (function () { var x = -0.45, y = 0.75, z = 0.55, l = Math.sqrt(x * x + y * y + z * z); return [x / l, y / l, z / l]; })();
    var CAM = 4.2;            // дистанция камеры (лёгкая перспектива)
    var CENTER_Y = -0.1;

    /* геометрия: стол (8) → рундист (16) → калетта */
    var V = [], F = [], i, k;
    function addV(x, y, z) { V.push([x, y, z]); return V.length - 1; }
    var T = [], G = [];
    for (i = 0; i < 8; i++) { var a = i * Math.PI / 4; T.push(addV(Math.cos(a) * 0.56, 0.42, Math.sin(a) * 0.56)); }
    for (k = 0; k < 16; k++) { var b = k * Math.PI / 8; G.push(addV(Math.cos(b), 0, Math.sin(b))); }
    var culet = addV(0, -0.95, 0);
    F.push(T.slice());
    for (i = 0; i < 8; i++) {
      var j = (i + 1) % 8;
      F.push([T[i], T[j], G[(2 * i + 1) % 16]]);
      F.push([T[i], G[2 * i], G[(2 * i + 1) % 16]]);
      F.push([T[j], G[(2 * i + 1) % 16], G[(2 * i + 2) % 16]]);
    }
    for (k = 0; k < 16; k++) F.push([G[k], G[(k + 1) % 16], culet]);

    var st = { yaw: 0.55, yawOff: 0, yawT: 0, pitchOff: 0, pitchT: 0, reveal: 1, orbit: 1.1 };
    var W = 0, H = 0, dpr = 1;

    function resize() {
      var r = canvas.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = r.width; H = r.height;
      canvas.width = Math.max(1, Math.round(W * dpr));
      canvas.height = Math.max(1, Math.round(H * dpr));
    }

    function rot(p, yaw, pitch) {
      var cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
      var x = p[0] * cy + p[2] * sy;
      var z = -p[0] * sy + p[2] * cy;
      var y = p[1] * cp - z * sp;
      z = p[1] * sp + z * cp;
      return [x, y, z];
    }
    function rgba(c, a) { return 'rgba(' + (c[0] | 0) + ',' + (c[1] | 0) + ',' + (c[2] | 0) + ',' + a.toFixed(3) + ')'; }
    function mix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }

    function draw() {
      if (!W || !H) return;
      var yaw = st.yaw + st.yawOff, pitch = 0.42 + st.pitchOff;
      var rv = st.reveal;
      var cx = W / 2, cy = H * 0.5;
      var S = Math.min(W * 0.31, H * 0.4) * (0.92 + 0.08 * rv);

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.lineWidth = 1;

      function proj(r) { var s = CAM / (CAM - r[2]); return [cx + r[0] * S * s, cy - r[1] * S * s]; }

      /* точки орбиты: кольцо вокруг кристалла */
      var RING = 1.45, N = 120, ring = [];
      for (i = 0; i <= N; i++) {
        var q = i / N * Math.PI * 2;
        var rr = rot([Math.cos(q) * RING, -0.05, Math.sin(q) * RING], 0, pitch);
        ring.push({ p: proj(rr), z: rr[2] });
      }
      function strokeRing(front) {
        ctx.beginPath();
        var open = false;
        for (var n = 0; n <= N; n++) {
          var inFront = ring[n].z >= 0;
          if (inFront === front) {
            if (!open) { ctx.moveTo(ring[n].p[0], ring[n].p[1]); open = true; } else ctx.lineTo(ring[n].p[0], ring[n].p[1]);
          } else open = false;
        }
        ctx.strokeStyle = rgba(INK, (front ? 0.3 : 0.1) * rv);
        ctx.stroke();
      }
      var oq = st.orbit;
      var orr = rot([Math.cos(oq) * RING, -0.05, Math.sin(oq) * RING], 0, pitch);
      var op = proj(orr);
      function drawDot() {
        var a = (orr[2] >= 0 ? 1 : 0.45) * rv;
        ctx.fillStyle = rgba(ACC, a);
        ctx.beginPath(); ctx.arc(op[0], op[1], 3.2, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = rgba(ACC, 0.45 * a);
        ctx.beginPath(); ctx.arc(op[0], op[1], 8, 0, Math.PI * 2); ctx.stroke();
      }

      /* задняя часть орбиты → кристалл → передняя часть */
      strokeRing(false);
      if (orr[2] < 0) drawDot();

      var P = V.map(function (v) { var r = rot(v, yaw, pitch); return { r: r, p: proj(r) }; });
      var faces = F.map(function (f) {
        var a0 = P[f[0]].r, a1 = P[f[1]].r, a2 = P[f[2]].r;
        var ux = a1[0] - a0[0], uy = a1[1] - a0[1], uz = a1[2] - a0[2];
        var vx = a2[0] - a0[0], vy = a2[1] - a0[1], vz = a2[2] - a0[2];
        var nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
        var cxx = 0, cyy = 0, czz = 0;
        f.forEach(function (idx) { cxx += P[idx].r[0]; cyy += P[idx].r[1]; czz += P[idx].r[2]; });
        cxx /= f.length; cyy /= f.length; czz /= f.length;
        if (nx * cxx + ny * (cyy - CENTER_Y) + nz * czz < 0) { nx = -nx; ny = -ny; nz = -nz; }
        var l = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
        return { f: f, n: [nx / l, ny / l, nz / l], z: czz };
      });
      faces.sort(function (a, b) { return a.z - b.z; });

      function path(f) {
        ctx.beginPath();
        for (var n = 0; n < f.length; n++) { var p = P[f[n]].p; if (n) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]); }
        ctx.closePath();
      }
      /* обратные грани — еле заметный каркас (эффект прозрачного кристалла) */
      ctx.strokeStyle = rgba(INK, 0.08 * rv);
      faces.forEach(function (o) { if (o.n[2] <= 0) { path(o.f); ctx.stroke(); } });

      /* лицевые грани: плоская заливка по свету + тонкая линия */
      faces.forEach(function (o) {
        if (o.n[2] <= 0) return;
        var lam = Math.max(0, o.n[0] * LIGHT[0] + o.n[1] * LIGHT[1] + o.n[2] * LIGHT[2]);
        var t = Math.pow(lam, 1.5);
        path(o.f);
        ctx.fillStyle = rgba(mix(INK, ACC, Math.min(1, t * 1.6)), (0.03 + 0.34 * t) * rv);
        ctx.fill();
        ctx.strokeStyle = rgba(INK, 0.46 * rv);
        ctx.stroke();
      });

      strokeRing(true);
      if (orr[2] >= 0) drawDot();
    }

    return { st: st, draw: draw, resize: resize };
  }

  /* ---------- Анимации ---------- */
  function showAll() {
    $$('[data-reveal]').forEach(function (n) { n.style.opacity = ''; n.style.transform = ''; });
    $$('[data-rule]').forEach(function (n) { n.style.transform = ''; });
  }

  function setupGem(A) {
    var canvas = $('.stage canvas');
    var stageIn = $('.stage__in');
    var stage = $('.stage');
    var gem = canvas && createGem(canvas);
    if (!gem) return;
    var st = gem.st;

    function sizeAndDraw() { gem.resize(); gem.draw(); }
    sizeAndDraw();
    if (window.ResizeObserver) new ResizeObserver(sizeAndDraw).observe(canvas);
    else window.addEventListener('resize', sizeAndDraw);

    if (reduceMotion || !A) { st.reveal = 1; gem.draw(); return; }

    /* появление: кристалл плавно «проявляется» */
    st.reveal = 0;
    A.animate(st, { reveal: 1, duration: 2600, delay: 450, ease: 'outQuart', onUpdate: function () { if (!raf) gem.draw(); } });

    /* медленное вращение + мягкая реакция на мышь */
    var raf = 0, last = 0, visible = true, tabOn = !doc.hidden;
    function frame(ts) {
      raf = 0;
      var dt = last ? Math.min((ts - last) / 1000, 0.05) : 0.016;
      last = ts;
      st.yaw += dt * 0.16;
      st.orbit += dt * 0.42;
      var k = 1 - Math.exp(-dt * 3.2);
      st.yawOff += (st.yawT - st.yawOff) * k;
      st.pitchOff += (st.pitchT - st.pitchOff) * k;
      gem.draw();
      if (visible && tabOn) raf = requestAnimationFrame(frame);
    }
    function kick() { if (!raf && visible && tabOn) { last = 0; raf = requestAnimationFrame(frame); } }
    if (window.IntersectionObserver) {
      new IntersectionObserver(function (en) { visible = en[0].isIntersecting; kick(); }).observe(stage);
    }
    doc.addEventListener('visibilitychange', function () { tabOn = !doc.hidden; kick(); });
    kick();

    if (finePointer && !weak) {
      window.addEventListener('pointermove', function (e) {
        if (e.pointerType && e.pointerType !== 'mouse') return;
        st.yawT = (e.clientX / window.innerWidth - 0.5) * 0.8;
        st.pitchT = (e.clientY / window.innerHeight - 0.5) * 0.16;
      }, { passive: true });
    }

    /* лёгкий параллакс при прокрутке */
    var ticking = false;
    window.addEventListener('scroll', function () {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(function () {
        ticking = false;
        var y = window.pageYOffset || 0;
        if (y < window.innerHeight * 1.3) stageIn.style.transform = 'translate3d(0,' + (y * 0.07).toFixed(1) + 'px,0)';
      });
    }, { passive: true });
  }

  function setupMotion() {
    var NT = window.NT;
    var A = NT && NT.anime;
    var M = NT && NT.motion;

    /* шапка меняет фон после небольшой прокрутки */
    var top = $('#top');
    function onScroll() { top.classList.toggle('scrolled', (window.pageYOffset || 0) > 8); }
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();

    setupGem(reduceMotion ? null : A);

    if (reduceMotion || !A || !M || !window.IntersectionObserver) { showAll(); return; }

    /* 1. Стартовые состояния (скрыты под экраном загрузки) */
    $$('.top__in > *, .kicker, .lead, .steps li, .more, .ticket').forEach(function (n) { n.style.opacity = '0'; });
    $$('.hero .wi').forEach(function (n) { n.style.transform = 'translateY(110%)'; });
    $$('[data-reveal]').forEach(function (n) { n.style.opacity = '0'; n.style.transform = 'translateY(24px)'; });
    $$('[data-rule]').forEach(function (n) { n.style.transform = 'scaleX(0)'; });

    /* 2. Интро — Anime.js: мягкие кривые, небольшие смещения */
    var tl = A.createTimeline({ defaults: { ease: 'outQuart', duration: 1200 } });
    tl.add('.top__in > *', { opacity: [0, 1], duration: 1000, delay: A.stagger(100) }, 100)
      .add('.kicker', { opacity: [0, 1], translateY: [10, 0] }, 250)
      .add('.hero .wi', { translateY: ['110%', '0%'], duration: 1500, delay: A.stagger(90) }, 350)
      .add('.lead', { opacity: [0, 1], translateY: [14, 0] }, 1000)
      .add('.steps li', { opacity: [0, 1], translateY: [14, 0], delay: A.stagger(110) }, 1200)
      .add('.more', { opacity: [0, 1] }, 1700)
      .add('.ticket', { opacity: [0, 1], translateY: [14, 0], duration: 1400 }, 1900);

    /* 3. Появление при скролле — Motion (inView), один раз */
    M.inView('[data-reveal]', function (node) {
      var delay = parseFloat(node.getAttribute('data-delay')) || 0;
      var a = M.animate(node,
        { opacity: [0, 1], transform: ['translateY(24px)', 'translateY(0px)'] },
        { duration: 1.1, delay: delay, ease: EASE });
      var done = function () { node.style.opacity = ''; node.style.transform = ''; };
      if (a && a.finished && a.finished.then) a.finished.then(done, done);
      else setTimeout(done, (1.1 + delay) * 1000 + 80);
    }, { amount: 0.2, margin: '0px 0px -6% 0px' });

    M.inView('[data-rule]', function (node) {
      var a = M.animate(node, { transform: ['scaleX(0)', 'scaleX(1)'] }, { duration: 1.6, ease: EASE });
      var done = function () { node.style.transform = ''; };
      if (a && a.finished && a.finished.then) a.finished.then(done, done);
      else setTimeout(done, 1700);
    }, { amount: 0.1 });
  }

  /* ---------- Запуск ---------- */
  function bootDone() {
    var node = $('#boot');
    if (!node) return;
    node.classList.add('done');
    setTimeout(function () { if (node.parentNode) node.parentNode.removeChild(node); }, 800);
  }

  function fail() {
    var b = $('#boot');
    if (b && b.parentNode) b.parentNode.removeChild(b);
    var f = $('#fallback');
    if (f) f.classList.add('show');
  }

  function render(d) {
    renderHeader(d);
    renderHero(d);
    renderTrackers(d);
    renderSupport(d);
    renderFooter(d);
  }

  function fontsReady() {
    var ready = doc.fonts && doc.fonts.ready ? doc.fonts.ready : Promise.resolve();
    var timeout = new Promise(function (res) { setTimeout(res, 800); });
    return Promise.race([ready, timeout]);
  }

  function start() {
    fetch('data/site.json', { credentials: 'same-origin' })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (d) { return fontsReady().then(function () { return d; }); })
      .then(function (d) {
        render(d);
        setupMotion();
        bootDone();
      })
      .catch(function (err) {
        if (window.console && console.error) console.error('[site] не удалось отрисовать страницу:', err);
        fail();
      });
  }

  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', start);
  else start();
})();
