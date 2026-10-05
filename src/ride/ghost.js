// Ghost runs: the rider's position sampled at 10 Hz, replayed alongside the next attempt.
// Stored compactly as base64 Float32 [t, x, y, z, heading] * n.

const STRIDE = 5;
export const SAMPLE_EVERY = 0.1;

export function createRecorder() {
  return { samples: [], last: -Infinity };
}

export function record(rec, t, s) {
  if (t - rec.last < SAMPLE_EVERY) return;
  rec.last = t;
  rec.samples.push(t, s.x, s.y, s.z, s.heading);
}

export function encodeGhost(samples) {
  const bytes = new Uint8Array(Float32Array.from(samples).buffer);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

export function decodeGhost(str) {
  const bin = atob(str);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Float32Array(bytes.buffer);
}

// Position at time t, interpolated (heading along the shortest turn). Holds the last sample after the end.
export function ghostAt(data, t, out = {}) {
  const n = data.length / STRIDE;
  if (!n) return null;
  let lo = 0;
  let hi = n - 1;
  if (t <= data[0]) hi = 0;
  else if (t >= data[(n - 1) * STRIDE]) lo = hi = n - 1;
  else
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (data[mid * STRIDE] <= t) lo = mid;
      else hi = mid;
    }
  const a = lo * STRIDE;
  const b = hi * STRIDE;
  const span = data[b] - data[a];
  const f = span > 0 ? (t - data[a]) / span : 0;
  out.x = data[a + 1] + (data[b + 1] - data[a + 1]) * f;
  out.y = data[a + 2] + (data[b + 2] - data[a + 2]) * f;
  out.z = data[a + 3] + (data[b + 3] - data[a + 3]) * f;
  const dh = Math.atan2(Math.sin(data[b + 4] - data[a + 4]), Math.cos(data[b + 4] - data[a + 4]));
  out.heading = data[a + 4] + dh * f;
  out.done = t >= data[(n - 1) * STRIDE];
  return out;
}

const key = (resort, id) => `ride:ghost:${resort}:${id}`;

export function saveGhost(resort, id, { samples, splits, time }) {
  try {
    localStorage.setItem(key(resort, id), JSON.stringify({ time, splits, data: encodeGhost(samples) }));
  } catch {
    /* storage full or blocked: no ghost next time */
  }
}

export function loadGhost(resort, id) {
  try {
    const raw = localStorage.getItem(key(resort, id));
    if (!raw) return null;
    const g = JSON.parse(raw);
    return { time: g.time, splits: g.splits ?? [], data: decodeGhost(g.data), mine: true };
  } catch {
    return null;
  }
}
