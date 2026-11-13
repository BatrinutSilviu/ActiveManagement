// Events: the list, one event with everything on its page, and creating, editing and deleting them.
import express from 'express';
import { db, getTaskShares, tx } from '../db.js';
import { r2, toBani, toRon } from '../domain/money.js';
import { IS_MEMBER_SQL, repriceEvent } from '../domain/pricing.js';
import { returnStock } from '../domain/stock.js';
import { addTask, eventTaskShares, manualTaskPoints, TASKS } from '../domain/tasks.js';
import { checkVersion } from '../domain/versions.js';
import { unuseVoucher } from '../domain/vouchers.js';
import { LIVE, loadEvents, taskLines } from '../finance.js';
import { httpError, idParam, isDate, need } from '../http.js';

export const router = express.Router();

/** The fields every event form sends, checked, in the order of the INSERT / UPDATE below. */
function readEvent(body) {
  const { name, type_id, activity_id, date, end_date, location, status = LIVE, participants, participation_fee, venue_fee, budget, notes } = body;
  need(name?.trim(), 'Event name is required');
  need(type_id, 'Sport is required');
  need(isDate(date), 'A valid date is required');
  need(!end_date || (isDate(end_date) && end_date >= date), 'End date must be after the start date');
  need(['planned', 'completed', 'cancelled'].includes(status), 'Invalid status');
  need(toBani(venue_fee) >= 0 && toBani(venue_fee) <= toBani(participation_fee), 'The venue cost per person can’t be more than the price');
  return [name.trim(), Number(type_id), activity_id ? Number(activity_id) : null, date, end_date || null, location?.trim() || null,
    status, Math.max(0, Number(participants) || 0), toBani(participation_fee), toBani(venue_fee), toBani(budget), notes?.trim() || null];
}

router.get('/events', (req, res) => {
  const where = [], params = [];
  if (req.query.year) { where.push("strftime('%Y', e.date) = ?"); params.push(String(req.query.year)); }
  if (req.query.type) { where.push('e.type_id = ?'); params.push(Number(req.query.type)); }
  if (req.query.status) { where.push('e.status = ?'); params.push(String(req.query.status)); }
  if (req.query.q) {
    where.push('(e.name LIKE ? OR e.location LIKE ? OR et.name LIKE ?)');
    const q = `%${req.query.q}%`;
    params.push(q, q, q);
  }
  res.json(loadEvents(where.length ? 'WHERE ' + where.join(' AND ') : '', params, 'ORDER BY e.date DESC'));
});

router.get('/events/:id', (req, res) => {
  const [e] = loadEvents('WHERE e.id = ?', [idParam(req)]);
  if (!e) throw httpError(404, 'Event not found');
  e.tasks = taskLines('t.event_id = ?', [e.id]);
  e.skippedTasks = String(e.skipped_tasks || '').split(',').filter(Boolean);
  e.taskShares = eventTaskShares(e.skipped_tasks);
  e.usualTaskShares = getTaskShares();
  e.taskPoints = manualTaskPoints(e.task_points);
  e.highlights = db.prepare(`SELECT h.*, p.name AS partner_name FROM event_highlights h LEFT JOIN partners p ON p.id = h.partner_id
    WHERE h.event_id = ? ORDER BY h.id`).all(e.id);
  e.discountList = db.prepare(`SELECT ed.*, p.name AS person_name, d.name AS discount_name FROM event_discounts ed
    JOIN people p ON p.id = ed.person_id LEFT JOIN discounts d ON d.id = ed.discount_id WHERE ed.event_id = ? ORDER BY ed.member DESC, p.name`)
    .all(e.id).map((d) => ({ ...d, amount: toRon(d.amount), value: d.kind === 'fixed' ? toRon(d.value) : d.value }));
  e.attendees = db.prepare(`SELECT a.*, p.name, ${IS_MEMBER_SQL} AS is_member FROM event_attendees a
    JOIN people p ON p.id = a.person_id WHERE a.event_id = ? ORDER BY p.name`).all(e.id);
  e.stock = db.prepare(`SELECT s.*, i.name AS item_name, i.unit, i.prepaid, p.name AS person_name FROM event_stock s
    JOIN stock_items i ON i.id = s.item_id LEFT JOIN people p ON p.id = s.person_id WHERE s.event_id = ? ORDER BY s.id`)
    .all(e.id).map((s) => ({ ...s, unit_price: toRon(s.unit_price), cost: s.prepaid ? 0 : r2(s.qty * toRon(s.unit_price)) }));
  res.json(e);
});

// The fields below are saved apart, and only when the form sends them (older forms and other callers don't).

// Two-part price (venue + community) or one total; see events.price_parts.
function savePriceParts(id, b) {
  if (!('price_parts' in b)) return;
  need(!(Number(b.community_fee) < 0), 'The community part can’t be negative');
  db.prepare('UPDATE events SET price_parts = ?, community_fee = ? WHERE id = ?').run(b.price_parts ? 1 : 0, b.price_parts ? toBani(b.community_fee) : 0, id);
}

