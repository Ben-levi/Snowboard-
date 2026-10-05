import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { createRider, step, STEP } from './physics.js';
import { botDone, botInput, createBot } from './bot.js';

const JACKETS = ['#e03131', '#1971c2', '#2f9e44', '#f08c00', '#ae3ec9', '#f8f9fa', '#212529', '#0ca678', '#fab005', '#d6336c'];
const tmp = new THREE.Object3D();
const q = new THREE.Quaternion();
const lean = new THREE.Quaternion();
const X = new THREE.Vector3();
const Y = new THREE.Vector3();
const Z = new THREE.Vector3();
const m4 = new THREE.Matrix4();
const AXIS_X = new THREE.Vector3(1, 0, 0);
const n = [0, 1, 0];

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A simple figure: jacket/body, helmet, and a board along local +x (like the main rider model).
function figureGeometry() {
  const body = new THREE.CapsuleGeometry(0.26, 0.75, 4, 8).translate(0, 1.05, 0);
  const legs = new THREE.CapsuleGeometry(0.2, 0.45, 4, 8).translate(0, 0.45, 0);
  const head = new THREE.SphereGeometry(0.17, 10, 8).translate(0, 1.72, 0);
  return { body: mergeGeometries([body, legs]), head, board: new THREE.BoxGeometry(1.5, 0.05, 0.28).translate(0, 0.03, 0) };
}

