// What a parent / tutor sees (practices): their own children's sessions, packages, invoices and history, read only.
// checkRole (auth.js) lets a parent account reach nothing but these routes; each one checks the child is theirs.
// Only what's meant for the family goes out: no notes, no "keep in mind", no diagnoses, no internal fields.
import express from 'express';
import { db } from '../db.js';
import { httpError, idParam } from '../http.js';
import { PARENT } from '../auth.js';
import { loadAppointments, loadHistory, loadInvoices, loadPackages, sendSessionsPdf } from './practice.js';

export const router = express.Router({ caseSensitive: true });

// Only parent accounts use these (an admin looks at the patient's own page).
router.use('/parent', (req, res, next) => (req.user.role === PARENT ? next() : next(httpError(403, 'Only for parent accounts'))));

const children = (userId) => db.prepare(`SELECT c.id, c.name, c.birth_date FROM parent_clients pc JOIN clients c ON c.id = pc.client_id
  WHERE pc.user_id = ? ORDER BY c.name`).all(userId);

/** The child, when it's one of this parent's; otherwise as if it didn't exist. */
function childOf(req) {
  const child = db.prepare(`SELECT c.id, c.name, c.birth_date, c.address FROM parent_clients pc JOIN clients c ON c.id = pc.client_id
    WHERE pc.user_id = ? AND pc.client_id = ?`).get(req.user.id, idParam(req));
  if (!child) throw httpError(404, 'Not found');
  return child;
}

router.get('/parent/children', (req, res) => res.json(children(req.user.id)));

router.get('/parent/children/:id', (req, res) => {
  const { id, name, birth_date } = childOf(req);
  res.json({
    id, name, birth_date,
    sessions: loadAppointments('WHERE a.client_id = ?', [id], 'ORDER BY a.date DESC, a.start_time DESC').map((a) => ({
      id: a.id, date: a.date, start_time: a.start_time, end_time: a.end_time, status: a.status, service: a.type_name,
      color: a.type_color, therapist: a.therapist, venue: a.venue, location: a.location, package: a.package_name,
    })),
    packages: loadPackages('WHERE p.client_id = ?', [id]).map((p) => ({
      id: p.id, name: p.name, date: p.date, sessions: p.sessions, done: p.used + (p.before || 0), booked: p.booked, left: p.left,
      amount: p.amount, paid: !!p.invoice_paid,
    })),
    invoices: loadInvoices('WHERE i.client_id = ?', [id]).map((i) => ({
      id: i.id, kind: i.kind, number: i.number, date: i.date, amount: i.amount, paid: !!i.paid,
    })),
    history: loadHistory(id).map((h) => ({ id: h.id, kind: h.kind, service_name: h.service_name, hours: h.hours, dates: h.dates, duration: h.duration })),
  });
});

router.get('/parent/children/:id/sessions.pdf', (req, res) => {
  const child = childOf(req);
  sendSessionsPdf(res, child.id, req.query);
});
