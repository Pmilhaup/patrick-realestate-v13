/* Shared chapter orchestrator (v13 Phase A) — superset of the per-page v11 variants:
   fade-up/headline reveals + .kpi, .step, .lock-card, .village-tile, smooth anchor scroll.
   Absent selectors no-op. Reduced-motion gate included. */

(() => {
  document.querySelectorAll('[data-headline]').forEach(h => {
    const walk = (node) => {
      Array.from(node.childNodes).forEach(child => {
        if (child.nodeType === Node.TEXT_NODE) {
          const text = child.nodeValue; if (!text.trim()) return;
          const frag = document.createDocumentFragment();
          text.split(/(\s+)/).forEach(part => {
            if (!part) return;
            if (/^\s+$/.test(part)) frag.appendChild(document.createTextNode(part));
            else { const w = document.createElement('span'); w.className = 'w'; const inner = document.createElement('span'); inner.textContent = part; w.appendChild(inner); frag.appendChild(w); }
          });
          node.replaceChild(frag, child);
        } else if (child.nodeType === Node.ELEMENT_NODE) { if (child.tagName === 'BR') return; walk(child); }
      });
    };
    walk(h);
  });
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    document.querySelectorAll('.fade-up, .w > span').forEach(el => { el.style.opacity = 1; el.style.transform = 'none'; });
    return; // native scroll for reduced-motion users
  }
  if (typeof Lenis === 'undefined' || typeof gsap === 'undefined') return;
  const lenis = new Lenis({ duration: 1.4, easing: t => Math.min(1, 1.001 - Math.pow(2, -10 * t)), smoothWheel: true, smoothTouch: false, wheelMultiplier: 1, lerp: 0.08 });
  document.querySelectorAll('a[href^="#"]').forEach(a => { a.addEventListener('click', e => { const href = a.getAttribute('href'); if (!href || href === '#') return; const target = document.querySelector(href); if (!target) return; e.preventDefault(); lenis.scrollTo(target, { offset: 0, duration: 1.6 }); }); });
  gsap.registerPlugin(ScrollTrigger);
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add(time => lenis.raf(time * 1000));
  gsap.ticker.lagSmoothing(0);
  if (window.__paintUniforms) ScrollTrigger.create({ trigger: 'main', start: 'top top', end: 'bottom bottom', onUpdate: self => { window.__paintUniforms.uScroll.value = self.progress; } });
  const chapters = gsap.utils.toArray('.chapter');
  chapters.forEach((ch, i) => {
    const headline = ch.querySelector('[data-headline]');
    const words = headline ? headline.querySelectorAll('.w > span') : [];
    const fades = ch.querySelectorAll('.fade-up');
    const kpis = ch.querySelectorAll('.kpi');
    const steps = ch.querySelectorAll('.step');
    const palette = parseFloat(ch.dataset.palette || '0');
    const tl = gsap.timeline({ scrollTrigger: { trigger: ch, start: 'top 70%', end: 'top 10%', toggleActions: 'play none none reverse' } });
    if (window.__paintUniforms) tl.to(window.__paintUniforms.uPaletteMix, { value: palette, duration: 1.6, ease: 'power2.out' }, 0);
    if (fades.length) tl.to(fades, { opacity:1, y:0, duration:1.0, stagger:0.10, ease:'power3.out' }, 0.05);
    if (words.length) tl.to(words, { y:0, duration:1.1, stagger:0.045, ease:'power3.out' }, 0.15);
    if (kpis.length)  tl.to(kpis,  { opacity:1, y:0, duration:0.9, stagger:0.10, ease:'power3.out' }, 0.5);
    if (steps.length) tl.to(steps, { opacity:1, y:0, duration:0.7, stagger:0.08, ease:'power2.out' }, 0.5);
    const lockCard = ch.querySelector('.lock-card');
    if (lockCard)     tl.to(lockCard, { opacity:1, y:0, duration:1.0, ease:'power3.out' }, 0.5);
    const tiles = ch.querySelectorAll('.village-tile');
    if (tiles.length) tl.to(tiles, { opacity:1, y:0, duration:0.9, stagger:0.08, ease:'power3.out' }, 0.4);
    if (i === 0) requestAnimationFrame(() => tl.play(0));
  });
  const dots = document.querySelectorAll('.rail .dot');
  chapters.forEach((ch, i) => { ScrollTrigger.create({ trigger: ch, start: 'top 50%', end: 'bottom 50%', onToggle: self => { if (self.isActive) dots.forEach(d => d.classList.toggle('active', +d.dataset.rail === i)); } }); });
  function raf(time) { lenis.raf(time); requestAnimationFrame(raf); }
  requestAnimationFrame(raf);
})();

