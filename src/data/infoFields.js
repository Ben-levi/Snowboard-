import { t } from '../i18n/he.js';

// Form fields for the trip details (admin) and each person's details.
// adminOnly fields are set from the admin panel; people edit the rest themselves.
const field = (id, type = 'text', extra = {}) => ({ id, type, label: t.fields[id], ...extra });

export const TRIP_FIELDS = [
  field('resort'),
  field('dateFrom', 'date', { half: true }),
  field('dateTo', 'date', { half: true }),
  field('flightOut'),
  field('flightBack'),
  field('lodging'),
  field('meetingPoint'),
  field('emergencyContact'),
  field('notes', 'textarea'),
];

export const MEMBER_FIELDS = [
  field('skiPassFrom', 'date', { half: true }),
  field('skiPassTo', 'date', { half: true }),
  field('skiPassType'),
  field('insuranceCompany', 'text', { half: true }),
  field('insurancePolicy', 'text', { half: true }),
  field('insurancePhone', 'tel'),
  field('rental'),
  field('instructor', 'text', { half: true, adminOnly: true }),
  field('instructorPhone', 'tel', { half: true, adminOnly: true }),
  field('lessons', 'text', { adminOnly: true }),
  field('notes', 'textarea'),
];

export const SELF_FIELDS = MEMBER_FIELDS.filter((f) => !f.adminOnly);
