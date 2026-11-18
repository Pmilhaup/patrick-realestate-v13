/* site.js — patrick.realestate. Vanilla, no dependencies.
   Masthead and menu · reveals · hero motion (manual pause respected, paused offscreen,
   still for reduced-motion and data-saver) · market brief · coast · small visitor-paced
   controls · inquiry forms that carry the property address. */
(function () {
  'use strict';
  var doc = document, root = doc.documentElement;
  var $ = function (s, c) { return (c || doc).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || doc).querySelectorAll(s)); };
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var saveData = !!(navigator.connection && navigator.connection.saveData);
  var store = {
    get: function (k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { sessionStorage.setItem(k, v); } catch (e) {} }
  };

  /* ── Masthead ─────────────────────────────────────────────────────── */
  var mast = $('[data-mast]');
  if (mast) {
    var solid = function () { mast.classList.toggle('is-solid', window.scrollY > 24); };
    solid(); window.addEventListener('scroll', solid, { passive: true });
  }
  var toggle = $('.mast-toggle'), menu = $('#site-menu');
  if (toggle && menu) {
    var lastFocus = null;
    var setMenu = function (open) {
      menu.hidden = !open;
      toggle.setAttribute('aria-expanded', String(open));
      toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
      root.classList.toggle('menu-open', open);
      if (mast) mast.classList.toggle('is-solid', open || window.scrollY > 24);
      if (open) { lastFocus = doc.activeElement; var f = $('a', menu); if (f) f.focus(); }
      else if (lastFocus && lastFocus.focus) lastFocus.focus();
    };
    toggle.addEventListener('click', function () { setMenu(menu.hidden); });
    doc.addEventListener('keydown', function (e) {
      if (menu.hidden) return;
      if (e.key === 'Escape') { setMenu(false); return; }
      if (e.key !== 'Tab') return;
      var f = [toggle].concat($$('a', menu)), first = f[0], last = f[f.length - 1];
      if (e.shiftKey && doc.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && doc.activeElement === last) { e.preventDefault(); first.focus(); }
    });
    window.addEventListener('resize', function () { if (!menu.hidden && window.innerWidth >= 1100) setMenu(false); });
  }

  /* ── Reveal on scroll ─────────────────────────────────────────────── */
  var rv = $$('.rv');
  if (rv.length) {
    if (reduce || !('IntersectionObserver' in window)) rv.forEach(function (el) { el.classList.add('is-in'); });
    else {
      var io = new IntersectionObserver(function (es) {
        es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); } });
      }, { rootMargin: '0px 0px -8% 0px', threshold: 0.06 });
      rv.forEach(function (el) { io.observe(el); });
    }
  }

  /* ── Hero motion ──────────────────────────────────────────────────────
     The poster is the photograph itself; motion starts only after it has decoded
     and the page is idle, so the headline and actions are usable first. */
  $$('[data-hero]').forEach(function (hero) {
    var kind = hero.getAttribute('data-hero');            // "loop" (home) or "once" (estate)
    var img = $('.hero-media img', hero), ctl = $('.motion-ctl', hero);
    var key = 'motion:' + kind, still = reduce || saveData;
    var userPaused = store.get(key) === 'paused';
    var label = function (state, text) {
      if (!ctl) return;
      ctl.setAttribute('data-state', state);
      $('.t', ctl).textContent = text;
    };
    var play = function () {
      hero.classList.remove('is-held'); hero.classList.add('is-moving');
      label(kind === 'loop' ? 'playing' : 'replay', kind === 'loop' ? 'Pause motion' : 'Replay approach');
    };
    var pause = function () { hero.classList.add('is-held'); label('paused', 'Play motion'); };
    if (still) { if (ctl) ctl.hidden = true; return; }
    var start = function () {
      if (kind === 'loop' && userPaused) { hero.classList.add('is-moving'); pause(); return; }
      play();
    };
    var whenIdle = window.requestIdleCallback || function (fn) { return setTimeout(fn, 200); };
    var ready = function () { whenIdle(start); };
    if (img && !(img.complete && img.naturalWidth)) img.addEventListener('load', ready, { once: true }); else ready();
    if (ctl) ctl.addEventListener('click', function () {
      if (kind === 'once') {
        hero.classList.remove('is-moving'); void hero.offsetWidth; hero.classList.add('is-moving'); return;
      }
      userPaused = !hero.classList.contains('is-held');
      store.set(key, userPaused ? 'paused' : 'playing');
      if (userPaused) pause(); else play();
    });
    if (kind === 'loop' && 'IntersectionObserver' in window) {
      new IntersectionObserver(function (es) {
        es.forEach(function (e) {
          if (userPaused) return;
          if (e.isIntersecting) hero.classList.remove('is-held'); else hero.classList.add('is-held');
        });
      }, { threshold: 0.05 }).observe(hero);
      doc.addEventListener('visibilitychange', function () {
        if (userPaused) return;
        hero.classList.toggle('is-held', doc.hidden);
      });
    }
  });

  /* ── Market data (one fetch, shared by the brief and the coast) ────── */
  var SB = 'https://itupjrknklzvmmqicuyc.supabase.co/rest/v1/';
  var KEY = 'sb_publishable_fQnZLJnaC-dAHBuGBHJgjQ_RUHCe_7S';
  var VILLAGES = ['Lake Forest', 'Lake Bluff', 'Highland Park', 'Glencoe', 'Winnetka', 'Kenilworth', 'Wilmette'];
  var snapP = null;
  function snapshots() {
    if (snapP) return snapP;
    snapP = fetch(SB + 'daily_snapshots?select=village,snapshot_date,trailing30_median_price,trailing30_closed_sales,months_supply&scope=eq.all&order=snapshot_date.desc&limit=2800',
      { headers: { apikey: KEY, Authorization: 'Bearer ' + KEY } })
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (rows) {
        if (!rows.length) throw new Error('empty');
        var by = {};
        rows.forEach(function (r) { (by[r.snapshot_date] = by[r.snapshot_date] || []).push(r); });
        var dates = Object.keys(by).sort();
        return { by: by, dates: dates, latest: dates[dates.length - 1] };
      });
    return snapP;
  }
  function median(a) {
    a = a.filter(function (v) { return v > 0; }).sort(function (x, y) { return x - y; });
    if (!a.length) return null; var m = Math.floor(a.length / 2);
    return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
  }
  function money(v) { return v == null ? '—' : v >= 1e6 ? '$' + (v / 1e6).toFixed(2) + 'M' : '$' + Math.round(v / 1e3) + 'K'; }
  function day(d, opts) { return new Date(d + 'T12:00:00').toLocaleDateString('en-US', opts || { month: 'short', day: 'numeric', year: 'numeric' }); }
  function scopeRows(rows, v) { return v === 'Corridor' ? rows : rows.filter(function (r) { return r.village === v; }); }
  function read(rows, v) {
    var rs = scopeRows(rows, v);
    return {
      med: median(rs.map(function (r) { return +r.trailing30_median_price; })),
      closed: rs.reduce(function (s, r) { return s + (+r.trailing30_closed_sales || 0); }, 0),
      supply: median(rs.map(function (r) { return +r.months_supply; }))
    };
  }

  /* ── Home: market brief ───────────────────────────────────────────── */
  var brief = $('[data-brief]');
  if (brief) {
    var st = { v: 'Corridor', days: 180 }, D = null;
    var el = function (n) { return $('[data-b="' + n + '"]', brief); };
    var plot = el('plot'), tip = el('tip');
    var sellerRead = function (s, v) {
      var where = v === 'Corridor' ? 'Across the corridor' : 'In ' + v;
      if (s == null) return '';
      if (s < 4) return where + ', supply is under four months. Sellers hold the leverage, and a home priced to the comparables is competing for attention it will get.';
      if (s <= 6) return where + ', supply sits between four and six months: a balanced market. Buyers have time to compare, so pricing and presentation decide which homes sell first.';
      return where + ', supply is above six months. Buyers hold the leverage, and a new listing has to be priced ahead of the market rather than at it.';
    };
    var series = function () {
      var all = [];
      D.dates.forEach(function (d) {
        var m = median(scopeRows(D.by[d], st.v).map(function (r) { return +r.trailing30_median_price; }));
        if (m) all.push([d, m]);
      });
      var rolled = all.map(function (p, i, a) {           // 30-day rolling mean of the daily median
        var w = a.slice(Math.max(0, i - 29), i + 1);
        return [p[0], Math.round(w.reduce(function (s, q) { return s + q[1]; }, 0) / w.length), w.length];
      }).filter(function (p) { return p[2] >= 15; });     // leave out the warm-up, where the window is thin
      return rolled.slice(-st.days);
    };
    var draw = function (animate) {
      var pts = series(); if (pts.length < 2) { plot.innerHTML = ''; return; }
      var W = Math.max(280, Math.round(plot.clientWidth)), H = W < 520 ? 190 : 250, padL = 58, padR = 10, padT = 14, padB = 28;
      var ys = pts.map(function (p) { return p[1]; }), lo = Math.min.apply(null, ys), hi = Math.max.apply(null, ys);
      var span = (hi - lo) || hi * 0.05; lo -= span * 0.12; hi += span * 0.12;
      var X = function (i) { return padL + (W - padL - padR) * i / (pts.length - 1); };
      var Y = function (v) { return padT + (H - padT - padB) * (1 - (v - lo) / (hi - lo)); };
      var d = pts.map(function (p, i) { return (i ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(p[1]).toFixed(1); }).join(' ');
      var grid = [0, 0.5, 1].map(function (t) {
        var v = lo + (hi - lo) * (0.12 + t * 0.76), y = Y(v).toFixed(1);
        return '<line class="grid" x1="' + padL + '" x2="' + (W - padR) + '" y1="' + y + '" y2="' + y + '"/>' +
               '<text class="axis" x="' + (padL - 10) + '" y="' + y + '" text-anchor="end" dominant-baseline="middle">' + money(v) + '</text>';
      }).join('');
      var lastX = X(pts.length - 1), lastY = Y(pts[pts.length - 1][1]);
      plot.innerHTML =
        '<svg viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H + '" role="img" aria-label="' +
          (st.v === 'Corridor' ? 'Corridor' : st.v) + ' median sale price, 30-day rolling, ' + day(pts[0][0]) + ' to ' + day(pts[pts.length - 1][0]) +
          '. Latest ' + money(pts[pts.length - 1][1]) + '.">' +
        '<defs><linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#C2A265" stop-opacity=".30"/><stop offset="1" stop-color="#C2A265" stop-opacity="0"/></linearGradient></defs>' +
        grid +
        '<path class="area" d="' + d + ' L' + lastX.toFixed(1) + ' ' + (H - padB) + ' L' + padL + ' ' + (H - padB) + ' Z"/>' +
        '<path class="line" d="' + d + '"/>' +
        '<line class="probe" y1="' + padT + '" y2="' + (H - padB) + '" x1="-9" x2="-9"/>' +
        '<circle class="dot" r="4.5" cx="' + lastX.toFixed(1) + '" cy="' + lastY.toFixed(1) + '"/>' +
        '<text class="axis" x="' + padL + '" y="' + (H - 8) + '">' + day(pts[0][0]) + '</text>' +
        '<text class="axis" x="' + (W - padR) + '" y="' + (H - 8) + '" text-anchor="end">' + day(pts[pts.length - 1][0]) + '</text>' +
        '</svg>';
      var line = $('.line', plot), area = $('.area', plot), dot = $('.dot', plot);
      if (animate && !reduce && line.getTotalLength) {
        var len = line.getTotalLength();
        line.style.strokeDasharray = len; line.style.strokeDashoffset = len;
        area.style.opacity = 0; dot.style.opacity = 0;
        line.getBoundingClientRect();
        line.style.transition = 'stroke-dashoffset .9s cubic-bezier(.3,.6,.2,1)';
        area.style.transition = 'opacity .5s ease .55s'; dot.style.transition = 'opacity .2s ease .85s';
        line.style.strokeDashoffset = 0; area.style.opacity = 1; dot.style.opacity = 1;
      }
      plot._pts = pts; plot._geo = { X: X, Y: Y, W: W, padL: padL, padR: padR };
      el('now').textContent = money(pts[pts.length - 1][1]) + ' · ' + day(pts[pts.length - 1][0], { month: 'short', day: 'numeric' });
    };
    var renderKpis = function () {
      var r = read(D.by[D.latest], st.v), scope = st.v === 'Corridor' ? 'Corridor' : st.v;
      el('med').textContent = money(r.med);
      el('closed').textContent = r.closed || '—';
      el('supply').textContent = r.supply != null ? r.supply.toFixed(1) + ' mo' : '—';
      el('med-d').textContent = st.v === 'Corridor' ? 'Median of the seven village medians' : scope + ', trailing 30 days';
      el('closed-d').textContent = st.v === 'Corridor' ? 'Across the seven villages' : scope + ', trailing 30 days';
      el('supply-d').textContent = (st.v === 'Corridor' ? 'Corridor median' : scope) + ' · under four favors sellers';
      el('read').textContent = sellerRead(r.supply, st.v);
      el('title').textContent = (st.v === 'Corridor' ? 'Corridor median sale price' : scope + ' median sale price') + ' · 30-day rolling';
    };
    var chips = function () {
      var host = el('villages'), win = el('window');
      ['Corridor'].concat(VILLAGES).forEach(function (v) {
        var b = doc.createElement('button'); b.type = 'button'; b.className = 'pick'; b.textContent = v;
        b.setAttribute('aria-pressed', String(v === st.v));
        b.addEventListener('click', function () {
          st.v = v; $$('.pick', host).forEach(function (c) { c.setAttribute('aria-pressed', String(c === b)); });
          renderKpis(); draw(true);
        });
        host.appendChild(b);
      });
      [[90, '90 days'], [180, '6 months'], [365, '1 year']].forEach(function (w) {
        var b = doc.createElement('button'); b.type = 'button'; b.className = 'pick'; b.textContent = w[1];
        b.setAttribute('aria-pressed', String(w[0] === st.days));
        b.addEventListener('click', function () {
          st.days = w[0]; $$('.pick', win).forEach(function (c) { c.setAttribute('aria-pressed', String(c === b)); });
          draw(true);
        });
        win.appendChild(b);
      });
    };
    plot.addEventListener('pointermove', function (e) {
      var pts = plot._pts, g = plot._geo; if (!pts) return;
      var r = plot.getBoundingClientRect(), x = e.clientX - r.left;
      var i = Math.round((x - g.padL) / (g.W - g.padL - g.padR) * (pts.length - 1));
      i = Math.max(0, Math.min(pts.length - 1, i));
      var px = g.X(i), probe = $('.probe', plot);
      probe.setAttribute('x1', px); probe.setAttribute('x2', px);
      plot.classList.add('is-probing'); tip.hidden = false; tip.textContent = money(pts[i][1]) + ' · ' + day(pts[i][0]);
      tip.style.left = Math.max(70, Math.min(g.W - 70, px)) + 'px'; tip.style.top = g.Y(pts[i][1]) + 'px';
    });
    plot.addEventListener('pointerleave', function () { tip.hidden = true; plot.classList.remove('is-probing'); });
    snapshots().then(function (data) {
      D = data; chips(); renderKpis();
      var nd = new Date(D.latest + 'T12:00:00'), age = Math.floor((Date.now() - nd.getTime()) / 864e5);
      el('asof').innerHTML = 'Data as of <b>' + nd.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) + '</b> · ' +
        (age > 2 ? 'last reconciled ' + age + ' days ago' : 'reconciled daily') + ' · Source: MLS';
      var first = true, go = function () { draw(first); first = false; };
      if ('IntersectionObserver' in window) {
        var o = new IntersectionObserver(function (es) { if (es[0].isIntersecting) { go(); o.disconnect(); } }, { threshold: 0.2 });
        o.observe(plot);
      } else go();
      var t; window.addEventListener('resize', function () { clearTimeout(t); t = setTimeout(function () { if (!first) draw(false); }, 150); });
    }).catch(function () {
      el('asof').textContent = 'Live data is unavailable right now. The full briefing is on the Intelligence page.';
      el('read').textContent = '';
    });
  }

  /* ── Coast: select a village from the map or the list ─────────────── */
  $$('[data-coast]').forEach(function (coast) {
    var V = JSON.parse($('script[type="application/json"]', coast).textContent);
    var pins = $$('[data-v]', coast), q = function (n) { return $('[data-c="' + n + '"]', coast); };
    var data = null;
    var show = function (name) {
      var v = V[name]; if (!v) return;
      pins.forEach(function (p) { p.setAttribute('aria-pressed', String(p.getAttribute('data-v') === name)); });
      q('name').textContent = name; q('note').textContent = v.note;
      var link = q('link');
      if (v.href) { link.hidden = false; link.href = v.href; link.textContent = 'Open the ' + name + ' guide'; }
      else link.hidden = true;
      var ph = q('photo');
      if (v.photo) { ph.hidden = false; var im = $('img', ph); im.src = v.photo; im.alt = v.alt || ''; $('figcaption', ph).textContent = v.caption || ''; }
      else ph.hidden = true;
      var stat = q('stat');
      if (data) {
        var r = read(data.by[data.latest], name);
        stat.innerHTML = '<span class="n">' + money(r.med) + '</span><span class="d">Median sale · trailing 30 days · as of ' + day(data.latest) + '</span>' +
          (r.supply != null ? '<span class="d">' + r.supply.toFixed(1) + ' months of supply · ' + (r.closed || 0) + ' closed</span>' : '');
      } else stat.innerHTML = '<span class="d">Loading the latest market read…</span>';
    };
    pins.forEach(function (p) {
      var pick = function () { show(p.getAttribute('data-v')); };
      p.addEventListener('click', pick);
      p.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } });
    });
    var current = coast.getAttribute('data-coast') || 'Lake Forest';
    show(current);
    snapshots().then(function (d) {
      data = d; var on = pins.filter(function (p) { return p.getAttribute('aria-pressed') === 'true'; })[0];
      show(on ? on.getAttribute('data-v') : current);
    }).catch(function () { q('stat').innerHTML = '<span class="d">Live market data is unavailable right now.</span>'; });
  });

  /* ── Visitor-paced controls: then/now, walk, case ─────────────────── */
  $$('[data-thennow]').forEach(function (box) {
    var frame = $('.tn-frame', box), cap = $('.tn-cap', box), btns = $$('.tn-ctl button', box);
    btns.forEach(function (b) {
      b.addEventListener('click', function () {
        var v = b.getAttribute('data-view'); frame.setAttribute('data-show', v);
        btns.forEach(function (o) { o.setAttribute('aria-pressed', String(o === b)); });
        cap.innerHTML = b.getAttribute('data-caption');
      });
    });
  });
  $$('[data-steps]').forEach(function (box) {
    var btns = $$('[data-step]', box), panes = $$('[data-pane]', box), imgs = $$('.walk-stage img', box), next = $('.walk-next', box), cap = $('.walk-cap', box), i = 0;
    var go = function (n) {
      i = (n + btns.length) % btns.length;
      btns.forEach(function (b, k) { b.setAttribute('aria-pressed', String(k === i)); });
      imgs.forEach(function (im, k) { im.classList.toggle('is-on', k === i); });
      panes.forEach(function (p, k) { p.hidden = k !== i; });
      if (cap) cap.innerHTML = btns[i].getAttribute('data-caption') || '';
    };
    btns.forEach(function (b, k) { b.addEventListener('click', function () { go(k); }); });
    if (next) next.addEventListener('click', function () { go(i + 1); });
  });

  /* ── Inquiry forms ────────────────────────────────────────────────────
     Delivery is identical to the existing contact form (the `leads` table).
     Outside the production host, or with ?dryrun, nothing is sent: the form
     confirms what it would have delivered so the journey can be tested. */
  var params = new URLSearchParams(location.search);
  var live = /(^|\.)patrick\.realestate$/.test(location.hostname) && !params.has('dryrun');
  $$('form[data-lead]').forEach(function (form) {
    var btn = $('[type="submit"]', form), status = $('.lead-status', form);
    var property = form.getAttribute('data-property') || params.get('property') || '';
    if (property) {
      var reg = $('.regarding', form), addr = form.elements.address, hid = form.elements.property;
      if (reg) { reg.hidden = false; $('span', reg).textContent = property; }
      if (addr && !addr.value) addr.value = property;
      if (hid) hid.value = property;
      if (form.elements.interest && params.get('property')) form.elements.interest.value = 'buying';
    }
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (form.elements.company && form.elements.company.value) return;      // honeypot
      if (!form.reportValidity()) return;
      var f = form.elements, val = function (n) { return f[n] && f[n].value ? f[n].value.trim() : ''; };
      var prop = val('property') || val('address');
      var body = {
        source: form.getAttribute('data-lead') || 'contact',
        name: val('name'), email: val('email'), phone: val('phone'),
        message: ((val('interest') ? '[' + val('interest') + '] ' : '') + (prop ? prop + ' — ' : '') + val('message')).trim(),
        page: location.pathname, user_agent: navigator.userAgent.slice(0, 250)
      };
      form._lastBody = body;
      btn.disabled = true; status.removeAttribute('data-tone'); status.textContent = 'Sending…';
      var done = function (ok, text) { btn.disabled = false; status.setAttribute('data-tone', ok ? 'ok' : 'err'); status.textContent = text; };
      if (!live) {
        setTimeout(function () {
          done(true, 'Preview: nothing was sent. This inquiry' + (prop ? ' about ' + prop : '') + ' would be delivered to Patrick.');
        }, 350);
        return;
      }
      fetch(SB + 'leads', {
        method: 'POST',
        headers: { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify(body)
      }).then(function (r) {
        if (!r.ok) throw new Error(r.status);
        form.reset(); if (property && form.elements.property) form.elements.property.value = property;
        done(true, 'Received. You’ll hear back within the business day.');
      }).catch(function () { done(false, 'Something went wrong. Please call or email Patrick directly, using the details beside this form.'); });
    });
  });

  /* ── Estate: compact Gallery / Inquire access on phones ───────────── */
  var dock = $('.dock');
  if (dock && 'IntersectionObserver' in window) {
    var past = false, covered = false;
    var sync = function () {
      var up = past && !covered; dock.classList.toggle('is-up', up); dock.setAttribute('aria-hidden', String(!up));
      $$('a', dock).forEach(function (a) { a.tabIndex = up ? 0 : -1; });
    };
    var heroEl = $('.hero');
    if (heroEl) new IntersectionObserver(function (es) { past = !es[0].isIntersecting; sync(); }, { threshold: 0 }).observe(heroEl);
    $$('[data-dock-hide]').forEach(function (n) {
      new IntersectionObserver(function (es) {
        n._on = es[0].isIntersecting; covered = $$('[data-dock-hide]').some(function (m) { return m._on; }); sync();
      }, { threshold: 0.05 }).observe(n);
    });
    sync();
  }
})();
