/* ==========================================================================
   NFT Tracker — рендер страницы из data/site.json + анимации.

   Безопасность:
   • весь текст вставляется через textContent (никакого innerHTML с данными);
   • ссылки строятся только как https://t.me/<handle>, handle проходит проверку по маске;
   • страница не встраивается в чужой <iframe>.

   Анимации: Anime.js (интро, график, счётчик) + Motion (появление при скролле, hover/press).
   Всё через transform/opacity. Учитывает prefers-reduced-motion и слабые устройства.
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
  var EASE = [0.22, 1, 0.36, 1];

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
  function tgLink(handle, cls, label, iconName) {
    var url = tgUrl(handle);
    if (!url) return null;
    var a = el('a', cls);
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    if (iconName) a.appendChild(icon(iconName));
    a.appendChild(el('span', '', label));
    if (!iconName) a.appendChild(icon('arrow'));
    return a;
  }
  function fmt(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' '); }
  function reveal(node, delay) {
    node.setAttribute('data-reveal', '');
    if (delay) node.setAttribute('data-delay', String(delay));
    return node;
  }

  /* ---------- Шапка ---------- */
  function renderHeader(d) {
    var host = $('#top');
    var wrap = el('div', 'wrap top__in');

    var brand = el('a', 'brand');
    brand.href = '#hero';
    var mark = svgEl('svg', { 'class': 'brand__mark', viewBox: '0 0 64 64', 'aria-hidden': 'true', focusable: 'false' });
    mark.appendChild(svgEl('rect', { width: '64', height: '64', rx: '18', fill: '#0d0e1a' }));
    mark.appendChild(svgEl('rect', { x: '.75', y: '.75', width: '62.5', height: '62.5', rx: '17.25', fill: 'none', stroke: 'rgba(255,255,255,.14)', 'stroke-width': '1.5' }));
    mark.appendChild(svgEl('circle', { 'class': 'logo-ring', cx: '32', cy: '32', r: '23', fill: 'none', stroke: 'url(#g-brand)', 'stroke-width': '3.4', 'stroke-linecap': 'round' }));
    var gem = svgEl('use', { href: '#i-gem', x: '19', y: '19', width: '26', height: '26' });
    mark.appendChild(gem);
    brand.appendChild(mark);
    brand.appendChild(el('span', '', clean(d.brand && d.brand.name, 40)));
    wrap.appendChild(brand);

    var nav = el('nav', 'nav');
    nav.setAttribute('aria-label', 'Разделы');
    list(d.nav, 6).forEach(function (n) {
      var href = clean(n && n.href, 30);
      var label = clean(n && n.label, 40);
      if (!/^#[a-z0-9_-]+$/i.test(href) || !label) return;
      var a = el('a', '', label);
      a.href = href;
      nav.appendChild(a);
    });
    wrap.appendChild(nav);

    var support = d.support || {};
    var btn = tgLink(support.handle, 'btn btn--ghost btn--sm', clean(d.navSupport, 30) || 'Поддержка', 'tg');
    if (btn) wrap.appendChild(btn);

    host.appendChild(wrap);
  }

  /* ---------- Hero + демо-карточка ---------- */
  function findTracker(d, id) {
    var t = list(d.trackers, 6);
    for (var i = 0; i < t.length; i++) { if (t[i] && t[i].id === id) return t[i]; }
    return null;
  }

  function renderHero(d) {
    var h = d.hero || {};
    var host = $('#hero');
    var wrap = el('div', 'wrap hero__in');

    var copy = el('div', 'hero__copy');
    var eyebrow = el('p', 'eyebrow');
    eyebrow.appendChild(el('span', 'dot'));
    eyebrow.appendChild(el('span', '', clean(h.eyebrow, 80)));
    copy.appendChild(eyebrow);

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
    copy.appendChild(el('p', 'lead', clean(h.lead, 300)));

    var cta = el('div', 'cta-row');
    var prem = findTracker(d, 'premium');
    var free = findTracker(d, 'free');
    var b1 = prem && tgLink(prem.handle, 'btn btn--premium', clean(h.primaryCta, 40), null);
    var b2 = free && tgLink(free.handle, 'btn btn--free', clean(h.secondaryCta, 40), null);
    if (b1) cta.appendChild(b1);
    if (b2) cta.appendChild(b2);
    copy.appendChild(cta);
    wrap.appendChild(copy);

    wrap.appendChild(renderDemo(d.demo || {}));
    host.appendChild(wrap);
  }

  function renderDemo(m) {
    var visual = el('div', 'visual');
    var outer = el('div', 'lot-wrap');
    var floaty = el('div', 'lot-float');
    var card = el('article', 'lot');
    card.setAttribute('aria-label', clean(m.tag, 60));

    card.appendChild(el('span', 'lot__tag', clean(m.tag, 40)));

    var head = el('div', 'lot__head');
    var gift = el('div', 'gift');
    var gs = svgEl('svg', { viewBox: '0 0 64 64', 'aria-hidden': 'true', focusable: 'false' });
    var gu = svgEl('use', { href: '#i-gem' });
    gu.setAttributeNS(XLINK_NS, 'xlink:href', '#i-gem');
    gs.appendChild(gu);
    gift.appendChild(gs);
    head.appendChild(gift);

    var name = el('div');
    var nm = el('div', 'lot__name', clean(m.gift, 40));
    nm.appendChild(el('small', '', clean(m.number, 20)));
    name.appendChild(nm);
    name.appendChild(el('div', 'lot__sub', clean(m.priceLabel, 40)));
    head.appendChild(name);
    card.appendChild(head);

    var price = parseInt(m.price, 10);
    if (!isFinite(price) || price < 0) price = 0;
    var priceRow = el('div', 'lot__price');
    priceRow.appendChild(icon('star'));
    var num = el('b', 'lot__num', fmt(price));
    num.setAttribute('data-value', String(price));
    priceRow.appendChild(num);
    priceRow.appendChild(el('span', 'chip', clean(m.belowMarket, 30)));
    card.appendChild(priceRow);

    /* мини-график цены (в духе Bklit UI): линия уходит ниже «рынка» */
    var line = 'M4 24 C 34 22, 50 40, 82 36 S 130 16, 162 38 S 216 52, 246 62 S 282 74, 292 76';
    var chart = svgEl('svg', { 'class': 'chart', viewBox: '0 0 300 96', 'aria-hidden': 'true', focusable: 'false' });
    chart.appendChild(svgEl('line', { 'class': 'chart__floor', x1: '0', x2: '300', y1: '46', y2: '46' }));
    var lbl = svgEl('text', { 'class': 'chart__label', x: '298', y: '38', 'text-anchor': 'end' });
    lbl.textContent = clean(m.marketLabel, 20);
    chart.appendChild(lbl);
    chart.appendChild(svgEl('path', { 'class': 'chart__area', d: line + ' L292 96 L4 96 Z', fill: 'url(#g-area)' }));
    chart.appendChild(svgEl('path', { 'class': 'chart__line', d: line, stroke: 'url(#g-brand)' }));
    chart.appendChild(svgEl('circle', { 'class': 'chart__pulse', cx: '292', cy: '76', r: '6' }));
    chart.appendChild(svgEl('circle', { 'class': 'chart__dot', cx: '292', cy: '76', r: '4.5' }));
    card.appendChild(chart);

    card.appendChild(el('p', 'lot__seller', clean(m.seller, 120)));
    card.appendChild(el('div', 'work', clean(m.button, 20)));

    floaty.appendChild(card);
    outer.appendChild(floaty);
    visual.appendChild(outer);
    visual.appendChild(el('p', 'demo-note', clean(m.note, 140)));
    return visual;
  }

  /* ---------- Трекеры ---------- */
  function sectionHead(titleId, title, lead) {
    var head = el('div', 'sec__head');
    var h2 = el('h2', 'h2', clean(title, 100));
    h2.id = titleId;
    head.appendChild(h2);
    if (lead) head.appendChild(el('p', 'sec__lead', clean(lead, 240)));
    return reveal(head);
  }

  function renderTrackers(d) {
    var host = $('#trackers');
    var wrap = el('div', 'wrap sec');
    wrap.appendChild(sectionHead('trackers-title', d.trackersTitle, d.trackersLead));

    var cards = el('div', 'cards');
    list(d.trackers, 4).forEach(function (t, i) {
      if (!t) return;
      var kind = t.id === 'premium' ? 'premium' : 'free';
      var slot = reveal(el('div', 'cards__slot'), i * 0.12);
      var card = el('article', 'card card--' + kind);
      var inner = el('div', 'card__in');

      var top = el('div', 'card__top');
      top.appendChild(el('span', 'badge badge--' + kind, clean(t.badge, 24)));
      top.appendChild(el('span', 'handle', atHandle(t.handle)));
      inner.appendChild(top);

      inner.appendChild(el('h3', 'card__name', clean(t.name, 60)));
      inner.appendChild(el('p', 'card__desc', clean(t.description, 200)));

      var ul = el('ul', 'features');
      list(t.features, 10).forEach(function (f) {
        var li = el('li');
        li.appendChild(icon('check'));
        li.appendChild(el('span', '', clean(f, 120)));
        ul.appendChild(li);
      });
      inner.appendChild(ul);

      var p = t.price || {};
      if (clean(p.value, 20)) {
        var price = el('div', 'price');
        price.appendChild(el('b', '', clean(p.value, 20)));
        price.appendChild(el('span', '', clean(p.note, 60)));
        if (clean(p.hint, 80)) price.appendChild(el('small', '', clean(p.hint, 80)));
        inner.appendChild(price);
      }

      var btn = tgLink(t.handle, 'btn btn--block btn--' + kind, clean(t.cta, 40), null);
      if (btn) inner.appendChild(btn);

      card.appendChild(inner);
      slot.appendChild(card);
      cards.appendChild(slot);
    });
    wrap.appendChild(cards);
    host.appendChild(wrap);
  }

  /* ---------- Шаги ---------- */
  function renderSteps(d) {
    var host = $('#steps');
    var wrap = el('div', 'wrap sec');
    wrap.appendChild(sectionHead('steps-title', d.stepsTitle));
    var ol = el('ol', 'steps-list');
    list(d.steps, 6).forEach(function (s, i) {
      if (!s) return;
      var li = reveal(el('li', 'step'), i * 0.1);
      li.appendChild(el('span', 'step__n', String(i + 1)));
      li.appendChild(el('h3', '', clean(s.title, 60)));
      li.appendChild(el('p', '', clean(s.text, 160)));
      ol.appendChild(li);
    });
    wrap.appendChild(ol);
    host.appendChild(wrap);
  }

  /* ---------- Поддержка ---------- */
  function renderSupport(d) {
    var s = d.support || {};
    var host = $('#support');
    var wrap = el('div', 'wrap sec');
    var box = reveal(el('div', 'support__box'));

    var ic = el('div', 'support__icon');
    ic.appendChild(icon('chat'));
    box.appendChild(ic);

    var txt = el('div');
    var h2 = el('h2', 'h2', clean(s.title, 100));
    h2.id = 'support-title';
    h2.style.fontSize = 'clamp(1.4rem, 2.4vw + .8rem, 2rem)';
    txt.appendChild(h2);
    txt.appendChild(el('p', '', clean(s.text, 240)));
    box.appendChild(txt);

    var btn = tgLink(s.handle, 'btn btn--premium', clean(s.cta, 40) + ' ' + atHandle(s.handle), 'tg');
    if (btn) box.appendChild(btn);

    wrap.appendChild(box);
    host.appendChild(wrap);
  }

  /* ---------- Подвал ---------- */
  function renderFooter(d) {
    var f = d.footer || {};
    var host = $('#foot');
    var wrap = el('div', 'wrap');
    wrap.appendChild(el('p', '', '© ' + new Date().getFullYear() + ' ' + clean(f.text, 160)));
    if (clean(f.note, 200)) wrap.appendChild(el('p', '', clean(f.note, 200)));
    host.appendChild(wrap);
  }

  /* ---------- Анимации ---------- */
  function showAll() {
    $$('[data-reveal]').forEach(function (n) { n.style.opacity = ''; n.style.transform = ''; });
  }

  function setupMotion() {
    var NT = window.NT;
    var price = $('.lot__num');
    var finalPrice = price ? fmt(price.getAttribute('data-value')) : '';

    if (reduceMotion || !NT || !window.IntersectionObserver) { showAll(); return; }
    var A = NT.anime;
    var M = NT.motion;

    /* 1. Стартовые состояния (до первого кадра — под экраном загрузки) */
    $$('.top__in > *, .eyebrow, .lead, .hero .cta-row .btn, .lot-wrap').forEach(function (n) { n.style.opacity = '0'; });
    $$('.hero .wi').forEach(function (n) { n.style.transform = 'translateY(115%)'; });
    $$('[data-reveal]').forEach(function (n) { n.style.opacity = '0'; n.style.transform = 'translateY(30px)'; });
    var chartLine = $('.chart__line');
    var chartArea = $('.chart__area');
    var chartDots = $$('.chart__dot, .chart__pulse');
    if (chartArea) chartArea.style.opacity = '0';
    chartDots.forEach(function (n) { n.style.opacity = '0'; });
    if (price) price.textContent = '0';

    /* 2. Интро — Anime.js (таймлайн + stagger + рисование SVG) */
    var tl = A.createTimeline({ defaults: { ease: 'outExpo', duration: 1000 } });
    tl.add('.top__in > *', { opacity: [0, 1], translateY: [-14, 0], duration: 800, delay: A.stagger(90) }, 0)
      .add('.eyebrow', { opacity: [0, 1], translateY: [16, 0] }, 150)
      .add('.hero .wi', { translateY: ['115%', '0%'], duration: 1150, delay: A.stagger(85) }, 260)
      .add('.hero .lead', { opacity: [0, 1], translateY: [18, 0] }, 760)
      .add('.hero .cta-row .btn', { opacity: [0, 1], translateY: [22, 0], delay: A.stagger(90) }, 900)
      .add('.lot-wrap', { opacity: [0, 1], translateY: [56, 0], rotate: [3, 0], duration: 1400 }, 520);

    var ring = $('.logo-ring');
    if (ring && A.svg && A.svg.createDrawable) {
      A.animate(A.svg.createDrawable(ring), { draw: ['0 0', '0 1'], duration: 1500, ease: 'inOutQuad', delay: 250 });
    }

    /* график + счётчик цены */
    if (chartLine && A.svg && A.svg.createDrawable) {
      A.animate(A.svg.createDrawable(chartLine), { draw: ['0 0', '0 1'], duration: 1900, ease: 'inOutQuad', delay: 1000 });
    }
    if (chartArea) A.animate(chartArea, { opacity: [0, 1], duration: 900, delay: 2000, ease: 'outQuad' });
    if (chartDots.length) A.animate(chartDots, { opacity: [0, 1], duration: 500, delay: 2700, ease: 'outQuad' });
    if (price) {
      var counter = { v: 0 };
      var target = parseInt(price.getAttribute('data-value'), 10) || 0;
      A.animate(counter, {
        v: target,
        duration: 1900,
        delay: 1000,
        ease: 'outExpo',
        onUpdate: function () { price.textContent = fmt(Math.round(counter.v)); },
        onComplete: function () { price.textContent = finalPrice; }
      });
    }

    /* 3. Появление при скролле — Motion (inView) */
    M.inView('[data-reveal]', function (node) {
      var delay = parseFloat(node.getAttribute('data-delay')) || 0;
      var a = M.animate(node,
        { opacity: [0, 1], transform: ['translateY(30px)', 'translateY(0px)'] },
        { duration: 0.85, delay: delay, ease: EASE });
      var done = function () { node.style.opacity = ''; node.style.transform = ''; };
      if (a && a.finished && a.finished.then) a.finished.then(done, done);
      else setTimeout(done, (0.85 + delay) * 1000 + 80);
    }, { amount: 0.15, margin: '0px 0px -6% 0px' });

    /* 4. Реакция на курсор / нажатие — Motion (hover, press) */
    if (finePointer) {
      M.hover('.card', function (node) {
        M.animate(node, { transform: 'translateY(-8px)' }, { duration: 0.4, ease: EASE });
        return function () { M.animate(node, { transform: 'translateY(0px)' }, { duration: 0.5, ease: EASE }); };
      });
    }
    M.press('.btn', function (node) {
      M.animate(node, { transform: 'scale(0.96)' }, { duration: 0.15, ease: 'easeOut' });
      return function () { M.animate(node, { transform: 'scale(1)' }, { duration: 0.35, ease: EASE }); };
    });
  }

  /* Свечение за курсором, подсветка карточек и лёгкий 3D-наклон демо-карточки (только мышь) */
  function setupPointer() {
    if (!finePointer || reduceMotion || weak) return;
    var glow = $('.glow');
    var lot = $('.lot');
    var cards = $('.cards');
    if (!glow) return;

    var tx = window.innerWidth / 2, ty = window.innerHeight / 3;
    var cx = tx, cy = ty;
    var rxT = 0, ryT = 0, rx = 0, ry = 0;
    var lastCard = null, lastEvt = null;
    var raf = 0;
    var lotVisible = true;

    if (lot && window.IntersectionObserver) {
      new IntersectionObserver(function (en) { lotVisible = en[0].isIntersecting; if (!lotVisible) { rxT = 0; ryT = 0; kick(); } }).observe(lot);
    }

    function frame() {
      raf = 0;
      cx += (tx - cx) * 0.14;
      cy += (ty - cy) * 0.14;
      rx += (rxT - rx) * 0.1;
      ry += (ryT - ry) * 0.1;
      glow.style.transform = 'translate3d(' + cx.toFixed(1) + 'px,' + cy.toFixed(1) + 'px,0)';
      if (lot) {
        lot.style.setProperty('--rx', rx.toFixed(2) + 'deg');
        lot.style.setProperty('--ry', ry.toFixed(2) + 'deg');
      }
      if (lastCard && lastEvt) {
        var r = lastCard.getBoundingClientRect();
        lastCard.style.setProperty('--mx', (lastEvt.clientX - r.left).toFixed(0) + 'px');
        lastCard.style.setProperty('--my', (lastEvt.clientY - r.top).toFixed(0) + 'px');
      }
      if (Math.abs(tx - cx) > 0.4 || Math.abs(ty - cy) > 0.4 || Math.abs(rxT - rx) > 0.02 || Math.abs(ryT - ry) > 0.02) {
        raf = requestAnimationFrame(frame);
      }
    }
    function kick() { if (!raf) raf = requestAnimationFrame(frame); }

    window.addEventListener('pointermove', function (e) {
      if (e.pointerType && e.pointerType !== 'mouse') return;
      tx = e.clientX; ty = e.clientY;
      glow.classList.add('on');
      if (lotVisible) {
        ryT = ((e.clientX / window.innerWidth) - 0.5) * 14;
        rxT = -((e.clientY / window.innerHeight) - 0.5) * 10;
      }
      lastEvt = e;
      lastCard = cards && e.target && e.target.closest ? e.target.closest('.card') : null;
      kick();
    }, { passive: true });
    doc.addEventListener('pointerleave', function () { glow.classList.remove('on'); rxT = 0; ryT = 0; kick(); });
  }

  /* ---------- Запуск ---------- */
  function boot() {
    var node = $('#boot');
    if (!node) return;
    node.classList.add('done');
    setTimeout(function () { if (node.parentNode) node.parentNode.removeChild(node); }, 600);
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
    renderSteps(d);
    renderSupport(d);
    renderFooter(d);
  }

  function fontsReady() {
    var ready = doc.fonts && doc.fonts.ready ? doc.fonts.ready : Promise.resolve();
    var timeout = new Promise(function (res) { setTimeout(res, 700); });
    return Promise.race([ready, timeout]);
  }

  function start() {
    fetch('data/site.json', { credentials: 'same-origin' })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (d) { return fontsReady().then(function () { return d; }); })
      .then(function (d) {
        render(d);
        setupMotion();
        setupPointer();
        boot();
      })
      .catch(function (err) {
        if (window.console && console.error) console.error('[site] не удалось отрисовать страницу:', err);
        fail();
      });
  }

  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', start);
  else start();
})();
