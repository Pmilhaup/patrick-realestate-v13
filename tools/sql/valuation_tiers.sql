-- Home valuation, accuracy tiers: what the owner's tax bill and purchase history add to the records-only model.
-- Same rows and filters as valuation_model.sql, limited to sales with a tax bill on record (2,000 to 300,000).
--   b   the records-only model (ten features)
--   t   the same plus ln(annual tax bill / 15,000). New construction carries a land-only bill, so homes
--       one year old or newer fall back to b, in the test and in the tool.
--   br  geometric mean of b and a repeat-sale estimate: the last purchase price moved by the village's
--       median sale price (purchase-year median to the trailing-12-month median as of the valuation date)
--   tr  the same with t in place of b
-- Blind test as before: models fitted on the 36 months before the last 12, asked to price the last 12.
-- The repeat-sale estimate uses only what was known at each sale date: a prior sale of the same address
-- at least 24 months earlier (2008 or later, raw_sales), and the median of the 12 months before the sale.
-- Each tier string is q10,q25,q50,q75,q90 of actual/predicted | median miss, share within 10%, within 20%.
-- idx = calendar-year village medians 2008 onward in $K; t12 = trailing-12-month median in $K.
-- Output is aggregates and coefficients only. The solver is temporary; nothing is left in the database.
create or replace function pg_temp.solve(a float8[], b float8[], p int) returns float8[] language plpgsql as $f$
declare m float8[] := a; r float8[] := b; i int; j int; k int; piv int; f float8; t float8; mx float8;
begin
  for i in 1..p loop
    piv := i; mx := abs(m[(i-1)*p+i]);
    for k in i+1..p loop if abs(m[(k-1)*p+i]) > mx then mx := abs(m[(k-1)*p+i]); piv := k; end if; end loop;
    if mx < 1e-14 then raise exception 'singular at %', i; end if;
    if piv <> i then
      for j in 1..p loop t := m[(i-1)*p+j]; m[(i-1)*p+j] := m[(piv-1)*p+j]; m[(piv-1)*p+j] := t; end loop;
      t := r[i]; r[i] := r[piv]; r[piv] := t;
    end if;
    f := m[(i-1)*p+i];
    for j in 1..p loop m[(i-1)*p+j] := m[(i-1)*p+j] / f; end loop;
    r[i] := r[i] / f;
    for k in 1..p loop
      if k <> i then
        f := m[(k-1)*p+i];
        if f <> 0 then
          for j in 1..p loop m[(k-1)*p+j] := m[(k-1)*p+j] - f * m[(i-1)*p+j]; end loop;
          r[k] := r[k] - f * r[i];
        end if;
      end if;
    end loop;
  end loop;
  return r;
end $f$;
with mx as (select max(closed_date) d from v_cma_comp_pool),
vl as (select unnest(array['Lake Bluff','Lake Forest','Highland Park','Glencoe','Winnetka','Kenilworth','Wilmette']) v),
rs as (select r.village v, upper(regexp_replace(trim(r.full_address), '\s+', ' ', 'g')) addr, r.close_date cd, r.close_price::float8 p
       from raw_sales r join vl on vl.v = r.village where r.close_date is not null and r.close_price between 100000 and 20000000),
yr as (select v, extract(year from cd)::int y, percentile_cont(0.5) within group (order by p) med from rs where cd >= date '2008-01-01' group by 1, 2),
d as (
  select c.mls_number id, c.village v, c.closed_date cd, ((mx.d - c.closed_date)/365.25)::float8 t, ln(c.sold_price::float8) y, c.sold_price::float8 p, c.taxes::float8 tx,
    upper(regexp_replace(trim(c.full_address), '\s+', ' ', 'g')) addr, (extract(year from c.closed_date) - c.year_built)::int age,
    array[1, ln(c.sqft/3000.0), power(ln(c.sqft/3000.0),2), ln(c.acreage::float8/0.4),
          greatest(0, extract(year from c.closed_date) - c.year_built)/100.0, power(greatest(0, extract(year from c.closed_date) - c.year_built)/100.0,2),
          (c.baths_full + 0.5*coalesce(c.baths_half,0)) - 3.5, (mx.d - c.closed_date)/365.25,
          case when extract(year from c.closed_date) - c.year_built <= 1 then 1 else 0 end,
          coalesce(c.renovated_last_10y,false)::int, ln(c.taxes::float8/15000.0)]::float8[] x
  from v_cma_comp_pool c join vl on vl.v = c.village, mx
  where c.sold_price between 200000 and 15000000 and c.sqft between 900 and 12000 and c.acreage between 0.04 and 12
    and c.year_built between 1850 and 2026 and c.baths_full between 1 and 12 and coalesce(c.waterfront,false)=false
    and c.sold_price::float8/c.sqft between 120 and 1500 and c.closed_date > mx.d - interval '48 months'
    and c.taxes between 2000 and 300000
),
s as (select 'prod' m, * from d where t <= 3 union all select 'train', * from d where t > 1),
kk as (select unnest(array[10,11]) k),
xtx as (select m, v, kk.k, i, j, sum(x[i]*x[j]) + case when i=j then 1e-7*count(*) else 0 end s from s, kk, generate_series(1,kk.k) i, generate_series(1,kk.k) j group by m, v, kk.k, i, j),
xty as (select m, v, kk.k, i, sum(x[i]*y) s from s, kk, generate_series(1,kk.k) i group by m, v, kk.k, i),
fit as (select a.m, a.v, a.k, pg_temp.solve(a.a, b.b, a.k) beta from (select m, v, k, array_agg(s order by i, j) a from xtx group by m, v, k) a join (select m, v, k, array_agg(s order by i) b from xty group by m, v, k) b using (m, v, k)),
te as (select d.id, d.v, d.cd, d.p, d.addr, d.age,
         exp((select sum(d.x[i]*f.beta[i]) from generate_series(1,10) i)) pb,
         case when d.age <= 1 then exp((select sum(d.x[i]*f.beta[i]) from generate_series(1,10) i)) else exp((select sum(d.x[i]*g.beta[i]) from generate_series(1,11) i)) end pt
       from d join fit f on f.v=d.v and f.m='train' and f.k=10 join fit g on g.v=d.v and g.m='train' and g.k=11 where d.t <= 1),
