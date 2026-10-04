// Turns an OpenStreetMap aerialway line into towers, cables and stations on the terrain.

const SPECS = {
  chair: { tower: 10, spacing: 110, offset: 2.6, carrier: 'chair', every: 24, speed: 4.5 },
  cabin: { tower: 14, spacing: 160, offset: 3.2, carrier: 'cabin', every: 45, speed: 5 },
  drag: { tower: 6, spacing: 90, offset: 1.2, carrier: 'bar', every: 16, speed: 3 },
  carpet: { tower: 0, spacing: Infinity, offset: 0, carrier: null, every: Infinity, speed: 1 },
};

export function liftKind(type) {
  if (type === 'gondola' || type === 'cable_car') return 'cabin';
  if (type === 'chair_lift' || type === 'mixed_lift') return 'chair';
  if (type === 'magic_carpet') return 'carpet';
  return 'drag'; // drag_lift, t-bar, j-bar, platter, rope_tow
}

function polylineLength(pts) {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(...pts[i].map((v, k) => v - pts[i - 1][k])));
  return cum;
}

// Point at distance d along a polyline (2D or 3D), with precomputed cumulative lengths.
export function pointAlong(pts, cum, d, out = []) {
  const total = cum[cum.length - 1];
  const t = Math.min(total, Math.max(0, d));
  let i = 1;
  while (i < cum.length - 1 && cum[i] < t) i++;
  const span = cum[i] - cum[i - 1] || 1;
  const f = (t - cum[i - 1]) / span;
  for (let k = 0; k < pts[i].length; k++) out[k] = pts[i - 1][k] + (pts[i][k] - pts[i - 1][k]) * f;
  out.length = pts[i].length;
  return out;
}

export function layoutLift(lift, heightAt) {
  const kind = liftKind(lift.type);
  const spec = SPECS[kind];
  let line = lift.line;
  if (heightAt(...line[0]) > heightAt(...line.at(-1))) line = [...line].reverse(); // bottom → top
  const cum = polylineLength(line);
  const length = cum.at(-1);
  const n = Math.max(1, Math.ceil(length / spec.spacing));
  const towers = [];
  const up = [];
  const down = [];
  const p = [];
  for (let k = 0; k <= n; k++) {
    const d = (k / n) * length;
    pointAlong(line, cum, d, p);
    const [x, z] = p;
    const ahead = pointAlong(line, cum, Math.min(length, d + 2), []);
    const behind = pointAlong(line, cum, Math.max(0, d - 2), []);
    const dx = ahead[0] - behind[0];
    const dz = ahead[1] - behind[1];
    const dl = Math.hypot(dx, dz) || 1;
    const px = -dz / dl; // perpendicular, to the left of travel
    const pz = dx / dl;
    const ground = heightAt(x, z);
    const end = k === 0 || k === n;
    const top = ground + (end ? Math.min(spec.tower, 6) : spec.tower);
    towers.push({ x, z, y0: ground, y1: top, end, dirX: dx / dl, dirZ: dz / dl });
    up.push([x + px * spec.offset, top - 0.6, z + pz * spec.offset]);
    down.push([x - px * spec.offset, top - 0.6, z - pz * spec.offset]);
  }
  // A little sag between towers.
  const sag = (pts) => {
    const out = [pts[0]];
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1];
      const b = pts[i];
      const span = Math.hypot(b[0] - a[0], b[2] - a[2]);
      out.push([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2 - span * 0.012, (a[2] + b[2]) / 2], b);
    }
    return out;
  };
  const upCable = sag(up);
  const downCable = sag(down).reverse(); // top → bottom
  const bottom = { x: line[0][0], z: line[0][1], y: heightAt(...line[0]) };
  const topSt = { x: line.at(-1)[0], z: line.at(-1)[1], y: heightAt(...line.at(-1)) };
  return {
    id: lift.id,
    name: lift.name,
    type: lift.type,
    kind,
    spec,
    length,
    towers,
    up: upCable,
    upCum: polylineLength(upCable),
    down: downCable,
    downCum: polylineLength(downCable),
    bottom,
    top: topSt,
  };
}
