// Compact terrain encoding: Uint16 heights, each stored as the difference from its left neighbour
// (the first column from the row above), then split into a high-byte plane and a low-byte plane.
// Smooth terrain makes both planes very repetitive, so gzip shrinks 2 MB to ~0.6 MB.

export function encodeHeights(values, cols) {
  const w = cols + 1;
  const n = values.length;
  const out = new Uint8Array(n * 2);
  for (let k = 0; k < n; k++) {
    const i = k % w;
    const prev = i ? values[k - 1] : k >= w ? values[k - w] : 0;
    const d = (values[k] - prev) & 0xffff;
    out[k] = d >> 8;
    out[n + k] = d & 0xff;
  }
  return out;
}

export function decodeHeights(bytes, cols) {
  const w = cols + 1;
  const n = bytes.length / 2;
  const values = new Uint16Array(n);
  for (let k = 0; k < n; k++) {
    const i = k % w;
    const prev = i ? values[k - 1] : k >= w ? values[k - w] : 0;
    values[k] = (prev + ((bytes[k] << 8) | bytes[n + k])) & 0xffff;
  }
  return values;
}
