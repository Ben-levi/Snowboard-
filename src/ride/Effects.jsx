import { useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

// ---------- Snow spray: soft points thrown off the board when carving, skidding, landing or crashing ----------
const MAX = 700;

const sprayMaterial = () =>
  new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { uScale: { value: 300 } },
    vertexShader: /* glsl */ `
      attribute float aLife;
      attribute float aSize;
      varying float vLife;
      uniform float uScale;
      #include <common>
      #include <logdepthbuf_pars_vertex>
      void main() {
        vLife = aLife;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = aSize * uScale / -mv.z;
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: /* glsl */ `
      varying float vLife;
      #include <common>
      #include <logdepthbuf_pars_fragment>
      void main() {
        #include <logdepthbuf_fragment>
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.15, d) * clamp(vLife, 0.0, 1.0) * 0.85;
        if (a < 0.01) discard;
        gl_FragColor = vec4(0.97, 0.98, 1.0, a);
      }`,
  });

export function SnowSpray({ sim }) {
  const { geometry, material, state } = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAX * 3), 3));
    g.setAttribute('aLife', new THREE.BufferAttribute(new Float32Array(MAX), 1));
    g.setAttribute('aSize', new THREE.BufferAttribute(new Float32Array(MAX), 1));
    return {
      geometry: g,
      material: sprayMaterial(),
      state: { vel: new Float32Array(MAX * 3), life: new Float32Array(MAX), max: new Float32Array(MAX), next: 0, carry: 0 },
    };
  }, []);
  useEffect(() => () => (geometry.dispose(), material.dispose()), [geometry, material]);

  useFrame(({ size }, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    material.uniforms.uScale.value = size.height * 0.9;
    const pos = geometry.attributes.position.array;
    const lifeA = geometry.attributes.aLife.array;
    const sizeA = geometry.attributes.aSize.array;
    const s = sim.current.rider;
    const fx = sim.current.fx ?? {};
    sim.current.fx = {};

    const emit = (n, spread, up, kick) => {
      const fwdX = Math.sin(s.heading);
      const fwdZ = Math.cos(s.heading);
      for (let i = 0; i < n; i++) {
        const k = state.next;
        state.next = (k + 1) % MAX;
        const tail = (Math.random() - 0.5) * 1.2;
        pos[k * 3] = s.x + fwdX * tail;
        pos[k * 3 + 1] = s.y + 0.1;
        pos[k * 3 + 2] = s.z + fwdZ * tail;
        state.vel[k * 3] = -s.vx * kick + (Math.random() - 0.5) * spread;
        state.vel[k * 3 + 1] = up * (0.5 + Math.random());
        state.vel[k * 3 + 2] = -s.vz * kick + (Math.random() - 0.5) * spread;
        state.max[k] = state.life[k] = 0.5 + Math.random() * 0.7;
        sizeA[k] = 0.25 + Math.random() * 0.45;
      }
    };

    // Continuous spray while the edge bites or the board slides.
    if (!s.airborne && !s.crashed && s.speed > 4) {
      const rate = Math.min(500, (fx.skid ?? 0) * 60 + Math.max(0, (fx.carve ?? 0) - 5) * 18);
      state.carry += rate * dt;
      const n = Math.floor(state.carry);
      state.carry -= n;
      if (n) emit(n, 2.2, 1.6, 0.12);
    }
    if (fx.landed) emit(45, 4, 2.2, 0.15);
    if (fx.crashed) emit(110, 6, 3.2, 0.25);

    for (let k = 0; k < MAX; k++) {
      if (state.life[k] <= 0) {
        lifeA[k] = 0;
        continue;
      }
      state.life[k] -= dt;
      const drag = 1 - Math.min(1, 2.2 * dt);
      state.vel[k * 3] *= drag;
      state.vel[k * 3 + 2] *= drag;
      state.vel[k * 3 + 1] -= 5 * dt;
      pos[k * 3] += state.vel[k * 3] * dt;
      pos[k * 3 + 1] += state.vel[k * 3 + 1] * dt;
      pos[k * 3 + 2] += state.vel[k * 3 + 2] * dt;
      lifeA[k] = state.life[k] / state.max[k];
    }
    geometry.attributes.position.needsUpdate = true;
    geometry.attributes.aLife.needsUpdate = true;
    geometry.attributes.aSize.needsUpdate = true;
  });

  return <points geometry={geometry} material={material} frustumCulled={false} />;
}

// ---------- Board trail: a fading groove behind the rider ----------
const POINTS = 360;
const LIFE = 40; // s

export function Trail({ sim, world }) {
  const { geometry, material, state } = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(POINTS * 2 * 3), 3));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(POINTS * 2 * 4), 4));
    const idx = [];
    for (let i = 0; i < POINTS - 1; i++) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    g.setIndex(idx);
    g.setDrawRange(0, 0);
    const m = new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -4,
    });
    return { geometry: g, material: m, state: { count: 0, times: new Float32Array(POINTS), last: null, gap: true, rider: null } };
  }, []);
  useEffect(() => () => (geometry.dispose(), material.dispose()), [geometry, material]);

  useFrame(() => {
    const s = sim.current.rider;
    const pos = geometry.attributes.position.array;
    const col = geometry.attributes.color.array;
    if (state.rider !== s) {
      // A reset or new run: start a fresh trail.
      state.rider = s;
      state.count = 0;
      state.last = null;
    }
    const grounded = !s.airborne && !s.crashed;
    if (!grounded) state.gap = true;
    const moved = state.last ? Math.hypot(s.x - state.last[0], s.z - state.last[1]) : Infinity;
    if (grounded && s.speed > 1 && moved > 0.7) {
      if (state.count === POINTS) {
        pos.copyWithin(0, 6);
        col.copyWithin(0, 8);
        state.times.copyWithin(0, 1);
        state.count--;
      }
      const k = state.count;
      const rx = Math.cos(s.heading) * 0.14; // board half-width, across the board
      const rz = -Math.sin(s.heading) * 0.14;
      const y1 = world.heightAt(s.x + rx, s.z + rz) + 0.03;
      const y2 = world.heightAt(s.x - rx, s.z - rz) + 0.03;
      pos.set([s.x + rx, y1, s.z + rz, s.x - rx, y2, s.z - rz], k * 6);
      state.times[k] = state.gap ? -1 : s.time; // -1 marks the first point after a jump (no bridge)
      state.count++;
      state.last = [s.x, s.z];
      state.gap = false;
    }
    for (let k = 0; k < state.count; k++) {
      const t0 = state.times[k];
      const nextBreak = k + 1 < state.count && state.times[k + 1] < 0;
      const a = t0 < 0 || nextBreak ? 0 : Math.max(0, 1 - (s.time - t0) / LIFE) * 0.35;
      for (const v of [0, 1]) col.set([0.62, 0.69, 0.8, a], (k * 2 + v) * 4);
    }
    geometry.setDrawRange(0, Math.max(0, state.count - 1) * 6);
    geometry.attributes.position.needsUpdate = true;
    geometry.attributes.color.needsUpdate = true;
  });

  return <mesh geometry={geometry} material={material} frustumCulled={false} renderOrder={1} />;
}
