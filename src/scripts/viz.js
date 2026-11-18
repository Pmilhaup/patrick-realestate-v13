// Interactive market visualizations for patrick.realestate.
// Apache ECharts (tree-shaken), loaded only when a chart nears the viewport.
// Data: /data/history.json (monthly record, 2008 onward; tools/sync_history.py) and the live
// daily_snapshots table (March 2026 onward). Nothing here is hand-typed.
import * as echarts from 'echarts/core';
import { LineChart, ScatterChart, HeatmapChart, BarChart } from 'echarts/charts';
import { GridComponent, TooltipComponent, DataZoomComponent, MarkLineComponent, MarkAreaComponent, MarkPointComponent, VisualMapComponent, GraphicComponent, AriaComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
echarts.use([LineChart, ScatterChart, HeatmapChart, BarChart, GridComponent, TooltipComponent, DataZoomComponent, MarkLineComponent, MarkAreaComponent, MarkPointComponent, VisualMapComponent, GraphicComponent, AriaComponent, CanvasRenderer]);

const C = { navy0: '#060D1F', navy1: '#0B1730', navy2: '#122246', gold: '#C2A265', pale: '#EAD9AE', ink: '#EEF1F6', mute: '#AEB9CC', steel: '#8FA3C4', hair: 'rgba(214,221,232,.16)', grid: 'rgba(214,221,232,.07)' };
const SANS = "'Public Sans', system-ui, sans-serif", MONO = "'JetBrains Mono', ui-monospace, monospace", SERIF = "'Cormorant Garamond', Georgia, serif";
const VILLAGES = ['Lake Bluff', 'Lake Forest', 'Highland Park', 'Glencoe', 'Winnetka', 'Kenilworth', 'Wilmette'];
const HUE = { 'Lake Bluff': '#7FC4C0', 'Lake Forest': '#EAD9AE', 'Highland Park': '#8FB8DE', 'Glencoe': '#D9936E', 'Winnetka': '#C2A265', 'Kenilworth': '#B9A6D9', 'Wilmette': '#E6E9EF' };
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const small = () => innerWidth < 700;

const money = (v) => (v == null ? '–' : v >= 1e6 ? '$' + (v / 1e6).toFixed(v >= 1e7 ? 1 : 2).replace(/\.?0+$/, '') + 'M' : '$' + Math.round(v / 1e3) + 'K');
const METRICS = {
  price:  { label: 'Median sale price', short: 'Median price', fmt: money, live: 'trailing30_median_price' },
  closed: { label: 'Closed sales per month', short: 'Closed sales', fmt: (v) => (v == null ? '–' : String(Math.round(v))), live: 'trailing30_closed_sales', count: true },
  // No nightly extension: the nightly table counts inventory differently from the monthly record (see docs/REDESIGN-2026-11.md).
  supply: { label: 'Months of supply', short: 'Supply', fmt: (v) => (v == null ? '–' : v.toFixed(1) + ' mo') },
  dom:    { label: 'Median days on market', short: 'Days on market', fmt: (v) => (v == null ? '–' : Math.round(v) + ' days'), live: 'trailing30_median_dom' },
  ppsf:   { label: 'Median price per square foot', short: 'Price per sq ft', fmt: (v) => (v == null ? '–' : '$' + Math.round(v)), live: 'trailing30_median_ppsf' },
  pct:    { label: 'Sale price as a share of original asking', short: 'Sale to original', fmt: (v) => (v == null ? '–' : v.toFixed(1) + '%') },
  active: { label: 'Homes for sale', short: 'For sale', fmt: (v) => (v == null ? '–' : String(Math.round(v))), count: true },
};
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const monthLabel = (m) => MON[+m.slice(5, 7) - 1] + ' ' + m.slice(0, 4);

// ── data ────────────────────────────────────────────────────────────────
let _hist, _live;
const history = () => (_hist = _hist || fetch('/data/history.json').then((r) => { if (!r.ok) throw new Error('history ' + r.status); return r.json(); }));
const SUPA = 'https://itupjrknklzvmmqicuyc.supabase.co/rest/v1/', KEY = 'sb_publishable_fQnZLJnaC-dAHBuGBHJgjQ_RUHCe_7S';
const LIVE_COLS = 'village,snapshot_date,trailing30_median_price,trailing30_closed_sales,months_supply,trailing30_median_dom,trailing30_median_ppsf,homes_for_sale';
const live = () => (_live = _live || (window.NS && window.NS.snapshots ? window.NS.snapshots() :
  fetch(SUPA + 'daily_snapshots?select=' + LIVE_COLS + '&scope=eq.all&order=snapshot_date.desc&limit=6000', { headers: { apikey: KEY, Authorization: 'Bearer ' + KEY } }).then((r) => (r.ok ? r.json() : [])))
  .then((rows) => {
    const by = {};
    (rows || []).forEach((r) => { (by[r.village] = by[r.village] || []).push(r); });
    Object.values(by).forEach((a) => a.sort((p, q) => (p.snapshot_date < q.snapshot_date ? -1 : 1)));
    return by;
  }).catch(() => ({})));

const roll = (a, n, min) => a.map((_, i) => { let s = 0, c = 0; for (let j = Math.max(0, i - n + 1); j <= i; j++) if (a[j] != null) { s += a[j]; c++; } return c >= (min || Math.ceil(n / 2)) ? s / c : null; });
const rollSum = (a, n) => a.map((_, i) => { if (i < n - 1) return null; let s = 0; for (let j = i - n + 1; j <= i; j++) s += a[j] || 0; return s; });

// ── shared pieces ───────────────────────────────────────────────────────
const tip = () => ({ backgroundColor: 'rgba(6,13,31,.96)', borderColor: 'rgba(194,162,101,.55)', borderWidth: 1, padding: [10, 12], textStyle: { color: C.ink, fontFamily: SANS, fontSize: 12.5 }, extraCssText: 'border-radius:2px;box-shadow:0 12px 40px rgba(0,0,0,.45);max-width:260px;white-space:normal;', confine: true });
const axisText = () => ({ color: C.mute, fontFamily: MONO, fontSize: small() ? 10 : 11 });
const row = (color, name, val) => `<div style="display:flex;gap:10px;align-items:baseline;justify-content:space-between"><span><i style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${color};margin-right:7px"></i>${name}</span><b style="font:500 12.5px ${MONO}">${val}</b></div>`;
const head = (t, sub) => `<div style="font:500 10px ${MONO};letter-spacing:.14em;text-transform:uppercase;color:${C.pale};margin-bottom:6px">${t}${sub ? ` <span style="color:${C.mute}">· ${sub}</span>` : ''}</div>`;

function picks(host, label, options, current, onPick) {
  const wrap = document.createElement('div'); wrap.className = 'viz-group';
  const cap = document.createElement('span'); cap.className = 'label label--quiet'; cap.textContent = label; wrap.appendChild(cap);
  const g = document.createElement('div'); g.className = 'picks'; g.setAttribute('role', 'group'); g.setAttribute('aria-label', label);
  options.forEach(([value, text]) => {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'pick'; b.textContent = text; b.dataset.value = value;
    b.setAttribute('aria-pressed', String(value === current));
    b.addEventListener('click', () => { g.querySelectorAll('.pick').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); onPick(value); });
    g.appendChild(b);
  });
  wrap.appendChild(g); host.appendChild(wrap);
  return { set(v) { g.querySelectorAll('.pick').forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.value === v))); } };
}
function make(el) {
  const plot = el.querySelector('.viz-plot');
  const chart = echarts.init(plot, null, { renderer: 'canvas' });
  new ResizeObserver(() => chart.resize()).observe(plot);
  el.classList.add('is-ready');
  return chart;
}
const base = () => ({ animation: !reduce, animationDuration: 900, animationEasing: 'cubicOut', textStyle: { fontFamily: SANS }, aria: { enabled: true, decal: { show: false } } });

