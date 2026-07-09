# patrick.realestate v13 — Astro rebuild (Phase A scaffold)
Per `../V13_REDESIGN_PLAN.md` + `../_audit-2026-07/08_TECHNICAL_ARCHITECTURE.md` §6.

## Status: SCAFFOLD (alpha)
Component system stands; content migration is Phase A–B work. Built here so nav/footer/head exist ONCE — the class of defect that produced 16 drifting copies in v11 cannot recur.

## What exists
- `astro.config.mjs` — static output, `build.format: 'file'`, sitemap integration, Tailwind v4 via Vite plugin
- `src/styles/global.css` — Tailwind theme seeded from **brand-core tokens** (the consolidated gold/neutral/motion spec)
- `src/layouts/Base.astro` — head (canonical/OG/JSON-LD/fonts/favicon), skip link, Nav, Footer
- `src/components/Nav.astro` — canonical 8-link nav + mobile overlay (single source)
- `src/components/Footer.astro`
- `src/pages/contact.astro` — proof-of-migration page

## To run (your machine — do NOT npm install via the Claude sandbox mount)
```powershell
cd "C:\Users\PMilh\Claude\Projects\_Real Estate OS\06_Website & Backend\patrick.realestate.v13"
npm install
npm run dev      # local preview
npm run build    # dist/ output — deployable to Cloudflare Pages
```

## Phase A remaining (next sessions)
1. Copy `public/` assets from v11 (brand/, images/, favicons, lf-market-assets, listings imagery, _headers, robots.txt)
2. Migrate static pages 1:1 (about, buying, selling, heritage, neighborhoods + 6 villages)
3. Port liquid background + GSAP/Lenis choreography as a `<Motion />` island honoring the new motion table
4. Phase B: homepage 8-movement rebuild per `_audit-2026-07/04_HOMEPAGE_REDESIGN.md`
5. Phase C: listings as Content Collections; Phase D: Intelligence island; Phase E: PWA + launch

## Deployment (when ready)
Own Cloudflare Pages project (`patrick-realestate-v13`), git-connected, build command `npm run build`, output `dist`. Preview URLs per PR. Cutover only after parity review — v11 keeps serving until then.
