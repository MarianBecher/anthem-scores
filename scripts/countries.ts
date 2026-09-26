// Derives from the game's Street View regions the set of countries a round
// can land in.
//
//   npm run countries
//
// Why not simply take the names of the boxes? The boxes are rough
// rectangles: "Germany" also contains parts of NL, BE, LU, FR, CH, AT, CZ,
// PL and DK, and Google's reverse geocoding then returns their country code.
// So we rasterize every box and check by point-in-polygon (Natural Earth
// 1:10m) which countries make up how much of the box's land area.
//
// Inclusion criteria (deliberately generous, a missing anthem is worse than
// a superfluous one):
//   - share >= MIN_SHARE of the land area of a box, or
//   - the country lies entirely inside the box (catches microstates such as
//     VA, SM, MC, LI, AD that would otherwise fall through the raster).
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { REGIONS } from './regions.ts';
import { fetchCached, ROOT } from './lib/cache.ts';
import type { Countries, Country } from './lib/countries.ts';

const NE_URL = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_0_countries.geojson';
const STEP_DEG = 0.1;
const MIN_SHARE = 0.005;

type Ring = Array<[number, number]>;
type Polygon = Ring[];
type BBox = [minX: number, minY: number, maxX: number, maxY: number];

interface Feature {
  properties: { ISO_A2: string; ISO_A2_EH: string; NAME: string };
  geometry: { type: 'Polygon'; coordinates: Polygon } | { type: 'MultiPolygon'; coordinates: Polygon[] };
}

function ringContains(ring: Ring, x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]!;
    const [xj, yj] = ring[j]!;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function polyContains(poly: Polygon, x: number, y: number): boolean {
  if (!ringContains(poly[0]!, x, y)) return false;
  for (let h = 1; h < poly.length; h++) if (ringContains(poly[h]!, x, y)) return false;
  return true;
}

function bboxOf(polys: Polygon[]): BBox {
  let b: BBox = [Infinity, Infinity, -Infinity, -Infinity];
  for (const p of polys) for (const [x, y] of p[0]!) b = [Math.min(b[0], x), Math.min(b[1], y), Math.max(b[2], x), Math.max(b[3], y)];
  return b;
}

// Natural Earth lists some countries with ISO_A2 = -99 (FR, NO, XK among
// others); ISO_A2_EH is the cleaned-up variant that matches Google's codes.
function isoOf(p: Feature['properties']): string | null {
  const c = p.ISO_A2_EH !== '-99' ? p.ISO_A2_EH : p.ISO_A2;
  return c === '-99' ? null : c;
}

const geo = JSON.parse((await fetchCached(NE_URL, { ext: '.geojson' })).toString('utf8')) as { features: Feature[] };
const shapes: Array<{ code: string; poly: Polygon; bbox: BBox }> = [];
const byCode = new Map<string, { name: string; polys: Polygon[] }>();
for (const f of geo.features) {
  const code = isoOf(f.properties);
  if (!code) continue;
  const g = f.geometry;
  const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
  // Every part polygon on its own with its bounding box, otherwise e.g.
  // France (with its overseas territories) would be tested for every point
  // of the world.
  for (const poly of polys) shapes.push({ code, poly, bbox: bboxOf([poly]) });
  let entry = byCode.get(code);
  if (!entry) byCode.set(code, (entry = { name: f.properties.NAME, polys: [] }));
  entry.polys.push(...polys);
}

const result = new Map<string, Country>();
function add(code: string, region: string, share: number): void {
  let c = result.get(code);
  if (!c) result.set(code, (c = { name: byCode.get(code)!.name, regions: [] }));
  c.regions.push({ region, share: Math.round(share * 1000) / 1000 });
}

for (const [minLat, minLng, maxLat, maxLng, , , region] of REGIONS) {
  const counts = new Map<string, number>();
  let land = 0;
  const cand = shapes.filter((s) => s.bbox[0] <= maxLng && s.bbox[2] >= minLng && s.bbox[1] <= maxLat && s.bbox[3] >= minLat);
  for (let y = minLat + STEP_DEG / 2; y < maxLat; y += STEP_DEG) {
    for (let x = minLng + STEP_DEG / 2; x < maxLng; x += STEP_DEG) {
      for (const s of cand) {
        if (x < s.bbox[0] || x > s.bbox[2] || y < s.bbox[1] || y > s.bbox[3]) continue;
        if (polyContains(s.poly, x, y)) {
          counts.set(s.code, (counts.get(s.code) ?? 0) + 1);
          land++;
          break;
        }
      }
    }
  }
  const seen = new Set<string>();
  for (const [code, n] of counts) {
    if (n / land >= MIN_SHARE) {
      add(code, region, n / land);
      seen.add(code);
    }
  }
  for (const [code, { polys }] of byCode) {
    if (seen.has(code)) continue;
    const b = bboxOf(polys);
    if (b[0] >= minLng && b[2] <= maxLng && b[1] >= minLat && b[3] <= maxLat) add(code, region, (counts.get(code) ?? 0) / land);
  }
}

const out: Countries = Object.fromEntries([...result.entries()].sort(([a], [b]) => a.localeCompare(b)));
writeFileSync(join(ROOT, 'countries.json'), JSON.stringify(out, null, 2) + '\n');
console.log(`${result.size} countries -> countries.json`);
