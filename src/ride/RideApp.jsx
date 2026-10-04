import { useCallback, useEffect, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { createRider, findSpawn } from './physics.js';
import { loadResort } from './terrainData.js';
import { attachKeyboard } from './input.js';
import { pickQuality } from './quality.js';
import { t } from './he.js';
import World from './World.jsx';
import Hud from './Hud.jsx';

const RESORT = 'pas-de-la-casa';

// Everything the simulation needs, kept in one mutable object (read by the 3D loop and the HUD).
function createSim(resort) {
  const near = resort.near;
  const world = {
    heightAt: near.heightAt,
    normalAt: near.normalAt,
    x0: near.x0,
    z0: near.z0,
    width: near.width,
    depth: near.depth,
  };
  const spawn = findSpawn(near);
  const sim = {
    resort,
    world,
    spawn,
    rider: createRider(world, spawn.x, spawn.z, spawn.heading),
    input: { steer: 0, tuck: 0, brake: 0, jump: false },
    camMode: 'chase',
    paused: true,
    reset(point = sim.spawn) {
      sim.rider = createRider(world, point.x, point.z, point.heading ?? 0);
    },
  };
  return sim;
}

export default function RideApp() {
  const [resort, setResort] = useState(null);
  const [error, setError] = useState(null);
  const [started, setStarted] = useState(false);
  const [quality] = useState(pickQuality);
  const [toast, setToast] = useState(null);
  const sim = useRef(null);

  useEffect(() => {
    loadResort(RESORT)
      .then((r) => {
        sim.current = createSim(r);
        window.__ride = sim.current; // debug and end-to-end test hook
        setResort(r);
      })
      .catch((e) => setError(e.message));
  }, []);

  useEffect(() => attachKeyboard(), []);

  useEffect(() => {
    if (!toast) return undefined;
    const id = setTimeout(() => setToast(null), 1600);
    return () => clearTimeout(id);
  }, [toast]);

  const onEvents = useCallback((e) => {
    if (e.crashed) setToast(t.crashed);
    else if (e.landed && e.landed.airTime > 0.6) setToast(t.airtime(e.landed.airTime));
  }, []);

  function start() {
    sim.current.paused = false;
    setStarted(true);
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
          dpr={quality.dpr}
          gl={{ logarithmicDepthBuffer: true, antialias: true, powerPreference: 'high-performance' }}
          camera={{ fov: 62, position: [0, 3000, 0] }}
          onCreated={(state) => (sim.current.three = state)}
        >
          <World resort={resort} sim={sim} quality={quality} onEvents={onEvents} />
        </Canvas>
      )}
      {resort && started && <Hud sim={sim} />}
      {toast && <div className="ride-toast">{toast}</div>}
      {!started && (
        <div className="ride-screen">
          <div className="ride-card">
            <div className="ride-emoji" aria-hidden>🏔️</div>
            <h1>{t.title}</h1>
            <p className="ride-sub">{t.subtitle}</p>
            <h2>{t.controlsTitle}</h2>
            <dl className="ride-keys">
              {t.controls.map(([k, v]) => (
                <div key={k}>
                  <dt dir="ltr">{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
            <button className="ride-btn" disabled={!resort} onClick={start}>
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
