import { gearFor, gearInSection } from '../data/gearCatalog.js';

const COVERED = new Set(['own', 'borrowed', 'skip']);

export function itemStatus(member, itemId) {
  return member.items?.[itemId]?.status ?? null;
}

export function ownedCount(member) {
  return gearFor(member.rider).filter((g) => itemStatus(member, g.id) === 'own').length;
}

export function countByStatus(member) {
  const counts = { own: 0, buy: 0, borrow: 0, borrowed: 0, skip: 0, unset: 0 };
  for (const g of gearFor(member.rider)) {
    counts[itemStatus(member, g.id) ?? 'unset'] += 1;
  }
  return counts;
}

// Share of the member's gear list that is sorted out (owned, borrowed or not needed).
export function readiness(member) {
  const list = gearFor(member.rider);
  if (!list.length) return 0;
  const covered = list.filter((g) => COVERED.has(itemStatus(member, g.id))).length;
  return covered / list.length;
}

export function lentCount(member) {
  return Object.values(member.items ?? {}).filter((i) => i?.lentTo).length;
}

// Summary state for one figure region: drives its tint.
export function sectionStatus(member, sectionId) {
  const statuses = gearInSection(member.rider, sectionId).map((g) => itemStatus(member, g.id));
  if (!statuses.length) return 'empty';
  if (statuses.includes('buy')) return 'buy';
  if (statuses.includes('borrow')) return 'borrow';
  if (statuses.every((s) => COVERED.has(s))) return 'done';
  if (statuses.some((s) => s)) return 'partial';
  return 'empty';
}

export function isFullyGeared(member) {
  const list = gearFor(member.rider);
  return list.length > 0 && list.every((g) => COVERED.has(itemStatus(member, g.id)));
}

export function badges(member) {
  const out = [];
  const counts = countByStatus(member);
  if (isFullyGeared(member)) out.push({ id: 'geared', emoji: '🏆', label: 'מאובזר לגמרי' });
  if (lentCount(member) >= 2) out.push({ id: 'generous', emoji: '🤝', label: 'נדיב' });
  if (counts.buy >= 5) out.push({ id: 'shopper', emoji: '🛒', label: 'קניין' });
  return out;
}

// Most owned items first; ties broken by readiness, then name. Equal owned+readiness share a rank.
export function rankMembers(members) {
  const rows = members.map((m) => ({ member: m, owned: ownedCount(m), ready: readiness(m) }));
  rows.sort(
    (a, b) => b.owned - a.owned || b.ready - a.ready || a.member.name.localeCompare(b.member.name),
  );
  let rank = 0;
  return rows.map((row, i) => {
    const prev = rows[i - 1];
    if (!prev || prev.owned !== row.owned || prev.ready !== row.ready) rank = i + 1;
    return { ...row, rank };
  });
}

// Friends who own an item and are willing to lend it (and haven't lent it out already).
export function lendersFor(members, itemId, excludeId) {
  return members.filter((m) => {
    if (m.id === excludeId) return false;
    const item = m.items?.[itemId];
    return item?.status === 'own' && item.lendable && !item.lentTo;
  });
}
