import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Sky } from '@react-three/drei';
import * as THREE from 'three';
import { step, STEP } from './physics.js';
import { readInput, takePressed } from './input.js';
import { botInput } from './bot.js';
import { record } from './ghost.js';
import { updateRun } from './courses.js';
import { updateAudio } from './audio.js';
import { SnowSpray, Trail } from './Effects.jsx';
import { createTerrainMaterial } from './terrainMaterial.js';
import { FarTerrain, NearTerrain } from './Terrain.jsx';
import Rider from './Rider.jsx';
import { Lifts, PisteMarkers, Trees, Village } from './Scenery.jsx';
import Gates from './Gates.jsx';
import Ghost from './Ghost.jsx';
import PisteFurniture from './PisteFurniture.jsx';
import Npcs from './Npcs.jsx';

// Late-morning sun from the south-east (the resort's main slopes face north and east).
export const SUN_DIR = new THREE.Vector3(0.45, 0.62, 0.64).normalize();
const SKY_SUN = SUN_DIR.clone().multiplyScalar(1000);

const camDir = new THREE.Vector3(0, 0, 1);
const want = new THREE.Vector3();
const look = new THREE.Vector3();
const camVel = new THREE.Vector3();
const lookPos = new THREE.Vector3();
const lookVel = new THREE.Vector3();

// Critically damped spring towards a target (no overshoot, no jitter), per axis.
function spring(pos, vel, target, omega, dt) {
  const n = Math.max(1, Math.ceil(dt / (1 / 120)));
  const h = dt / n;
  for (let i = 0; i < n; i++) {
    vel.x += (-2 * omega * vel.x - omega * omega * (pos.x - target.x)) * h;
    vel.y += (-2 * omega * vel.y - omega * omega * (pos.y - target.y)) * h;
    vel.z += (-2 * omega * vel.z - omega * omega * (pos.z - target.z)) * h;
    pos.x += vel.x * h;
    pos.y += vel.y * h;
    pos.z += vel.z * h;
  }
}

const lerpAngle = (a, b, f) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * f;

// Ground height averaged over a few metres, so the camera glides over bumps.
const smoothGround = (world, x, z) =>
  (world.heightAt(x, z) * 2 + world.heightAt(x + 3, z) + world.heightAt(x - 3, z) + world.heightAt(x, z + 3) + world.heightAt(x, z - 3)) / 6;

// Runs the simulation at a fixed step and drives the camera and the sun.
function Simulation({ sim, world, onEvents, shadowSize = 2048, shadowBox = 40 }) {
  const camera = useThree((s) => s.camera);
  const sun = useRef();
  const acc = useRef(0);
  const first = useRef(true);
  const prev = useRef({ x: 0, y: 0, z: 0, heading: 0 });

  useEffect(() => {
    camera.near = sim.current.quality?.logDepth === false ? 0.5 : 0.3;
    camera.far = 45000;
    camera.updateProjectionMatrix();
  }, [camera, sim]);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.1);
    const S = sim.current;
    const playerInput = readInput(dt);
    const input = S.autopilot ? botInput(S.autopilot, S.rider) : playerInput;
    input.assist = S.settings?.assist ? 0.8 : 0;
    S.input = input;
    if (takePressed('KeyR')) S.restart();
    if (takePressed('KeyC')) S.camMode = S.camMode === 'chase' ? 'first' : 'chase';
    // Effects for this frame (spray, sound): strongest carve/skid, any landing or crash.
    const fx = { carve: 0, skid: 0 };
    if (!S.paused) {
      acc.current += dt;
      while (acc.current >= STEP) {
        const r = S.rider;
        prev.current.x = r.x;
        prev.current.y = r.y;
        prev.current.z = r.z;
        prev.current.heading = r.heading;
        prev.current.rider = r;
        const e = step(r, input, world);
        acc.current -= STEP;
        fx.carve = Math.max(fx.carve, e.carve);
        fx.skid = Math.max(fx.skid, e.skid);
        if (e.landed) fx.landed = true;
        if (e.crashed) fx.crashed = true;
        if (e.jumped || e.landed || e.crashed) onEvents?.(e);
        const run = S.run;
        if (run) {
          const ev = updateRun(run, r.x, r.z, r.time, r.speed);
          if (run.started && !run.finished) {
            record(S.recorder, r.time - run.startTime, r);
            S.stats.topSpeed = Math.max(S.stats.topSpeed, r.speed);
            if (r.airborne) S.stats.airTime += STEP;
          }
          if (ev.gate !== undefined) {
            S.splits[ev.gate] = run.time;
            const g = S.ghost?.splits?.[ev.gate];
            if (g) S.lastSplit = { gate: ev.gate, delta: run.time - g, at: performance.now() };
          }
          if (ev.started || ev.gate !== undefined || ev.finished) onEvents?.({ run: ev });
        }
      }
    }
    // Draw between the last two physics steps so motion stays smooth at any frame rate.
    const s = S.rider;
    const a = prev.current.rider === s ? acc.current / STEP : 1;
    const pose = (S.pose ??= {});
    pose.x = prev.current.x + (s.x - prev.current.x) * a;
    pose.y = prev.current.y + (s.y - prev.current.y) * a;
    pose.z = prev.current.z + (s.z - prev.current.z) * a;
    pose.heading = lerpAngle(prev.current.heading, s.heading, a);
    if (prev.current.rider !== s) Object.assign(pose, { x: s.x, y: s.y, z: s.z, heading: s.heading });

    const last = S.fx;
    S.fx = last ? { carve: Math.max(last.carve ?? 0, fx.carve), skid: Math.max(last.skid ?? 0, fx.skid), landed: last.landed || fx.landed, crashed: last.crashed || fx.crashed } : fx;
    updateAudio(s, fx, S.paused);
    if (S.snapCamera) {
      first.current = true;
      S.snapCamera = false;
    }

    // Chase camera: behind the direction of travel, a little above, looking ahead, on springs.
    const hv = Math.hypot(s.vx, s.vz);
    const travel = hv > 1.5 ? Math.atan2(s.vx, s.vz) : s.heading;
    const camAngle = first.current ? travel : lerpAngle(Math.atan2(camDir.x, camDir.z), travel, 1 - Math.exp(-dt * 2.2));
    camDir.set(Math.sin(camAngle), 0, Math.cos(camAngle));
    const firstPerson = S.camMode === 'first';
    const portrait = camera.aspect < 1 ? 1.35 : 1;
    const dist = firstPerson ? -0.2 : (6.2 + Math.min(hv, 30) * 0.08) * portrait;
    const height = firstPerson ? 1.6 : 2.4 + Math.min(hv, 30) * 0.03;
    want.set(pose.x - camDir.x * dist, 0, pose.z - camDir.z * dist);
    want.y = Math.max(pose.y + height, smoothGround(world, want.x, want.z) + 1.4);
    look.set(pose.x + camDir.x * (4 + hv * 0.15), pose.y + (firstPerson ? 1.2 : 1.0), pose.z + camDir.z * (4 + hv * 0.15));
    if (first.current || firstPerson) {
      camera.position.copy(want);
      lookPos.copy(look);
      camVel.set(0, 0, 0);
      lookVel.set(0, 0, 0);
    } else {
      spring(camera.position, camVel, want, 7, dt);
      spring(lookPos, lookVel, look, 11, dt);
    }
    const under = world.heightAt(camera.position.x, camera.position.z) + 1;
    if (camera.position.y < under) camera.position.y = under;
    camera.lookAt(lookPos);
    first.current = false;

    // The shadow-casting sun follows the rider so shadows stay sharp where it matters.
    if (sun.current) {
      sun.current.position.set(pose.x + SUN_DIR.x * 120, pose.y + SUN_DIR.y * 120, pose.z + SUN_DIR.z * 120);
      sun.current.target.position.set(pose.x, pose.y, pose.z);
      sun.current.target.updateMatrixWorld();
    }
  });

  return (
    <directionalLight
      ref={sun}
      intensity={3.1}
      color="#fff4e6"
      castShadow
      shadow-mapSize={[shadowSize, shadowSize]}
      shadow-camera-left={-shadowBox}
      shadow-camera-right={shadowBox}
      shadow-camera-top={shadowBox}
      shadow-camera-bottom={-shadowBox}
      shadow-camera-near={1}
      shadow-camera-far={400}
      shadow-bias={-0.0004}
      shadow-normalBias={0.04}
    />
  );
}

