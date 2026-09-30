// Gear sections map 1:1 to clickable regions on the rider figure.
export const SECTIONS = [
  { id: 'head', label: 'ראש', emoji: '⛑️' },
  { id: 'upper', label: 'פלג גוף עליון', emoji: '🧥' },
  { id: 'hands', label: 'ידיים', emoji: '🧤' },
  { id: 'lower', label: 'פלג גוף תחתון', emoji: '👖' },
  { id: 'feet', label: 'רגליים', emoji: '🥾' },
  { id: 'equipment', label: 'ציוד גלישה', emoji: '🏂' },
  { id: 'extras', label: 'תוספות', emoji: '🎒' },
];

const BOTH = ['snowboard', 'ski'];

export const GEAR = [
  { id: 'helmet', label: 'קסדה', emoji: '⛑️', section: 'head', riders: BOTH, essential: true },
  { id: 'goggles', label: 'משקפי סקי', emoji: '🥽', section: 'head', riders: BOTH, essential: true },
  { id: 'beanie', label: 'כובע גרב', emoji: '🧢', section: 'head', riders: BOTH, essential: false },
  { id: 'gaiter', label: 'צוואר / באף', emoji: '🧣', section: 'head', riders: BOTH, essential: true },

  { id: 'base-top', label: 'שכבה תרמית עליונה', emoji: '👕', section: 'upper', riders: BOTH, essential: true },
  { id: 'fleece', label: 'שכבת ביניים / פליז', emoji: '🧶', section: 'upper', riders: BOTH, essential: true },
  { id: 'jacket', label: 'מעיל סקי', emoji: '🧥', section: 'upper', riders: BOTH, essential: true },

  { id: 'gloves', label: 'כפפות', emoji: '🧤', section: 'hands', riders: BOTH, essential: true },
  { id: 'liners', label: 'כפפות פנימיות', emoji: '✋', section: 'hands', riders: BOTH, essential: false },
  { id: 'wrist-guards', label: 'מגני שורש כף יד', emoji: '🛡️', section: 'hands', riders: ['snowboard'], essential: false },

  { id: 'base-bottom', label: 'שכבה תרמית תחתונה', emoji: '🩲', section: 'lower', riders: BOTH, essential: true },
  { id: 'pants', label: 'מכנסי סקי', emoji: '👖', section: 'lower', riders: BOTH, essential: true },
  { id: 'impact-shorts', label: 'מכנסי הגנה', emoji: '🩳', section: 'lower', riders: ['snowboard'], essential: false },

  { id: 'socks', label: 'גרבי סקי', emoji: '🧦', section: 'feet', riders: BOTH, essential: true },
  { id: 'board-boots', label: 'נעלי סנובורד', emoji: '🥾', section: 'feet', riders: ['snowboard'], essential: true },
  { id: 'ski-boots', label: 'נעלי סקי', emoji: '🥾', section: 'feet', riders: ['ski'], essential: true },

  { id: 'snowboard', label: 'סנובורד', emoji: '🏂', section: 'equipment', riders: ['snowboard'], essential: true },
  { id: 'bindings', label: 'בינדינגס', emoji: '🔩', section: 'equipment', riders: ['snowboard'], essential: true },
  { id: 'skis', label: 'מגלשיים', emoji: '🎿', section: 'equipment', riders: ['ski'], essential: true },
  { id: 'poles', label: 'מקלות', emoji: '🥢', section: 'equipment', riders: ['ski'], essential: true },
  { id: 'wax-kit', label: 'ערכת ווקס וכלים', emoji: '🧰', section: 'equipment', riders: BOTH, essential: false },

  { id: 'backpack', label: 'תיק גב', emoji: '🎒', section: 'extras', riders: BOTH, essential: false },
  { id: 'sunscreen', label: 'קרם הגנה', emoji: '🧴', section: 'extras', riders: BOTH, essential: true },
  { id: 'lip-balm', label: 'שפתון לחות', emoji: '💄', section: 'extras', riders: BOTH, essential: false },
  { id: 'bottle', label: 'בקבוק מים', emoji: '🥤', section: 'extras', riders: BOTH, essential: false },
  { id: 'warmers', label: 'מחממי ידיים ורגליים', emoji: '🔥', section: 'extras', riders: BOTH, essential: false },
];

export const GEAR_BY_ID = Object.fromEntries(GEAR.map((g) => [g.id, g]));

export function gearFor(rider) {
  return GEAR.filter((g) => g.riders.includes(rider));
}

export function gearInSection(rider, sectionId) {
  return gearFor(rider).filter((g) => g.section === sectionId);
}

export const STATUSES = [
  { id: 'own', label: 'יש לי', short: 'יש', color: 'var(--own)' },
  { id: 'buy', label: 'צריך לקנות', short: 'לקנות', color: 'var(--buy)' },
  { id: 'borrow', label: 'צריך לשאול', short: 'לשאול', color: 'var(--borrow)' },
  { id: 'borrowed', label: 'שאלתי', short: 'שאלתי', color: 'var(--borrowed)' },
  { id: 'skip', label: 'לא צריך', short: 'לא צריך', color: 'var(--skip)' },
];

export const STATUS_BY_ID = Object.fromEntries(STATUSES.map((s) => [s.id, s]));

export const AVATAR_COLORS = ['#ff6b6b', '#ffa94d', '#ffd43b', '#69db7c', '#38d9a9', '#4dabf7', '#748ffc', '#da77f2', '#f783ac'];
