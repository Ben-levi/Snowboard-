import { useState } from 'react';
import { t } from './he.js';
import { DIFFICULTY_COLORS } from './resortFeatures.js';
import { formatTime } from './courses.js';
import { getBest } from './best.js';

// Pick a lift top for free riding, or a piste for a timed run.
export default function Menu({ resortId, features, onFree, onCourse, onClose }) {
  const [tab, setTab] = useState('free');
  return (
    <div className="ride-screen" onClick={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className="ride-card menu-card">
        <div className="menu-head">
          <h1>{t.menuTitle}</h1>
          {onClose && (
            <button className="ride-chip" onClick={onClose}>
              {t.resume}
            </button>
          )}
        </div>
        <div className="menu-tabs" role="tablist">
          {['free', 'timed'].map((id) => (
            <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>
              {id === 'free' ? `🏂 ${t.free}` : `⏱️ ${t.timed}`}
            </button>
          ))}
        </div>
        <ul className="menu-list">
          {tab === 'free' &&
            features.starts.map((s) => (
              <li key={s.id}>
                <button onClick={() => onFree(s)} data-start={s.name}>
                  <span className="menu-icon" aria-hidden>
                    {s.kind === 'cabin' ? '🚡' : s.kind === 'chair' ? '🚠' : '⛷️'}
                  </span>
                  <span className="menu-main">
                    <b dir="auto">{s.name}</b>
                    <small>
                      {t.liftTop} · {t.kinds[s.kind]}
                    </small>
                  </span>
                  <span className="menu-side">{t.meters(s.y)}</span>
                </button>
              </li>
            ))}
          {tab === 'timed' &&
            features.courses.map((c) => {
              const best = getBest(resortId, c.id);
              return (
                <li key={c.id}>
                  <button onClick={() => onCourse(c)} data-course={c.name}>
                    <span className="menu-dot" style={{ background: DIFFICULTY_COLORS[c.difficulty] }} aria-hidden />
                    <span className="menu-main">
                      <b dir="auto">{c.name}</b>
                      <small>
                        {t.difficulty[c.difficulty]} · {t.meters(c.length)} · {t.drop(c.drop)}
                      </small>
                    </span>
                    <span className="menu-side" dir="ltr">
                      {best ? `🏆 ${formatTime(best)}` : t.noBest}
                    </span>
                  </button>
                </li>
              );
            })}
        </ul>
      </div>
    </div>
  );
}
