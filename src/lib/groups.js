// Sub-groups inside the crew (apartment, car, family) with a shared list of things to bring or buy.

export const newId = () => Math.random().toString(36).slice(2, 10);

export const groupMembers = (members, groupId) => members.filter((m) => m.groupId === groupId);

export function groupItems(group) {
  return Object.entries(group?.items ?? {})
    .map(([id, item]) => ({ id, ...item }))
    .sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0) || a.label.localeCompare(b.label));
}

// "Sorted" = someone already has it or has said they'll bring it.
export const isSorted = (item) => item.status === 'have' || Boolean(item.by);

export function groupProgress(group) {
  const items = groupItems(group);
  return { done: items.filter(isSorted).length, total: items.length };
}

// Everything I've said I'll bring, across all groups.
export function myGroupTasks(groups, memberId) {
  return groups.flatMap((g) =>
    groupItems(g)
      .filter((i) => i.by === memberId)
      .map((i) => ({ ...i, groupId: g.id, groupName: g.name, groupEmoji: g.emoji })),
  );
}

export const findGroup = (groups, groupId) => groups.find((g) => g.id === groupId) ?? null;
