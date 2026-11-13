// Sports (event types: the sports, and kinds of event that aren't one, like Social) and each sport's fund.
import express from 'express';
import { db, tx } from '../db.js';
import { toBani, toRon } from '../domain/money.js';
import { computeFunds, computeSport, recalcClosedMonths } from '../finance.js';
import { openVouchers } from '../domain/vouchers.js';
import { httpError, idParam, need } from '../http.js';

export const router = express.Router({ caseSensitive: true });

router.get('/event-types', (req, res) => {
  res.json(db.prepare(`
    SELECT et.id, et.name, et.is_sport, et.points_factor, et.default_fee, et.default_venue_fee, COUNT(e.id) AS events FROM event_types et
    LEFT JOIN events e ON e.type_id = et.id GROUP BY et.id ORDER BY et.name`).all()
    .map((t) => ({ ...t, default_fee: toRon(t.default_fee), default_venue_fee: toRon(t.default_venue_fee) })));
});

router.post('/event-types', (req, res) => {
  need(req.body.name?.trim(), 'Name is required');
  try {
    db.prepare('INSERT INTO event_types (name) VALUES (?)').run(req.body.name.trim());
  } catch {
    throw httpError(400, 'This sport already exists');
  }
  res.json({ ok: true });
});

// Name and the default prices new events of this sport start with.
router.put('/event-types/:id', (req, res) => {
  const t = db.prepare('SELECT * FROM event_types WHERE id = ?').get(idParam(req));
  if (!t) throw httpError(404, 'Sport not found');
  const { name = t.name, default_fee = toRon(t.default_fee), default_venue_fee = toRon(t.default_venue_fee), is_sport = t.is_sport,
    points_factor = t.points_factor } = req.body;
  need(Number(points_factor) > 0, 'The points multiplier must be more than 0');
  need(String(name).trim(), 'Name is required');
  need(Number(default_fee) >= 0 && Number(default_venue_fee) >= 0, 'Prices can’t be negative');
  need(Number(default_venue_fee) <= Number(default_fee), 'The venue’s part can’t be more than the full price');
  tx(() => {
    db.prepare('UPDATE event_types SET name = ?, default_fee = ?, default_venue_fee = ?, is_sport = ?, points_factor = ? WHERE id = ?')
      .run(String(name).trim(), toBani(default_fee), toBani(default_venue_fee), is_sport ? 1 : 0, Number(points_factor), idParam(req));
    if (Number(points_factor) !== t.points_factor) recalcClosedMonths(req.user.id);
  });
  res.json({ ok: true });
});

router.delete('/event-types/:id', (req, res) => {
  need(!db.prepare('SELECT 1 FROM events WHERE type_id = ?').get(idParam(req)), 'This sport has events and cannot be deleted');
  db.prepare('DELETE FROM event_types WHERE id = ?').run(idParam(req));
  res.json({ ok: true });
});

/* ------------------------------------------------------------ sport funds */

// Before /sports/:id, which would otherwise take "summary" for an id.
router.get('/sports/summary', (req, res) => {
  const funds = computeFunds();
  const counts = db.prepare(`SELECT type_id, COUNT(*) AS n, SUM(status = 'planned') AS live, MAX(date) AS last
    FROM events WHERE status != 'cancelled' GROUP BY type_id`).all();
  res.json(funds.sports.map((s) => {
    const c = counts.find((x) => x.type_id === s.id);
    return { ...s, totalEvents: c?.n || 0, liveEvents: c?.live || 0, lastEvent: c?.last || null };
  }));
});

router.get('/sports/:id', (req, res) => {
  const r = computeSport(idParam(req));
  if (!r) throw httpError(404, 'Sport not found');
  // Vouchers given but not used yet: the fund will pay for them when they are.
  r.openVouchers = openVouchers('v.sport_id = ?', [idParam(req)]);
  res.json(r);
});
