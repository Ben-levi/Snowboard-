// Build-time lighting for the terrain, so mountains shade each other without any cost on phones.
// For every texel of a grid laid over an area:
//   r  sun: 1 in sunlight, 0 where a ridge between here and the sun hides it (soft edged)
//   g  sky: how much of the sky the ground sees beyond its own slope (valleys and gullies get less)
//   b  shape: 128 + 6 × (height − average height 25 m around), so ridges > 128 and hollows < 128
// heightAt(x, z) must cover the area and beyond (the far grid fills in past the near one).

const SKY_DIRS = 12;

export function bakeLight({ heightAt, x0, z0, width, depth, cols, rows, sun, maxHeight, reach = 7000, skyReach = 450 }) {
  const data = new Uint8Array(cols * rows * 3);
  const flat = Math.hypot(sun[0], sun[2]);
  const sx = sun[0] / flat;
  const sz = sun[2] / flat;
  const rise = sun[1] / flat; // metres up per metre towards the sun
  const dirs = [];
  for (let k = 0; k < SKY_DIRS; k++) {
    const a = (k / SKY_DIRS) * Math.PI * 2;
    dirs.push([Math.cos(a), Math.sin(a)]);
  }
  const cw = width / cols;
  const cd = depth / rows;
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const x = x0 + (i + 0.5) * cw;
      const z = z0 + (j + 0.5) * cd;
      const h0 = heightAt(x, z);

      // Sun: the steepest rise of the terrain towards the sun, against the sun's own rise.
      let worst = -Infinity;
      for (let t = 8; t < reach; t += Math.max(6, t * 0.03)) {
        const above = h0 + 1 + t * rise;
        if (above > maxHeight) break;
        const e = (heightAt(x + sx * t, z + sz * t) - h0 - 1) / t - rise;
        if (e > worst) worst = e;
      }
      const sunVis = Math.min(1, Math.max(0, 0.5 - worst / 0.05));

      // Sky: per direction, how far the horizon rises above the local slope (cosine-weighted).
      const gx = (heightAt(x + 10, z) - heightAt(x - 10, z)) / 20;
      const gz = (heightAt(x, z + 10) - heightAt(x, z - 10)) / 20;
      let sky = 0;
      for (const [dx, dz] of dirs) {
        const local = gx * dx + gz * dz;
        let top = local;
        for (let t = 12; t < skyReach; t *= 1.3) {
          const s = (heightAt(x + dx * t, z + dz * t) - h0) / t;
          if (s > top) top = s;
        }
        const above = Math.max(0, Math.atan(top) - Math.atan(local));
        sky += Math.cos(above) ** 2;
      }
      sky /= SKY_DIRS;

      // Shape: height above the ring around it.
      let ring = 0;
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        ring += heightAt(x + Math.cos(a) * 25, z + Math.sin(a) * 25);
      }
      const shape = h0 - ring / 8;

      const o = (j * cols + i) * 3;
      data[o] = Math.round(sunVis * 255);
      data[o + 1] = Math.round(sky * 255);
      data[o + 2] = Math.max(0, Math.min(255, Math.round(128 + shape * 6)));
    }
  }
  return { width: cols, height: rows, data };
}

// Heights inside the near grid, the far grid around it.
export function combinedHeight(near, far) {
  return (x, z) => (near.inside(x, z) ? near.heightAt(x, z) : far.heightAt(x, z));
}