// ── 1. The long record: monthly history with the live tail ─────────────
async function historyChart(el) {
  const bar = el.querySelector('.viz-bar'), cap = el.querySelector('.viz-cap');
  const st = { village: el.dataset.village || 'Lake Forest', metric: el.dataset.metric || 'price', span: el.dataset.span || 'all' };
  const locked = el.hasAttribute('data-lock-village');
  const [h, lv] = await Promise.all([history(), live()]);
  const chart = make(el);
  const x = h.months.map((m) => m + '-15');
  const lastMonth = h.months[h.months.length - 1];
  const seam = (() => { const d = new Date(lastMonth + '-01T00:00:00Z'); d.setUTCMonth(d.getUTCMonth() + 1); return d.toISOString().slice(0, 10); })();

  // Daily figures (trailing 30 days), lightly smoothed, for one village.
  const liveSeries = (v, key) => {
    const f = METRICS[key].live, rows = (lv[v] || []).filter((r) => r.snapshot_date >= seam);
    if (!f || !rows.length) return [];
    const vals = roll(rows.map((r) => (r[f] == null ? null : +r[f])), 7, 3);
    return rows.map((r, i) => [r.snapshot_date, vals[i]]).filter((p) => p[1] != null);
  };
  // The months since the settled record ends, read from the last nightly figure in each month,
  // so the 12-month trend carries through to today on the same footing.
  const sinceSeam = (v, key) => {
    const f = METRICS[key].live, byM = {}; if (!f) return [];
    (lv[v] || []).forEach((r) => { if (r.snapshot_date >= seam && r[f] != null && +r[f] > 0) byM[r.snapshot_date.slice(0, 7)] = [r.snapshot_date, +r[f]]; });
    return Object.keys(byM).sort().map((m) => byM[m]);
  };
  function render() {
    const M = METRICS[st.metric], all = st.village === 'all', list = all ? VILLAGES : [st.village];
    const series = []; let end = x[x.length - 1], latest = null;
    list.forEach((v, n) => {
      const ext = sinceSeam(v, st.metric), xs = x.concat(ext.map((e) => e[0])), raw = h.villages[v][st.metric].concat(ext.map((e) => e[1]));
      const trend = roll(raw, 12, 6), cut = x.length - 1, color = all ? HUE[v] : C.steel, pts = xs.map((d, i) => [d, trend[i]]);
      if (xs[xs.length - 1] > end) end = xs[xs.length - 1];
      const mark = n === 0 ? { silent: true, symbol: 'none', lineStyle: { color: C.gold, type: [3, 5], width: 1, opacity: 0.7 }, label: { color: C.pale, fontFamily: MONO, fontSize: 9.5, formatter: 'NIGHTLY DATA BEGINS', position: 'insideEndTop', distance: 6 }, data: [{ xAxis: seam }] } : undefined;
      if (all) {
        series.push({ id: 'trend-' + v, name: v, type: 'line', data: pts, showSymbol: false, smooth: 0.25, connectNulls: true, lineStyle: { width: 1.9, color }, itemStyle: { color }, z: 3, markLine: mark,
          endLabel: { show: true, formatter: v, color, fontFamily: SANS, fontSize: small() ? 10 : 11.5, distance: 6 }, emphasis: { focus: 'series', lineStyle: { width: 3 } } });
      } else {
        series.push({ id: 'raw', name: 'Month', type: 'line', data: xs.map((d, i) => [d, raw[i]]), showSymbol: false, connectNulls: true, lineStyle: { width: 1, color: C.steel, opacity: 0.3 }, itemStyle: { color: C.steel }, z: 1 });
        series.push({ id: 'trend-' + v, name: '12-month trend', type: 'line', data: pts.slice(0, cut + 1), showSymbol: false, smooth: 0.25, connectNulls: true, lineStyle: { width: 2.4, color }, itemStyle: { color }, z: 3, markLine: mark,
          areaStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: 'rgba(143,163,196,.22)' }, { offset: 1, color: 'rgba(143,163,196,0)' }]) } });
        if (ext.length) series.push({ id: 'ext-' + v, name: '12-month trend', type: 'line', data: pts.slice(cut), showSymbol: false, smooth: 0.25, lineStyle: { width: 2.6, color: C.gold }, itemStyle: { color: C.gold }, z: 4 });
        const lvs = liveSeries(v, st.metric);
        if (lvs.length) { latest = lvs[lvs.length - 1];
          series.push({ id: 'live-' + v, name: 'Nightly, trailing 30 days', type: 'line', data: lvs, showSymbol: false, smooth: 0.3, lineStyle: { width: 1.2, color: C.pale, opacity: 0.75 }, itemStyle: { color: C.pale }, z: 5,
            markPoint: { symbol: 'circle', symbolSize: 9, itemStyle: { color: C.pale, borderColor: C.navy0, borderWidth: 2 }, label: { show: true, position: 'top', distance: 8, color: C.pale, fontFamily: MONO, fontSize: 11, formatter: () => M.fmt(latest[1]) }, data: [{ coord: latest }] } }); }
      }
    });
    const back = { '10y': 10, '5y': 5, '2y': 2 }[st.span];
    const from = st.span === 'live' ? seam : back ? (() => { const d = new Date(end + 'T00:00:00Z'); d.setUTCFullYear(d.getUTCFullYear() - back); return d.toISOString().slice(0, 10); })() : x[0];
    chart.setOption({ ...base(),
      grid: { left: 6, right: all ? (small() ? 82 : 104) : (small() ? 22 : 40), top: 26, bottom: 62, containLabel: true },
      xAxis: { type: 'time', axisLine: { lineStyle: { color: C.hair } }, axisTick: { show: false }, axisLabel: { ...axisText(), hideOverlap: true }, splitLine: { show: false } },
      yAxis: { type: 'value', scale: true, axisLabel: { ...axisText(), formatter: (v) => M.fmt(v) }, splitLine: { lineStyle: { color: C.grid } } },
      tooltip: { ...tip(), trigger: 'axis', axisPointer: { type: 'line', lineStyle: { color: C.gold, width: 1, opacity: 0.8 } },
        formatter: (ps) => { ps = ps.filter((p) => p.value[1] != null); if (!ps.length) return ''; const d = ps[0].value[0], nightly = String(ps[0].seriesId).startsWith('live');
          const when = nightly ? new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : monthLabel(d);
          return head(when, nightly ? 'nightly' : d >= seam ? 'from nightly data' : 'monthly record') + ps.sort((a, b) => b.value[1] - a.value[1]).map((p) => row(p.color, p.seriesName, M.fmt(p.value[1]))).join(''); } },
      dataZoom: [{ type: 'inside', filterMode: 'none', startValue: from, endValue: end, zoomOnMouseWheel: 'shift' },
        { type: 'slider', filterMode: 'none', startValue: from, endValue: end, height: 20, bottom: 14, borderColor: 'transparent', backgroundColor: 'rgba(18,34,70,.55)', fillerColor: 'rgba(194,162,101,.16)', handleSize: '120%', handleStyle: { color: C.gold, borderColor: C.gold }, moveHandleSize: 0, brushSelect: false, showDataShadow: false,
          textStyle: { color: C.mute, fontFamily: MONO, fontSize: 10 }, labelFormatter: (v) => new Date(v).getUTCFullYear() }],
      series }, { notMerge: true });
    if (all) {   // direct labels at the line ends: spread them so none overlap
      const ends = series.map((q) => { const last = [...q.data].reverse().find((d) => d[1] != null); return { id: q.id, y: last ? chart.convertToPixel({ yAxisIndex: 0 }, last[1]) : null }; }).filter((e) => e.y != null).sort((a, b) => a.y - b.y);
      const gap = small() ? 12 : 14; const placed = ends.map((e) => e.y);
      for (let n = 1; n < placed.length; n++) if (placed[n] - placed[n - 1] < gap) placed[n] = placed[n - 1] + gap;
      const shift = (placed[placed.length - 1] - ends[ends.length - 1].y) / 2;
      chart.setOption({ series: ends.map((e, n) => ({ id: e.id, endLabel: { offset: [0, placed[n] - shift - e.y] } })) });
    }
    el.querySelector('.viz-plot').setAttribute('aria-label', `${M.label}, ${all ? 'all seven villages' : st.village}, ${monthLabel(h.months[0])} to today.${latest ? ' Latest nightly figure: ' + M.fmt(latest[1]) + '.' : ''}`);
    if (cap) cap.innerHTML = `<b>${M.label}${all ? ', seven villages' : ', ' + st.village}.</b> ${all ? 'Each line is a 12-month trend of the monthly record' : 'The bold line is a 12-month trend of the monthly record; the thin line is each month'}, ${monthLabel(h.months[0])} to ${monthLabel(lastMonth)}${METRICS[st.metric].live ? ', carried to today with the nightly MLS figures' + (all ? '' : ' (gold)') : ''}. Detached single-family homes. Source: MRED. Drag the handles to change the period.`;
  }
  const opts = Object.keys(METRICS).filter((k) => k !== 'active').map((k) => [k, METRICS[k].short]);
  picks(bar, 'Measure', opts, st.metric, (v) => { st.metric = v; render(); });
  if (!locked) picks(bar, 'Village', [['all', 'All seven'], ...VILLAGES.map((v) => [v, v])], st.village, (v) => { st.village = v; render(); });
  picks(bar, 'Period', [['all', 'Since 2008'], ['10y', '10 years'], ['5y', '5 years'], ['2y', '2 years'], ['live', 'Live']], st.span, (v) => { st.span = v; render(); });
  render();
}

