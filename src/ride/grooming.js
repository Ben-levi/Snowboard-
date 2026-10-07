// Shapes the snow under the popular runs, editing a heightfield's heights in place:
// - groomed corridors: bumps under ~20 m are smoothed away, like a piste basher would
// - boardercross: rollers along the line and banked berms on the outside of turns

// Separable box blur with running sums (constant cost per cell), edges clamped.
function boxBlur(src, w, h, radius, passes) {
  const a = Float32Array.from(src);
  const b = new Float32Array(a.length);
  const n = radius * 2 + 1;
  const run = (from, to, len, stride, offset) => {
    let s = 0;
    for (let k = -radius; k <= radius; k++) s += from[offset + Math.min(len - 1, Math.max(0, k)) * stride];
    for (let i = 0; i < len; i++) {
      to[offset + i * stride] = s / n;
      s += from[offset + Math.min(len - 1, i + radius + 1) * stride] - from[offset + Math.max(0, i - radius) * stride];
    }
  };
  for (let p = 0; p < passes; p++) {
    for (let j = 0; j < h; j++) run(a, b, w, 1, j * w);
    for (let i = 0; i < w; i++) run(b, a, h, w, i);
  }
  return a;
}

const smoothstep = (e0, e1, x) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

// Visit grid vertices near a polyline: fn(index, distance, along, side, segment) where side is the
// signed lateral offset (positive to the right of travel) and along the distance from the start.
function forEachNear(field, line, reach, fn) {
  const { cols, rows, cell, x0, z0 } = field;
  const w = cols + 1;
  let along = 0;
  const best = new Map();
  for (let s = 1; s < line.length; s++) {
    const [ax, az] = line[s - 1];
    const [bx, bz] = line[s];
    const dx = bx - ax;
    const dz = bz - az;
    const len = Math.hypot(dx, dz);
    if (len < 1e-6) continue;
    const i0 = Math.max(0, Math.floor((Math.min(ax, bx) - reach - x0) / cell));
    const i1 = Math.min(cols, Math.ceil((Math.max(ax, bx) + reach - x0) / cell));
    const j0 = Math.max(0, Math.floor((Math.min(az, bz) - reach - z0) / cell));
    const j1 = Math.min(rows, Math.ceil((Math.max(az, bz) + reach - z0) / cell));
    for (let j = j0; j <= j1; j++)
      for (let i = i0; i <= i1; i++) {
        const x = x0 + i * cell;
        const z = z0 + j * cell;
        const t = Math.min(1, Math.max(0, ((x - ax) * dx + (z - az) * dz) / (len * len)));
        const d = Math.hypot(x - (ax + t * dx), z - (az + t * dz));
        if (d > reach) continue;
        const k = j * w + i;
        const prev = best.get(k);
        if (prev && prev.d <= d) continue;
        // Right of travel = forward × up = (-dz, dx) / len (same convention as physics.boardAxes).
        const side = ((x - ax) * -dz + (z - az) * dx) / len;
        best.set(k, { d, along: along + t * len, side, s, px: ax + t * dx, pz: az + t * dz });
      }
    along += len;
  }
  for (const [k, v] of best) fn(k, v.d, v.along, v.side, v.s, v.px, v.pz);
}

