#!/usr/bin/env python3
"""Bake public/data/valuation.json: the model, its blind-test record, and the timing tables.

Sources (Supabase, private): v_cma_comp_pool (closed sales with the CMA v2 fields) and
v_listing_lifecycle (every public listing attempt and its outcome). The queries are in
tools/sql/valuation_model.sql and tools/sql/valuation_timing.sql. Save their rows as
tools/data/valuation_model_raw.json and tools/data/valuation_timing_raw.json, then run this.
Every row carries a checksum computed in the database; nothing is written if one fails.

What is published: regression coefficients, error quantiles and monthly aggregates.
No individual sale, address or listing is in the file.
"""
import json, os, sys
here = os.path.dirname(os.path.abspath(__file__)); root = os.path.dirname(here)
ORDER = ['Lake Bluff', 'Lake Forest', 'Highland Park', 'Glencoe', 'Winnetka', 'Kenilworth', 'Wilmette']
FEATURES = ['const', 'ln(sqft/3000)', 'ln(sqft/3000)^2', 'ln(acres/0.4)', 'age/100', '(age/100)^2', 'baths-3.5', 'years_before_asof', 'new_build', 'renovated_10y']
BUCKETS = ['0 to 7 days', '8 to 14', '15 to 30', '31 to 60', '61 to 120', 'Over 120']
model = json.load(open(f'{here}/data/valuation_model_raw.json')); timing = {r['v']: r for r in json.load(open(f'{here}/data/valuation_timing_raw.json'))}
out = {'asof': model[0]['asof'], 'features': FEATURES, 'buckets': BUCKETS, 'train_months': 36, 'when_years': [2021, 2025], 'curve_since': 2023, 'order': ORDER, 'villages': {}}
for r in model:
    b = [float(x) for x in r['beta'].split(',')]
    if len(b) != len(FEATURES) or abs(sum(b) - float(r['chk'])) > 1e-4: sys.exit(f"{r['v']}: model checksum mismatch")
    g = r['rng'].split(','); q = [float(x) for x in r['ratio_q'].split(',')]
    t = timing[r['v']]; w = [[int(x) for x in c.split(':')] for c in t['whn'].split(';')]; cv = [[int(x) for x in c.split(':')] for c in t['curve'].split(';')]
    if len(w) != 12 or len(cv) != 6 or t['c2c'] + sum(map(sum, w)) + sum(map(sum, cv)) != int(t['chk']): sys.exit(f"{r['v']}: timing checksum mismatch")
    out['villages'][r['v']] = {
        'n': r['n'], 'sd': float(r['sd']), 'beta': b,
        'range': {'sqft': [int(g[0]), int(g[1])], 'acres': [float(g[2]), float(g[3])], 'year': int(g[4]), 'baths': [float(g[5]), float(g[6])]},
        # blind test: model fitted on the 36 months before the last 12, then asked to price the last 12
        'test': {'n': r['n_test'], 'ratio_q': q, 'mdape': float(r['mdape']), 'within10': float(r['w10']), 'within20': float(r['w20'])},
        # per launch month: [launches, % that sold, median days to contract, median sale / first asking x1000, % at or above first asking]
        'when': w,
        # per days-to-contract bucket: [sales, median sale / first asking x1000, % that took a price cut]
        'curve': cv, 'contract_to_close': t['c2c']}
os.makedirs(f'{root}/public/data', exist_ok=True)
json.dump(out, open(f'{root}/public/data/valuation.json', 'w'), separators=(',', ':'))
print('valuation.json', os.path.getsize(f'{root}/public/data/valuation.json'), 'bytes ·', sum(v['n'] for v in out['villages'].values()), 'training sales ·', sum(v['test']['n'] for v in out['villages'].values()), 'blind-test sales · as of', out['asof'])
