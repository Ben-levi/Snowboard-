import { gridSpec } from './geo.js';
import { decodeHeights } from './terrainCodec.js';

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

// Approximate download sizes, for the progress bar before the server tells us.
const EXPECTED = { 'terrain.bin.gz': 640e3, 'far.bin': 132e3, 'world.json': 330e3, 'features.json': 128e3, 'mask.png': 110e3, 'light.png': 170e3, 'farlight.png': 45e3 };

// Fetch a file as bytes, reporting bytes received.
async function fetchBytes(url, onBytes) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url.split('/').pop()}: ${res.status}`);
  if (!res.body?.getReader) {
    const buf = new Uint8Array(await res.arrayBuffer());
    onBytes(buf.length);
    return buf;
  }
  const reader = res.body.getReader();
  const parts = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(value);
    size += value.length;
    onBytes(value.length);
  }
  const out = new Uint8Array(size);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

async function gunzip(bytes) {
  // Some servers already decompressed it (Content-Encoding): no gzip magic number then.
  if (bytes[0] !== 0x1f || bytes[1] !== 0x8b) return bytes;
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

const text = (bytes) => new TextDecoder().decode(bytes);

// Loads a prepared resort from public/resort/<id>/ (see tools/resort/prepare.mjs): groomed terrain,
// the horizon, map features, the prepared world and the snow mask. onProgress(0..1) while downloading.
export async function loadResort(id, { baseUrl = import.meta.env.BASE_URL, onProgress } = {}) {
  const dir = `${baseUrl}resort/${id}/`;
  const total = Object.values(EXPECTED).reduce((a, b) => a + b, 0);
  let got = 0;
  const tick = (n) => {
    got += n;
    onProgress?.(Math.min(0.99, got / total));
  };
  // Everything downloads at once (ride.html also preloads the big files while the code loads).
  const canGunzip = typeof DecompressionStream !== 'undefined';
  const metaReady = fetchBytes(`${dir}meta.json`, () => {}).then((b) => JSON.parse(text(b)));
  const [meta, nearBytes, farBytes, worldBytes, featureBytes, maskBytes, lightBytes, farLightBytes] = await Promise.all([
    metaReady,
    canGunzip
      ? Promise.all([fetchBytes(`${dir}terrain.bin.gz`, tick).then(gunzip), metaReady]).then(([b, m]) => decodeHeights(b, m.near.cols))
      : fetchBytes(`${dir}height.bin`, tick).then((b) => new Uint16Array(b.buffer)), // ungroomed fallback
    fetchBytes(`${dir}far.bin`, tick),
    fetchBytes(`${dir}world.json`, tick),
    fetchBytes(`${dir}features.json`, tick).catch(() => null),
    fetchBytes(`${dir}mask.png`, tick),
    fetchBytes(`${dir}light.png`, tick).catch(() => null),
    fetchBytes(`${dir}farlight.png`, tick).catch(() => null),
  ]);
  onProgress?.(1);
  // Decode the images off the main thread.
  const image = (bytes) =>
    bytes ? createImageBitmap(new Blob([bytes], { type: 'image/png' }), { premultiplyAlpha: 'none', colorSpaceConversion: 'none' }) : null;
  const [maskImage, lightImage, farLightImage] = await Promise.all([image(maskBytes), image(lightBytes), image(farLightBytes)]);
  return {
    meta,
    near: makeHeightfield({ ...meta.near, scale: meta.scale }, nearBytes),
    far: makeHeightfield({ ...meta.far, scale: meta.scale }, new Uint16Array(farBytes.buffer, farBytes.byteOffset, farBytes.byteLength / 2)),
    features: featureBytes ? JSON.parse(text(featureBytes)) : null,
    world: JSON.parse(text(worldBytes)),
    maskImage,
    lightImage,
    farLightImage,
  };
}

// The gold-medal bot runs (first ghosts), fetched in the background once the menu is up.
export async function loadBots(id, baseUrl = import.meta.env.BASE_URL) {
  const res = await fetch(`${baseUrl}resort/${id}/bots.json`);
  return res.ok ? res.json() : {};
}
