import { describe, expect, it } from 'vitest';
import { badges, isFullyGeared, lendersFor, ownedCount, rankMembers, readiness, sectionStatus } from './stats.js';
import { gearFor } from '../data/gearCatalog.js';

const member = (id, rider, items = {}) => ({ id, name: id, rider, items });
const all = (rider, status, extra = {}) =>
  Object.fromEntries(gearFor(rider).map((g) => [g.id, { status, ...extra }]));

describe('ownedCount / readiness', () => {
  it('counts only owned items that belong to the rider type', () => {
    const m = member('a', 'ski', { skis: { status: 'own' }, snowboard: { status: 'own' }, helmet: { status: 'own' } });
    expect(ownedCount(m)).toBe(2);
  });

  it('treats own, borrowed and skip as covered', () => {
    const m = member('a', 'snowboard', all('snowboard', 'skip'));
    expect(readiness(m)).toBe(1);
    expect(readiness(member('b', 'snowboard'))).toBe(0);
  });
});

describe('sectionStatus', () => {
  it('prioritises buy over borrow over done', () => {
    expect(sectionStatus(member('a', 'ski', { helmet: { status: 'buy' }, goggles: { status: 'borrow' } }), 'head')).toBe('buy');
    expect(sectionStatus(member('a', 'ski', { helmet: { status: 'own' }, goggles: { status: 'borrow' } }), 'head')).toBe('borrow');
    expect(sectionStatus(member('a', 'ski', { helmet: { status: 'own' } }), 'head')).toBe('partial');
    expect(sectionStatus(member('a', 'ski'), 'head')).toBe('empty');
    expect(sectionStatus(member('a', 'ski', all('ski', 'own')), 'head')).toBe('done');
  });
});

describe('rankMembers', () => {
  it('ranks by owned count, then readiness, and shares ranks on ties', () => {
    const a = member('Ann', 'ski', { skis: { status: 'own' }, poles: { status: 'own' } });
    const b = member('Ben', 'ski', { skis: { status: 'own' }, poles: { status: 'own' }, helmet: { status: 'skip' } });
    const c = member('Cat', 'ski', { skis: { status: 'own' } });
    const d = member('Dan', 'ski', { skis: { status: 'own' } });
    const rows = rankMembers([c, a, d, b]);
    expect(rows.map((r) => r.member.name)).toEqual(['Ben', 'Ann', 'Cat', 'Dan']);
    expect(rows.map((r) => r.rank)).toEqual([1, 2, 3, 3]);
  });
});

describe('badges', () => {
  it('awards Fully Geared, Generous and Shopper', () => {
    const geared = member('a', 'ski', all('ski', 'own'));
    geared.items.skis.lentTo = 'x';
    geared.items.poles.lentTo = 'y';
    expect(isFullyGeared(geared)).toBe(true);
    expect(badges(geared).map((b) => b.id)).toEqual(['geared', 'generous']);
    expect(badges(member('b', 'ski', all('ski', 'buy'))).map((b) => b.id)).toEqual(['shopper']);
  });
});

describe('lendersFor', () => {
  it('lists friends who own, are willing to lend, and have not lent it out', () => {
    const me = member('me', 'ski', { skis: { status: 'own', lendable: true } });
    const yes = member('yes', 'ski', { skis: { status: 'own', lendable: true } });
    const busy = member('busy', 'ski', { skis: { status: 'own', lendable: true, lentTo: 'z' } });
    const shy = member('shy', 'ski', { skis: { status: 'own', lendable: false } });
    expect(lendersFor([me, yes, busy, shy], 'skis', 'me').map((m) => m.id)).toEqual(['yes']);
  });
});
