import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { pointAlong } from './lifts.js';
import { patchMaterial } from './atmosphere.js';
import { buildVillage } from './villageGeometry.js';
import { createFacadeMaterial } from './facadeMaterial.js';
import { cabinGeometry, chairGeometry, pisteMarkerGeometry, stationGeometry, tbarGeometry, towerGeometry } from './models.js';

const tmp = new THREE.Object3D();
const color = new THREE.Color();
const useDispose = (...things) => useEffect(() => () => things.forEach((t) => t?.dispose?.()), things); // eslint-disable-line

// ---------- Village: walls with facades, pitched snowy roofs, balconies ----------
function geometryFrom({ pos, nor, col, extra }, withFacade) {
  if (!pos.length) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  if (withFacade) g.setAttribute('facade', new THREE.Float32BufferAttribute(extra, 4));
  g.computeBoundingSphere();
  return g;
}

export function Village({ buildings, quality }) {
  const geos = useMemo(() => {
    const { facade, plain } = buildVillage(buildings);
    return { facade: geometryFrom(facade, true), plain: geometryFrom(plain, false) };
  }, [buildings]);
  const facadeMat = useMemo(createFacadeMaterial, []);
  const plainMat = useMemo(() => patchMaterial(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, side: THREE.DoubleSide })), []);
  useDispose(geos.facade, geos.plain, facadeMat, plainMat);
  const shadows = quality?.shadows ?? true;
  return (
    <group name="village">
      {geos.facade && <mesh geometry={geos.facade} material={facadeMat} castShadow={shadows} receiveShadow={shadows} />}
      {geos.plain && <mesh geometry={geos.plain} material={plainMat} castShadow={shadows} receiveShadow={shadows} />}
    </group>
  );
}

// ---------- Lifts: towers, stations, cables and moving carriers ----------
function useInstanced(count, geometry, material, fill) {
  return useMemo(() => {
    if (!count) return null;
    const mesh = new THREE.InstancedMesh(geometry, material, count);
    fill(mesh);
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    return mesh;
  }, [count, geometry, material]); // eslint-disable-line react-hooks/exhaustive-deps
}

const KINDS = ['chair', 'cabin', 'drag'];

