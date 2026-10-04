import { describe, expect, it } from 'vitest';
import { buildCourses, createRun, formatTime, gatesAlong, MISSED_PENALTY, updateRun } from './courses.js';

const heightAt = (x, z) => 2500 - z * 0.3; // downhill to the south

describe('courses', () => {
  const pistes = [
    // Drawn uphill, in two pieces, out of order.
    { name: 'Llarga', difficulty: 'intermediate', line: [[0, 1000], [0, 600]] },
    { name: 'Llarga', difficulty: 'intermediate', line: [[0, 590], [10, 0]] },
    { name: 'Curta', difficulty: 'easy', line: [[100, 0], [100, 100]] }, // too short
    { name: '', difficulty: 'easy', line: [[200, 0], [200, 900]] }, // unnamed
  ];
  const courses = buildCourses(pistes, heightAt);

  it('chains named pieces top to bottom and drops short or unnamed pistes', () => {
    expect(courses.map((c) => c.name)).toEqual(['Llarga']);
    const [c] = courses;
    expect(c.line[0][1]).toBeLessThan(c.line.at(-1)[1]); // starts at the top (north)
    expect(c.length).toBeGreaterThan(990);
    expect(c.drop).toBeCloseTo(300, 0);
    expect(c.difficulty).toBe('intermediate');
  });

  it('spaces gates evenly from start to finish', () => {
    const gates = gatesAlong([[0, 0], [0, 300], [300, 300]], 150);
    expect(gates).toHaveLength(5);
    expect(gates[0]).toMatchObject({ x: 0, z: 0 });
    expect(gates[2]).toMatchObject({ x: 0, z: 300 });
    expect(gates[4]).toMatchObject({ x: 300, z: 300 });
  });

  it('times a run through the gates in order', () => {
    const run = createRun(courses[0]);
    const gates = courses[0].gates;
    expect(updateRun(run, 500, 500, 0)).toEqual({}); // nowhere near the start
    expect(updateRun(run, gates[0].x, gates[0].z, 1).started).toBe(true);
    let finished;
    gates.slice(1).forEach((g, i) => {
      const ev = updateRun(run, g.x + 5, g.z, 2 + i * 5);
      if (ev.finished) finished = ev.finished;
    });
    expect(run.finished).toBe(true);
    expect(finished).toBeCloseTo(1 + (gates.length - 2) * 5);
    expect(run.missed).toBe(0);
  });

  it('adds a penalty for a skipped gate', () => {
    const run = createRun(courses[0]);
    const g = courses[0].gates;
    updateRun(run, g[0].x, g[0].z, 0);
    const ev = updateRun(run, g[2].x, g[2].z, 10); // skipped gate 1
    expect(ev.missed).toBe(1);
    expect(run.time).toBeCloseTo(10 + MISSED_PENALTY);
  });

  it('formats times as m:ss.cc', () => {
    expect(formatTime(75.456)).toBe('1:15.46');
    expect(formatTime(9.5)).toBe('0:09.50');
  });
});