export default function World({ resort, sim, quality, course, ghost, onEvents, children }) {
  const material = useMemo(() => createTerrainMaterial({ sparkle: quality.sparkle, detail: quality.detail ?? 1 }), [quality.sparkle, quality.detail]);
  const farMaterial = useMemo(() => {
    const m = createTerrainMaterial({ sparkle: 0, detail: 0 });
    return m;
  }, []);
  useEffect(() => () => (material.dispose(), farMaterial.dispose()), [material, farMaterial]);
  sim.current.terrainMaterial = material;
  // Other riders join after the first moments, so the first frames stay light.
  const [extras, setExtras] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setExtras(true), 1500);
    return () => clearTimeout(id);
  }, []);
  const features = sim.current.features;
  useEffect(() => {
    const u = material.userData.uniforms;
    u.uMask.value = features.mask.texture;
    u.uMaskBounds.value.set(...features.mask.bounds);
    u.uHasMask.value = 1;
  }, [material, features]);

  return (
    <>
      <color attach="background" args={['#a9c6e3']} />
      <fog attach="fog" args={['#c6d8ea', 1200, 16000]} />
      <Sky sunPosition={SKY_SUN} distance={40000} turbidity={2.2} rayleigh={0.6} mieCoefficient={0.004} mieDirectionalG={0.85} />
      <hemisphereLight args={['#b8d0ff', '#eef2f8', 0.85]} />
      <Simulation sim={sim} world={sim.current.world} onEvents={onEvents} shadowSize={quality.shadowSize} shadowBox={quality.shadowBox ?? 40} />
      <NearTerrain field={resort.near} material={material} lodScale={quality.lodScale} />
      <FarTerrain far={resort.far} near={resort.near} material={farMaterial} />
      <Suspense fallback={null}>
        <Rider sim={sim} world={resort.near} />
        {course && ghost && <Ghost key={`${course.id}-${ghost.time}`} sim={sim} ghost={ghost} world={resort.near} />}
      </Suspense>
      <SnowSpray sim={sim} />
      <Trail sim={sim} world={resort.near} />
      <Village buildings={features.buildings} />
      <Lifts lifts={features.lifts} quality={quality} />
      <Trees trees={features.trees} quality={quality} />
      <PisteMarkers markers={features.markers} />
      <PisteFurniture furniture={features.furniture} quality={quality} />
      {extras && <Npcs sim={sim} quality={quality} />}
      {course && <Gates key={course.id} sim={sim} course={course} heightAt={resort.near.heightAt} />}
      {children}
    </>
  );
}
