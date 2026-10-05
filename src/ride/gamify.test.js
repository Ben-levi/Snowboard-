import { describe, expect, it } from 'vitest';
import { simulateRun } from './bot.js';
import { gatesAlong } from './courses.js';
import { decodeGhost, encodeGhost, ghostAt } from './ghost.js';
import { isUnlocked, medalFor, recordResult, starsNeeded, targetsFor, totalStars } from './medals.js';

// A 20° slope (downhill = +z) with a winding course down it.
const tan = Math.tan((20 * Math.PI) / 180);
const heightAt = (x, z) => 2000 - z * tan;
const normalAt = (x, z, out = [0, 1, 0]) => {
  const l = Math.hypot(tan, 1);
  out[0] = 0;
  out[1] = 1 / l;
  out[2] = tan / l;
  return out;
};
const world = { heightAt, normalAt };
const line = Array.from({ length: 41 }, (_, k) => [Math.sin(k / 5) * 40, k * 25]);
const course = { id: 'test', name: 'Test', difficulty: 'intermediate', line, gates: gatesAlong(line) };

describe('bot', () => {
  it('rides a winding course through every gate without crashing', () => {
    const r = simulateRun(course, world, { x: 0, z: 0, heading: 0 });
    expect(r.finished).toBe(true);
    expect(r.missed).toBe(0);
    expect(r.crashes).toBe(0);
    const avg = 1000 / r.time;
    expect(avg).toBeGreaterThan(8); // holding a red-run pace
    expect(avg).toBeLessThan(20);
    expect(r.ghost.length / 5).toBeGreaterThan(r.time * 9); // ~10 samples a second
    expect(r.splits.filter(Boolean).length).toBe(course.gates.length - 1);
  });
});

describe('medals', () => {
  const targets = targetsFor(60);

  it('awards gold, silver, bronze or nothing', () => {
    expect(medalFor(59, targets)).toBe('gold');
    expect(medalFor(66, targets)).toBe('silver');
    expect(medalFor(77, targets)).toBe('bronze');
    expect(medalFor(90, targets)).toBe(null);
  });

  it('keeps the best time and the best medal', () => {
    let { progress, record, medal } = recordResult({}, 'a', 66, targets);
    expect(record).toBe(true);
    expect(medal).toBe('silver');
    ({ progress, record } = recordResult(progress, 'a', 80, targets));
    expect(record).toBe(false);
    expect(progress.a).toEqual({ best: 66, medal: 'silver' });
    ({ progress } = recordResult(progress, 'a', 58, targets));
    expect(progress.a).toEqual({ best: 58, medal: 'gold' });
    expect(totalStars({ ...progress, b: { best: 1, medal: 'bronze' } })).toBe(4);
  });

  it('unlocks harder runs with stars', () => {
    expect(isUnlocked({ tier: 0 }, 0)).toBe(true);
    expect(isUnlocked({ tier: 1 }, 2)).toBe(false);
    expect(isUnlocked({ tier: 1 }, 3)).toBe(true);
    expect(starsNeeded({ tier: 2 })).toBe(9);
    expect(isUnlocked({ tier: 'bx' }, 5)).toBe(true);
  });
});

describe('ghost', () => {
  const samples = [0, 0, 100, 0, 0, 0.1, 1, 99, 2, 0.2, 0.2, 2, 98, 4, Math.PI - 0.1, 0.3, 3, 97, 6, -Math.PI + 0.1];

  it('survives an encode/decode round trip', () => {
    const back = decodeGhost(encodeGhost(samples));
    expect(back.length).toBe(samples.length);
    back.forEach((v, i) => expect(v).toBeCloseTo(samples[i], 5));
  });

  it('interpolates position and takes the short way round for heading', () => {
    const data = Float32Array.from(samples);
    const g = ghostAt(data, 0.05);
    expect(g.x).toBeCloseTo(0.5);
    expect(g.z).toBeCloseTo(1);
    const h = ghostAt(data, 0.25); // between π-0.1 and -π+0.1: should pass through ±π, not 0
    expect(Math.abs(Math.cos(h.heading))).toBeGreaterThan(0.99);
    expect(ghostAt(data, 5).done).toBe(true);
    expect(ghostAt(data, 5).x).toBeCloseTo(3);
  });
});
