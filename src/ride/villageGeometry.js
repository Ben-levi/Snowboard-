// Pas de la Casa's buildings from their OpenStreetMap footprints: walls with a facade (windows are
// drawn by the material from per-vertex metres), pitched snowy roofs on the roughly rectangular
// ones, flat snowy roofs with a parapet on the rest, and wooden balconies on many.
// Pure geometry (arrays), so it can be tested without a GPU.

// Linear colours.
const WALLS = [
  [0.42, 0.38, 0.32], // warm render
  [0.55, 0.5, 0.42], // cream
  [0.3, 0.27, 0.23], // grey-brown stone
  [0.47, 0.33, 0.2], // ochre
  [0.36, 0.36, 0.37], // grey render
  [0.25, 0.16, 0.1], // dark timber
];
const SNOW = [0.8, 0.84, 0.9];
const SLATE = [0.035, 0.035, 0.04];
const WOOD = [0.12, 0.065, 0.035];

function rand(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a * 1664525 + 1013904223) >>> 0;
    return a / 4294967296;
  };
}

const area = (ring) => {
  let s = 0;
  for (let i = 0; i < ring.length; i++) {
    const [ax, az] = ring[i];
    const [bx, bz] = ring[(i + 1) % ring.length];
    s += ax * bz - bx * az;
  }
  return s / 2;
};

function inside(ring, x, z) {
  let c = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, zi] = ring[i];
    const [xj, zj] = ring[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c;
  }
  return c;
}

// Whether (dz, −dx) of the ring's edges points out of it (checked on its longest edge).
export function outwardIsRight(ring) {
  let best = 0;
  let k = 0;
  for (let i = 0; i < ring.length; i++) {
    const [ax, az] = ring[i];
    const [bx, bz] = ring[(i + 1) % ring.length];
    const l = Math.hypot(bx - ax, bz - az);
    if (l > best) [best, k] = [l, i];
  }
  const [ax, az] = ring[k];
  const [bx, bz] = ring[(k + 1) % ring.length];
  const nx = (bz - az) / best;
  const nz = -(bx - ax) / best;
  return !inside(ring, (ax + bx) / 2 + nx * 0.05, (az + bz) / 2 + nz * 0.05);
}

// Smallest rectangle around the points (tried along each edge's direction).
export function orientedBox(ring) {
  let best = null;
  for (let i = 0; i < ring.length; i++) {
    const [ax, az] = ring[i];
    const [bx, bz] = ring[(i + 1) % ring.length];
    const len = Math.hypot(bx - ax, bz - az);
    if (len < 0.5) continue;
    const ux = (bx - ax) / len;
    const uz = (bz - az) / len;
    let u0 = Infinity;
    let u1 = -Infinity;
    let v0 = Infinity;
    let v1 = -Infinity;
    for (const [x, z] of ring) {
      const u = x * ux + z * uz;
      const v = -x * uz + z * ux;
      u0 = Math.min(u0, u);
      u1 = Math.max(u1, u);
      v0 = Math.min(v0, v);
      v1 = Math.max(v1, v);
    }
    const a = (u1 - u0) * (v1 - v0);
    if (!best || a < best.area) {
      const cu = (u0 + u1) / 2;
      const cv = (v0 + v1) / 2;
      best = { area: a, ux, uz, cx: cu * ux - cv * uz, cz: cu * uz + cv * ux, hu: (u1 - u0) / 2, hv: (v1 - v0) / 2 };
    }
  }
  if (!best) return null;
  // Long axis first.
  if (best.hv > best.hu) {
    const { ux, uz } = best;
    return { ...best, ux: -uz, uz: ux, hu: best.hv, hv: best.hu };
  }
  return best;
}

function mesh() {
  const pos = [];
  const nor = [];
  const col = [];
  const extra = []; // facade: [along metres, height above ground, seed, eave above ground]
  const tri = (a, b, c, color, ex) => {
    const ux = b[0] - a[0];
    const uy = b[1] - a[1];
    const uz = b[2] - a[2];
    const vx = c[0] - a[0];
    const vy = c[1] - a[1];
    const vz = c[2] - a[2];
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l;
    ny /= l;
    nz /= l;
    for (const [p, e] of [
      [a, ex?.[0]],
      [b, ex?.[1]],
      [c, ex?.[2]],
    ]) {
      pos.push(p[0], p[1], p[2]);
      nor.push(nx, ny, nz);
      col.push(...color);
      if (ex) extra.push(...e);
    }
  };
  // Quad a b c d counter-clockwise seen from the front.
  const quad = (a, b, c, d, color, ex) => {
    tri(a, b, c, color, ex && [ex[0], ex[1], ex[2]]);
    tri(a, c, d, color, ex && [ex[0], ex[2], ex[3]]);
  };
  return { pos, nor, col, extra, tri, quad };
}

