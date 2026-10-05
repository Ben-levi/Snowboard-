import { useState } from 'react';
import { t } from './he.js';
import { DIFFICULTY_COLORS } from './resortFeatures.js';
import { formatTime } from './courses.js';
import { isUnlocked, starsNeeded, totalStars } from './medals.js';

const dotColor = (c) => (c.boardercross ? '#ff7a1a' : DIFFICULTY_COLORS[c.difficulty]);
const label = (c) => (c.boardercross ? t.boardercross : t.difficulty[c.difficulty]);

// Pick a popular run: free ride from its top, or a timed run for medals.
export default function Menu({ features, progress, targets, onFree, onCourse, onClose, onSettings }) {
  const [tab, setTab] = useState('timed');
  const stars = totalStars(progress);
  return (
    <div className="ride-screen" onClick={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className="ride-card menu-card">
        <div className="menu-head">
          <h1>{t.menuTitle}</h1>
          <span className="menu-stars" data-stars={stars}>{t.stars(stars)}</span>
          {onSettings && (
            <button className="ride-chip" onClick={onSettings} aria-label={t.settings}>
              ⚙️
            </button>
          )}
          {onClose && (
            <button className="ride-chip" onClick={onClose}>
              {t.resume}
            </button>
          )}
        </div>
        <div className="menu-tabs" role="tablist">
          {['timed', 'free'].map((id) => (
            <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>
              {id === 'free' ? `🏂 ${t.free}` : `⏱️ ${t.timed}`}
            </button>
          ))}
        </div>
        <ul className="menu-list">
          {features.courses.map((c) => {
            const start = features.starts.find((s) => s.id === c.id);
            const open = tab === 'free' || isUnlocked(c, stars);
            const p = progress[c.id];
            const tg = targets[c.id];
            return (
              <li key={c.id}>
                <button
                  disabled={!open}
                  className={open ? '' : 'locked'}
                  onClick={() => (tab === 'free' ? onFree(start) : onCourse(c))}
                  data-course={c.name}
                >
                  <span className="menu-dot" style={{ background: dotColor(c) }} aria-hidden />
                  <span className="menu-main">
                    <b dir="auto">{c.name}</b>
                    <small>
                      {label(c)} · {t.meters(c.length)} · {t.drop(c.drop)}
                      {tab === 'free' && c.lift ? ` · ${t.freeStart(c.lift)}` : ''}
                    </small>
                    <small className="menu-blurb">{c.blurb}</small>
                  </span>
                  <span className="menu-side" dir="ltr">
                    {tab === 'timed' &&
                      (!open ? (
                        <span dir="rtl">{t.locked(starsNeeded(c))}</span>
                      ) : (
                        <>
                          <span className="menu-medal">{p?.medal ? t.medalIcon[p.medal] : '⚪'}</span>
                          <span>{p?.best ? formatTime(p.best) : tg ? `🥇 ${formatTime(tg.gold)}` : '…'}</span>
                        </>
                      ))}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        {Object.keys(targets).length < features.courses.length && <p className="ride-credits">{t.computing}</p>}
      </div>
    </div>
  );
}
