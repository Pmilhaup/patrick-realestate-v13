#!/usr/bin/env python3
"""Bake the monthly market history used by the site's charts.

Reads the public materialized view `mv_market_intelligence` (monthly rows, source = infosparks,
2008 onward) with the publishable key and writes public/data/history.json. The live daily tail
(March 2026 onward) is fetched by the browser from `daily_snapshots`, so this file only needs
re-running when a new month of settled statistics is loaded.

    python tools/sync_history.py            # fetch and write
    python tools/sync_history.py file.json  # build from a saved response instead of fetching
"""
import json, sys, urllib.request, datetime, pathlib

URL = 'https://itupjrknklzvmmqicuyc.supabase.co/rest/v1/mv_market_intelligence'
KEY = 'sb_publishable_fQnZLJnaC-dAHBuGBHJgjQ_RUHCe_7S'   # publishable (read-only, row-level security)
VILLAGES = ['Lake Bluff', 'Lake Forest', 'Highland Park', 'Glencoe', 'Winnetka', 'Kenilworth', 'Wilmette']
# metric in the view -> (key in the file, rounding)
METRICS = {
    'median_sale_price':      ('price',   lambda v: int(round(v))),
    'closed_sales':           ('closed',  lambda v: int(round(v))),
    'months_supply':          ('supply',  lambda v: round(v, 1)),
    'homes_for_sale':         ('active',  lambda v: int(round(v))),
    'new_listings':           ('new',     lambda v: int(round(v))),
    'median_dom':             ('dom',     lambda v: int(round(v))),
    'median_pct_of_original': ('pct',     lambda v: round(v * 100 if v < 3 else v, 1)),
    'median_ppsf':            ('ppsf',    lambda v: int(round(v))),
}

def fetch():
    q = '?select=village,d,metric,value&source=eq.infosparks&scope=eq.all&order=d.asc&limit=250000'
    req = urllib.request.Request(URL + q, headers={'apikey': KEY, 'Authorization': 'Bearer ' + KEY})
    with urllib.request.urlopen(req, timeout=90) as r:
        return json.load(r)

def main():
    rows = json.load(open(sys.argv[1])) if len(sys.argv) > 1 else fetch()
    months = sorted({r['d'][:7] for r in rows})
    idx = {m: i for i, m in enumerate(months)}
    out = {v: {k: [None] * len(months) for k, _ in METRICS.values()} for v in VILLAGES}
    for r in rows:
        if r['village'] in out and r['metric'] in METRICS and r['value'] is not None:
            key, fn = METRICS[r['metric']]
            out[r['village']][key][idx[r['d'][:7]]] = fn(float(r['value']))
    doc = {
        'generated': datetime.date.today().isoformat(),
        'source': 'Monthly MLS statistics for detached single-family homes (MRED, via InfoSparks)',
        'from': months[0], 'through': months[-1], 'months': months, 'villages': out,
    }
    path = pathlib.Path(__file__).resolve().parent.parent / 'public' / 'data' / 'history.json'
    path.write_text(json.dumps(doc, separators=(',', ':')))
    filled = sum(x is not None for v in out.values() for s in v.values() for x in s)
    print(f'{path.name}: {len(months)} months {months[0]}..{months[-1]}, {filled} values, {path.stat().st_size // 1024} KB')

if __name__ == '__main__':
    main()
