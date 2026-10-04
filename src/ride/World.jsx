import { Suspense, useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Sky } from '@react-three/drei';
import * as THREE from 'three';
import { step, STEP } from './physics.js';
import { readInput, takePressed } from './input.js';
import { createTerrainMaterial } from './terrainMaterial.js';
import { FarTerrain, NearTerrain } from './Terrain.jsx';
import Rider from './Rider.jsx';
import { Lifts, PisteMarkers, Trees, Village } from './Scenery.jsx';

// Late-morning sun from the south-east (the resort's main slopes face north and east).
export const SUN_DIR = new THREE.Vector3(0.45, 0.62, 0.64).normalize();
const SKY_SUN = SUN_DIR.clone().multiplyScalar(1000);

const camDir = new THREE.Vector3(0, 0, 1);
const want = new THREE.Vector3();
const look = new THREE.Vector3();
const lookSmooth = new THREE.Vector3();

// Runs the simulation at a fixed step and drives the camera and the sun.
function Simulation({ sim, world, onEvents }) {
  const camera = useThree((s) => s.camera);
  const sun = useRef();
  const acc = useRef(0);
  const first = useRef(true);

  useEffect(() => {
    camera.near = 0.3;
    camera.far = 45000;
    camera.updateProjectionMatrix();
  }, [camera]);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.1);
    const input = readInput(dt);
    sim.current.input = input;
    if (takePressed('KeyR')) sim.current.reset();
    if (takePressed('KeyC')) sim.current.camMode = sim.current.camMode === 'chase' ? 'first' : 'chase';
    if (!sim.current.paused) {
      acc.current += dt;
      while (acc.current >= STEP) {
        const e = step(sim.current.rider, input, world);
        acc.current -= STEP;
        if (e.jumped || e.landed || e.crashed) onEvents?.(e);
      }
    }
    const s = sim.current.rider;
    if (sim.current.snapCamera) {
      first.current = true;
      sim.current.snapCamera = false;
    }

    // Chase camera: behind the direction of travel, a little above, looking ahead.
    const hv = Math.hypot(s.vx, s.vz);
    if (hv > 1.5) want.set(s.vx / hv, 0, s.vz / hv);
    else want.set(Math.sin(s.heading), 0, Math.cos(s.heading));
    const k = first.current ? 1 : 1 - Math.exp(-dt * 2.5);
    camDir.lerp(want, k).normalize();
    const firstPerson = sim.current.camMode === 'first';
    const dist = firstPerson ? -0.2 : 6.2 + Math.min(hv, 30) * 0.08;
    const height = firstPerson ? 1.6 : 2.4 + Math.min(hv, 30) * 0.03;
    want.set(s.x - camDir.x * dist, s.y + height, s.z - camDir.z * dist);
    const ground = world.heightAt(want.x, want.z) + 1.2;
    if (want.y < ground) want.y = ground;
    if (first.current) camera.position.copy(want);
    else camera.position.lerp(want, firstPerson ? 1 : 1 - Math.exp(-dt * 6));
    const under = world.heightAt(camera.position.x, camera.position.z) + 1;
    if (camera.position.y < under) camera.position.y = under;
    look.set(s.x + camDir.x * 4, s.y + (firstPerson ? 1.2 : 1.0), s.z + camDir.z * 4);
    if (first.current) lookSmooth.copy(look);
    else lookSmooth.lerp(look, 1 - Math.exp(-dt * 10));
    camera.lookAt(lookSmooth);
    first.current = false;

    // The shadow-casting sun follows the rider so shadows stay sharp where it matters.
    if (sun.current) {
      sun.current.position.set(s.x + SUN_DIR.x * 120, s.y + SUN_DIR.y * 120, s.z + SUN_DIR.z * 120);
      sun.current.target.position.set(s.x, s.y, s.z);
      sun.current.target.updateMatrixWorld();
    }
  });

  return (
    <directionalLight
      ref={sun}
      intensity={3.1}
      color="#fff4e6"
      castShadow
      shadow-mapSize={[2048, 2048]}
      shadow-camera-left={-40}
      shadow-camera-right={40}
      shadow-camera-top={40}
      shadow-camera-bottom={-40}
      shadow-camera-near={1}
      shadow-camera-far={400}
      shadow-bias={-0.0004}
      shadow-normalBias={0.04}
    />
  );
}

export default function World({ resort, sim, quality, onEvents, children }) {
  const material = useMemo(() => createTerrainMaterial({ sparkle: quality.sparkle, detail: quality.detail ?? 1 }), [quality.sparkle, quality.detail]);
  const farMaterial = useMemo(() => {
    const m = createTerrainMaterial({ sparkle: 0, detail: 0 });
    return m;
  }, []);
  useEffect(() => () => (material.dispose(), farMaterial.dispose()), [material, farMaterial]);
  sim.current.terrainMaterial = material;
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
      <hemisphereLight args={['#9cc2ff', '#eef2f8', 0.55]} />
      <Simulation sim={sim} world={sim.current.world} onEvents={onEvents} />
      <NearTerrain field={resort.near} material={material} lodScale={quality.lodScale} />
      <FarTerrain far={resort.far} near={resort.near} material={farMaterial} />
      <Suspense fallback={null}>
        <Rider sim={sim} world={resort.near} />
      </Suspense>
      <Village buildings={features.buildings} />
      <Lifts lifts={features.lifts} quality={quality} />
      <Trees trees={features.trees} quality={quality} />
      <PisteMarkers markers={features.markers} />
      {children}
    </>
  );
}
