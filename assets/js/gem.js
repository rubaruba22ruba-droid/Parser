/* ==========================================================================
   Розовый сапфир на canvas: цельная огранка, плоская заливка граней по свету,
   тёмные рёбра, редкие блики. Без свечения и без «проволочного» каркаса.
   Медленное вращение, плавающее положение, реакция на мышь и прокрутку.
   ========================================================================== */
(function () {
  'use strict';

  var win = window, doc = document;
  var FX = win.NTFX = win.NTFX || {};

  var STOPS = [
    [0.00, [64, 14, 48]],
    [0.28, [104, 22, 68]],
    [0.52, [190, 56, 116]],
    [0.76, [246, 138, 182]],
    [1.00, [255, 230, 240]]
  ];
  function ramp(t) {
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    for (var i = 1; i < STOPS.length; i++) {
      if (t <= STOPS[i][0]) {
        var a = STOPS[i - 1], b = STOPS[i], k = (t - a[0]) / (b[0] - a[0]);
        return [a[1][0] + (b[1][0] - a[1][0]) * k, a[1][1] + (b[1][1] - a[1][1]) * k, a[1][2] + (b[1][2] - a[1][2]) * k];
      }
    }
    return STOPS[STOPS.length - 1][1];
  }
  function rgb(c, a) { return 'rgba(' + (c[0] | 0) + ',' + (c[1] | 0) + ',' + (c[2] | 0) + ',' + (a === undefined ? 1 : a.toFixed(3)) + ')'; }

  /* геометрия: стол (8) → рундист (16) → калетта */
  var V = [], F = [];
  (function build() {
    var i, k;
    function add(x, y, z) { V.push([x, y, z]); return V.length - 1; }
    var T = [], G = [];
    for (i = 0; i < 8; i++) { var a = i * Math.PI / 4 + Math.PI / 8; T.push(add(Math.cos(a) * 0.56, 0.44, Math.sin(a) * 0.56)); }
    for (k = 0; k < 16; k++) { var b = k * Math.PI / 8; G.push(add(Math.cos(b) * 1.0, 0, Math.sin(b) * 1.0)); }
    var culet = add(0, -0.98, 0);
    F.push(T.slice());
    for (i = 0; i < 8; i++) {
      var j = (i + 1) % 8;
      F.push([T[i], T[j], G[(2 * i + 2) % 16]]);
      F.push([T[i], G[(2 * i + 1) % 16], G[(2 * i + 2) % 16]]);
      F.push([T[j], G[(2 * i + 2) % 16], G[(2 * i + 3) % 16]]);
    }
    for (k = 0; k < 16; k++) F.push([G[k], G[(k + 1) % 16], culet]);
  })();

  var LIGHT = (function () { var x = -0.4, y = 0.78, z = 0.5, l = Math.sqrt(x * x + y * y + z * z); return [x / l, y / l, z / l]; })();
  var CAM = 4.3, CENTER_Y = -0.1;

  function rot(p, yaw, pitch) {
    var cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
    var x = p[0] * cy + p[2] * sy;
    var z = -p[0] * sy + p[2] * cy;
    var y = p[1] * cp - z * sp;
    z = p[1] * sp + z * cp;
    return [x, y, z];
  }

  function create(canvas, opts) {
    opts = opts || {};
    var ctx = canvas.getContext && canvas.getContext('2d');
    if (!ctx) return null;

    var st = { yaw: 0.5, yawOff: 0, yawT: 0, pitchOff: 0, pitchT: 0, reveal: 1, t: 0, boost: 0 };
    var W = 0, H = 0, dpr = 1;
    var raf = 0, last = 0, visible = true, tabOn = !doc.hidden, running = false;

    function resize() {
      var r = canvas.getBoundingClientRect();
      dpr = Math.min(win.devicePixelRatio || 1, opts.lite ? 1.25 : 2);
      W = r.width; H = r.height;
      canvas.width = Math.max(1, Math.round(W * dpr));
      canvas.height = Math.max(1, Math.round(H * dpr));
    }

    function draw() {
      if (!W || !H) return;
      var yaw = st.yaw + st.yawOff, pitch = 0.4 + st.pitchOff;
      var rv = st.reveal;
      var S = Math.min(W * 0.29, H * 0.4) * (0.88 + 0.12 * rv);
      var cx = W / 2, cy = H * 0.48 + Math.sin(st.t * 0.9) * H * 0.012;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      ctx.globalAlpha = rv;
      ctx.lineJoin = 'round';

      var P = V.map(function (v) {
        var r = rot(v, yaw, pitch), s = CAM / (CAM - r[2]);
        return { r: r, x: cx + r[0] * S * s, y: cy - r[1] * S * s };
      });

      var faces = [];
      F.forEach(function (f) {
        var a0 = P[f[0]].r, a1 = P[f[1]].r, a2 = P[f[2]].r;
        var ux = a1[0] - a0[0], uy = a1[1] - a0[1], uz = a1[2] - a0[2];
        var vx = a2[0] - a0[0], vy = a2[1] - a0[1], vz = a2[2] - a0[2];
        var nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
        var cxx = 0, cyy = 0, czz = 0;
        f.forEach(function (i) { cxx += P[i].r[0]; cyy += P[i].r[1]; czz += P[i].r[2]; });
        cxx /= f.length; cyy /= f.length; czz /= f.length;
        if (nx * cxx + ny * (cyy - CENTER_Y) + nz * czz < 0) { nx = -nx; ny = -ny; nz = -nz; }
        var l = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
        nx /= l; ny /= l; nz /= l;
        if (nz > 0.001) faces.push({ f: f, n: [nx, ny, nz], z: czz });
      });
      faces.sort(function (a, b) { return a.z - b.z; });

      faces.forEach(function (o) {
        var lam = Math.max(0, o.n[0] * LIGHT[0] + o.n[1] * LIGHT[1] + o.n[2] * LIGHT[2]);
        var t = 0.1 + 0.7 * Math.pow(lam, 1.15) + 0.2 * Math.max(0, o.n[1]) + 0.1 * Math.max(0, -o.n[1]);
        ctx.beginPath();
        o.f.forEach(function (i, k) { if (k) ctx.lineTo(P[i].x, P[i].y); else ctx.moveTo(P[i].x, P[i].y); });
        ctx.closePath();
        ctx.fillStyle = rgb(ramp(t));
        ctx.fill();
        /* блик: грань, поймавшая свет, на миг становится почти белой */
        if (lam > 0.9) {
          ctx.fillStyle = 'rgba(255,244,250,' + Math.min(0.75, (lam - 0.9) * 7).toFixed(3) + ')';
          ctx.fill();
        }
        ctx.strokeStyle = 'rgba(24,4,18,0.5)';
        ctx.lineWidth = 1.3;
        ctx.stroke();
      });
    }

    function frame(ts) {
      raf = 0;
      var dt = last ? Math.min((ts - last) / 1000, 0.05) : 0.016;
      last = ts;
      st.t += dt;
      st.boost *= Math.exp(-dt * 2.2);
      st.yaw += dt * (0.2 + st.boost);
      var k = 1 - Math.exp(-dt * 3);
      st.yawOff += (st.yawT - st.yawOff) * k;
      st.pitchOff += (st.pitchT - st.pitchOff) * k;
      draw();
      if (running && visible && tabOn) raf = requestAnimationFrame(frame);
    }
    function kick() { if (!raf && running && visible && tabOn) { last = 0; raf = requestAnimationFrame(frame); } }

    var api = {
      st: st,
      draw: draw,
      resize: resize,
      /* ускорить вращение (например, при прокрутке) */
      boost: function (v) { st.boost = Math.max(-1.2, Math.min(1.6, st.boost + v)); },
      isLoopRunning: function () { return !!raf; },
      start: function () {
        resize(); draw();
        if (win.ResizeObserver) new ResizeObserver(function () { resize(); draw(); }).observe(canvas);
        else win.addEventListener('resize', function () { resize(); draw(); });
        if (opts.reduce) return;
        running = true; kick();
        if (win.IntersectionObserver) new IntersectionObserver(function (en) { visible = en[0].isIntersecting; kick(); }).observe(canvas);
        doc.addEventListener('visibilitychange', function () { tabOn = !doc.hidden; kick(); });
        if (opts.pointer) {
          win.addEventListener('pointermove', function (e) {
            if (e.pointerType && e.pointerType !== 'mouse') return;
            st.yawT = (e.clientX / win.innerWidth - 0.5) * 0.9;
            st.pitchT = (e.clientY / win.innerHeight - 0.5) * 0.18;
          }, { passive: true });
        }
      }
    };
    return api;
  }

  FX.gem = { create: create };
})();
