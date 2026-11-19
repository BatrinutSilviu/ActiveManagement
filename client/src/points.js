// The points table: activities whose organiser points grow with the event's size and money.
import { number } from './format.js';
import { t } from './i18n/index.js';

export const scales = (a) => !!((a.people_step && a.people_points) || (a.money_step && a.money_points));

/** "+1 per 10 people · +1 per 500 RON" for activities whose points grow with the event. */
export function scaleLabel(a) {
  return [a.people_step && a.people_points && t('+{points} per {step} people', { points: number(a.people_points), step: number(a.people_step) }),
    a.money_step && a.money_points && t('+{points} per {step} RON of fees', { points: number(a.money_points), step: number(a.money_step) })].filter(Boolean).join(' · ');
}

/** Points for a role at an event of this size: base, plus the activity's per-people and per-money steps (organiser only). */
export function activityPoints(a, role, participants = 0, fees = 0) {
  if (role !== 'organizer') return a.co_points;
  let p = a.organizer_points;
  if (a.people_step && a.people_points) p += Math.floor(participants / a.people_step) * a.people_points;
  if (a.money_step && a.money_points) p += Math.floor(fees / a.money_step) * a.money_points;
  return a.organizer_max ? Math.min(p, a.organizer_max) : p;
}

// The tasks an event's points are shared between (shares in % are set in Settings).
export const TASKS = ['announce', 'signups', 'fees', 'logistics', 'hosting', 'buying'];
// The labels follow the app's language: each one is translated when it's read.
const TASK_NAMES = {
  announce: 'Announcing the event', signups: 'Managing sign-ups', fees: 'Collecting the fees', logistics: 'Organising logistics',
  hosting: 'Hosting the event', buying: 'Buying items / prizes',
};
export const TASK_LABELS = Object.defineProperties({}, Object.fromEntries(Object.entries(TASK_NAMES)
  .map(([k, v]) => [k, { get: () => t(v), enumerable: true }])));
