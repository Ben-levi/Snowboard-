import { describe, expect, it } from 'vitest';
import { addTodo, checklistProgress, gearToBuy, removeTodo, suggestionsFor, toggleTodo } from './todo.js';
import { gearFor } from '../data/gearCatalog.js';

describe('todo list helpers', () => {
  it('adds trimmed items and ignores blanks and duplicates', () => {
    let list = addTodo([], '  דרכון ');
    expect(list.map((x) => x.text)).toEqual(['דרכון']);
    expect(addTodo(list, '   ')).toBe(list);
    expect(addTodo(list, 'דרכון')).toBe(list);
  });

  it('toggles and removes by id', () => {
    const list = addTodo([], 'מטען');
    const toggled = toggleTodo(list, list[0].id);
    expect(toggled[0].done).toBe(true);
    expect(removeTodo(toggled, list[0].id)).toEqual([]);
  });

  it('hides suggestions already on the list', () => {
    const list = addTodo([], 'דרכון');
    expect(suggestionsFor(list, ['דרכון', 'מטען'])).toEqual(['מטען']);
  });
});

describe('gearToBuy / checklistProgress', () => {
  it('lists catalog gear marked buy for the rider', () => {
    const m = { rider: 'ski', items: { helmet: { status: 'buy' }, snowboard: { status: 'buy' } } };
    expect(gearToBuy(m).map((g) => g.id)).toEqual(['helmet']);
  });

  it('counts gear, personal items and trip-wide items together', () => {
    const total = gearFor('ski').length;
    const trip = { checklist: [{ id: 's1', text: 'ביטוח מודפס' }] };
    const m = {
      rider: 'ski',
      items: { helmet: { status: 'own' } },
      todo: { remember: [{ id: 'a', text: 'x', done: true }, { id: 'b', text: 'y', done: false }], shared: { s1: true } },
    };
    expect(checklistProgress(m, trip)).toMatchObject({ done: 3, total: total + 3 });
  });

  it('handles an empty member', () => {
    expect(checklistProgress({ rider: 'ski' }, null).done).toBe(0);
  });
});
