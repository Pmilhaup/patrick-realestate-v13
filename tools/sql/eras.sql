-- When each village was built. Single-family homes that have sold at least once since 2007, by decade built.
-- Per decade: decade : distinct homes : sales in the past 36 months : median price of those sales in $ thousands.
-- Everything before 1880 is grouped under 1870. chk is the sum of every integer in the row.
with mx as (select max(close_date) d from raw_sales where close_price>0),
b as (select r.village, r.full_address a, greatest(1870, (r.year_built/10)*10)::int dec, r.close_price p, r.close_date cd
      from raw_sales r where r.property_type='Single Family' and r.close_price>0 and r.year_built between 1800 and 2026),
x as (select b.village, b.dec, count(distinct b.a) homes,
        count(*) filter (where b.cd > mx.d - interval '36 months') n36,
        coalesce(round(percentile_cont(0.5) within group (order by b.p::float8) filter (where b.cd > mx.d - interval '36 months')/1000),0)::int med36k
      from b, mx group by b.village, b.dec)
select village v, string_agg(dec||':'||homes||':'||n36||':'||med36k, ';' order by dec) e, sum(dec+homes+n36+med36k) chk from x group by village order by village;
