import { Suspense, useEffect, useMemo, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { ContactShadows, Environment, Lightformer, OrbitControls, useGLTF } from '@react-three/drei';
import { t } from '../i18n/he.js';
import { SECTIONS } from '../data/gearCatalog.js';
import { sectionStatus } from '../lib/stats.js';
import { sectionFromObjectName } from '../lib/splineScene.js';
import { TINTS } from './RiderFigure.jsx';

// Rider models built by tools/blender/dress_rider.py; parts are named "<section>-<part>".
export const modelUrl = (rider) =>
  `${import.meta.env.BASE_URL}models/rider-${rider === 'ski' ? 'ski' : 'snowboard'}.glb`;

function sectionOf(obj) {
  for (let o = obj; o; o = o.parent) {
    const s = sectionFromObjectName(o.name);
    if (s) return s;
  }
  return null;
}

function Model({ member, hover, onHover, onSelect }) {
  const { scene } = useGLTF(modelUrl(member.rider));

  // Own copy with per-mesh materials so highlights don't leak between parts or riders.
  const model = useMemo(() => {
    const root = scene.clone(true);
    const meshes = [];
    root.traverse((o) => {
      if (!o.isMesh) return;
      o.material = o.material.clone();
      o.castShadow = true;
      o.userData.section = sectionOf(o);
      meshes.push(o);
    });
    return { root, meshes };
  }, [scene]);

  // Only the part under the pointer lights up (in its status colour); the outfit keeps its designed look
  // otherwise — status is shown by the chips under the figure.
  useFrame(() => {
    for (const m of model.meshes) {
      const s = m.userData.section;
      if (!s || !m.material.emissive) continue;
      if (s === hover) {
        m.material.emissive.set(TINTS[sectionStatus(member, s)].stroke);
        m.material.emissiveIntensity = 0.16;
      } else {
        m.material.emissiveIntensity = 0;
      }
    }
  });

  return (
    <primitive
      object={model.root}
      onPointerOver={(e) => {
        e.stopPropagation();
        onHover(sectionOf(e.object));
      }}
      onPointerOut={() => onHover(null)}
      onClick={(e) => {
        e.stopPropagation();
        if (e.delta > 6) return; // end of an orbit drag, not a tap
        const s = sectionOf(e.object);
        if (s) onSelect?.(s);
      }}
    />
  );
}

// Pro rider model on a dark studio stage: drag to spin, tap a part to open its gear.
export default function RiderModel({ member, onSelect, size = 300 }) {
  const [hover, setHover] = useState(null);
  const [spinning, setSpinning] = useState(true);

  useEffect(() => {
    document.body.style.cursor = hover ? 'pointer' : '';
  }, [hover]);
  useEffect(() => () => void (document.body.style.cursor = ''), []);

  const hovered = SECTIONS.find((s) => s.id === hover);

  return (
    <div className="figure-stage rider-3d rider-model" style={{ width: '100%', maxWidth: size }}>
      <div className="canvas-wrap stage-dark" style={{ height: size * 1.35 }}>
        <Canvas shadows dpr={[1, 2]} camera={{ position: [0, 1.15, 3.9], fov: 30 }} aria-label={t.rider.ariaFigure(member.name)}>
          <ambientLight intensity={0.25} />
          <directionalLight position={[-2.5, 4, 3]} intensity={2.2} color="#fff0e0" castShadow shadow-mapSize={[1024, 1024]} />
          <pointLight position={[-2.2, 1.8, -2.2]} intensity={14} color="#9fd8ff" />
          <pointLight position={[2.4, 2.2, -2]} intensity={12} color="#ffffff" />
          <pointLight position={[0.4, 1.7, 3]} intensity={2.5} color="#ffe8d8" />
          <Environment resolution={128}>
            <Lightformer intensity={1.2} position={[0, 4, 4]} scale={[8, 3, 1]} />
            <Lightformer intensity={2} color="#9fd8ff" position={[-5, 2, -2]} scale={[3, 6, 1]} />
            <Lightformer intensity={1.2} position={[5, 1, 2]} scale={[3, 3, 1]} />
          </Environment>
          <Suspense fallback={null}>
            <Model member={member} hover={hover} onHover={setHover} onSelect={onSelect} />
          </Suspense>
          <ContactShadows position={[0, 0.001, 0]} opacity={0.7} scale={4} blur={2.2} far={2} color="#000000" />
          <OrbitControls
            target={[0, 0.9, 0]}
            enablePan={false}
            enableZoom={false}
            minPolarAngle={Math.PI / 3.2}
            maxPolarAngle={Math.PI / 1.95}
            autoRotate={spinning}
            autoRotateSpeed={1.1}
            onStart={() => setSpinning(false)}
          />
        </Canvas>
      </div>
      <div className="figure-caption" aria-live="polite">
        {hovered
          ? `${hovered.emoji} ${hovered.label} · ${TINTS[sectionStatus(member, hovered.id)].label}`
          : t.rider.hint3d}
      </div>
    </div>
  );
}
