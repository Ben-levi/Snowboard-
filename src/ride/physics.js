// Snowboard physics on a heightfield. Pure functions, fixed time step (see STEP).
// Frame: x east, y up, z south (metres). The board points along `heading`: forward = (sin h, 0, cos h).
// Turning right (rider's view) lowers the heading; edge > 0 is the right-hand edge.

import { closestOnRing, pointInRing } from './obstacles.js';

export const STEP = 1 / 120;
const wall = [0, 0];

export const PARAMS = {
  g: 9.81,
  muPiste: 0.045, // snow friction on groomed pistes
  muOff: 0.085, // ungroomed / off-piste
  drag: 0.0042, // air drag per metre (a = drag * v²); tucking lowers it
  dragTuck: 0.0029,
  sidecut: 7.5, // m; carve radius = sidecut / sin(edge angle)
  maxEdge: 1.0, // rad (~57°)
  edgeRate: 4.5, // rad/s towards the target edge
  grip: 13, // m/s², the most sideways acceleration an edge holds before it skids
  skid: 5.5, // m/s², sideways slip braking
  brake: 6, // m/s², extra braking when the rider throws the board sideways
  pivot: 2.6, // rad/s, turning on the spot when slow
  push: 1.6, // m/s², skating push on the flat
  ollie: 3.0, // m/s off the snow, 6 m/s fully loaded
  ollieCharged: 6.0,
  charge: 0.45, // s to fully load an ollie
  spin: 5.5, // rad/s spin in the air
  crashTime: 1.8,
  landTolerance: 0.95, // rad between board and travel that still lands clean
  hardLanding: 15, // m/s into the slope breaks the landing
  impact: 7, // m/s into an obstacle = crash
  radius: 0.45, // rider collision radius
  edgeMargin: 25, // m kept inside the map
  stick: 0.012, // m: the board rides over kinks this small instead of taking off (the grid is 7 m)
};

export function createRider(world, x, z, heading = 0) {
  return {
    x, y: world.heightAt(x, z), z,
    vx: 0, vy: 0, vz: 0,
    heading, edge: 0, charge: 0, jumpHeld: false,
    airborne: false, airTime: 0, crashed: 0,
    speed: 0, onPiste: false, time: 0,
  };
}

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const n0 = [0, 1, 0];
const n1 = [0, 1, 0];

// Rotate (vx, vz)-plus-vy velocity about the unit axis n by angle a (Rodrigues).
function rotateVelocity(s, n, a) {
  const c = Math.cos(a);
  const sn = Math.sin(a);
  const v = [s.vx, s.vy, s.vz];
  const k = dot(n, v) * (1 - c);
  const cx = n[1] * v[2] - n[2] * v[1];
  const cy = n[2] * v[0] - n[0] * v[2];
  const cz = n[0] * v[1] - n[1] * v[0];
  s.vx = v[0] * c + cx * sn + n[0] * k;
  s.vy = v[1] * c + cy * sn + n[1] * k;
  s.vz = v[2] * c + cz * sn + n[2] * k;
}

function projectOnPlane(s, n) {
  const vn = s.vx * n[0] + s.vy * n[1] + s.vz * n[2];
  s.vx -= vn * n[0];
  s.vy -= vn * n[1];
  s.vz -= vn * n[2];
  return vn;
}

// Board forward and right vectors in the plane of the snow.
export function boardAxes(heading, n) {
  const f = [Math.sin(heading), 0, Math.cos(heading)];
  const fn = dot(f, n);
  f[0] -= fn * n[0];
  f[1] -= fn * n[1];
  f[2] -= fn * n[2];
  const fl = Math.hypot(f[0], f[1], f[2]) || 1;
  f[0] /= fl;
  f[1] /= fl;
  f[2] /= fl;
  // right = forward × up(normal)
  const r = [f[1] * n[2] - f[2] * n[1], f[2] * n[0] - f[0] * n[2], f[0] * n[1] - f[1] * n[0]];
  return { f, r };
}

// Slow the velocity by `decel` (m/s²) without reversing it.
function brakeSpeed(s, decel, dt) {
  const sp = Math.hypot(s.vx, s.vy, s.vz);
  if (sp < 1e-6) return;
  const k = Math.max(0, sp - decel * dt) / sp;
  s.vx *= k;
  s.vy *= k;
  s.vz *= k;
}

function crash(s, events) {
  s.crashed = PARAMS.crashTime;
  s.vx *= 0.35;
  s.vy = 0;
  s.vz *= 0.35;
  s.edge = 0;
  s.charge = 0;
  events.crashed = true;
}

