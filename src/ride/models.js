import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

// Procedural models for the lifts and the piste furniture, each merged into one geometry with
// per-vertex colours so a whole lift line draws in a few instanced calls.
// Lifts: local z runs along the line (uphill), x across it, y up; the cable is at y = 0 for carriers.

const c = (hex) => new THREE.Color(hex); // sRGB hex → linear

export const PAINT = {
  steel: c('#8e9aa6'),
  darkSteel: c('#3a4048'),
  black: c('#17191c'),
  concrete: c('#9a968e'),
  wall: c('#4f5964'),
  glass: c('#10161d'),
  white: c('#eef1f4'),
  red: c('#c8102e'),
  orange: c('#ff6a13'),
  yellow: c('#f2b705'),
  snow: c('#e9eef5'),
  seat: c('#2a2e35'),
  wood: c('#6b4428'),
};

// Collects parts (geometry + colour + placement) and merges them.
export function assembler() {
  const parts = [];
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const add = (geometry, color, { at = [0, 0, 0], rot = [0, 0, 0], scale = [1, 1, 1] } = {}) => {
    let g = geometry.index ? geometry.toNonIndexed() : geometry.clone();
    geometry.dispose();
    for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal') g.deleteAttribute(name);
    m.compose(new THREE.Vector3(...at), q.setFromEuler(e.set(...rot)), new THREE.Vector3(...scale));
    g.applyMatrix4(m);
    const col = typeof color === 'function' ? null : color;
    const cols = new Float32Array(g.attributes.position.count * 3);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const cc = col ?? color(p.getX(i), p.getY(i), p.getZ(i));
      cols[i * 3] = cc.r;
      cols[i * 3 + 1] = cc.g;
      cols[i * 3 + 2] = cc.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    parts.push(g);
    return g;
  };
  const merged = () => {
    const g = mergeGeometries(parts);
    parts.forEach((p) => p.dispose());
    g.computeBoundingSphere();
    return g;
  };
  return { add, merged };
}

const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const cyl = (r0, r1, h, n = 8) => new THREE.CylinderGeometry(r0, r1, h, n, 1, n < 8);

// A line tower: tapered tube, crossarm, sheave trains under each cable, a footing.
export function towerGeometry(height, offset, kind) {
  const a = assembler();
  const r = kind === 'drag' ? 0.22 : kind === 'cabin' ? 0.5 : 0.4;
  a.add(cyl(r * 0.75, r, height + 1, 10), PAINT.steel, { at: [0, (height - 1) / 2, 0] });
  a.add(box(r * 3, 0.5, r * 3), PAINT.concrete, { at: [0, 0.1, 0] });
  if (kind === 'drag') {
    a.add(box(offset * 2 + 0.6, 0.22, 0.22), PAINT.steel, { at: [offset * 0.5, height - 0.1, 0] });
    a.add(cyl(0.18, 0.18, 0.12, 10), PAINT.black, { at: [offset, height - 0.5, 0], rot: [0, 0, Math.PI / 2] });
    return a.merged();
  }
  const arm = offset * 2 + 1.4;
  a.add(box(arm, 0.42, 0.42), PAINT.steel, { at: [0, height - 0.2, 0] });
  // Small service platform and a ladder rail up the pole.
  a.add(box(arm * 0.7, 0.06, 1.0), PAINT.darkSteel, { at: [0, height - 0.45, 0.55] });
  a.add(box(0.05, height - 1, 0.05), PAINT.darkSteel, { at: [r * 0.9, height / 2, 0.15] });
  for (const s of [-1, 1]) {
    // Sheave train: a beam with wheels, hanging under the cable.
    const x = s * offset;
    a.add(box(0.12, 0.7, 0.12), PAINT.steel, { at: [x, height - 0.6, 0] });
    a.add(box(0.22, 0.28, 3.2), PAINT.darkSteel, { at: [x, height - 1.0, 0] });
    for (const k of [-1, 1]) a.add(cyl(0.22, 0.22, 0.16, 8), PAINT.black, { at: [x, height - 0.8, k * 0.9], rot: [0, 0, Math.PI / 2] });
  }
  return a.merged();
}

