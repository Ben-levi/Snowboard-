import { describe, expect, it } from 'vitest';
import { addDisc, createRaster, fillPolygon, sample, strokeLine } from './raster.js';
import { decodeHeights, encodeHeights } from './terrainCodec.js';
import { makeHeightfield } from './terrainData.js';
import { parseWorld, serializeWorld } from './worldPrep.js';

describe('raster', () => {
  it('fills a polygon exactly over the pixels it covers', () => {
    const r = createRaster(10, 10);
    fillPolygon(r, [[2, 2], [6, 2], [6, 5], [2, 5]], 0);
    let count = 0;
    for (let j = 0; j < 10; j++) for (let i = 0; i < 10; i++) count += sample(r, i, j, 0) ? 1 : 0;
    expect(count).toBe(4 * 3);
    expect(sample(r, 2, 2, 0)).toBe(255);
    expect(sample(r, 6, 2, 0)).toBe(0);
  });

  it('strokes a thick line with round ends', () => {
    const r = createRaster(20, 10);
    strokeLine(r, [[2, 5], [17, 5]], 4, 2);
    expect(sample(r, 10, 5, 2)).toBe(255);
    expect(sample(r, 10, 6, 2)).toBe(255);
    expect(sample(r, 10, 8, 2)).toBe(0);
    expect(sample(r, 0, 5, 2)).toBe(255); // cap reaches 2 px past the end
    expect(sample(r, 10, 5, 0)).toBe(0); // other channels untouched
  });

  it('adds discs up to saturation', () => {
    const r = createRaster(10, 10);
    addDisc(r, 5, 5, 2, 1, 140);
    addDisc(r, 5, 5, 2, 1, 140);
    expect(sample(r, 5, 5, 1)).toBe(255);
    expect(sample(r, 9, 9, 1)).toBe(0);
  });
});

describe('terrain codec', () => {
  it('round-trips heights', () => {
    const cols = 6;
    const values = Uint16Array.from({ length: 7 * 5 }, (_, k) => 30000 + Math.round(Math.sin(k) * 400) + (k % 7) * 3);
    values[0] = 0;
    values[5] = 65535;
    expect(Array.from(decodeHeights(encodeHeights(values, cols), cols))).toEqual(Array.from(values));
  });
});

describe('world.json', () => {
  it('serializes and parses back, with heights from the terrain and fewer trees on light presets', () => {
    const near = makeHeightfield({ cols: 10, rows: 10, cell: 10, base: 2000, scale: 0.05 }, new Uint16Array(121).fill(200));
    const course = { id: 'a', name: 'A', difficulty: 'easy', line: [[0, 0], [10.04, 20]], gates: [{ x: 0, z: 0, dirX: 0.4472, dirZ: 0.8944, d: 0 }], length: 22.36, drop: 5, width: 30 };
    const world = {
      courses: [course],
      trees: [
        { x: 1, z: 2, s: 1, rot: 0.5, keep: 0.2 },
        { x: 3, z: 4, s: 0.8, rot: 1, keep: 0.9 },
      ],
      markers: [{ x: 5, z: 5, color: '#2f7cf6' }],
      furniture: { nets: [{ x: 1, z: 1, yaw: 0.3, len: 12.5 }], pads: [{ x: 2, z: 2 }], guns: [{ x: 3, z: 3, yaw: 1 }], signs: [{ x: 4, z: 4, yaw: 0, name: 'A', difficulty: 'easy', boardercross: false }] },
    };
    const json = JSON.parse(JSON.stringify(serializeWorld(world, { a: 61.5 })));
    expect(json.courses[0].par).toBe(61.5);
    const full = parseWorld(json, near, 1);
    expect(full.trees).toHaveLength(2);
    expect(full.trees[0]).toMatchObject({ x: 1, z: 2, y: 2010 });
    expect(full.markers[0]).toMatchObject({ x: 5, z: 5, color: '#2f7cf6', y: 2010 });
    expect(full.furniture.nets[0]).toMatchObject({ len: 12.5, yaw: 0.3 });
    expect(full.courses[0].line[1]).toEqual([10, 20]);
    expect(parseWorld(json, near, 0.35).trees).toHaveLength(1);
  });
});
