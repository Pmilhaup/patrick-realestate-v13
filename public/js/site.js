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
    var img = $('.hero-media img', hero), ctl = $('.motion-ctl', hero), film = $('.hero-film', hero);
    var key = 'motion:' + kind, still = reduce || saveData;
    var userPaused = store.get(key) === 'paused';
    var label = function (state, text) {
      if (!ctl) return;
      ctl.setAttribute('data-state', state);
      $('.t', ctl).textContent = text;
    };
    var filmPlay = function () {
      if (!film) return;
      if (!film.getAttribute('src')) {
        film.src = film.getAttribute(window.matchMedia('(max-width: 899px) and (orientation: portrait)').matches ? 'data-src-tall' : 'data-src-wide');
        film.addEventListener('playing', function () { hero.classList.add('has-film'); }, { once: true });
      }
      var p = film.play();
      if (p && p.catch) p.catch(function () { hero.classList.add('is-held'); label('paused', 'Play motion'); });   // autoplay refused: the still stays, the control offers Play
    };
    var play = function () {
      hero.classList.remove('is-held'); hero.classList.add('is-moving');
      label(kind === 'loop' ? 'playing' : 'replay', kind === 'loop' ? 'Pause motion' : 'Replay approach');
      if (film) { if (doc.readyState === 'complete') filmPlay(); else window.addEventListener('load', filmPlay, { once: true }); }
    };
    var pause = function () { hero.classList.add('is-held'); label('paused', 'Play motion'); if (film && film.getAttribute('src')) film.pause(); };
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
          if (e.isIntersecting) { hero.classList.remove('is-held'); if (film && film.getAttribute('src')) filmPlay(); } else { hero.classList.add('is-held'); if (film && film.getAttribute('src')) film.pause(); }
        });
      }, { threshold: 0.05 }).observe(hero);
      doc.addEventListener('visibilitychange', function () {
        if (userPaused) return;
        hero.classList.toggle('is-held', doc.hidden);
      });
    }
  });

  /* ── Ambient footage behind an opening (muted, paused off screen, with a control) ── */
  $$('[data-amb]').forEach(function (box) {
    var film = $('video', box), ctl = $('.amb-ctl', box);
    if (!film || reduce || saveData) return;
    var key = 'motion:amb', paused = store.get(key) === 'paused', seen = false;
    var label = function () {
      if (!ctl) return;
      ctl.hidden = false;
      ctl.setAttribute('data-state', paused ? 'paused' : 'playing');
      $('.t', ctl).textContent = paused ? 'Play motion' : 'Pause motion';
    };
    var play = function () {
      if (paused || !seen) return;
      if (!film.getAttribute('src')) {
        film.src = film.getAttribute('data-src');
        film.addEventListener('playing', function () { box.classList.add('is-on'); }, { once: true });
      }
      var p = film.play();
      if (p && p.catch) p.catch(function () { paused = true; label(); });
    };
    var go = function () { if (doc.readyState === 'complete') play(); else window.addEventListener('load', play, { once: true }); };
    label();
    if (ctl) ctl.addEventListener('click', function () {
      paused = !paused; store.set(key, paused ? 'paused' : 'playing'); label();
      if (paused) film.pause(); else go();
    });
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (es) {
        es.forEach(function (e) { seen = e.isIntersecting; if (seen) go(); else if (film.getAttribute('src')) film.pause(); });
      }, { threshold: 0.05 }).observe(box);
    } else { seen = true; go(); }
  });

  /* ── Market data (one fetch, shared by the brief and the coast) ────── */
  var SB = 'https://itupjrknklzvmmqicuyc.supabase.co/rest/v1/';
  var KEY = 'sb_publishable_fQnZLJnaC-dAHBuGBHJgjQ_RUHCe_7S';
  var VILLAGES = ['Lake Forest', 'Lake Bluff', 'Highland Park', 'Glencoe', 'Winnetka', 'Kenilworth', 'Wilmette'];
  var snapP = null;
  function snapshots() {
    if (snapP) return snapP;
    snapP = fetch(SB + 'daily_snapshots?select=village,snapshot_date,trailing30_median_price,trailing30_closed_sales,months_supply,trailing30_median_dom,trailing30_median_ppsf,homes_for_sale&scope=eq.all&order=snapshot_date.desc&limit=6000',
      { headers: { apikey: KEY, Authorization: 'Bearer ' + KEY } })
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (rows) {
        if (!rows.length) throw new Error('empty');
        var by = {};
        rows.forEach(function (r) { (by[r.snapshot_date] = by[r.snapshot_date] || []).push(r); });
        var dates = Object.keys(by).sort();
        return { by: by, dates: dates, latest: dates[dates.length - 1], rows: rows };
      });
    return snapP;
  }
  window.NS = { snapshots: function () { return snapshots().then(function (d) { return d.rows; }); } };   // one request, shared with the charts
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
      dom: median(rs.map(function (r) { return +r.trailing30_median_dom; })),
      ppsf: median(rs.map(function (r) { return +r.trailing30_median_ppsf; }))
    };
  }

  /* ── Home: market brief ───────────────────────────────────────────── */
  var brief = $('[data-brief]');
  if (brief) {
    var el = function (n) { return $('[data-b="' + n + '"]', brief); };
    snapshots().then(function (D) {
      var r = read(D.by[D.latest], 'Corridor');
      el('med').textContent = money(r.med);
      el('closed').textContent = r.closed || '—';
      el('dom').textContent = r.dom != null ? Math.round(r.dom) + ' days' : '—';
      el('read').textContent = (r.closed || 0) + ' homes closed across the seven villages in the last 30 days, at a median of ' + money(r.med) +
        (r.dom != null ? ' and ' + Math.round(r.dom) + ' days on the market' : '') + '. The record below shows where that sits in eighteen years.';
      var nd = new Date(D.latest + 'T12:00:00'), age = Math.floor((Date.now() - nd.getTime()) / 864e5);
      el('asof').innerHTML = 'Data as of <b>' + nd.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) + '</b> · ' +
        (age > 2 ? 'last reconciled ' + age + ' days ago' : 'reconciled daily') + ' · Source: MLS';
    }).catch(function () {
      el('asof').textContent = 'Live data is unavailable right now. The full briefing is on the Intelligence page.';
      el('read').textContent = '';
    });
  }

  /* ── Coast: the seven villages on their real boundaries, shaded by the latest figures ── */
  var RAMP = [[34, 58, 110], [58, 86, 142], [104, 112, 124], [150, 128, 84], [194, 162, 101], [234, 217, 174]];
  var ramp = function (t) {
    t = Math.max(0, Math.min(1, t)) * (RAMP.length - 1); var i = Math.min(RAMP.length - 2, Math.floor(t)), f = t - i;
    return 'rgb(' + RAMP[i].map(function (c, k) { return Math.round(c + (RAMP[i + 1][k] - c) * f); }).join(',') + ')';
  };
  var MEASURE = {
    price:  { label: 'Median sale price', get: function (r) { return r.med; }, fmt: money },
    dom:    { label: 'Median days on market', get: function (r) { return r.dom; }, fmt: function (v) { return v == null ? '—' : Math.round(v) + ' days'; } },
    closed: { label: 'Closed sales, 30 days', get: function (r) { return r.closed; }, fmt: function (v) { return v == null ? '—' : String(v); } }
  };
  $$('[data-coast]').forEach(function (coast) {
    var V = JSON.parse($('script[type="application/json"]', coast).textContent);
    var pins = $$('[data-v]', coast), areas = $$('.area', coast), q = function (n) { return $('[data-c="' + n + '"]', coast); };
    var data = null, measure = 'price', current = coast.getAttribute('data-coast') || 'Lake Forest';
    var shade = function () {
      if (!data) return;
      var M = MEASURE[measure], vals = {}, lo = Infinity, hi = -Infinity;
      Object.keys(V).forEach(function (n) { var v = M.get(read(data.by[data.latest], n)); vals[n] = v; if (v != null && v > 0) { lo = Math.min(lo, v); hi = Math.max(hi, v); } });
      areas.forEach(function (a) {
        var n = a.getAttribute('data-v'), v = vals[n];
        a.style.fill = v == null || !(v > 0) ? '' : ramp(hi > lo ? (v - lo) / (hi - lo) : 0.5);
        var t = $('title', a); if (t) t.textContent = n + ': ' + M.label.toLowerCase() + ' ' + M.fmt(v);
      });
      $$('.area-val', coast).forEach(function (t) { t.textContent = M.fmt(vals[t.getAttribute('data-for')]); });
      var lg = q('legend'); if (lg) { lg.hidden = false; $('.lo', lg).textContent = M.fmt(lo); $('.hi', lg).textContent = M.fmt(hi); $('.what', lg).textContent = M.label; }
    };
    var show = function (name) {
      var v = V[name]; if (!v) return; current = name;
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
          '<span class="d">' + (r.closed || 0) + ' closed' + (r.dom != null ? ' · ' + Math.round(r.dom) + ' days on market' : '') + '</span>';
      } else stat.innerHTML = '<span class="d">Loading the latest market read…</span>';
    };
    pins.forEach(function (p) {
      var pick = function () { show(p.getAttribute('data-v')); };
      p.addEventListener('click', pick);
      p.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } });
    });
    $$('[data-m]', coast).forEach(function (b) {
      b.addEventListener('click', function () {
        measure = b.getAttribute('data-m'); $$('[data-m]', coast).forEach(function (o) { o.setAttribute('aria-pressed', String(o === b)); }); shade();
      });
    });
    show(current);
    snapshots().then(function (d) { data = d; shade(); show(current); })
      .catch(function () { q('stat').innerHTML = '<span class="d">Live market data is unavailable right now.</span>'; });
  });

  /* ── Village guides: the four figures, from the latest nightly snapshot ── */
  $$('[data-village-kpis]').forEach(function (box) {
    var v = box.getAttribute('data-village-kpis'), set = function (k, t) { var e = $('[data-k="' + k + '"]', box); if (e) e.textContent = t; };
    snapshots().then(function (D) {
      var r = D.by[D.latest].filter(function (x) { return x.village === v; })[0]; if (!r) return;
      var num = function (x) { return x == null || x === '' ? null : +x; };
      var p = num(r.trailing30_median_price), d = num(r.trailing30_median_dom), n = num(r.trailing30_closed_sales), f = num(r.trailing30_median_ppsf);
      set('price', p ? money(p) : '—'); set('dom', d != null ? Math.round(d) + ' days' : '—'); set('closed', n != null ? String(n) : '—'); set('ppsf', f ? '$' + Math.round(f) : '—');
      var a = $('[data-k="asof"]', box.parentNode); if (a) a.innerHTML = 'Data as of <b>' + day(D.latest) + '</b> · reconciled nightly · Source: MLS';
    }).catch(function () {});
  });

  /* ── Embedded frames load when they are about to be seen, not with the page ── */
  (function () {
    var frames = $$('iframe[data-src]'); if (!frames.length) return;
    var load = function (f) { if (!f.src) f.src = f.getAttribute('data-src'); };
    if (!('IntersectionObserver' in window)) return frames.forEach(load);
    var io = new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) { load(e.target); io.unobserve(e.target); } }); }, { rootMargin: '300px 0px' });
    frames.forEach(function (f) { io.observe(f); });
  })();

  /* ── Rail: a horizontal run of cards with previous and next ───────── */
  $$('[data-rail]').forEach(function (rail) {
    var track = $('.rail-track', rail), prev = $('[data-rail-prev]', rail), next = $('[data-rail-next]', rail);
    var step = function (d) { var it = $('.rail-item', track); if (!it) return; track.scrollBy({ left: d * (it.getBoundingClientRect().width + 20) * (window.innerWidth > 1100 ? 2 : 1), behavior: reduce ? 'auto' : 'smooth' }); };
    var sync = function () { prev.disabled = track.scrollLeft < 8; next.disabled = track.scrollLeft + track.clientWidth > track.scrollWidth - 8; };
    prev.addEventListener('click', function () { step(-1); }); next.addEventListener('click', function () { step(1); });
    track.addEventListener('scroll', sync, { passive: true }); window.addEventListener('resize', sync); sync();
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
        done(true, form.getAttribute('data-ok') || 'Received. You’ll hear back within the business day.');
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
