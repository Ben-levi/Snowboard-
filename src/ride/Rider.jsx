import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';

// The Blender-built rider from the gear app (tools/blender/dress_rider.py).
// In the model, the board's nose points along +x and the rider's toes face +z.
export const RIDER_URL = `${import.meta.env.BASE_URL}models/rider-snowboard.glb`;
useGLTF.preload(RIDER_URL);

const X = new THREE.Vector3();
const Y = new THREE.Vector3();
const Z = new THREE.Vector3();
const basis = new THREE.Matrix4();
const lean = new THREE.Quaternion();
const AXIS_X = new THREE.Vector3(1, 0, 0);
const target = new THREE.Vector3();
const normal = [0, 1, 0];

export default function Rider({ sim, world }) {
  const { scene } = useGLTF(RIDER_URL);
  const model = useMemo(() => {
    const root = scene.clone(true);
    root.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
    return root;
  }, [scene]);
  const group = useRef();
  const body = useRef();
  const up = useRef(new THREE.Vector3(0, 1, 0));

  useFrame((_, dt) => {
    const s = sim.current.rider;
    const pose = sim.current.pose ?? s;
    const g = group.current;
    if (!g) return;
    // Board follows the snow (smoothed); in the air it drifts back to upright.
    if (s.airborne) target.set(0, 1, 0);
    else target.fromArray(world.normalAt(pose.x, pose.z, normal));
    up.current.lerp(target, 1 - Math.exp(-dt * (s.airborne ? 3 : 14))).normalize();
    Y.copy(up.current);
    X.set(Math.sin(pose.heading), 0, Math.cos(pose.heading));
    X.addScaledVector(Y, -X.dot(Y)).normalize();
    Z.crossVectors(X, Y);
    basis.makeBasis(X, Y, Z);
    g.quaternion.setFromRotationMatrix(basis);
    g.position.set(pose.x, pose.y, pose.z);

    // Lean into the edge; crouch to load an ollie or tuck; topple over on a crash.
    const crashLean = s.crashed > 0 ? Math.min(1.35, (2 - s.crashed) * 4) : 0;
    lean.setFromAxisAngle(AXIS_X, s.edge * 0.7 + crashLean);
    body.current.quaternion.copy(lean);
    const squat = 1 - 0.14 * s.charge - 0.07 * (sim.current.input.tuck ?? 0);
    body.current.scale.set(1, squat, 1);
  });

  return (
    <group ref={group}>
      <group ref={body}>
        <primitive object={model} />
      </group>
    </group>
  );
}