// A detachable lift terminal: machine room, a streamlined hood over the bullwheel, columns and a
// boarding platform, with an operator's cabin to one side. y = 0 at the ground.
export function stationGeometry(kind, offset) {
  const a = assembler();
  if (kind === 'drag') {
    a.add(box(2.6, 4.4, 3.2), PAINT.wall, { at: [3, 0.2, 0] });
    a.add(box(2.66, 0.5, 3.26), PAINT.glass, { at: [3, 1.65, 0] });
    a.add(box(3.2, 0.25, 3.8), PAINT.red, { at: [3, 2.5, 0], rot: [0, 0, 0.12] });
    a.add(cyl(0.3, 0.35, 5, 10), PAINT.steel, { at: [0, 2.5, 0] });
    a.add(cyl(0.9, 0.9, 0.2, 18), PAINT.darkSteel, { at: [offset * 0.5, 5, 0] });
    return a.merged();
  }
  const big = kind === 'cabin';
  const W = offset * 2 + (big ? 6 : 4.5);
  const L = big ? 22 : 15;
  const baseH = big ? 4.2 : 3.2;
  // Concrete plinth (stations sit on slopes), machine room with a band of windows.
  a.add(box(W + 0.3, 4, L * 0.7 + 0.3), PAINT.concrete, { at: [0, -2, -L * 0.15] });
  a.add(box(W, baseH, L * 0.7), PAINT.wall, { at: [0, baseH / 2, -L * 0.15] });
  a.add(box(W + 0.04, 0.9, L * 0.7 + 0.04), PAINT.glass, { at: [0, baseH * 0.62, -L * 0.15] });
  a.add(box(W + 0.4, 0.3, L * 0.7 + 0.4), PAINT.snow, { at: [0, baseH + 0.15, -L * 0.15] });
  // Columns up to the hood.
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) a.add(box(0.35, 2.5, 0.35), PAINT.steel, { at: [sx * (W / 2 - 0.6), baseH + 1.25, -L * 0.15 + sz * L * 0.25] });
  // The hood: a long, smooth white shell with a red band, the cable entering at y ≈ 5.4.
  const hoodY = 5.6;
  a.add(new RoundedBoxGeometry(W + 0.8, 2.4, L, 2, 1.1), (x, y) => (Math.abs(y - hoodY + 0.35) < 0.28 ? PAINT.red : y < hoodY - 1.0 ? PAINT.darkSteel : PAINT.white), {
    at: [0, hoodY, 0],
  });
  // Boarding platform (snow) where the line leaves the station, and a gate rail.
  a.add(box(W + 4, 0.4, 7), PAINT.snow, { at: [0, 0.2, L / 2 + 3] });
  for (const sx of [-1, 1]) a.add(box(0.08, 1.0, 6), PAINT.yellow, { at: [sx * (W / 2 + 1.6), 0.9, L / 2 + 3] });
  // Operator's cabin beside the line.
  const hx = W / 2 + 2.6;
  a.add(box(3, 5.7, 3), PAINT.white, { at: [hx, -0.15, L / 2 - 1] });
  a.add(box(3.04, 1.0, 3.04), PAINT.glass, { at: [hx, 1.7, L / 2 - 1] });
  a.add(box(3.5, 0.25, 3.5), PAINT.snow, { at: [hx, 2.82, L / 2 - 1] });
  return a.merged();
}

// A six-seat chair hanging from its grip at the origin; local +x is the direction of travel.
export function chairGeometry(width = 2.9) {
  const a = assembler();
  a.add(box(0.5, 0.26, 0.26), PAINT.darkSteel, { at: [0, -0.05, 0] }); // grip
  a.add(box(0.09, 2.0, 0.09), PAINT.steel, { at: [-0.25, -1.05, 0], rot: [0, 0, -0.12] }); // hanger
  a.add(box(0.09, 0.09, width + 0.1), PAINT.steel, { at: [-0.37, -2.0, 0] }); // yoke over the backrest
  a.add(box(0.08, 0.8, width), PAINT.seat, { at: [-0.36, -2.45, 0], rot: [0, 0, 0.12] }); // backrest
  a.add(box(0.6, 0.14, width), PAINT.seat, { at: [-0.05, -2.86, 0] }); // seat cushion
  a.add(box(0.62, 0.06, width + 0.06), PAINT.steel, { at: [-0.05, -2.95, 0] });
  for (const s of [-1, 1]) a.add(box(0.55, 0.06, 0.06), PAINT.steel, { at: [-0.05, -2.55, s * (width / 2 + 0.02)] }); // armrests
  // Safety bar, lowered, with footrests.
  a.add(box(0.05, 0.05, width), PAINT.steel, { at: [0.55, -2.45, 0] });
  for (const z of [-width / 4, width / 4]) a.add(box(0.05, 0.75, 0.05), PAINT.steel, { at: [0.6, -2.85, z] });
  a.add(box(0.25, 0.05, width * 0.8), PAINT.steel, { at: [0.62, -3.22, 0] });
  return a.merged();
}

