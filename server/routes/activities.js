// The points table (activities) and points earned outside events (contributions).
import express from 'express';
import { db, tx } from '../db.js';
import { recalcClosedMonths } from '../finance.js';
import { httpError, idParam, isDate, need } from '../http.js';

export const router = express.Router({ caseSensitive: true });

router.get('/activities', (req, res) => {
  res.json(db.prepare(`SELECT a.*, et.name AS sport_name,
      (SELECT COUNT(*) FROM events e WHERE e.activity_id = a.id) + (SELECT COUNT(*) FROM contributions c WHERE c.activity_id = a.id) AS uses
    FROM activities a LEFT JOIN event_types et ON et.id = a.sport_id ORDER BY a.sort, a.id`).all());
});

function readActivity(b) {
  need(b.name?.trim(), 'Name is required');
  const num = (v) => (v === '' || v == null ? null : Math.max(0, Number(v)));
  const step = (v) => (num(v) ? num(v) : null); // a step of 0 means no scaling
  return [b.name.trim(), num(b.organizer_points) ?? 0, num(b.organizer_max), num(b.co_points) ?? 0, num(b.co_max),
    b.sport_id ? Number(b.sport_id) : null, step(b.people_step), num(b.people_points), step(b.money_step), num(b.money_points)];
}

router.post('/activities', (req, res) => {
  const sort = db.prepare('SELECT COALESCE(MAX(sort), 0) + 1 AS n FROM activities').get().n;
  try {
    db.prepare(`INSERT INTO activities (name, organizer_points, organizer_max, co_points, co_max, sport_id,
      people_step, people_points, money_step, money_points, sort) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(...readActivity(req.body), sort);
  } catch (e) {
    if (e.status) throw e;
    throw httpError(400, 'An activity with this name already exists');
  }
  res.json({ ok: true });
});

router.put('/activities/:id', (req, res) => {
  // Past events follow the points table: closed months get their real points again.
  tx(() => {
    db.prepare(`UPDATE activities SET name = ?, organizer_points = ?, organizer_max = ?, co_points = ?, co_max = ?, sport_id = ?,
      people_step = ?, people_points = ?, money_step = ?, money_points = ? WHERE id = ?`).run(...readActivity(req.body), idParam(req));
    recalcClosedMonths(req.user.id);
  });
  res.json({ ok: true });
});

router.delete('/activities/:id', (req, res) => {
  tx(() => { db.prepare('DELETE FROM activities WHERE id = ?').run(idParam(req)); recalcClosedMonths(req.user.id); });
  res.json({ ok: true });
});

function readContribution(b) {
  need(b.person_id, 'Choose a person');
  need(isDate(b.date), 'A valid date is required');
  need(Number(b.points) >= 0, 'Points must be 0 or more');
  return [Number(b.person_id), b.activity_id ? Number(b.activity_id) : null, b.date, Number(b.points) || 0, b.note?.trim() || null];
}

router.post('/contributions', (req, res) => {
  db.prepare('INSERT INTO contributions (person_id, activity_id, date, points, note, created_by) VALUES (?, ?, ?, ?, ?, ?)')
    .run(...readContribution(req.body), req.user.id);
  res.json({ ok: true });
});

router.put('/contributions/:id', (req, res) => {
  db.prepare('UPDATE contributions SET person_id = ?, activity_id = ?, date = ?, points = ?, note = ? WHERE id = ?')
    .run(...readContribution(req.body), idParam(req));
  res.json({ ok: true });
});

router.delete('/contributions/:id', (req, res) => {
  db.prepare('DELETE FROM contributions WHERE id = ?').run(idParam(req));
  res.json({ ok: true });
});
