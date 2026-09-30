import { describe, expect, it } from 'vitest';
import { formatRange, parseDay, sortMessages, tripPhase } from './tripInfo.js';

const now = new Date(2027, 0, 10, 15, 30); // 10 Jan 2027, afternoon

describe('trip dates', () => {
  it('parses input dates as local days', () => {
    expect(parseDay('2027-01-12')).toEqual(new Date(2027, 0, 12));
    expect(parseDay('')).toBeNull();
    expect(parseDay('12/01/2027')).toBeNull();
  });

  it('counts down, then counts trip days, then ends', () => {
    expect(tripPhase('2027-01-12', '2027-01-19', now)).toEqual({ phase: 'before', days: 2 });
    expect(tripPhase('2027-01-10', '2027-01-19', now)).toEqual({ phase: 'during', day: 1 });
    expect(tripPhase('2027-01-08', '2027-01-19', now)).toEqual({ phase: 'during', day: 3 });
    expect(tripPhase('2027-01-01', '2027-01-09', now)).toEqual({ phase: 'after' });
    expect(tripPhase('', '', now)).toEqual({ phase: 'unknown' });
  });

  it('formats ranges in Hebrew', () => {
    expect(formatRange('2027-01-12', '2027-01-19')).toMatch(/ינואר/);
    expect(formatRange('', '')).toBe('');
  });

  it('puts pinned messages first, then newest', () => {
    const list = [
      { id: 'a', createdAt: 1 },
      { id: 'b', createdAt: 3 },
      { id: 'c', createdAt: 2, pinned: true },
    ];
    expect(sortMessages(list).map((m) => m.id)).toEqual(['c', 'b', 'a']);
  });
});
