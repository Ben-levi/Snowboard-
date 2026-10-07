// Everything about the resort that never changes between visits: the popular runs, groomed snow,
// the piste mask, trees, poles and piste furniture. Pure functions (no DOM, no three.js) so it runs
// at build time (tools/resort/prepare.mjs) and phones only download the result.
import { createObstacleIndex, pointInRing } from './obstacles.js';
import { layoutLift } from './lifts.js';
import { buildCourses, gatesAlong } from './courses.js';
import { curateCourses } from './runs.js';
import { groom, shapeBoardercross } from './grooming.js';
import { addDisc, createRaster, fillPolygon, sample, strokeLine } from './raster.js';

// European piste colours (Grandvalira uses green, blue, red and black).
export const DIFFICULTY_COLORS = {
  novice: '#2fbf4f',
  easy: '#2f7cf6',
  intermediate: '#e03131',
  advanced: '#16181c',
  expert: '#16181c',
  freeride: '#f08c00',
  '': '#2f7cf6',
};
export const BX_COLOR = '#ff7a1a';

export const EMPTY_FEATURES = { pistes: [], pisteAreas: [], lifts: [], buildings: [], roads: [], forests: [], peaks: [] };
export const MASK_WIDTH = 2048;

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash2(i, j) {
  const h = Math.sin(i * 127.1 + j * 311.7) * 43758.5453;
  return h - Math.floor(h);
}

