import { gridSpec } from './geo.js';

// A height grid in the resort's local frame, with bilinear sampling (clamped at the edges).
export function makeHeightfield({ cols, rows, cell, base, scale }, data) {
  const spec = gridSpec({ cols, rows, cell });
  const w = cols + 1;
  const heights = new Float32Array(data.length);
  for (let i = 0; i < data.length; i++) heights[i] = base + data[i] * scale;

  const vertex = (i, j) => heights[Math.min(rows, Math.max(0, j)) * w + Math.min(cols, Math.max(0, i))];

  function heightAt(x, z) {
    const fx = Math.min(cols, Math.max(0, (x - spec.x0) / cell));
    const fz = Math.min(rows, Math.max(0, (z - spec.z0) / cell));
    const i = Math.min(cols - 1, Math.floor(fx));
    const j = Math.min(rows - 1, Math.floor(fz));
    const u = fx - i;
    const v = fz - j;
    const a = heights[j * w + i];
    const b = heights[j * w + i + 1];
    const c = heights[(j + 1) * w + i];
    const d = heights[(j + 1) * w + i + 1];
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }

  // Unit surface normal from central differences.
  function normalAt(x, z, out = [0, 1, 0]) {
    const e = cell;
    const dx = (heightAt(x + e, z) - heightAt(x - e, z)) / (2 * e);
    const dz = (heightAt(x, z + e) - heightAt(x, z - e)) / (2 * e);
    const len = Math.hypot(dx, 1, dz);
    out[0] = -dx / len;
    out[1] = 1 / len;
    out[2] = -dz / len;
    return out;
  }

  const inside = (x, z, margin = 0) =>
    x >= spec.x0 + margin && x <= spec.x0 + spec.width - margin && z >= spec.z0 + margin && z <= spec.z0 + spec.depth - margin;

  return { ...spec, heights, vertex, heightAt, normalAt, inside };
}

// Loads a baked resort from public/resort/<id>/. features.json is optional (OSM bake may not have run).
export async function loadResort(id, baseUrl = import.meta.env.BASE_URL) {
  const dir = `${baseUrl}resort/${id}/`;
  const get = async (name) => {
    const res = await fetch(dir + name);
    if (!res.ok) throw new Error(`${name}: ${res.status}`);
    return res;
  };
  const meta = await (await get('meta.json')).json();
  const [nearBuf, farBuf, features] = await Promise.all([
    get('height.bin').then((r) => r.arrayBuffer()),
    get('far.bin').then((r) => r.arrayBuffer()),
    get('features.json')
      .then((r) => r.json())
      .catch(() => null),
  ]);
  return {
    meta,
    near: makeHeightfield({ ...meta.near, scale: meta.scale }, new Uint16Array(nearBuf)),
    far: makeHeightfield({ ...meta.far, scale: meta.scale }, new Uint16Array(farBuf)),
    features,
  };
}
