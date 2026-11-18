-- What a budget buys, village by village. Closed single-family sales, past 24 months.
-- One row per village: totals, price quantiles (5/10/25/50/75/90/95), then for each budget point
--   below, n, sf, ac, yb, dom, ov   =  sales at or below the budget; sales within 15% of it;
--   and for those nearby sales the median above-grade sq ft, median acres x100, median year built,
--   median days on market, and how many closed at or above the final asking price.
-- chk is the sum of every integer in the row; tools/build_market_extras.py re-adds it.
with mx as (select max(close_date) d from raw_sales where close_price>0),
b as (select r.village, r.close_price::float8 p, case when r.sqft_above_grade>500 then r.sqft_above_grade::float8 end sf,
        case when r.lot_acres>0 then r.lot_acres::float8 end ac, case when r.year_built between 1800 and 2026 then r.year_built::float8 end yb,
        r.days_on_market::float8 dom, (r.final_list_price>0 and r.close_price>=r.final_list_price) atask
      from raw_sales r, mx where r.property_type='Single Family' and r.close_price>0 and r.close_date > mx.d - interval '24 months'),
g(i,v) as (values (1,500000),(2,600000),(3,700000),(4,800000),(5,900000),(6,1000000),(7,1100000),(8,1200000),(9,1300000),(10,1400000),(11,1500000),(12,1600000),(13,1800000),(14,2000000),(15,2250000),(16,2500000),(17,2750000),(18,3000000),(19,3500000),(20,4000000),(21,4500000),(22,5000000),(23,6000000),(24,7000000),(25,8000000)),
x as (select b.village, g.i,
  count(*) filter (where b.p<=g.v) below,
  count(*) filter (where b.p between g.v*0.85 and g.v*1.15) n,
  coalesce(round(percentile_cont(0.5) within group (order by b.sf) filter (where b.p between g.v*0.85 and g.v*1.15)),0)::int sf,
  coalesce(round(100*percentile_cont(0.5) within group (order by b.ac) filter (where b.p between g.v*0.85 and g.v*1.15)),0)::int ac,
  coalesce(round(percentile_cont(0.5) within group (order by b.yb) filter (where b.p between g.v*0.85 and g.v*1.15)),0)::int yb,
  coalesce(round(percentile_cont(0.5) within group (order by b.dom) filter (where b.p between g.v*0.85 and g.v*1.15)),0)::int dom,
  count(*) filter (where b.p between g.v*0.85 and g.v*1.15 and b.atask) ov
 from b cross join g group by b.village, g.i),
t as (select village, count(*) n, (select array_agg(round(u)::bigint) from unnest(percentile_cont(array[0.05,0.1,0.25,0.5,0.75,0.9,0.95]) within group (order by p)) u) qs from b group by village)
select t.village v, t.n, array_to_string(t.qs,',') q,
 (select string_agg(below||','||n||','||sf||','||ac||','||yb||','||dom||','||ov, ';' order by i) from x where x.village=t.village) grid,
 t.n + (select sum(u) from unnest(t.qs) u) + (select sum(below+n+sf+ac+yb+dom+ov) from x where x.village=t.village) chk,
 (select d::text from mx) asof
from t order by t.village;
