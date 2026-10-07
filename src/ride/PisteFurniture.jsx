import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { DIFFICULTY_COLORS } from './resortFeatures.js';
import { t } from './he.js';
import { patchMaterial } from './atmosphere.js';
import { padGeometry, snowGunGeometry } from './models.js';

const tmp = new THREE.Object3D();

// Orange safety netting: a fine diamond mesh with a thicker top cord.
function netTexture() {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext('2d');
  ctx.strokeStyle = '#ff5a00';
  ctx.lineWidth = 2.2;
  for (let k = -128; k <= 256; k += 16) {
    ctx.beginPath();
    ctx.moveTo(k, 0);
    ctx.lineTo(k + 128, 128);
    ctx.moveTo(k + 128, 0);
    ctx.lineTo(k, 128);
    ctx.stroke();
  }
  ctx.fillStyle = '#ff5a00';
  ctx.fillRect(0, 0, 128, 6);
  ctx.fillRect(0, 122, 128, 6);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.generateMipmaps = true;
  return tex;
}

function signTexture({ name, difficulty, boardercross }) {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 256;
  const ctx = c.getContext('2d');
  const color = boardercross ? '#ff7a1a' : DIFFICULTY_COLORS[difficulty] ?? '#2f7cf6';
  ctx.fillStyle = '#f5f6f8';
  ctx.fillRect(0, 0, 512, 256);
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 512, 64);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 40px Rubik, Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(boardercross ? 'BOARDERCROSS' : 'GRANDVALIRA', 256, 34);
  ctx.fillStyle = '#111';
  ctx.font = 'bold 64px Rubik, Arial, sans-serif';
  ctx.fillText(name, 256, 138, 480);
  ctx.font = 'bold 34px Rubik, Arial, sans-serif';
  ctx.fillStyle = color === '#16181c' ? '#16181c' : color;
  ctx.fillText(boardercross ? t.boardercross : t.difficulty[difficulty] ?? '', 256, 208);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// Instanced by 600 m tile, so whole-map sets are culled (and only nearby ones drawn into the shadow map).
function instanced(geometry, material, items, place, { shadow = false, tile = 600 } = {}) {
  const tiles = new Map();
  for (const it of items) {
    const key = `${Math.floor(it.x / tile)},${Math.floor(it.z / tile)}`;
    if (!tiles.has(key)) tiles.set(key, []);
    tiles.get(key).push(it);
  }
  return [...tiles.values()].map((list) => {
    const m = new THREE.InstancedMesh(geometry, material, list.length);
    list.forEach((it, i) => {
      place(it);
      tmp.updateMatrix();
      m.setMatrixAt(i, tmp.matrix);
    });
    m.computeBoundingSphere();
    m.castShadow = shadow;
    return m;
  });
}

export default function PisteFurniture({ furniture, quality }) {
  const built = useMemo(() => {
    const { nets, pads, signs, guns } = furniture;
    const disposables = [];
    const keep = (...xs) => (disposables.push(...xs), xs[0]);

    const netTex = keep(netTexture());
    const netMat = keep(patchMaterial(new THREE.MeshStandardMaterial({ map: netTex, alphaTest: 0.35, side: THREE.DoubleSide, roughness: 0.8 })));
    const netGeo = keep(new THREE.PlaneGeometry(1, 1.4).translate(0, 0.55, 0));
    netGeo.attributes.uv.array.forEach((v, i, a) => i % 2 === 0 && (a[i] = v * 12)); // repeat the mesh along the net (nets are ~12 m)
    const postGeo = keep(new THREE.CylinderGeometry(0.035, 0.035, 1.6, 6).translate(0, 0.65, 0));
    const darkMat = keep(patchMaterial(new THREE.MeshStandardMaterial({ color: '#30343b', roughness: 0.6, metalness: 0.4 })));
    const padGeo = keep(padGeometry());
    const gunGeo = keep(snowGunGeometry());
    const modelMat = keep(patchMaterial(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.2 })));

    const meshes = [
      instanced(netGeo, netMat, nets, (n) => {
        tmp.position.set(n.x, n.y - 0.05, n.z);
        tmp.rotation.set(0, n.yaw + Math.PI / 2, 0);
        tmp.scale.set(n.len, 1, 1);
      }),
      instanced(postGeo, darkMat, nets, (n) => {
        tmp.position.set(n.x, n.y - 0.05, n.z);
        tmp.rotation.set(0, 0, 0);
        tmp.scale.set(1, 1, 1);
      }),
      instanced(padGeo, modelMat, pads, (p) => {
        tmp.position.set(p.x, p.y - 0.2, p.z);
        tmp.rotation.set(0, 0, 0);
        tmp.scale.set(1, 1, 1);
      }, { shadow: quality.shadows }),
      instanced(gunGeo, modelMat, guns, (g) => {
        tmp.position.set(g.x, g.y - 0.15, g.z);
        tmp.rotation.set(0, g.yaw, 0);
        tmp.scale.set(1, 1, 1);
      }, { shadow: quality.shadows }),
    ].flat();

    // Signs: a board on two posts.
    const boardGeo = keep(new THREE.PlaneGeometry(2.6, 1.3));
    const signPosts = keep(new THREE.CylinderGeometry(0.05, 0.05, 2.6, 5).translate(0, 1.3, 0));
    const signGroup = new THREE.Group();
    for (const s of signs) {
      const tex = keep(signTexture(s));
      const mat = keep(patchMaterial(new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7, side: THREE.DoubleSide })));
      const g = new THREE.Group();
      g.position.set(s.x, s.y - 0.1, s.z);
      g.rotation.y = s.yaw;
      const board = new THREE.Mesh(boardGeo, mat);
      board.position.y = 2.2;
      board.castShadow = quality.shadows;
      const l = new THREE.Mesh(signPosts, darkMat);
      l.position.x = -1.1;
      const r = new THREE.Mesh(signPosts, darkMat);
      r.position.x = 1.1;
      g.add(board, l, r);
      signGroup.add(g);
    }
    return { meshes, signGroup, disposables };
  }, [furniture, quality.shadows]);

  useEffect(() => () => built.disposables.forEach((d) => d.dispose()), [built]);

  return (
    <group name="furniture">
      {built.meshes.map((m) => (
        <primitive key={m.uuid} object={m} />
      ))}
      <primitive object={built.signGroup} />
    </group>
  );
}
