// Event tasks. An event is worth `events.points`; each task gets a fixed share of that (set in
// Settings, see getTaskShares) and the people on a task share its points equally. Someone doing a
// task for free (event_tasks.free = 1) gives their points to the community: that money goes to the event's sport fund.
import { db } from '../db/connection.js';
import { getTaskShares } from '../db/settings.js';
import { need } from '../http.js';

export const TASKS = ['announce', 'signups', 'fees', 'logistics', 'hosting', 'buying'];

// What made an event special — its impact points: a collaboration (with a partner), a special guest,
// or another special thing (first edition, charity…). Points default from Settings, editable per line.
export const HIGHLIGHT_KINDS = ['collab', 'guest', 'special'];

/** Tasks whose points were typed by hand for an event (events.task_points, JSON { task: points }). */
export const manualTaskPoints = (json) => { try { return JSON.parse(json || '{}') || {}; } catch { return {}; } };

/** Each task's share (%) for one event: the needed tasks share 100% in proportion to their usual shares. */
export function eventTaskShares(skipped = '', shares = getTaskShares()) {
  const off = new Set(String(skipped || '').split(',').filter(Boolean));
  const kept = TASKS.filter((t) => !off.has(t));
  const total = kept.reduce((a, t) => a + (Number(shares[t]) || 0), 0);
  return Object.fromEntries(TASKS.map((t) => [t, off.has(t) || !total ? 0 : ((Number(shares[t]) || 0) * 100) / total]));
}

/** Puts a person on an event's task. */
export function addTask(eventId, task, personId, free = false) {
  need(TASKS.includes(task), 'Unknown task');
  need(db.prepare('SELECT 1 FROM people WHERE id = ?').get(Number(personId)), 'Choose a person');
  need(!db.prepare('SELECT 1 FROM event_tasks WHERE event_id = ? AND task = ? AND person_id = ?').get(eventId, task, Number(personId)),
    'This person is already on that task');
  db.prepare('INSERT INTO event_tasks (event_id, task, person_id, free) VALUES (?, ?, ?, ?)').run(eventId, task, Number(personId), free ? 1 : 0);
  // Someone did it after all: the task is needed again.
  db.prepare("UPDATE events SET skipped_tasks = TRIM(REPLACE(',' || skipped_tasks || ',', ',' || ? || ',', ','), ',') WHERE id = ?").run(task, eventId);
}
