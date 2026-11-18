// The home valuation report: how much, when, and why.
// Everything is computed in the browser from two aggregate files:
//   /data/valuation.json  regression coefficients, blind-test records and timing tables (tools/build_valuation.py)
//   /data/budget.json     closed-sale counts near each price point (tools/build_market_extras.py)
// Nothing the visitor types leaves the page unless they send the CMA request at the end.
//
// Accuracy tiers. The records-only model is tier b. Two optional answers move it:
//   t   last year's property tax bill joins the regression (the assessor has already judged the house)
//   br  the owner's purchase, moved by the village's median price since, is averaged with the model
//   tr  both
// Each tier carries its own blind-test record, and the range shown is that tier's.
const $ = (s, r = document) => r.querySelector(s);
const MON = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const usd = (v) => '$' + Math.round(v).toLocaleString('en-US');
const short = (k) => (k >= 1000 ? '$' + (k / 1000).toFixed(2).replace(/\.?0+$/, '') + 'M' : '$' + k + 'K');   // $K -> $1.4M / $780K
const nice = (v) => { const step = v < 1e6 ? 5e3 : v < 3e6 ? 1e4 : 2.5e4; return Math.round(v / step) * step; };
const pct = (x, d = 1) => (x / 10).toFixed(d).replace(/\.0$/, '') + '%';          // 987 -> 98.7%
const whole = (x) => Math.round(x * 100);                                          // 0.127 -> 13
const list = (a) => (a.length < 2 ? a.join('') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1]);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const get = (u) => fetch(u).then((r) => { if (!r.ok) throw new Error(u + ' ' + r.status); return r.json(); });
const dot = (x, b) => x.reduce((a, xi, i) => a + xi * b[i], 0);