function collide(s, world, P, events) {
  const obstacles = world.obstaclesNear?.(s.x, s.z);
  if (obstacles) {
    for (const o of obstacles) {
      let nx;
      let nz;
      if (o.ring) {
        // Building footprint: push out to the nearest wall.
        if (s.x < o.minX - P.radius || s.x > o.maxX + P.radius || s.z < o.minZ - P.radius || s.z > o.maxZ + P.radius) continue;
        const [cx, cz] = closestOnRing(s.x, s.z, o.ring, wall);
        const inside = pointInRing(s.x, s.z, o.ring);
        const dx = s.x - cx;
        const dz = s.z - cz;
        const d = Math.hypot(dx, dz);
        if (!inside && d >= P.radius) continue;
        if (d < 1e-6) continue;
        nx = (inside ? -dx : dx) / d;
        nz = (inside ? -dz : dz) / d;
        s.x = cx + nx * P.radius;
        s.z = cz + nz * P.radius;
      } else {
        const dx = s.x - o.x;
        const dz = s.z - o.z;
        const d = Math.hypot(dx, dz);
        const min = o.r + P.radius;
        if (d >= min || d < 1e-6) continue;
        nx = dx / d;
        nz = dz / d;
        s.x = o.x + nx * min;
        s.z = o.z + nz * min;
      }
      const vin = s.vx * nx + s.vz * nz;
      if (vin < 0) {
        if (-vin > P.impact && !s.crashed) crash(s, events);
        s.vx -= 1.4 * vin * nx;
        s.vz -= 1.4 * vin * nz;
        events.bumped = true;
      }
    }
  }
  // Soft wall at the edge of the baked map.
  if (world.x0 !== undefined) {
    const m = P.edgeMargin;
    const lo = [world.x0 + m, world.z0 + m];
    const hi = [world.x0 + world.width - m, world.z0 + world.depth - m];
    if (s.x < lo[0]) (s.x = lo[0]), (s.vx = Math.max(0, s.vx));
    if (s.x > hi[0]) (s.x = hi[0]), (s.vx = Math.min(0, s.vx));
    if (s.z < lo[1]) (s.z = lo[1]), (s.vz = Math.max(0, s.vz));
    if (s.z > hi[1]) (s.z = hi[1]), (s.vz = Math.min(0, s.vz));
  }
}

