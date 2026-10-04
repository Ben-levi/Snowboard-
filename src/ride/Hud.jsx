import { useEffect, useState } from 'react';
import { t } from './he.js';
import { formatTime } from './courses.js';
import { DIFFICULTY_COLORS } from './resortFeatures.js';
import Minimap from './Minimap.jsx';
import { isMuted, setMuted } from './audio.js';

// Speed, altitude, current piste, run timer and the minimap; refreshed ten times a second.
export default function Hud({ sim, best, onMenu, compact }) {
  const [view, setView] = useState({ speed: 0, alt: 0, piste: null, run: null });
  const [mute, setMute] = useState(isMuted);
  useEffect(() => {
    const id = setInterval(() => {
      const { rider, run, features } = sim.current;
      setView({
        speed: Math.round(rider.speed * 3.6),
        alt: Math.round(rider.y),
        piste: features.pisteAt(rider.x, rider.z),
        run: run && { name: run.course.name, difficulty: run.course.difficulty, started: run.started, finished: run.finished, time: run.started ? run.time : 0, next: run.next, gates: run.course.gates.length },
      });
    }, 100);
    return () => clearInterval(id);
  }, [sim]);
  const { run, piste } = view;
  return (
    <>
      <div className="hud">
        <div className="hud-box">
          <b data-hud="speed">{view.speed}</b>
          <span>{t.speed}</span>
        </div>
        <div className="hud-box">
          <b data-hud="alt">{view.alt}</b>
          <span>{t.altitude}</span>
        </div>
        {piste && !run && (
          <div className="hud-box hud-piste">
            <i style={{ background: DIFFICULTY_COLORS[piste.difficulty] }} />
            <span dir="auto">{piste.name}</span>
          </div>
        )}
      </div>
      {run && (
        <div className="hud-run" data-hud="run">
          <div className="hud-run-name">
            <i style={{ background: DIFFICULTY_COLORS[run.difficulty] }} />
            <span dir="auto">{run.name}</span>
          </div>
          <b dir="ltr" data-hud="time">{formatTime(run.time)}</b>
          <span>
            {!run.started ? t.toStart : run.finished ? t.finish : t.gate(Math.max(0, run.next - 1), run.gates - 1)}
            {best ? ` · ${t.best} ${formatTime(best)}` : ''}
          </span>
        </div>
      )}
      <div className="hud-buttons">
        <button className="hud-menu" onClick={onMenu} aria-label={t.menu}>
          ☰
        </button>
        <button
          className="hud-menu"
          aria-label={t.sound}
          aria-pressed={!mute}
          onClick={() => {
            setMuted(!mute);
            setMute(!mute);
          }}
        >
          {mute ? '🔇' : '🔊'}
        </button>
      </div>
      <div className={`hud-map${compact ? ' compact' : ''}`}>
        <Minimap sim={sim} size={compact ? 112 : 190} />
      </div>
    </>
  );
}
