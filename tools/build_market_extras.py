#!/usr/bin/env python3
"""Bake the two aggregate files behind the Buying and Heritage charts.

  public/data/budget.json   what a budget buys, village by village (closed sales, past 24 months)
  public/data/eras.json     when each village was built (homes sold since 2007, by decade built)

Source: MLS closed sales in Supabase `raw_sales`, which is not public. Run the two
queries in tools/sql/ (Supabase SQL editor or MCP), save the result rows as
tools/data/budget_raw.json and tools/data/eras_raw.json, then run this script.
Each row carries a checksum computed in the database; the script refuses to
write if a row does not add up, so a mistyped figure cannot reach the site.

Only aggregates are published: counts and medians. No individual sale is in either file.
"""
import json, os, sys
here = os.path.dirname(os.path.abspath(__file__)); root = os.path.dirname(here)
GRID = [500000,600000,700000,800000,900000,1000000,1100000,1200000,1300000,1400000,1500000,1600000,1800000,
        2000000,2250000,2500000,2750000,3000000,3500000,4000000,4500000,5000000,6000000,7000000,8000000]
ORDER = ['Lake Bluff','Lake Forest','Highland Park','Glencoe','Winnetka','Kenilworth','Wilmette']   # north to south

def budget():
    rows = json.load(open(f'{here}/data/budget_raw.json')); out = {'asof': rows[0]['asof'], 'months': 24, 'window': 0.15, 'grid': GRID, 'villages': {}}
    for r in rows:
        q = [int(x) for x in r['q'].split(',')]; g = [[int(x) for x in c.split(',')] for c in r['grid'].split(';')]
        if len(g) != len(GRID): sys.exit(f"{r['v']}: {len(g)} grid points, expected {len(GRID)}")
        if r['n'] + sum(q) + sum(map(sum, g)) != int(r['chk']): sys.exit(f"{r['v']}: checksum mismatch in budget_raw.json")
        # per grid point: [sales at or below, sales within the window, median sq ft, median acres, median year built, median days, sold at or above asking]
        out['villages'][r['v']] = {'n': r['n'], 'q': q, 'g': [[c[0], c[1], c[2], c[3] / 100, c[4], c[5], c[6]] for c in g]}
    out['order'] = [v for v in ORDER if v in out['villages']]
    json.dump(out, open(f'{root}/public/data/budget.json', 'w'), separators=(',', ':')); return out

def eras():
    rows = json.load(open(f'{here}/data/eras_raw.json')); out = {'since': 2007, 'recent_months': 36, 'villages': {}}
    decades = None
    for r in rows:
        e = [[int(x) for x in c.split(':')] for c in r['e'].split(';')]
        if sum(map(sum, e)) != int(r['chk']): sys.exit(f"{r['v']}: checksum mismatch in eras_raw.json")
        d = [c[0] for c in e]; decades = decades or d
        if d != decades: sys.exit(f"{r['v']}: decade list differs")
        # per decade: [homes sold at least once since 2007, sales in the recent window, median price of those in $ thousands]
        out['villages'][r['v']] = {'homes': sum(c[1] for c in e), 'd': [[c[1], c[2], c[3]] for c in e]}
    out['decades'] = decades; out['order'] = [v for v in ORDER if v in out['villages']]
    json.dump(out, open(f'{root}/public/data/eras.json', 'w'), separators=(',', ':')); return out

if __name__ == '__main__':
    b = budget(); e = eras()
    print('budget.json', os.path.getsize(f'{root}/public/data/budget.json'), 'bytes ·', len(b['villages']), 'villages · as of', b['asof'])
    print('eras.json  ', os.path.getsize(f'{root}/public/data/eras.json'), 'bytes ·', len(e['decades']), 'decades')