// Advance one step. input = { steer: -1..1 (right +), tuck: 0..1, brake: 0..1, jump: bool (held) }.
// Returns events { jumped, landed, crashed, bumped, carve, skid } for effects and sound.
export function step(s, input, world, dt = STEP, P = PARAMS) {
  const events = { carve: 0, skid: 0 };
  const steer = clamp(input.steer ?? 0, -1, 1);
  const tuck = clamp(input.tuck ?? 0, 0, 1);
  const brake = clamp(input.brake ?? 0, 0, 1);
  s.time += dt;

  // Down and sliding to a stop after a crash.
  if (s.crashed > 0) {
    s.crashed = Math.max(0, s.crashed - dt);
    const n = world.normalAt(s.x, s.z, n0);
    projectOnPlane(s, n);
    brakeSpeed(s, 7, dt);
    s.x += s.vx * dt;
    s.z += s.vz * dt;
    s.y = world.heightAt(s.x, s.z);
    s.airborne = false;
    collide(s, world, P, events);
    s.speed = Math.hypot(s.vx, s.vy, s.vz);
    if (!s.crashed) {
      s.vx = s.vy = s.vz = 0;
    }
    return events;
  }

  s.onPiste = world.surfaceAt ? world.surfaceAt(s.x, s.z) === 'piste' : false;
  const drag = P.drag + (P.dragTuck - P.drag) * tuck;

  if (!s.airborne) {
    const n = world.normalAt(s.x, s.z, n0);
    projectOnPlane(s, n);
    const { f, r } = boardAxes(s.heading, n);

    // Edge follows the stick.
    const target = steer * P.maxEdge;
    s.edge += clamp(target - s.edge, -P.edgeRate * dt, P.edgeRate * dt);

    let speed = Math.hypot(s.vx, s.vy, s.vz);
    const vf = s.vx * f[0] + s.vy * f[1] + s.vz * f[2];

    // Carving: the edge bends the board into an arc; heading and velocity turn together (no speed lost).
    let kappa = Math.sin(Math.abs(s.edge)) / P.sidecut;
    if (kappa * vf * vf > P.grip) kappa = P.grip / (vf * vf);
    const carve = -Math.sign(s.edge) * kappa * vf * dt;
    s.heading += carve;
    rotateVelocity(s, n, carve);
    events.carve = Math.abs(kappa * vf * vf);

    // Slow: pivot the board on the spot.
    const pivotW = clamp(1 - speed / 4, 0, 1);
    s.heading -= steer * P.pivot * pivotW * dt;

    // Sideways slip relative to the (turned) board is braked: hard on an edge, gently on a flat base
    // (so a flat board side-slips down the fall line). Throwing the board sideways (brake) adds more.
    const axes = boardAxes(s.heading, n);
    const vl = s.vx * axes.r[0] + s.vy * axes.r[1] + s.vz * axes.r[2];
    const edgeGrip = 0.25 + 0.75 * Math.min(1, Math.abs(s.edge) / P.maxEdge);
    const slipDecel = (P.skid * edgeGrip + P.brake * brake) * dt;
    const newVl = Math.sign(vl) * Math.max(0, Math.abs(vl) - slipDecel);
    s.vx += (newVl - vl) * axes.r[0];
    s.vy += (newVl - vl) * axes.r[1];
    s.vz += (newVl - vl) * axes.r[2];
    events.skid = Math.abs(vl) > 0.8 ? Math.abs(vl) : 0;

    // Gravity along the slope, snow friction, air drag, braking.
    const g = P.g;
    s.vx += g * n[1] * n[0] * dt;
    s.vy += (-g + g * n[1] * n[1]) * dt;
    s.vz += g * n[1] * n[2] * dt;
    speed = Math.hypot(s.vx, s.vy, s.vz);
    const mu = s.onPiste ? P.muPiste : P.muOff;
    brakeSpeed(s, mu * g * n[1] + drag * speed * speed + P.brake * 0.5 * brake, dt);

    // Skating push on the flat when nearly stopped.
    if (tuck > 0 && speed < 3 && n[1] > 0.97) {
      const fwd = Math.sign(vf) || 1;
      s.vx += f[0] * P.push * fwd * tuck * dt;
      s.vy += f[1] * P.push * fwd * tuck * dt;
      s.vz += f[2] * P.push * fwd * tuck * dt;
    }

    // Ollie: hold to load, release to pop.
    if (input.jump) s.charge = Math.min(1, s.charge + dt / P.charge);
    const pop = s.jumpHeld && !input.jump;

    const yBallistic = s.y + s.vy * dt;
    s.x += s.vx * dt;
    s.z += s.vz * dt;
    const ground = world.heightAt(s.x, s.z);
    const n2 = world.normalAt(s.x, s.z, n1);

    if (pop) {
      const v = P.ollie + (P.ollieCharged - P.ollie) * s.charge;
      s.y = ground + 0.02;
      projectOnPlane(s, n2);
      s.vx += n2[0] * v;
      s.vy += n2[1] * v;
      s.vz += n2[2] * v;
      s.airborne = true;
      s.airTime = 0;
      s.charge = 0;
      events.jumped = true;
    } else if (yBallistic - ground > g * n2[1] * dt * dt + P.stick) {
      // The snow drops away faster than the board can follow: take off.
      s.y = yBallistic;
      s.airborne = true;
      s.airTime = 0;
      s.charge = 0;
    } else {
      s.y = ground;
      projectOnPlane(s, n2);
    }
  } else {
    // In the air: gravity, drag, spins.
    s.airTime += dt;
    s.vy -= P.g * dt;
    const speed = Math.hypot(s.vx, s.vy, s.vz);
    brakeSpeed(s, drag * speed * speed, dt);
    s.heading -= steer * P.spin * dt;
    s.edge *= 1 - Math.min(1, 3 * dt);
    if (input.jump) s.charge = 0;
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    s.z += s.vz * dt;
    const ground = world.heightAt(s.x, s.z);
    if (s.y <= ground) {
      const n = world.normalAt(s.x, s.z, n0);
      s.y = ground;
      s.airborne = false;
      const vn = projectOnPlane(s, n);
      const { f } = boardAxes(s.heading, n);
      const tl = Math.hypot(s.vx, s.vy, s.vz);
      let align = 1;
      if (tl > 0.5) {
        align = (s.vx * f[0] + s.vy * f[1] + s.vz * f[2]) / tl;
        // Boards ride both ways: landing backwards is riding switch.
        if (align < 0) {
          s.heading += Math.PI;
          align = -align;
        }
      }
      const off = Math.acos(clamp(align, -1, 1));
      // Little hops over bumps never count as a bad landing.
      if (-vn > P.hardLanding || (tl > 3 && s.airTime > 0.35 && off > P.landTolerance)) {
        crash(s, events);
      } else {
        events.landed = { airTime: s.airTime, off };
        // Absorb a little speed on landing.
        s.vx *= 0.97;
        s.vy *= 0.97;
        s.vz *= 0.97;
      }
    }
  }

  s.jumpHeld = Boolean(input.jump);
  collide(s, world, P, events);
  s.speed = Math.hypot(s.vx, s.vy, s.vz);
  return events;
}

// Picks a starting point: high, inside the central area, on a rideable slope.
export function findSpawn(field, { margin = 0.25, minSlope = 0.17, maxSlope = 0.45 } = {}) {
  let best = null;
  const n = [0, 1, 0];
  const stepCells = 4;
  for (let j = Math.floor(field.rows * margin); j < field.rows * (1 - margin); j += stepCells) {
    for (let i = Math.floor(field.cols * margin); i < field.cols * (1 - margin); i += stepCells) {
      const x = field.x0 + i * field.cell;
      const z = field.z0 + j * field.cell;
      field.normalAt(x, z, n);
      const slope = Math.acos(n[1]);
      if (slope < minSlope || slope > maxSlope) continue;
      const h = field.heightAt(x, z);
      if (!best || h > best.h) best = { x, z, h, heading: Math.atan2(n[0], n[2]) };
    }
  }
  return best ?? { x: 0, z: 0, h: field.heightAt(0, 0), heading: 0 };
}
