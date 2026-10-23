/* aurora-bg.js — v14 "Data Aurora".
   The background IS the market: seven slow, luminous ribbons — one per village —
   each tracing that village's real monthly median sale price over the last
   three years, plus a brighter gold corridor composite. Scrolling the page scrubs
   the three-year window; nothing reacts to the mouse. Canvas 2D, additive light,
   ~30fps, DPR capped, reduced-motion = one still frame. Exposes
   window.__paintUniforms (uScroll / uPaletteMix) for the chapter orchestrator. */
(function () {
  'use strict';
  var canvas = document.getElementById('paint');
  if (!canvas) return;
  var ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) return;
  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var U = window.__paintUniforms = { uScroll: { value: 0 }, uPaletteMix: { value: 0.38 }, uMouse: { value: { x: 0, y: 0 } } };

  var VILLAGES = ['Lake Bluff', 'Lake Forest', 'Highland Park', 'Glencoe', 'Winnetka', 'Kenilworth', 'Wilmette'];
  var N = 48;                        // samples per ribbon
  var ribbons = VILLAGES.map(function (v, i) {
    var seed = i * 1.7 + 0.3;
    return { name: v, seed: seed, base: 0.18 + i * 0.105, amp: 0.045,
      shape: new Array(N).fill(0).map(function (_, k) { var t = k / (N - 1); return 0.5 + 0.5 * Math.sin(t * 6.283 * 0.9 + seed) * 0.55 + 0.25 * Math.sin(t * 6.283 * 2.3 + seed * 2.1); }),
      target: null, mix: 0 };
  });
  var corridor = { base: 0.52, amp: 0.07, shape: new Array(N).fill(0.5), target: null, mix: 0 };

  var W = 0, H = 0, D = 1;
  function size() {
    D = Math.min(window.devicePixelRatio || 1, 1.25);
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = Math.floor(W * D); canvas.height = Math.floor(H * D);
    ctx.setTransform(D, 0, 0, D, 0, 0);
  }
  size(); window.addEventListener('resize', size);

  /* ---- real data: monthly median per village, 36 months, normalized per ribbon ---- */
  (function loadData() {
    var SUPA = 'https://itupjrknklzvmmqicuyc.supabase.co', KEY = 'sb_publishable_fQnZLJnaC-dAHBuGBHJgjQ_RUHCe_7S';
    var since = new Date(); since.setMonth(since.getMonth() - 36);
    var url = SUPA + '/rest/v1/mv_market_intelligence?select=village,scope,d,source,value&metric=eq.median_sale_price&scope=eq.all&d=gte.' + since.toISOString().slice(0, 10) + '&order=d.asc&limit=60000';
    fetch(url, { headers: { apikey: KEY, Authorization: 'Bearer ' + KEY } }).then(function (r) { return r.ok ? r.json() : []; }).then(function (rows) {
      if (!rows || !rows.length) return;
      var byV = {};
      rows.forEach(function (r) { var m = r.d.slice(0, 7); ((byV[r.village] = byV[r.village] || {})[m] = byV[r.village][m] || []).push(Number(r.value)); });
      var months = {}; rows.forEach(function (r) { months[r.d.slice(0, 7)] = 1; }); months = Object.keys(months).sort();
      function med(a) { a = a.slice().sort(function (x, y) { return x - y; }); return a[Math.floor(a.length / 2)]; }
      function resample(series) { // series: array of numbers (may be null) over months -> N points, normalized 0..1
        var vals = series.map(function (v, i, a) { if (v != null) return v; var p = null, n = null; for (var j = i - 1; j >= 0; j--) if (a[j] != null) { p = a[j]; break; } for (var k = i + 1; k < a.length; k++) if (a[k] != null) { n = a[k]; break; } return p != null && n != null ? (p + n) / 2 : (p != null ? p : n); });
        if (vals.some(function (v) { return v == null; })) return null;
        // light smoothing (3-month) then normalize
        var sm = vals.map(function (v, i, a) { var s = 0, c = 0; for (var j = Math.max(0, i - 1); j <= Math.min(a.length - 1, i + 1); j++) { s += a[j]; c++; } return s / c; });
        var mn = Math.min.apply(null, sm), mx = Math.max.apply(null, sm), rg = (mx - mn) || 1;
        var out = []; for (var k = 0; k < N; k++) { var t = k / (N - 1) * (sm.length - 1), i0 = Math.floor(t), i1 = Math.min(sm.length - 1, i0 + 1), f = t - i0; out.push(((sm[i0] * (1 - f) + sm[i1] * f) - mn) / rg); }
        return out;
      }
      var corridorMonthly = months.map(function (m) { var vs = VILLAGES.map(function (v) { return byV[v] && byV[v][m] ? med(byV[v][m]) : null; }).filter(function (x) { return x != null; }); return vs.length ? med(vs) : null; });
      var ct = resample(corridorMonthly); if (ct) corridor.target = ct;
      ribbons.forEach(function (rb) { var s = months.map(function (m) { return byV[rb.name] && byV[rb.name][m] ? med(byV[rb.name][m]) : null; }); var t = resample(s); if (t) rb.target = t; });
    }).catch(function () {});
  })();

  function pathFor(rb, t, yOff, xShift) {
    // returns array of points across the viewport; ribbon shape = procedural -> data crossfade
    var pts = [];
    for (var k = 0; k < N; k++) {
      var s = rb.shape[k];
      if (rb.target) { s = s * (1 - rb.mix) + rb.target[k] * rb.mix; }
      var breathe = 0.012 * Math.sin(t * 0.25 + k * 0.35 + (rb.seed || 0));
      var x = (k / (N - 1)) * (W * 1.25) - W * 0.125 + xShift;
      var y = H * (rb.base + yOff) - (s - 0.5) * H * rb.amp * 2.6 + H * breathe;
      pts.push([x, y]);
    }
    return pts;
  }
  function stroke(pts, color, width, alpha) {
    ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
    for (var i = 1; i < pts.length - 1; i++) { var xc = (pts[i][0] + pts[i + 1][0]) / 2, yc = (pts[i][1] + pts[i + 1][1]) / 2; ctx.quadraticCurveTo(pts[i][0], pts[i][1], xc, yc); }
    ctx.lineTo(pts[pts.length - 1][0], pts[pts.length - 1][1]);
    ctx.strokeStyle = color; ctx.globalAlpha = alpha; ctx.lineWidth = width; ctx.lineCap = 'round'; ctx.stroke();
  }
  function glow(pts, rgb, core) { // layered strokes = cheap bloom
    ctx.globalCompositeOperation = 'lighter';
    stroke(pts, 'rgb(' + rgb + ')', 64, core * 0.035);
    stroke(pts, 'rgb(' + rgb + ')', 26, core * 0.08);
    stroke(pts, 'rgb(' + rgb + ')', 8, core * 0.22);
    stroke(pts, 'rgb(' + rgb + ')', 1.6, core * 0.85);
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
  }

  var t0 = performance.now(), last = 0, visible = true;
  document.addEventListener('visibilitychange', function () { visible = !document.hidden; if (visible && !reduced) requestAnimationFrame(frame); });
  function frame(now) {
    if (!reduced && visible) requestAnimationFrame(frame);
    if (now - last < 33) return; last = now;            // ~30fps
    var t = (now - t0) / 1000, sc = U.uScroll.value, pm = U.uPaletteMix.value;
    ribbons.forEach(function (rb) { if (rb.target && rb.mix < 1) rb.mix = Math.min(1, rb.mix + 0.012); });
    if (corridor.target && corridor.mix < 1) corridor.mix = Math.min(1, corridor.mix + 0.012);
    // ground
    var g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#050C18'); g.addColorStop(0.5, '#071327'); g.addColorStop(1, '#050C18');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    var drift = -t * 6 - sc * W * 0.25;                  // slow leftward glide + scroll scrubs time
    var yPar = -sc * H * 0.12;                            // gentle parallax on scroll
    ribbons.forEach(function (rb, i) {
      var pts = pathFor(rb, t, yPar * (0.4 + i * 0.08), drift * (0.6 + i * 0.07));
      glow(pts, '140,163,198', 0.55 + pm * 0.25);        // slate-blue villages
    });
    var cp = pathFor(corridor, t * 0.8, yPar * 0.7, drift * 0.9);
    glow(cp, '234,217,174', 0.95 + pm * 0.3);            // gold corridor composite
    // legibility vignette: darken the reading column softly
    var v = ctx.createRadialGradient(W * 0.42, H * 0.45, H * 0.15, W * 0.42, H * 0.45, H * 1.05);
    v.addColorStop(0, 'rgba(5,12,24,0.42)'); v.addColorStop(1, 'rgba(5,12,24,0)');
    ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
  }
  requestAnimationFrame(frame);

  /* film grain — overlay, 4% */
  try {
    var gc = document.createElement('canvas'); gc.width = 140; gc.height = 140;
    var x = gc.getContext('2d'), id = x.createImageData(140, 140);
    for (var i = 0; i < id.data.length; i += 4) { var vv = (Math.random() * 255) | 0; id.data[i] = id.data[i + 1] = id.data[i + 2] = vv; id.data[i + 3] = 255; }
    x.putImageData(id, 0, 0);
    var grain = document.createElement('div'); grain.setAttribute('aria-hidden', 'true');
    grain.style.cssText = 'position:fixed;inset:0;z-index:1;pointer-events:none;opacity:.04;mix-blend-mode:overlay;background:url(' + gc.toDataURL() + ') repeat;';
    canvas.parentNode.insertBefore(grain, canvas.nextSibling);
  } catch (e) {}
})();
