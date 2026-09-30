// Dates are stored as "YYYY-MM-DD" (from <input type="date">) and read as local calendar days.

export function parseDay(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value ?? '');
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
}

const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const DAY = 24 * 60 * 60 * 1000;
const dayDiff = (a, b) => Math.round((startOfDay(a) - startOfDay(b)) / DAY);

// Where we are relative to the trip: before (days to go), during (day number), after, or unknown.
export function tripPhase(from, to, now = new Date()) {
  const start = parseDay(from);
  if (!start) return { phase: 'unknown' };
  const end = parseDay(to) ?? start;
  const until = dayDiff(start, now);
  if (until > 0) return { phase: 'before', days: until };
  if (dayDiff(end, now) >= 0) return { phase: 'during', day: 1 - until };
  return { phase: 'after' };
}

const fmt = (opts) => new Intl.DateTimeFormat('he-IL', opts);

export function formatDay(value) {
  const d = parseDay(value);
  return d ? fmt({ day: 'numeric', month: 'long', year: 'numeric' }).format(d) : '';
}

export function formatRange(from, to) {
  const a = parseDay(from);
  const b = parseDay(to);
  if (!a) return b ? formatDay(to) : '';
  if (!b || b <= a) return formatDay(from);
  return fmt({ day: 'numeric', month: 'long', year: 'numeric' }).formatRange(a, b);
}

// Pinned first, then newest.
export function sortMessages(messages) {
  return [...messages].sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) || (b.createdAt ?? 0) - (a.createdAt ?? 0));
}

export const hasAny = (obj, keys) => keys.some((k) => String(obj?.[k] ?? '').trim());