// ── 2. Eighteen years in motion: supply against price, village by village ─
async function motionChart(el) {
  const bar = el.querySelector('.viz-bar'), cap = el.querySelector('.viz-cap');
  const h = await history();
  const chart = make(el);
  const T = (m) => Math.sqrt(Math.max(0, m));                      // square-root scale: room for today's tight market and for 2009
  const data = {}; let yMax = 0;
  VILLAGES.forEach((v) => { const s = h.villages[v]; data[v] = { x: roll(s.supply, 12, 9), y: roll(s.price, 12, 9), n: rollSum(s.closed, 12) }; data[v].y.forEach((p) => { if (p > yMax) yMax = p; }); });
  const first = 11, N = h.months.length; let i = first, timer = null;
  const ticks = [0, 1, 2, 4, 6, 9, 12, 18, 24, 36], xMax = T(36);
  const frame = (k) => VILLAGES.filter((v) => data[v].x[k] != null && data[v].y[k] != null).map((v) => ({ name: v, value: [T(Math.min(36, data[v].x[k])), data[v].y[k], data[v].n[k] || 0, data[v].x[k]], itemStyle: { color: HUE[v] } }));
  const trail = (v, k) => { const out = []; for (let j = Math.max(first, k - 30); j <= k; j++) if (data[v].x[j] != null && data[v].y[j] != null) out.push([T(Math.min(36, data[v].x[j])), data[v].y[j]]); return out; };
  const size = (val) => Math.max(9, Math.sqrt(val[2]) * (small() ? 1.25 : 1.9));
  const yearStyle = (k) => ({ text: h.months[k].slice(0, 4), fontFamily: 'Cormorant Garamond, Georgia, serif', fontWeight: 300, fontSize: small() ? 72 : 150, fill: 'rgba(234,217,174,.16)' });
  chart.setOption({ ...base(), animationDurationUpdate: reduce ? 0 : 170, animationEasingUpdate: 'linear',
    grid: { left: 8, right: small() ? 18 : 34, top: 34, bottom: 46, containLabel: true },
    xAxis: { type: 'value', min: 0, max: xMax, name: 'Months of supply  →  more homes than buyers', nameLocation: 'middle', nameGap: 30, nameTextStyle: { color: C.mute, fontFamily: MONO, fontSize: 10 },
      axisLine: { lineStyle: { color: C.hair } }, splitLine: { show: false }, axisTick: { customValues: ticks.map(T), lineStyle: { color: C.hair } }, axisLabel: { ...axisText(), customValues: ticks.map(T), formatter: (v) => String(Math.round(v * v)) } },
    yAxis: { type: 'value', min: 0, max: Math.ceil(yMax / 5e5) * 5e5, axisLabel: { ...axisText(), formatter: money }, splitLine: { lineStyle: { color: C.grid } } },
    tooltip: { ...tip(), trigger: 'item', formatter: (p) => (p.seriesId !== 'dots' ? '' : head(p.name, monthLabel(h.months[i])) + row(p.color, 'Median price', money(p.value[1])) + row(p.color, 'Months of supply', p.value[3].toFixed(1)) + row(p.color, 'Closed, 12 months', String(p.value[2]))) },
    graphic: [{ id: 'year', type: 'text', right: small() ? 18 : 46, bottom: small() ? 64 : 76, silent: true, z: 0, style: yearStyle(i) }],
    series: [
      { id: 'bands', type: 'scatter', data: [], silent: true, markArea: { silent: true, label: { color: C.mute, fontFamily: MONO, fontSize: small() ? 8.5 : 10, position: 'insideTop', distance: 8 },
        data: [[{ xAxis: 0, name: "SELLER'S MARKET", itemStyle: { color: 'rgba(194,162,101,.07)' } }, { xAxis: T(4) }], [{ xAxis: T(4), name: 'BALANCED', itemStyle: { color: 'rgba(214,221,232,.03)' } }, { xAxis: T(6) }], [{ xAxis: T(6), name: "BUYER'S MARKET", itemStyle: { color: 'rgba(95,140,200,.06)' } }, { xAxis: xMax }]] } },
      ...VILLAGES.map((v) => ({ id: 't-' + v, type: 'line', data: trail(v, i), showSymbol: false, silent: true, smooth: 0.3, lineStyle: { color: HUE[v], width: 1.2, opacity: 0.38 }, z: 2 })),
      { id: 'dots', type: 'scatter', data: frame(i), symbolSize: size, z: 5, itemStyle: { opacity: 0.92, borderColor: C.navy0, borderWidth: 1 },
        label: { show: true, formatter: (p) => p.name, position: 'right', distance: 6, color: C.ink, fontFamily: SANS, fontSize: small() ? 10 : 11.5, textBorderColor: C.navy0, textBorderWidth: 3 }, labelLayout: { hideOverlap: true, moveOverlap: 'shiftY' }, emphasis: { scale: 1.15 } },
    ] });
  // controls
  const wrap = document.createElement('div'); wrap.className = 'viz-scrub';
  wrap.innerHTML = `<button type="button" class="viz-play" aria-label="Play"><span aria-hidden="true">▶</span></button><input type="range" min="${first}" max="${N - 1}" value="${i}" step="1" aria-label="Month"><output class="viz-when"></output>`;
  bar.appendChild(wrap);
  const btn = wrap.querySelector('.viz-play'), rng = wrap.querySelector('input'), when = wrap.querySelector('output');
  const go = (k) => { i = k; rng.value = String(k); when.textContent = monthLabel(h.months[k]); rng.setAttribute('aria-valuetext', monthLabel(h.months[k]));
    chart.setOption({ graphic: [{ id: 'year', style: yearStyle(k) }], series: [...VILLAGES.map((v) => ({ id: 't-' + v, data: trail(v, k) })), { id: 'dots', data: frame(k) }] }); };
  const stop = () => { clearInterval(timer); timer = null; btn.firstElementChild.textContent = '▶'; btn.setAttribute('aria-label', 'Play'); };
  const play = () => { if (i >= N - 1) go(first); btn.firstElementChild.textContent = '❚❚'; btn.setAttribute('aria-label', 'Pause');
    timer = setInterval(() => { if (i >= N - 1) return stop(); go(i + 1); }, reduce ? 260 : 170); };
  btn.addEventListener('click', () => (timer ? stop() : play()));
  rng.addEventListener('input', () => { stop(); go(+rng.value); });
  go(reduce ? N - 1 : first);
  if (cap) cap.innerHTML = `<b>How to read it.</b> Each circle is a village; its size is the number of homes sold in the prior twelve months. Left means fewer homes for sale relative to demand. Up means a higher median price. Values are twelve-month averages of the monthly record, ${monthLabel(h.months[0])} to ${monthLabel(h.months[N - 1])}. Detached single-family homes. Source: MRED.`;
  if (!reduce) new IntersectionObserver((es, io) => { if (es[0].isIntersecting) { io.disconnect(); setTimeout(play, 500); } }, { threshold: 0.55 }).observe(el);
  document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); });
}

