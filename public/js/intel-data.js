/* Intelligence data layer — extracted verbatim from v11 intelligence.html (proven in production). */
const SUPA = {
  URL: 'https://itupjrknklzvmmqicuyc.supabase.co',
  KEY: 'sb_publishable_fQnZLJnaC-dAHBuGBHJgjQ_RUHCe_7S'
};

const VILLAGES = ['North Shore','Glencoe','Highland Park','Kenilworth','Lake Bluff','Lake Forest','Wilmette','Winnetka'];

const CUTOFF_DATE = '2026-03-01';

const KPIS = [
  { id:'median_price',   label:'Median Price',         help:'Median closed-sale price.',                          metric:'median_sale_price',          fmt:'money',  invert:false },
  { id:'units_sold',     label:'Closed Sales',          help:'Number of closed transactions.',                     metric:'closed_sales',               fmt:'int',    invert:false },
  { id:'dom',            label:'Days on Market',        help:'Median days on market for closed sales.',            metric:'median_dom',                 fmt:'int',    invert:true  },
  { id:'sp_lp',          label:'SP / OLP',              help:'Sale price as % of original list price.',            metric:'median_sp_lp_ratio',         fmt:'pct',    invert:false },
  { id:'new_listings',   label:'New Listings',          help:'Newly listed properties.',                           metric:'new_listings',               fmt:'int',    invert:false },
  { id:'inventory_ratio',label:'Inventory Ratio',       help:'Active inventory / new listings.',                   metric:'inventory_to_new_ratio',     fmt:'dec1',   invert:false },
  { id:'absorption',     label:'Absorption Rate',       help:'Closed ÷ Active. >25% favors sellers.',              metric:'absorption_rate',            fmt:'pct01',  invert:false },
  { id:'months_supply',  label:'Months of Supply',      help:'Active inventory at current pace.',                  metric:'months_supply',              fmt:'dec1',   invert:true  },
  { id:'ppsf_reduc',     label:'$ / SqFt',              help:'Median sale price per finished sqft.',               metric:'median_price_per_sqft',      fmt:'money0', invert:false },
  { id:'pending',        label:'Pending Sales',         help:'Under contract count.',                              metric:'under_contract',             fmt:'int',    invert:false },
  { id:'r7_contracts',   label:'7-day Contract Pace',   help:'Pending velocity, last 7 days.',                     metric:'pending_last_7_days',        fmt:'int',    invert:false }
];

const FMT = {
  money:  v => v==null?'—':'$'+Number(v).toLocaleString(undefined,{maximumFractionDigits:0}),
  money0: v => v==null?'—':'$'+Number(v).toLocaleString(undefined,{maximumFractionDigits:0}),
  int:    v => v==null?'—':Number(v).toLocaleString(undefined,{maximumFractionDigits:0}),
  pct:    v => v==null?'—':Number(v).toFixed(1)+'%',
  pct01:  v => v==null?'—':(Number(v)*100).toFixed(1)+'%',
  ratio:  v => v==null?'—':Number(v).toFixed(2)+'×',
  dec1:   v => v==null?'—':Number(v).toFixed(1)
};

async function supaFetch(path, params={}) {
  const url = new URL(SUPA.URL + '/rest/v1/' + path);
  Object.entries(params).forEach(([k,v]) => url.searchParams.append(k,v));
  const r = await fetch(url, { headers: { apikey: SUPA.KEY, Authorization: 'Bearer ' + SUPA.KEY }});
  if (!r.ok) throw new Error('supabase '+r.status);
  return r.json();
}

