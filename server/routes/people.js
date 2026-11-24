// People: the team — founders, and the organisers and members we add. Voucher winners, attendees and people
// given a discount aren't added here: those rows keep a name (see domain/people.js).
import express from 'express';
import { db, tx } from '../db.js';
import { r2, toRon } from '../domain/money.js';
import { IS_MEMBER_SQL } from '../domain/pricing.js';
import { purchaseLines, taskLines } from '../finance.js';
import { ORGANIZER } from '../domain/organizer.js';
import { httpError, idParam, need } from '../http.js';

export const router = express.Router({ caseSensitive: true });

router.get('/people', (req, res) => {
  // Points earned on event tasks (not those done for free).
  const points = new Map();
  for (const l of [...taskLines('t.free = 0'), ...purchaseLines()]) points.set(l.person_id, (points.get(l.person_id) || 0) + l.points);
  res.json(db.prepare(`
    SELECT p.*, ${IS_MEMBER_SQL} AS is_member, (SELECT COUNT(DISTINCT t.event_id) FROM event_tasks t WHERE t.person_id = p.id) AS events,
      (SELECT COALESCE(SUM(h.qty * i.unit_price), 0) FROM stock_holdings h JOIN stock_items i ON i.id = h.item_id
        WHERE h.person_id = p.id) AS stock_value,
      (SELECT json_group_array(pd.discount_id) FROM person_discounts pd WHERE pd.person_id = p.id) AS discount_ids,
      (SELECT COALESCE(SUM(ed.amount), 0) FROM event_discounts ed WHERE ed.person_id = p.id AND ed.member = 0) AS discounts_received,
      (SELECT COUNT(*) FROM event_discounts ed WHERE ed.person_id = p.id AND ed.member = 0) AS discounted_events
    FROM people p ORDER BY p.active DESC, p.is_founder DESC, p.name`).all().map((p) => ({
    ...p, points: r2(points.get(p.id) || 0), stock_value: toRon(p.stock_value), discounts_received: toRon(p.discounts_received), discount_ids: JSON.parse(p.discount_ids),
  })).map((p) => (req.user.role === ORGANIZER
    // An organizer only needs the names (and who's a member, for prices and discounts): not points, stock or money.
    ? { id: p.id, name: p.name, active: p.active, is_founder: p.is_founder, is_premium: p.is_premium, is_member: p.is_member, discount_ids: p.discount_ids }
    : p)));
});

function readPerson(body) {
  need(body.name?.trim(), 'Name is required');
  return [body.name.trim(), body.is_founder ? 1 : 0, body.is_premium ? 1 : 0, body.active === false || body.active === 0 ? 0 : 1];
}

router.post('/people', (req, res) => {
  try {
    const { lastInsertRowid } = db.prepare('INSERT INTO people (name, is_founder, is_premium, active) VALUES (?, ?, ?, ?)').run(...readPerson(req.body));
    res.json({ id: Number(lastInsertRowid) });
  } catch (e) {
    if (e.status) throw e;
    throw httpError(400, 'A person with this name already exists');
  }
});

router.put('/people/:id', (req, res) => {
  const row = readPerson(req.body);
  try {
    tx(() => {
      db.prepare('UPDATE people SET name = ?, is_founder = ?, is_premium = ?, active = ? WHERE id = ?').run(...row, idParam(req));
      // The names kept on their vouchers, attendances and discounts follow (they stay if the person is deleted).
      for (const t of ['vouchers', 'event_attendees', 'event_discounts']) db.prepare(`UPDATE ${t} SET name = ? WHERE person_id = ?`).run(row[0], idParam(req));
    });
  } catch (e) {
    if (e.status) throw e;
    throw httpError(400, 'A person with this name already exists');
  }
  res.json({ ok: true });
});

router.delete('/people/:id', (req, res) => {
  need(!db.prepare('SELECT 1 FROM stock_holdings WHERE person_id = ? AND qty > 0').get(idParam(req)),
    'This person still holds stock — move it to someone else first');
  need(!db.prepare("SELECT 1 FROM equipment WHERE person_id = ? AND state != 'lost'").get(idParam(req)),
    'This person still has equipment — give it to someone else first');
  need(!db.prepare('SELECT 1 FROM stock_purchases WHERE person_id = ?').get(idParam(req)),
    'This person bought stock — mark them inactive instead, so their points history is kept');
  need(!db.prepare('SELECT 1 FROM event_tasks WHERE person_id = ?').get(idParam(req)),
    'This person has organized events — mark them inactive instead, so their points history is kept');
  // Their vouchers, attendances and discounts stay, under their name.
  db.prepare('DELETE FROM people WHERE id = ?').run(idParam(req));
  res.json({ ok: true });
});

// Replace the set of discounts a person is entitled to.
router.put('/people/:id/discounts', (req, res) => {
  const ids = (req.body.discount_ids || []).map(Number).filter(Boolean);
  tx(() => {
    db.prepare('DELETE FROM person_discounts WHERE person_id = ?').run(idParam(req));
    const ins = db.prepare('INSERT INTO person_discounts (person_id, discount_id) VALUES (?, ?)');
    for (const d of ids) ins.run(idParam(req), d);
  });
  res.json({ ok: true });
});
