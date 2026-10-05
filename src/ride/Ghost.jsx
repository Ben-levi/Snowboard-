import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { ghostAt } from './ghost.js';
import { RIDER_URL } from './Rider.jsx';

const out = {};
const n = [0, 1, 0];
const X = new THREE.Vector3();
const Y = new THREE.Vector3();
const Z = new THREE.Vector3();
const m = new THREE.Matrix4();

// A see-through rider replaying the ghost run, in step with the current run's clock.
export default function Ghost({ sim, ghost, world }) {
  const { scene } = useGLTF(RIDER_URL);
  const model = useMemo(() => {
    const root = scene.clone(true);
    const material = new THREE.MeshBasicMaterial({
      color: ghost.mine ? '#7cc4ff' : '#ffd43b',
      transparent: true,
      opacity: 0.38,
      depthWrite: false,
    });
    root.traverse((o) => {
      if (o.isMesh) {
        o.material = material;
        o.castShadow = false;
      }
    });
    return root;
  }, [scene, ghost.mine]);
  const group = useRef();

  useFrame(() => {
    const run = sim.current.run;
    const g = group.current;
    if (!g || !run) return;
    const t = run.started ? sim.current.rider.time - run.startTime : 0;
    if (!ghostAt(ghost.data, t, out)) return;
    g.visible = !out.done || run.finished;
    world.normalAt(out.x, out.z, n);
    Y.set(n[0], n[1], n[2]);
    X.set(Math.sin(out.heading), 0, Math.cos(out.heading));
    X.addScaledVector(Y, -X.dot(Y)).normalize();
    Z.crossVectors(X, Y);
    m.makeBasis(X, Y, Z);
    g.quaternion.setFromRotationMatrix(m);
    g.position.set(out.x, world.heightAt(out.x, out.z), out.z);
  });

  return (
    <group ref={group}>
      <primitive object={model} />
    </group>
  );
}
