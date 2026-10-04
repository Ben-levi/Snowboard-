// Things the rider can hit: circles { x, z, r } (trees, lift towers) and polygons { ring } (buildings).
// A uniform grid hash answers "what's near (x, z)?" with one lookup and no allocation.

const EMPTY = Object.freeze([]);

export function createObstacleIndex(cellSize = 16, reach = 2) {
  const cells = new Map();
  const key = (i, j) => (i + 32768) * 65536 + (j + 32768);

  function add(o) {
    if (o.ring) {
      let minX = Infinity;
      let minZ = Infinity;
      let maxX = -Infinity;
      let maxZ = -Infinity;
      for (const [x, z] of o.ring) {
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minZ = Math.min(minZ, z);
        maxZ = Math.max(maxZ, z);
      }
      Object.assign(o, { minX, minZ, maxX, maxZ });
    } else {
      Object.assign(o, { minX: o.x - o.r, maxX: o.x + o.r, minZ: o.z - o.r, maxZ: o.z + o.r });
    }
    const i0 = Math.floor((o.minX - reach) / cellSize);
    const i1 = Math.floor((o.maxX + reach) / cellSize);
    const j0 = Math.floor((o.minZ - reach) / cellSize);
    const j1 = Math.floor((o.maxZ + reach) / cellSize);
    for (let i = i0; i <= i1; i++)
      for (let j = j0; j <= j1; j++) {
        const k = key(i, j);
        let list = cells.get(k);
        if (!list) cells.set(k, (list = []));
        list.push(o);
      }
  }

  const near = (x, z) => cells.get(key(Math.floor(x / cellSize), Math.floor(z / cellSize))) ?? EMPTY;
  return { add, near, size: () => cells.size };
}

export function pointInRing(x, z, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, zi] = ring[i];
    const [xj, zj] = ring[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

// Closest point on a polygon's boundary.
export function closestOnRing(x, z, ring, out = [0, 0]) {
  let best = Infinity;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [ax, az] = ring[j];
    const [bx, bz] = ring[i];
    const dx = bx - ax;
    const dz = bz - az;
    const len2 = dx * dx + dz * dz || 1;
    const t = Math.min(1, Math.max(0, ((x - ax) * dx + (z - az) * dz) / len2));
    const px = ax + t * dx;
    const pz = az + t * dz;
    const d = (x - px) ** 2 + (z - pz) ** 2;
    if (d < best) {
      best = d;
      out[0] = px;
      out[1] = pz;
    }
  }
  return out;
}
