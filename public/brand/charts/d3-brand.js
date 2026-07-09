/* ═══════════════════════════════════════════════════════════════
   PATRICK MILHAUPT — BRAND CHART SYSTEM · D3 ENGINE   v1.0
   brand/charts/d3-brand.js   →   window.BrandD3

   The bespoke sibling to plotly-brand.js (window.BrandCharts).
   Same "lit instrument panel on navy theatre" DNA, same TOKEN
   palette and tokens.css variables — but for the chart types Plotly
   can't do cleanly: force beeswarms, ridgelines, chord flows,
   tapering funnels, radial gauges, and animated supply/demand.

   ONE look for the whole practice. Every surface — public site,
   backend dashboard, property microsites, CMA/PDF, marketing —
   imports THIS file so charts are identical everywhere.

   USAGE
   ─────
   <script src="https://cdnjs.cloudflare.com/ajax/libs/d3/7.9.0/d3.min.js"></script>
   <script src="brand/charts/d3-brand.js"></script>
   ...
   BrandD3.beeswarm('#mount', data, { xField:'score', rField:'value' });
   BrandD3.supplyDemand('#mount', { x, series });
   BrandD3.ridgeline('#mount', groups);
   BrandD3.chord('#mount', names, matrix);
   BrandD3.funnel('#mount', stages);
   BrandD3.radialGauge('#mount', value, { min:-100, max:100 });
   BrandD3.sparkline('#mount', values, { bipolar:true });

   Every chart: responsive (ResizeObserver), animated in, tooltip'd,
   theme-locked. Pass {live:false} data or wire to Supabase upstream.
   ═══════════════════════════════════════════════════════════════ */
