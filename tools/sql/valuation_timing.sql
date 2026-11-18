-- Timing tables for the valuation report, from v_listing_lifecycle (public listing attempts with a resolved outcome).
-- whn:   per launch month (Jan..Dec), launches 2021-2025: launches : % that sold : median days to contract :
--        median sale / first asking price x1000 : % sold at or above first asking.
-- curve: closed sales launched 2023 onward, by days to contract (0-7, 8-14, 15-30, 31-60, 61-120, 121+):
--        sales : median sale / first asking x1000 : % that took a price cut.
-- c2c:   median days from accepted offer to closing. chk = sum of every integer in the row.
with l as (select village v, extract(month from list_date)::int mo, extract(year from list_date)::int yr, outcome, days_to_contract dtc, days_to_close dcl, sp_olp_ratio r, had_price_cut cut
  from v_listing_lifecycle where coalesce(is_private,false)=false and list_date is not null and outcome in ('closed','cancelled','expired')
    and village in ('Lake Bluff','Lake Forest','Highland Park','Glencoe','Winnetka','Kenilworth','Wilmette')),
w as (select v, mo, count(*) n, round(100.0*avg((outcome='closed')::int))::int cr,
        coalesce(round(percentile_cont(0.5) within group (order by dtc) filter (where outcome='closed' and dtc >= 0)),0)::int dtc,
        coalesce(round(1000*percentile_cont(0.5) within group (order by r) filter (where outcome='closed' and r between 0.5 and 1.5)),0)::int sp,
        coalesce(round(100.0*avg((r>=1)::int) filter (where outcome='closed' and r between 0.5 and 1.5)),0)::int atk
      from l where yr between 2021 and 2025 group by v, mo),
b as (select v, case when dtc<=7 then 1 when dtc<=14 then 2 when dtc<=30 then 3 when dtc<=60 then 4 when dtc<=120 then 5 else 6 end k, count(*) n,
        round(1000*percentile_cont(0.5) within group (order by r))::int sp, round(100.0*avg(coalesce(cut,false)::int))::int cut
      from l where outcome='closed' and yr >= 2023 and dtc >= 0 and r between 0.5 and 1.5 group by 1, 2),
c as (select v, round(percentile_cont(0.5) within group (order by dcl - dtc))::int c2c, count(*) n from l where outcome='closed' and yr >= 2023 and dcl >= dtc and dtc >= 0 group by v)
select c.v, c.c2c,
  (select string_agg(n||':'||cr||':'||dtc||':'||sp||':'||atk, ';' order by mo) from w where w.v=c.v) whn,
  (select string_agg(n||':'||sp||':'||cut, ';' order by k) from b where b.v=c.v) curve,
  c.c2c + (select sum(n+cr+dtc+sp+atk) from w where w.v=c.v) + (select sum(n+sp+cut) from b where b.v=c.v) chk
from c order by c.v;
