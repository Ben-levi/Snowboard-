// A tiny software rasterizer (no canvas needed, so it runs at build time in Node):
// filled polygons, thick strokes and discs into an RGB byte image. Coordinates are in pixels,
// pixel (i, j) covers [i, i+1) x [j, j+1) and is sampled at its centre.

export function createRaster(width, height) {
  return { width, height, data: new Uint8Array(width * height * 3) };
}

function put(r, i, j, ch, value, add) {
  const k = (j * r.width + i) * 3 + ch;
  const v = add ? r.data[k] + value : Math.max(r.data[k], value);
  r.data[k] = v > 255 ? 255 : v;
}

// Even-odd scanline fill. pts: [[x, y], ...] in pixels (closing point optional).
export function fillPolygon(r, pts, ch, value = 255) {
  let minY = Infinity;
  let maxY = -Infinity;
  for (const [, y] of pts) {
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  const j0 = Math.max(0, Math.floor(minY));
  const j1 = Math.min(r.height - 1, Math.ceil(maxY));
  const xs = [];
  for (let j = j0; j <= j1; j++) {
    const y = j + 0.5;
    xs.length = 0;
    for (let a = 0, b = pts.length - 1; a < pts.length; b = a++) {
      const [xa, ya] = pts[a];
      const [xb, yb] = pts[b];
      if (ya > y !== yb > y) xs.push(xa + ((y - ya) * (xb - xa)) / (yb - ya));
    }
    xs.sort((p, q) => p - q);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const i0 = Math.max(0, Math.ceil(xs[k] - 0.5));
      const i1 = Math.min(r.width - 1, Math.floor(xs[k + 1] - 0.5));
      for (let i = i0; i <= i1; i++) put(r, i, j, ch, value, false);
    }
  }
}

// Round-capped thick polyline.
export function strokeLine(r, pts, width, ch, value = 255) {
  const half = width / 2;
  const h2 = half * half;
  for (let s = 1; s < pts.length; s++) {
    const [ax, ay] = pts[s - 1];
    const [bx, by] = pts[s];
    const dx = bx - ax;
    const dy = by - ay;
    const l2 = dx * dx + dy * dy || 1e-9;
    const i0 = Math.max(0, Math.floor(Math.min(ax, bx) - half));
    const i1 = Math.min(r.width - 1, Math.ceil(Math.max(ax, bx) + half));
    const j0 = Math.max(0, Math.floor(Math.min(ay, by) - half));
    const j1 = Math.min(r.height - 1, Math.ceil(Math.max(ay, by) + half));
    for (let j = j0; j <= j1; j++)
      for (let i = i0; i <= i1; i++) {
        const px = i + 0.5;
        const py = j + 0.5;
        const t = Math.min(1, Math.max(0, ((px - ax) * dx + (py - ay) * dy) / l2));
        const ex = px - (ax + t * dx);
        const ey = py - (ay + t * dy);
        if (ex * ex + ey * ey <= h2) put(r, i, j, ch, value, false);
      }
  }
}

// Disc, added onto what's there (saturating), like the canvas 'lighter' blend.
export function addDisc(r, cx, cy, radius, ch, value) {
  const r2 = radius * radius;
  const i0 = Math.max(0, Math.floor(cx - radius));
  const i1 = Math.min(r.width - 1, Math.ceil(cx + radius));
  const j0 = Math.max(0, Math.floor(cy - radius));
  const j1 = Math.min(r.height - 1, Math.ceil(cy + radius));
  for (let j = j0; j <= j1; j++)
    for (let i = i0; i <= i1; i++) {
      const ex = i + 0.5 - cx;
      const ey = j + 0.5 - cy;
      if (ex * ex + ey * ey <= r2) put(r, i, j, ch, value, true);
    }
}

export const sample = (r, i, j, ch) => (i < 0 || j < 0 || i >= r.width || j >= r.height ? 0 : r.data[(j * r.width + i) * 3 + ch]);