(function () {
  if (typeof d3 === 'undefined') { console.error('BrandD3 requires d3 v7'); return; }

  /* ─── TOKENS (mirror plotly-brand.js + tokens.css) ───────────── */
  const T = {
    paper:'#071229', plot:'#0A1838',
    grid:'rgba(255,255,255,0.055)', gridStrong:'rgba(255,255,255,0.09)',
    zero:'rgba(255,255,255,0.14)', axis:'rgba(255,255,255,0.14)',
    tick:'#9FB0CC', title:'#FFFFFF', legend:'#C8D3E4', text2:'#B0B8D1',
    gold:'#c9a96e', goldLight:'#e0c992', accent:'#4f8fff',
    fontSans:"'Inter','Helvetica Neue',Arial,sans-serif",
    fontSerif:"'Playfair Display',Georgia,serif",
    fontMono:"'JetBrains Mono','SF Mono',Menlo,monospace"
  };
  /* series palette identical to plotly-brand SERIES */
  const S = {
    neutral:{line:'rgba(168,180,205,0.85)', fill:'rgba(120,134,173,0.26)'},
    blue:   {line:'rgba(79,143,255,0.95)',  fill:'rgba(47,107,255,0.34)'},
    teal:   {line:'rgba(45,212,191,0.95)',  fill:'rgba(45,212,191,0.28)'},
    indigo: {line:'rgba(139,139,250,0.95)', fill:'rgba(74,74,246,0.26)'},
    gold:   {line:'rgba(240,214,138,0.98)', fill:'rgba(184,134,11,0.24)'},
    pink:   {line:'#FF2E74', fill:'rgba(255,46,116,0.12)'},
    yellow: {line:'#FFE24D', fill:'rgba(255,226,77,0.12)'}
  };
  const RAMP = ['#c9a96e','#4f8fff','#2dd4bf','#a78bfa','#fb923c','#f472b6','#818cf8','#e0c992'];

  /* ─── shared tooltip ─────────────────────────────────────────── */
  let TIP;
  function tip(){ if(!TIP){ TIP=d3.select('body').append('div').attr('class','brandd3-tip')
      .style('position','fixed').style('pointer-events','none').style('z-index',9999)
      .style('opacity',0).style('background','rgba(7,18,41,0.96)')
      .style('border','1px solid rgba(240,214,138,0.30)').style('border-radius','8px')
      .style('padding','9px 11px').style('font-family',T.fontSans).style('font-size','12px')
      .style('color','#fff').style('box-shadow','0 10px 34px rgba(0,0,0,0.55)').style('max-width','240px')
      .style('transition','opacity .12s'); } return TIP; }
  function tipShow(html,ev){ tip().html(html).style('opacity',1); tipMove(ev); }
  function tipMove(ev){ tip().style('left',(ev.clientX+14)+'px').style('top',(ev.clientY+14)+'px'); }
  function tipHide(){ tip().style('opacity',0); }

  /* ─── responsive svg mount ───────────────────────────────────── */
  function mount(elOrSel, W, H){
    const host = typeof elOrSel==='string' ? document.querySelector(elOrSel) : elOrSel;
    if(!host){ console.warn('BrandD3: mount not found', elOrSel); return null; }
    host.innerHTML='';
    const svg = d3.select(host).append('svg')
      .attr('viewBox',`0 0 ${W} ${H}`).attr('preserveAspectRatio','xMidYMid meet')
      .attr('role','img').style('width','100%').style('height','auto').style('display','block')
      .style('overflow','visible').style('font-family',T.fontSans);
    return svg;
  }
  function watermark(svg,W,H,src){
    if(!src) return;
    svg.insert('image',':first-child').attr('href',src).attr('x',W*0.19).attr('y',H*0.19)
      .attr('width',W*0.62).attr('height',H*0.62).attr('preserveAspectRatio','xMidYMid meet').attr('opacity',0.04);
  }
  const num = d3.format(',.0f');
  const money = v => '$'+d3.format(',.0f')(v);
  const moneyM = v => '$'+(v/1e6).toFixed(2)+'M';

  /* ══════════════════════════════════════════════════════════════
     1) SUPPLY & DEMAND — animated dual-axis (d3 twin of the Plotly
        headline). series = {active_inventory,new_listings,
        under_contract,months_supply,pending_last_7_days} as
        [{d,value}] arrays. Areas on left axis, signal lines on right.
     ═════════════════════════════════════════════════════════════ */
  function supplyDemand(el, cfg){
    cfg = cfg||{};
    const W=980,H=440,m={t:30,r:64,b:70,l:64};
    const iw=W-m.l-m.r, ih=H-m.t-m.b;
    const svg=mount(el,W,H); if(!svg) return;
    watermark(svg,W,H,cfg.watermark);
    const g=svg.append('g').attr('transform',`translate(${m.l},${m.t})`);
    const areas=[['active_inventory','Homes For Sale','neutral'],['new_listings','New Listings','blue'],['under_contract','Under Contract','teal']];
    const lines=[['months_supply','Months Supply','yellow'],['pending_last_7_days','7-day Contract Pace','pink']];
    const ser = cfg.series||{};
    const parse = d3.utcParse('%Y-%m-%d');
    const conv = a => (a||[]).map(p=>({d:parse(p.d)||new Date(p.d), v:+p.value})).filter(p=>p.d&&!isNaN(p.v));
    const A={}, Ln={}; areas.forEach(([k])=>A[k]=conv(ser[k])); lines.forEach(([k])=>Ln[k]=conv(ser[k]));
    const allDates = [].concat(...areas.map(([k])=>A[k]), ...lines.map(([k])=>Ln[k])).map(p=>p.d);
    if(!allDates.length){ g.append('text').attr('x',iw/2).attr('y',ih/2).attr('fill',T.tick).attr('text-anchor','middle').style('font-family',T.fontMono).text('no data'); return; }
    const x=d3.scaleUtc().domain(d3.extent(allDates)).range([0,iw]);
    const yL=d3.scaleLinear().domain([0,d3.max(areas,([k])=>d3.max(A[k],p=>p.v))||1]).nice().range([ih,0]);
    const yR=d3.scaleLinear().domain([0,d3.max(lines,([k])=>d3.max(Ln[k],p=>p.v))||1]).nice().range([ih,0]);
    // grid + axes
    g.append('g').attr('transform',`translate(0,${ih})`).call(d3.axisBottom(x).ticks(6).tickSize(-ih).tickFormat(d3.utcFormat('%b %y'))).call(styleAxis).call(gridStyle);
    g.append('g').call(d3.axisLeft(yL).ticks(5).tickSize(-iw)).call(styleAxis).call(gridStyle);
    g.append('g').attr('transform',`translate(${iw},0)`).call(d3.axisRight(yR).ticks(5)).call(styleAxis);
    const area=d3.area().x(p=>x(p.d)).y0(ih).curve(d3.curveCatmullRom.alpha(0.5));
    const lineg=d3.line().x(p=>x(p.d)).curve(d3.curveCatmullRom.alpha(0.5));
    areas.forEach(([k,name,tone])=>{ if(!A[k].length) return; const c=S[tone];
      const p=g.append('path').datum(A[k]).attr('fill',c.fill).attr('stroke',c.line).attr('stroke-width',1.25)
        .attr('d',area.y1(pt=>yL(pt.v)));
      const L=p.node().getTotalLength?0:0; p.attr('opacity',0).transition().duration(700).attr('opacity',1);
    });
    lines.forEach(([k,name,tone])=>{ if(!Ln[k].length) return; const c=S[tone];
      const path=g.append('path').datum(Ln[k]).attr('fill','none').attr('stroke',c.line).attr('stroke-width',3)
        .attr('d',lineg.y(pt=>yR(pt.v)));
      let len=0; try{ len=path.node().getTotalLength(); }catch(e){}
      if(len>0){ path.attr('stroke-dasharray',len+' '+len).attr('stroke-dashoffset',len).transition().duration(1100).ease(d3.easeCubicOut).attr('stroke-dashoffset',0); }
      else { path.attr('opacity',0).transition().duration(900).attr('opacity',1); }
    });
    // unified hover
    const focus=g.append('line').attr('y1',0).attr('y2',ih).attr('stroke',T.gold).attr('stroke-width',1).attr('opacity',0);
    const allSeries = areas.map(([k,name,tone])=>({k,name,tone,axis:'L',data:A[k]})).concat(lines.map(([k,name,tone])=>({k,name,tone,axis:'R',data:Ln[k]})));
    g.append('rect').attr('width',iw).attr('height',ih).attr('fill','transparent')
      .on('mousemove',function(ev){ const mx=d3.pointer(ev,this)[0]; const dt=x.invert(mx); focus.attr('x1',mx).attr('x2',mx).attr('opacity',0.6);
        const rows=allSeries.map(s=>{ if(!s.data.length) return null; const i=d3.bisector(p=>p.d).center(s.data,dt); const p=s.data[i]; return p?`<span style="color:${S[s.tone].line}">■</span> ${s.name}: <b>${num(p.v)}</b>`:null;}).filter(Boolean);
        tipShow(`<div style="font-family:${T.fontMono};font-size:11px;color:${T.tick};margin-bottom:4px">${d3.utcFormat('%b %e, %Y')(dt)}</div>${rows.join('<br>')}`,ev);})
      .on('mouseleave',()=>{focus.attr('opacity',0);tipHide();});
    legend(svg,W,H,allSeries.map(s=>({label:s.name,color:S[s.tone].line})));
    return svg;
  }

  /* ══ 2) BEESWARM — force-collide dots (seller propensity etc.) ══ */
  function beeswarm(el, data, opts){
    opts=opts||{}; const xF=opts.xField||'score', rF=opts.rField||'value';
    const W=980,H=opts.height||320,m={t:34,r:26,b:44,l:26}, iw=W-m.l-m.r, midY=(H-m.b+m.t)/2;
    const svg=mount(el,W,H); if(!svg) return; watermark(svg,W,H,opts.watermark);
    const xExt=opts.xDomain||d3.extent(data,d=>+d[xF]);
    const x=d3.scaleLinear().domain(xExt).range([m.l,m.l+iw]).nice();
    const r=d3.scaleSqrt().domain(d3.extent(data,d=>+d[rF])).range([opts.rMin||3.3,opts.rMax||15]);
    const color=d3.scaleSequential(t=>d3.interpolateRgb('#3a4763',T.goldLight)(t)).domain(opts.colorDomain||xExt);
    (opts.refs||[]).forEach(rf=>{ svg.append('line').attr('x1',x(rf.at)).attr('x2',x(rf.at)).attr('y1',m.t-8).attr('y2',H-m.b).attr('stroke',rf.color||T.gold).attr('stroke-dasharray','2 3').attr('opacity',.5);
      svg.append('text').attr('x',x(rf.at)).attr('y',m.t-13).attr('text-anchor','middle').attr('fill',rf.color||T.gold).style('font-size','10.5px').style('font-family',T.fontMono).text(rf.label);});
    const sim=d3.forceSimulation(data).force('x',d3.forceX(d=>x(+d[xF])).strength(.95)).force('y',d3.forceY(midY).strength(.055)).force('collide',d3.forceCollide(d=>r(+d[rF])+1.3).iterations(3)).stop();
    for(let i=0;i<280;i++) sim.tick();
    data.forEach(d=>{ d.y=Math.max(m.t+r(+d[rF]),Math.min(H-m.b-r(+d[rF]),d.y)); });
    svg.append('g').attr('transform',`translate(0,${H-m.b})`).call(d3.axisBottom(x).ticks(9)).call(styleAxis);
    if(opts.xLabel) svg.append('text').attr('x',m.l+iw/2).attr('y',H-6).attr('text-anchor','middle').attr('fill',T.tick).style('font-size','10.5px').text(opts.xLabel);
    svg.append('g').selectAll('circle').data(data).join('circle')
      .attr('cx',d=>d.x).attr('cy',d=>d.y).attr('r',0).attr('fill',d=>color(+d[xF])).attr('stroke',T.paper).attr('stroke-width',.8).attr('opacity',.92).style('cursor','pointer')
      .on('mouseover',function(ev,d){ d3.select(this).attr('stroke',T.goldLight).attr('stroke-width',1.6); tipShow(opts.tip?opts.tip(d):`<b>${d[opts.labelField||'label']||''}</b>`,ev);})
      .on('mousemove',tipMove).on('mouseout',function(){ d3.select(this).attr('stroke',T.paper).attr('stroke-width',.8); tipHide();})
      .transition().duration(650).delay((d,i)=>i*4).attr('r',d=>r(+d[rF]));
    return svg;
  }

  /* ══ 3) RIDGELINE — stacked KDE (e.g. $/SF by village) ═════════ */
  function ridgeline(el, groups, opts){
    opts=opts||{}; const W=opts.width||520,H=opts.height||(groups.length*54+70),m={t:16,r:24,b:34,l:opts.labelW||110};
    const iw=W-m.l-m.r; const svg=mount(el,W,H); if(!svg) return;
    const allv=[].concat(...groups.map(g=>g.values));
    const dom=opts.xDomain||[d3.min(allv)*0.9,d3.max(allv)*1.05];
    const x=d3.scaleLinear().domain(dom).range([m.l,m.l+iw]);
    const th=d3.range(dom[0],dom[1],(dom[1]-dom[0])/120);
    const bw=opts.bandwidth||((dom[1]-dom[0])/22);
    const K=v=>{v/=bw;return Math.abs(v)<=1?0.75*(1-v*v)/bw:0;};
    const kde=arr=>th.map(t=>[t,d3.mean(arr,d=>K(t-d))]);
    const rows=groups.map(g=>({name:g.name,dens:kde(g.values),median:d3.median(g.values)}));
    const maxD=d3.max(rows,r=>d3.max(r.dens,d=>d[1]));
    const step=(H-m.t-m.b)/rows.length, amp=step*2.55;
    const dS=d3.scaleLinear().domain([0,maxD]).range([0,amp]);
    const tier=d3.scaleSequential(t=>d3.interpolateRgb(T.goldLight,'#6f5a34')(t)).domain([0,rows.length-1]);
    svg.append('g').attr('transform',`translate(0,${H-m.b})`).call(d3.axisBottom(x).ticks(5).tickFormat(opts.tickFormat||(d=>d))).call(styleAxis);
    if(opts.xLabel) svg.append('text').attr('x',m.l+iw/2).attr('y',H-4).attr('text-anchor','middle').attr('fill',T.tick).style('font-size','10.5px').text(opts.xLabel);
    rows.forEach((rw,i)=>{ const baseY=m.t+i*step+step;
      const area=d3.area().x(d=>x(d[0])).y0(baseY).y1(d=>baseY-dS(d[1])).curve(d3.curveBasis);
      const ln=d3.line().x(d=>x(d[0])).y(d=>baseY-dS(d[1])).curve(d3.curveBasis);
      const gg=svg.append('g'); const clip='rl'+Math.random().toString(36).slice(2);
      gg.append('path').datum(rw.dens).attr('d',area).attr('fill',tier(i)).attr('opacity',0).transition().delay(i*90).duration(600).attr('opacity',.82);
      gg.append('path').datum(rw.dens).attr('d',ln).attr('fill','none').attr('stroke',T.paper).attr('stroke-width',1);
      gg.append('path').datum(rw.dens).attr('d',ln).attr('fill','none').attr('stroke',d3.rgb(tier(i)).brighter(0.9)).attr('stroke-width',.9).attr('opacity',.85);
      svg.append('text').attr('x',m.l-12).attr('y',baseY-4).attr('text-anchor','end').attr('fill',T.text2).style('font-family',T.fontSerif).style('font-size','14px').text(rw.name);
      svg.append('text').attr('x',m.l-12).attr('y',baseY+9).attr('text-anchor','end').attr('fill',T.tick).style('font-size','10px').style('font-family',T.fontMono).text((opts.tickFormat?opts.tickFormat(rw.median):'med '+num(rw.median)));
      gg.append('path').datum(rw.dens).attr('d',area).attr('fill','transparent').style('cursor','pointer')
        .on('mouseover',ev=>tipShow(`<b>${rw.name}</b><br>median <b>${opts.tickFormat?opts.tickFormat(rw.median):num(rw.median)}</b>`,ev)).on('mousemove',tipMove).on('mouseout',tipHide);
    });
    return svg;
  }

  /* ══ 4) CHORD — directed flows (buyer migration) ══════════════ */
  function chord(el, names, matrix, opts){
    opts=opts||{}; const W=opts.width||460,H=opts.height||460, outer=Math.min(W,H)*0.5-Math.max(70,opts.pad||78), inner=outer-14;
    const svg=mount(el,W,H); if(!svg) return;
    const color=d3.scaleOrdinal().domain(names).range(RAMP);
    const ch=d3.chordDirected().padAngle(0.055).sortSubgroups(d3.descending);
    const arc=d3.arc().innerRadius(inner).outerRadius(outer);
    const rib=d3.ribbonArrow().radius(inner-1);
    const chords=ch(matrix);
    const g=svg.append('g').attr('transform',`translate(${W/2},${H/2})`);
    const ribbons=g.append('g').attr('fill-opacity',0.72).selectAll('path').data(chords).join('path')
      .attr('d',rib).attr('fill',d=>color(names[d.source.index])).attr('stroke',d=>d3.rgb(color(names[d.source.index])).darker(0.6)).attr('stroke-width',.4).style('cursor','pointer')
      .attr('opacity',0).on('mouseover',(ev,d)=>tipShow(`<b>${names[d.source.index]} → ${names[d.target.index]}</b><br>${matrix[d.source.index][d.target.index]} ${opts.unit||'flows'}`,ev)).on('mousemove',tipMove).on('mouseout',tipHide);
    ribbons.transition().duration(700).delay((d,i)=>i*18).attr('opacity',1);
    const groups=g.append('g').selectAll('g').data(chords.groups).join('g');
    groups.append('path').attr('d',arc).attr('fill',d=>color(names[d.index])).attr('stroke',T.paper).attr('stroke-width',1).style('cursor','pointer')
      .on('mouseover',function(ev,d){ ribbons.transition().duration(140).attr('opacity',r=>(r.source.index===d.index||r.target.index===d.index)?1:0.08); tipShow(`<b>${names[d.index]}</b><br><span style="color:${T.tick}">${d3.sum(matrix[d.index])} ${opts.unit||'flows'} out</span>`,ev);})
      .on('mousemove',tipMove).on('mouseout',function(){ ribbons.transition().duration(140).attr('opacity',1); tipHide();});
    groups.append('text').each(d=>{d.a=(d.startAngle+d.endAngle)/2;}).attr('dy','0.32em')
      .attr('transform',d=>`rotate(${d.a*180/Math.PI-90}) translate(${outer+8}) ${d.a>Math.PI?'rotate(180)':''}`)
      .attr('text-anchor',d=>d.a>Math.PI?'end':null).attr('fill',T.text2).style('font-family',T.fontSerif).style('font-size','13px').text(d=>names[d.index]);
    return svg;
  }

  /* ══ 5) FUNNEL — tapering Sankey (pipeline) ═══════════════════ */
  function funnel(el, stages, opts){
    opts=opts||{}; const W=opts.width||520,H=opts.height||360,m={t:44,r:22,b:40,l:22};
    const svg=mount(el,W,H); if(!svg) return;
    const midY=(m.t+(H-m.b))/2;
    const x=d3.scalePoint().domain(stages.map(s=>s.k)).range([m.l+34,W-m.r-34]);
    const hS=d3.scaleLinear().domain([0,stages[0].n]).range([0,H-m.t-m.b]);
    const nodeW=13, grad=d3.scaleSequential(t=>d3.interpolateRgb('#8f7a53',T.goldLight)(t)).domain([0,stages.length-1]);
    for(let i=0;i<stages.length-1;i++){ const a=stages[i],b=stages[i+1];
      const x0=x(a.k)+nodeW/2,x1=x(b.k)-nodeW/2,ha=hS(a.n),hb=hS(b.n);
      const lt=midY-ha/2,lb=midY+ha/2,rt=midY-hb/2,rb=midY+hb/2,cx=(x0+x1)/2;
      svg.append('path').attr('d',`M${x0},${lt} C${cx},${lt} ${cx},${rt} ${x1},${rt} L${x1},${rb} C${cx},${rb} ${cx},${lb} ${x0},${lb} Z`)
        .attr('fill',grad(i)).attr('opacity',0).style('cursor','pointer')
        .on('mouseover',function(ev){ d3.select(this).attr('opacity',.5); tipShow(`<b>${a.k} → ${b.k}</b><br>${b.n} of ${a.n}<br><span style="color:${T.tick}">${d3.format('.0%')(b.n/a.n)} conversion · ${a.n-b.n} lost</span>`,ev);})
        .on('mousemove',tipMove).on('mouseout',function(){ d3.select(this).attr('opacity',.24); tipHide();})
        .transition().delay(i*80).duration(500).attr('opacity',.24);
    }
    stages.forEach((s,i)=>{ const h=hS(s.n);
      svg.append('rect').attr('x',x(s.k)-nodeW/2).attr('y',midY-h/2).attr('width',nodeW).attr('height',h).attr('rx',2).attr('fill',grad(i)).attr('stroke',T.paper).attr('stroke-width',1).style('cursor','pointer')
        .on('mouseover',ev=>tipShow(`<b>${s.k}</b><br>${s.n}<br><span style="color:${T.tick}">${d3.format('.0%')(s.n/stages[0].n)} of top</span>`,ev)).on('mousemove',tipMove).on('mouseout',tipHide);
      svg.append('text').attr('x',x(s.k)).attr('y',26).attr('text-anchor','middle').attr('fill',T.text2).style('font-family',T.fontSerif).style('font-size','13.5px').text(s.k);
      svg.append('text').attr('x',x(s.k)).attr('y',H-22).attr('text-anchor','middle').attr('fill',grad(i)).style('font-family',T.fontMono).style('font-weight','600').text(s.n);
      svg.append('text').attr('x',x(s.k)).attr('y',H-9).attr('text-anchor','middle').attr('fill',T.tick).style('font-size','10px').style('font-family',T.fontMono).text(d3.format('.0%')(s.n/stages[0].n));
    });
    return svg;
  }

  /* ══ 6) RADIAL GAUGE — momentum score (-100..100) ═════════════ */
  function radialGauge(el, value, opts){
    opts=opts||{}; const min=opts.min!=null?opts.min:-100, max=opts.max!=null?opts.max:100;
    const W=opts.width||220,H=opts.height||150, cx=W/2, cy=H-24, R=Math.min(W/2,H-30)-6;
    const svg=mount(el,W,H); if(!svg) return;
    const a=d3.scaleLinear().domain([min,max]).range([-Math.PI/2,Math.PI/2]).clamp(true);
    const arc=d3.arc().innerRadius(R-13).outerRadius(R).startAngle(-Math.PI/2);
    svg.append('path').attr('transform',`translate(${cx},${cy})`).attr('d',arc.endAngle(Math.PI/2)).attr('fill','rgba(255,255,255,0.06)');
    const val = value==null?min:Math.max(min,Math.min(max,value));
    const col = val>0 ? '#34d399' : val<0 ? '#ff4d6d' : T.tick;
    const fg=svg.append('path').attr('transform',`translate(${cx},${cy})`).attr('fill',col).attr('opacity',.9);
    fg.transition().duration(900).ease(d3.easeCubicOut).attrTween('d',()=>{ const i=d3.interpolate(-Math.PI/2,a(val)); return t=>arc.endAngle(i(t))(); });
    svg.append('text').attr('x',cx).attr('y',cy-6).attr('text-anchor','middle').attr('fill',col).style('font-family',T.fontMono).style('font-size','26px').style('font-weight','700')
      .text((value==null?'—':(value>0?'+':'')+(+value).toFixed(1)));
    if(opts.label) svg.append('text').attr('x',cx).attr('y',cy+14).attr('text-anchor','middle').attr('fill',T.tick).style('font-size','10.5px').style('letter-spacing','.12em').style('text-transform','uppercase').text(opts.label);
    return svg;
  }

  /* ══ 7) SPARKLINE — inline micro trend ════════════════════════ */
  function sparkline(el, values, opts){
    opts=opts||{}; const W=opts.width||160,H=opts.height||40,pad=3;
    const svg=mount(el,W,H); if(!svg) return;
    const v=values.map(Number).filter(n=>!isNaN(n)); if(!v.length) return svg;
    const x=d3.scaleLinear().domain([0,v.length-1]).range([pad,W-pad]);
    const dom=opts.bipolar?[-100,100]:d3.extent(v); const pd=(dom[1]-dom[0])*0.1||1;
    const y=d3.scaleLinear().domain([dom[0]-pd,dom[1]+pd]).range([H-pad,pad]);
    if(opts.bipolar) svg.append('line').attr('x1',0).attr('x2',W).attr('y1',y(0)).attr('y2',y(0)).attr('stroke','rgba(255,255,255,0.08)');
    const area=d3.area().x((d,i)=>x(i)).y0(y(opts.bipolar?0:dom[0]-pd)).y1(d=>y(d)).curve(d3.curveMonotoneX);
    const ln=d3.line().x((d,i)=>x(i)).y(d=>y(d)).curve(d3.curveMonotoneX);
    const grad='sg'+Math.random().toString(36).slice(2);
    const lg=svg.append('defs').append('linearGradient').attr('id',grad).attr('x1',0).attr('x2',0).attr('y1',0).attr('y2',1);
    lg.append('stop').attr('offset','0%').attr('stop-color','rgba(201,169,110,0.34)');
    lg.append('stop').attr('offset','100%').attr('stop-color','rgba(201,169,110,0)');
    svg.append('path').datum(v).attr('d',area).attr('fill',`url(#${grad})`);
    svg.append('path').datum(v).attr('d',ln).attr('fill','none').attr('stroke',T.goldLight).attr('stroke-width',1.5);
    return svg;
  }

  /* ─── helpers ────────────────────────────────────────────────── */
  function styleAxis(sel){ sel.selectAll('text').attr('fill',T.tick).style('font-family',T.fontMono).style('font-size','11px');
    sel.selectAll('.domain').attr('stroke',T.axis); sel.selectAll('line').attr('stroke',T.axis); }
  function gridStyle(sel){ sel.selectAll('line').attr('stroke',T.grid); sel.select('.domain').attr('stroke',T.axis); }
  function legend(svg,W,H,items){ const g=svg.append('g').attr('transform',`translate(${W/2},${H-14})`); let tot=0; const gap=18;
    const widths=items.map(it=>it.label.length*6.4+20); tot=d3.sum(widths)+gap*(items.length-1); let cx=-tot/2;
    items.forEach((it,i)=>{ const gi=g.append('g').attr('transform',`translate(${cx},0)`);
      gi.append('rect').attr('width',11).attr('height',11).attr('y',-9).attr('rx',2).attr('fill',it.color);
      gi.append('text').attr('x',16).attr('fill',T.legend).style('font-size','12px').style('font-family',T.fontSans).text(it.label);
      cx+=widths[i]+gap; }); }

  /* ─── PUBLIC API ─────────────────────────────────────────────── */
  window.BrandD3 = { T, S, RAMP, supplyDemand, beeswarm, ridgeline, chord, funnel, radialGauge, sparkline,
    tip:{show:tipShow,move:tipMove,hide:tipHide} };
})();