async function supaRpc(name, body={}) {
  const r = await fetch(SUPA.URL + '/rest/v1/rpc/' + name, {
    method: 'POST',
    headers: { apikey: SUPA.KEY, Authorization: 'Bearer ' + SUPA.KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!r.ok) throw new Error('supabase rpc '+r.status);
  return r.json();
}

async function loadVillageSeries(village, scope) {
  if (village === 'North Shore') {
    return supaFetch('mv_market_intelligence', {
      select: 'village,scope,d,source,metric,value',
      'village': 'in.(' + VILLAGES.filter(v=>v!=='North Shore').map(v=>`"${v}"`).join(',') + ')',
      'scope': 'in.(all,luxury)',
      order: 'd.asc', limit: 250000
    });
  }
  return supaFetch('mv_market_intelligence', {
    select: 'village,scope,d,source,metric,value',
    village: `eq.${village}`, 'scope': 'in.(all,luxury)',
    order: 'd.asc', limit: 250000
  });
}

function aggregateNorthShore(rows, scopeFilter) {
  const SUMS = new Set(['closed_sales','new_listings','under_contract','active_inventory','pending_last_7_days']);
  const buckets = {};
  for (const r of rows) {
    if (r.source === 'mls_daily' && r.scope !== scopeFilter) continue;
    const key = r.d + '|' + r.metric + '|' + r.source;
    if (!buckets[key]) buckets[key] = [];
    buckets[key].push(Number(r.value));
  }
  const out = [];
  for (const key in buckets) {
    const [d, metric, source] = key.split('|');
    const arr = buckets[key].filter(v => !isNaN(v));
    if (!arr.length) continue;
    const v = SUMS.has(metric) ? arr.reduce((a,b)=>a+b,0) : (arr.sort((a,b)=>a-b)[Math.floor(arr.length/2)]);
    out.push({ d, source, metric, value: v });
  }
  return out;
}

function indexByMetric(rows, scopeFilter) {
  const data = {};
  for (const r of rows) {
    if (r.source === 'mls_daily' && r.scope !== scopeFilter) continue;
    if (r.source === 'infosparks' && r.scope !== 'all') continue;
    if (!data[r.metric]) data[r.metric] = [];
    data[r.metric].push({ d: r.d, source: r.source, value: Number(r.value) });
  }
  for (const m in data) data[m].sort((a,b)=>a.d.localeCompare(b.d));
  return data;
}

function rollingMean(series, days) {
  const out = []; let sum = 0; const q = []; const ms = days * 86400000;
  for (let i = 0; i < series.length; i++) {
    const t = new Date(series[i].d+'T00:00:00Z').getTime();
    q.push({ t, v: series[i].value }); sum += series[i].value;
    while (q.length && t - q[0].t > ms) { sum -= q[0].v; q.shift(); }
    out.push({ d: series[i].d, value: sum / q.length });
  }
  return out;
}

function linearInterpolate(series) {
  if (!series.length) return [];
  const sorted = [...series].filter(p=>p.value!=null && !isNaN(p.value)).sort((a,b)=>a.d.localeCompare(b.d));
  if (sorted.length < 2) return sorted;
  const out = [];
  for (let i = 0; i < sorted.length-1; i++) {
    out.push(sorted[i]);
    const t0 = new Date(sorted[i].d+'T00:00:00Z').getTime();
    const t1 = new Date(sorted[i+1].d+'T00:00:00Z').getTime();
    const gap = Math.round((t1-t0)/86400000);
    if (gap > 1 && gap < 60) {
      for (let j = 1; j < gap; j++) {
        const t = new Date(t0 + j*86400000);
        const f = j/gap;
        const v = sorted[i].value + (sorted[i+1].value - sorted[i].value)*f;
        out.push({ d: t.toISOString().slice(0,10), value: v });
      }
    }
  }
  out.push(sorted[sorted.length-1]);
  return out;
}

function latestOf(series) { return series.length ? series[series.length-1] : null; }

function findNearDaysAgo(series, days) {
  if (!series.length) return null;
  const last = new Date(series[series.length-1].d+'T00:00:00Z').getTime();
  const target = last - days*86400000;
  let best=null, bd=Infinity;
  for (const p of series) {
    const t = new Date(p.d+'T00:00:00Z').getTime();
    const d = Math.abs(t-target);
    if (d < bd) { bd=d; best=p; }
  }
  return best;
}

function pctChange(now, prev) { if (now==null||prev==null||prev===0) return null; return ((now-prev)/prev)*100; }
