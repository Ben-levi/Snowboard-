import { seedDemoMembers } from './demoSeed.js';

// Demo-mode store: same interface as the Firestore adapter, persisted to localStorage.
// Listeners fire on local writes and on writes from other tabs (via the storage event).
export function createLocalAdapter() {
  const key = (code) => `snowcrew:trip:${code}`;
  const listeners = new Set();
  const memory = new Map();

  function load(code) {
    try {
      const raw = localStorage.getItem(key(code));
      if (raw) return JSON.parse(raw);
    } catch {
      /* fall through to empty trip */
    }
    return null;
  }

  function save(code, trip) {
    try {
      localStorage.setItem(key(code), JSON.stringify(trip));
    } catch {
      /* storage full or blocked: keep going in memory */
    }
    memory.set(code, trip);
    notify(code);
  }

  const get =(code) => memory.get(code) ?? load(code) ?? { members: {}, requests: {} };

  function notify(code) {
    for (const l of listeners) if (l.code === code) l.fire(get(code));
  }

  window.addEventListener('storage', (e) => {
    for (const l of listeners) {
      if (e.key === key(l.code)) {
        memory.delete(l.code);
        l.fire(get(l.code));
      }
    }
  });

  function listen(code, pick, cb) {
    const entry = {
      code,
      fire: (trip) => cb(Object.entries(trip[pick]).map(([id, v]) => ({ id, ...v }))),
    };
    listeners.add(entry);
    queueMicrotask(() => entry.fire(get(code)));
    return () => listeners.delete(entry);
  }

  const newId = () => Math.random().toString(36).slice(2, 10);

  function mutate(code, fn) {
    const trip = structuredClone(get(code));
    fn(trip);
    save(code, trip);
  }

  return {
    mode: 'demo',

    async ensureTrip(code) {
      if (!load(code) && !memory.has(code)) save(code, { members: seedDemoMembers(), requests: {} });
    },

    listenMembers: (code, cb) => listen(code, 'members', cb),
    listenRequests: (code, cb) => listen(code, 'requests', cb),

    async addMember(code, { name, rider, color }) {
      const id = newId();
      const now = Date.now();
      mutate(code, (t) => {
        t.members[id] = { name, rider, color, items: {}, createdAt: now, updatedAt: now };
      });
      return id;
    },

    async updateMember(code, id, patch) {
      mutate(code, (t) => Object.assign(t.members[id], patch, { updatedAt: Date.now() }));
    },

    async setItem(code, memberId, itemId, item) {
      mutate(code, (t) => {
        t.members[memberId].items[itemId] = item;
        t.members[memberId].updatedAt = Date.now();
      });
    },

    async createRequest(code, { itemId, fromId, toId, message }) {
      const now = Date.now();
      mutate(code, (t) => {
        t.requests[newId()] = { itemId, fromId, toId, message: message ?? '', status: 'pending', createdAt: now, updatedAt: now };
      });
    },

    async resolveRequest(code, request, status, { fromItem, toItem }) {
      mutate(code, (t) => {
        const now = Date.now();
        Object.assign(t.requests[request.id], { status, updatedAt: now });
        if (fromItem && t.members[request.fromId]) t.members[request.fromId].items[request.itemId] = fromItem;
        if (toItem && t.members[request.toId]) t.members[request.toId].items[request.itemId] = toItem;
      });
    },
  };
}
