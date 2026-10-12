import { gearFor } from '../data/gearCatalog.js';
import { newId } from './groups.js';
import { itemStatus } from './stats.js';

export const MAX_TODO_TEXT = 60;
export const MAX_TODO_ITEMS = 40;

// Personal checklists live on the member: todo.buy / todo.remember are [{ id, text, done }],
// todo.shared is { [tripChecklistItemId]: true } for the admin's trip-wide items.
export const todoList = (member, key) => member?.todo?.[key] ?? [];

export function addTodo(list, text) {
  const clean = text.trim().slice(0, MAX_TODO_TEXT);
  if (!clean || list.length >= MAX_TODO_ITEMS) return list;
  if (list.some((x) => x.text === clean && !x.done)) return list;
  return [...list, { id: newId(), text: clean, done: false }];
}

export const toggleTodo = (list, id) => list.map((x) => (x.id === id ? { ...x, done: !x.done } : x));
export const removeTodo = (list, id) => list.filter((x) => x.id !== id);

// Starter suggestions the person can tap to add; hides ones already on the list.
export const suggestionsFor = (list, starters) => starters.filter((s) => !list.some((x) => x.text === s));

// Gear marked "need to buy" in the catalog shows up in the To buy list too, so there is one place to shop from.
export const gearToBuy = (member) => gearFor(member.rider).filter((g) => itemStatus(member, g.id) === 'buy');

export const tripChecklist = (trip) => trip?.checklist ?? [];

// One progress number for the home page: packing items sorted out + ticked personal and trip-wide items.
export function checklistProgress(member, trip) {
  const gear = gearFor(member.rider);
  const covered = gear.filter((g) => ['own', 'borrowed', 'skip'].includes(itemStatus(member, g.id))).length;
  const own = [...todoList(member, 'buy'), ...todoList(member, 'remember')];
  const shared = tripChecklist(trip);
  const done =
    covered + own.filter((x) => x.done).length + shared.filter((x) => member.todo?.shared?.[x.id]).length;
  const total = gear.length + own.length + shared.length;
  return { done, total, ratio: total ? done / total : 0 };
}