// Venue paid per participant, or one fixed amount for the event.
function saveVenue(id, b) {
  const mode = b.venue_mode === 'fixed' ? 'fixed' : 'per_person';
  need(!(Number(b.venue_total) < 0), 'The venue cost can’t be negative');
  db.prepare('UPDATE events SET venue_mode = ?, venue_total = ? WHERE id = ?').run(mode, mode === 'fixed' ? toBani(b.venue_total) : 0, id);
}

// A training session: vouchers can be used at it (see vouchers.percent).
function saveTraining(id, b) {
  if (!('training' in b)) return;
  const ev = db.prepare('SELECT * FROM events WHERE id = ?').get(id);
  const used = db.prepare('SELECT COUNT(*) n FROM vouchers WHERE used_event_id = ? AND sport_id <> ?').get(id, ev.type_id).n
    + (b.training ? 0 : db.prepare('SELECT COUNT(*) n FROM vouchers WHERE used_event_id = ?').get(id).n);
  need(!used, 'Vouchers were used at this training — undo them first (they’re listed on the event page)');
  db.prepare('UPDATE events SET training = ? WHERE id = ?').run(b.training ? 1 : 0, id);
}

// When the event starts and ends, "HH:MM" (both optional).
function saveTimes(id, b) {
  if (!('start_time' in b) && !('end_time' in b)) return;
  const t = (v) => (v == null || v === '' ? null : String(v).slice(0, 5));
  const start = t(b.start_time), end = t(b.end_time);
  for (const v of [start, end]) need(v === null || /^([01]\d|2[0-3]):[0-5]\d$/.test(v), 'Use a time like 18:30');
  db.prepare('UPDATE events SET start_time = ?, end_time = ? WHERE id = ?').run(start, end, id);
}

router.post('/events', (req, res) => {
  const id = tx(() => {
    const id = Number(db.prepare(`
      INSERT INTO events (name, type_id, activity_id, date, end_date, location, status, participants, participation_fee, venue_fee, budget, notes, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(...readEvent(req.body), req.user.id).lastInsertRowid);
    saveVenue(id, req.body);
    savePriceParts(id, req.body);
    saveTraining(id, req.body);
    saveTimes(id, req.body);
    // A copy of another event: same skipped tasks, and optionally its own cost / income lines, dated on the new day.
    const src = req.body.copy_from ? db.prepare('SELECT * FROM events WHERE id = ?').get(Number(req.body.copy_from)) : null;
    if (req.body.copy_from) need(src, 'The event to copy no longer exists');
    if (src) {
      db.prepare('UPDATE events SET skipped_tasks = ? WHERE id = ?').run(src.skipped_tasks || '', id);
      if (req.body.copy_costs) {
        const date = db.prepare('SELECT date FROM events WHERE id = ?').get(id).date;
        db.prepare(`INSERT INTO transactions (event_id, kind, category_id, amount, date, description, payment_method, created_by)
          SELECT ?, kind, category_id, amount, ?, description, payment_method, ? FROM transactions
          WHERE event_id = ? AND fund_sport_id IS NULL AND fund_part_id IS NULL ORDER BY id`).run(id, date, req.user.id, src.id);
      }
    }
    // One organiser doing everything: put them on every task (change it on the event page).
    if (req.body.lead_id) for (const t of TASKS) addTask(id, t, req.body.lead_id);
    return id;
  });
  res.json({ id });
});

router.put('/events/:id', (req, res) => {
  tx(() => {
    checkVersion('events', idParam(req), req.body, 'event');
    db.prepare(`
      UPDATE events SET name = ?, type_id = ?, activity_id = ?, date = ?, end_date = ?, location = ?, status = ?, participants = ?,
        participation_fee = ?, venue_fee = ?, budget = ?, notes = ? WHERE id = ?`).run(...readEvent(req.body), idParam(req));
    if ('venue_mode' in req.body) saveVenue(idParam(req), req.body);
    savePriceParts(idParam(req), req.body);
    saveTraining(idParam(req), req.body);
    saveTimes(idParam(req), req.body);
    repriceEvent(idParam(req));
  });
  res.json({ ok: true });
});

router.put('/events/:id/status', (req, res) => {
  need(['planned', 'completed', 'cancelled'].includes(req.body.status), 'Invalid status');
  db.prepare('UPDATE events SET status = ? WHERE id = ?').run(req.body.status, idParam(req));
  res.json({ ok: true });
});

// Deleting an event gives its used stock back to whoever it was taken from.
router.delete('/events/:id', (req, res) => {
  tx(() => {
    for (const s of db.prepare('SELECT * FROM event_stock WHERE event_id = ?').all(idParam(req))) returnStock(s);
    // Vouchers used at it become unused again, and their cost leaves the fund.
    for (const v of db.prepare('SELECT * FROM vouchers WHERE used_event_id = ?').all(idParam(req))) unuseVoucher(v);
    db.prepare('DELETE FROM events WHERE id = ?').run(idParam(req));
  });
  res.json({ ok: true });
});
