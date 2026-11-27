// The crew's flights: stored on the trip as info.flights = [{ id, number, date, time, arrive, from, to, who }].
// date is "YYYY-MM-DD", time / arrive are "HH:MM" local times, who is a list of member ids.

import { parseDay } from './tripInfo.js';

export const MAX_FLIGHTS = 12;

// "ly395", "LY-395", "ely 395" -> "LY 395" / "ELY 395". Returns null when it doesn't look like a flight number.
export function normalizeFlightNumber(raw) {
  const compact = String(raw ?? '').toUpperCase().replace(/[\s-]/g, '');
  const m = /^([A-Z]{3}|[A-Z0-9]{2})(\d{1,4}[A-Z]?)$/.exec(compact);
  return m ? `${m[1]} ${m[2]}` : null;
}

// Flightradar24's page for the flight number shows the live map, delays and gate changes.
export function trackUrl(number) {
  const compact = String(number ?? '').replace(/\s/g, '').toLowerCase();
  return `https://www.flightradar24.com/data/flights/${compact}`;
}

function at(date, time) {
  const day = parseDay(date);
  if (!day) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(time ?? '');
  if (m) day.setHours(Number(m[1]), Number(m[2]));
  else day.setHours(12);
  return day;
}

export const departure = (f) => at(f.date, f.time);

// Landing time: the given arrival time (next day if it is earlier than take-off), else take-off + 5 hours.
export function arrival(f) {
  const dep = departure(f);
  if (!dep) return null;
  const arr = f.arrive ? at(f.date, f.arrive) : null;
  if (!arr) return new Date(dep.getTime() + 5 * 3600 * 1000);
  if (arr <= dep) arr.setDate(arr.getDate() + 1);
  return arr;
}

const DAY = 24 * 60 * 60 * 1000;
const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

// Where a flight stands by the clock: later (n days), tomorrow, today, air, past or unknown.
// It's schedule-based; the live link has the real status.
export function flightStatus(f, now = new Date()) {
  const dep = departure(f);
  if (!dep) return { phase: 'unknown' };
  const arr = arrival(f);
  if (now >= arr) return { phase: 'past' };
  if (now >= dep) return { phase: 'air' };
  const days = Math.round((startOfDay(dep) - startOfDay(now)) / DAY);
  if (days === 0) return { phase: 'today' };
  if (days === 1) return { phase: 'tomorrow' };
  return { phase: 'later', days };
}

export const sortFlights = (flights) =>
  [...(flights ?? [])].sort((a, b) => (departure(a)?.getTime() ?? Infinity) - (departure(b)?.getTime() ?? Infinity));

export const flightsOf = (flights, memberId) => sortFlights(flights).filter((f) => f.who?.includes(memberId));

export function toggleWho(flight, memberId) {
  const who = flight.who ?? [];
  return { ...flight, who: who.includes(memberId) ? who.filter((id) => id !== memberId) : [...who, memberId] };
}

// The next flight that hasn't landed yet (for the summary line at the top).
export const nextFlight = (flights, now = new Date()) =>
  sortFlights(flights).find((f) => !['past', 'unknown'].includes(flightStatus(f, now).phase)) ?? null;
