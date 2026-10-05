// An automatic rider: steers along a course line using the real physics. It sets the medal times
// (its run is gold and becomes the first ghost) and drives the other riders on the mountain.
import { createRider, step, STEP } from './physics.js';
import { createRun, updateRun } from './courses.js';
import { pointAlong } from './lifts.js';
import { createRecorder, record } from './ghost.js';

// Cruising speeds (m/s) a strong rider holds on each kind of run.
export const TARGET_SPEED = { novice: 9, easy: 12.5, intermediate: 16, advanced: 17, expert: 17, freeride: 16, '': 12.5 };
export const BX_SPEED = 13;

const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

function cumulative(line) {
  const cum = [0];
  for (let i = 1; i < line.length; i++) cum.push(cum[i - 1] + Math.hypot(line[i][0] - line[i - 1][0], line[i][1] - line[i - 1][1]));
  return cum;
}

// offset: metres to the right of the line to ride (other riders spread across the piste).
export function createBot(course, { speed, offset = 0 } = {}) {
  return {
    line: course.line,
    cum: cumulative(course.line),
    at: 0, // distance along the line of the closest point
    speed: speed ?? (course.boardercross ? BX_SPEED : TARGET_SPEED[course.difficulty] ?? 12.5),
    offset,
  };
}

// Advance the bot's idea of where it is along the line: search a little ahead, or the whole line
// when it has wandered off (`lost`).
function track(bot, x, z) {
  const { line, cum } = bot;
  let best = bot.at;
  let bestD = Infinity;
  for (let s = 1; s < line.length; s++) {
    if (cum[s] < bot.at - (bot.lost ? 60 : 30)) continue;
    if (!bot.lost && cum[s - 1] > bot.at + 120) break;
    const [ax, az] = line[s - 1];
    const [bx, bz] = line[s];
    const dx = bx - ax;
    const dz = bz - az;
    const l2 = dx * dx + dz * dz || 1;
    const t = Math.min(1, Math.max(0, ((x - ax) * dx + (z - az) * dz) / l2));
    const d = Math.hypot(x - (ax + t * dx), z - (az + t * dz));
    if (d < bestD) {
      bestD = d;
      best = cum[s - 1] + t * Math.sqrt(l2);
    }
  }
  bot.at = bot.lost ? best : Math.max(bot.at, best);
  bot.off = bestD;
  bot.lost = bestD > 50;
  return bestD;
}

const p = [];
const q = [];
export function botInput(bot, s) {
  track(bot, s.x, s.z);
  const v = s.speed;
  // Far off the line: head back to it (short look-ahead), otherwise look further ahead with speed.
  const ahead = bot.at + (bot.off > 20 ? 4 : 7 + v * 0.8);
  pointAlong(bot.line, bot.cum, ahead, p);
  pointAlong(bot.line, bot.cum, ahead + 2, q);
  let tx = p[0];
  let tz = p[1];
  if (bot.offset) {
    const dx = q[0] - p[0];
    const dz = q[1] - p[1];
    const l = Math.hypot(dx, dz) || 1;
    tx += (-dz / l) * bot.offset;
    tz += (dx / l) * bot.offset;
  }
  // Aim the direction of travel at the target point; when slow, aim the board itself (and when
  // riding switch, its tail), since the direction of travel is mostly gravity then.
  const switchFix = Math.cos(Math.atan2(s.vx, s.vz) - s.heading) < 0 ? Math.PI : 0;
  const travel = v > 5 ? Math.atan2(s.vx, s.vz) : s.heading + (v > 1 ? switchFix : 0);
  const want = Math.atan2(tx - s.x, tz - s.z);
  const err = wrap(want - travel);
  const steer = Math.max(-1, Math.min(1, -err * 2.6));
  const over = v - bot.speed;
  return {
    steer,
    tuck: over < -2 && Math.abs(err) < 0.25 ? 1 : 0,
    brake: over > 1.5 ? Math.min(1, over / 5) : 0,
    jump: false,
  };
}

export const botDone = (bot) => bot.at >= bot.cum.at(-1) - 3;

// Ride a whole course with the bot as fast as the physics allows. Returns the timed run, a ghost
// recording and the gate split times. `start` = { x, z, heading } (see resortFeatures starts).
export function simulateRun(course, world, start, { maxTime = 600, speed } = {}) {
  const rider = createRider(world, start.x, start.z, start.heading);
  const bot = createBot(course, { speed });
  const run = createRun(course);
  const rec = createRecorder();
  const splits = [];
  let crashes = 0;
  for (let t = 0; t < maxTime && !run.finished; t += STEP) {
    const e = step(rider, botInput(bot, rider), world);
    if (e.crashed) crashes++;
    const ev = updateRun(run, rider.x, rider.z, rider.time, rider.speed);
    if (ev.gate !== undefined) splits[ev.gate] = run.time;
    if (run.started) record(rec, rider.time - run.startTime, rider);
  }
  return { finished: run.finished, time: run.time, missed: run.missed, crashes, ghost: rec.samples, splits };
}
