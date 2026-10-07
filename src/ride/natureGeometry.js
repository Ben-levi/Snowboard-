import * as THREE from 'three';

// Generated tree and boulder models (no downloads). Pure three.js geometry, testable in Node.

function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Linear colours.
const NEEDLES = [0.035, 0.085, 0.048];
const NEEDLES_DEEP = [0.03, 0.065, 0.04];
const SNOW = [0.82, 0.86, 0.92];
const BARK = [0.035, 0.022, 0.015];
const mixc = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

function builder() {
  const pos = [];
  const nor = [];
  const col = [];
  const idx = [];
  const vert = (p, n, c) => {
    pos.push(...p);
    const l = Math.hypot(...n) || 1;
    nor.push(n[0] / l, n[1] / l, n[2] / l);
    col.push(...c);
    return pos.length / 3 - 1;
  };
  const geometry = () => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeBoundingSphere();
    return g;
  };
  return { vert, idx, geometry };
}

// A snowy conifer: stacked skirts of drooping branches, each a star of branch tips around the trunk.
// Normals point out from the crown rather than along each facet, so the foliage reads soft, not faceted.
export function coniferGeometry({ seed = 1, tiers = 8, spokes = 9, height = 7.5, radius = 2.2, snow = 0.8, far = false } = {}) {
  const rand = seeded(seed);
  const b = builder();
  // Trunk (not on distant trees: hidden by the branches anyway).
  const trunkTop = height * 0.35;
  for (let s = 0; s < (far ? 0 : 6); s++) {
    const a0 = (s / 6) * Math.PI * 2;
    const a1 = ((s + 1) / 6) * Math.PI * 2;
    const q = [
      [Math.cos(a0) * 0.18, 0, Math.sin(a0) * 0.18],
      [Math.cos(a1) * 0.18, 0, Math.sin(a1) * 0.18],
      [Math.cos(a1) * 0.1, trunkTop, Math.sin(a1) * 0.1],
      [Math.cos(a0) * 0.1, trunkTop, Math.sin(a0) * 0.1],
    ].map((p) => b.vert(p, [p[0], 0, p[2]], BARK));
    b.idx.push(q[0], q[2], q[1], q[0], q[3], q[2]);
  }
  const start = height * 0.12;
  const step = (height - start) / (tiers + 0.6);
  for (let k = 0; k < tiers; k++) {
    const t = k / tiers;
    const bottom = start + k * step;
    const tierH = step * (2.1 - t * 0.6);
    const top = bottom + tierH;
    const R = radius * Math.pow(1 - t, 0.85) * (0.88 + rand() * 0.24) + 0.25;
    const turn = rand() * Math.PI;
    const n = far ? spokes : Math.max(6, Math.round(spokes * 1.4 * (1 - t * 0.45)));
    const apex = b.vert([0, top, 0], [0, 1, 0], mixc(NEEDLES, SNOW, snow * (0.75 - t * 0.25)));
    const deep = far ? NEEDLES : NEEDLES_DEEP;
    const under = b.vert([0, bottom + tierH * 0.25, 0], [0, -1, 0], deep);
    const ring = [];
    for (let s = 0; s < n * 2; s++) {
      const a = (s / (n * 2)) * Math.PI * 2 + turn;
      const tip = s % 2 === 0;
      const r = tip ? R * (0.85 + rand() * 0.28) : R * (0.66 + rand() * 0.1);
      const y = tip ? bottom - R * (0.1 + rand() * 0.15) : bottom + tierH * 0.12;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      // Snow lies on the inner, flatter part of each skirt; tips show their needles.
      const s1 = far ? snow * 0.5 : Math.max(0, Math.min(1, snow * (tip ? rand() * 0.3 : 0.25 + rand() * 0.55)));
      const top1 = b.vert([x, y, z], [x * 0.9, R * 1.1, z * 0.9], mixc(NEEDLES, SNOW, s1));
      const bot1 = b.vert([x, y, z], [x, -R * 0.4, z], deep);
      ring.push([top1, bot1]);
    }
    for (let s = 0; s < ring.length; s++) {
      const [ta, ba] = ring[s];
      const [tb, bb] = ring[(s + 1) % ring.length];
      b.idx.push(apex, tb, ta); // upper surface, facing out and up
      b.idx.push(under, ba, bb); // underside
    }
  }
  return b.geometry();
}

// A boulder: a lumpy, flattened icosahedron, faceted, with snow on whatever faces up.
export function rockGeometry(seed = 1) {
  const rand = seeded(seed);
  const base = new THREE.IcosahedronGeometry(1, 1);
  const p = base.attributes.position;
  const bumps = Array.from({ length: 6 }, () => [rand() * 2 - 1, rand() * 2 - 1, rand() * 2 - 1, 0.15 + rand() * 0.25]);
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).normalize();
    let r = 1;
    for (const [bx, by, bz, h] of bumps) r += h * Math.max(0, v.x * bx + v.y * by + v.z * bz) ** 3;
    r *= 0.9 + rand() * 0.15;
    p.setXYZ(i, v.x * r * 1.2, v.y * r * 0.7, v.z * r);
  }
  const g = base.toNonIndexed();
  base.dispose();
  g.computeVertexNormals();
  const n = g.attributes.normal;
  const cols = new Float32Array(n.count * 3);
  const grey = 0.08 + rand() * 0.06;
  for (let i = 0; i < n.count; i += 3) {
    // One colour per facet: snow caps on faces that look up, dark stone on the sides.
    const up = (n.getY(i) + n.getY(i + 1) + n.getY(i + 2)) / 3;
    const snowy = up > 0.62 ? 1 : up > 0.45 ? 0.5 : 0;
    const c = mixc([grey, grey * 0.95, grey * 0.9], SNOW, snowy);
    for (let k = 0; k < 3; k++) cols.set(c, (i + k) * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  return g;
}
