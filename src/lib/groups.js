// The crew's shared list, split into groups ("documents", "apartment", "car"...).
// Each group is a doc in the trip's groups collection: { name, emoji, items: { [id]: item } }.
// An item is { label, done, by, note, createdAt }: by = the member who takes care of it.

export const newId = () => Math.random().toString(36).slice(2, 10);

export const MAX_LABEL = 60;
export const MAX_NOTE = 140;

// Items saved before the shared list had `done` used status 'have'.
export const isDone = (item) => (typeof item.done === 'boolean' ? item.done : item.status === 'have');

export function groupItems(group) {
  return Object.entries(group?.items ?? {})
    .map(([id, item]) => ({ id, ...item, done: isDone(item), note: item.note ?? '', by: item.by ?? null }))
    .sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0) || a.label.localeCompare(b.label));
}

export function groupProgress(group) {
  const items = groupItems(group);
  return { done: items.filter((i) => i.done).length, total: items.length };
}

export function listProgress(groups) {
  return groups.reduce(
    (acc, g) => {
      const p = groupProgress(g);
      return { done: acc.done + p.done, total: acc.total + p.total };
    },
    { done: 0, total: 0 },
  );
}

// 'all' | 'open' (not done yet) | 'mine' (things I took on).
export function filterItems(items, filter, memberId) {
  if (filter === 'open') return items.filter((i) => !i.done);
  if (filter === 'mine') return items.filter((i) => i.by === memberId);
  return items;
}

// What is still open and on me, across all groups.
export function myOpenTasks(groups, memberId) {
  return groups.flatMap((g) =>
    groupItems(g)
      .filter((i) => i.by === memberId && !i.done)
      .map((i) => ({ ...i, groupId: g.id, groupName: g.name })),
  );
}

export const makeItem = (label, now = Date.now()) => ({
  label: label.trim().slice(0, MAX_LABEL),
  done: false,
  by: null,
  note: '',
  createdAt: now,
});

// The stored shape of an item after a change (drops the id and legacy status).
export function updatedItem(item, patch) {
  const next = { ...item, ...patch };
  return {
    label: next.label,
    done: Boolean(next.done),
    by: next.by ?? null,
    note: String(next.note ?? '').slice(0, MAX_NOTE),
    createdAt: next.createdAt ?? Date.now(),
  };
}
