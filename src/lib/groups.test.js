import { describe, expect, it } from 'vitest';
import { groupItems, groupMembers, groupProgress, myGroupTasks } from './groups.js';

const flat = {
  id: 'g1',
  name: 'דירה 1',
  emoji: '🏠',
  items: {
    a: { label: 'קפה', status: 'buy', by: null, createdAt: 2 },
    b: { label: 'רמקול', status: 'have', by: 'maya', createdAt: 1 },
    c: { label: 'משחק קופסה', status: 'buy', by: 'omer', createdAt: 3 },
  },
};
const car = { id: 'g2', name: 'רכב', emoji: '🚗', items: { d: { label: 'שרשראות', status: 'buy', by: 'maya', createdAt: 1 } } };

describe('groups', () => {
  it('lists items oldest first', () => {
    expect(groupItems(flat).map((i) => i.id)).toEqual(['b', 'a', 'c']);
    expect(groupItems({})).toEqual([]);
  });

  it('counts items someone has or will bring', () => {
    expect(groupProgress(flat)).toEqual({ done: 2, total: 3 });
    expect(groupProgress({ items: {} })).toEqual({ done: 0, total: 0 });
  });

  it('finds members of a group', () => {
    const members = [{ id: 'maya', groupId: 'g1' }, { id: 'omer', groupId: 'g2' }, { id: 'noa' }];
    expect(groupMembers(members, 'g1').map((m) => m.id)).toEqual(['maya']);
  });

  it('collects what I said I would bring across groups', () => {
    const tasks = myGroupTasks([flat, car], 'maya');
    expect(tasks.map((t) => [t.label, t.groupName])).toEqual([
      ['רמקול', 'דירה 1'],
      ['שרשראות', 'רכב'],
    ]);
  });
});
