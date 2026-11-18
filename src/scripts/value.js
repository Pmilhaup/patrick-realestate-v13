// The home valuation report: how much, when, and why.
// Everything is computed in the browser from two aggregate files:
//   /data/valuation.json  regression coefficients, a blind-test record and timing tables (tools/build_valuation.py)
//   /data/budget.json     closed-sale counts near each price point (tools/build_market_extras.py)
// Nothing the visitor types leaves the page unless they send the CMA request at the end.
const $ = (s, r = document) => r.querySelector(s);
const MON = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const usd = (v) => '$' + Math.round(v).toLocaleString('en-US');
const nice = (v) => { const step = v < 1e6 ? 5e3 : v < 3e6 ? 1e4 : 2.5e4; return Math.round(v / step) * step; };
const pct = (x, d = 1) => (x / 10).toFixed(d).replace(/\.0$/, '') + '%';          // 987 -> 98.7%
const list = (a) => (a.length < 2 ? a.join('') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1]);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const get = (u) => fetch(u).then((r) => { if (!r.ok) throw new Error(u + ' ' + r.status); return r.json(); });

export async function start(form) {
  const out = $('#report'), status = $('.vtool-status', form), lead = $('form[data-lead="valuation"]');
  let D, B;
  try { [D, B] = await Promise.all([get('/data/valuation.json'), get('/data/budget.json').catch(() => null)]); }
  catch (e) { status.textContent = 'The figures could not load. Call or write and I will run it for you.'; status.dataset.tone = 'err'; return; }
  const year = +D.asof.slice(0, 4), asof = new Date(D.asof + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  // A band elsewhere on the site can hand over the village and size.
  const q = new URLSearchParams(location.search);
  if (q.get('v') && D.villages[q.get('v')]) form.elements.village.value = q.get('v');
  if (+q.get('sf') > 0) form.elements.sqft.value = Math.round(+q.get('sf'));
  if (q.has('v') || q.has('sf')) history.replaceState(null, '', location.pathname);

  const hint = () => { const v = D.villages[form.elements.village.value]; if (!v) return;
    $('[data-hint="sqft"]', form).textContent = `Above grade. The model covers ${v.range.sqft[0].toLocaleString('en-US')} to ${v.range.sqft[1].toLocaleString('en-US')} here.`;
    $('[data-hint="acres"]', form).textContent = `A quarter acre is 10,890 sq ft. Covers ${v.range.acres[0]} to ${v.range.acres[1]} acres here.`; };
  form.elements.village.addEventListener('change', hint); hint();

  function estimate(v, s) {
    const b = v.beta, ls = Math.log(s.sqft / 3000), age = Math.max(0, year - s.year) / 100;
    const x = [1, ls, ls * ls, Math.log(s.acres / 0.4), age, age * age, s.baths - 3.5, 0, year - s.year <= 1 ? 1 : 0, s.reno ? 1 : 0];
    return Math.exp(x.reduce((a, xi, i) => a + xi * b[i], 0));
  }
  // Reasons the model should not answer. Each one sends the visitor to the CMA instead of a number.
  function limits(v, s, name) {
    const r = v.range, why = [];
    if (s.lake) why.push('Lakefront homes are priced one at a time. There are too few sales, and no two bluffs are alike.');
    if (s.sqft < r.sqft[0] || s.sqft > r.sqft[1]) why.push(`In ${name} the model has enough sales between ${r.sqft[0].toLocaleString('en-US')} and ${r.sqft[1].toLocaleString('en-US')} sq ft. Yours is outside that.`);
    if (s.acres < r.acres[0] || s.acres > r.acres[1]) why.push(`In ${name} the model has enough sales on lots of ${r.acres[0]} to ${r.acres[1]} acres. Yours is outside that.`);
    if (s.year < r.year || s.year > year) why.push(`The year built is outside what the model has seen in ${name} (${r.year} to ${year}).`);
    if (s.baths < r.baths[0] || s.baths > r.baths[1]) why.push('The bath count is outside what the model has seen here.');
    return why;
  }

  function render(name, s) {
    const v = D.villages[name], why = limits(v, s, name);
    const facts = `${s.sqft.toLocaleString('en-US')} sq ft · ${s.acres} acre${s.acres === 1 ? '' : 's'} · built ${s.year} · ${s.baths} bath${s.baths === 1 ? '' : 's'}${s.reno ? ' · renovated' : ''}`;
    if (why.length) {
      out.innerHTML = `<header class="vr-head"><p class="label">Your report · ${esc(name)}</p><h2 class="h2" id="vr-title">This one needs a person.</h2></header>
        <div class="vr-part"><p>${why.map(esc).join(' ')}</p><p>A model that guesses outside its evidence is worse than no model. I will price this house by hand: the comparable sales, the three estimates I triangulate, and a launch plan.</p>
        <p class="actions"><a class="btn-gold" href="#cma">Request the full CMA</a></p></div>`;
      if (lead) lead.elements.interest.value = `valuation, outside model range: ${name} · ${facts}${s.lake ? ' · lakefront' : ''}`;
      return;
    }
    const mid = estimate(v, s), t = v.test.ratio_q, m = t[2];
    const lo = nice(mid * t[1] / m), hi = nice(mid * t[3] / m), lo80 = nice(mid * t[0] / m), hi80 = nice(mid * t[4] / m), near = nice(mid);
    const pos = (p) => Math.max(0, Math.min(100, ((p - lo80) / (hi80 - lo80)) * 100));
    const reno = Math.round((Math.exp(v.beta[9]) - 1) * 100), trend = ((Math.exp(-v.beta[7]) - 1) * 100).toFixed(1);
    const thin = v.n < 100;

    // When: launch months ranked by what sold closest to the first asking price, then by how many sold.
    const now = new Date().getMonth(), W = v.when;
    const ranked = W.map((w, i) => ({ i, w })).filter((o) => o.w[0] >= 15).sort((a, b) => b.w[3] - a.w[3] || b.w[1] - a.w[1]);
    const top = ranked.slice(0, 3).map((o) => o.i), best = W[top[0]], cur = W[now];
    const ahead = top.map((i) => ({ i, k: (i - now + 12) % 12 })).sort((a, b) => a.k - b.k)[0], nxt = W[ahead.i];
    const spLo = Math.min(...W.map((w) => w[3])), spHi = Math.max(...W.map((w) => w[3]));
    const months = W.map((w, i) => `<li class="${top.includes(i) ? 'is-top' : ''}${i === now ? ' is-now' : ''}" style="--f:${((w[3] - spLo) / Math.max(1, spHi - spLo)).toFixed(2)}">
        <b>${MON[i].slice(0, 3)}</b><span class="v">${pct(w[3])}</span><span class="s">${w[1]}% sold</span><span class="s">${w[2]} days</span>${i === now ? '<i>Now</i>' : ''}</li>`).join('');

    // Why: what speed is worth, and how deep the market is at this price.
    const C = v.curve, cHi = Math.max(...C.map((c) => c[1])), cLo = Math.min(...C.map((c) => c[1])) - 45, bars = C.map((c, i) => `<li><span class="b" style="--h:${Math.max(6, ((c[1] - cLo) / (cHi - cLo)) * 100).toFixed(0)}%"><b>${pct(c[1])}</b></span><span class="k">${D.buckets[i]}</span><span class="s">${c[0]} sales</span></li>`).join('');
    const gap = (C[0][1] - C[3][1]) / 1000 * near;
    let demand = '';
    if (B && B.villages[name]) { let gi = 0; B.grid.forEach((g, k) => { if (Math.abs(Math.log(g / near)) < Math.abs(Math.log(B.grid[gi] / near))) gi = k; }); const c = B.villages[name].g[gi];
      if (c[1] >= 5) demand = `<p><b>${c[1]} homes within 15 percent of ${usd(B.grid[gi])}</b> closed in ${esc(name)} in the past ${B.months} months. ${c[6]} of them sold at or above the asking price, in a median of ${c[5]} days.</p>`; }
    const inTop = top.includes(now), dSp = nxt[3] - cur[3], dDays = cur[2] - nxt[2];
    const nowLine = inTop
      ? `<p><b>${MON[now]} is one of the three strongest months to launch in ${esc(name)}.</b> The record above is the case for moving while it lasts.</p>`
      : `<p><b>The next strong month is ${MON[ahead.i]}, ${ahead.k === 1 ? 'one month' : ahead.k + ' months'} away.</b> ${dSp > 0 || dDays > 0 ? `Against a ${MON[now]} launch it has meant ${[dSp > 0 ? `${(dSp / 10).toFixed(1)} points more of the asking price` : '', dDays > 0 ? `${dDays} fewer days to a contract` : ''].filter(Boolean).join(' and ')}. ` : ''}What decides the first two weeks happens before the launch: the price, the photography, the repairs. That is the case for starting now and launching then.</p>`;

    out.innerHTML = `
      <header class="vr-head"><p class="label">Your report · ${esc(name)}</p><h2 class="h2" id="vr-title">When, how much, and <em>why</em>.</h2><p class="note">${esc(facts)} · figures through ${asof}</p></header>
      <article class="vr-part" aria-labelledby="vr-how"><p class="vr-no">01</p><div>
        <h3 id="vr-how">How much</h3>
        <p class="vr-range"><span>${usd(lo)}</span><i>to</i><span>${usd(hi)}</span></p>
        <p class="vr-sub">Most likely near ${usd(near)}, or ${usd(near / s.sqft)} a square foot.</p>
        <div class="vr-bar" role="img" aria-label="The likely range runs from ${usd(lo)} to ${usd(hi)}. Four in five comparable results fell between ${usd(lo80)} and ${usd(hi80)}."><span class="mid" style="left:${pos(lo)}%;width:${pos(hi) - pos(lo)}%"></span><span class="tick" style="left:${pos(near)}%"></span></div>
        <p class="vr-ends"><span>${usd(lo80)}</span><span>Four in five fell inside this span</span><span>${usd(hi80)}</span></p>
        <p>The width is honest, not cautious. I tested the model blind on the ${v.test.n} ${esc(name)} sales of the past year: it had never seen them, and half sold within a band this wide around its figure. Its typical miss was ${Math.round(v.test.mdape * 100)} percent.${thin ? ` ${esc(name)} is a small market, ${v.n} usable sales in three years, so treat this as rough.` : ''}</p>
        <ul class="vr-facts"><li><b>${v.n.toLocaleString('en-US')}</b> closed sales in ${esc(name)} taught the model, over ${D.train_months} months.</li><li>A renovation in the past ten years has been worth about <b>${reno} percent</b> here.${s.reno ? ' It is in your figure.' : ''}</li><li>Prices in this model have risen about <b>${trend} percent</b> a year.</li></ul>
        <p class="vr-cannot"><b>What it cannot see.</b> Condition, finishes, the street, the light, the basement, a pool, a view. Those are why two houses with the same numbers sell far apart, and they are what a CMA is for.</p>
      </div></article>
      <article class="vr-part" aria-labelledby="vr-when"><p class="vr-no">02</p><div>
        <h3 id="vr-when">When</h3>
        <p><b>Homes launched in ${list(top.map((i) => MON[i]))} have done best in ${esc(name)}.</b> ${MON[top[0]]} launches sold for a median ${pct(best[3])} of their first asking price, in ${best[2]} days, and ${best[1]} percent of them sold.${inTop ? '' : ` ${MON[now]} launches: ${pct(cur[3])}, ${cur[2]} days, ${cur[1]} percent sold.`}</p>
        <ol class="vr-months" aria-label="By launch month: median sale as a share of the first asking price, share of launches that sold, median days to a contract">${months}</ol>
        <p class="note">Every public listing launched ${D.when_years[0]} to ${D.when_years[1]}, by the month it launched: median sale as a share of the first asking price, the share of launches that sold, and median days to a contract. A closing follows about ${v.contract_to_close} days after the accepted offer.</p>
      </div></article>
      <article class="vr-part" aria-labelledby="vr-why"><p class="vr-no">03</p><div>
        <h3 id="vr-why">Why</h3>
        <p><b>Asked at ${usd(near)}, the gap between a first-week sale and a two-month sale is about ${usd(nice(gap))}.</b> ${esc(name)} homes that found a buyer within seven days sold for ${pct(C[0][1])} of their first asking price. Those that took one to two months sold for ${pct(C[3][1])}, and ${C[3][2]} percent of them had already cut the price. The usual reading: the first price was too high, and the market took weeks to correct it.</p>
        <ol class="vr-curve" aria-label="Median sale as a share of the first asking price, by days to a contract">${bars}</ol>
        <p class="note">Closed sales launched since ${D.curve_since}, by days from launch to accepted offer.</p>
        ${demand}${nowLine}
      </div></article>
      <div class="vr-next"><a class="btn-gold" href="#cma">Request the full CMA</a><button type="button" class="btn-line" data-print>Print or save this report</button></div>`;
    $('[data-print]', out).addEventListener('click', () => print());
    if (lead) lead.elements.interest.value = `valuation: ${name} · ${facts} · model ${usd(lo)}–${usd(hi)}, near ${usd(near)}`;
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault(); status.textContent = ''; delete status.dataset.tone;
    if (!form.reportValidity()) return;
    const f = form.elements, s = { sqft: Math.round(+f.sqft.value), acres: +(+f.acres.value).toFixed(2), year: Math.round(+f.year.value), baths: +f.full.value + 0.5 * +f.half.value, reno: f.reno.value === 'yes', lake: f.lake.value === 'yes' };
    render(f.village.value, s);
    out.hidden = false; out.focus({ preventScroll: true }); out.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  });
  form.dataset.ready = '1';
}
