#!/usr/bin/env node
// Bakes a real ski resort into static files for the ride page (public/resort/<id>/):
//   height.bin  near terrain, Uint16 heights on a (cols+1) x (rows+1) grid (metres = base + v * scale)
//   far.bin     a wide, coarse grid for the horizon
//   meta.json   grid sizes, height encoding, origin
//   features.json  pistes, lifts, forests, buildings, roads, peaks from OpenStreetMap (local metres)
//
// Elevation: AWS Terrain Tiles (Terrarium PNG). OSM: Overpass API.
// Usage: node tools/resort/bake.mjs pas-de-la-casa [--skip-osm] [--skip-terrain]
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import { gridSpec, HEIGHT_SCALE, makeProjection, mercatorPixel } from '../../src/ride/geo.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2);
const id = args.find((a) => !a.startsWith('--')) ?? 'pas-de-la-casa';
const flag = (f) => args.includes(f);
const config = JSON.parse(await readFile(join(root, 'tools/resort/resorts', `${id}.json`), 'utf8'));
const outDir = join(root, 'public/resort', id);
await mkdir(outDir, { recursive: true });
const proj = makeProjection(config.center);

async function fetchRetry(url, init, tries = 4) {
  for (let i = 0; ; i++) {
    try {
      const res = await fetch(url, init);
      if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
      return res;
    } catch (e) {
      if (i >= tries - 1) throw e;
      await new Promise((r) => setTimeout(r, 2000 * 2 ** i));
    }
  }
}

// ---------- Elevation ----------
const tileCache = new Map();
async function terrariumTile(z, x, y) {
  const key = `${z}/${x}/${y}`;
  if (!tileCache.has(key)) {
    tileCache.set(
      key,
      (async () => {
        const res = await fetchRetry(`https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${key}.png`);
        const png = PNG.sync.read(Buffer.from(await res.arrayBuffer()));
        const h = new Float32Array(256 * 256);
        for (let i = 0; i < h.length; i++) {
          const d = png.data;
          h[i] = d[i * 4] * 256 + d[i * 4 + 1] + d[i * 4 + 2] / 256 - 32768;
        }
        return h;
      })(),
    );
  }
  return tileCache.get(key);
}

// Sample a grid of local points, bilinear in Mercator pixel space.
async function bakeGrid(spec, zoom) {
  const { cols, rows, cell, x0, z0 } = spec;
  const pts = [];
  const tiles = new Set();
  for (let j = 0; j <= rows; j++) {
    for (let i = 0; i <= cols; i++) {
      const [lon, lat] = proj.toLonLat(x0 + i * cell, z0 + j * cell);
      const [px, py] = mercatorPixel(lon, lat, zoom);
      pts.push(px - 0.5, py - 0.5);
      for (const tx of [Math.floor((px - 1) / 256), Math.floor((px + 1) / 256)])
        for (const ty of [Math.floor((py - 1) / 256), Math.floor((py + 1) / 256)]) tiles.add(`${tx},${ty}`);
    }
  }
  console.log(`  ${tiles.size} tiles at z${zoom}`);
  const loaded = new Map();
  const list = [...tiles];
  for (let k = 0; k < list.length; k += 8) {
    await Promise.all(
      list.slice(k, k + 8).map(async (t) => {
        const [tx, ty] = t.split(',').map(Number);
        loaded.set(t, await terrariumTile(zoom, tx, ty));
      }),
    );
  }
  const at = (gx, gy) => loaded.get(`${Math.floor(gx / 256)},${Math.floor(gy / 256)}`)[(gy & 255) * 256 + (gx & 255)];
  const heights = new Float32Array((cols + 1) * (rows + 1));
  for (let n = 0; n < heights.length; n++) {
    const px = pts[n * 2];
    const py = pts[n * 2 + 1];
    const gx = Math.floor(px);
    const gy = Math.floor(py);
    const fx = px - gx;
    const fy = py - gy;
    heights[n] =
      at(gx, gy) * (1 - fx) * (1 - fy) + at(gx + 1, gy) * fx * (1 - fy) + at(gx, gy + 1) * (1 - fx) * fy + at(gx + 1, gy + 1) * fx * fy;
  }
  return heights;
}