function valueNoise(x, z) {
  const i = Math.floor(x);
  const j = Math.floor(z);
  const fx = x - i;
  const fz = z - j;
  const u = fx * fx * (3 - 2 * fx);
  const v = fz * fz * (3 - 2 * fz);
  const a = hash2(i, j);
  const b = hash2(i + 1, j);
  const c = hash2(i, j + 1);
  const d = hash2(i + 1, j + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

const inMap = (near, line) => line.every(([x, z]) => near.inside(x, z, 40));

// ---------------- Build time ----------------

// Grooms `near` in place and returns the static world. features: the baked OSM features.json.
export function prepareWorld(near, features) {
  const f = { ...EMPTY_FEATURES, ...(features ?? {}) };

  // Piste mask: r = pistes (all of them, as background groomed snow), b = roads, g = shade under trees.
  const W = MASK_WIDTH;
  const H = Math.round((W * near.depth) / near.width);
  const sc = W / near.width;
  const px = ([x, z]) => [(x - near.x0) * sc, (z - near.z0) * sc];
  const mask = createRaster(W, H);
  for (const a of f.pisteAreas) fillPolygon(mask, a.ring.map(px), 0);
  for (const p of f.pistes) strokeLine(mask, p.line.map(px), 30 * sc, 0);
  for (const r of f.roads) strokeLine(mask, r.line.map(px), (r.type === 'track' || r.type === 'service' ? 5 : 9) * sc, 2);
  const maskAt = (x, z, ch) => sample(mask, Math.floor((x - near.x0) * sc), Math.floor((z - near.z0) * sc), ch);

  // Room taken by buildings and lift lines (no trees there), at a quarter of the mask resolution.
  const occ = createRaster(Math.ceil(W / 4), Math.ceil(H / 4));
  const opx = (p) => px(p).map((v) => v / 4);
  for (const b of f.buildings) {
    fillPolygon(occ, b.ring.map(opx), 0);
    strokeLine(occ, b.ring.map(opx), (14 * sc) / 4, 0);
  }
  for (const l of f.lifts) strokeLine(occ, l.line.map(opx), (18 * sc) / 4, 0);
  const occupied = (x, z) => sample(occ, Math.floor(((x - near.x0) * sc) / 4), Math.floor(((z - near.z0) * sc) / 4), 0) > 0;

  // The popular runs: curated courses, groomed snow, a shaped boardercross.
  const courses = curateCourses(buildCourses(f.pistes.filter((p) => inMap(near, p.line)), near.heightAt));
  const groomed = groom(
    near,
    courses.filter((c) => !c.boardercross).map((c) => ({ line: c.line, width: c.width, difficulty: c.difficulty })),
  );
  for (const c of courses) {
    if (!c.boardercross) continue;
    c.line = shapeBoardercross(near, c.line, { width: c.width });
    c.gates = gatesAlong(c.line, 70);
  }

  // Trees (procedural; OSM has no forest mapped here). `keep` lets lighter presets use a subset.
  const trees = [];
  const rand = rng(1234);
  const n = [0, 1, 0];
  const spacing = 8;
  for (let z = near.z0 + 60; z < near.z0 + near.depth - 60 && trees.length < 9000; z += spacing) {
    for (let x = near.x0 + 60; x < near.x0 + near.width - 60 && trees.length < 9000; x += spacing) {
      const jx = x + (rand() - 0.5) * spacing;
      const jz = z + (rand() - 0.5) * spacing;
      const y = near.heightAt(jx, jz);
      const treeline = 2230 + 110 * valueNoise(jx * 0.002, jz * 0.002);
      if (y > treeline) continue;
      const cluster = valueNoise(jx * 0.006 + 31, jz * 0.006 + 7) * 0.7 + valueNoise(jx * 0.03, jz * 0.03) * 0.3;
      const edge = Math.min(1, (treeline - y) / 80);
      if (cluster < 0.52 - 0.12 * edge) continue;
      const keep = rand();
      if (keep > 0.75) continue;
      near.normalAt(jx, jz, n);
      if (n[1] < 0.82) continue; // too steep (~35°)
      if (maskAt(jx, jz, 0) > 20 || maskAt(jx, jz, 2) > 20 || occupied(jx, jz)) continue;
      const gi = Math.round((jx - near.x0) / near.cell);
      const gj = Math.round((jz - near.z0) / near.cell);
      if (groomed[gj * (near.cols + 1) + gi] > 0.02) continue; // inside a popular run's corridor
      trees.push({ x: jx, z: jz, s: 0.75 + rand() * 0.6, rot: rand() * Math.PI * 2, keep: keep / 0.75 });
    }
  }
  for (const t of trees) addDisc(mask, ...px([t.x, t.z]), 3.2 * t.s * sc, 1, 140);

  // Piste poles on the popular runs, along both edges.
  const markers = [];
  for (const p of courses) {
    const color = p.boardercross ? BX_COLOR : DIFFICULTY_COLORS[p.difficulty] ?? DIFFICULTY_COLORS[''];
    const half = p.width / 2 + 1;
    const every = p.boardercross ? 12 : 45;
    let carry = 0;
    for (let i = 1; i < p.line.length; i++) {
      const [ax, az] = p.line[i - 1];
      const [bx, bz] = p.line[i];
      const len = Math.hypot(bx - ax, bz - az);
      if (len < 1e-3) continue;
      const ux = (bx - ax) / len;
      const uz = (bz - az) / len;
      let d = carry;
      for (; d < len; d += every) {
        const cx = ax + ux * d;
        const cz = az + uz * d;
        for (const side of [-1, 1]) markers.push({ x: cx - uz * half * side, z: cz + ux * half * side, color });
      }
      carry = Math.min(d - len, every);
    }
  }

  const lifts = layoutLifts(near, f);
  const furniture = placeFurniture(near, courses, lifts);
  return { courses, trees, markers, furniture, mask };
}

// Orange nets where the snow drops away beside a run, padded towers on the runs, start signs, snow guns.
function placeFurniture(near, courses, lifts) {
  const nets = [];
  const pads = [];
  const signs = [];
  const guns = [];
  const STEP = 12;
  for (const c of courses) {
    const half = c.width / 2;
    let along = 0;
    let gunSide = 1;
    for (let s = 1; s < c.line.length; s++) {
      const [ax, az] = c.line[s - 1];
      const [bx, bz] = c.line[s];
      const len = Math.hypot(bx - ax, bz - az);
      if (len < 1e-3) continue;
      const ux = (bx - ax) / len;
      const uz = (bz - az) / len;
      const rx = -uz; // right of travel
      const rz = ux;
      for (let d = (STEP - (along % STEP)) % STEP; d < len; d += STEP) {
        const cx = ax + ux * d;
        const cz = az + uz * d;
        const at = along + d;
        if (!c.boardercross && at > 30 && at < c.length - 30) {
          for (const side of [-1, 1]) {
            const ex = cx + rx * side * (half + 1.5);
            const ez = cz + rz * side * (half + 1.5);
            const fall = near.heightAt(ex, ez) - near.heightAt(ex + rx * side * 10, ez + rz * side * 10);
            if (fall < 3.5) continue; // the snow beside the run doesn't drop away here
            nets.push({ x: ex, z: ez, yaw: Math.atan2(ux, uz), len: STEP + 0.5 });
          }
        }
        if ((c.difficulty === 'easy' || c.difficulty === 'intermediate') && at % 108 < STEP && at > 40) {
          gunSide = -gunSide;
          const gx = cx + rx * gunSide * (half + 3);
          const gz = cz + rz * gunSide * (half + 3);
          guns.push({ x: gx, z: gz, yaw: Math.atan2(-rx * gunSide, -rz * gunSide) });
        }
      }
      along += len;
    }
    const g = c.gates[0];
    const sx = g.x - g.dirZ * (half + 2);
    const sz = g.z + g.dirX * (half + 2);
    signs.push({ x: sx, z: sz, yaw: Math.atan2(-g.dirX, -g.dirZ), name: c.name, difficulty: c.difficulty, boardercross: Boolean(c.boardercross) });
  }
  for (const l of lifts) {
    if (l.kind === 'carpet') continue;
    for (const t of l.towers) {
      if (!t.end && courses.some((c) => distanceToLine(t.x, t.z, c.line) < c.width / 2 + 5)) pads.push({ x: t.x, z: t.z });
    }
  }
  return { nets, pads, signs, guns };
}

function distanceToLine(x, z, line) {
  let best = Infinity;
  for (let s = 1; s < line.length; s++) {
    const [ax, az] = line[s - 1];
    const [bx, bz] = line[s];
    const dx = bx - ax;
    const dz = bz - az;
    const l2 = dx * dx + dz * dz || 1;
    const t = Math.min(1, Math.max(0, ((x - ax) * dx + (z - az) * dz) / l2));
    best = Math.min(best, Math.hypot(x - (ax + t * dx), z - (az + t * dz)));
  }
  return best;
}

// ---------------- Shared by build time and the browser (cheap) ----------------

// Lifts running off the baked map (towards Soldeu and Encamp) are left out.
export function layoutLifts(near, features) {
  return (features?.lifts ?? [])
    .filter((l) => l.line.length >= 2 && inMap(near, l.line))
    .map((l) => layoutLift(l, near.heightAt));
}

export function layoutBuildings(near, features) {
  const out = [];
  for (const b of features?.buildings ?? []) {
    if (b.ring.length < 4) continue;
    let gmin = Infinity;
    for (const [x, z] of b.ring) gmin = Math.min(gmin, near.heightAt(x, z));
    const height = b.height ?? (b.levels ? b.levels * 3 + 2.5 : 7);
    out.push({ ring: b.ring, base: gmin - 2, top: gmin + height });
  }
  return out;
}

// Everything the rider can hit.
export function buildObstacles({ buildings, lifts, trees, furniture }) {
  const index = createObstacleIndex(16, 2);
  for (const b of buildings) index.add({ ring: b.ring });
  for (const l of lifts) {
    if (l.kind === 'carpet') continue;
    for (const t of l.towers) index.add({ x: t.x, z: t.z, r: t.end ? (l.kind === 'drag' ? 2 : 4) : 0.8 });
  }
  for (const t of trees) index.add({ x: t.x, z: t.z, r: 0.35 * t.s });
  for (const n of furniture.nets) {
    const hx = Math.sin(n.yaw) * 6.2;
    const hz = Math.cos(n.yaw) * 6.2;
    const tx = Math.cos(n.yaw) * 0.2; // across the net (right of travel)
    const tz = -Math.sin(n.yaw) * 0.2;
    index.add({
      ring: [
        [n.x - hx - tx, n.z - hz - tz],
        [n.x + hx - tx, n.z + hz - tz],
        [n.x + hx + tx, n.z + hz + tz],
        [n.x - hx + tx, n.z - hz + tz],
        [n.x - hx - tx, n.z - hz - tz],
      ],
    });
  }
  for (const g of furniture.guns) index.add({ x: g.x, z: g.z, r: 0.6 });
  return index;
}

// Which named piste is at (x, z)? (HUD label, groomed-snow friction.)
export function pisteLookup(features) {
  const CELL = 40;
  const grid = new Map();
  const key = (i, j) => `${i},${j}`;
  const addTo = (i, j, item) => {
    const k = key(i, j);
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k).push(item);
  };
  for (const p of features?.pistes ?? []) {
    if (!p.name) continue;
    for (let i = 1; i < p.line.length; i++) {
      const [ax, az] = p.line[i - 1];
      const [bx, bz] = p.line[i];
      const seg = { p, ax, az, bx, bz };
      for (let ci = Math.floor((Math.min(ax, bx) - 20) / CELL); ci <= Math.floor((Math.max(ax, bx) + 20) / CELL); ci++)
        for (let cj = Math.floor((Math.min(az, bz) - 20) / CELL); cj <= Math.floor((Math.max(az, bz) + 20) / CELL); cj++) addTo(ci, cj, seg);
    }
  }
  for (const a of features?.pisteAreas ?? []) {
    if (!a.name) continue;
    let minX = Infinity;
    let minZ = Infinity;
    let maxX = -Infinity;
    let maxZ = -Infinity;
    for (const [x, z] of a.ring) {
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minZ = Math.min(minZ, z);
      maxZ = Math.max(maxZ, z);
    }
    for (let ci = Math.floor(minX / CELL); ci <= Math.floor(maxX / CELL); ci++)
      for (let cj = Math.floor(minZ / CELL); cj <= Math.floor(maxZ / CELL); cj++) addTo(ci, cj, { p: a, ring: a.ring });
  }
  return (x, z) => {
    const list = grid.get(key(Math.floor(x / CELL), Math.floor(z / CELL)));
    if (!list) return null;
    let best = null;
    let bestD = 18;
    for (const it of list) {
      if (it.ring) {
        if (!best && pointInRing(x, z, it.ring)) best = it.p;
        continue;
      }
      const dx = it.bx - it.ax;
      const dz = it.bz - it.az;
      const l2 = dx * dx + dz * dz || 1;
      const t = Math.min(1, Math.max(0, ((x - it.ax) * dx + (z - it.az) * dz) / l2));
      const d = Math.hypot(x - (it.ax + t * dx), z - (it.az + t * dz));
      if (d < bestD) {
        bestD = d;
        best = it.p;
      }
    }
    return best;
  };
}

// Start of each popular run, facing along it (many start with a traverse away from the lift).
export function courseStarts(near, courses) {
  return courses.map((c) => {
    const g = c.gates[0];
    return { id: c.id, name: c.name, lift: c.lift, difficulty: c.difficulty, course: c, x: g.x, z: g.z, y: near.heightAt(g.x, g.z), heading: Math.atan2(g.dirX, g.dirZ) };
  });
}

// ---------------- world.json ----------------

const r1 = (v) => Math.round(v * 10) / 10;
const r3 = (v) => Math.round(v * 1000) / 1000;

export function serializeWorld({ courses, trees, markers, furniture }, pars) {
  const colors = [...new Set(markers.map((m) => m.color))];
  return {
    version: 1,
    courses: courses.map((c) => ({
      ...c,
      line: c.line.map(([x, z]) => [r1(x), r1(z)]),
      gates: c.gates.map((g) => ({ x: r1(g.x), z: r1(g.z), dirX: r3(g.dirX), dirZ: r3(g.dirZ), d: r1(g.d) })),
      length: r1(c.length),
      drop: r1(c.drop),
      par: pars?.[c.id] ?? null,
    })),
    // Flat arrays keep the file small: trees [x, z, scale, rotation, keep], markers [x, z, colour index].
    trees: trees.flatMap((t) => [r1(t.x), r1(t.z), r3(t.s), r3(t.rot), r3(t.keep)]),
    colors,
    markers: markers.flatMap((m) => [r1(m.x), r1(m.z), colors.indexOf(m.color)]),
    nets: furniture.nets.flatMap((n) => [r1(n.x), r1(n.z), r3(n.yaw), r1(n.len)]),
    pads: furniture.pads.flatMap((p) => [r1(p.x), r1(p.z)]),
    guns: furniture.guns.flatMap((g) => [r1(g.x), r1(g.z), r3(g.yaw)]),
    signs: furniture.signs.map((s) => ({ ...s, x: r1(s.x), z: r1(s.z), yaw: r3(s.yaw) })),
  };
}

const chunk = (arr, n, fn) => {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(fn(arr.slice(i, i + n)));
  return out;
};

// Back from world.json, with heights from the (groomed) terrain. `share` of the trees are kept
// (the bake places the densest set; lighter presets show fewer).
export function parseWorld(json, near, share = 1) {
  const courses = json.courses;
  const trees = chunk(json.trees, 5, ([x, z, s, rot, keep]) => ({ x, z, s, rot, keep, y: near.heightAt(x, z) })).filter((t) => t.keep <= share);
  const markers = chunk(json.markers, 3, ([x, z, c]) => ({ x, z, y: near.heightAt(x, z), color: json.colors[c] }));
  const furniture = {
    nets: chunk(json.nets, 4, ([x, z, yaw, len]) => ({ x, z, yaw, len, y: near.heightAt(x, z) })),
    pads: chunk(json.pads, 2, ([x, z]) => ({ x, z, y: near.heightAt(x, z) })),
    guns: chunk(json.guns, 3, ([x, z, yaw]) => ({ x, z, yaw, y: near.heightAt(x, z) })),
    signs: json.signs.map((s) => ({ ...s, y: near.heightAt(s.x, s.z) })),
  };
  return { courses, trees, markers, furniture };
}
