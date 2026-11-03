// The points table: activities whose organiser points grow with the event's size and money.
import { number } from './format.js';

export const scales = (a) => !!((a.people_step && a.people_points) || (a.money_step && a.money_points));

/** "+1 per 10 people · +1 per 500 RON" for activities whose points grow with the event. */
export function scaleLabel(a) {
  return [a.people_step && a.people_points && `+${number(a.people_points)} per ${number(a.people_step)} people`,
    a.money_step && a.money_points && `+${number(a.money_points)} per ${number(a.money_step)} RON of fees`].filter(Boolean).join(' · ');
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
export const TASKS = ['announce', 'signups', 'fees', 'hosting', 'buying'];
export const TASK_LABELS = {
  announce: 'Announcing the event', signups: 'Managing sign-ups', fees: 'Collecting the fees',
  hosting: 'Hosting the event', buying: 'Buying items / prizes',
};
