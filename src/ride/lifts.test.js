import { describe, expect, it } from 'vitest';
import { layoutLift, liftKind, pointAlong } from './lifts.js';

const hill = (x, z) => 2000 + z * 0.4; // rises to the south

describe('lifts', () => {
  it('maps OSM aerialway types to kinds', () => {
    expect(liftKind('chair_lift')).toBe('chair');
    expect(liftKind('gondola')).toBe('cabin');
    expect(liftKind('t-bar')).toBe('drag');
    expect(liftKind('platter')).toBe('drag');
    expect(liftKind('magic_carpet')).toBe('carpet');
  });

  it('runs bottom to top even if drawn the other way', () => {
    const lift = layoutLift({ id: 'a', name: 'TSD Test', type: 'chair_lift', line: [[0, 1000], [0, 0]] }, hill);
    expect(lift.bottom.y).toBeLessThan(lift.top.y);
    expect(lift.bottom.z).toBe(0);
  });

  it('spaces towers no further apart than the spec and keeps cables above the snow', () => {
    const lift = layoutLift({ id: 'a', name: '', type: 'chair_lift', line: [[0, 0], [300, 400], [300, 1000]] }, hill);
    expect(lift.length).toBeCloseTo(1100);
    for (let i = 1; i < lift.towers.length; i++) {
      const a = lift.towers[i - 1];
      const b = lift.towers[i];
      expect(Math.hypot(b.x - a.x, b.z - a.z)).toBeLessThanOrEqual(lift.spec.spacing + 1e-6);
    }
    const p = [];
    for (let d = 0; d < lift.upCum.at(-1); d += 10) {
      pointAlong(lift.up, lift.upCum, d, p);
      expect(p[1]).toBeGreaterThan(hill(p[0], p[2]) + 2);
    }
  });

  it('samples points along a polyline', () => {
    const pts = [[0, 0], [10, 0], [10, 10]];
    expect(pointAlong(pts, [0, 10, 20], 15)).toEqual([10, 5]);
    expect(pointAlong(pts, [0, 10, 20], 99)).toEqual([10, 10]);
  });
});
