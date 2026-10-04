import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { pointAlong } from './lifts.js';

const tmp = new THREE.Object3D();
const color = new THREE.Color();
const useDispose = (...things) => useEffect(() => () => things.forEach((t) => t?.dispose?.()), things); // eslint-disable-line

// ---------- Village: OSM footprints extruded, snow on the roofs ----------
const WALLS = ['#8a7f73', '#a39686', '#6f655c', '#c9bba5', '#7b5c45', '#9a9fa6'];

export function Village({ buildings }) {
  const geometry = useMemo(() => {
    const parts = [];
    buildings.forEach((b, n) => {
      const shape = new THREE.Shape(b.ring.map(([x, z]) => new THREE.Vector2(x, z)));
      const g = new THREE.ExtrudeGeometry(shape, { depth: b.top - b.base, bevelEnabled: false, curveSegments: 1 });
      g.rotateX(Math.PI / 2); // footprint in xz, extruded downwards from y = 0
      g.translate(0, b.top, 0);
      const wall = color.set(WALLS[n % WALLS.length]);
      const cols = new Float32Array(g.attributes.position.count * 3);
      for (let i = 0; i < cols.length; i += 3) {
        cols[i] = wall.r;
        cols[i + 1] = wall.g;
        cols[i + 2] = wall.b;
      }
      g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
      parts.push(g);
    });
    if (!parts.length) return null;
    const merged = mergeGeometries(parts, true);
    parts.forEach((p) => p.dispose());
    return merged;
  }, [buildings]);
  const materials = useMemo(
    () => [
      new THREE.MeshStandardMaterial({ color: '#f4f7fb', roughness: 0.85 }), // caps: snowy roofs
      new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }), // walls
    ],
    [],
  );
  useDispose(geometry, ...materials);
  if (!geometry) return null;
  return <mesh geometry={geometry} material={materials} castShadow receiveShadow />;
}

// ---------- Lifts: towers, stations, cables and moving carriers ----------
function carrierGeometry(kind) {
  if (kind === 'cabin') {
    const body = new THREE.BoxGeometry(2.2, 2.4, 2.2).translate(0, -3.4, 0);
    const hanger = new THREE.BoxGeometry(0.12, 2.2, 0.12).translate(0, -1.1, 0);
    return mergeGeometries([body, hanger]);
  }
  if (kind === 'chair') {
    const seat = new THREE.BoxGeometry(0.7, 0.12, 2.6).translate(0.15, -2.3, 0);
    const back = new THREE.BoxGeometry(0.1, 0.8, 2.6).translate(-0.2, -1.9, 0);
    const hanger = new THREE.BoxGeometry(0.1, 2.3, 0.1).translate(0, -1.15, 0);
    const bar = new THREE.BoxGeometry(0.06, 0.06, 2.6).translate(0.55, -1.75, 0);
    return mergeGeometries([seat, back, hanger, bar]);
  }
  const pole = new THREE.CylinderGeometry(0.04, 0.04, 2.6, 4).translate(0, -1.3, 0);
  const t = new THREE.BoxGeometry(0.08, 0.08, 1.0).translate(0, -2.6, 0);
  return mergeGeometries([pole, t]);
}

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

