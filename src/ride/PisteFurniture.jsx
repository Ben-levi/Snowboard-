import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { DIFFICULTY_COLORS } from './resortFeatures.js';
import { t } from './he.js';

const tmp = new THREE.Object3D();

function netTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  ctx.strokeStyle = '#ff6a00';
  ctx.lineWidth = 3;
  for (let k = -64; k <= 128; k += 16) {
    ctx.beginPath();
    ctx.moveTo(k, 0);
    ctx.lineTo(k + 64, 64);
    ctx.moveTo(k + 64, 0);
    ctx.lineTo(k, 64);
    ctx.stroke();
  }
  ctx.fillStyle = '#ff6a00';
  ctx.fillRect(0, 0, 64, 5); // top cord
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
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

function instanced(geometry, material, items, place, { shadow = false } = {}) {
  if (!items.length) return null;
  const m = new THREE.InstancedMesh(geometry, material, items.length);
  items.forEach((it, i) => {
    place(it);
    tmp.updateMatrix();
    m.setMatrixAt(i, tmp.matrix);
  });
  m.computeBoundingSphere();
  m.castShadow = shadow;
  return m;
}

export default function PisteFurniture({ furniture, quality }) {
  const built = useMemo(() => {
    const { nets, pads, signs, guns } = furniture;
    const disposables = [];
    const keep = (...xs) => (disposables.push(...xs), xs[0]);

    const netTex = keep(netTexture());
    const netMat = keep(new THREE.MeshStandardMaterial({ map: netTex, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.8 }));
    const netGeo = keep(new THREE.PlaneGeometry(1, 1.3).translate(0, 0.65, 0));
    const postGeo = keep(new THREE.CylinderGeometry(0.04, 0.04, 1.5, 5).translate(0, 0.75, 0));
    const darkMat = keep(new THREE.MeshStandardMaterial({ color: '#30343b', roughness: 0.6, metalness: 0.4 }));
    const padGeo = keep(new THREE.CylinderGeometry(1.05, 1.05, 2.4, 14).translate(0, 1.2, 0));
    const padMat = keep(new THREE.MeshStandardMaterial({ color: '#e8452c', roughness: 0.75 }));
    const gunPole = keep(new THREE.CylinderGeometry(0.1, 0.14, 3.2, 6).translate(0, 1.6, 0));
    const gunBarrel = keep(new THREE.CylinderGeometry(0.55, 0.45, 1.3, 12).rotateX(Math.PI / 2 - 0.5).translate(0, 3.4, 0.25));
    const gunMat = keep(new THREE.MeshStandardMaterial({ color: '#d9d4c7', roughness: 0.55, metalness: 0.3 }));
    const gunHead = keep(new THREE.MeshStandardMaterial({ color: '#f2b705', roughness: 0.5 }));

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
      instanced(padGeo, padMat, pads, (p) => {
        tmp.position.set(p.x, p.y - 0.2, p.z);
        tmp.rotation.set(0, 0, 0);
        tmp.scale.set(1, 1, 1);
      }, { shadow: quality.shadows }),
      instanced(gunPole, gunMat, guns, (g) => {
        tmp.position.set(g.x, g.y - 0.1, g.z);
        tmp.rotation.set(0, g.yaw, 0);
        tmp.scale.set(1, 1, 1);
      }, { shadow: quality.shadows }),
      instanced(gunBarrel, gunHead, guns, (g) => {
        tmp.position.set(g.x, g.y - 0.1, g.z);
        tmp.rotation.set(0, g.yaw, 0);
        tmp.scale.set(1, 1, 1);
      }, { shadow: quality.shadows }),
    ].filter(Boolean);

    // Signs: a board on two posts.
    const boardGeo = keep(new THREE.PlaneGeometry(2.6, 1.3));
    const signPosts = keep(new THREE.CylinderGeometry(0.05, 0.05, 2.6, 5).translate(0, 1.3, 0));
    const signGroup = new THREE.Group();
    for (const s of signs) {
      const tex = keep(signTexture(s));
      const mat = keep(new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7, side: THREE.DoubleSide }));
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
    <group>
      {built.meshes.map((m) => (
        <primitive key={m.uuid} object={m} />
      ))}
      <primitive object={built.signGroup} />
    </group>
  );
}
