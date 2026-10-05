import { describe, expect, it } from 'vitest';
import { smoothTowards } from './input.js';

describe('steering smoothing', () => {
  it('rolls a held side in smoothly, without overshoot, and back out', () => {
    const trace = [];
    for (let t = 0; t < 0.6; t += 1 / 60) trace.push(smoothTowards(1, 1 / 60, true));
    // Monotonic ramp, no jump on the first frame, nearly there after ~0.4 s, never past 1.
    expect(trace[0]).toBeLessThan(0.1);
    for (let i = 1; i < trace.length; i++) expect(trace[i]).toBeGreaterThanOrEqual(trace[i - 1] - 1e-9);
    expect(trace[24]).toBeGreaterThan(0.9);
    expect(Math.max(...trace)).toBeLessThanOrEqual(1);
    let v = 1;
    for (let t = 0; t < 0.35; t += 1 / 60) v = smoothTowards(0, 1 / 60, true);
    expect(Math.abs(v)).toBeLessThan(0.08);
  });

  it('stays stable at a slow frame rate', () => {
    let v = 0;
    for (let i = 0; i < 20; i++) v = smoothTowards(1, 0.1, false);
    expect(v).toBeCloseTo(1, 3);
  });
});
