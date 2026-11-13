// Partners (clubs, shops, sponsors…) and the prizes they give at our events.
import express from 'express';
import { db, tx } from '../db.js';
import { toBani, toRon } from '../domain/money.js';
import { httpError, idParam, isDate, need, today } from '../http.js';

export const router = express.Router({ caseSensitive: true });

// Partners and the prizes they give at our events: a record only — none of it is money of ours, so it
// never counts in an event's profit, a fund or a payout. `value` is an estimate, shown for information.

router.get('/partners', (req, res) => {
  res.json(db.prepare(`
    SELECT pa.*, et.name AS sport_name, COUNT(pp.id) AS prizes, COALESCE(SUM(pp.qty), 0) AS items,
      COALESCE(SUM(pp.value), 0) AS value, MAX(pp.date) AS last_date, COUNT(DISTINCT pp.event_id) AS events
    FROM partners pa LEFT JOIN event_types et ON et.id = pa.sport_id LEFT JOIN partner_prizes pp ON pp.partner_id = pa.id
    GROUP BY pa.id ORDER BY pa.active DESC, pa.name`).all().map((p) => ({ ...p, value: toRon(p.value) })));
});

function readPartner(b) {
  need(b.name?.trim(), 'Name is required');
  return [b.name.trim(), b.sport_id ? Number(b.sport_id) : null, b.contact?.trim() || null, b.notes?.trim() || null, b.active === false || b.active === 0 ? 0 : 1];
}
const uniquePartner = (fn) => {
  try { return fn(); } catch (e) { if (e.status) throw e; throw httpError(400, 'A partner with this name already exists'); }
};

router.post('/partners', (req, res) => {
  const id = uniquePartner(() => Number(db.prepare('INSERT INTO partners (name, sport_id, contact, notes, active) VALUES (?, ?, ?, ?, ?)')
    .run(...readPartner(req.body)).lastInsertRowid));
  res.json({ id });
});

router.put('/partners/:id', (req, res) => {
  uniquePartner(() => db.prepare('UPDATE partners SET name = ?, sport_id = ?, contact = ?, notes = ?, active = ? WHERE id = ?')
    .run(...readPartner(req.body), idParam(req)));
  res.json({ ok: true });
});

router.delete('/partners/:id', (req, res) => {
  need(!db.prepare('SELECT 1 FROM partner_prizes WHERE partner_id = ?').get(idParam(req)),
    'This partner has prizes recorded — mark them inactive instead, so that history is kept');
  db.prepare('DELETE FROM partners WHERE id = ?').run(idParam(req));
  res.json({ ok: true });
});

const PRIZE_SQL = `
  SELECT pp.*, pa.name AS partner_name, e.name AS event_name, e.date AS event_date, et.name AS sport_name,
    COALESCE(p.name, pp.winner_name) AS winner
  FROM partner_prizes pp JOIN partners pa ON pa.id = pp.partner_id LEFT JOIN events e ON e.id = pp.event_id
  LEFT JOIN event_types et ON et.id = e.type_id LEFT JOIN people p ON p.id = pp.person_id`;

router.get('/partner-prizes', (req, res) => {
  const where = [], params = [];
  if (req.query.event_id) { where.push('pp.event_id = ?'); params.push(Number(req.query.event_id)); }
  if (req.query.partner_id) { where.push('pp.partner_id = ?'); params.push(Number(req.query.partner_id)); }
  res.json(db.prepare(`${PRIZE_SQL} ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY pp.date DESC, pp.id DESC`)
    .all(...params).map((p) => ({ ...p, value: p.value == null ? null : toRon(p.value) })));
});

// A prize given by a partner. `partner_name` instead of `partner_id` adds a new partner on the way.
function readPrize(b) {
  let partnerId = Number(b.partner_id) || null;
  if (!partnerId && b.partner_name?.trim()) {
    const name = b.partner_name.trim();
    partnerId = db.prepare('SELECT id FROM partners WHERE name = ?').get(name)?.id
      ?? Number(db.prepare('INSERT INTO partners (name) VALUES (?)').run(name).lastInsertRowid);
  }
  need(partnerId && db.prepare('SELECT 1 FROM partners WHERE id = ?').get(partnerId), 'Choose the partner');
  need(b.prize?.trim(), 'Say what the prize was');
  const qty = b.qty === '' || b.qty == null ? 1 : Number(b.qty);
  need(Number.isInteger(qty) && qty > 0, 'The quantity must be a whole number above 0');
  need(b.value === '' || b.value == null || Number(b.value) >= 0, 'The value can’t be negative');
  const event = b.event_id ? db.prepare('SELECT id, date FROM events WHERE id = ?').get(Number(b.event_id)) : null;
  need(!b.event_id || event, 'Event not found');
  const person = b.person_id ? Number(b.person_id) : null;
  need(!person || db.prepare('SELECT 1 FROM people WHERE id = ?').get(person), 'Person not found');
  const date = b.date || event?.date || today();
  need(isDate(date), 'Invalid date');
  return [partnerId, event?.id ?? null, person, person ? null : b.winner_name?.trim() || null, b.prize.trim(), qty,
    b.value === '' || b.value == null ? null : toBani(b.value), date, b.note?.trim() || null];
}

router.post('/partner-prizes', (req, res) => {
  const id = tx(() => Number(db.prepare(`INSERT INTO partner_prizes (partner_id, event_id, person_id, winner_name, prize, qty, value, date, note, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(...readPrize(req.body), req.user.id).lastInsertRowid));
  res.json({ id });
});

router.put('/partner-prizes/:id', (req, res) => {
  tx(() => db.prepare(`UPDATE partner_prizes SET partner_id = ?, event_id = ?, person_id = ?, winner_name = ?, prize = ?, qty = ?, value = ?, date = ?, note = ?
    WHERE id = ?`).run(...readPrize(req.body), idParam(req)));
  res.json({ ok: true });
});

router.delete('/partner-prizes/:id', (req, res) => {
  db.prepare('DELETE FROM partner_prizes WHERE id = ?').run(idParam(req));
  res.json({ ok: true });
});
