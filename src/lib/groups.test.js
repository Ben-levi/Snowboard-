import { describe, expect, it } from 'vitest';
import { filterItems, groupItems, groupProgress, listProgress, makeItem, myOpenTasks, updatedItem } from './groups.js';

const docs = {
  id: 'g1',
  name: 'מסמכים',
  emoji: '',
  items: {
    a: { label: 'דרכון', done: false, by: null, note: '', createdAt: 2 },
    b: { label: 'ביטוח', done: true, by: 'maya', note: 'מודפס', createdAt: 1 },
    c: { label: 'כרטיסי טיסה', done: false, by: 'omer', createdAt: 3 },
  },
};
// Saved before the shared list: status 'have' / 'buy' instead of done.
const legacy = { id: 'g2', name: 'רכב', emoji: '🚗', items: { d: { label: 'שרשראות', status: 'have', by: 'maya', createdAt: 1 }, e: { label: 'מגרד', status: 'buy', by: 'maya', createdAt: 2 } } };

describe('shared list', () => {
  it('lists items oldest first with defaults filled in', () => {
    expect(groupItems(docs).map((i) => i.id)).toEqual(['b', 'a', 'c']);
    expect(groupItems(docs)[2]).toMatchObject({ note: '', done: false });
    expect(groupItems({})).toEqual([]);
  });

  it('reads old items', () => {
    expect(groupItems(legacy).map((i) => i.done)).toEqual([true, false]);
  });

  it('counts done items per group and overall', () => {
    expect(groupProgress(docs)).toEqual({ done: 1, total: 3 });
    expect(listProgress([docs, legacy])).toEqual({ done: 2, total: 5 });
  });

  it('filters open and mine', () => {
    const items = groupItems(docs);
    expect(filterItems(items, 'open', 'maya').map((i) => i.id)).toEqual(['a', 'c']);
    expect(filterItems(items, 'mine', 'omer').map((i) => i.id)).toEqual(['c']);
    expect(filterItems(items, 'all', 'omer')).toHaveLength(3);
  });

  it('collects what is still on me', () => {
    expect(myOpenTasks([docs, legacy], 'maya').map((t) => [t.label, t.groupName])).toEqual([['מגרד', 'רכב']]);
  });

  it('builds and updates stored items', () => {
    expect(makeItem('  מטען  ', 5)).toEqual({ label: 'מטען', done: false, by: null, note: '', createdAt: 5 });
    const item = groupItems(legacy)[1];
    expect(updatedItem(item, { done: true, note: 'x' })).toEqual({ label: 'מגרד', done: true, by: 'maya', note: 'x', createdAt: 2 });
  });
});