pr as (select distinct on (te.id) te.id, r.p p0, extract(year from r.cd)::int y0
       from te join rs r on r.v=te.v and r.addr=te.addr and r.cd <= te.cd - interval '24 months' and r.cd >= date '2008-01-01'
       order by te.id, r.cd desc),
m12 as (select te.id, (select percentile_cont(0.5) within group (order by r.p) from rs r where r.v=te.v and r.cd < te.cd and r.cd >= te.cd - interval '12 months') m from te join pr using (id)),
rep as (select te.*, pr.p0 * m12.m / yr.med rp from te join pr using (id) join m12 using (id) join yr on yr.v=te.v and yr.y=pr.y0),
lng as (select v, 'b' tier, p/pb r from te union all select v, 't', p/pt from te
        union all select v, 'br', p/sqrt(pb*rp) from rep union all select v, 'tr', p/sqrt(pt*rp) from rep),
err as (select v, tier, count(*) n, percentile_cont(array[0.1,0.25,0.5,0.75,0.9]) within group (order by r) q,
          percentile_cont(0.5) within group (order by abs(1/r-1)) md, avg((abs(1/r-1)<=0.10)::int) w10, avg((abs(1/r-1)<=0.20)::int) w20
        from (select * from lng union all select 'All', tier, r from lng) z group by v, tier),
es as (select v, tier, n, array_to_string(array(select round(x::numeric,3) from unnest(q) with ordinality u(x,o) order by o), ',')||'|'||round(md::numeric,3)||','||round(w10::numeric,3)||','||round(w20::numeric,3) s,
         (select sum(round(x::numeric,3)) from unnest(q) x) + round(md::numeric,3) + round(w10::numeric,3) + round(w20::numeric,3) c from err),
pv as (select d.v, count(*) n, percentile_cont(array[0.02,0.98]) within group (order by d.tx) txr from d where d.t <= 3 group by d.v),
ix as (select v, string_agg(round(med/1000)::text, ',' order by y) idx, sum(round(med/1000)) chk_idx, min(y) y0, max(y) y1 from yr group by v),
t12 as (select rs.v, round(percentile_cont(0.5) within group (order by rs.p)/1000) m from rs, mx where rs.cd > mx.d - interval '12 months' and rs.cd <= mx.d group by rs.v)
select e.v, max(pv.n) n,
  (select array_to_string(array(select round(b::numeric,5) from unnest(f.beta) with ordinality u(b,o) order by o), ',')) beta_t,
  (select sum(round(b::numeric,5)) from unnest(f.beta) b) chk,
  round(pv.txr[1])||','||round(pv.txr[2]) tax_rng,
  max(e.n) filter (where e.tier='b') n_test, max(e.n) filter (where e.tier='br') n_prior,
  max(e.s) filter (where e.tier='b') b, max(e.s) filter (where e.tier='t') t, max(e.s) filter (where e.tier='br') br, max(e.s) filter (where e.tier='tr') tr,
  sum(e.c) chk_q, ix.idx, ix.y0, ix.y1, t12.m t12, ix.chk_idx, (select d::text from mx) asof
from es e left join fit f on f.v=e.v and f.m='prod' and f.k=11 left join pv on pv.v=e.v left join ix on ix.v=e.v left join t12 on t12.v=e.v
group by e.v, f.beta, pv.txr, ix.idx, ix.y0, ix.y1, t12.m, ix.chk_idx order by e.v;
