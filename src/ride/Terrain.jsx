import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

const CHUNK = 64; // cells per chunk side
const SKIRT = 30; // m: skirts hide cracks between chunks of different detail

// Geometry for one chunk, sampling every `stride` cells, with a skirt around the border.
function chunkGeometry(field, ci, cj, stride) {
  const n = CHUNK / stride + 1;
  const count = n * n + 4 * (n - 1);
  const pos = new Float32Array(count * 3);
  const nor = new Float32Array(count * 3);
  const normal = [0, 1, 0];
  const put = (k, x, y, z) => {
    pos[k * 3] = x;
    pos[k * 3 + 1] = y;
    pos[k * 3 + 2] = z;
    field.normalAt(x, z, normal);
    nor[k * 3] = normal[0];
    nor[k * 3 + 1] = normal[1];
    nor[k * 3 + 2] = normal[2];
  };
  const gi0 = ci * CHUNK;
  const gj0 = cj * CHUNK;
  for (let b = 0; b < n; b++)
    for (let a = 0; a < n; a++) {
      const i = gi0 + a * stride;
      const j = gj0 + b * stride;
      put(b * n + a, field.x0 + i * field.cell, field.vertex(i, j), field.z0 + j * field.cell);
    }
  const idx = [];
  for (let b = 0; b < n - 1; b++)
    for (let a = 0; a < n - 1; a++) {
      const k = b * n + a;
      idx.push(k, k + n, k + 1, k + 1, k + n, k + n + 1);
    }
  // Skirt: walk the border once, dropping a copy of each vertex.
  const border = [];
  for (let a = 0; a < n - 1; a++) border.push(a);
  for (let b = 0; b < n - 1; b++) border.push(b * n + n - 1);
  for (let a = n - 1; a > 0; a--) border.push((n - 1) * n + a);
  for (let b = n - 1; b > 0; b--) border.push(b * n);
  let k = n * n;
  border.forEach((top) => {
    put(k, pos[top * 3], pos[top * 3 + 1] - SKIRT, pos[top * 3 + 2]);
    k++;
  });
  const m = border.length;
  for (let s = 0; s < m; s++) {
    const t0 = border[s];
    const t1 = border[(s + 1) % m];
    const s0 = n * n + s;
    const s1 = n * n + ((s + 1) % m);
    idx.push(t0, s0, t1, t1, s0, s1, t0, t1, s0, t1, s1, s0); // both windings
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

// Near terrain in chunks with three levels of detail chosen by distance from the camera.
export function NearTerrain({ field, material, lodScale = 1 }) {
  const camera = useThree((s) => s.camera);
  const chunks = useMemo(() => {
    const list = [];
    for (let cj = 0; cj < field.rows / CHUNK; cj++)
      for (let ci = 0; ci < field.cols / CHUNK; ci++) {
        const mesh = new THREE.Mesh(undefined, material);
        mesh.receiveShadow = true;
        mesh.matrixAutoUpdate = false;
        list.push({
          ci,
          cj,
          cx: field.x0 + (ci + 0.5) * CHUNK * field.cell,
          cz: field.z0 + (cj + 0.5) * CHUNK * field.cell,
          geos: [],
          lod: -1,
          mesh,
        });
      }
    return list;
  }, [field, material]);

  useEffect(
    () => () => {
      for (const c of chunks) for (const g of c.geos) g?.dispose();
    },
    [chunks],
  );

  const frame = useRef(0);
  // Level of detail by distance. New geometry is built a few chunks per frame, nearest first, so the
  // first frames stay quick on phones; until then every chunk shows its cheap coarse version.
  const pending = useRef(true);
  useFrame(() => {
    frame.current++;
    if (!pending.current && frame.current % 10) return;
    pending.current = false;
    const size = CHUNK * field.cell;
    for (const c of chunks) c.d = Math.max(0, Math.hypot(camera.position.x - c.cx, camera.position.z - c.cz) - size * 0.7);
    const order = [...chunks].sort((a, b) => a.d - b.d);
    let budget = 3;
    for (const c of order) {
      const lod = c.d < 700 * lodScale ? 0 : c.d < 2000 * lodScale ? 1 : 2;
      if (lod === c.lod) continue;
      if (!c.geos[lod]) {
        if (c.lod < 0 && lod !== 2) {
          c.geos[2] ??= chunkGeometry(field, c.ci, c.cj, 4); // something to show right away
          c.mesh.geometry = c.geos[2];
          c.lod = 2;
        }
        if (budget <= 0 && c.lod >= 0) {
          pending.current = true;
          continue;
        }
        c.geos[lod] = chunkGeometry(field, c.ci, c.cj, 1 << lod);
        budget--;
      }
      c.mesh.geometry = c.geos[lod];
      c.lod = lod;
    }
  });

  return (
    <group name="terrain">
      {chunks.map((c) => (
        <primitive key={`${c.ci}-${c.cj}`} object={c.mesh} />
      ))}
    </group>
  );
}

// Wide, coarse terrain for the horizon. Vertices under the near terrain are pushed down out of sight.
export function FarTerrain({ far, near, material }) {
  const geometry = useMemo(() => {
    const w = far.cols + 1;
    const pos = new Float32Array(w * (far.rows + 1) * 3);
    const nor = new Float32Array(pos.length);
    const normal = [0, 1, 0];
    const inset = near.cell * 4;
    for (let j = 0; j <= far.rows; j++)
      for (let i = 0; i <= w - 1; i++) {
        const k = (j * w + i) * 3;
        const x = far.x0 + i * far.cell;
        const z = far.z0 + j * far.cell;
        const hidden = near.inside(x, z, inset);
        pos[k] = x;
        pos[k + 1] = far.vertex(i, j) - (hidden ? 120 : 6);
        pos[k + 2] = z;
        far.normalAt(x, z, normal);
        nor[k] = normal[0];
        nor[k + 1] = normal[1];
        nor[k + 2] = normal[2];
      }
    const idx = [];
    for (let j = 0; j < far.rows; j++)
      for (let i = 0; i < far.cols; i++) {
        const k = j * w + i;
        idx.push(k, k + w, k + 1, k + 1, k + w, k + w + 1);
      }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    g.setIndex(idx);
    g.computeBoundingSphere();
    return g;
  }, [far, near]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return <mesh geometry={geometry} material={material} />;
}
