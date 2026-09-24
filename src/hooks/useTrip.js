import { useCallback, useEffect, useState } from 'react';
import { isValidTripCode, normalizeTripCode, store } from '../lib/store/index.js';

const LAST_TRIP_KEY = 'snowcrew:lastTrip';
const meKey = (code) => `snowcrew:me:${code}`;

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

export function useTrip() {
  const [tripCode, setTripCode] = useState(initialTrip);
  const [meId, setMeId] = useState(() => (tripCode ? read(meKey(tripCode)) : null));
  const [members, setMembers] = useState(null);
  const [requests, setRequests] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!tripCode) return undefined;
    setMembers(null);
    setError(null);
    const onError = (e) => setError(e?.message ?? String(e));
    store.ensureTrip(tripCode).catch(onError);
    const unsubMembers = store.listenMembers(tripCode, (list) => {
      list.sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0));
      setMembers(list);
    }, onError);
    const unsubRequests = store.listenRequests(tripCode, (list) => {
      list.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
      setRequests(list);
    }, onError);
    return () => {
      unsubMembers();
      unsubRequests();
    };
  }, [tripCode]);

  const joinTrip = useCallback((code) => {
    write(LAST_TRIP_KEY, code);
    setTripCode(code);
    setMeId(read(meKey(code)));
  }, []);

  const leaveTrip = useCallback(() => {
    write(LAST_TRIP_KEY, null);
    window.history.replaceState(null, '', window.location.pathname);
    setTripCode(null);
    setMeId(null);
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

  const me = members?.find((m) => m.id === meId) ?? null;

  return { tripCode, members, requests, me, meId, error, joinTrip, leaveTrip, chooseMe };
}
