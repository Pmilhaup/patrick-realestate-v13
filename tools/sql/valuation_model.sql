-- Home valuation model: one log-linear regression per village, fitted and tested inside the database.
-- Source: v_cma_comp_pool (closed sales with the CMA v2 fields). Lakefront, distressed-range and
-- extreme records are excluded. Output: one row per village with the production coefficients
-- (36 months to the latest closing), the ranges the model has seen, and a blind test:
-- a second model fitted on the 36 months BEFORE the last 12, asked to price the last 12.
-- ratio_q = quantiles (10/25/50/75/90) of actual price / predicted price in that test.
-- The solver is a temporary function; nothing is left in the database.
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
d as (
  select c.village v, ((mx.d - c.closed_date)/365.25)::float8 t, ln(c.sold_price::float8) y, c.sold_price::float8 p, c.sqft::float8 sf, c.acreage::float8 ac, c.year_built yb,
    (c.baths_full + 0.5*coalesce(c.baths_half,0))::float8 ba, coalesce(c.renovated_last_10y,false) rn,
    array[1, ln(c.sqft/3000.0), power(ln(c.sqft/3000.0),2), ln(c.acreage::float8/0.4),
          greatest(0, extract(year from c.closed_date) - c.year_built)/100.0, power(greatest(0, extract(year from c.closed_date) - c.year_built)/100.0,2),
          (c.baths_full + 0.5*coalesce(c.baths_half,0)) - 3.5, (mx.d - c.closed_date)/365.25,
          case when extract(year from c.closed_date) - c.year_built <= 1 then 1 else 0 end,
          coalesce(c.renovated_last_10y,false)::int]::float8[] x
  from v_cma_comp_pool c, mx
  where c.sold_price between 200000 and 15000000 and c.sqft between 900 and 12000 and c.acreage between 0.04 and 12
    and c.year_built between 1850 and 2026 and c.baths_full between 1 and 12 and coalesce(c.waterfront,false)=false
    and c.sold_price::float8/c.sqft between 120 and 1500 and c.closed_date > mx.d - interval '48 months'
    and c.village in ('Lake Bluff','Lake Forest','Highland Park','Glencoe','Winnetka','Kenilworth','Wilmette')
),
s as (select 'prod' m, * from d where t <= 3 union all select 'train', * from d where t > 1),
xtx as (select m, v, i, j, sum(x[i]*x[j]) + case when i=j then 1e-7*count(*) else 0 end s from s, generate_series(1,10) i, generate_series(1,10) j group by m, v, i, j),
xty as (select m, v, i, sum(x[i]*y) s from s, generate_series(1,10) i group by m, v, i),
fit as (select a.m, a.v, pg_temp.solve(a.a, b.b, 10) beta from (select m, v, array_agg(s order by i, j) a from xtx group by m, v) a join (select m, v, array_agg(s order by i) b from xty group by m, v) b using (m, v)),
tst as (select d.v, d.p / exp((select sum(d.x[i]*f.beta[i]) from generate_series(1,10) i)) r from d join fit f on f.v=d.v and f.m='train' where d.t <= 1),
err as (select v, count(*) n, percentile_cont(array[0.1,0.25,0.5,0.75,0.9]) within group (order by r) q, percentile_cont(0.5) within group (order by abs(1/r - 1)) mdape, avg((abs(1/r-1) <= 0.10)::int) w10, avg((abs(1/r-1) <= 0.20)::int) w20 from tst group by v),
res as (select d.v, count(*) n, sqrt(avg(power(d.y - (select sum(d.x[i]*f.beta[i]) from generate_series(1,10) i),2))) sd,
          percentile_cont(array[0.02,0.98]) within group (order by d.sf) sfr, percentile_cont(array[0.02,0.98]) within group (order by d.ac) acr, min(d.yb) yb0, max(d.ba) bmax, min(d.ba) bmin, avg(d.rn::int) rshare
        from d join fit f on f.v=d.v and f.m='prod' where d.t <= 3 group by d.v)
select f.v, r.n, round(r.sd::numeric,4) sd,
  array_to_string(array(select round(b::numeric,5) from unnest(f.beta) with ordinality u(b,o) order by o), ',') beta,
  (select sum(round(b::numeric,5)) from unnest(f.beta) b) chk,
  round(r.sfr[1])||','||round(r.sfr[2])||','||round(r.acr[1]::numeric,2)||','||round(r.acr[2]::numeric,2)||','||r.yb0||','||r.bmin||','||r.bmax rng, round(r.rshare::numeric,3) reno_share,
  e.n n_test, array_to_string(array(select round(q::numeric,3) from unnest(e.q) with ordinality u(q,o) order by o), ',') ratio_q, round(e.mdape::numeric,3) mdape, round(e.w10::numeric,3) w10, round(e.w20::numeric,3) w20,
  (select d::text from mx) asof
from fit f join res r on r.v=f.v join err e on e.v=f.v where f.m='prod' order by f.v;
