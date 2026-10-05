// Medals, stars and unlocks. The bot's time on a run is gold; silver and bronze are a little slower.
import { UNLOCK } from './runs.js';

export const FACTORS = { gold: 1, silver: 1.12, bronze: 1.3 };
export const STARS = { gold: 3, silver: 2, bronze: 1 };
export const MEDAL_ORDER = ['gold', 'silver', 'bronze'];

export function targetsFor(par) {
  return { gold: par * FACTORS.gold, silver: par * FACTORS.silver, bronze: par * FACTORS.bronze };
}

export function medalFor(time, targets) {
  if (!targets || !Number.isFinite(time)) return null;
  return MEDAL_ORDER.find((m) => time <= targets[m]) ?? null;
}

export const better = (a, b) => (!a ? b : !b ? a : MEDAL_ORDER.indexOf(a) <= MEDAL_ORDER.indexOf(b) ? a : b);

export function totalStars(progress) {
  return Object.values(progress).reduce((n, p) => n + (STARS[p.medal] ?? 0), 0);
}

export const starsNeeded = (run) => UNLOCK[run.tier] ?? 0;
export const isUnlocked = (run, stars) => stars >= starsNeeded(run);

// ---- Saved progress: { [runId]: { best, medal } } ----
const key = (resort) => `ride:progress:${resort}`;

export function loadProgress(resort) {
  try {
    return JSON.parse(localStorage.getItem(key(resort)) ?? '{}') ?? {};
  } catch {
    return {};
  }
}

// Records a finished run; returns { progress, record (new best time), medal, upgraded (better medal than before) }.
export function recordResult(progress, runId, time, targets) {
  const prev = progress[runId] ?? {};
  const medal = medalFor(time, targets);
  const record = !prev.best || time < prev.best;
  const bestMedal = better(prev.medal, medal);
  const next = { ...progress, [runId]: { best: record ? time : prev.best, medal: bestMedal ?? null } };
  return { progress: next, record, medal, upgraded: bestMedal !== (prev.medal ?? null) };
}

export function saveProgress(resort, progress) {
  try {
    localStorage.setItem(key(resort), JSON.stringify(progress));
  } catch {
    /* storage blocked */
  }
}
