import { describe, expect, it } from 'vitest';
import { arrival, flightStatus, flightsOf, nextFlight, normalizeFlightNumber, sortFlights, toggleWho, trackUrl } from './flights.js';

const f = (over) => ({ id: 'a', number: 'LY 395', date: '2026-12-20', time: '06:10', from: 'TLV', to: 'BCN', who: [], ...over });

describe('normalizeFlightNumber', () => {
  it('formats IATA and ICAO numbers', () => {
    expect(normalizeFlightNumber('ly395')).toBe('LY 395');
    expect(normalizeFlightNumber(' LY-395 ')).toBe('LY 395');
    expect(normalizeFlightNumber('w6 2345')).toBe('W6 2345');
    expect(normalizeFlightNumber('U22345')).toBe('U2 2345');
    expect(normalizeFlightNumber('ely395')).toBe('ELY 395');
  });

  it('rejects junk', () => {
    expect(normalizeFlightNumber('')).toBeNull();
    expect(normalizeFlightNumber('hello')).toBeNull();
    expect(normalizeFlightNumber('LY')).toBeNull();
  });
});

it('links to the live tracker', () => {
  expect(trackUrl('LY 395')).toBe('https://www.flightradar24.com/data/flights/ly395');
});

describe('flightStatus', () => {
  const flight = f({ arrive: '09:40' });
  it('counts days before the flight', () => {
    expect(flightStatus(flight, new Date(2026, 11, 10, 9))).toEqual({ phase: 'later', days: 10 });
    expect(flightStatus(flight, new Date(2026, 11, 19, 23))).toEqual({ phase: 'tomorrow' });
    expect(flightStatus(flight, new Date(2026, 11, 20, 3))).toEqual({ phase: 'today' });
  });

  it('is in the air between take-off and landing, then past', () => {
    expect(flightStatus(flight, new Date(2026, 11, 20, 7))).toEqual({ phase: 'air' });
    expect(flightStatus(flight, new Date(2026, 11, 20, 10))).toEqual({ phase: 'past' });
  });

  it('handles a missing date and overnight arrivals', () => {
    expect(flightStatus(f({ date: '' }))).toEqual({ phase: 'unknown' });
    const night = f({ time: '23:30', arrive: '02:10' });
    expect(arrival(night)).toEqual(new Date(2026, 11, 21, 2, 10));
  });
});

it('sorts, filters by person and toggles who is on board', () => {
  const back = f({ id: 'b', number: 'LY 396', date: '2026-12-27', time: '19:40', who: ['maya'] });
  const out = f({ who: ['maya', 'omer'] });
  expect(sortFlights([back, out]).map((x) => x.id)).toEqual(['a', 'b']);
  expect(flightsOf([back, out], 'omer').map((x) => x.id)).toEqual(['a']);
  expect(toggleWho(out, 'omer').who).toEqual(['maya']);
  expect(toggleWho(out, 'noa').who).toEqual(['maya', 'omer', 'noa']);
  expect(nextFlight([back, out], new Date(2026, 11, 22)).id).toBe('b');
});
