import {
  addDoc,
  collection,
  deleteDoc,
  deleteField,
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
  const col = (code, name) => collection(db, 'trips', code, name);
  const ref = (code, name, id) => doc(db, 'trips', code, name, id);
  const memberRef = (code, id) => ref(code, 'members', id);
  const requestRef = (code, id) => ref(code, 'requests', id);
  const itemPath = (itemId) => new FieldPath('items', itemId);
  // Merge a patch into a nested map field ("info.instructor": ...) without clobbering other keys.
  const nested = (field, patch) => Object.fromEntries(Object.entries(patch).map(([k, v]) => [`${field}.${k}`, v]));

  function subscribe(target, onData, onError) {
    let unsub = () => {};
    let cancelled = false;
    ready
      .then(() => {
        if (cancelled) return;
        unsub = onSnapshot(target, onData, onError);
      })
      .catch(onError);
    return () => {
      cancelled = true;
      unsub();
    };
  }

  const listen = (colRef, cb, onError) =>
    subscribe(colRef, (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data() }))), onError);

  async function add(colRef, data) {
    await ready;
    const now = Date.now();
    const created = await addDoc(colRef, { ...data, createdAt: now, updatedAt: now });
    return created.id;
  }

  async function patch(docRef, data) {
    await ready;
    await updateDoc(docRef, { ...data, updatedAt: Date.now() });
  }

  return {
    mode: 'firebase',

    // ---- Trip ----
    async getTrip(code) {
      await ready;
      const snap = await getDoc(tripRef(code));
      return snap.exists() ? snap.data() : null;
    },

    async createTrip(code, { name, adminHash }) {
      await ready;
      const now = Date.now();
      await setDoc(tripRef(code), { name, adminHash, info: {}, createdAt: now, updatedAt: now });
    },

    listenTrip: (code, cb, onError) => subscribe(tripRef(code), (snap) => cb(snap.exists() ? snap.data() : null), onError),
    updateTrip: (code, data) => patch(tripRef(code), data),
    updateTripInfo: (code, info) => patch(tripRef(code), nested('info', info)),

    // ---- Members ----
    listenMembers: (code, cb, onError) => listen(col(code, 'members'), cb, onError),
    addMember: (code, { name, rider, color }) => add(col(code, 'members'), { name, rider, color, items: {}, info: {}, groupId: null }),
    updateMember: (code, id, data) => patch(memberRef(code, id), data),
    setMemberInfo: (code, id, info) => patch(memberRef(code, id), nested('info', info)),

    async deleteMember(code, id) {
      await ready;
      await deleteDoc(memberRef(code, id));
    },

    async setItem(code, memberId, itemId, item) {
      await ready;
      await updateDoc(memberRef(code, memberId), itemPath(itemId), item, 'updatedAt', Date.now());
    },

    // ---- Groups ----
    listenGroups: (code, cb, onError) => listen(col(code, 'groups'), cb, onError),
    addGroup: (code, { name, emoji }) => add(col(code, 'groups'), { name, emoji, items: {} }),
    updateGroup: (code, id, data) => patch(ref(code, 'groups', id), data),

    // Deletes the group and takes its members out of it.
    async deleteGroup(code, id, memberIds = []) {
      await ready;
      const batch = writeBatch(db);
      batch.delete(ref(code, 'groups', id));
      for (const m of memberIds) batch.update(memberRef(code, m), { groupId: null, updatedAt: Date.now() });
      await batch.commit();
    },

    // item = null removes it from the list.
    async setGroupItem(code, groupId, itemId, item) {
      await ready;
      await updateDoc(ref(code, 'groups', groupId), itemPath(itemId), item ?? deleteField(), 'updatedAt', Date.now());
    },

    // ---- Messages ----
    listenMessages: (code, cb, onError) => listen(col(code, 'messages'), cb, onError),
    addMessage: (code, { text, pinned }) => add(col(code, 'messages'), { text, pinned: Boolean(pinned) }),
    updateMessage: (code, id, data) => patch(ref(code, 'messages', id), data),

    async deleteMessage(code, id) {
      await ready;
      await deleteDoc(ref(code, 'messages', id));
    },

    // ---- Borrow requests ----
    listenRequests: (code, cb, onError) => listen(col(code, 'requests'), cb, onError),

    async createRequest(code, { itemId, fromId, toId, message }) {
      await add(col(code, 'requests'), { itemId, fromId, toId, message: message ?? '', status: 'pending' });
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
