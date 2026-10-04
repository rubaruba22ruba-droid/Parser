/* ==========================================================================
   NFT Tracker — рендер страницы из data/site.json + анимации.

   Безопасность:
   • весь текст вставляется через textContent (никакого innerHTML с данными);
   • ссылки строятся только как https://t.me/<handle>, handle проходит проверку по маске;
   • страница не встраивается в чужой <iframe>.

   Анимации: Anime.js (интро, счётчики, рисование галочек) + Motion (появление при скролле,
   Фон — sky.js (сакура и лепестки), герой — pepe.js (анимированный Plush Pepe).
   Учитывает prefers-reduced-motion и слабые устройства.
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
  var FX = window.NTFX || {};

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
  function num(v, def) { v = Number(v); return isFinite(v) && v >= 0 ? v : def; }

  function tgUrl(handle) {
    handle = clean(handle, 40).replace(/^@/, '');
    return HANDLE_RE.test(handle) ? 'https://t.me/' + handle : null;
  }
  function atHandle(handle) { return '@' + clean(handle, 40).replace(/^@/, ''); }
  function fmt(n) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' '); }

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
  /* выполнить cb после окончания анимации (с запасным таймером, если Promise недоступен) */
  function after(anim, cb, ms) {
    if (anim && typeof anim.then === 'function') anim.then(cb, cb);
    else if (anim && anim.finished && typeof anim.finished.then === 'function') anim.finished.then(cb, cb);
    else setTimeout(cb, ms || 800);
  }

  /* ---------- Шапка ---------- */
  function renderHeader(d) {
    var host = $('#top');
    var wrap = el('div', 'wrap top__in');

    var brand = el('a', 'brand');
    brand.href = '#hero';
    var mark = el('span', 'brand__mark');
    mark.appendChild(icon('flower'));
    brand.appendChild(mark);
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

    /* голова: чип, заголовок, подзаголовок */
    var head = el('div', 'hero__head');
    var chip = el('p', 'chip');
    chip.appendChild(el('span', 'dot'));
    chip.appendChild(el('span', '', clean(h.chip, 60)));
    head.appendChild(chip);

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
    head.appendChild(h1);
    head.appendChild(el('p', 'lead', clean(h.lead, 200)));
    wrap.appendChild(head);

    /* низ: шаги и кнопка */
    var foot = el('div', 'hero__foot');
    var ol = el('ol', 'steps');
    list(h.steps, 4).forEach(function (s, i) {
      var li = el('li');
      li.appendChild(el('b', '', '0' + (i + 1)));
      li.appendChild(doc.createTextNode(clean(s, 40)));
      ol.appendChild(li);
    });
    foot.appendChild(ol);
    if (clean(h.cta, 40)) {
      var cta = el('div', 'cta');
      var a = el('a', 'btn btn--solid');
      a.href = '#trackers';
      a.appendChild(el('span', '', clean(h.cta, 40)));
      a.appendChild(icon('down'));
      cta.appendChild(a);
      foot.appendChild(cta);
    }
    wrap.appendChild(foot);

    wrap.appendChild(renderStage(d.pepe || {}));
    host.appendChild(wrap);
  }

  /* Сцена героя: контейнер для анимированного Plush Pepe (рисует pepe.js) */
  function renderStage(m) {
    var stage = el('div', 'stage');
    var inner = el('div', 'stage__in');
    var box = el('div', 'pepe');
    box.setAttribute('role', 'img');
    box.setAttribute('aria-label', clean(m && m.alt, 120) || 'Plush Pepe');
    /* путь к оригинальной анимации (Lottie) — только внутри assets/ */
    var src = clean(m && m.src, 120);
    if (/^assets\/[A-Za-z0-9_\-\/.]+\.json$/.test(src) && src.indexOf('..') === -1) box.setAttribute('data-src', src);
    inner.appendChild(box);
    stage.appendChild(inner);
    return stage;
  }

  /* ---------- Бегущая строка ---------- */
  function renderMarquee(d) {
    var items = list(d.marquee, 24).map(function (s) { return clean(s, 30); }).filter(Boolean);
    var host = $('#marquee');
    if (!items.length) { host.parentNode.removeChild(host); return; }
    var track = el('div', 'marquee__track');
    for (var copy = 0; copy < 4; copy++) {
      items.forEach(function (s) {
        var it = el('span', 'marquee__item');
        it.appendChild(el('span', '', s));
        it.appendChild(icon('petal'));
        track.appendChild(it);
      });
    }
    host.appendChild(track);
  }

  /* ---------- Трекеры ---------- */
  function renderTrackers(d) {
    var tr = d.trackers || {};
    var host = $('#trackers');
    var wrap = el('div', 'wrap sec');

    var head = el('div', 'sec__head');
    var h2 = el('h2', 'h2', clean(tr.title, 60));
    h2.id = 'trackers-title';
    head.appendChild(reveal(h2));
    wrap.appendChild(head);

    var grid = el('div', 'plans');
    list(tr.items, 3).forEach(function (t, i) {
      if (!t) return;
      var kind = t.id === 'premium' ? 'premium' : 'free';
      var slot = reveal(el('div', 'plans__slot'), i * 0.12);
      var card = el('article', 'plan plan--' + kind);

      var top = el('div', 'plan__top');
      top.appendChild(el('span', 'plan__label', clean(t.label, 30)));
      if (clean(t.badge, 24)) top.appendChild(el('span', 'plan__badge', clean(t.badge, 24)));
      card.appendChild(top);

      var price = el('p', 'plan__price');
      var pn = num(t.priceNum, -1);
      if (pn >= 0) {
        var b = el('b', '', fmt(pn));
        b.setAttribute('data-count', String(pn));
        price.appendChild(b);
        if (clean(t.priceUnit, 12)) price.appendChild(el('em', '', clean(t.priceUnit, 12)));
      } else {
        price.className += ' plan__price--text';
        price.appendChild(el('b', '', clean(t.price, 24)));
      }
      card.appendChild(price);
      if (clean(t.priceNote, 60)) card.appendChild(el('p', 'plan__note', clean(t.priceNote, 60)));
      if (clean(t.lead, 120)) card.appendChild(el('p', 'plan__lead', clean(t.lead, 120)));

      var ul = el('ul', 'plan__points');
      list(t.points, 6).forEach(function (p) {
        var li = el('li');
        var tick = el('span', 'tick');
        var s = svgEl('svg', { viewBox: '0 0 24 24', 'aria-hidden': 'true', focusable: 'false' });
        s.appendChild(svgEl('path', { d: 'M5 12.5l4.5 4.5L19 7.5', fill: 'none', stroke: 'currentColor', 'stroke-width': '3', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
        tick.appendChild(s);
        li.appendChild(tick);
        li.appendChild(el('span', '', clean(p, 90)));
        ul.appendChild(li);
      });
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
      slot.appendChild(card);
      grid.appendChild(slot);
    });
    wrap.appendChild(grid);
    host.appendChild(wrap);
  }

  /* ---------- Поддержка ---------- */
  function renderSupport(d) {
    var s = d.support || {};
    var host = $('#support');
    var wrap = el('div', 'wrap sec');
    var box = reveal(el('div', 'support__box'));

    var txt = el('div');
    var h2 = el('h2', 'h2', clean(s.title, 80));
    h2.id = 'support-title';
    txt.appendChild(h2);
    txt.appendChild(el('p', 'support__text', clean(s.text, 160)));
    box.appendChild(txt);

    var link = tgLink(s.handle, 'support__link');
    if (link) {
      link.appendChild(el('span', '', atHandle(s.handle)));
      link.appendChild(icon('arrow'));
      box.appendChild(link);
    }
    wrap.appendChild(box);
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
     Анимации и живость
     ========================================================================== */
  function showAll() {
    $$('[data-reveal]').forEach(function (n) { n.style.opacity = ''; n.style.transform = ''; n.style.filter = ''; });
  }

  function clearStyles(node) { node.style.opacity = ''; node.style.transform = ''; node.style.filter = ''; }

  /* прогресс прокрутки, фон шапки, параллакс ветки и сцены, ускорение кристалла */
  function setupScroll(pepe) {
    var top = $('#top');
    var bar = $('#progress i');
    var canopy = $('#canopy');
    var stageIn = $('.stage__in');
    var wide = mq('(min-width: 980px)');
    var ticking = false, lastY = window.pageYOffset || 0;
    var track = $('.marquee__track'), mAnim = null, rate = 1, rateT = 1, rateRaf = 0;
    function marqueeStep() {
      rateRaf = 0;
      rate += (rateT - rate) * 0.08;
      rateT += (1 - rateT) * 0.04;
      if (mAnim) mAnim.updatePlaybackRate(rate);
      if (Math.abs(rate - 1) > 0.015 || Math.abs(rateT - 1) > 0.015) rateRaf = requestAnimationFrame(marqueeStep);
      else if (mAnim) mAnim.updatePlaybackRate(1);
    }

    function update() {
      ticking = false;
      var y = window.pageYOffset || 0;
      var max = Math.max(1, root.scrollHeight - window.innerHeight);
      top.classList.toggle('scrolled', y > 8);
      if (bar) bar.style.transform = 'scaleX(' + Math.min(1, y / max).toFixed(4) + ')';
      if (!reduceMotion) {
        if (canopy && y < window.innerHeight * 1.4) canopy.style.transform = 'translate3d(0,' + (y * 0.2).toFixed(1) + 'px,0)';
        if (stageIn && wide && y < window.innerHeight * 1.3) stageIn.style.transform = 'translate3d(0,' + (y * 0.07).toFixed(1) + 'px,0)';
        if (pepe && pepe.nudge) pepe.nudge((y - lastY) * 0.0016);
        if (track && track.getAnimations) {
          if (!mAnim) mAnim = track.getAnimations()[0] || null;
          if (mAnim) { rateT = Math.min(6, 1 + Math.abs(y - lastY) * 0.12); if (!rateRaf) rateRaf = requestAnimationFrame(marqueeStep); }
        }
      }
      lastY = y;
    }
    window.addEventListener('scroll', function () { if (!ticking) { ticking = true; requestAnimationFrame(update); } }, { passive: true });
    update();
  }

  /* магнитные кнопки: тянутся к курсору (только мышь) */
  function setupMagnetic() {
    if (!finePointer || reduceMotion || weak) return;
    $$('.btn, .support__link').forEach(function (n) {
      var raf = 0, tx = 0, ty = 0;
      function apply() { raf = 0; n.style.transform = 'translate3d(' + tx.toFixed(1) + 'px,' + ty.toFixed(1) + 'px,0)'; }
      n.addEventListener('pointermove', function (e) {
        var r = n.getBoundingClientRect();
        tx = (e.clientX - (r.left + r.width / 2)) * 0.18;
        ty = (e.clientY - (r.top + r.height / 2)) * 0.28;
        if (!raf) raf = requestAnimationFrame(apply);
      });
      n.addEventListener('pointerleave', function () { tx = 0; ty = 0; if (!raf) raf = requestAnimationFrame(apply); });
    });
  }

  /* лёгкий 3D-наклон карточек тарифов (только мышь) */
  function setupTilt() {
    if (!finePointer || reduceMotion || weak) return;
    $$('.plan').forEach(function (n) {
      n.addEventListener('pointermove', function (e) {
        var r = n.getBoundingClientRect();
        var px = (e.clientX - r.left) / r.width - 0.5, py = (e.clientY - r.top) / r.height - 0.5;
        n.style.setProperty('--ry', (px * 5).toFixed(2) + 'deg');
        n.style.setProperty('--rx', (-py * 4).toFixed(2) + 'deg');
      });
      n.addEventListener('pointerleave', function () { n.style.setProperty('--ry', '0deg'); n.style.setProperty('--rx', '0deg'); });
    });
  }

  function setupMotion(d) {
    var NT = window.NT;
    var A = NT && NT.anime;
    var M = NT && NT.motion;
    var pepeBox = $('.pepe');
    var pepe = (FX.pepe && pepeBox) ? FX.pepe.create(pepeBox, { reduce: reduceMotion, lite: weak, pointer: finePointer && !weak, src: pepeBox.getAttribute('data-src') || '' }) : null;
    if (pepe) pepe.start();

    setupScroll(pepe);
    setupMagnetic();
    setupTilt();

    if (reduceMotion || !A || !M || !window.IntersectionObserver) { showAll(); return; }

    /* 1. Стартовые состояния (скрыты под экраном загрузки) */
    $$('.top__in > *, .chip, .lead, .steps li, .cta, .stage__in').forEach(function (n) { n.style.opacity = '0'; });
    $$('.hero .wi').forEach(function (n) { n.style.transform = 'translateY(112%)'; });
    $$('[data-reveal]').forEach(function (n) { n.style.opacity = '0'; n.style.transform = 'translateY(28px)'; n.style.filter = 'blur(8px)'; });

    /* 2. Интро — Anime.js */
    var tl = A.createTimeline({ defaults: { ease: 'outQuart', duration: 1200 } });
    tl.add('.top__in > *', { opacity: [0, 1], translateY: [-12, 0], duration: 1000, delay: A.stagger(100) }, 150)
      .add('.chip', { opacity: [0, 1], translateY: [12, 0] }, 300)
      .add('.hero .wi', { translateY: ['112%', '0%'], duration: 1500, delay: A.stagger(95) }, 420)
      .add('.lead', { opacity: [0, 1], translateY: [16, 0] }, 1050)
      .add('.steps li', { opacity: [0, 1], translateY: [18, 0], delay: A.stagger(120) }, 1250)
      .add('.cta', { opacity: [0, 1], translateY: [18, 0] }, 1600)
      .add('.stage__in', { opacity: [0, 1], translateY: [24, 0], duration: 1600 }, 700);

    /* «фокус»: слова заголовка и подзаголовок проявляются из размытия */
    $$('.hero .wi').forEach(function (w, i) {
      var a = M.animate(w, { filter: ['blur(12px)', 'blur(0px)'] }, { duration: 1.3, delay: 0.45 + i * 0.095, ease: EASE });
      after(a, function () { w.style.filter = ''; }, 2200);
    });
    var lead = $('.lead');
    if (lead) {
      var la = M.animate(lead, { filter: ['blur(8px)', 'blur(0px)'] }, { duration: 1.2, delay: 1.1, ease: EASE });
      after(la, function () { lead.style.filter = ''; }, 2400);
    }

    /* 3. Появление при скролле — Motion (inView), один раз: сдвиг + фокус */
    M.inView('[data-reveal]', function (node) {
      var delay = parseFloat(node.getAttribute('data-delay')) || 0;
      var a = M.animate(node,
        { opacity: [0, 1], transform: ['translateY(28px)', 'translateY(0px)'], filter: ['blur(8px)', 'blur(0px)'] },
        { duration: 1.15, delay: delay, ease: EASE });
      after(a, function () { clearStyles(node); }, (1.15 + delay) * 1000 + 80);
    }, { amount: 0.18, margin: '0px 0px -6% 0px' });

    /* 4. Карточки тарифов: цена «набегает», галочки рисуются */
    M.inView('.plan', function (card) {
      var cnt = $('[data-count]', card);
      if (cnt) {
        var tv = parseInt(cnt.getAttribute('data-count'), 10) || 0, ob = { v: 0 };
        cnt.textContent = '0';
        A.animate(ob, { v: tv, duration: 1400, delay: 400, ease: 'outExpo', onUpdate: function () { cnt.textContent = fmt(ob.v); }, onComplete: function () { cnt.textContent = fmt(tv); } });
      }
      var paths = $$('.tick path', card);
      if (paths.length) {
        paths.forEach(function (p) { p.style.strokeDashoffset = '24'; });
        A.animate(paths, { strokeDashoffset: [24, 0], duration: 650, delay: A.stagger(160, { start: 650 }), ease: 'outQuad' });
      }
    }, { amount: 0.35 });
  }

  /* ---------- Запуск ---------- */
  function bootDone() {
    var node = $('#boot');
    if (!node) return;
    node.classList.add('done');
    setTimeout(function () { if (node.parentNode) node.parentNode.removeChild(node); }, 900);
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
    renderMarquee(d);
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
        setupMotion(d);
        if (FX.sky) FX.sky.init({ lite: weak, reduce: reduceMotion });
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