// Snow and the coarse source data both call for soft terrain: a few separable box-blur passes
// (≈ gaussian) remove the resampling stair-steps and small DEM pits.
function smooth({ cols, rows }, heights, passes) {
  const w = cols + 1;
  const h = rows + 1;
  let src = heights;
  let tmp = new Float32Array(src.length);
  for (let p = 0; p < passes; p++) {
    for (let j = 0; j < h; j++)
      for (let i = 0; i < w; i++) {
        const a = src[j * w + Math.max(0, i - 1)];
        const c = src[j * w + Math.min(w - 1, i + 1)];
        tmp[j * w + i] = (a + src[j * w + i] + c) / 3;
      }
    for (let j = 0; j < h; j++)
      for (let i = 0; i < w; i++) {
        const a = tmp[Math.max(0, j - 1) * w + i];
        const c = tmp[Math.min(h - 1, j + 1) * w + i];
        src[j * w + i] = (a + tmp[j * w + i] + c) / 3;
      }
  }
  return src;
}

function encode(heights) {
  let min = Infinity;
  let max = -Infinity;
  for (const h of heights) {
    if (h < min) min = h;
    if (h > max) max = h;
  }
  const base = Math.floor(min);
  const out = new Uint16Array(heights.length);
  for (let i = 0; i < heights.length; i++) out[i] = Math.round((heights[i] - base) / HEIGHT_SCALE);
  return { out, base, min, max };
}

async function bakeTerrain() {
  const near = gridSpec(config);
  console.log(`Near terrain ${near.cols}x${near.rows} @ ${near.cell} m (${(near.width / 1000).toFixed(1)} x ${(near.depth / 1000).toFixed(1)} km)`);
  const nearEnc = encode(smooth(near, await bakeGrid(near, config.zoom), config.smooth ?? 3));
  const f = config.far;
  const far = gridSpec({ cols: f.grid, rows: f.grid, cell: f.size / f.grid });
  console.log(`Far terrain ${far.cols}x${far.rows} @ ${far.cell.toFixed(0)} m`);
  const farEnc = encode(await bakeGrid(far, f.zoom));
  await writeFile(join(outDir, 'height.bin'), Buffer.from(nearEnc.out.buffer));
  await writeFile(join(outDir, 'far.bin'), Buffer.from(farEnc.out.buffer));
  const meta = {
    id: config.id,
    name: config.name,
    region: config.region,
    center: config.center,
    scale: HEIGHT_SCALE,
    near: { cols: near.cols, rows: near.rows, cell: near.cell, base: nearEnc.base, min: nearEnc.min, max: nearEnc.max },
    far: { cols: far.cols, rows: far.rows, cell: far.cell, base: farEnc.base, min: farEnc.min, max: farEnc.max },
  };
  await writeFile(join(outDir, 'meta.json'), JSON.stringify(meta, null, 2));
  console.log(`  near ${nearEnc.min.toFixed(0)}–${nearEnc.max.toFixed(0)} m, far ${farEnc.min.toFixed(0)}–${farEnc.max.toFixed(0)} m`);
}

// ---------- OpenStreetMap ----------
const OVERPASS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];

function simplify(pts, tol) {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const [ax, az] = pts[a];
    const [bx, bz] = pts[b];
    const dx = bx - ax;
    const dz = bz - az;
    const len = Math.hypot(dx, dz) || 1;
    let best = -1;
    let bestD = tol;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs((pts[i][0] - ax) * dz - (pts[i][1] - az) * dx) / len;
      if (d > bestD) {
        bestD = d;
        best = i;
      }
    }
    if (best > 0) {
      keep[best] = 1;
      stack.push([a, best], [best, b]);
    }
  }
  return pts.filter((_, i) => keep[i]);
}

