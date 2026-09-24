import {
  addDoc,
  collection,
  doc,
  FieldPath,
  getDoc,
  onSnapshot,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { initFirebase } from '../firebase.js';

export function createFirestoreAdapter() {
  const { db, ready } = initFirebase();

  const tripRef = (code) => doc(db, 'trips', code);
  const membersCol = (code) => collection(db, 'trips', code, 'members');
  const requestsCol = (code) => collection(db, 'trips', code, 'requests');
  const memberRef = (code, id) => doc(db, 'trips', code, 'members', id);
  const requestRef = (code, id) => doc(db, 'trips', code, 'requests', id);
  const itemPath = (itemId) => new FieldPath('items', itemId);

  function listen(colRef, cb, onError) {
    let unsub = () => {};
    let cancelled = false;
    ready
      .then(() => {
        if (cancelled) return;
        unsub = onSnapshot(
          colRef,
          (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
          onError,
        );
      })
      .catch(onError);
    return () => {
      cancelled = true;
      unsub();
    };
  }

  return {
    mode: 'firebase',

    async ensureTrip(code) {
      await ready;
      const snap = await getDoc(tripRef(code));
      if (!snap.exists()) await setDoc(tripRef(code), { name: code, createdAt: Date.now() });
    },

    listenMembers: (code, cb, onError) => listen(membersCol(code), cb, onError),
    listenRequests: (code, cb, onError) => listen(requestsCol(code), cb, onError),

    async addMember(code, { name, rider, color }) {
      await ready;
      const now = Date.now();
      const ref = await addDoc(membersCol(code), { name, rider, color, items: {}, createdAt: now, updatedAt: now });
      return ref.id;
    },

    async updateMember(code, id, patch) {
      await ready;
      await updateDoc(memberRef(code, id), { ...patch, updatedAt: Date.now() });
    },

    async setItem(code, memberId, itemId, item) {
      await ready;
      await updateDoc(memberRef(code, memberId), itemPath(itemId), item, 'updatedAt', Date.now());
    },

    async createRequest(code, { itemId, fromId, toId, message }) {
      await ready;
      const now = Date.now();
      await addDoc(requestsCol(code), {
        itemId, fromId, toId, message: message ?? '', status: 'pending', createdAt: now, updatedAt: now,
      });
    },

    // Applies a request state change plus the matching item updates on both members atomically.
    async resolveRequest(code, request, status, { fromItem, toItem }) {
      await ready;
      const now = Date.now();
      const batch = writeBatch(db);
      batch.update(requestRef(code, request.id), { status, updatedAt: now });
      if (fromItem) batch.update(memberRef(code, request.fromId), itemPath(request.itemId), fromItem, 'updatedAt', now);
      if (toItem) batch.update(memberRef(code, request.toId), itemPath(request.itemId), toItem, 'updatedAt', now);
      await batch.commit();
    },
  };
}
