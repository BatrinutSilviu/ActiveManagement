// An event's optional attendee list, with ticks for who has paid the advance and who has paid in full
// (the money still follows the participant count).
import express from 'express';
import { db, tx } from '../db.js';
import { whoIs } from '../domain/people.js';
import { httpError, idParam, need } from '../http.js';

export const router = express.Router({ caseSensitive: true });

// Add someone to an event's attendee list, by name (linked to People when they're one of us; nobody is added there).
router.post('/events/:id/attendees', (req, res) => {
  need(db.prepare('SELECT 1 FROM events WHERE id = ?').get(idParam(req)), 'Event not found');
  const who = whoIs(req.body);
  try {
    db.prepare('INSERT INTO event_attendees (event_id, person_id, name, paid) VALUES (?, ?, ?, ?)').run(idParam(req), who.person_id, who.name, req.body.paid ? 1 : 0);
  } catch {
    throw httpError(400, 'This person is already on the list');
  }
  res.json({ ok: true });
});

// Either tick: { paid } (in full) and / or { advance_paid }; and / or { dropped }.
router.put('/event-attendees/:id', (req, res) => {
  // Dropped out: { dropped: 'undecided' | 'kept' | 'refunded' }, or null when they're coming after all. Checked
  // before anything is saved.
  const dropping = 'dropped' in req.body, d = req.body.dropped ?? null;
  const row = db.prepare(`SELECT a.synced, a.dropped, e.source FROM event_attendees a
    JOIN events e ON e.id = a.event_id WHERE a.id = ?`).get(idParam(req));
  if (dropping) {
    need(d === null || ['undecided', 'kept', 'refunded'].includes(d), 'Invalid choice');
    // Someone signed up in another app (padel, hikes): that app decides whether they're coming; here we only decide
    // what happens to the money of someone who left its list.
    need(!(row?.synced && row.source) || (d !== null && row.dropped !== null), 'This person signed up in the other app: whether they come is decided there');
  }
  tx(() => {
    for (const k of ['paid', 'advance_paid']) {
      if (k in req.body) db.prepare(`UPDATE event_attendees SET ${k} = ? WHERE id = ?`).run(req.body[k] ? 1 : 0, idParam(req));
    }
    if (dropping) db.prepare('UPDATE event_attendees SET dropped = ? WHERE id = ?').run(d, idParam(req));
  });
  res.json({ ok: true });
});

router.delete('/event-attendees/:id', (req, res) => {
  db.prepare('DELETE FROM event_attendees WHERE id = ?').run(idParam(req));
  res.json({ ok: true });
});
