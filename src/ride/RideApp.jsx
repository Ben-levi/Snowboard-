import { useCallback, useEffect, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { PerformanceMonitor } from '@react-three/drei';
import { createRider, findSpawn } from './physics.js';
import { loadResort } from './terrainData.js';
import { prepareFeatures } from './resortFeatures.js';
import { createRun, formatTime } from './courses.js';
import { getBest, saveBest } from './best.js';
import { attachKeyboard } from './input.js';
import { startAudio } from './audio.js';
import { pickQuality } from './quality.js';
import { t } from './he.js';
import World from './World.jsx';
import Hud from './Hud.jsx';
import Menu from './Menu.jsx';
import TouchControls from './TouchControls.jsx';

const TOUCH = window.matchMedia?.('(pointer: coarse)').matches || new URLSearchParams(window.location.search).has('touch');

const RESORT = 'pas-de-la-casa';

// Everything the simulation needs, kept in one mutable object (read by the 3D loop and the HUD).
function createSim(resort, features) {
  const near = resort.near;
  const world = {
    heightAt: near.heightAt,
    normalAt: near.normalAt,
    surfaceAt: features.surfaceAt,
    obstaclesNear: features.obstaclesNear,
    x0: near.x0,
    z0: near.z0,
    width: near.width,
    depth: near.depth,
  };
  const spawn = features.starts[0] ?? findSpawn(near);
  const sim = {
    resort,
    features,
    world,
    spawn,
    start: spawn,
    run: null,
    rider: createRider(world, spawn.x, spawn.z, spawn.heading),
    input: { steer: 0, tuck: 0, brake: 0, jump: false },
    camMode: 'chase',
    paused: true,
    reset(point = sim.start) {
      sim.rider = createRider(world, point.x, point.z, point.heading ?? 0);
      sim.snapCamera = true;
    },
    startFree(point) {
      sim.start = point;
      sim.run = null;
      sim.reset(point);
    },
    startCourse(course) {
      const g = course.gates[0];
      // Face along the piste, unless its first stretch climbs: then face down the fall line.
      const [nx, , nz] = near.normalAt(g.x, g.z);
      const downhill = g.dirX * nx + g.dirZ * nz > -0.05;
      sim.start = { x: g.x, z: g.z, heading: downhill ? Math.atan2(g.dirX, g.dirZ) : Math.atan2(nx, nz) };
      sim.run = createRun(course);
      sim.reset(sim.start);
    },
    // R: back to the start point, or a fresh attempt at the current run.
    restart() {
      if (sim.run) sim.startCourse(sim.run.course);
      else sim.reset();
    },
  };
  return sim;
}

export default function RideApp() {
  const [resort, setResort] = useState(null);
  const [error, setError] = useState(null);
  const [phase, setPhase] = useState('intro'); // intro → menu → riding
  const [course, setCourse] = useState(null);
  const [best, setBest] = useState(null);
  const [quality] = useState(pickQuality);
  const [dpr, setDpr] = useState(() => quality.dpr[1]);
  const [toast, setToast] = useState(null);
  const sim = useRef(null);

  useEffect(() => {
    loadResort(RESORT)
      .then((r) => {
        sim.current = createSim(r, prepareFeatures(r, quality));
        window.__ride = sim.current; // debug and end-to-end test hook
        setResort(r);
      })
      .catch((e) => setError(e.message));
  }, [quality]);

  useEffect(() => attachKeyboard(), []);

  const openMenu = useCallback(() => {
    if (!sim.current) return;
    sim.current.paused = true;
    setPhase('menu');
  }, []);

  useEffect(() => {
    const onKey = (e) => {
      if (e.code !== 'Escape' && e.code !== 'KeyM') return;
      if (phase === 'riding') openMenu();
      else if (phase === 'menu' && e.code === 'Escape') ride();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  useEffect(() => {
    if (!toast) return undefined;
    const id = setTimeout(() => setToast(null), toast.long ? 3200 : 1600);
    return () => clearTimeout(id);
  }, [toast]);

  const onEvents = useCallback((e) => {
    if (e.run) {
      const ev = e.run;
      const run = sim.current.run;
      if (ev.started) setToast({ text: t.go });
      if (ev.missed) setToast({ text: t.missed(ev.missed) });
      if (ev.finished) {
        const record = saveBest(RESORT, run.course.id, ev.finished);
        if (record) setBest(ev.finished);
        setToast({ text: `${t.finish} ${formatTime(ev.finished)}${record ? ` · ${t.newBest}` : ''}`, long: true });
      }
      return;
    }
    if (e.crashed) setToast({ text: t.crashed });
    else if (e.landed && e.landed.airTime > 0.6) setToast({ text: t.airtime(e.landed.airTime) });
  }, []);

  function ride() {
    startAudio();
    sim.current.paused = false;
    setPhase('riding');
  }

  if (error) {
    return (
      <div className="ride-screen">
        <h1>{t.loadFailed}</h1>
        <p>{error}</p>
      </div>
    );
  }

  return (
    <div className="ride">
      {resort && (
        <Canvas
          className="ride-canvas"
          shadows={quality.shadows}
          dpr={dpr}
          gl={{ logarithmicDepthBuffer: true, antialias: true, powerPreference: 'high-performance' }}
          camera={{ fov: 62, position: [0, 3000, 0] }}
          onCreated={(state) => (sim.current.three = state)}
        >
          {/* Drop the resolution when the frame rate can't keep up, raise it back when it can. */}
          <PerformanceMonitor
            onDecline={() => setDpr((d) => Math.max(quality.dpr[0], d - 0.25))}
            onIncline={() => setDpr((d) => Math.min(quality.dpr[1], d + 0.25))}
          />
          <World resort={resort} sim={sim} quality={quality} course={course} onEvents={onEvents} />
        </Canvas>
      )}
      {resort && phase === 'riding' && <Hud sim={sim} best={best} onMenu={openMenu} compact={TOUCH} />}
      {resort && phase === 'riding' && TOUCH && <TouchControls />}
      {toast && <div className="ride-toast">{toast.text}</div>}
      {phase === 'menu' && (
        <Menu
          resortId={RESORT}
          features={sim.current.features}
          onClose={sim.current.rider.time > 0 ? ride : null}
          onFree={(start) => {
            sim.current.startFree(start);
            setCourse(null);
            ride();
          }}
          onCourse={(c) => {
            sim.current.startCourse(c);
            setCourse(c);
            setBest(getBest(RESORT, c.id));
            ride();
          }}
        />
      )}
      {phase === 'intro' && (
        <div className="ride-screen">
          <div className="ride-card">
            <div className="ride-emoji" aria-hidden>🏔️</div>
            <h1>{t.title}</h1>
            <p className="ride-sub">{t.subtitle}</p>
            <h2>{t.controlsTitle}</h2>
            <dl className="ride-keys">
              {(TOUCH ? t.touchControls : t.controls).map(([k, v]) => (
                <div key={k}>
                  <dt dir="ltr">{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
            <button className="ride-btn" disabled={!resort} onClick={() => setPhase('menu')}>
              {resort ? t.start : t.loading}
            </button>
            <a className="ride-link" href="./">{t.backToApp}</a>
            <p className="ride-credits">{t.credits}</p>
          </div>
        </div>
      )}
    </div>
  );
}