export function Lifts({ lifts, quality }) {
  const towers = useMemo(() => lifts.filter((l) => l.kind !== 'carpet').flatMap((l) => l.towers.filter((t) => !t.end).map((t) => ({ ...t, l }))), [lifts]);
  const stations = useMemo(() => lifts.flatMap((l) => (l.kind === 'carpet' ? [] : [{ ...l.towers[0], l }, { ...l.towers.at(-1), l }])), [lifts]);

  const geo = useMemo(
    () => ({
      pole: new THREE.CylinderGeometry(0.3, 0.42, 1, 8).translate(0, 0.5, 0),
      arm: new THREE.BoxGeometry(0.35, 0.35, 1),
      station: new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0),
      roof: new THREE.BoxGeometry(1, 0.25, 1),
    }),
    [],
  );
  const mat = useMemo(
    () => ({
      steel: new THREE.MeshStandardMaterial({ color: '#7c858f', metalness: 0.6, roughness: 0.45 }),
      station: new THREE.MeshStandardMaterial({ color: '#5a6470', roughness: 0.7 }),
      roof: new THREE.MeshStandardMaterial({ color: '#c8102e', roughness: 0.6 }),
      carrier: new THREE.MeshStandardMaterial({ color: '#2b2f36', roughness: 0.5, metalness: 0.3 }),
      cabin: new THREE.MeshStandardMaterial({ color: '#d63a2f', roughness: 0.45 }),
    }),
    [],
  );

  const poles = useInstanced(towers.length, geo.pole, mat.steel, (m) =>
    towers.forEach((t, i) => {
      tmp.position.set(t.x, t.y0 - 0.5, t.z);
      tmp.rotation.set(0, 0, 0);
      tmp.scale.set(1, t.y1 - t.y0 + 0.5, 1);
      tmp.updateMatrix();
      m.setMatrixAt(i, tmp.matrix);
    }),
  );
  const arms = useInstanced(towers.length, geo.arm, mat.steel, (m) =>
    towers.forEach((t, i) => {
      tmp.position.set(t.x, t.y1 - 0.4, t.z);
      tmp.rotation.set(0, Math.atan2(t.dirX, t.dirZ), 0); // local z along the lift, x across it
      tmp.scale.set(t.l.spec.offset * 2 + 0.8, 1, 0.35);
      tmp.updateMatrix();
      m.setMatrixAt(i, tmp.matrix);
    }),
  );
  const stationSize = (k) => (k === 'cabin' ? [12, 7, 18] : k === 'chair' ? [9, 5.5, 13] : [3, 2.6, 4]);
  const stationMeshes = useInstanced(stations.length, geo.station, mat.station, (m) =>
    stations.forEach((t, i) => {
      const [w, h, d] = stationSize(t.l.kind);
      tmp.position.set(t.x, t.y0 - 1, t.z);
      tmp.rotation.set(0, Math.atan2(t.dirX, t.dirZ), 0);
      tmp.scale.set(w, h + 1, d);
      tmp.updateMatrix();
      m.setMatrixAt(i, tmp.matrix);
    }),
  );
  const roofs = useInstanced(stations.length, geo.roof, mat.roof, (m) =>
    stations.forEach((t, i) => {
      const [w, h, d] = stationSize(t.l.kind);
      tmp.position.set(t.x, t.y0 + h, t.z);
      tmp.rotation.set(0, Math.atan2(t.dirX, t.dirZ), 0);
      tmp.scale.set(w + 1, 1, d + 1);
      tmp.updateMatrix();
      m.setMatrixAt(i, tmp.matrix);
    }),
  );

  const cables = useMemo(() => {
    const pts = [];
    for (const l of lifts) {
      if (l.kind === 'carpet') continue;
      for (const line of l.kind === 'drag' ? [l.up] : [l.up, l.down])
        for (let i = 1; i < line.length; i++) pts.push(...line[i - 1], ...line[i]);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    return g;
  }, [lifts]);
  const cableMat = useMemo(() => new THREE.LineBasicMaterial({ color: '#2a2d33' }), []);

  // Carriers loop up one cable and down the other.
  const loops = useMemo(() => {
    const byKind = { chair: [], cabin: [], bar: [] };
    for (const l of lifts) {
      if (!l.spec.carrier) continue;
      const up = l.upCum.at(-1);
      const down = l.kind === 'drag' ? 0 : l.downCum.at(-1);
      const total = up + down;
      const every = l.spec.every / Math.max(0.35, quality.trees);
      const count = Math.floor(total / every);
      for (let i = 0; i < count; i++) byKind[l.spec.carrier].push({ l, offset: i * every, up, total });
    }
    return byKind;
  }, [lifts, quality.trees]);
  const carrierGeo = useMemo(() => ({ chair: carrierGeometry('chair'), cabin: carrierGeometry('cabin'), bar: carrierGeometry('drag') }), []);
  const carriers = {
    chair: useInstanced(loops.chair.length, carrierGeo.chair, mat.carrier, () => {}),
    cabin: useInstanced(loops.cabin.length, carrierGeo.cabin, mat.cabin, () => {}),
    bar: useInstanced(loops.bar.length, carrierGeo.bar, mat.carrier, () => {}),
  };
  useDispose(...Object.values(geo), ...Object.values(mat), ...Object.values(carrierGeo), cables, cableMat);

  const p = [];
  const q = [];
  const frame = useRef(0);
  useFrame(({ clock }) => {
    if (frame.current++ % 2) return; // carriers move slowly: every other frame is plenty
    const t = clock.elapsedTime;
    for (const kind of ['chair', 'cabin', 'bar']) {
      const mesh = carriers[kind];
      if (!mesh) continue;
      loops[kind].forEach((c, i) => {
        const { l } = c;
        let d = (c.offset + t * l.spec.speed) % c.total;
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
      });
      mesh.instanceMatrix.needsUpdate = true;
    }
  });

  return (
    <group>
      {poles && <primitive object={poles} castShadow />}
      {arms && <primitive object={arms} />}
      {stationMeshes && <primitive object={stationMeshes} castShadow receiveShadow />}
      {roofs && <primitive object={roofs} />}
      <lineSegments geometry={cables} material={cableMat} />
      {Object.entries(carriers).map(([k, m]) => m && <primitive key={k} object={m} frustumCulled={false} />)}
    </group>
  );
}

