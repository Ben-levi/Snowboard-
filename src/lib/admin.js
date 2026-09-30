// Trip admin password: only its SHA-256 hash (salted with the trip code) is stored on the trip.
// Checked in the browser, so it keeps honest friends out of the admin panel; it is not real security.

export const MIN_PASSWORD = 4;

export async function hashPassword(code, password) {
  const bytes = new TextEncoder().encode(`${code}:${password}`);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function checkPassword(code, password, hash) {
  if (!hash || !password) return false;
  return (await hashPassword(code, password)) === hash;
}

// This browser's admin session holds the hash it unlocked with, so changing the password logs everyone else out.
export const isAdminSession = (trip, sessionHash) => Boolean(trip?.adminHash) && sessionHash === trip.adminHash;
