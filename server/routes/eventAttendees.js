// An event's optional attendee list, with ticks for who has paid the advance and who has paid in full
// (the money still follows the participant count).
import express from 'express';
import { db, tx } from '../db.js';
import { whoIs } from '../domain/people.js';
import { droppedState } from '../domain/eventSync.js';
import { httpError, idParam, localDay, need } from '../http.js';

export const router = express.Router({ caseSensitive: true });

// Add someone to an event's attendee list, by name (linked to People when they're one of us; nobody is added there).
// { dropped: true } adds someone who dropped out (e.g. cancelled by phone), with what they'd paid ({ paid } in full or
// { advance_paid }): having paid, keeping or refunding it is decided after; having paid nothing, there's nothing to keep.
router.post('/events/:id/attendees', (req, res) => {
  need(db.prepare('SELECT 1 FROM events WHERE id = ?').get(idParam(req)), 'Event not found');
  const who = whoIs(req.body);
  const paid = req.body.paid ? 1 : 0, advancePaid = !paid && req.body.advance_paid ? 1 : 0;
  const dropped = req.body.dropped ? droppedState({ paid, advance_paid: advancePaid }) : null;
  try {
    db.prepare('INSERT INTO event_attendees (event_id, person_id, name, paid, advance_paid, dropped, dropped_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(idParam(req), who.person_id, who.name, paid, advancePaid, dropped, dropped && localDay());
  } catch {
    throw httpError(400, 'This person is already on the list');
  }
  res.json({ ok: true });
});

// Either tick: { paid } (in full) and / or { advance_paid }; and / or { dropped }.
router.put('/event-attendees/:id', (req, res) => {
  // Dropped out: { dropped: 'undecided' | 'kept' | 'refunded' }, true (from what they paid: see droppedState), or
  // null when they're coming after all. Checked before anything is saved.
  const dropping = 'dropped' in req.body;
  const row = db.prepare(`SELECT a.synced, a.dropped, a.paid, a.advance_paid, e.source FROM event_attendees a
    JOIN events e ON e.id = a.event_id WHERE a.id = ?`).get(idParam(req));
  // true only drops someone still coming (a money decision already made isn't reset), from the ticks after this request.
  const ticks = { paid: 'paid' in req.body ? req.body.paid : row?.paid, advance_paid: 'advance_paid' in req.body ? req.body.advance_paid : row?.advance_paid };
  const d = req.body.dropped === true && row && row.dropped === null ? droppedState(ticks) : req.body.dropped ?? null;
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
    // The day they dropped out: set when they drop out, kept when only the money decision changes (also on rows
    // dropped before the day was noted); cleared when they're coming after all.
    if (dropping && d === null) db.prepare('UPDATE event_attendees SET dropped = NULL, dropped_at = NULL, drop_note = NULL WHERE id = ?').run(idParam(req));
    else if (dropping) db.prepare('UPDATE event_attendees SET dropped = ?, dropped_at = CASE WHEN dropped IS NULL THEN ? ELSE dropped_at END WHERE id = ?').run(d, localDay(), idParam(req));
  });
  res.json({ ok: true });
});

router.delete('/event-attendees/:id', (req, res) => {
  db.prepare('DELETE FROM event_attendees WHERE id = ?').run(idParam(req));
  res.json({ ok: true });
});
