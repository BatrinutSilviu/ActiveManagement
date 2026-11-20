// The kilometre log: for each working day, the road from the start address through the day's visits to the finish
// address, and how many km that is (worked out from the map, see domain/routing.js). The visits come from the day's
// sessions (not cancelled), in the order of their start time: a home visit at the patient's address, one at the
// practice at its location's. The therapist can change the list for the day (skip one, add a stop) before saving.
// Saved places (`places`) are the start and finish addresses she uses often, to pick with one tap.
import express from 'express';
import { db } from '../db.js';
import { getBusiness } from '../domain/business.js';
import { drive } from '../domain/routing.js';
import { httpError, idParam, isDate, isMonth, need } from '../http.js';

export const router = express.Router({ caseSensitive: true });

const text = (v, max = 300) => (v == null ? null : String(v).trim().slice(0, max) || null);
const dateParam = (req) => { need(isDate(req.params.date), 'A valid date is required'); return req.params.date; };

/** The day's visits, in order: { label, address, appointment_id }; a visit with no address known has address null. */
function visitsOn(date) {
  const locations = getBusiness()?.locations || [];
  const rows = db.prepare(`SELECT a.id, a.venue, a.location, COALESCE(a.address, c.address) AS home, c.name
    FROM appointments a JOIN clients c ON c.id = a.client_id
    WHERE a.date = ? AND a.status != 'cancelled' ORDER BY a.start_time IS NULL, a.start_time, a.id`).all(date);
  const out = [];
  for (const a of rows) {
    const atPractice = a.venue === 'practice';
    const address = atPractice ? locations.find((l) => l.name === a.location)?.address || null : a.home;
    const label = atPractice ? a.location || 'Practice' : a.name;
    const last = out.at(-1);
    // Back-to-back sessions at the same place are one stop (e.g. two patients at the practice).
    if (last && address && last.address === address) { if (!last.label.split(', ').includes(label)) last.label += `, ${label}`; continue; }
    out.push({ label, address, appointment_id: a.id });
  }
  return out;
}

const parse = (t) => t && {
  ...t, stops: JSON.parse(t.stops || '[]'), legs: t.legs ? JSON.parse(t.legs) : null,
  total: t.km_manual ?? t.km,
};

// A month: every day with a trip saved or with visits, and the km.
router.get('/trips', (req, res) => {
  const month = isMonth(req.query.month) ? req.query.month : new Date().toISOString().slice(0, 7);
  const trips = new Map(db.prepare("SELECT * FROM trips WHERE strftime('%Y-%m', date) = ?").all(month).map((t) => [t.date, parse(t)]));
  const visits = new Map(db.prepare(`SELECT date, COUNT(*) AS n, SUM(venue = 'home') AS home FROM appointments
    WHERE strftime('%Y-%m', date) = ? AND status != 'cancelled' GROUP BY date`).all(month).map((r) => [r.date, r]));
  const days = [...new Set([...trips.keys(), ...visits.keys()])].sort().map((date) => ({
    date, sessions: visits.get(date)?.n ?? 0, home: visits.get(date)?.home ?? 0, trip: trips.get(date) || null,
  }));
  const total = Math.round(days.reduce((s, d) => s + (d.trip?.total ?? 0), 0) * 10) / 10;
  res.json({ month, days, total });
});

// One day: the saved trip (if any), the visits from the sessions, and what to start from for a new one (the start and
// finish of the last day saved before it).
router.get('/trips/:date', (req, res) => {
  const date = dateParam(req);
  const previous = db.prepare('SELECT start_address, end_address FROM trips WHERE date < ? ORDER BY date DESC LIMIT 1').get(date)
    || db.prepare('SELECT start_address, end_address FROM trips ORDER BY date LIMIT 1').get();
  res.json({ date, trip: parse(db.prepare('SELECT * FROM trips WHERE date = ?').get(date)) || null, visits: visitsOn(date), previous: previous || null });
});

function readStops(v) {
  return (Array.isArray(v) ? v : []).slice(0, 40)
    .map((s) => ({ label: text(s?.label, 120), address: text(s?.address) }))
    .filter((s) => s.address);
}

// Works out the km (start → stops → finish) and saves the day. When the map can't find an address the day isn't saved
// and the message says which one.
router.put('/trips/:date', async (req, res) => {
  const date = dateParam(req);
  const start = text(req.body.start_address), end = text(req.body.end_address);
  need(start, 'Write where the day started');
  need(end, 'Write where the day ended');
  const stops = readStops(req.body.stops);
  const manual = req.body.km_manual === '' || req.body.km_manual == null ? null : Number(req.body.km_manual);
  need(manual == null || (Number.isFinite(manual) && manual >= 0 && manual < 5000), 'The km must be a number');
  const route = await drive([start, ...stops.map((s) => s.address), end]);
  db.prepare(`INSERT INTO trips (date, start_address, end_address, stops, km, legs, km_manual, note, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(date) DO UPDATE SET start_address = excluded.start_address, end_address = excluded.end_address, stops = excluded.stops,
      km = excluded.km, legs = excluded.legs, km_manual = excluded.km_manual, note = excluded.note, updated_at = excluded.updated_at`)
    .run(date, start, end, JSON.stringify(stops), route.km, JSON.stringify(route.legs), manual == null ? null : Math.round(manual * 10) / 10,
      text(req.body.note, 1000));
  res.json({ ok: true, ...route });
});

router.delete('/trips/:date', (req, res) => {
  db.prepare('DELETE FROM trips WHERE date = ?').run(dateParam(req));
  res.json({ ok: true });
});

/* ------------------------------------------------------------------------------------------ saved places */

router.get('/places', (req, res) => res.json(db.prepare('SELECT * FROM places ORDER BY name COLLATE NOCASE').all()));

function readPlace(body) {
  const name = text(body.name, 60), address = text(body.address);
  need(name, 'Give the place a name, e.g. Home');
  need(address, 'Write the address');
  return [name, address];
}

router.post('/places', (req, res) => {
  const { lastInsertRowid } = db.prepare('INSERT INTO places (name, address) VALUES (?, ?)').run(...readPlace(req.body));
  res.json({ id: Number(lastInsertRowid) });
});

router.put('/places/:id', (req, res) => {
  const r = db.prepare('UPDATE places SET name = ?, address = ? WHERE id = ?').run(...readPlace(req.body), idParam(req));
  if (!r.changes) throw httpError(404, 'This place no longer exists');
  res.json({ ok: true });
});

router.delete('/places/:id', (req, res) => {
  db.prepare('DELETE FROM places WHERE id = ?').run(idParam(req));
  res.json({ ok: true });
});
