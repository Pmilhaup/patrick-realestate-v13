// Builds src/data/shore.json: the seven villages' boundaries, projected to SVG paths with D3 Geo.
// Source: U.S. Census Bureau cartographic boundary file (places, Illinois, 1:500,000, 2022), public domain.
//   node tools/build_shore.mjs <path-to-illinois-place.geojson>
import { readFileSync, writeFileSync } from 'node:fs';
import { geoMercator, geoPath, geoBounds, geoCentroid } from 'd3-geo';

const VILLAGES = ['Lake Bluff', 'Lake Forest', 'Highland Park', 'Glencoe', 'Winnetka', 'Kenilworth', 'Wilmette'];
const W = 520, PAD = 18;
const src = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const pick = src.features.filter((f) => VILLAGES.includes(f.properties.NAME));
if (pick.length !== VILLAGES.length) throw new Error('expected 7 villages, found ' + pick.map((f) => f.properties.NAME));

// Frame: the seven villages, with a margin of lake to the east.
const all = { type: 'FeatureCollection', features: pick };
const [[w, s], [e, n]] = geoBounds(all);
const frame = { type: 'Feature', geometry: { type: 'Polygon', coordinates: [[[w - 0.012, s - 0.006], [w - 0.012, n + 0.006], [e + 0.075, n + 0.006], [e + 0.075, s - 0.006], [w - 0.012, s - 0.006]]] } };
const aspect = (() => { const p = geoMercator().fitWidth(W, frame); const b = geoPath(p).bounds(frame); return (b[1][1] - b[0][1]) / (b[1][0] - b[0][0]); })();
const H = Math.round(W * aspect);
const proj = geoMercator().fitExtent([[0, 0], [W, H]], frame);
const path = geoPath(proj).digits(1);
const [fw, fs] = frame.geometry.coordinates[0][0], [fe, fn] = frame.geometry.coordinates[0][2];

// Neighbouring municipalities inside the frame, for context.
const inFrame = (f) => { const [[a, b], [c, d]] = geoBounds(f); return c > fw && a < fe && d > fs && b < fn; };
const context = src.features.filter((f) => !VILLAGES.includes(f.properties.NAME) && inFrame(f));

// Shoreline: the eastern edge of the land, sampled by latitude from every municipality in the frame.
const rings = (g) => (g.type === 'Polygon' ? g.coordinates : g.coordinates.flat());
const edges = [];
for (const f of [...pick, ...context]) for (const r of rings(f.geometry)) for (let i = 0; i < r.length - 1; i++) edges.push([r[i], r[i + 1]]);
const shore = [];
for (let lat = fs; lat <= fn + 1e-9; lat += (fn - fs) / 220) {
  let max = -Infinity;
  for (const [[x1, y1], [x2, y2]] of edges) {
    if ((y1 <= lat && y2 >= lat) || (y2 <= lat && y1 >= lat)) { const t = y2 === y1 ? 0 : (lat - y1) / (y2 - y1); max = Math.max(max, x1 + t * (x2 - x1)); }
  }
  if (max > -Infinity) shore.push([max, lat]);
}
// Light smoothing (moving average over 5 samples) so municipal seams do not read as coastline.
const sm = shore.map((p, i) => { const a = shore.slice(Math.max(0, i - 2), i + 3); return [a.reduce((t, q) => t + q[0], 0) / a.length, p[1]]; });
const pts = sm.map((p) => proj(p).map((v) => +v.toFixed(1)));
const shoreD = 'M' + pts.map((p) => p.join(',')).join('L');
const lakeD = shoreD + `L${W},0L${W},${H}Z`;

const mile = (() => { const y = (fs + fn) / 2; const a = proj([fw, y]), b = proj([fw + 1 / (69.172 * Math.cos((y * Math.PI) / 180)), y]); return +(b[0] - a[0]).toFixed(1); })();
const out = {
  source: 'U.S. Census Bureau, cartographic boundary file (places), 2022', width: W, height: H, mile,
  shore: shoreD, lake: lakeD,
  context: context.map((f) => path(f)).filter(Boolean).join(''),
  villages: VILLAGES.map((name) => { const f = pick.find((x) => x.properties.NAME === name); const c = path.centroid(f); const b = path.bounds(f);
    return { name, d: path(f), cx: +c[0].toFixed(1), cy: +c[1].toFixed(1), east: +b[1][0].toFixed(1), top: +b[0][1].toFixed(1), bottom: +b[1][1].toFixed(1) }; }),
};
writeFileSync(new URL('../src/data/shore.json', import.meta.url), JSON.stringify(out));
console.log(W + '×' + H, 'mile=' + mile + 'px', 'context places:', context.length, 'bytes:', JSON.stringify(out).length);
