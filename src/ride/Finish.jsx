import { useEffect } from 'react';
import confetti from 'canvas-confetti';
import { t } from './he.js';
import { formatTime } from './courses.js';
import { STARS } from './medals.js';

const COLORS = { gold: ['#ffd43b', '#fab005', '#fff3bf'], silver: ['#dee2e6', '#adb5bd', '#ffffff'], bronze: ['#e8590c', '#ffa94d', '#ffe8cc'] };

// The end of a timed run: time, medal, stars, and what to do next.
export default function Finish({ result, onRetry, onNext, onMenu }) {
  const { course, time, medal, record, upgraded, newStars, unlocked, targets, ghost, topSpeed, airTime, missed } = result;

  useEffect(() => {
    if (!medal) return;
    navigator.vibrate?.(medal === 'gold' ? [60, 40, 60, 40, 120] : [80, 50, 80]);
    const burst = (x) =>
      confetti({ particleCount: medal === 'gold' ? 120 : 70, spread: 75, origin: { x, y: 0.35 }, colors: COLORS[medal], disableForReducedMotion: true });
    burst(0.3);
    const id = setTimeout(() => burst(0.7), 250);
    return () => clearTimeout(id);
  }, [medal]);

  const delta = ghost ? time - ghost.time : null;
  return (
    <div className="ride-screen">
      <div className="ride-card finish-card" data-finish={medal ?? 'none'}>
        <div className={`finish-medal ${medal ?? 'none'}`} aria-hidden>
          <span className="medal-ribbon" />
          <span className="medal-disc">{medal ? { gold: 1, silver: 2, bronze: 3 }[medal] : '🏁'}</span>
        </div>
        <h1>{t.finishTitle}</h1>
        <p className="ride-sub" dir="auto">
          {course.name}
        </p>
        <div className="finish-time" dir="ltr">
          {formatTime(time)}
        </div>
        <p className="finish-line">
          {medal ? `${t.medals[medal]} ${'⭐'.repeat(STARS[medal])}` : t.noMedal}
          {record && <b> · {t.newBest}</b>}
        </p>
        {delta !== null && (
          <p className={`finish-delta ${delta <= 0 ? 'ahead' : 'behind'}`} dir="ltr">
            {t.vsGhost(delta)} · <span dir="rtl">{ghost.mine ? t.ghostMine : t.ghostGold}</span>
          </p>
        )}
        {upgraded && newStars > 0 && <p className="finish-stars">{t.starsEarned(newStars)}</p>}
        {unlocked && <p className="finish-stars">{t.unlockedNew}</p>}
        <dl className="finish-stats">
          <div>
            <dt>{t.topSpeed}</dt>
            <dd>{Math.round(topSpeed * 3.6)} {t.speed}</dd>
          </div>
          <div>
            <dt>{t.air}</dt>
            <dd>{airTime.toFixed(1)} {t.sec}</dd>
          </div>
          <div>
            <dt>{t.missedGates}</dt>
            <dd>{missed}</dd>
          </div>
        </dl>
        <div className="finish-targets" dir="ltr">
          {['gold', 'silver', 'bronze'].map((m) => (
            <span key={m} className={medal === m ? 'on' : ''}>
              {t.medalIcon[m]} {formatTime(targets[m])}
            </span>
          ))}
        </div>
        <div className="finish-actions">
          <button className="ride-btn" onClick={onRetry}>
            {t.retry}
          </button>
          {onNext && (
            <button className="ride-chip" onClick={onNext}>
              {t.nextRun}
            </button>
          )}
          <button className="ride-chip" onClick={onMenu}>
            {t.toMenu}
          </button>
        </div>
      </div>
    </div>
  );
}