// ── 3. The year's rhythm: month by year ────────────────────────────────
async function seasonsChart(el) {
  const bar = el.querySelector('.viz-bar'), cap = el.querySelector('.viz-cap');
  const st = { village: el.dataset.village || 'Lake Forest', metric: el.dataset.metric || 'closed' };
  const h = await history();
  const chart = make(el);
  const years = [...new Set(h.months.map((m) => m.slice(0, 4)))];
  function render() {
    const M = METRICS[st.metric], s = h.villages[st.village][st.metric], cells = [], byMonth = MON.map(() => []); let lo = Infinity, hi = -Infinity;
    h.months.forEach((m, k) => { const v = s[k]; if (v == null) return; const yi = years.indexOf(m.slice(0, 4)), mi = +m.slice(5, 7) - 1; cells.push([mi, yi, v]); if (v < lo) lo = v; if (v > hi) hi = v; if (+m.slice(0, 4) < +years[years.length - 1]) byMonth[mi].push(v); });
    const avg = byMonth.map((a) => (a.length ? a.reduce((p, q) => p + q, 0) / a.length : null));
    const sorted = cells.map((c) => c[2]).sort((a, b) => a - b), p95 = sorted[Math.floor(sorted.length * 0.96)];
    const peak = avg.indexOf(Math.max(...avg)), trough = avg.indexOf(Math.min(...avg));
    chart.setOption({ ...base(),
      grid: [{ left: 44, right: small() ? 8 : 20, top: 8, height: 64 }, { left: 44, right: small() ? 8 : 20, top: 92, bottom: 58 }],
      xAxis: [{ gridIndex: 0, type: 'category', data: MON, show: false }, { gridIndex: 1, type: 'category', data: MON, position: 'top', axisLine: { show: false }, axisTick: { show: false }, axisLabel: { ...axisText(), interval: 0, formatter: (v) => (small() ? v[0] : v) }, splitArea: { show: false } }],
      yAxis: [{ gridIndex: 0, type: 'value', show: false, scale: st.metric !== 'closed' }, { gridIndex: 1, type: 'category', data: years, inverse: true, axisLine: { show: false }, axisTick: { show: false }, axisLabel: { ...axisText(), interval: small() ? 1 : 0 } }],
      tooltip: { ...tip(), formatter: (p) => (p.seriesId === 'avg' ? head(MON[p.dataIndex], 'average since ' + years[0]) + row(C.gold, M.short, M.fmt(p.value)) : head(MON[p.value[0]] + ' ' + years[p.value[1]], st.village) + row(p.color, M.short, M.fmt(p.value[2]))) },
      visualMap: { type: 'continuous', seriesIndex: 1, min: Math.floor(lo), max: Math.ceil(p95), calculable: false, orient: 'horizontal', left: 'center', bottom: 6, itemWidth: 10, itemHeight: small() ? 150 : 220, text: [M.fmt(p95), M.fmt(lo)], textStyle: { color: C.mute, fontFamily: MONO, fontSize: 10 },
        inRange: { color: ['#0E1C3C', '#1E3567', '#3C568E', '#8E7B50', '#C2A265', '#EAD9AE'] } },
      series: [{ id: 'avg', type: 'bar', xAxisIndex: 0, yAxisIndex: 0, data: avg, barWidth: '62%', itemStyle: { color: (p) => (p.dataIndex === peak ? C.pale : 'rgba(194,162,101,.42)'), borderRadius: [2, 2, 0, 0] } },
        { id: 'heat', type: 'heatmap', xAxisIndex: 1, yAxisIndex: 1, data: cells, itemStyle: { borderColor: C.navy1, borderWidth: small() ? 1 : 2, borderRadius: 2 }, emphasis: { itemStyle: { borderColor: C.pale, borderWidth: 1.5 } }, progressive: 0 }] }, { notMerge: true });
    el.querySelector('.viz-plot').setAttribute('aria-label', `${M.label} by month and year, ${st.village}. Highest on average in ${MON[peak]}, lowest in ${MON[trough]}.`);
    if (cap) cap.innerHTML = `<b>${st.village}: ${M.label.toLowerCase()}.</b> On average since ${years[0]}, ${MON[peak]} is the ${st.metric === 'dom' ? 'slowest' : 'highest'} month and ${MON[trough]} the ${st.metric === 'dom' ? 'fastest' : 'lowest'}. The bars show the average for each month; each square is one month. A closing follows its accepted offer, so demand peaks earlier than these dates suggest. Detached single-family homes. Source: MRED.`;
  }
  picks(bar, 'Measure', [['closed', 'Closed sales'], ['price', 'Median price'], ['dom', 'Days on market'], ['pct', 'Sale to original']], st.metric, (v) => { st.metric = v; render(); });
  picks(bar, 'Village', VILLAGES.map((v) => [v, v]), st.village, (v) => { st.village = v; render(); });
  render();
}

