import { createContext, useContext, useEffect, useState } from 'react';
import { t } from '../i18n/he.js';
import { Canvas } from '@react-three/fiber';
import { ContactShadows, Environment, Float, Lightformer, OrbitControls, Outlines, RoundedBox } from '@react-three/drei';
import { SECTIONS } from '../data/gearCatalog.js';
import { sectionStatus } from '../lib/stats.js';
import { TINTS } from './RiderFigure.jsx';

// Pastel SVG fills wash out under 3D lighting, so parts use richer versions of the same hues.
const COLORS_3D = {
  done: '#51cf66',
  partial: '#74c0fc',
  borrow: '#ffa94d',
  buy: '#ff6b6b',
  empty: '#e9ecef',
};

const SKIN = '#ffd3b0';
const DARK = '#343a40';

const SectionCtx = createContext(null);

// Material + outline shared by every tinted part: colour from the section state,
// translucent "ghost" when nothing is set, glow and outline while hovered/selected.
function SectionSkin({ color }) {
  const s = useContext(SectionCtx);
  const ghost = s.state === 'empty' && !color;
  const base = color ?? COLORS_3D[s.state];
  return (
    <>
      <meshStandardMaterial
        color={base}
        roughness={0.55}
        emissive={base}
        emissiveIntensity={s.active ? 0.22 : 0}
        transparent={ghost}
        opacity={ghost ? 0.4 : 1}
        depthWrite={!ghost}
      />
      {s.active && <Outlines thickness={0.035} color={s.stroke} />}
    </>
  );
}

function Part({ geometry, color, ...props }) {
  return (
    <mesh castShadow receiveShadow {...props}>
      {geometry}
      <SectionSkin color={color} />
    </mesh>
  );
}

function Block({ args, radius = 0.08, color, ...props }) {
  return (
    <RoundedBox args={args} radius={radius} smoothness={4} castShadow receiveShadow {...props}>
      <SectionSkin color={color} />
    </RoundedBox>
  );
}

function Section({ id, member, hover, selected, onHover, onSelect, children }) {
  const state = sectionStatus(member, id);
  const active = hover === id || selected === id;
  return (
    <SectionCtx.Provider value={{ state, active, stroke: TINTS[state].stroke }}>
      <group
        onPointerOver={(e) => {
          e.stopPropagation();
          onHover(id);
        }}
        onPointerOut={() => onHover(null)}
        onClick={(e) => {
          e.stopPropagation();
          // Ignore the click that ends an orbit drag.
          if (e.delta > 6) return;
          onSelect?.(id);
        }}
      >
        {children}
      </group>
    </SectionCtx.Provider>
  );
}

const capsule = (r, len) => <capsuleGeometry args={[r, len, 8, 16]} />;

function Rider({ member, hover, selected, onHover, onSelect }) {
  const isSki = member.rider === 'ski';
  const accent = member.color ?? '#4dabf7';
  const footX = isSki ? 0.22 : 0.34;
  const sec = (id) => ({ id, member, hover, selected, onHover, onSelect });

  return (
    <group>
      <Section {...sec('equipment')}>
        {isSki ? (
          <>
            {[-1, 1].map((side) => (
              <group key={side} position={[side * footX, 0.05, 0.1]}>
                <Block args={[0.17, 0.05, 1.9]} radius={0.02} />
                <Block args={[0.17, 0.05, 0.22]} radius={0.02} position={[0, 0.05, 0.98]} rotation={[-0.5, 0, 0]} />
                <mesh position={[0, 0.03, 0]}>
                  <boxGeometry args={[0.05, 0.02, 1.5]} />
                  <meshStandardMaterial color={accent} />
                </mesh>
              </group>
            ))}
            {[-1, 1].map((side) => (
              <group key={`pole${side}`}>
                <Part
                  position={[side * 0.86, 0.62, 0.12]}
                  rotation={[0.08, 0, side * -0.1]}
                  color="#495057"
                  geometry={<cylinderGeometry args={[0.022, 0.022, 1.15, 8]} />}
                />
                <Part position={[side * 0.92, 0.12, 0.08]} geometry={<cylinderGeometry args={[0.07, 0.07, 0.02, 16]} />} />
              </group>
            ))}
          </>
        ) : (
          <>
            <Block args={[2.1, 0.07, 0.56]} radius={0.03} position={[0, 0.06, 0]} />
            <mesh position={[0, 0.1, 0]}>
              <boxGeometry args={[1.7, 0.005, 0.1]} />
              <meshStandardMaterial color={accent} />
            </mesh>
            {[-1, 1].map((side) => (
              <Block key={side} args={[0.36, 0.1, 0.44]} radius={0.03} position={[side * footX, 0.13, 0]} color="#495057" />
            ))}
          </>
        )}
      </Section>

      <Section {...sec('feet')}>
        {[-1, 1].map((side) => (
          <Block key={side} args={[0.3, 0.3, 0.42]} radius={0.1} position={[side * footX, 0.3, 0.03]} />
        ))}
      </Section>

      <Section {...sec('lower')}>
        {[-1, 1].map((side) => (
          <Part
            key={side}
            position={[side * (footX * 0.5 + 0.1), 0.72, 0]}
            rotation={[0, 0, side * (isSki ? 0.06 : 0.22)]}
            geometry={capsule(0.16, 0.5)}
          />
        ))}
        <Block args={[0.62, 0.24, 0.38]} radius={0.1} position={[0, 1.02, 0]} />
      </Section>

      <Section {...sec('extras')}>
        <Block args={[0.6, 0.66, 0.26]} radius={0.12} position={[0, 1.44, -0.3]} />
        <Block args={[0.4, 0.2, 0.08]} radius={0.05} position={[0, 1.3, -0.45]} />
      </Section>

      <Section {...sec('upper')}>
        <Block args={[0.8, 0.72, 0.48]} radius={0.18} position={[0, 1.42, 0]} />
        <mesh position={[0, 1.42, 0.245]}>
          <boxGeometry args={[0.03, 0.6, 0.01]} />
          <meshStandardMaterial color={DARK} transparent opacity={0.35} />
        </mesh>
        {[-1, 1].map((side) => (
          <Part
            key={side}
            position={[side * 0.58, 1.4, 0.04]}
            rotation={[0, 0, side * 0.55]}
            geometry={capsule(0.12, 0.42)}
          />
        ))}
      </Section>

      <Section {...sec('hands')}>
        {[-1, 1].map((side) => (
          <group key={side} position={[side * 0.8, 1.14, 0.08]}>
            <Part geometry={<sphereGeometry args={[0.14, 20, 16]} />} scale={[1, 1.1, 0.9]} />
            <Part position={[side * -0.1, 0.06, 0.06]} geometry={<sphereGeometry args={[0.06, 12, 10]} />} />
          </group>
        ))}
      </Section>

      <Section {...sec('head')}>
        <Part position={[0, 1.86, 0]} geometry={<cylinderGeometry args={[0.24, 0.26, 0.14, 24]} />} />
        <Part position={[0, 2.14, 0]} color={SKIN} geometry={<sphereGeometry args={[0.34, 32, 24]} />} />
        <Part
          position={[0, 2.18, 0]}
          geometry={<sphereGeometry args={[0.37, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2]} />}
        />
        <mesh position={[0, 2.56, 0]}>
          <sphereGeometry args={[0.06, 16, 12]} />
          <meshStandardMaterial color={accent} />
        </mesh>
        {/* goggles: strap, frame and a glossy lens in the rider's colour */}
        <mesh position={[0, 2.17, 0]}>
          <torusGeometry args={[0.35, 0.03, 8, 32]} />
          <meshStandardMaterial color={DARK} />
        </mesh>
        <RoundedBox args={[0.56, 0.2, 0.12]} radius={0.08} position={[0, 2.17, 0.29]}>
          <meshStandardMaterial color={DARK} />
        </RoundedBox>
        <RoundedBox args={[0.5, 0.15, 0.06]} radius={0.06} position={[0, 2.17, 0.34]}>
          <meshPhysicalMaterial color={accent} metalness={0.6} roughness={0.08} clearcoat={1} />
        </RoundedBox>
        <mesh position={[0, 1.99, 0.3]} rotation={[0, 0, Math.PI]}>
          <torusGeometry args={[0.07, 0.015, 8, 16, Math.PI]} />
          <meshStandardMaterial color="#c0564a" />
        </mesh>
        {[-1, 1].map((side) => (
          <mesh key={side} position={[side * 0.18, 2.02, 0.27]}>
            <sphereGeometry args={[0.045, 12, 10]} />
            <meshStandardMaterial color="#ffa8a8" transparent opacity={0.7} />
          </mesh>
        ))}
      </Section>
    </group>
  );
}