/* ── marketBlend add-on (monthly history + live daily tail) ── */
/* ═══════════════════════════════════════════════════════════════
   BrandD3.marketBlend  —  monthly history + live daily tail
   Add-on to brand/charts/d3-brand.js  (window.BrandD3)

   One continuous line: the settled MONTHLY record (Infosparks →
   MLS roll-up, 2008→) as the calm steel spine, flowing into the
   LIVE daily MLS tail (trailing-30 / current inventory) in gold.
   Uses the existing BrandD3 token palette so it matches every
   other chart on the site.

   Load order:
     <script src=".../d3.min.js"></script>
     <script src="brand/charts/d3-brand.js"></script>
     <script src="brand/charts/d3-brand-marketblend.js"></script>

   Usage:
     BrandD3.marketBlend('#mount', { village:'Lake Forest', metric:'msp' });
     BrandD3.marketBlend('#mount', { village:'Lake Forest', controls:true });   // hero w/ pickers
   Options: village, metric(default 'msp'), range('all'|10|5|1|0.42),
            controls(bool), villagePicker(bool), supabase:{url,key}
   ═══════════════════════════════════════════════════════════════ */
(function () {
  if (typeof d3 === 'undefined') { console.error('marketBlend requires d3 v7'); return; }
  const B = (window.BrandD3 = window.BrandD3 || {});
  const T = B.T || {
    paper:'#071229', plot:'#0A1838', grid:'rgba(255,255,255,0.055)', axis:'rgba(255,255,255,0.14)',
    tick:'#9FB0CC', title:'#FFFFFF', legend:'#C8D3E4', text2:'#B0B8D1',
    gold:'#c9a96e', goldLight:'#e0c992', accent:'#4f8fff',
    fontSans:"'Inter','Helvetica Neue',Arial,sans-serif",
    fontSerif:"'Playfair Display',Georgia,serif",
    fontMono:"'JetBrains Mono','SF Mono',Menlo,monospace"
  };
  const STEEL='rgba(168,180,205,0.85)', STEELdim='rgba(168,180,205,0.42)';
  const GOLD=T.goldLight, GOLDsoft='rgba(224,201,146,0.08)', SEAM='rgba(224,201,146,0.34)';

  const SB = { url:'https://itupjrknklzvmmqicuyc.supabase.co', key:'sb_publishable_fQnZLJnaC-dAHBuGBHJgjQ_RUHCe_7S' };
  const VILLAGES=['Lake Forest','Lake Bluff','Highland Park','Winnetka','Wilmette','Glencoe','Kenilworth'];

  const fMoney=v=>v>=1e6?'$'+(v/1e6).toFixed(2)+'M':v>=1e3?'$'+Math.round(v/1e3)+'K':'$'+Math.round(v);
  const fMoneyAx=v=>v>=1e6?'$'+(v/1e6).toFixed(1)+'M':'$'+Math.round(v/1e3)+'K';
  const fD0=v=>'$'+Math.round(v), fInt=v=>Math.round(v).toLocaleString();
  const fDays=v=>Math.round(v)+' days', fPct=v=>v.toFixed(1)+'%', fMo=v=>v.toFixed(1)+' mo', fDec1=v=>v.toFixed(1);

  const METRICS={
    msp:{name:'Median Sales Price', m:'Median Sales Price', d:'mp', kind:'trailing', fmt:fMoney, ax:fMoneyAx},
    cs :{name:'Closed Sales', m:'Closed Sales', d:'cs', kind:'trailing', fmt:fInt, ax:fInt},
    ppsf:{name:'Median $ / SqFt', m:'Median Price Per Square Foot', d:'ppsf', kind:'trailing', fmt:fD0, ax:fD0},
    mmt:{name:'Median Market Time', m:'Median Market Time', d:'dom', kind:'trailing', fmt:fDays, ax:v=>Math.round(v)},
    pct:{name:'% of List Price', m:'Average Percent of Last List Price', d:'pct', kind:'trailing', mscale:100, fmt:fPct, ax:fPct},
    ms :{name:'Months Supply', m:'Months Supply of Homes for Sale', d:'ms', kind:'current', fmt:fMo, ax:fDec1},
    hfs:{name:'Homes for Sale', m:'Homes for Sale', d:'hfs', kind:'current', fmt:fInt, ax:fInt},
    uc :{name:'Under Contract', m:'Under Contract', d:'uc', kind:'current', fmt:fInt, ax:fInt},
    spl:{name:'Showings / Listing', m:'Showings Per Listing', d:null, archive:true, fmt:fDec1, ax:fDec1}
  };
  const ORDER=['msp','cs','ppsf','mmt','pct','ms','hfs','uc','spl'];
  const RANGES=[['All','all'],['10Y',10],['5Y',5],['1Y',1],['Live',0.42]];
  const DFIELDS={mp:'trailing30_median_price',cs:'trailing30_closed_sales',ppsf:'trailing30_median_ppsf',
    dom:'trailing30_median_dom',pct:'trailing30_avg_pct_lp',ms:'months_supply',hfs:'homes_for_sale',uc:'under_contract'};
  const num=x=>x==null?null:+x;
  const easeOutCubic=t=>1-Math.pow(1-t,3);
  function animateNum(el,target,fmt,dur){ dur=dur||1200; const t0=performance.now();
    (function step(now){ const t=Math.min(1,(now-t0)/dur); el.textContent=fmt(target*easeOutCubic(t)); if(t<1)requestAnimationFrame(step); })(performance.now()); }
  function drawIn(path,dur){ let L=0; try{L=path.node().getTotalLength();}catch(e){} if(L>0){ path.attr('stroke-dasharray',L+' '+L).attr('stroke-dashoffset',L).transition().duration(dur||1100).ease(d3.easeCubicOut).attr('stroke-dashoffset',0);} }
  const cache={};

  /* inject scoped CSS once */
  function css(){
    if(document.getElementById('bd3mb-css')) return;
    const s=document.createElement('style'); s.id='bd3mb-css';
    s.textContent=`
      .bd3mb{font-family:${T.fontSans};color:${T.legend}}
      .bd3mb .hd{display:flex;justify-content:space-between;align-items:flex-start;gap:14px;flex-wrap:wrap;margin-bottom:4px}
      .bd3mb .nm{font-family:${T.fontSerif};font-size:19px;color:#fff;margin:0}
      .bd3mb .sub{color:${T.tick};font-size:12px;margin-top:2px;display:flex;gap:8px;align-items:center}
      .bd3mb .vsel{background:${T.plot};color:#fff;border:1px solid ${T.axis};border-radius:8px;padding:4px 8px;font-family:${T.fontSerif};font-size:13px;cursor:pointer}
      .bd3mb .ro{text-align:right}
      .bd3mb .big{font-family:${T.fontSerif};font-size:27px;color:#fff;line-height:1}
      .bd3mb .rl{font-size:11px;color:${T.tick};margin-top:4px}
      .bd3mb .pill{display:inline-flex;align-items:center;gap:6px;font-size:10px;letter-spacing:.12em;text-transform:uppercase;border:1px solid rgba(224,201,146,.42);color:${GOLD};border-radius:999px;padding:3px 9px;margin-top:7px}
      .bd3mb .pill .dot{width:6px;height:6px;border-radius:50%;background:${GOLD};animation:bd3pulse 2.4s infinite}
      .bd3mb .pill.arch{border-color:rgba(159,176,204,.35);color:${T.tick}} .bd3mb .pill.arch .dot{background:${T.tick};animation:none}
      @keyframes bd3pulse{0%{box-shadow:0 0 0 0 rgba(224,201,146,.5)}70%{box-shadow:0 0 0 7px rgba(224,201,146,0)}100%{box-shadow:0 0 0 0 rgba(224,201,146,0)}}
      .bd3mb .lg{display:flex;gap:15px;flex-wrap:wrap;font-size:11.5px;color:${T.tick};margin:3px 0 8px}
      .bd3mb .lg i{display:inline-block;width:18px;height:0;border-top:2px solid;vertical-align:middle;margin-right:6px}
      .bd3mb .ctrls{display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;margin:6px 0 2px}
      .bd3mb .grp{display:flex;gap:6px;flex-wrap:wrap}
      .bd3mb button.chip{background:transparent;color:${T.tick};border:1px solid ${T.axis};border-radius:999px;padding:5px 10px;font-size:11.5px;cursor:pointer;font-family:${T.fontSans}}
      .bd3mb button.chip:hover{color:#fff}
      .bd3mb .grp.m button.chip.on{color:${T.paper};background:${GOLD};border-color:${GOLD};font-weight:600}
      .bd3mb .grp.r button.chip.on{color:${GOLD};border-color:${GOLD}}
      .bd3mb .cbox{position:relative;width:100%;min-height:320px}
      .bd3mb svg{display:block;width:100%;height:auto;overflow:visible}
      .bd3mb .ov{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:${T.tick};font-size:13px;background:rgba(7,18,41,.55)}
      .bd3mb .ov.err{color:#E7A0A0}
      .bd3mb .foot{color:${T.tick};opacity:.75;font-size:10.5px;margin-top:9px}
    `;
    document.head.appendChild(s);
  }

  async function pageFetch(sb, path){
    let out=[],from=0,g=0;
    for(;;){
      const r=await fetch(`${sb.url}/rest/v1/${path}&limit=1000&offset=${from}`,{headers:{apikey:sb.key,Authorization:'Bearer '+sb.key}});
      if(!r.ok) throw new Error('HTTP '+r.status);
      const j=await r.json(); out=out.concat(j);
      if(j.length===0 || ++g>40) break; from+=j.length;
    }
    return out;
  }
  async function load(sb, v){
    if(cache[v]) return cache[v];
    const vv=encodeURIComponent(v), dcols='snapshot_date,'+Object.values(DFIELDS).join(',');
    const [mrows,drows]=await Promise.all([
      pageFetch(sb,`historical_monthly_stats?village=eq.${vv}&select=metric,year,month,value&order=metric,year,month`),
      pageFetch(sb,`daily_snapshots?village=eq.${vv}&scope=eq.all&select=${dcols}&order=snapshot_date`)
    ]);
    const MS={}; for(const r of mrows){(MS[r.metric]=MS[r.metric]||[]).push({date:new Date(r.year,r.month-1,1),v:+r.value});}
    const DA=drows.map(r=>{const o={date:new Date(r.snapshot_date+'T00:00:00')};for(const k in DFIELDS)o[k]=num(r[DFIELDS[k]]);return o;});
    const lm=d3.max(Object.values(MS).flatMap(a=>a.map(p=>p.date))), ld=DA.length?DA[DA.length-1].date:null;
    return (cache[v]={MS,DA,asOf:ld||lm,domainEnd:d3.max([lm,ld].filter(Boolean)),dailyStart:DA.length?DA[0].date:null});
  }

  B.marketBlend = function(elOrSel, opts){
    opts=opts||{}; css();
    const host = typeof elOrSel==='string'?document.querySelector(elOrSel):elOrSel;
    if(!host){ console.warn('marketBlend: mount not found', elOrSel); return; }
    const sb = opts.supabase||SB;
    const st = { active:opts.metric||'msp', range:opts.range||'all', village:opts.village||'Lake Forest', data:null };

    host.classList.add('bd3mb');
    host.innerHTML =
      `<div class="hd"><div><p class="nm" data-nm></p><div class="sub">`
      + (opts.villagePicker?`<select class="vsel" data-vsel></select>`:``)
      + `<span data-vlabel></span><span>· Single Family</span></div></div>`
      + `<div class="ro"><div class="big" data-big>—</div><div class="rl" data-rl></div><div data-pill></div></div></div>`
      + `<div class="lg"><span><i style="border-color:${STEEL}"></i>Monthly · Infosparks</span><span><i style="border-color:${GOLD}"></i>Live daily · MLS</span></div>`
      + (opts.controls?`<div class="ctrls"><div class="grp m" data-m></div><div class="grp r" data-r></div></div>`:``)
      + `<div class="cbox" data-cbox><svg data-svg></svg><div class="ov" data-ov>Loading…</div></div>`
      + `<div class="foot">Steel = settled monthly record · Gold = live MLS (updates daily). Showings/Listing archive through Feb 2026.</div>`;

    const q=s=>host.querySelector(s);
    const svg=d3.select(q('[data-svg]'));
    const ov=(msg,err)=>{const o=q('[data-ov]');o.style.display='flex';o.classList.toggle('err',!!err);o.textContent=msg;};
    const ovHide=()=>{q('[data-ov]').style.display='none';};

    if(opts.villagePicker){
      const vs=d3.select(q('[data-vsel]'));
      VILLAGES.forEach(v=>vs.append('option').attr('value',v).text(v));
      vs.property('value',st.village).on('change',function(){ setVillage(this.value); });
    }
    if(opts.controls){
      const mg=d3.select(q('[data-m]'));
      ORDER.forEach(k=>mg.append('button').attr('class','chip'+(k===st.active?' on':'')).text(METRICS[k].name)
        .on('click',function(){ st.active=k; mg.selectAll('.chip').classed('on',false); d3.select(this).classed('on',true); head(false); draw(true); }));
      const rg=d3.select(q('[data-r]'));
      RANGES.forEach(([l,val])=>rg.append('button').attr('class','chip'+(val===st.range?' on':'')).text(l)
        .on('click',function(){ st.range=val; rg.selectAll('.chip').classed('on',false); d3.select(this).classed('on',true); draw(true); }));
    }

    function head(count){
      const cfg=METRICS[st.active];
      q('[data-nm]').textContent=cfg.name;
      const vl=q('[data-vlabel]'); if(vl) vl.textContent=st.village;
      const D=st.data; let latest,lab,pill;
      if(cfg.d){
        const dl=D.DA.map(r=>({date:r.date,v:r[cfg.d]})).filter(p=>p.v!=null); latest=dl[dl.length-1];
        lab=(cfg.kind==='current'?'Live · current · ':'Live · trailing 30-day · ')+d3.timeFormat('%b %-d, %Y')(D.asOf);
        pill=`<span class="pill"><span class="dot"></span>Live · as of ${d3.timeFormat('%b %-d, %Y')(D.asOf)}</span>`;
      } else {
        const ml=D.MS[cfg.m]||[]; latest=ml[ml.length-1];
        lab='Archive · '+(latest?d3.timeFormat('%B %Y')(latest.date):'—')+' (final)';
        pill=`<span class="pill arch"><span class="dot"></span>Archive · through Feb 2026</span>`;
      }
      const bigEl=q('[data-big]'); if(latest){ if(count) animateNum(bigEl,latest.v,cfg.fmt); else bigEl.textContent=cfg.fmt(latest.v); } else bigEl.textContent='—';
      q('[data-rl]').textContent=lab; q('[data-pill]').innerHTML=pill;
    }

    function draw(anim){
      const cfg=METRICS[st.active], D=st.data; if(!D) return;
      const monthly=(D.MS[cfg.m]||[]).map(p=>({date:p.date,v:p.v*(cfg.mscale||1)}));
      const daily=cfg.d?D.DA.map(r=>({date:r.date,v:r[cfg.d]})).filter(p=>p.v!=null):[];
      if(!monthly.length && !daily.length) return;
      const x1=D.domainEnd; let x0 = st.range==='all' ? (monthly[0]||daily[0]).date : (function(){const d=new Date(x1);d.setDate(d.getDate()-Math.round(st.range*365));return d;})();
      const inR=d=>d.date>=x0&&d.date<=x1, mv=monthly.filter(inR), dv=daily.filter(inR), pts=[...mv,...dv];
      if(!pts.length) return;
      const box=q('[data-cbox]'), W=box.clientWidth||860, Hh=Math.max(320,Math.min(470,W*0.46)), M={t:16,r:18,b:30,l:66};
      svg.attr('viewBox',`0 0 ${W} ${Hh}`); svg.selectAll('*').remove();
      const x=d3.scaleTime().domain([x0,x1]).range([M.l,W-M.r]);
      let lo=d3.min(pts,d=>d.v), hi=d3.max(pts,d=>d.v); const pad=(hi-lo)*0.12||hi*0.1||1; lo=Math.max(0,lo-pad); hi+=pad;
      const y=d3.scaleLinear().domain([lo,hi]).nice().range([Hh-M.b,M.t]);
      svg.append('g').attr('transform',`translate(${M.l},0)`).call(d3.axisLeft(y).ticks(5).tickSize(-(W-M.l-M.r)).tickFormat(''))
        .call(g=>{g.selectAll('line').attr('stroke',T.grid);g.select('.domain').remove();});
      if(dv.length&&D.dailyStart){
        const zx0=x(d3.max([x0,D.dailyStart])),zx1=x(x1);
        svg.append('rect').attr('x',zx0).attr('y',M.t).attr('width',Math.max(0,zx1-zx0)).attr('height',Hh-M.b-M.t).attr('fill',GOLDsoft);
        if(D.dailyStart>=x0){
          svg.append('line').attr('x1',x(D.dailyStart)).attr('x2',x(D.dailyStart)).attr('y1',M.t).attr('y2',Hh-M.b).attr('stroke',SEAM).attr('stroke-dasharray','3 4');
          svg.append('text').attr('x',x(D.dailyStart)+6).attr('y',M.t+12).attr('fill',GOLD).style('font-size','10px').style('font-family',T.fontMono).style('letter-spacing','.08em').text('LIVE ▸');
        }
      }
      const styleAx=g=>{g.selectAll('text').attr('fill',T.tick).style('font-family',T.fontMono).style('font-size','10.5px');g.selectAll('line,.domain').attr('stroke',T.axis);};
      svg.append('g').attr('transform',`translate(0,${Hh-M.b})`).call(d3.axisBottom(x).ticks(Math.max(4,Math.floor(W/120))).tickFormat(d3.timeFormat(st.range==='all'||st.range===10?'%Y':"%b '%y"))).call(styleAx);
      svg.append('g').attr('transform',`translate(${M.l},0)`).call(d3.axisLeft(y).ticks(5).tickFormat(cfg.ax)).call(styleAx);
      const lineM=d3.line().x(d=>x(d.date)).y(d=>y(d.v)).curve(d3.curveMonotoneX);
      const lineD=d3.line().x(d=>x(d.date)).y(d=>y(d.v)).curve(d3.curveLinear);
      const mPath=svg.append('path').datum(mv).attr('fill','none').attr('stroke',STEEL).attr('stroke-width',1.6).attr('opacity',.9).attr('d',lineM);
      if(anim) drawIn(mPath,1200);
      if(dv.length){
        svg.append('path').datum(dv).attr('fill','none').attr('stroke',GOLD).attr('stroke-width',5).attr('opacity',.14).attr('d',lineD);
        const dPath=svg.append('path').datum(dv).attr('fill','none').attr('stroke',GOLD).attr('stroke-width',2.2).attr('d',lineD);
        if(anim) drawIn(dPath,1000);
        const last=dv[dv.length-1];
        const halo=svg.append('circle').attr('cx',x(last.date)).attr('cy',y(last.v)).attr('r',8).attr('fill','rgba(224,201,146,.18)');
        const ldot=svg.append('circle').attr('cx',x(last.date)).attr('cy',y(last.v)).attr('r',3.6).attr('fill',GOLD).attr('stroke',T.paper).attr('stroke-width',1);
        if(anim){ halo.attr('opacity',0).transition().delay(650).duration(500).attr('opacity',1); ldot.attr('opacity',0).transition().delay(650).duration(500).attr('opacity',1); }
      }
      const bis=d3.bisector(d=>d.date).center;
      const hair=svg.append('line').attr('y1',M.t).attr('y2',Hh-M.b).attr('stroke','rgba(255,255,255,.25)').style('opacity',0);
      const dot=svg.append('circle').attr('r',4).attr('stroke',T.paper).attr('stroke-width',1.2).style('opacity',0);
      const useTip = B.tip && B.tip.show;
      svg.append('rect').attr('x',M.l).attr('y',M.t).attr('width',W-M.l-M.r).attr('height',Hh-M.b-M.t).attr('fill','transparent')
        .on('mousemove',function(ev){
          const dt=x.invert(d3.pointer(ev,this)[0]); let p,live=false;
          if(dv.length&&D.dailyStart&&dt>=new Date(D.dailyStart.getTime()-12*864e5)){ p=dv[Math.max(0,Math.min(dv.length-1,bis(dv,dt)))]; live=true; }
          else if(mv.length){ p=mv[Math.max(0,Math.min(mv.length-1,bis(mv,dt)))]; }
          if(!p) return;
          hair.attr('x1',x(p.date)).attr('x2',x(p.date)).style('opacity',1);
          dot.attr('cx',x(p.date)).attr('cy',y(p.v)).attr('fill',live?GOLD:STEEL).style('opacity',1);
          const df=live?d3.timeFormat('%b %-d, %Y'):d3.timeFormat('%B %Y');
          const src=live?(cfg.kind==='current'?'Daily · MLS (current)':'Daily · MLS (30-day)'):'Monthly · Infosparks';
          const html=`<div style="font-family:${T.fontMono};font-size:11px;color:${T.tick};margin-bottom:3px">${df(p.date)}</div>`
            +`<div style="font-family:${T.fontSerif};font-size:16px;color:#fff">${cfg.fmt(p.v)}</div>`
            +`<div style="font-size:10px;letter-spacing:.06em;text-transform:uppercase;color:${sc};margin-top:3px">${src}</div>`;
          if(useTip) B.tip.show(html,ev);
        })
        .on('mouseleave',()=>{hair.style('opacity',0);dot.style('opacity',0);if(useTip)B.tip.hide();});
    }

    const revealMode = opts.revealOnScroll!==false;
    let shown=false, io=null;
    function present(){
      if(shown){ head(false); draw(true); return; }
      if(!revealMode){ shown=true; head(true); draw(true); return; }
      if(!io){ io=new IntersectionObserver((es,obs)=>{ if(es.some(e=>e.isIntersecting)){ shown=true; head(true); draw(true); obs.disconnect(); io=null; } },{threshold:0.2}); io.observe(host); }
    }
    async function setVillage(v){
      st.village=v; if(!cache[v]) ov('Loading '+v+'…',false);
      try{ st.data=await load(sb,v); ovHide(); present(); }
      catch(e){ ov('Could not load '+v+' — '+e.message,true); }
    }
    let rt; window.addEventListener('resize',()=>{clearTimeout(rt);rt=setTimeout(()=>{if(st.data&&shown)draw(false);},140);});
    setVillage(st.village);
    return { setVillage, setMetric:k=>{st.active=k;head(false);draw(true);}, setRange:r=>{st.range=r;draw(true);} };
  };
})();