// ── 4. The record: every published sale, by year and price ─────────────
function recordChart(el) {
  const cap = el.querySelector('.viz-cap'), bar = el.querySelector('.viz-bar');
  const sales = JSON.parse(el.querySelector('script[type="application/json"]').textContent);
  const chart = make(el);
  const tier = +el.dataset.tier || 2500000, st = { side: 'all' };
  const years = sales.map((s) => s.year), y0 = Math.min(...years), y1 = Math.max(...years);
  const jit = (s, k) => { const same = sales.filter((q) => q.year === s.year); const n = same.length, j = same.indexOf(s); return s.year + (n === 1 ? 0 : (j / (n - 1) - 0.5) * 0.62); };
  const SIDE = { listing: ['Listing side', C.pale], buyer: ['Buyer side', '#8FB8DE'], both: ['Both sides', C.gold] };
  function render() {
    const list = sales.filter((s) => st.side === 'all' || s.side === st.side);
    chart.setOption({ ...base(),
      grid: { left: 6, right: small() ? 14 : 30, top: 30, bottom: 12, containLabel: true },
      xAxis: { type: 'value', min: y0 - 1, max: y1 + 1, interval: 1, axisLine: { lineStyle: { color: C.hair } }, axisTick: { show: false }, splitLine: { show: false }, axisLabel: { ...axisText(), formatter: (v) => (v >= y0 && v <= y1 ? String(v) : '') } },
      yAxis: { type: 'value', min: 1000000, axisLabel: { ...axisText(), formatter: money }, splitLine: { lineStyle: { color: C.grid } } },
      tooltip: { ...tip(), trigger: 'item', formatter: (p) => { const s = p.data.s; return head(s.address, s.town) + row(p.color, 'Closed ' + s.year, '$' + s.price.toLocaleString('en-US')) + `<div style="color:${C.mute};margin-top:4px">${s.side_label}${s.rank ? `<br>No. ${s.rank} of ${s.n} ${s.town} sales in ${s.year}${s.ytd ? ' to date' : ''}` : ''}${s.href ? '<br><span style="color:' + C.pale + '">Select to open the story</span>' : ''}</div>`; } },
      series: Object.keys(SIDE).map((k) => ({ id: k, name: SIDE[k][0], type: 'scatter', z: 3, data: list.filter((s) => s.side === k).map((s) => ({ value: [jit(s), s.price], s, symbolSize: 10 + Math.sqrt(s.price / 1e6) * (small() ? 5 : 8), itemStyle: { color: SIDE[k][1], opacity: s.price >= tier ? 0.95 : 0.5, borderColor: s.href ? '#fff' : C.navy0, borderWidth: s.href ? 2.5 : 1, shadowBlur: s.href ? 14 : 0, shadowColor: 'rgba(234,217,174,.55)' } })),
        markLine: k === 'listing' ? { silent: true, symbol: 'none', lineStyle: { color: C.gold, type: [3, 5], opacity: 0.6 }, label: { formatter: 'TROPHY TIER · ' + money(tier) + ' AND ABOVE', color: C.pale, fontFamily: MONO, fontSize: small() ? 8.5 : 10, position: 'insideStartTop' }, data: [{ yAxis: tier }] } : undefined })) }, { notMerge: true });
  }
  chart.on('click', (p) => { if (p.data && p.data.s && p.data.s.href) location.href = p.data.s.href; });
  chart.getZr().on('mousemove', (e) => { chart.getZr().setCursorStyle(e.target ? 'pointer' : 'default'); });
  picks(bar, 'Representation', [['all', 'All'], ['listing', 'Listing side'], ['buyer', 'Buyer side'], ['both', 'Both sides']], 'all', (v) => { st.side = v; render(); });
  render();
  const total = sales.reduce((a, s) => a + s.price, 0), top = sales.filter((s) => s.price >= tier).length;
  el.querySelector('.viz-plot').setAttribute('aria-label', `${sales.length} closed sales of one million dollars and above, ${y0} to ${y1}; ${top} at ${money(tier)} and above. The full list follows.`);
  if (cap) cap.innerHTML = `<b>${sales.length} closed sales of $1,000,000 and above, ${y0} to ${y1}.</b> ${top} at ${money(tier)} and above; ${money(total)} in total. Circle size follows price. Circles ringed in white open the full story of the sale.`;
}

const KINDS = { history: historyChart, motion: motionChart, seasons: seasonsChart, record: recordChart };
export function mount(els) {
  els.forEach((el) => {
    if (el.dataset.vizOn) return; el.dataset.vizOn = '1';
    const run = KINDS[el.dataset.viz]; if (!run) return;
    Promise.resolve().then(() => run(el)).catch((err) => { el.classList.add('is-failed'); const c = el.querySelector('.viz-cap'); if (c) c.textContent = 'The chart could not load. Call or write and I will send the figures.'; console.warn('viz', el.dataset.viz, err); });
  });
}
