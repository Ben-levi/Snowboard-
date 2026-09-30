import { useEffect, useRef, useState } from 'react';
import { t } from '../i18n/he.js';
import { Application } from '@splinetool/runtime';
import { SECTIONS } from '../data/gearCatalog.js';
import { sectionStatus } from '../lib/stats.js';
import { pickDeclared, sceneVariablesFor, sectionFromObjectName, tintsFor } from '../lib/splineScene.js';
import { TINTS } from './RiderFigure.jsx';

const SPLINE_SCENE = import.meta.env.VITE_SPLINE_SCENE || '';

// Pushes the member's gear state into the scene: declared variables + "<section>-tint" objects.
function applyMember(app, member) {
  app.setVariables(pickDeclared(sceneVariablesFor(member), app.getVariables()));
  for (const [name, color] of Object.entries(tintsFor(member))) {
    const obj = app.findObjectByName(name);
    if (obj) obj.color = color;
  }
}

// Rider designed in Spline (spline.design) and loaded from an exported .splinecode file.
export default function RiderSpline({ member, onSelect, size = 300 }) {
  const hostRef = useRef(null);
  const appRef = useRef(null);
  const memberRef = useRef(member);
  const onSelectRef = useRef(onSelect);
  const [ready, setReady] = useState(false);
  const [hover, setHover] = useState(null);
  const [error, setError] = useState(null);
  memberRef.current = member;
  onSelectRef.current = onSelect;

  useEffect(() => {
    // A fresh canvas per mount, so StrictMode's remount never reuses a disposed WebGL context.
    const canvas = document.createElement('canvas');
    canvas.className = 'spline-canvas';
    hostRef.current.appendChild(canvas);
    const app = new Application(canvas, { htmlContentMode: 'none' });
    let alive = true;

    const onDown = (e) => {
      const section = sectionFromObjectName(e.target?.name);
      if (section) onSelectRef.current?.(section);
    };
    const onHover = (e) => setHover(sectionFromObjectName(e.target?.name));

    app
      .load(new URL(SPLINE_SCENE, document.baseURI).href)
      .then(() => {
        if (!alive) return;
        appRef.current = app;
        app.addEventListener('mouseDown', onDown);
        app.addEventListener('mouseHover', onHover);
        applyMember(app, memberRef.current);
        setReady(true);
      })
      .catch((e) => alive && setError(e instanceof Error ? e : new Error(String(e))));

    return () => {
      alive = false;
      appRef.current = null;
      app.dispose();
      canvas.remove();
    };
  }, []);

  useEffect(() => {
    if (ready && appRef.current) applyMember(appRef.current, member);
  }, [ready, member]);

  // Let RiderStage's error boundary fall back to the built-in rider.
  if (error) throw error;

  const hovered = SECTIONS.find((s) => s.id === hover);
  return (
    <div className="figure-stage rider-spline" style={{ width: '100%', maxWidth: size }}>
      <div className={`canvas-wrap${ready ? ' ready' : ''}`} style={{ height: size * 1.3 }} ref={hostRef}>
        {!ready && <div className="spline-loading" aria-hidden />}
      </div>
      <div className="figure-caption" aria-live="polite">
        {hovered
          ? `${hovered.emoji} ${hovered.label} · ${TINTS[sectionStatus(member, hovered.id)].label}`
          : t.rider.hintFlat}
      </div>
    </div>
  );
}