// ---------- Trees: low-poly pines, instanced per tile so they cull ----------
function pineGeometry() {
  const parts = [];
  const trunk = new THREE.CylinderGeometry(0.12, 0.18, 1.6, 5).translate(0, 0.8, 0);
  parts.push([trunk, '#4a3626', '#4a3626']);
  [
    [1.9, 3.2, 1.2],
    [1.5, 2.8, 2.6],
    [1.0, 2.4, 3.9],
    [0.55, 1.8, 5.0],
  ].forEach(([r, h, y]) => parts.push([new THREE.ConeGeometry(r, h, 7).translate(0, y + h / 2, 0), '#1e3b2a', '#eef3f8']));
  const geos = parts.map(([g, dark, snow]) => {
    const c = new THREE.Color();
    const n = g.attributes.normal;
    const pos = g.attributes.position;
    const cols = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      // Snow sits on the upward-facing, outer parts of each tier.
      const up = n.getY(i);
      c.set(dark).lerp(new THREE.Color(snow), Math.max(0, Math.min(1, (up - 0.25) * 2.2)) * 0.85);
      cols.set([c.r, c.g, c.b], i * 3);
    }
    g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    return g;
  });
  const merged = mergeGeometries(geos);
  geos.forEach((g) => g.dispose());
  return merged;
}

export function Trees({ trees, tile = 460, quality }) {
  const geometry = useMemo(pineGeometry, []);
  const material = useMemo(() => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }), []);
  const meshes = useMemo(() => {
    const tiles = new Map();
    for (const t of trees) {
      const k = `${Math.floor(t.x / tile)},${Math.floor(t.z / tile)}`;
      if (!tiles.has(k)) tiles.set(k, []);
      tiles.get(k).push(t);
    }
    return [...tiles.values()].map((list) => {
      const m = new THREE.InstancedMesh(geometry, material, list.length);
      list.forEach((t, i) => {
        tmp.position.set(t.x, t.y - 0.3, t.z);
        tmp.rotation.set(0, t.rot, 0);
        tmp.scale.setScalar(t.s);
        tmp.updateMatrix();
        m.setMatrixAt(i, tmp.matrix);
      });
      m.computeBoundingSphere();
      m.castShadow = quality.shadows;
      m.receiveShadow = false;
      return m;
    });
  }, [trees, tile, geometry, material, quality.shadows]);
  useDispose(geometry, material);
  return (
    <group>
      {meshes.map((m) => (
        <primitive key={m.uuid} object={m} />
      ))}
    </group>
  );
}

// ---------- Piste poles, coloured by difficulty ----------
export function PisteMarkers({ markers }) {
  const geometry = useMemo(() => new THREE.CylinderGeometry(0.035, 0.035, 1.6, 5).translate(0, 0.8, 0), []);
  const material = useMemo(() => new THREE.MeshStandardMaterial({ roughness: 0.6 }), []);
  const mesh = useInstanced(markers.length, geometry, material, (m) =>
    markers.forEach((p, i) => {
      tmp.position.set(p.x, p.y - 0.05, p.z);
      tmp.rotation.set(0, 0, 0);
      tmp.scale.set(1, 1, 1);
      tmp.updateMatrix();
      m.setMatrixAt(i, tmp.matrix);
      m.setColorAt(i, color.set(p.color));
    }),
  );
  useDispose(geometry, material);
  return mesh ? <primitive object={mesh} /> : null;
}
