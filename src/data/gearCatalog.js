// Gear sections map 1:1 to clickable regions on the rider figure.
export const SECTIONS = [
  { id: 'head', label: 'Head', emoji: '⛑️' },
  { id: 'upper', label: 'Upper body', emoji: '🧥' },
  { id: 'hands', label: 'Hands', emoji: '🧤' },
  { id: 'lower', label: 'Lower body', emoji: '👖' },
  { id: 'feet', label: 'Feet', emoji: '🥾' },
  { id: 'equipment', label: 'Equipment', emoji: '🏂' },
  { id: 'extras', label: 'Extras', emoji: '🎒' },
];

const BOTH = ['snowboard', 'ski'];

export const GEAR = [
  { id: 'helmet', label: 'Helmet', emoji: '⛑️', section: 'head', riders: BOTH, essential: true },
  { id: 'goggles', label: 'Goggles', emoji: '🥽', section: 'head', riders: BOTH, essential: true },
  { id: 'beanie', label: 'Beanie', emoji: '🧢', section: 'head', riders: BOTH, essential: false },
  { id: 'gaiter', label: 'Neck gaiter / buff', emoji: '🧣', section: 'head', riders: BOTH, essential: true },

  { id: 'base-top', label: 'Base layer top', emoji: '👕', section: 'upper', riders: BOTH, essential: true },
  { id: 'fleece', label: 'Mid layer / fleece', emoji: '🧶', section: 'upper', riders: BOTH, essential: true },
  { id: 'jacket', label: 'Snow jacket', emoji: '🧥', section: 'upper', riders: BOTH, essential: true },

  { id: 'gloves', label: 'Gloves / mittens', emoji: '🧤', section: 'hands', riders: BOTH, essential: true },
  { id: 'liners', label: 'Liner gloves', emoji: '✋', section: 'hands', riders: BOTH, essential: false },
  { id: 'wrist-guards', label: 'Wrist guards', emoji: '🛡️', section: 'hands', riders: ['snowboard'], essential: false },

  { id: 'base-bottom', label: 'Base layer bottom', emoji: '🩲', section: 'lower', riders: BOTH, essential: true },
  { id: 'pants', label: 'Snow pants', emoji: '👖', section: 'lower', riders: BOTH, essential: true },
  { id: 'impact-shorts', label: 'Impact shorts', emoji: '🩳', section: 'lower', riders: ['snowboard'], essential: false },

  { id: 'socks', label: 'Ski socks', emoji: '🧦', section: 'feet', riders: BOTH, essential: true },
  { id: 'board-boots', label: 'Snowboard boots', emoji: '🥾', section: 'feet', riders: ['snowboard'], essential: true },
  { id: 'ski-boots', label: 'Ski boots', emoji: '🥾', section: 'feet', riders: ['ski'], essential: true },

  { id: 'snowboard', label: 'Snowboard', emoji: '🏂', section: 'equipment', riders: ['snowboard'], essential: true },
  { id: 'bindings', label: 'Bindings', emoji: '🔩', section: 'equipment', riders: ['snowboard'], essential: true },
  { id: 'skis', label: 'Skis', emoji: '🎿', section: 'equipment', riders: ['ski'], essential: true },
  { id: 'poles', label: 'Poles', emoji: '🥢', section: 'equipment', riders: ['ski'], essential: true },
  { id: 'wax-kit', label: 'Wax / tool kit', emoji: '🧰', section: 'equipment', riders: BOTH, essential: false },

  { id: 'backpack', label: 'Backpack', emoji: '🎒', section: 'extras', riders: BOTH, essential: false },
  { id: 'sunscreen', label: 'Sunscreen', emoji: '🧴', section: 'extras', riders: BOTH, essential: true },
  { id: 'lip-balm', label: 'Lip balm', emoji: '💄', section: 'extras', riders: BOTH, essential: false },
  { id: 'bottle', label: 'Water bottle', emoji: '🥤', section: 'extras', riders: BOTH, essential: false },
  { id: 'warmers', label: 'Hand / foot warmers', emoji: '🔥', section: 'extras', riders: BOTH, essential: false },
];

export const GEAR_BY_ID = Object.fromEntries(GEAR.map((g) => [g.id, g]));

export function gearFor(rider) {
  return GEAR.filter((g) => g.riders.includes(rider));
}

export function gearInSection(rider, sectionId) {
  return gearFor(rider).filter((g) => g.section === sectionId);
}

export const STATUSES = [
  { id: 'own', label: 'Own it', short: 'Own', color: 'var(--own)' },
  { id: 'buy', label: 'Need to buy', short: 'Buy', color: 'var(--buy)' },
  { id: 'borrow', label: 'Need to borrow', short: 'Borrow', color: 'var(--borrow)' },
  { id: 'borrowed', label: 'Borrowed', short: 'Borrowed', color: 'var(--borrowed)' },
  { id: 'skip', label: "Don't need", short: 'Skip', color: 'var(--skip)' },
];

export const STATUS_BY_ID = Object.fromEntries(STATUSES.map((s) => [s.id, s]));

export const AVATAR_COLORS = ['#ff6b6b', '#ffa94d', '#ffd43b', '#69db7c', '#38d9a9', '#4dabf7', '#748ffc', '#da77f2', '#f783ac'];
