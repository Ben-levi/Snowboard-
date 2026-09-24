import { hasFirebaseConfig } from '../firebase.js';
import { createFirestoreAdapter } from './firestoreAdapter.js';
import { createLocalAdapter } from './localAdapter.js';

export const store = hasFirebaseConfig ? createFirestoreAdapter() : createLocalAdapter();

export const EMPTY_ITEM = { status: null, note: '', lendable: false, borrowedFrom: null, lentTo: null };

export const itemOf = (member, itemId) => ({ ...EMPTY_ITEM, ...(member?.items?.[itemId] ?? {}) });

export function normalizeTripCode(raw) {
  return raw.toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 24);
}

export const isValidTripCode = (code) => /^[A-Z0-9-]{3,24}$/.test(code);

const findMember = (members, id) => members.find((m) => m.id === id);

export function acceptRequest(code, request, members) {
  const requester = findMember(members, request.fromId);
  const owner = findMember(members, request.toId);
  return store.resolveRequest(code, request, 'accepted', {
    fromItem: requester && { ...itemOf(requester, request.itemId), status: 'borrowed', borrowedFrom: request.toId },
    toItem: owner && { ...itemOf(owner, request.itemId), lentTo: request.fromId },
  });
}

export const declineRequest = (code, request) => store.resolveRequest(code, request, 'declined', {});

export const cancelRequest = (code, request) => store.resolveRequest(code, request, 'cancelled', {});

// Owner takes the item back: the borrower is back to needing one.
export function takeBackRequest(code, request, members) {
  const requester = findMember(members, request.fromId);
  const owner = findMember(members, request.toId);
  return store.resolveRequest(code, request, 'returned', {
    fromItem: requester && { ...itemOf(requester, request.itemId), status: 'borrow', borrowedFrom: null },
    toItem: owner && { ...itemOf(owner, request.itemId), lentTo: null },
  });
}
