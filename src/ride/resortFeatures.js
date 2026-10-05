import * as THREE from 'three';
import { createObstacleIndex, pointInRing } from './obstacles.js';
import { layoutLift } from './lifts.js';
import { buildCourses, gatesAlong } from './courses.js';
import { curateCourses } from './runs.js';
import { groom, shapeBoardercross } from './grooming.js';

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

const EMPTY = { pistes: [], pisteAreas: [], lifts: [], buildings: [], roads: [], forests: [], peaks: [] };

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

// Everything derived from features.json that the scene and the physics need.
export function prepareFeatures(resort, quality) {
  const { near } = resort;
  const f = { ...EMPTY, ...(resort.features ?? {}) };
  const obstacles = createObstacleIndex(16, 2);

  // ---- Mask texture: r = groomed piste, g = forest floor, b = road ----
  const W = 2048;
  const H = Math.round((W * near.depth) / near.width);
  const sc = W / near.width;
  const px = ([x, z]) => [(x - near.x0) * sc, (z - near.z0) * sc];
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);
  ctx.globalCompositeOperation = 'lighter';
  const path = (pts) => {
    ctx.beginPath();
    pts.forEach((p, i) => (i ? ctx.lineTo(...px(p)) : ctx.moveTo(...px(p))));
  };
  ctx.fillStyle = 'rgb(255,0,0)';
  for (const a of f.pisteAreas) {
    path(a.ring);
    ctx.fill();
  }
  ctx.strokeStyle = 'rgb(255,0,0)';
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 30 * sc;
  for (const p of f.pistes) {
    path(p.line);
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgb(0,0,255)';
  for (const r of f.roads) {
    ctx.lineWidth = (r.type === 'track' || r.type === 'service' ? 5 : 9) * sc;
    path(r.line);
    ctx.stroke();
  }
  const base = ctx.getImageData(0, 0, W, H).data;
  const maskAt = (x, z, channel) => {
    const i = Math.floor((x - near.x0) * sc);
    const j = Math.floor((z - near.z0) * sc);
    if (i < 0 || j < 0 || i >= W || j >= H) return 0;
    return base[(j * W + i) * 4 + channel];
  };
  const surfaceAt = (x, z) => (maskAt(x, z, 0) > 110 ? 'piste' : 'off');

  // Space taken by buildings and lift lines (no trees there).
  const occ = document.createElement('canvas');
  occ.width = W / 4;
  occ.height = H / 4;
  const octx = occ.getContext('2d', { willReadFrequently: true });
  octx.scale(0.25, 0.25);
  octx.fillStyle = octx.strokeStyle = '#fff';
  octx.lineCap = 'round';
  for (const b of f.buildings) {
    octx.beginPath();
    b.ring.forEach((p, i) => (i ? octx.lineTo(...px(p)) : octx.moveTo(...px(p))));
    octx.fill();
    octx.lineWidth = 14 * sc;
    octx.stroke();
  }
  octx.lineWidth = 18 * sc;
  for (const l of f.lifts) {
    octx.beginPath();
    l.line.forEach((p, i) => (i ? octx.lineTo(...px(p)) : octx.moveTo(...px(p))));
    octx.stroke();
  }
  const occData = octx.getImageData(0, 0, occ.width, occ.height).data;
  const occupied = (x, z) => {
    const i = Math.floor(((x - near.x0) * sc) / 4);
    const j = Math.floor(((z - near.z0) * sc) / 4);
    return occData[(j * occ.width + i) * 4] > 0;
  };

  // ---- The popular runs: curated courses, groomed snow, a shaped boardercross ----
  const courses = curateCourses(
    buildCourses(
      f.pistes.filter((p) => p.line.every(([x, z]) => near.inside(x, z, 40))),
      near.heightAt,
    ),
  );
  const groomed = groom(
    near,
    courses.filter((c) => !c.boardercross).map((c) => ({ line: c.line, width: c.width, difficulty: c.difficulty })),
  );
  for (const c of courses) {
    if (!c.boardercross) continue;
    c.line = shapeBoardercross(near, c.line, { width: c.width });
    c.gates = gatesAlong(c.line, 70);
  }

  // ---- Buildings ----
  const buildings = [];
  for (const b of f.buildings) {
    const ring = b.ring;
    if (ring.length < 4) continue;
    let gmin = Infinity;
    for (const [x, z] of ring) gmin = Math.min(gmin, near.heightAt(x, z));
    const height = b.height ?? (b.levels ? b.levels * 3 + 2.5 : 7);
    buildings.push({ ring, base: gmin - 2, top: gmin + height });
    obstacles.add({ ring });
  }

  // ---- Lifts ----
  // Lifts running off the baked map (towards Soldeu and Encamp) are left out.
  const lifts = f.lifts
    .filter((l) => l.line.length >= 2 && l.line.every(([x, z]) => near.inside(x, z, 40)))
    .map((l) => layoutLift(l, near.heightAt));
  for (const l of lifts) {
    if (l.kind === 'carpet') continue;
    for (const t of l.towers) obstacles.add({ x: t.x, z: t.z, r: t.end ? (l.kind === 'drag' ? 2 : 4) : 0.8 });
  }

  // ---- Trees (procedural; OSM has no forest mapped here) ----
  const trees = [];
  const rand = rng(1234);
  const n = [0, 1, 0];
  const maxTrees = Math.round(9000 * quality.trees);
  const spacing = 8;
  for (let z = near.z0 + 60; z < near.z0 + near.depth - 60 && trees.length < maxTrees; z += spacing) {
    for (let x = near.x0 + 60; x < near.x0 + near.width - 60 && trees.length < maxTrees; x += spacing) {
      const jx = x + (rand() - 0.5) * spacing;
      const jz = z + (rand() - 0.5) * spacing;
      const y = near.heightAt(jx, jz);
      const treeline = 2230 + 110 * valueNoise(jx * 0.002, jz * 0.002);
      if (y > treeline) continue;
      const cluster = valueNoise(jx * 0.006 + 31, jz * 0.006 + 7) * 0.7 + valueNoise(jx * 0.03, jz * 0.03) * 0.3;
      const edge = Math.min(1, (treeline - y) / 80);
      if (cluster < 0.52 - 0.12 * edge) continue;
      if (rand() > 0.55 * quality.trees + 0.2) continue;
      near.normalAt(jx, jz, n);
      if (n[1] < 0.82) continue; // too steep (~35°)
      if (maskAt(jx, jz, 0) > 20 || maskAt(jx, jz, 2) > 20 || occupied(jx, jz)) continue;
      const gi = Math.round((jx - near.x0) / near.cell);
      const gj = Math.round((jz - near.z0) / near.cell);
      if (groomed[gj * (near.cols + 1) + gi] > 0.02) continue; // inside a popular run's corridor
      const s = 0.75 + rand() * 0.6;
      trees.push({ x: jx, y, z: jz, s, rot: rand() * Math.PI * 2 });
      obstacles.add({ x: jx, z: jz, r: 0.35 * s });
    }
  }
  // Darken the snow under the trees a little.
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = 'rgba(0,140,0,1)';
  for (const t of trees) {
    ctx.beginPath();
    ctx.arc(...px([t.x, t.z]), 3.2 * t.s * sc, 0, Math.PI * 2);
    ctx.fill();
  }

  // ---- Piste markers on the popular runs: poles along both edges, every ~45 m ----
  const markers = [];
  for (const p of courses) {
    const color = p.boardercross ? '#ff7a1a' : DIFFICULTY_COLORS[p.difficulty] ?? DIFFICULTY_COLORS[''];
    const pts = p.line;
    const half = p.width / 2 + 1;
    let carry = 0;
    for (let i = 1; i < pts.length; i++) {
      const [ax, az] = pts[i - 1];
      const [bx, bz] = pts[i];
      const len = Math.hypot(bx - ax, bz - az);
      if (len < 1e-3) continue;
      const ux = (bx - ax) / len;
      const uz = (bz - az) / len;
      let d = carry;
      const every = p.boardercross ? 12 : 45;
      for (; d < len; d += every) {
        const cx = ax + ux * d;
        const cz = az + uz * d;
        for (const side of [-1, 1]) {
          const mx = cx - uz * half * side;
          const mz = cz + ux * half * side;
          markers.push({ x: mx, y: near.heightAt(mx, mz), z: mz, color });
        }
      }
      carry = d - len;
      if (p.boardercross) carry = Math.min(carry, 12);
    }
  }

  // ---- Which piste is here? (for the HUD) ----
  const CELL = 40;
  const grid = new Map();
  const cellKey = (i, j) => `${i},${j}`;
  const addTo = (i, j, item) => {
    const k = cellKey(i, j);
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k).push(item);
  };
  for (const p of f.pistes) {
    if (!p.name) continue;
    for (let i = 1; i < p.line.length; i++) {
      const [ax, az] = p.line[i - 1];
      const [bx, bz] = p.line[i];
      const seg = { p, ax, az, bx, bz };
      const i0 = Math.floor((Math.min(ax, bx) - 20) / CELL);
      const i1 = Math.floor((Math.max(ax, bx) + 20) / CELL);
      const j0 = Math.floor((Math.min(az, bz) - 20) / CELL);
      const j1 = Math.floor((Math.max(az, bz) + 20) / CELL);
      for (let ci = i0; ci <= i1; ci++) for (let cj = j0; cj <= j1; cj++) addTo(ci, cj, seg);
    }
  }
  for (const a of f.pisteAreas) {
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
    const area = { p: a, ring: a.ring };
    for (let ci = Math.floor(minX / CELL); ci <= Math.floor(maxX / CELL); ci++)
      for (let cj = Math.floor(minZ / CELL); cj <= Math.floor(maxZ / CELL); cj++) addTo(ci, cj, area);
  }
  function pisteAt(x, z) {
    const list = grid.get(cellKey(Math.floor(x / CELL), Math.floor(z / CELL)));
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
  }

  // ---- Where to start: the top of each popular run (reached by its lift), facing down the run ----
  const starts = courses.map((c) => {
    const g = c.gates[0];
    // Face along the run: many start with a traverse away from the lift, across the fall line.
    return {
      id: c.id,
      name: c.name,
      lift: c.lift,
      difficulty: c.difficulty,
      course: c,
      x: g.x,
      z: g.z,
      y: near.heightAt(g.x, g.z),
      heading: Math.atan2(g.dirX, g.dirZ),
    };
  });

  const furniture = placeFurniture(near, courses, lifts, obstacles);

  const texture = new THREE.CanvasTexture(canvas);
  texture.flipY = false;
  texture.colorSpace = THREE.NoColorSpace;
  texture.anisotropy = 4;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;

  return {
    mask: { texture, bounds: [near.x0, near.z0, near.width, near.depth] },
    surfaceAt,
    obstaclesNear: obstacles.near,
    buildings,
    lifts,
    trees,
    markers,
    furniture,
    pisteAt,
    starts,
    courses,
    pistes: f.pistes,
    pisteAreas: f.pisteAreas,
    peaks: f.peaks,
  };
}

