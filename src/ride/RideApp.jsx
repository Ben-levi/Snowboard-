import { useCallback, useEffect, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { PerformanceMonitor } from '@react-three/drei';
import { createRider, findSpawn } from './physics.js';
import { loadResort } from './terrainData.js';
import { prepareFeatures } from './resortFeatures.js';
import { createRun } from './courses.js';
import { createBot, simulateRun } from './bot.js';
import { createRecorder, loadGhost, saveGhost } from './ghost.js';
import { isUnlocked, loadProgress, recordResult, saveProgress, targetsFor, totalStars } from './medals.js';
import { attachKeyboard } from './input.js';
import { startAudio } from './audio.js';
import { pickQuality } from './quality.js';
import { t } from './he.js';
import World from './World.jsx';
import Hud from './Hud.jsx';
import Menu from './Menu.jsx';
import Finish from './Finish.jsx';
import Settings, { loadSettings, saveSettings } from './Settings.jsx';
import TouchControls from './TouchControls.jsx';

const params = new URLSearchParams(window.location.search);
const TOUCH = window.matchMedia?.('(pointer: coarse)').matches || params.has('touch');
const AUTOPILOT = params.has('autopilot'); // debug: the bot rides timed runs for you

const RESORT = 'pas-de-la-casa';

// Everything the simulation needs, kept in one mutable object (read by the 3D loop and the HUD).
function createSim(resort, features, quality) {
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
    quality,
    spawn,
    start: spawn,
    run: null,
    ghost: null,
    autopilot: null,
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
      sim.autopilot = null;
      sim.reset(point);
    },
    startCourse(course) {
      sim.start = features.starts.find((s) => s.id === course.id);
      sim.run = createRun(course);
      sim.recorder = createRecorder();
      sim.splits = [];
      sim.stats = { topSpeed: 0, airTime: 0 };
      sim.lastSplit = null;
      sim.autopilot = AUTOPILOT ? createBot(course) : null;
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
  const [phase, setPhase] = useState('intro'); // intro → menu → riding → finish
  const [course, setCourse] = useState(null);
  const [ghost, setGhost] = useState(null);
  const [targets, setTargets] = useState({});
  const [progress, setProgress] = useState(() => loadProgress(RESORT));
  const [result, setResult] = useState(null);
  const [settings, setSettings] = useState(() => loadSettings(TOUCH));
  const [showSettings, setShowSettings] = useState(false);
  const [quality] = useState(pickQuality);
  const [dpr, setDpr] = useState(() => (TOUCH ? Math.min(1.25, quality.dpr[1]) : quality.dpr[1]));
  const [toast, setToast] = useState(null);
  const sim = useRef(null);
  const botRuns = useRef({});
  const progressRef = useRef(progress);
  progressRef.current = progress;
  const targetsRef = useRef(targets);
  targetsRef.current = targets;

  useEffect(() => {
    loadResort(RESORT)
      .then((r) => {
        sim.current = createSim(r, prepareFeatures(r, quality), quality);
        sim.current.settings = loadSettings(TOUCH);
        window.__ride = sim.current; // debug and end-to-end test hook
        setResort(r);
      })
      .catch((e) => setError(e.message));
  }, [quality]);

  // Medal times: the bot rides each popular run once, one run per tick so the page stays responsive.
  useEffect(() => {
    if (!resort) return undefined;
    const { features, world } = sim.current;
    let k = 0;
    let id;
    const next = () => {
      const c = features.courses[k++];
      if (!c) return;
      const start = features.starts.find((s) => s.id === c.id);
      const r = simulateRun(c, world, start);
      if (r.finished) {
        botRuns.current[c.id] = { data: Float32Array.from(r.ghost), splits: r.splits, time: r.time, mine: false };
        setTargets((tg) => ({ ...tg, [c.id]: targetsFor(r.time) }));
      }
      id = setTimeout(next, 0);
    };
    id = setTimeout(next, 50);
    return () => clearTimeout(id);
  }, [resort]);

  useEffect(() => {
    if (sim.current) sim.current.settings = settings;
    saveSettings(settings);
  }, [settings]);

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
      else if (phase === 'menu' && e.code === 'Escape' && sim.current.rider.time > 0) ride();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  useEffect(() => {
    if (!toast) return undefined;
    const id = setTimeout(() => setToast(null), toast.long ? 3200 : 1600);
    return () => clearTimeout(id);
  }, [toast]);

  function finishRun(time) {
    const S = sim.current;
    const run = S.run;
    const c = run.course;
    const tg = targetsRef.current[c.id] ?? targetsFor(time);
    const before = progressRef.current;
    const starsBefore = totalStars(before);
    const { progress: next, record, medal, upgraded } = recordResult(before, c.id, time, tg);
    saveProgress(RESORT, next);
    setProgress(next);
    const prevGhost = S.ghost;
    if (record) saveGhost(RESORT, c.id, { samples: S.recorder.samples, splits: S.splits, time });
    const starsAfter = totalStars(next);
    const unlocked = S.features.courses.some((x) => !isUnlocked(x, starsBefore) && isUnlocked(x, starsAfter));
    setResult({
      course: c,
      time,
      medal,
      record,
      upgraded,
      newStars: starsAfter - starsBefore,
      unlocked,
      targets: tg,
      ghost: prevGhost,
      topSpeed: S.stats.topSpeed,
      airTime: S.stats.airTime,
      missed: run.missed,
    });
    // Let the rider glide through the finish for a moment.
    setTimeout(() => {
      S.paused = true;
      setPhase('finish');
    }, 900);
  }

  const onEvents = useCallback((e) => {
    if (e.run) {
      const ev = e.run;
      if (ev.started) setToast({ text: t.go });
      if (ev.missed) setToast({ text: t.missed(ev.missed) });
      if (ev.gate !== undefined && !ev.finished) navigator.vibrate?.(8);
      if (ev.finished) finishRun(ev.finished);
      return;
    }
    if (e.crashed) {
      setToast({ text: t.crashed });
      navigator.vibrate?.([30, 30, 60]);
    } else if (e.landed && e.landed.airTime > 0.6) {
      setToast({ text: t.airtime(e.landed.airTime) });
      navigator.vibrate?.(20);
    } else if (e.landed && e.landed.airTime > 0.25) navigator.vibrate?.(10);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function ride() {
    startAudio();
    sim.current.paused = false;
    setPhase('riding');
  }

  function startCourse(c) {
    const g = loadGhost(RESORT, c.id) ?? botRuns.current[c.id] ?? null;
    sim.current.ghost = g;
    sim.current.startCourse(c);
    setGhost(g);
    setCourse(c);
    setResult(null);
    ride();
  }

  function nextCourse() {
    const list = sim.current.features.courses;
    const stars = totalStars(progressRef.current);
    const i = list.findIndex((c) => c.id === result.course.id);
    for (let k = 1; k <= list.length; k++) {
      const c = list[(i + k) % list.length];
      if (isUnlocked(c, stars)) return c;
    }
    return null;
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
          gl={{ logarithmicDepthBuffer: quality.logDepth, antialias: !TOUCH, powerPreference: 'high-performance' }}
          camera={{ fov: 62, position: [0, 3000, 0] }}
          onCreated={(state) => (sim.current.three = state)}
        >
          {/* Drop the resolution when the frame rate can't keep up, raise it back when it can. */}
          <PerformanceMonitor
            onDecline={() => setDpr((d) => Math.max(quality.dpr[0], d - 0.25))}
            onIncline={() => setDpr((d) => Math.min(TOUCH ? 1.5 : quality.dpr[1], d + 0.25))}
          />
          <World resort={resort} sim={sim} quality={quality} course={course} ghost={ghost} onEvents={onEvents} />
        </Canvas>
      )}
      {resort && phase === 'riding' && (
        <Hud sim={sim} target={course ? targets[course.id] : null} ghost={ghost} onMenu={openMenu} onSettings={() => setShowSettings(true)} compact={TOUCH} />
      )}
      {resort && phase === 'riding' && TOUCH && !showSettings && <TouchControls mode={settings.mode} />}
      {toast && <div className="ride-toast">{toast.text}</div>}
      {phase === 'menu' && (
        <Menu
          features={sim.current.features}
          progress={progress}
          targets={targets}
          onClose={sim.current.rider.time > 0 ? ride : null}
          onSettings={() => setShowSettings(true)}
          onFree={(start) => {
            sim.current.ghost = null;
            sim.current.startFree(start);
            setCourse(null);
            setGhost(null);
            ride();
          }}
          onCourse={startCourse}
        />
      )}
      {phase === 'finish' && result && (
        <Finish
          result={result}
          onRetry={() => startCourse(result.course)}
          onNext={nextCourse() ? () => startCourse(nextCourse()) : null}
          onMenu={() => setPhase('menu')}
        />
      )}
      {showSettings && (
        <Settings settings={settings} onChange={setSettings} onClose={() => setShowSettings(false)} touchDevice={TOUCH} />
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
                  <dt dir="auto">{k}</dt>
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
