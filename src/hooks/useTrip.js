import { useCallback, useEffect, useState } from 'react';
import { isValidTripCode, normalizeTripCode, store } from '../lib/store/index.js';
import { isAdminSession } from '../lib/admin.js';

const LAST_TRIP_KEY = 'snowcrew:lastTrip';
const meKey = (code) => `snowcrew:me:${code}`;
const adminKey = (code) => `snowcrew:admin:${code}`;

function read(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key, value) {
  try {
    if (value == null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* storage blocked: identity just won't be remembered */
  }
}

// An invite link (?trip=CODE) wins over the last trip this browser used.
function initialTrip() {
  const fromUrl = normalizeTripCode(new URLSearchParams(window.location.search).get('trip') ?? '');
  if (isValidTripCode(fromUrl)) {
    write(LAST_TRIP_KEY, fromUrl);
    return fromUrl;
  }
  return read(LAST_TRIP_KEY);
}

const byCreated = (a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0);

export function useTrip() {
  const [tripCode, setTripCode] = useState(initialTrip);
  const [meId, setMeId] = useState(() => (tripCode ? read(meKey(tripCode)) : null));
  const [adminToken, setAdminToken] = useState(() => (tripCode ? read(adminKey(tripCode)) : null));
  // undefined = still loading, null = no trip with this code yet.
  const [trip, setTrip] = useState(undefined);
  const [members, setMembers] = useState(null);
  const [requests, setRequests] = useState([]);
  const [groups, setGroups] = useState([]);
  const [messages, setMessages] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!tripCode) return undefined;
    setTrip(undefined);
    setMembers(null);
    setGroups([]);
    setMessages([]);
    setError(null);
    const onError = (e) => setError(e?.message ?? String(e));
    const unsubs = [
      store.listenTrip(tripCode, setTrip, onError),
      store.listenMembers(tripCode, (list) => setMembers(list.sort(byCreated)), onError),
      store.listenRequests(tripCode, (list) => setRequests(list.sort((a, b) => byCreated(b, a))), onError),
      store.listenGroups(tripCode, (list) => setGroups(list.sort(byCreated)), onError),
      store.listenMessages(tripCode, setMessages, onError),
    ];
    return () => unsubs.forEach((u) => u());
  }, [tripCode]);

  const joinTrip = useCallback((code) => {
    write(LAST_TRIP_KEY, code);
    setTripCode(code);
    setMeId(read(meKey(code)));
    setAdminToken(read(adminKey(code)));
  }, []);

  const leaveTrip = useCallback(() => {
    write(LAST_TRIP_KEY, null);
    window.history.replaceState(null, '', window.location.pathname);
    setTripCode(null);
    setMeId(null);
    setAdminToken(null);
    setTrip(undefined);
    setMembers(null);
    setRequests([]);
  }, []);

  const chooseMe = useCallback(
    (id) => {
      write(meKey(tripCode), id);
      setMeId(id);
    },
    [tripCode],
  );

  // Remember the hash this browser unlocked with; it stays admin while the trip's hash matches.
  const setAdmin = useCallback(
    (hash) => {
      write(adminKey(tripCode), hash);
      setAdminToken(hash);
    },
    [tripCode],
  );

  const me = members?.find((m) => m.id === meId) ?? null;
  const isAdmin = isAdminSession(trip, adminToken);

  return {
    tripCode, trip, members, requests, groups, messages, me, meId, isAdmin, error,
    joinTrip, leaveTrip, chooseMe, setAdmin,
  };
}