export function Lifts({ lifts, quality }) {
  const lines = useMemo(() => lifts.filter((l) => l.kind !== 'carpet'), [lifts]);
  const material = useMemo(() => patchMaterial(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.25 })), []);

  // Towers and stations per lift kind (their sizes differ by kind).
  const geo = useMemo(() => {
    const out = {};
    for (const k of KINDS) {
      const l = lines.find((x) => x.kind === k);
      if (!l) continue;
      out[k] = { tower: towerGeometry(l.spec.tower, l.spec.offset, k), station: stationGeometry(k, l.spec.offset) };
    }
    return out;
  }, [lines]);
  // One instanced set per lift line, so far-away lines are culled and only nearby ones cast shadows.
  const towerMeshes = useMemo(
    () =>
      lines
        .filter((l) => geo[l.kind])
        .flatMap((l) => {
          const place = (list, g, lift = 0) => {
            if (!list.length) return null;
            const m = new THREE.InstancedMesh(g, material, list.length);
            list.forEach((t, i) => {
              tmp.position.set(t.x, t.y0 - lift, t.z);
              tmp.rotation.set(0, Math.atan2(t.dirX, t.dirZ), 0);
              tmp.scale.set(1, 1, 1);
              tmp.updateMatrix();
              m.setMatrixAt(i, tmp.matrix);
            });
            m.computeBoundingSphere();
            m.castShadow = quality.shadows;
            m.receiveShadow = quality.shadows;
            return m;
          };
          return [place(l.towers.filter((t) => !t.end), geo[l.kind].tower), place([l.towers[0], l.towers.at(-1)], geo[l.kind].station, 0.3)].filter(Boolean);
        }),
    [geo, lines, material, quality.shadows],
  );

  const cables = useMemo(() => {
    const pts = [];
    for (const l of lines) {
      for (const line of l.kind === 'drag' ? [l.up] : [l.up, l.down])
        for (let i = 1; i < line.length; i++) pts.push(...line[i - 1], ...line[i]);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    return g;
  }, [lines]);
  const cableMat = useMemo(() => new THREE.LineBasicMaterial({ color: '#16181b' }), []);

  // Carriers loop up one cable and down the other: one instanced set per lift, with fixed bounds around
  // the whole line, so lifts out of view are skipped even though their chairs move.
  const carrierGeo = useMemo(() => ({ chair: chairGeometry(), cabin: cabinGeometry(), bar: tbarGeometry() }), []);
  const carriers = useMemo(
    () =>
      lines
        .filter((l) => l.spec.carrier)
        .map((l) => {
          const up = l.upCum.at(-1);
          const down = l.kind === 'drag' ? 0 : l.downCum.at(-1);
          const total = up + down;
          const every = l.spec.every / Math.max(0.35, quality.trees);
          const count = Math.floor(total / every);
          if (!count) return null;
          const mesh = new THREE.InstancedMesh(carrierGeo[l.spec.carrier], material, count);
          const box = new THREE.Box3().setFromPoints([...l.up, ...l.down].map((p) => new THREE.Vector3(...p)));
          mesh.boundingSphere = box.getBoundingSphere(new THREE.Sphere());
          mesh.boundingSphere.radius += 6;
          mesh.computeBoundingSphere = () => {}; // keep the fixed bounds
          return { l, mesh, count, every, up, total };
        })
        .filter(Boolean),
    [lines, quality.trees, carrierGeo, material],
  );
  useEffect(() => () => carriers.forEach((c) => c.mesh.dispose()), [carriers]);
  useEffect(() => () => towerMeshes.forEach((m) => m.dispose()), [towerMeshes]);
  useDispose(material, ...Object.values(carrierGeo), cables, cableMat);
  useEffect(() => () => Object.values(geo).forEach((g) => (g.tower.dispose(), g.station.dispose())), [geo]);

  const p = [];
  const q = [];
  const frame = useRef(0);
  useFrame(({ clock }) => {
    if (frame.current++ % 2) return; // carriers move slowly: every other frame is plenty
    const t = clock.elapsedTime;
    for (const c of carriers) {
      const { l, mesh } = c;
      for (let i = 0; i < c.count; i++) {
        let d = (i * c.every + t * l.spec.speed) % c.total;
        let line = l.up;
        let cum = l.upCum;
        if (d > c.up) {
          d -= c.up;
          line = l.down;
          cum = l.downCum;
        }
        pointAlong(line, cum, d, p);
        pointAlong(line, cum, d + 1, q);
        tmp.position.set(p[0], p[1], p[2]);
        tmp.rotation.set(0, Math.atan2(q[0] - p[0], q[2] - p[2]) - Math.PI / 2, 0);
        tmp.scale.set(1, 1, 1);
        tmp.updateMatrix();
        mesh.setMatrixAt(i, tmp.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
    }
  });

  return (
    <group name="lifts">
      {towerMeshes.map((m) => (
        <primitive key={m.uuid} object={m} />
      ))}
      <lineSegments geometry={cables} material={cableMat} />
      {carriers.map((c) => (
        <primitive key={c.mesh.uuid} object={c.mesh} />
      ))}
    </group>
  );
}

// ---------- Piste poles, coloured by difficulty ----------
export function PisteMarkers({ markers }) {
  const geometry = useMemo(pisteMarkerGeometry, []);
  const material = useMemo(() => patchMaterial(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5 })), []);
  const mesh = useInstanced(markers.length, geometry, material, (m) =>
    markers.forEach((p, i) => {
      tmp.position.set(p.x, p.y - 0.15, p.z);
      tmp.rotation.set(0, 0, 0);
      tmp.scale.set(1, 1, 1);
      tmp.updateMatrix();
      m.setMatrixAt(i, tmp.matrix);
      m.setColorAt(i, color.set(p.color));
    }),
  );
  useDispose(geometry, material);
  return mesh ? <primitive object={mesh} name="markers" /> : null;
}