async function bakeOsm() {
  const spec = gridSpec(config);
  const pad = 200;
  const [w, n] = proj.toLonLat(spec.x0 - pad, spec.z0 - pad);
  const [e, s] = proj.toLonLat(spec.x0 + spec.width + pad, spec.z0 + spec.depth + pad);
  const bb = `${s},${w},${n},${e}`;
  const query = `[out:json][timeout:180];
(
  way["piste:type"="downhill"](${bb});
  relation["piste:type"="downhill"](${bb});
  way["aerialway"](${bb});
  way["natural"="wood"](${bb});
  way["landuse"="forest"](${bb});
  relation["natural"="wood"](${bb});
  relation["landuse"="forest"](${bb});
  way["building"](${bb});
  way["highway"~"^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|service|track)$"](${bb});
  node["natural"="peak"](${bb});
);
out geom tags;`;
  let data;
  for (const url of OVERPASS) {
    try {
      console.log(`Overpass: ${url}`);
      const res = await fetchRetry(url, { method: 'POST', body: new URLSearchParams({ data: query }) }, 3);
      data = await res.json();
      break;
    } catch (e) {
      console.warn(`  failed: ${e.message}`);
    }
  }
  if (!data) throw new Error('All Overpass endpoints failed');

  const local = (geom) => geom.filter(Boolean).map((p) => proj.toLocal(p.lon, p.lat).map((v) => Math.round(v * 10) / 10));
  const line = (geom, tol = 1.5) => simplify(local(geom), tol);
  const closed = (pts) => pts.length > 3 && pts[0][0] === pts.at(-1)[0] && pts[0][1] === pts.at(-1)[1];
  const outerRings = (rel) => rel.members.filter((m) => m.type === 'way' && m.role !== 'inner' && m.geometry).map((m) => line(m.geometry, 3));

  const out = { pistes: [], pisteAreas: [], pisteRoutes: [], lifts: [], forests: [], buildings: [], roads: [], peaks: [] };
  for (const el of data.elements) {
    const t = el.tags ?? {};
    if (el.type === 'node' && t.natural === 'peak') {
      const [x, z] = proj.toLocal(el.lon, el.lat);
      out.peaks.push({ name: t.name ?? '', ele: Number(t.ele) || null, x: Math.round(x), z: Math.round(z) });
    } else if (t['piste:type'] === 'downhill') {
      const info = {
        id: `${el.type[0]}${el.id}`,
        name: t['piste:name'] ?? t.name ?? '',
        ref: t['piste:ref'] ?? t.ref ?? '',
        difficulty: t['piste:difficulty'] ?? '',
        grooming: t['piste:grooming'] ?? '',
      };
      if (el.type === 'relation') {
        const parts = el.members.filter((m) => m.type === 'way' && m.geometry).map((m) => line(m.geometry));
        if (parts.length) out.pisteRoutes.push({ ...info, parts });
      } else if (el.geometry) {
        const pts = line(el.geometry);
        if (t.area === 'yes' || (closed(pts) && t.area !== 'no')) out.pisteAreas.push({ ...info, ring: pts });
        else out.pistes.push({ ...info, line: pts });
      }
    } else if (t.aerialway && el.geometry && !['station', 'pylon', 'goods', 'zip_line'].includes(t.aerialway)) {
      out.lifts.push({ id: `w${el.id}`, name: t.name ?? '', type: t.aerialway, line: local(el.geometry) });
    } else if (t.natural === 'wood' || t.landuse === 'forest') {
      const rings = el.type === 'relation' ? outerRings(el) : el.geometry ? [line(el.geometry, 3)] : [];
      for (const ring of rings) if (ring.length > 3) out.forests.push(ring);
    } else if (t.building && el.geometry) {
      const levels = Number(t['building:levels']) || null;
      const height = parseFloat(t.height) || null;
      out.buildings.push({ ring: line(el.geometry, 0.5), levels, height });
    } else if (t.highway && el.geometry) {
      out.roads.push({ type: t.highway, line: line(el.geometry, 2) });
    }
  }
  out.attribution = '© OpenStreetMap contributors (ODbL)';
  await writeFile(join(outDir, 'features.json'), JSON.stringify(out));
  console.log(
    `OSM: ${out.pistes.length} piste lines, ${out.pisteAreas.length} piste areas, ${out.pisteRoutes.length} piste routes, ` +
      `${out.lifts.length} lifts, ${out.forests.length} forests, ${out.buildings.length} buildings, ${out.roads.length} roads, ${out.peaks.length} peaks`,
  );
}

if (!flag('--skip-terrain')) await bakeTerrain();
if (!flag('--skip-osm')) await bakeOsm();
