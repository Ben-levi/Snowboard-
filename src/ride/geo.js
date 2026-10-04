// Local metric frame for a resort: origin at its centre, x east, z south, y up (metres).
// Shared by the bake script (tools/resort/bake.mjs) and the browser.

const R = 6378137;
const RAD = Math.PI / 180;

export function makeProjection([lon0, lat0]) {
  const kz = RAD * R;
  const kx = kz * Math.cos(lat0 * RAD);
  return {
    toLocal: (lon, lat) => [(lon - lon0) * kx, -(lat - lat0) * kz],
    toLonLat: (x, z) => [lon0 + x / kx, lat0 - z / kz],
  };
}

// Web Mercator pixel coordinates (256 px tiles) at a zoom level.
export function mercatorPixel(lon, lat, zoom) {
  const size = 256 * 2 ** zoom;
  const s = Math.sin(lat * RAD);
  return [((lon + 180) / 360) * size, (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * size];
}

// Heights are stored as Uint16: metres = base + value * scale.
export const HEIGHT_SCALE = 0.05;

// A regular grid of (cols + 1) x (rows + 1) vertices, `cell` metres apart, centred on the origin.
export function gridSpec({ cols, rows, cell }) {
  return { cols, rows, cell, width: cols * cell, depth: rows * cell, x0: (-cols * cell) / 2, z0: (-rows * cell) / 2 };
}