// OpenStreetMap often maps a building twice (outline and part): keep one of each near-identical pair,
// the taller, so their walls don't fight for the same pixels.
export function dedupeBuildings(buildings) {
  const info = buildings.map((b) => {
    let cx = 0;
    let cz = 0;
    for (const [x, z] of b.ring) (cx += x), (cz += z);
    return { b, cx: cx / b.ring.length, cz: cz / b.ring.length, a: Math.abs(area(b.ring)) };
  });
  info.sort((p, q) => q.b.top - p.b.top);
  const kept = [];
  for (const i of info) {
    if (kept.some((k) => Math.hypot(k.cx - i.cx, k.cz - i.cz) < 2 && Math.abs(k.a - i.a) < 0.15 * Math.max(k.a, i.a))) continue;
    kept.push(i);
  }
  return kept.map((k) => k.b);
}

export function buildVillage(all, { balconies = true } = {}) {
  const facade = mesh();
  const plain = mesh();
  const buildings = dedupeBuildings(all);
  buildings.forEach((b, n) => {
    const r = rand(n * 7919 + 13);
    let ring = b.ring.slice();
    if (ring.length > 1 && ring[0][0] === ring.at(-1)[0] && ring[0][1] === ring.at(-1)[1]) ring.pop();
    if (ring.length < 3) return;
    if (!outwardIsRight(ring)) ring = ring.reverse(); // walls face (dz, -dx) of each edge: make that outside
    const ground = b.base + 2;
    const eave = b.top;
    const seed = r();
    const wall = WALLS[Math.floor(r() * WALLS.length)];
    const box = orientedBox(ring);
    const fill = box ? Math.abs(area(ring)) / (4 * box.hu * box.hv) : 0;
    const pitched = box && fill > 0.78 && box.hv < 15 && box.hv > 2;
    const pitch = 0.5 + r() * 0.12; // rise per metre
    const ridge = pitched ? eave + box.hv * pitch : eave;

    // Walls, up to the eave (and gable triangles where a pitched roof ends).
    let along = 0;
    for (let i = 0; i < ring.length; i++) {
      const [ax, az] = ring[i];
      const [bx, bz] = ring[(i + 1) % ring.length];
      const len = Math.hypot(bx - ax, bz - az);
      if (len < 0.05) continue;
      const e = (u, y) => [along + u, y - ground, seed, eave - ground];
      // Overlapping footprints share wall planes: push each building's walls out by a few centimetres
      // (different per building) so they never land on exactly the same pixels.
      const push = (n % 5) * 0.03;
      const wx0 = ax + ((bz - az) / len) * push;
      const wz0 = az - ((bx - ax) / len) * push;
      const wx1 = bx + ((bz - az) / len) * push;
      const wz1 = bz - ((bx - ax) / len) * push;
      facade.quad([wx1, b.base, wz1], [wx0, b.base, wz0], [wx0, eave, wz0], [wx1, eave, wz1], wall, [e(len, b.base), e(0, b.base), e(0, eave), e(len, eave)]);
      // Balconies along long walls of taller buildings: a slab and a wooden railing per floor.
      if (balconies && seed > 0.35 && len > 7 && eave - ground > 8) {
        const ox = (bz - az) / len; // outward (right of travel, for counter-clockwise rings)
        const oz = -(bx - ax) / len;
        const inset = Math.min(1.2, len * 0.1);
        const ux = (bx - ax) / len;
        const uz = (bz - az) / len;
        const p0 = [ax + ux * inset, az + uz * inset];
        const p1 = [bx - ux * inset, bz - uz * inset];
        for (let y = ground + 3.4 + 2.95; y < eave - 1.5; y += 2.95) {
          const d = 1.25;
          const s0 = [p0[0], y, p0[1]];
          const s1 = [p1[0], y, p1[1]];
          const o0 = [p0[0] + ox * d, y, p0[1] + oz * d];
          const o1 = [p1[0] + ox * d, y, p1[1] + oz * d];
          plain.quad(s0, s1, o1, o0, SNOW); // top of the slab, a little snow
          const lift = (p, h) => [p[0], p[1] + h, p[2]];
          plain.quad(o0, o1, lift(o1, -0.18), lift(o0, -0.18), WOOD); // slab edge
          plain.quad(lift(o1, 1.0), lift(o0, 1.0), o0, o1, WOOD); // railing, outside face
          plain.quad(lift(o0, 1.0), lift(o1, 1.0), o1, o0, WOOD); // inside face
          plain.quad(lift(s0, 1.0), lift(o0, 1.0), o0, s0, WOOD); // railing ends
          plain.quad(lift(o1, 1.0), lift(s1, 1.0), s1, o1, WOOD);
        }
      }
      along += len;
    }

    if (pitched) {
      const { ux, uz, cx, cz, hu, hv } = box;
      const vx = -uz; // across the ridge
      const vz = ux;
      const o = 0.7; // overhang
      const P = (u, v, y) => [cx + ux * u + vx * v, y, cz + uz * u + vz * v];
      const yEdge = eave - o * pitch;
      // Gable walls from the eave to the ridge at both ends.
      for (const s of [-1, 1]) {
        const a = P(s * hu, -s * hv, eave);
        const c = P(s * hu, s * hv, eave);
        const top = P(s * hu, 0, ridge);
        const e = (p) => [(p[0] - cx) * vx + (p[2] - cz) * vz + 50, p[1] - ground, seed, eave - ground];
        facade.tri(c, a, top, wall, [e(c), e(a), e(top)]);
      }
      // Roof: snow on top, dark slate edges and soffit underneath.
      const t = 0.35;
      for (const s of [-1, 1]) {
        const e0 = P(-(hu + o), s * (hv + o), yEdge);
        const e1 = P(hu + o, s * (hv + o), yEdge);
        const r0 = P(-(hu + o), 0, ridge + 0.02);
        const r1 = P(hu + o, 0, ridge + 0.02);
        if (s > 0) plain.quad(e0, e1, r1, r0, SNOW);
        else plain.quad(e1, e0, r0, r1, SNOW);
        const down = (p) => [p[0], p[1] - t, p[2]];
        if (s > 0) plain.quad(down(r0), down(r1), down(e1), down(e0), WOOD);
        else plain.quad(down(r1), down(r0), down(e0), down(e1), WOOD);
        // Eave fascia.
        if (s > 0) plain.quad(down(e0), down(e1), e1, e0, SLATE);
        else plain.quad(down(e1), down(e0), e0, e1, SLATE);
        // Rake edges at both gable ends.
        for (const end of [-1, 1]) {
          const a = P(end * (hu + o), s * (hv + o), yEdge);
          const b2 = P(end * (hu + o), 0, ridge + 0.02);
          if (s * end > 0) plain.quad(down(a), down(b2), b2, a, SLATE);
          else plain.quad(down(b2), down(a), a, b2, SLATE);
        }
      }
      // A chimney on some roofs.
      if (r() > 0.45) {
        const cu = (r() - 0.5) * hu;
        const cv = (r() > 0.5 ? 1 : -1) * hv * 0.4;
        const base = eave + (hv - Math.abs(cv)) * pitch - 0.3;
        const h = 1.6;
        const w = 0.45;
        const corners = [
          [-w, -w],
          [w, -w],
          [w, w],
          [-w, w],
        ].map(([du, dv]) => P(cu + du, cv + dv, 0));
        for (let k = 0; k < 4; k++) {
          const p = corners[k];
          const q = corners[(k + 1) % 4];
          plain.quad([q[0], base, q[2]], [p[0], base, p[2]], [p[0], base + h, p[2]], [q[0], base + h, q[2]], [0.16, 0.14, 0.13]);
        }
        plain.quad(...corners.map((p) => [p[0], base + h, p[2]]).reverse(), SNOW);
      }
    } else {
      // Flat roof: snow over the footprint and a low parapet.
      const flat = ring.map(([x, z]) => [x, eave + 0.05, z]);
      for (let i = 1; i < flat.length - 1; i++) {
        // Fan triangulation is fine for the convex-ish blocks that end up here; concave ones get the
        // parapet anyway and the odd overlap is hidden under snow.
        plain.tri(flat[0], flat[i + 1], flat[i], SNOW);
      }
      for (let i = 0; i < ring.length; i++) {
        const [ax, az] = ring[i];
        const [bx, bz] = ring[(i + 1) % ring.length];
        plain.quad([bx, eave, bz], [ax, eave, az], [ax, eave + 0.6, az], [bx, eave + 0.6, bz], SLATE);
      }
    }
  });
  return { facade, plain };
}
