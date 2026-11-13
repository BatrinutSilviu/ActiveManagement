// An event's points and how they're shared out between its tasks (see domain/tasks.js), and its impact points.
import express from 'express';
import { db, getPointsRates, tx } from '../db.js';
import { addTask, HIGHLIGHT_KINDS, manualTaskPoints, TASKS } from '../domain/tasks.js';
import { idParam, need } from '../http.js';

export const router = express.Router();

// Points typed by hand instead of worked out from the activity and profit; null = automatic again.
function savePoints(id, b) {
  if (!('points' in b)) return;
  if (b.points === null || b.points === '') return db.prepare('UPDATE events SET points_manual = 0 WHERE id = ?').run(id);
  need(Number(b.points) >= 0, 'Points can’t be negative');
  db.prepare('UPDATE events SET points = ?, points_manual = 1 WHERE id = ?').run(Number(b.points), id);
}

router.put('/events/:id/points', (req, res) => {
  savePoints(idParam(req), req.body);
  res.json({ ok: true });
});

// Type a task's points by hand for this event (null: back to its share of the event's points).
router.put('/events/:id/task-points/:task', (req, res) => {
  need(TASKS.includes(req.params.task), 'Unknown task');
  const e = db.prepare('SELECT task_points FROM events WHERE id = ?').get(idParam(req));
  need(e, 'Event not found');
  const map = manualTaskPoints(e.task_points), v = req.body.points;
  if (v === null || v === '' || v === undefined) delete map[req.params.task];
  else {
    need(Number.isFinite(Number(v)) && Number(v) >= 0, 'Points must be 0 or more');
    map[req.params.task] = Number(v);
  }
  db.prepare('UPDATE events SET task_points = ? WHERE id = ?').run(JSON.stringify(map), idParam(req));
  res.json({ ok: true });
});

// A task this event didn't need: its people come off it and its share goes to the other tasks.
router.post('/events/:id/tasks/:task/skip', (req, res) => {
  need(TASKS.includes(req.params.task), 'Unknown task');
  const e = db.prepare('SELECT skipped_tasks FROM events WHERE id = ?').get(idParam(req));
  need(e, 'Event not found');
  const off = new Set(e.skipped_tasks.split(',').filter(Boolean)).add(req.params.task);
  need(off.size < TASKS.length, 'At least one task has to stay');
  tx(() => {
    db.prepare('DELETE FROM event_tasks WHERE event_id = ? AND task = ?').run(idParam(req), req.params.task);
    db.prepare('UPDATE events SET skipped_tasks = ? WHERE id = ?').run([...off].join(','), idParam(req));
  });
  res.json({ ok: true });
});

// Needed after all.
router.delete('/events/:id/tasks/:task/skip', (req, res) => {
  const e = db.prepare('SELECT skipped_tasks FROM events WHERE id = ?').get(idParam(req));
  need(e, 'Event not found');
  db.prepare('UPDATE events SET skipped_tasks = ? WHERE id = ?')
    .run(e.skipped_tasks.split(',').filter((t) => t && t !== req.params.task).join(','), idParam(req));
  res.json({ ok: true });
});

router.post('/events/:id/tasks', (req, res) => {
  tx(() => addTask(idParam(req), req.body.task, req.body.person_id, !!req.body.free));
  res.json({ ok: true });
});

// Done for free or not.
router.put('/event-tasks/:id', (req, res) => {
  db.prepare('UPDATE event_tasks SET free = ? WHERE id = ?').run(req.body.free ? 1 : 0, idParam(req));
  res.json({ ok: true });
});

router.delete('/event-tasks/:id', (req, res) => {
  db.prepare('DELETE FROM event_tasks WHERE id = ?').run(idParam(req));
  res.json({ ok: true });
});

/* ----------------------------------------------------------------- impact */

// What made an event special (impact points). Points default to Settings' value for the kind.
function readHighlight(b) {
  need(HIGHLIGHT_KINDS.includes(b.kind), 'Choose what was special');
  const partner = b.partner_id ? Number(b.partner_id) : null;
  need(!partner || db.prepare('SELECT 1 FROM partners WHERE id = ?').get(partner), 'Unknown partner');
  const title = String(b.title || '').trim() || (partner ? db.prepare('SELECT name FROM partners WHERE id = ?').get(partner).name : '');
  need(title, 'Say who or what it was');
  const points = b.points === '' || b.points == null ? getPointsRates()[`${b.kind}Points`] : Number(b.points);
  need(Number.isFinite(points) && points >= 0, 'Points must be 0 or more');
  return [b.kind, title, partner, points];
}

router.post('/events/:id/highlights', (req, res) => {
  need(db.prepare('SELECT 1 FROM events WHERE id = ?').get(idParam(req)), 'Event not found');
  db.prepare('INSERT INTO event_highlights (kind, title, partner_id, points, event_id) VALUES (?, ?, ?, ?, ?)').run(...readHighlight(req.body), idParam(req));
  res.json({ ok: true });
});

router.put('/event-highlights/:id', (req, res) => {
  db.prepare('UPDATE event_highlights SET kind = ?, title = ?, partner_id = ?, points = ? WHERE id = ?').run(...readHighlight(req.body), idParam(req));
  res.json({ ok: true });
});

router.delete('/event-highlights/:id', (req, res) => {
  db.prepare('DELETE FROM event_highlights WHERE id = ?').run(idParam(req));
  res.json({ ok: true });
});
