import { useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

const HALF = 10; // m from the gate centre to each pole

// Flags for the active timed run: the next gate glows orange, passed gates disappear.
export default function Gates({ sim, course, heightAt }) {
  const parts = useMemo(() => {
    const pole = new THREE.CylinderGeometry(0.06, 0.06, 3, 6).translate(0, 1.5, 0);
    const flag = new THREE.PlaneGeometry(1.4, 0.9).translate(0.7, 2.5, 0);
    const banner = new THREE.BoxGeometry(1, 1.1, 0.08);
    const mats = {
      next: new THREE.MeshStandardMaterial({ color: '#ff7a1a', emissive: '#ff7a1a', emissiveIntensity: 0.6, side: THREE.DoubleSide }),
      later: new THREE.MeshStandardMaterial({ color: '#2f7cf6', side: THREE.DoubleSide }),
      pole: new THREE.MeshStandardMaterial({ color: '#e9edf2' }),
      start: new THREE.MeshStandardMaterial({ color: '#2fbf4f', emissive: '#2fbf4f', emissiveIntensity: 0.35 }),
      finish: new THREE.MeshStandardMaterial({ color: '#e03131', emissive: '#e03131', emissiveIntensity: 0.35 }),
    };
    return { pole, flag, banner, mats };
  }, []);
  useEffect(() => () => [parts.pole, parts.flag, parts.banner, ...Object.values(parts.mats)].forEach((x) => x.dispose()), [parts]);

  const group = useMemo(() => {
    const root = new THREE.Group();
    const last = course.gates.length - 1;
    course.gates.forEach((g, k) => {
      const gate = new THREE.Group();
      const px = -g.dirZ;
      const pz = g.dirX;
      const flags = [];
      for (const side of [-1, 1]) {
        const x = g.x + px * HALF * side;
        const z = g.z + pz * HALF * side;
        const y = heightAt(x, z);
        const pole = new THREE.Mesh(parts.pole, parts.mats.pole);
        pole.position.set(x, y - 0.1, z);
        const flag = new THREE.Mesh(parts.flag, parts.mats.later);
        flag.position.copy(pole.position);
        flag.rotation.y = Math.atan2(g.dirX, g.dirZ) + Math.PI / 2;
        pole.castShadow = flag.castShadow = true;
        gate.add(pole, flag);
        flags.push(flag);
      }
      if (k === 0 || k === last) {
        const banner = new THREE.Mesh(parts.banner, k === 0 ? parts.mats.start : parts.mats.finish);
        const y = Math.max(heightAt(g.x + px * HALF, g.z + pz * HALF), heightAt(g.x - px * HALF, g.z - pz * HALF));
        banner.position.set(g.x, y + 3.1, g.z);
        banner.scale.set(HALF * 2, 1, 1);
        banner.rotation.y = Math.atan2(g.dirX, g.dirZ) + Math.PI / 2;
        gate.add(banner);
      }
      gate.userData = { k, flags };
      root.add(gate);
    });
    return root;
  }, [course, heightAt, parts]);

  useFrame(() => {
    const run = sim.current.run;
    if (!run || run.course !== course) return;
    const next = run.started ? run.next : 0;
    for (const gate of group.children) {
      const { k, flags } = gate.userData;
      gate.visible = k >= next || (k === 0 && !run.started);
      const mat = k === next ? parts.mats.next : parts.mats.later;
      for (const f of flags) f.material = mat;
    }
  });

  return <primitive object={group} />;
}
