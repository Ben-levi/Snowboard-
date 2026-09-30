import { newId } from '../groups.js';
import { seedDemoTrip } from './demoSeed.js';

const EMPTY = () => ({ trip: null, members: {}, requests: {}, groups: {}, messages: {} });

// Demo-mode store: same interface as the Firestore adapter, persisted to localStorage.
// Listeners fire on local writes and on writes from other tabs (via the storage event).
export function createLocalAdapter() {
  const key = (code) => `snowcrew:trip:${code}`;
  const listeners = new Set();
  const memory = new Map();

  function load(code) {
    try {
      const raw = localStorage.getItem(key(code));
      if (raw) return { ...EMPTY(), ...JSON.parse(raw) };
    } catch {
      /* fall through to empty trip */
    }
    return null;
  }

  function save(code, data) {
    try {
      localStorage.setItem(key(code), JSON.stringify(data));
    } catch {
      /* storage full or blocked: keep going in memory */
    }
    memory.set(code, data);
    notify(code);
  }

  const stored = (code) => memory.get(code) ?? load(code);
  const get = (code) => stored(code) ?? EMPTY();

  // Trips saved before trip details existed have members but no trip record.
  function tripOf(code) {
    const data = stored(code);
    if (!data) return null;
    return data.trip ?? { name: code, info: {} };
  }

  function notify(code) {
    for (const l of listeners) if (l.code === code) l.fire();
  }

  window.addEventListener('storage', (e) => {
    for (const l of listeners) {
      if (e.key === key(l.code)) {
        memory.delete(l.code);
        l.fire();
      }
    }
  });

  function subscribe(code, snapshot, cb) {
    const entry = { code, fire: () => cb(snapshot()) };
    listeners.add(entry);
    queueMicrotask(entry.fire);
    return () => listeners.delete(entry);
  }

  const listen = (code, pick, cb) =>
    subscribe(code, () => Object.entries(get(code)[pick]).map(([id, v]) => ({ id, ...structuredClone(v) })), cb);

  function mutate(code, fn) {
    const data = structuredClone(get(code));
    fn(data);
    save(code, data);
  }

  function add(code, pick, value) {
    const id = newId();
    const now = Date.now();
    mutate(code, (d) => {
      d[pick][id] = { ...value, createdAt: now, updatedAt: now };
    });
    return id;
  }

  function patch(code, pick, id, value) {
    mutate(code, (d) => {
      if (d[pick][id]) Object.assign(d[pick][id], value, { updatedAt: Date.now() });
    });
  }

  function remove(code, pick, id) {
    mutate(code, (d) => {
      delete d[pick][id];
    });
  }

  return {
    mode: 'demo',

    // ---- Trip ----
    async getTrip(code) {
      return tripOf(code);
    },

    // Demo trips come with sample friends, groups and a welcome message to explore.
    async createTrip(code, { name, adminHash, demo = false }) {
      const now = Date.now();
      const { info, members, groups, messages } = seedDemoTrip(now);
      save(code, { ...EMPTY(), members, groups, messages, trip: { name, adminHash, demo, info, createdAt: now, updatedAt: now } });
    },

    listenTrip: (code, cb) => subscribe(code, () => structuredClone(tripOf(code)), cb),

    async updateTrip(code, value) {
      mutate(code, (d) => {
        d.trip = { ...(d.trip ?? { name: code, info: {} }), ...value, updatedAt: Date.now() };
      });
    },

    async updateTripInfo(code, info) {
      mutate(code, (d) => {
        d.trip ??= { name: code, info: {} };
        d.trip.info = { ...d.trip.info, ...info };
        d.trip.updatedAt = Date.now();
      });
    },

    // ---- Members ----
    listenMembers: (code, cb) => listen(code, 'members', cb),
    addMember: async (code, { name, rider, color }) => add(code, 'members', { name, rider, color, items: {}, info: {}, groupId: null }),
    updateMember: async (code, id, value) => patch(code, 'members', id, value),

    async setMemberInfo(code, id, info) {
      mutate(code, (d) => {
        const m = d.members[id];
        if (!m) return;
        m.info = { ...m.info, ...info };
        m.updatedAt = Date.now();
      });
    },

    deleteMember: async (code, id) => remove(code, 'members', id),

    async setItem(code, memberId, itemId, item) {
      mutate(code, (d) => {
        d.members[memberId].items[itemId] = item;
        d.members[memberId].updatedAt = Date.now();
      });
    },

    // ---- Groups ----
    listenGroups: (code, cb) => listen(code, 'groups', cb),
    addGroup: async (code, { name, emoji }) => add(code, 'groups', { name, emoji, items: {} }),
    updateGroup: async (code, id, value) => patch(code, 'groups', id, value),

    async deleteGroup(code, id, memberIds = []) {
      mutate(code, (d) => {
        delete d.groups[id];
        for (const m of memberIds) if (d.members[m]) d.members[m].groupId = null;
      });
    },

    async setGroupItem(code, groupId, itemId, item) {
      mutate(code, (d) => {
        const g = d.groups[groupId];
        if (!g) return;
        if (item) g.items[itemId] = item;
        else delete g.items[itemId];
        g.updatedAt = Date.now();
      });
    },

    // ---- Messages ----
    listenMessages: (code, cb) => listen(code, 'messages', cb),
    addMessage: async (code, { text, pinned }) => add(code, 'messages', { text, pinned: Boolean(pinned) }),
    updateMessage: async (code, id, value) => patch(code, 'messages', id, value),
    deleteMessage: async (code, id) => remove(code, 'messages', id),

    // ---- Borrow requests ----
    listenRequests: (code, cb) => listen(code, 'requests', cb),

    async createRequest(code, { itemId, fromId, toId, message }) {
      add(code, 'requests', { itemId, fromId, toId, message: message ?? '', status: 'pending' });
    },

    async resolveRequest(code, request, status, { fromItem, toItem }) {
      mutate(code, (d) => {
        Object.assign(d.requests[request.id], { status, updatedAt: Date.now() });
        if (fromItem && d.members[request.fromId]) d.members[request.fromId].items[request.itemId] = fromItem;
        if (toItem && d.members[request.toId]) d.members[request.toId].items[request.itemId] = toItem;
      });
    },
  };
}