export default function Rider3D({ member, selected, onSelect, size = 300 }) {
  const [hover, setHover] = useState(null);
  const [spinning, setSpinning] = useState(true);

  useEffect(() => {
    document.body.style.cursor = hover ? 'pointer' : '';
  }, [hover]);
  useEffect(() => () => void (document.body.style.cursor = ''), []);

  const hovered = SECTIONS.find((s) => s.id === hover);
  const hoverState = hovered && TINTS[sectionStatus(member, hovered.id)];

  return (
    <div className="figure-stage rider-3d" style={{ width: '100%', maxWidth: size }}>
      <div className="canvas-wrap" style={{ height: size * 1.3 }}>
        <Canvas shadows dpr={[1, 2]} camera={{ position: [0, 1.6, 5.4], fov: 32 }} aria-label={t.rider.ariaFigure(member.name)}>
          <hemisphereLight args={['#ffffff', '#b9d4f0', 1.1]} />
          <directionalLight
            position={[3, 6, 4]}
            intensity={1.6}
            castShadow
            shadow-mapSize={[1024, 1024]}
            shadow-camera-left={-3}
            shadow-camera-right={3}
            shadow-camera-top={4}
            shadow-camera-bottom={-1}
          />
          <Environment resolution={128}>
            <Lightformer intensity={1.5} position={[0, 4, 4]} scale={[8, 4, 1]} />
            <Lightformer intensity={0.8} color="#cfe6ff" position={[-5, 2, -2]} scale={[4, 6, 1]} />
            <Lightformer intensity={0.6} position={[5, 1, 2]} scale={[3, 3, 1]} />
          </Environment>

          <Float speed={2} rotationIntensity={0.12} floatIntensity={0.25} floatingRange={[0, 0.08]}>
            <Rider member={member} hover={hover} selected={selected} onHover={setHover} onSelect={onSelect} />
          </Float>

          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow>
            <circleGeometry args={[1.7, 48]} />
            <meshStandardMaterial color="#ffffff" roughness={1} />
          </mesh>
          <ContactShadows position={[0, 0, 0]} opacity={0.35} scale={5} blur={2.4} far={2.5} color="#335577" />

          <OrbitControls
            target={[0, 1.2, 0]}
            enablePan={false}
            enableZoom={false}
            minPolarAngle={Math.PI / 3.2}
            maxPolarAngle={Math.PI / 1.95}
            autoRotate={spinning}
            autoRotateSpeed={1.4}
            onStart={() => setSpinning(false)}
          />
        </Canvas>
      </div>
      <div className="figure-caption" aria-live="polite">
        {hovered ? `${hovered.emoji} ${hovered.label} · ${hoverState.label}` : t.rider.hint3d}
      </div>
    </div>
  );
}
