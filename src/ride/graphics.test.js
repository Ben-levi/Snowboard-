import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { bakeLight } from './lightBake.js';
import { buildVillage, orientedBox, outwardIsRight } from './villageGeometry.js';
import { coniferGeometry, rockGeometry } from './natureGeometry.js';
import { chairGeometry, stationGeometry, towerGeometry } from './models.js';

const at = (img, i, j) => Array.from(img.data.slice((j * img.width + i) * 3, (j * img.width + i) * 3 + 3));

describe('light bake', () => {
  // 400 m square, flat at 2000 m, with a 150 m wall along x = 0 and a 60 m deep valley at x > 120.
  const heightAt = (x, z) => {
    if (Math.abs(x) < 10) return 2150;
    if (x > 120) return 1940;
    return 2000;
  };
  const sun = [1, 1, 0].map((v) => v / Math.SQRT2); // from +x, 45° up
  const img = bakeLight({ heightAt, x0: -200, z0: -200, width: 400, depth: 400, cols: 40, rows: 40, sun, maxHeight: 2200, reach: 400, skyReach: 200 });
  const texel = (x, z) => at(img, Math.floor((x + 200) / 10), Math.floor((z + 200) / 10));

  it('puts the ground behind a ridge in its shadow, and leaves open ground in the sun', () => {
    expect(texel(-60, 0)[0]).toBeLessThan(30); // 50 m behind a 150 m wall, sun at 45°
    expect(texel(-185, 0)[0]).toBeGreaterThan(220); // far enough behind it
    expect(texel(60, 0)[0]).toBeGreaterThan(220); // on the sunny side
  });

  it('gives hollows less sky than open ground and marks ridges', () => {
    expect(texel(150, 0)[1]).toBeLessThan(texel(-150, 0)[1]); // the valley next to the step sees less sky
    expect(texel(0, 0)[2]).toBeGreaterThan(160); // on top of the wall: a ridge
    expect(texel(-150, 100)[2]).toBe(128); // flat ground
  });
});

describe('village geometry', () => {
  const rect = [
    [0, 0],
    [20, 0],
    [20, 10],
    [0, 10],
  ];

  it('finds the oriented box of a rotated rectangle', () => {
    const a = 0.5;
    const ring = rect.map(([x, z]) => [x * Math.cos(a) - z * Math.sin(a), x * Math.sin(a) + z * Math.cos(a)]);
    const box = orientedBox(ring);
    expect(box.hu).toBeCloseTo(10, 5);
    expect(box.hv).toBeCloseTo(5, 5);
    expect(Math.abs(box.ux * Math.cos(a) + box.uz * Math.sin(a))).toBeCloseTo(1, 5); // long axis along the long side
  });

  it('knows which way each ring winds', () => {
    expect(outwardIsRight(rect)).not.toBe(outwardIsRight([...rect].reverse()));
  });

  it('builds outward-facing walls and a pitched roof that sheds to both sides', () => {
    for (const ring of [rect, [...rect].reverse()]) {
      const { facade, plain } = buildVillage([{ ring, base: 1998, top: 2012 }], { balconies: false });
      // Every wall triangle faces away from the middle of the building.
      for (let k = 0; k < facade.pos.length; k += 9) {
        const cx = (facade.pos[k] + facade.pos[k + 3] + facade.pos[k + 6]) / 3;
        const cz = (facade.pos[k + 2] + facade.pos[k + 5] + facade.pos[k + 8]) / 3;
        const out = (cx - 10) * facade.nor[k] + (cz - 5) * facade.nor[k + 2];
        expect(out).toBeGreaterThan(0);
      }
      const up = [];
      for (let k = 0; k < plain.nor.length; k += 3) if (plain.nor[k + 1] > 0.5) up.push(plain.nor[k + 2]);
      expect(up.some((nz) => nz > 0.2)).toBe(true);
      expect(up.some((nz) => nz < -0.2)).toBe(true);
      expect(Math.max(...plain.pos.filter((_, i) => i % 3 === 1))).toBeGreaterThan(2014); // ridge above the eave
    }
  });
});

describe('models', () => {
  const size = (g) => {
    g.computeBoundingBox();
    return g.boundingBox.getSize(new THREE.Vector3());
  };

  it('builds trees of the asked height, with coloured snow and needles', () => {
    const g = coniferGeometry({ height: 8, radius: 2.3 });
    expect(size(g).y).toBeGreaterThan(7);
    expect(size(g).y).toBeLessThan(9.5);
    const c = g.attributes.color.array;
    let snowy = 0;
    let green = 0;
    for (let i = 0; i < c.length; i += 3) (c[i] > 0.5 ? snowy++ : green++);
    expect(snowy).toBeGreaterThan(0);
    expect(green).toBeGreaterThan(snowy);
  });

  it('builds boulders, lift towers, stations and chairs with vertex colours', () => {
    for (const g of [rockGeometry(3), towerGeometry(10, 2.6, 'chair'), stationGeometry('chair', 2.6), chairGeometry()]) {
      expect(g.attributes.color.count).toBe(g.attributes.position.count);
      expect(g.attributes.position.count).toBeGreaterThan(30);
    }
    expect(size(towerGeometry(10, 2.6, 'chair')).y).toBeGreaterThan(10);
    expect(size(chairGeometry()).y).toBeGreaterThan(2.5); // hangs a few metres under its grip
  });
});
