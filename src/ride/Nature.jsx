import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { patchMaterial } from './atmosphere.js';
import { coniferGeometry, rockGeometry } from './natureGeometry.js';

// Trees and boulders (models from natureGeometry.js), instanced, and lit by the baked mountain light
// like the terrain.

const tmp = new THREE.Object3D();
const tint = new THREE.Color();

const TREE_KINDS = [
  { near: { seed: 11, tiers: 9, spokes: 10, height: 8, radius: 2.3 }, far: { far: true, seed: 11, tiers: 3, spokes: 5, height: 8, radius: 2.3, snow: 0.45 } },
  { near: { seed: 23, tiers: 7, spokes: 9, height: 6.2, radius: 2.5, snow: 0.9 }, far: { far: true, seed: 23, tiers: 3, spokes: 5, height: 6.2, radius: 2.5, snow: 0.5 } },
  { near: { seed: 37, tiers: 10, spokes: 8, height: 9.5, radius: 1.9, snow: 0.65 }, far: { far: true, seed: 37, tiers: 3, spokes: 4, height: 9.5, radius: 1.9, snow: 0.35 } },
];

// Trees by 400 m tile: the detailed model near the camera, a light one further away.
export function Trees({ trees, quality, tile = 400 }) {
  const camera = useThree((s) => s.camera);
  const material = useMemo(() => patchMaterial(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 })), []);
  // Phones get a simpler near model too.
  const lite = !quality.detail;
  const geos = useMemo(
    () => TREE_KINDS.map((k) => ({ near: coniferGeometry(lite ? { ...k.near, tiers: Math.round(k.near.tiers * 0.7), spokes: Math.round(k.near.spokes * 0.7) } : k.near), far: coniferGeometry(k.far) })),
    [lite],
  );
  const tiles = useMemo(() => {
    const byTile = new Map();
    trees.forEach((t, i) => {
      const key = `${Math.floor(t.x / tile)},${Math.floor(t.z / tile)}`;
      if (!byTile.has(key)) byTile.set(key, { cx: 0, cz: 0, n: 0, kinds: TREE_KINDS.map(() => []) });
      const e = byTile.get(key);
      e.cx += t.x;
      e.cz += t.z;
      e.n++;
      e.kinds[i % TREE_KINDS.length].push(t);
    });
    const out = [];
    for (const e of byTile.values()) {
      const entry = { cx: e.cx / e.n, cz: e.cz / e.n, meshes: [] };
      e.kinds.forEach((list, k) => {
        if (!list.length) return;
        const near = new THREE.InstancedMesh(geos[k].near, material, list.length);
        const far = new THREE.InstancedMesh(geos[k].far, material, list.length);
        list.forEach((t, i) => {
          tmp.position.set(t.x, t.y - 0.4, t.z);
          tmp.rotation.set(0, t.rot, 0);
          tmp.scale.set(t.s, t.s * (0.9 + (t.rot % 0.2)), t.s);
          tmp.updateMatrix();
          near.setMatrixAt(i, tmp.matrix);
          far.setMatrixAt(i, tmp.matrix);
          const shade = 0.8 + ((t.rot * 7.3) % 1) * 0.3;
          tint.setRGB(shade, shade, shade);
          near.setColorAt(i, tint);
          far.setColorAt(i, tint);
        });
        for (const m of [near, far]) {
          m.computeBoundingSphere();
          m.receiveShadow = false;
        }
        near.castShadow = quality.shadows;
        near.visible = false;
        entry.meshes.push({ near, far });
      });
      out.push(entry);
    }
    return out;
  }, [trees, tile, geos, material, quality.shadows]);

  useEffect(
    () => () => {
      for (const t of tiles) for (const m of t.meshes) (m.near.dispose(), m.far.dispose());
    },
    [tiles],
  );
  useEffect(
    () => () => {
      material.dispose();
      for (const g of geos) (g.near.dispose(), g.far.dispose());
    },
    [material, geos],
  );

  const frame = useRef(0);
  const nearDist = 380 * (quality.lodScale ?? 1);
  const farDist = (lite ? 2500 : 4500) * (quality.lodScale ?? 1); // beyond this, forests are lost in the haze anyway
  useFrame(() => {
    if (frame.current++ % 12) return;
    for (const t of tiles) {
      const d = Math.hypot(camera.position.x - t.cx, camera.position.z - t.cz) - tile * 0.5;
      for (const m of t.meshes) {
        m.near.visible = d < nearDist;
        m.far.visible = d >= nearDist && d < farDist;
      }
    }
  });

  return (
    <group name="trees">
      {tiles.flatMap((t) => t.meshes.flatMap((m) => [<primitive key={m.near.uuid} object={m.near} />, <primitive key={m.far.uuid} object={m.far} />]))}
    </group>
  );
}

// Boulders by 500 m tile, hidden beyond ~1.5 km where they'd be a few pixels.
export function Rocks({ rocks, quality, tile = 500 }) {
  const camera = useThree((s) => s.camera);
  const material = useMemo(() => patchMaterial(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true })), []);
  const geos = useMemo(() => [1, 2, 3, 4].map((s) => rockGeometry(s * 97)), []);
  const tiles = useMemo(() => {
    const byTile = new Map();
    rocks.forEach((r, i) => {
      const key = `${Math.floor(r.x / tile)},${Math.floor(r.z / tile)}`;
      if (!byTile.has(key)) byTile.set(key, { cx: (Math.floor(r.x / tile) + 0.5) * tile, cz: (Math.floor(r.z / tile) + 0.5) * tile, lists: geos.map(() => []) });
      byTile.get(key).lists[i % geos.length].push(r);
    });
    return [...byTile.values()].map((t) => ({
      cx: t.cx,
      cz: t.cz,
      meshes: t.lists
        .map((list, k) => {
          if (!list.length) return null;
          const m = new THREE.InstancedMesh(geos[k], material, list.length);
          list.forEach((r, i) => {
            tmp.position.set(r.x, r.y - r.s * 0.3, r.z);
            tmp.rotation.set(((r.rot * 3.1) % 0.4) - 0.2, r.rot, ((r.rot * 5.7) % 0.4) - 0.2);
            tmp.scale.setScalar(r.s);
            tmp.updateMatrix();
            m.setMatrixAt(i, tmp.matrix);
          });
          m.computeBoundingSphere();
          m.castShadow = quality.shadows;
          m.receiveShadow = quality.shadows;
          return m;
        })
        .filter(Boolean),
    }));
  }, [rocks, geos, material, quality.shadows, tile]);
  useEffect(() => () => tiles.forEach((t) => t.meshes.forEach((m) => m.dispose())), [tiles]);
  useEffect(() => () => (material.dispose(), geos.forEach((g) => g.dispose())), [material, geos]);
  const frame = useRef(0);
  const reach = 1500 * (quality.lodScale ?? 1);
  useFrame(() => {
    if (frame.current++ % 15) return;
    for (const t of tiles) {
      const visible = Math.hypot(camera.position.x - t.cx, camera.position.z - t.cz) - tile * 0.7 < reach;
      for (const m of t.meshes) m.visible = visible;
    }
  });
  return (
    <group name="rocks">
      {tiles.flatMap((t) => t.meshes.map((m) => <primitive key={m.uuid} object={m} />))}
    </group>
  );
}
