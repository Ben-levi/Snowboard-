// Timed runs down real pistes. A named OSM piste is often several ways; they are chained top to bottom.

const DIFFICULTY_ORDER = ['novice', 'easy', 'intermediate', 'advanced', 'expert', 'freeride', ''];
export const GATE_SPACING = 150;
export const GATE_RADIUS = 22; // m: pass within this of a gate's centre
export const MISSED_PENALTY = 5; // s per skipped gate

const len = (pts) => {
  let l = 0;
  for (let i = 1; i < pts.length; i++) l += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  return l;
};

export function buildCourses(pistes, heightAt, { minLength = 300, minDrop = 25, join = 35 } = {}) {
  const groups = new Map();
  for (const p of pistes) {
    if (!p.name || p.line.length < 2) continue;
    const key = p.name.trim();
    if (!groups.has(key)) groups.set(key, []);
    // Orient each way downhill.
    const line = heightAt(...p.line[0]) >= heightAt(...p.line.at(-1)) ? p.line : [...p.line].reverse();
    groups.get(key).push({ ...p, line });
  }
  const courses = [];
  for (const [name, ways] of groups) {
    const left = [...ways];
    let best = null;
    while (left.length) {
      // Start a chain at the highest remaining way, then keep appending the way that starts nearest the end.
      left.sort((a, b) => heightAt(...b.line[0]) - heightAt(...a.line[0]));
      const first = left.shift();
      const chain = [...first.line];
      const parts = [first];
      for (;;) {
        const end = chain.at(-1);
        let bi = -1;
        let bd = join;
        left.forEach((w, i) => {
          const d = Math.hypot(w.line[0][0] - end[0], w.line[0][1] - end[1]);
          if (d < bd) {
            bd = d;
            bi = i;
          }
        });
        if (bi < 0) break;
        const [w] = left.splice(bi, 1);
        chain.push(...w.line.slice(1));
        parts.push(w);
      }
      const l = len(chain);
      if (!best || l > best.length) best = { line: chain, length: l, parts };
    }
    if (!best || best.length < minLength) continue;
    if (heightAt(...best.line[0]) - heightAt(...best.line.at(-1)) < minDrop) continue;
    const difficulty = best.parts.map((p) => p.difficulty).find(Boolean) ?? '';
    const top = heightAt(...best.line[0]);
    const bottom = heightAt(...best.line.at(-1));
    courses.push({
      id: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      name,
      difficulty,
      line: best.line,
      length: best.length,
      drop: top - bottom,
      gates: gatesAlong(best.line),
    });
  }
  courses.sort(
    (a, b) => DIFFICULTY_ORDER.indexOf(a.difficulty) - DIFFICULTY_ORDER.indexOf(b.difficulty) || a.name.localeCompare(b.name),
  );
  return courses;
}

// Gate points along a line: start at 0, then every GATE_SPACING, finish at the end.
export function gatesAlong(line, spacing = GATE_SPACING) {
  const gates = [];
  const total = len(line);
  const count = Math.max(1, Math.round(total / spacing));
  let seg = 1;
  let segStart = 0;
  for (let k = 0; k <= count; k++) {
    const d = (k / count) * total;
    while (seg < line.length - 1 && segStart + Math.hypot(line[seg][0] - line[seg - 1][0], line[seg][1] - line[seg - 1][1]) < d) {
      segStart += Math.hypot(line[seg][0] - line[seg - 1][0], line[seg][1] - line[seg - 1][1]);
      seg++;
    }
    const [ax, az] = line[seg - 1];
    const [bx, bz] = line[seg];
    const sl = Math.hypot(bx - ax, bz - az) || 1;
    const f = Math.min(1, Math.max(0, (d - segStart) / sl));
    gates.push({ x: ax + (bx - ax) * f, z: az + (bz - az) * f, dirX: (bx - ax) / sl, dirZ: (bz - az) / sl, d });
  }
  return gates;
}

export function createRun(course) {
  return { course, next: 0, started: false, finished: false, startTime: 0, time: 0, missed: 0 };
}

// Advance a run with the rider's position at time t (s). The clock starts when the rider sets off
// from the start gate (speed above 1.5 m/s). Returns what happened this update.
export function updateRun(run, x, z, t, speed = Infinity) {
  const ev = {};
  if (run.finished) return ev;
  const gates = run.course.gates;
  const near = (g) => Math.hypot(x - g.x, z - g.z) < GATE_RADIUS;
  if (!run.started) {
    if (near(gates[0]) && speed > 1.5) {
      run.started = true;
      run.startTime = t;
      run.next = 1;
      ev.started = true;
    }
    return ev;
  }
  // Look a few gates ahead so a skipped gate costs time instead of ending the run.
  for (let k = run.next; k < Math.min(gates.length, run.next + 4); k++) {
    if (!near(gates[k])) continue;
    run.missed += k - run.next;
    if (k > run.next) ev.missed = k - run.next;
    run.next = k + 1;
    ev.gate = k;
    if (run.next >= gates.length) run.finished = true;
    break;
  }
  run.time = t - run.startTime + run.missed * MISSED_PENALTY;
  if (run.finished) ev.finished = run.time;
  return ev;
}

export function formatTime(s) {
  if (!Number.isFinite(s)) return '–';
  const m = Math.floor(s / 60);
  const rest = s - m * 60;
  return `${m}:${rest.toFixed(2).padStart(5, '0')}`;
}
