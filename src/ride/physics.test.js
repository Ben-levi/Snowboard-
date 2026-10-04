import { describe, expect, it } from 'vitest';
import { createRider, findSpawn, PARAMS, step, STEP } from './physics.js';
import { makeHeightfield } from './terrainData.js';

// Analytic worlds: height(x, z) with numeric normals.
function world(height, extra = {}) {
  const normalAt = (x, z, out = [0, 1, 0]) => {
    const e = 0.5;
    const dx = (height(x + e, z) - height(x - e, z)) / (2 * e);
    const dz = (height(x, z + e) - height(x, z - e)) / (2 * e);
    const l = Math.hypot(dx, 1, dz);
    out[0] = -dx / l;
    out[1] = 1 / l;
    out[2] = -dz / l;
    return out;
  };
  return { heightAt: height, normalAt, ...extra };
}

const flat = world(() => 0);
const slope = (deg) => world((x, z) => -z * Math.tan((deg * Math.PI) / 180)); // downhill = +z
const run = (s, w, input, seconds, P = PARAMS) => {
  const log = [];
  for (let t = 0; t < seconds; t += STEP) log.push({ ...step(s, input, w, STEP, P), x: s.x, z: s.z, speed: s.speed });
  return log;
};
const idle = { steer: 0, tuck: 0, brake: 0, jump: false };

describe('snowboard physics', () => {
  it('stops on the flat', () => {
    const s = createRider(flat, 0, 0, 0);
    s.vz = 10;
    run(s, flat, idle, 20);
    expect(s.speed).toBeLessThan(0.05);
    expect(s.z).toBeGreaterThan(20);
    expect(s.z).toBeLessThan(80);
  });

  it('accelerates down a slope to a terminal speed', () => {
    const w = slope(20);
    const s = createRider(w, 0, 0, 0);
    run(s, w, idle, 5);
    const at5 = s.speed;
    run(s, w, idle, 55);
    const th = (20 * Math.PI) / 180;
    const terminal = Math.sqrt((PARAMS.g * Math.sin(th) - PARAMS.muOff * PARAMS.g * Math.cos(th)) / PARAMS.drag);
    expect(at5).toBeGreaterThan(10);
    expect(s.speed).toBeGreaterThan(at5);
    expect(Math.abs(s.speed - terminal) / terminal).toBeLessThan(0.03);
    expect(Math.abs(s.x)).toBeLessThan(0.01); // straight down the fall line
  });

  it('carves an arc of radius sidecut / sin(edge) without losing speed', () => {
    const P = { ...PARAMS, muOff: 0, drag: 0 };
    const s = createRider(flat, 0, 0, Math.PI / 2); // heading east
    s.vx = 6;
    run(s, flat, { ...idle, steer: 1 }, 0.5, P); // edge comes up
    const start = { x: s.x, z: s.z, speed: s.speed, heading: s.heading };
    const log = run(s, flat, { ...idle, steer: 1 }, 3, P);
    const expectedR = P.sidecut / Math.sin(P.maxEdge);
    const turned = start.heading - s.heading;
    const dist = log.length * STEP * start.speed;
    expect(turned).toBeGreaterThan(0); // steering right lowers the heading
    expect(Math.abs(dist / turned - expectedR) / expectedR).toBeLessThan(0.05);
    expect(Math.abs(s.speed - start.speed)).toBeLessThan(0.1);
  });

  it('skids to a stop with the board across the direction of travel', () => {
    const s = createRider(flat, 0, 0, 0); // board points south
    s.vx = 8; // moving east, sideways to the board
    run(s, flat, { ...idle, brake: 1 }, 1.5);
    expect(s.speed).toBeLessThan(0.1);
  });

  it('takes off over a convex break and lands cleanly', () => {
    const t20 = Math.tan((20 * Math.PI) / 180);
    const t40 = Math.tan((40 * Math.PI) / 180);
    const w = world((x, z) => (z < 60 ? -z * t20 : -60 * t20 - (z - 60) * t40));
    const s = createRider(w, 0, 0, 0);
    s.vz = 18;
    let flew = false;
    let landed = null;
    for (let t = 0; t < 8 && !landed; t += STEP) {
      const e = step(s, idle, w);
      if (s.airborne) flew = true;
      if (e.landed) landed = e.landed;
      expect(e.crashed).toBeFalsy();
    }
    expect(flew).toBe(true);
    expect(landed.airTime).toBeGreaterThan(0.1);
  });

  it('ollies when the jump is released', () => {
    const s = createRider(flat, 0, 0, 0);
    s.vz = 5;
    run(s, flat, { ...idle, jump: true }, 0.5);
    expect(s.airborne).toBe(false);
    const events = run(s, flat, idle, 2);
    expect(events.some((e) => e.jumped)).toBe(true);
    const landed = events.find((e) => e.landed);
    expect(landed.landed.airTime).toBeGreaterThan(0.8); // fully loaded: 6 m/s → ~1.2 s
  });

  it('crashes when landing sideways', () => {
    const s = createRider(flat, 0, 0, 0);
    s.vz = 8;
    s.vy = 4;
    s.y = 0.1;
    s.airborne = true;
    s.heading = Math.PI / 2; // board turned 90° to travel
    const events = run(s, flat, idle, 1.2);
    expect(events.some((e) => e.crashed)).toBe(true);
  });

  it('crashes into obstacles at speed and stays out of them', () => {
    const tree = { x: 0, z: 10, r: 0.6 };
    const w = { ...flat, obstaclesNear: () => [tree] };
    const s = createRider(w, 0, 0, 0);
    s.vz = 12;
    const events = run(s, w, idle, 2);
    expect(events.some((e) => e.crashed)).toBe(true);
    expect(Math.hypot(s.x - tree.x, s.z - tree.z)).toBeGreaterThanOrEqual(tree.r + PARAMS.radius - 1e-6);
  });

  it('keeps the rider inside the map', () => {
    const w = { ...slope(25), x0: -100, z0: -100, width: 200, depth: 200 };
    const s = createRider(w, 0, 0, 0);
    run(s, w, idle, 30);
    expect(s.z).toBeLessThanOrEqual(100 - PARAMS.edgeMargin + 1e-9);
  });
});

