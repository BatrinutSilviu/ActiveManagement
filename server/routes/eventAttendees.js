// An event's optional attendee list, with a tick for who has paid (the money still follows the participant count).
import express from 'express';
import { db, tx } from '../db.js';
import { httpError, idParam, need } from '../http.js';

export const router = express.Router({ caseSensitive: true });

// Add someone to an event's attendee list, by id or by name (a new name creates the person).
router.post('/events/:id/attendees', (req, res) => {
  need(db.prepare('SELECT 1 FROM events WHERE id = ?').get(idParam(req)), 'Event not found');
  tx(() => {
    let personId = Number(req.body.person_id) || null;
    if (!personId) {
      const name = req.body.name?.trim();
      need(name, 'Enter a name');
      personId = db.prepare('SELECT id FROM people WHERE name = ?').get(name)?.id
        ?? Number(db.prepare('INSERT INTO people (name) VALUES (?)').run(name).lastInsertRowid);
    }
    try {
      db.prepare('INSERT INTO event_attendees (event_id, person_id, paid) VALUES (?, ?, ?)').run(idParam(req), personId, req.body.paid ? 1 : 0);
    } catch {
      throw httpError(400, 'This person is already on the list');
    }
  });
  res.json({ ok: true });
});

router.put('/event-attendees/:id', (req, res) => {
  db.prepare('UPDATE event_attendees SET paid = ? WHERE id = ?').run(req.body.paid ? 1 : 0, idParam(req));
  res.json({ ok: true });
});

router.delete('/event-attendees/:id', (req, res) => {
  db.prepare('DELETE FROM event_attendees WHERE id = ?').run(idParam(req));
  res.json({ ok: true });
});