// An eight-seat gondola cabin: rounded body in Grandvalira red, window band, roof and hanger.
export function cabinGeometry() {
  const a = assembler();
  a.add(box(0.6, 0.3, 0.3), PAINT.darkSteel, { at: [0, -0.05, 0] });
  a.add(box(0.12, 1.6, 0.12), PAINT.steel, { at: [0, -0.9, 0] });
  a.add(box(1.4, 0.12, 0.12), PAINT.steel, { at: [0, -1.7, 0] });
  a.add(new RoundedBoxGeometry(2.1, 2.3, 2.1, 2, 0.35), (x, y) => (y > -2.55 && y < -1.85 ? PAINT.glass : y >= -1.85 ? PAINT.white : PAINT.red), { at: [0, -2.95, 0] });
  return a.merged();
}

// A T-bar: spring box at the cable, telescopic pole, bar across.
export function tbarGeometry() {
  const a = assembler();
  a.add(box(0.3, 0.4, 0.3), PAINT.darkSteel, { at: [0, -0.3, 0] });
  a.add(cyl(0.04, 0.04, 2.4, 6), PAINT.steel, { at: [0, -1.7, 0] });
  a.add(box(0.07, 0.07, 1.1), PAINT.black, { at: [0, -2.9, 0] });
  return a.merged();
}

// A fan snow gun (like the yellow ones along Grandvalira's pistes) on a short tower: y = 0 at the ground,
// the barrel pointing along +z, tilted up.
export function snowGunGeometry() {
  const a = assembler();
  a.add(cyl(0.12, 0.16, 3.4, 8), PAINT.steel, { at: [0, 1.7, 0] });
  a.add(box(0.9, 0.5, 0.9), PAINT.concrete, { at: [0, 0.1, 0] });
  a.add(box(0.5, 0.35, 0.5), PAINT.darkSteel, { at: [0, 3.35, 0] }); // yoke
  const tilt = -0.45; // barrel axis = (0, sin 0.45, cos 0.45): forward and up
  const ax = [0, Math.sin(-tilt), Math.cos(tilt)];
  const at = (k) => [0, 3.75 + ax[1] * k, 0.1 + ax[2] * k];
  a.add(cyl(0.62, 0.55, 1.5, 20), PAINT.yellow, { at: at(0), rot: [Math.PI / 2 + tilt, 0, 0] });
  // Nozzle ring at the front, dark fan grille at the back.
  a.add(new THREE.TorusGeometry(0.58, 0.07, 6, 20), PAINT.darkSteel, { at: at(0.75), rot: [tilt, 0, 0] });
  a.add(cyl(0.5, 0.5, 0.04, 20), PAINT.black, { at: at(-0.77), rot: [Math.PI / 2 + tilt, 0, 0] });
  return a.merged();
}

// A tower pad: thick red-and-white padding wrapped round a pole.
export function padGeometry() {
  const a = assembler();
  a.add(cyl(1.0, 1.0, 2.6, 18), (x, y) => (Math.floor(y / 0.65 + 10) % 2 ? PAINT.red : PAINT.white), { at: [0, 1.3, 0] });
  a.add(cyl(1.02, 1.02, 0.08, 18), PAINT.darkSteel, { at: [0, 2.62, 0] });
  return a.merged();
}

// A piste pole: coloured by difficulty through the instance colour, with a black-and-orange top.
export function pisteMarkerGeometry() {
  const a = assembler();
  a.add(cyl(0.035, 0.04, 1.75, 6), new THREE.Color(1, 1, 1), { at: [0, 0.875, 0] });
  a.add(cyl(0.045, 0.045, 0.22, 6), new THREE.Color(0.05, 0.05, 0.05), { at: [0, 1.62, 0] });
  return a.merged();
}