describe('heightfield', () => {
  const field = makeHeightfield(
    { cols: 2, rows: 2, cell: 10, base: 100, scale: 0.5 },
    new Uint16Array([0, 20, 40, 0, 20, 40, 0, 20, 40]), // rises 10 m per cell eastwards
  );

  it('samples bilinearly in the local frame', () => {
    expect(field.x0).toBe(-10);
    expect(field.heightAt(-10, -10)).toBe(100);
    expect(field.heightAt(0, 0)).toBe(110);
    expect(field.heightAt(5, 3)).toBeCloseTo(115);
    expect(field.heightAt(50, 0)).toBe(120); // clamped
  });

  it('returns unit normals tilted away from the rise', () => {
    const n = field.normalAt(0, 0);
    expect(Math.hypot(...n)).toBeCloseTo(1);
    expect(n[0]).toBeLessThan(0);
    expect(n[2]).toBeCloseTo(0);
  });

  it('finds a spawn on a rideable slope', () => {
    const ramp = makeHeightfield(
      { cols: 40, rows: 40, cell: 5, base: 0, scale: 0.05 },
      Uint16Array.from({ length: 41 * 41 }, (_, k) => (40 - Math.floor(k / 41)) * 40), // 2 m drop per 5 m south (~22°)
    );
    const spawn = findSpawn(ramp);
    expect(spawn.heading).toBeCloseTo(0); // facing downhill (south)
    expect(spawn.z).toBeLessThan(-20); // high up the ramp
  });
});
