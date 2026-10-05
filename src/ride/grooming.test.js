import { describe, expect, it } from 'vitest';
import { makeHeightfield } from './terrainData.js';
import { groom, shapeBoardercross } from './grooming.js';

// 101 x 101 grid, 5 m cells, centred on the origin: a 20° slope (down to the south) with 1 m bumps every 10 m.
function bumpy() {
  const n = 101;
  const data = new Uint16Array(n * n);
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++) data[j * n + i] = Math.round((1000 - j * 5 * 0.36 + (i % 2) * 1) / 0.05);
  return makeHeightfield({ cols: 100, rows: 100, cell: 5, base: 0, scale: 0.05 }, data);
}

const roughness = (f, x0, x1, z) => {
  let r = 0;
  for (let x = x0; x < x1; x += 5) r += Math.abs(f.heightAt(x + 5, z) - f.heightAt(x, z));
  return r;
};

describe('grooming', () => {
  it('smooths bumps inside the corridor and leaves the rest alone', () => {
    const f = bumpy();
    const before = Float32Array.from(f.heights);
    groom(f, [{ line: [[0, -200], [0, 200]], width: 30 }]);
    expect(roughness(f, -10, 10, 0)).toBeLessThan(roughness({ heightAt: (x, z) => before[(z / 5 + 50) * 101 + x / 5 + 50] }, -10, 10, 0) * 0.3);
    // 60 m away nothing changed.
    expect(f.heightAt(60, 0)).toBeCloseTo(before[50 * 101 + 62], 5);
    // The overall slope is kept.
    expect(f.heightAt(0, -100) - f.heightAt(0, 100)).toBeCloseTo(72, -1);
  });

  it('adds rollers along a boardercross and berms on the outside of turns', () => {
    const flat = makeHeightfield({ cols: 100, rows: 100, cell: 5, base: 0, scale: 0.05 }, new Uint16Array(101 * 101));
    // Straight south, then a 40 m radius right turn (towards the west: heading falls) around (-40, 0).
    const arc = Array.from({ length: 19 }, (_, k) => {
      const a = (k / 18) * (Math.PI / 2);
      return [-40 + 40 * Math.cos(a), 40 * Math.sin(a)];
    });
    const line = [[0, -200], ...arc, [-200, 40]];
    shapeBoardercross(flat, line, { width: 14, roller: 1, wavelength: 20, berm: 2 });
    const along = [];
    for (let z = -150; z < -60; z += 2.5) along.push(flat.heightAt(0, z));
    expect(Math.max(...along)).toBeGreaterThan(0.8);
    expect(Math.min(...along)).toBeLessThan(0.2);
    // Mid-turn, the outside (further from the centre) is banked higher than the inside.
    const a = Math.PI / 4;
    const at = (r) => flat.heightAt(-40 + r * Math.cos(a), r * Math.sin(a));
    expect(at(45) - at(35)).toBeGreaterThan(0.3); // a gentle 40 m turn gets a mild bank
    // Far from the line, flat.
    expect(flat.heightAt(200, -200)).toBe(0);
  });
});