function sampler(field, arr) {
  const { cols, rows, cell, x0, z0 } = field;
  const w = cols + 1;
  return (x, z) => {
    const fx = Math.min(cols, Math.max(0, (x - x0) / cell));
    const fz = Math.min(rows, Math.max(0, (z - z0) / cell));
    const i = Math.min(cols - 1, Math.floor(fx));
    const j = Math.min(rows - 1, Math.floor(fz));
    const u = fx - i;
    const v = fz - j;
    const a = arr[j * w + i];
    const b = arr[j * w + i + 1];
    const c = arr[(j + 1) * w + i];
    const d = arr[(j + 1) * w + i + 1];
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
}

// How much of the natural slope across the piste survives grooming: easy runs are graded nearly
// level from side to side (cat-tracks are cut into the hillside), blacks keep more of the mountain.
export const CROSS_KEEP = { novice: 0.2, easy: 0.25, intermediate: 0.45, advanced: 0.65, expert: 0.7, freeride: 0.8, '': 0.4 };

// Grooming, as a piste basher and the original grading would: bumps under ~20 m smoothed away and the
// cross-slope eased towards the height of the centre line, with banks blending back into the natural
// terrain beyond the edges. corridors: [{ line, width, difficulty }]. Returns each vertex's weight.
export function groom(field, corridors, { radius = 2, passes = 2, strength = 0.9, bank = 12 } = {}) {
  const w = field.cols + 1;
  const h = field.rows + 1;
  const smooth = boxBlur(field.heights, w, h, radius, passes);
  const smoothAt = sampler(field, smooth);
  const weight = new Float32Array(field.heights.length);
  const target = new Float32Array(field.heights.length);
  for (const c of corridors) {
    const half = c.width / 2;
    const keep = CROSS_KEEP[c.difficulty] ?? CROSS_KEEP[''];
    forEachNear(field, c.line, half + bank, (k, d, along, side, s, px, pz) => {
      const wt = 1 - smoothstep(half - 2, half + bank, d);
      if (wt <= weight[k]) return;
      const centre = smoothAt(px, pz);
      weight[k] = wt;
      target[k] = centre + (smooth[k] - centre) * keep;
    });
  }
  for (let k = 0; k < weight.length; k++) {
    if (weight[k] > 0) field.heights[k] += (target[k] - field.heights[k]) * weight[k] * strength;
  }
  return weight;
}

// Rollers and berms along a boardercross line.
// Resample a polyline every `step` metres and smooth it (a boardercross flows; OSM corners don't).
export function smoothLine(line, step = 4, window = 3) {
  const pts = [line[0]];
  for (let s = 1; s < line.length; s++) {
    const [ax, az] = line[s - 1];
    const [bx, bz] = line[s];
    const len = Math.hypot(bx - ax, bz - az);
    const n = Math.max(1, Math.round(len / step));
    for (let k = 1; k <= n; k++) pts.push([ax + ((bx - ax) * k) / n, az + ((bz - az) * k) / n]);
  }
  return pts.map((p, i) => {
    if (i < window || i >= pts.length - window) return p;
    let x = 0;
    let z = 0;
    for (let k = -window; k <= window; k++) {
      x += pts[i + k][0];
      z += pts[i + k][1];
    }
    return [x / (2 * window + 1), z / (2 * window + 1)];
  });
}

// Signed curvature (1/m) at each point; negative = heading falling = turning right.
function curvature(pts) {
  const out = new Float32Array(pts.length);
  for (let i = 2; i < pts.length - 2; i++) {
    const a = Math.atan2(pts[i][0] - pts[i - 2][0], pts[i][1] - pts[i - 2][1]);
    const b = Math.atan2(pts[i + 2][0] - pts[i][0], pts[i + 2][1] - pts[i][1]);
    const d = Math.atan2(Math.sin(b - a), Math.cos(b - a));
    const l = (Math.hypot(pts[i + 2][0] - pts[i - 2][0], pts[i + 2][1] - pts[i - 2][1]) || 1) / 2;
    out[i] = d / l;
  }
  return out;
}

export function shapeBoardercross(field, line, { width = 14, roller = 1.1, wavelength = 24, berm = 2.2 } = {}) {
  const half = width / 2;
  const pts = smoothLine(line);
  const curv = curvature(pts);
  forEachNear(field, pts, half + 6, (k, d, along, side, s) => {
    const across = 1 - smoothstep(half - 1, half + 6, d);
    if (across <= 0) return;
    // Rollers: smooth humps, none in the first 20–40 m (the start ramp).
    const wave = Math.sin((Math.PI * along) / wavelength) ** 2;
    let add = roller * wave * across * smoothstep(20, 40, along);
    // Berm: raise the outside of the turn. Turning right (c < 0) puts the outside on the left (side < 0).
    const c = (curv[s - 1] + curv[s]) / 2;
    const outside = Math.sign(c) * side;
    // Full berm for turns tighter than ~25 m radius, banking up towards the outer edge.
    if (outside > 0) add += berm * Math.min(1, Math.abs(c) * 25) * smoothstep(0, half + 4, outside) * across;
    field.heights[k] += add;
  });
  return pts;
}
