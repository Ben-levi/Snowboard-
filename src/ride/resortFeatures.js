import * as THREE from 'three';
import { createObstacleIndex, pointInRing } from './obstacles.js';
import { layoutLift } from './lifts.js';
import { buildCourses } from './courses.js';

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

  // ---- Piste markers: poles along both edges, every ~45 m ----
  const markers = [];
  for (const p of f.pistes) {
    const color = DIFFICULTY_COLORS[p.difficulty] ?? DIFFICULTY_COLORS[''];
    const pts = p.line;
    let carry = 0;
    for (let i = 1; i < pts.length; i++) {
      const [ax, az] = pts[i - 1];
      const [bx, bz] = pts[i];
      const len = Math.hypot(bx - ax, bz - az);
      if (len < 1e-3) continue;
      const ux = (bx - ax) / len;
      const uz = (bz - az) / len;
      let d = carry;
      for (; d < len; d += 45) {
        const cx = ax + ux * d;
        const cz = az + uz * d;
        for (const side of [-1, 1]) {
          const mx = cx - uz * 15 * side;
          const mz = cz + ux * 15 * side;
          // Skip poles that would stand inside a wider piste area.
          if (maskAt(mx - uz * 6 * side, mz + ux * 6 * side, 0) > 200) continue;
          markers.push({ x: mx, y: near.heightAt(mx, mz), z: mz, color });
        }
      }
      carry = d - len;
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

  // ---- Where to start: the top of each lift, facing the best way down ----
  const starts = lifts
    .filter((l) => l.kind !== 'carpet' && l.length > 200)
    .map((l) => {
      const top = l.towers.at(-1);
      const inbound = [top.dirX, top.dirZ];
      let best = null;
      for (let k = 0; k < 16; k++) {
        const a = (k / 16) * Math.PI * 2;
        const dx = Math.sin(a);
        const dz = Math.cos(a);
        if (dx * -inbound[0] + dz * -inbound[1] > 0.6) continue; // not back down the lift line
        const drop = top.y0 - near.heightAt(top.x + dx * 40, top.z + dz * 40);
        if (!best || drop > best.drop) best = { drop, dx, dz };
      }
      const r = l.kind === 'drag' ? 6 : 12;
      return {
        id: l.id,
        name: l.name || l.type,
        kind: l.kind,
        x: top.x + best.dx * r,
        z: top.z + best.dz * r,
        y: top.y0,
        heading: Math.atan2(best.dx, best.dz),
      };
    })
    .sort((a, b) => b.y - a.y);

  const courses = buildCourses(
    f.pistes.filter((p) => p.line.every(([x, z]) => near.inside(x, z, 40))),
    near.heightAt,
  );

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
    pisteAt,
    starts,
    courses,
    pistes: f.pistes,
    pisteAreas: f.pisteAreas,
    peaks: f.peaks,
  };
}