export async function start(form) {
  const out = $('#report'), status = $('.vtool-status', form), lead = $('form[data-lead="valuation"]');
  let D, B;
  try { [D, B] = await Promise.all([get('/data/valuation.json'), get('/data/budget.json').catch(() => null)]); }
  catch (e) { status.textContent = 'The figures could not load. Call or write and I will run it for you.'; status.dataset.tone = 'err'; return; }
  const year = +D.asof.slice(0, 4), asof = new Date(D.asof + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const ALL = D.tiers_all, minYears = D.repeat_min_years;

  // A band elsewhere on the site can hand over the village and size.
  const q = new URLSearchParams(location.search);
  if (q.get('v') && D.villages[q.get('v')]) form.elements.village.value = q.get('v');
  if (+q.get('sf') > 0) form.elements.sqft.value = Math.round(+q.get('sf'));
  if (q.has('v') || q.has('sf')) history.replaceState(null, '', location.pathname);

  // The tax bill is used only where it made the model better in that village's own blind test.
  const taxHelps = (v) => v.tiers.test.t.mdape < v.tiers.test.b.mdape;
  const hint = () => { const v = D.villages[form.elements.village.value]; if (!v) return;
    $('[data-hint="sqft"]', form).textContent = `Above grade. The model covers ${v.range.sqft[0].toLocaleString('en-US')} to ${v.range.sqft[1].toLocaleString('en-US')} here.`;
    $('[data-hint="acres"]', form).textContent = `A quarter acre is 10,890 sq ft. Covers ${v.range.acres[0]} to ${v.range.acres[1]} acres here.`;
    $('[data-hint="tax"]', form).textContent = taxHelps(v) ? `The full annual bill. In ${form.elements.village.value} it has cut the typical miss from ${whole(v.tiers.test.b.mdape)} to ${whole(v.tiers.test.t.mdape)} percent.` : `The full annual bill. It goes with a CMA request; the model does not use it in ${form.elements.village.value}.`; };
  form.elements.village.addEventListener('change', hint); hint();

  function features(s) {
    const ls = Math.log(s.sqft / 3000), age = Math.max(0, year - s.year) / 100;
    return [1, ls, ls * ls, Math.log(s.acres / 0.4), age, age * age, s.baths - 3.5, 0, year - s.year <= 1 ? 1 : 0, s.reno ? 1 : 0];
  }
  // Which evidence can be used, the figure it gives, and a plain note for anything set aside.
  function evidence(v, s, name) {
    const T = v.tiers, x = features(s), base = Math.exp(dot(x, v.beta)), notes = [];
    let model = base, tax = false, rep = null;
    if (s.tax) {
      if (!taxHelps(v)) notes.push(`In ${name} the tax bill did not improve the model when tested (${T.test.n} sales in the past year), so it is left out here. It still goes with a CMA request.`);
      else if (year - s.year <= 1) notes.push('New construction carries a land-only tax bill, so the bill is left out.');
      else if (s.tax < T.tax_range[0] || s.tax > T.tax_range[1]) notes.push(`A bill of ${usd(s.tax)} is outside what the model has seen in ${name} (${usd(T.tax_range[0])} to ${usd(T.tax_range[1])}), which is often an exemption or an appeal, so it is left out.`);
      else { model = Math.exp(dot([...x, Math.log(s.tax / 15000)], T.beta_t)); tax = true; }
    }
    if (s.paid && s.bought) {
      const then = T.idx[s.bought - T.idx0];
      if (s.bought < T.idx0) notes.push(`The price index starts in ${T.idx0}, so a ${s.bought} purchase is left out.`);
      else if (s.bought > year - minYears) notes.push('You bought within the past two years. That price is better evidence than any model, and it is where a CMA starts. It is noted for the CMA and not blended here.');
      else if (then) {
        const moved = s.paid * T.t12 / then, gap = moved / model;
        if (gap > 2.5 || gap < 0.4) notes.push('What you paid, moved by the market since, lands far from the model. That usually means the house has changed since you bought it, so the purchase is left out here and belongs in the CMA.');
        else rep = { moved, then, now: T.t12 };
      }
    }
    const tier = rep ? (tax ? 'tr' : 'br') : tax ? 't' : 'b';
    const mid = rep ? Math.sqrt(model * rep.moved) : model;
    // The range comes from the same test as the figure. Purchase tiers are tested across all seven villages,
    // because no single village has enough repeat sales in a year to draw a band from.
    const test = tier === 'b' ? { q: v.test.ratio_q, mdape: v.test.mdape, n: v.test.n } : tier === 't' ? { ...T.test.t, n: T.test.n } : { ...ALL[tier], n: ALL.n_prior };
    return { tier, mid, base, model, tax, rep, test, notes };
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
  const extras = (s) => `${s.tax ? ` · tax bill ${usd(s.tax)}` : ''}${s.paid && s.bought ? ` · bought ${s.bought} for ${usd(s.paid)}` : ''}`;
  // What the CMA request carries: a line Patrick can read, and the same facts in a form a program can read.
  const carry = (name, s, tail) => {
    const code = `v=${name};sf=${s.sqft};ac=${s.acres};yb=${s.year};ba=${s.baths};rn=${s.reno ? 1 : 0};lk=${s.lake ? 1 : 0}${s.tax ? `;tax=${s.tax}` : ''}${s.paid && s.bought ? `;paid=${s.paid};bought=${s.bought}` : ''}`;
    if (lead) lead.elements.interest.value = `${tail} {${code}}`;
  };

  function render(name, s) {
    const v = D.villages[name], why = limits(v, s, name);
    const facts = `${s.sqft.toLocaleString('en-US')} sq ft · ${s.acres} acre${s.acres === 1 ? '' : 's'} · built ${s.year} · ${s.baths} bath${s.baths === 1 ? '' : 's'}${s.reno ? ' · renovated' : ''}`;
    const next = `<div class="vr-next"><div class="vr-next-copy"><p class="label">Next</p><p>This range comes from records. The full CMA comes from your house: the comparable sales behind the range, the listings that failed, three independent estimates and a launch plan, <b>sent to your email</b>.</p></div>
        <div class="vr-next-go"><a class="btn-gold" href="#cma">Send me the full CMA</a><button type="button" class="btn-line" data-print>Print or save this report</button></div></div>`;
    if (why.length) {
      out.innerHTML = `<header class="vr-head"><p class="label">Your report · ${esc(name)}</p><h2 class="h2" id="vr-title">This one needs a person.</h2></header>
        <div class="vr-part"><p>${why.map(esc).join(' ')}</p><p>A model that guesses outside its evidence is worse than no model. I will price this house by hand: the comparable sales, the three estimates I triangulate, and a launch plan.</p>
        <p class="actions"><a class="btn-gold" href="#cma">Send me the full CMA</a></p></div>`;
      carry(name, s, `valuation, outside model range: ${name} · ${facts}${s.lake ? ' · lakefront' : ''}${extras(s)}`);
      return;
    }
    const E = evidence(v, s, name), mid = E.mid, t = E.test.q, m = t[2];
    const lo = nice(mid * t[1] / m), hi = nice(mid * t[3] / m), lo80 = nice(mid * t[0] / m), hi80 = nice(mid * t[4] / m), near = nice(mid);
    const pos = (p) => Math.max(0, Math.min(100, ((p - lo80) / (hi80 - lo80)) * 100));
    const reno = Math.round((Math.exp(v.beta[9]) - 1) * 100), trend = ((Math.exp(-v.beta[7]) - 1) * 100).toFixed(1);
    const thin = v.n < 100, miss = whole(E.test.mdape), missB = whole(v.test.mdape), T = v.tiers;

    // How the figure was built, in the visitor's own numbers.
    const basis = ['public sale records'].concat(E.tax ? ['your tax bill'] : [], E.rep ? [`your ${s.bought} purchase`] : []);
    const tested = E.tier === 'b'
      ? `I tested the model blind on the ${E.test.n} ${esc(name)} sales of the past year: it had never seen them, and half sold within a band this wide around its figure. Its typical miss was ${miss} percent.`
      : E.tier === 't'
        ? `Tested blind on the ${E.test.n} ${esc(name)} sales of the past year with a tax bill on record, half sold within a band this wide around the figure. The typical miss was ${miss} percent, against ${whole(T.test.b.mdape)} from the records alone.`
        : `Tested blind on the ${E.test.n} North Shore sales of the past year where the same house had sold before, half sold within a band this wide around the figure. The typical miss was ${miss} percent, against ${whole(ALL.b.mdape)} from the records alone.`;
    const built = [
      `<li><b>${v.n.toLocaleString('en-US')}</b> closed sales in ${esc(name)} taught the model, over ${D.train_months} months. On records alone it puts this house near <b>${usd(nice(E.base))}</b>.</li>`,
      E.tax ? (nice(E.model) === nice(E.base) ? `<li>Your tax bill of <b>${usd(s.tax)}</b> agrees with that figure. The assessor has already judged the house, and the bill says the records have it about right.</li>`
        : `<li>Your tax bill of <b>${usd(s.tax)}</b> moves that to <b>${usd(nice(E.model))}</b>. The assessor has already judged the house; the bill carries that judgment.</li>`)
        : `<li>A renovation in the past ten years has been worth about <b>${reno} percent</b> here.${s.reno ? ' It is in your figure.' : ''}</li>`,
      E.rep ? `<li>You paid <b>${usd(s.paid)}</b> in ${s.bought}. The ${esc(name)} median has gone from ${short(E.rep.then)} that year to ${short(E.rep.now)} in the past twelve months, which alone would put the house near <b>${usd(nice(E.rep.moved))}</b>. The figure above is the midpoint of the two.</li>`
        : `<li>Prices in this model have risen about <b>${trend} percent</b> a year.</li>`].join('');
    const sharpen = E.tier === 'tr' || E.notes.length ? '' : `<p class="vr-sharpen">${E.tier === 'b' ? `<b>Two numbers would tighten this.</b> With last year&rsquo;s tax bill and what you paid for the house, the typical miss falls from ${whole(ALL.b.mdape)} percent to about ${whole(ALL.tr.mdape)}.` : E.tier === 't' ? `<b>One more number would tighten this.</b> With what you paid and the year you bought, the typical miss falls to about ${whole(ALL.tr.mdape)} percent.` : `<b>One more number would tighten this.</b> Last year&rsquo;s tax bill brings the typical miss to about ${whole(ALL.tr.mdape)} percent.`} <button type="button" class="vr-link" data-sharpen>Add ${E.tier === 'b' ? 'them' : 'it'}</button></p>`;
    const notes = E.notes.length ? `<p class="note vr-notes">${E.notes.map(esc).join(' ')}</p>` : '';

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

    out.dataset.tier = E.tier;
    out.innerHTML = `
      <header class="vr-head"><p class="label">Your report · ${esc(name)}</p><h2 class="h2" id="vr-title">When, how much, and <em>why</em>.</h2><p class="note">${esc(facts)} · figures through ${asof}</p></header>
      <article class="vr-part" aria-labelledby="vr-how"><p class="vr-no">01</p><div>
        <h3 id="vr-how">How much</h3>
        <p class="vr-range"><span>${usd(lo)}</span><i>to</i><span>${usd(hi)}</span></p>
        <p class="vr-sub">Most likely near ${usd(near)}, or ${usd(near / s.sqft)} a square foot.</p>
        <div class="vr-bar" role="img" aria-label="The likely range runs from ${usd(lo)} to ${usd(hi)}. Four in five comparable results fell between ${usd(lo80)} and ${usd(hi80)}."><span class="mid" style="left:${pos(lo)}%;width:${pos(hi) - pos(lo)}%"></span><span class="tick" style="left:${pos(near)}%"></span></div>
        <p class="vr-ends"><span>${usd(lo80)}</span><span>Four in five fell inside this span</span><span>${usd(hi80)}</span></p>
        <p class="vr-basis"><span>Built from</span> ${esc(list(basis))}.</p>
        <p>The width is honest, not cautious. ${tested}${thin ? ` ${esc(name)} is a small market, ${v.n} usable sales in three years, so treat this as rough.` : ''}</p>
        <ul class="vr-facts">${built}</ul>
        ${notes}${sharpen}
        <p class="vr-cannot"><b>What it cannot see.</b> Condition, finishes, the street, the light, the basement, a pool, a view${E.rep ? ', and anything you have changed since you bought' : ''}. Those are why two houses with the same numbers sell far apart, and they are what a CMA is for.</p>
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
      ${next}`;
    $('[data-print]', out).addEventListener('click', () => print());
    const more = $('[data-sharpen]', out);
    if (more) more.addEventListener('click', () => { const f = form.elements[E.tier === 'br' || !s.tax ? 'tax' : 'paid']; $('#sharpen', form).scrollIntoView({ block: 'center' }); f.focus({ preventScroll: true }); });
    carry(name, s, `valuation: ${name} · ${facts}${extras(s)} · model ${usd(lo)}–${usd(hi)}, near ${usd(near)} · evidence ${E.tier}`);
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault(); status.textContent = ''; delete status.dataset.tone;
    if (!form.reportValidity()) return;
    const f = form.elements, num = (n) => (f[n].value === '' ? 0 : Math.round(+f[n].value));
    if (!!num('paid') !== !!num('bought')) { status.textContent = 'Enter both what you paid and the year, or leave both empty.'; status.dataset.tone = 'err'; (num('paid') ? f.bought : f.paid).focus(); return; }
    const s = { sqft: Math.round(+f.sqft.value), acres: +(+f.acres.value).toFixed(2), year: Math.round(+f.year.value), baths: +f.full.value + 0.5 * +f.half.value, reno: f.reno.value === 'yes', lake: f.lake.value === 'yes', tax: num('tax'), paid: num('paid'), bought: num('bought') };
    render(f.village.value, s);
    out.hidden = false; out.focus({ preventScroll: true }); out.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  });
  form.dataset.ready = '1';
}