// Things seen on Grandvalira's pistes in photos and videos: orange safety nets where the snow falls
// away beside the run, padded lift towers on the run, name signs at the top, and snow guns.
function placeFurniture(near, courses, lifts, obstacles) {
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
            nets.push({ x: ex, y: near.heightAt(ex, ez), z: ez, yaw: Math.atan2(ux, uz), len: STEP + 0.5 });
            const hx = ux * 6.2;
            const hz = uz * 6.2;
            const tx = rx * 0.2;
            const tz = rz * 0.2;
            obstacles.add({ ring: [[ex - hx - tx, ez - hz - tz], [ex + hx - tx, ez + hz - tz], [ex + hx + tx, ez + hz + tz], [ex - hx + tx, ez - hz + tz], [ex - hx - tx, ez - hz - tz]] });
          }
        }
        const gunEvery = 108;
        if ((c.difficulty === 'easy' || c.difficulty === 'intermediate') && at % gunEvery < STEP && at > 40) {
          gunSide = -gunSide;
          const gx = cx + rx * gunSide * (half + 3);
          const gz = cz + rz * gunSide * (half + 3);
          guns.push({ x: gx, y: near.heightAt(gx, gz), z: gz, yaw: Math.atan2(-rx * gunSide, -rz * gunSide) });
          obstacles.add({ x: gx, z: gz, r: 0.6 });
        }
      }
      along += len;
    }
    // Start sign on the right of the start gate, facing riders arriving from above.
    const g = c.gates[0];
    const sx = g.x - g.dirZ * (half + 2);
    const sz = g.z + g.dirX * (half + 2);
    signs.push({ x: sx, y: near.heightAt(sx, sz), z: sz, yaw: Math.atan2(-g.dirX, -g.dirZ), name: c.name, difficulty: c.difficulty, boardercross: Boolean(c.boardercross) });
  }
  // Pad the lift towers that stand on or right beside a popular run.
  for (const l of lifts) {
    if (l.kind === 'carpet') continue;
    for (const t of l.towers) {
      if (t.end) continue;
      const onRun = courses.some((c) => distanceToLine(t.x, t.z, c.line) < c.width / 2 + 5);
      if (onRun) pads.push({ x: t.x, y: t.y0, z: t.z });
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
