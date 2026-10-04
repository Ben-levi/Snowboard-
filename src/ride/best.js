// Best times per course, kept in this browser.
const key = (resort, id) => `ride:best:${resort}:${id}`;

export function getBest(resort, id) {
  try {
    const v = Number(localStorage.getItem(key(resort, id)));
    return v > 0 ? v : null;
  } catch {
    return null;
  }
}

// Saves the time if it beats the stored one; returns true for a new best.
export function saveBest(resort, id, time) {
  const prev = getBest(resort, id);
  if (prev && prev <= time) return false;
  try {
    localStorage.setItem(key(resort, id), String(time));
  } catch {
    /* storage blocked */
  }
  return true;
}