// Other riders out on the popular runs, ridden by the bot at a relaxed pace.
export default function Npcs({ sim, quality }) {
  const count = quality.npcs ?? 12;
  const { courses, starts } = sim.current.features;
  const pool = useMemo(() => courses.filter((c) => !c.boardercross), [courses]);
  const parts = useMemo(() => {
    const g = figureGeometry();
    const mats = {
      body: new THREE.MeshStandardMaterial({ roughness: 0.7 }),
      head: new THREE.MeshStandardMaterial({ color: '#1b1e23', roughness: 0.4, metalness: 0.2 }),
      board: new THREE.MeshStandardMaterial({ color: '#2b2f36', roughness: 0.5 }),
    };
    const make = (geo, mat) => {
      const im = new THREE.InstancedMesh(geo, mat, count);
      im.frustumCulled = false;
      im.castShadow = quality.shadows;
      return im;
    };
    return { g, mats, body: make(g.body, mats.body), head: make(g.head, mats.head), board: make(g.board, mats.board) };
  }, [count, quality.shadows]);
  useEffect(
    () => () => {
      Object.values(parts.g).forEach((x) => x.dispose());
      Object.values(parts.mats).forEach((x) => x.dispose());
    },
    [parts],
  );

  const riders = useRef(null);
  if (!riders.current) {
    const rand = rng(77);
    const color = new THREE.Color();
    riders.current = Array.from({ length: count }, (_, i) => {
      parts.body.setColorAt(i, color.set(JACKETS[i % JACKETS.length]));
      return { rand, wait: rand() * 25, state: null, bot: null };
    });
    if (parts.body.instanceColor) parts.body.instanceColor.needsUpdate = true;
  }

  const spawn = (r) => {
    // Busy runs get more riders: blues and reds over blacks.
    const weights = pool.map((c) => (c.difficulty === 'advanced' ? 0.5 : c.difficulty === 'novice' ? 0.8 : 1.2));
    let pick = r.rand() * weights.reduce((a, b) => a + b, 0);
    let c = pool[0];
    for (let k = 0; k < pool.length; k++) {
      pick -= weights[k];
      if (pick <= 0) {
        c = pool[k];
        break;
      }
    }
    const st = starts.find((s) => s.id === c.id);
    r.bot = createBot(c, { offset: (r.rand() - 0.5) * c.width * 0.6 });
    r.bot.speed *= 0.5 + r.rand() * 0.35;
    // Start somewhere along the run, not everyone at the top.
    const along = r.rand() * 0.6 * c.length;
    let d = 0;
    let pos = c.line[0];
    let dir = [st.x, st.z];
    for (let s = 1; s < c.line.length; s++) {
      const seg = Math.hypot(c.line[s][0] - c.line[s - 1][0], c.line[s][1] - c.line[s - 1][1]);
      if (d + seg >= along) {
        const f = (along - d) / (seg || 1);
        pos = [c.line[s - 1][0] + (c.line[s][0] - c.line[s - 1][0]) * f, c.line[s - 1][1] + (c.line[s][1] - c.line[s - 1][1]) * f];
        dir = c.line[s];
        break;
      }
      d += seg;
    }
    r.state = createRider(sim.current.world, pos[0], pos[1], Math.atan2(dir[0] - pos[0], dir[1] - pos[1]));
    r.bot.at = along;
  };

  const acc = useRef(0);
  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.1);
    const S = sim.current;
    const world = S.world;
    const player = S.rider;
    if (!S.paused) {
      acc.current += dt;
      let steps = 0;
      while (acc.current >= STEP && steps < 12) {
        acc.current -= STEP;
        steps++;
        for (const r of riders.current) {
          if (!r.state) continue;
          step(r.state, botInput(r.bot, r.state), world);
          // A gentle shove if the player rides into them.
          const dx = player.x - r.state.x;
          const dz = player.z - r.state.z;
          const d = Math.hypot(dx, dz);
          if (d < 0.9 && d > 1e-3 && !player.airborne) {
            const push = (0.9 - d) / d;
            player.x += dx * push * 0.5;
            player.z += dz * push * 0.5;
            const vin = (player.vx * dx + player.vz * dz) / d;
            if (vin < 0) {
              player.vx -= (vin * dx) / d;
              player.vz -= (vin * dz) / d;
            }
          }
        }
      }
      if (acc.current > STEP) acc.current = 0;
      for (const r of riders.current) {
        if (!r.state) {
          r.wait -= dt;
          if (r.wait <= 0) spawn(r);
          continue;
        }
        if (botDone(r.bot) || r.state.crashed > 1.5) {
          r.state = null;
          r.wait = 3 + r.rand() * 12;
        }
      }
    }
    riders.current.forEach((r, i) => {
      const s = r.state;
      if (!s) {
        tmp.position.set(0, -10000, 0);
        tmp.updateMatrix();
        parts.body.setMatrixAt(i, tmp.matrix);
        parts.head.setMatrixAt(i, tmp.matrix);
        parts.board.setMatrixAt(i, tmp.matrix);
        return;
      }
      world.normalAt(s.x, s.z, n);
      Y.set(n[0], n[1], n[2]);
      X.set(Math.sin(s.heading), 0, Math.cos(s.heading));
      X.addScaledVector(Y, -X.dot(Y)).normalize();
      Z.crossVectors(X, Y);
      m4.makeBasis(X, Y, Z);
      q.setFromRotationMatrix(m4);
      lean.setFromAxisAngle(AXIS_X, s.edge * 0.6 + (s.crashed ? 1.3 : 0));
      tmp.position.set(s.x, s.y, s.z);
      tmp.quaternion.copy(q);
      tmp.scale.set(1, 1, 1);
      tmp.updateMatrix();
      parts.board.setMatrixAt(i, tmp.matrix);
      tmp.quaternion.multiply(lean);
      tmp.updateMatrix();
      parts.body.setMatrixAt(i, tmp.matrix);
      parts.head.setMatrixAt(i, tmp.matrix);
    });
    parts.body.instanceMatrix.needsUpdate = true;
    parts.head.instanceMatrix.needsUpdate = true;
    parts.board.instanceMatrix.needsUpdate = true;
  });

  return (
    <group>
      <primitive object={parts.body} />
      <primitive object={parts.head} />
      <primitive object={parts.board} />
    </group>
  );
}
