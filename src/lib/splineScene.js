import { SECTIONS } from '../data/gearCatalog.js';
import { sectionStatus } from './stats.js';

// Contract between the app and a rider scene designed in Spline (see README):
// - objects named after a section ("head", "upper", ... or "head-helmet") are clickable
// - optional Number variables "<section>_status" receive STATUS_CODE values
// - optional Number variable "rider" (0 snowboard, 1 ski) and String variable "name"
// - optional objects named "<section>-tint" get recoloured to the status colour

export const STATUS_CODE = { empty: 0, partial: 1, borrow: 2, buy: 3, done: 4 };

export const TINT_COLORS = {
  empty: '#ced4da',
  partial: '#4dabf7',
  borrow: '#ffa94d',
  buy: '#ff6b6b',
  done: '#51cf66',
};

const SECTION_IDS = new Set(SECTIONS.map((s) => s.id));

// "head", "Head", "head-helmet", "upper_jacket 2" -> section id; anything else -> null.
export function sectionFromObjectName(name) {
  if (!name) return null;
  const prefix = String(name).trim().toLowerCase().split(/[-_\s.]/)[0];
  return SECTION_IDS.has(prefix) ? prefix : null;
}

export function sceneVariablesFor(member) {
  const vars = { rider: member.rider === 'ski' ? 1 : 0, name: member.name ?? '' };
  for (const s of SECTIONS) vars[`${s.id}_status`] = STATUS_CODE[sectionStatus(member, s.id)];
  return vars;
}

// Only the variables the scene actually declares (setting unknown ones is noisy in the runtime).
export function pickDeclared(vars, declared) {
  return Object.fromEntries(Object.entries(vars).filter(([k]) => Object.prototype.hasOwnProperty.call(declared ?? {}, k)));
}

export function tintsFor(member) {
  return Object.fromEntries(SECTIONS.map((s) => [`${s.id}-tint`, TINT_COLORS[sectionStatus(member, s.id)]]));
}
