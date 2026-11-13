// Reusable discounts, and the reduced prices (member price, free entry, discounts) given to people at an event.
import express from 'express';
import { db, tx } from '../db.js';
import { toBani, toRon } from '../domain/money.js';
import { discountAmount, IS_MEMBER_SQL, memberReduction } from '../domain/pricing.js';
import { syncTrainingVouchers } from '../domain/vouchers.js';
import { httpError, idParam, need } from '../http.js';

export const router = express.Router({ caseSensitive: true });

const shapeDiscount = (d) => ({ ...d, value: d.kind === 'fixed' ? toRon(d.value) : d.value });

router.get('/discounts', (req, res) => {
  res.json(db.prepare(`
    SELECT d.*, et.name AS sport_name,
      (SELECT json_group_array(json_object('id', p.id, 'name', p.name)) FROM person_discounts pd
        JOIN people p ON p.id = pd.person_id WHERE pd.discount_id = d.id) AS people,
      (SELECT COUNT(*) FROM event_discounts ed WHERE ed.discount_id = d.id) AS uses
    FROM discounts d LEFT JOIN event_types et ON et.id = d.sport_id ORDER BY d.name`).all()
    .map((d) => shapeDiscount({ ...d, people: JSON.parse(d.people) })));
});

function readDiscount(b) {
  need(b.name?.trim(), 'Name is required');
  need(['percent', 'fixed'].includes(b.kind), 'Choose a percentage or a fixed amount');
  const v = Number(b.value);
  need(Number.isFinite(v) && v > 0, 'The discount must be greater than 0');
  need(b.kind !== 'percent' || v <= 100, 'A percentage discount can be at most 100%');
  return [b.name.trim(), b.kind, b.kind === 'fixed' ? toBani(v) : v, b.sport_id ? Number(b.sport_id) : null];
}

router.post('/discounts', (req, res) => {
  try {
    const { lastInsertRowid } = db.prepare('INSERT INTO discounts (name, kind, value, sport_id) VALUES (?, ?, ?, ?)').run(...readDiscount(req.body));
    res.json({ id: Number(lastInsertRowid) });
  } catch (e) {
    if (e.status) throw e;
    throw httpError(400, 'A discount with this name already exists');
  }
});

// Editing a discount only affects events it is added to from now on.
router.put('/discounts/:id', (req, res) => {
  db.prepare('UPDATE discounts SET name = ?, kind = ?, value = ?, sport_id = ? WHERE id = ?').run(...readDiscount(req.body), idParam(req));
  res.json({ ok: true });
});

router.delete('/discounts/:id', (req, res) => {
  db.prepare('DELETE FROM discounts WHERE id = ?').run(idParam(req));
  res.json({ ok: true });
});

// Give a person a discount at an event: the member price, free entry (e.g. a founder or organiser —
// either not counted at all, or with the fee paid by us),
// one of their saved discounts, or a one-off amount.
router.post('/events/:id/discounts', (req, res) => {
  const ev = db.prepare('SELECT * FROM events WHERE id = ?').get(idParam(req));
  if (!ev) throw httpError(404, 'Event not found');
  const { person_id, discount_id, amount, note, free, waive } = req.body;
  // waive: anyone can be let off the community part — they pay only the venue's part, like a member.
  const member = req.body.member || waive;
  need(person_id, 'Choose a person');
  let kind, value;
  if (member) {
    need(ev.venue_fee > 0, 'Set the venue cost per person on this event first — members pay only that');
    need(waive || db.prepare(`SELECT 1 FROM people p WHERE p.id = ? AND ${IS_MEMBER_SQL}`).get(Number(person_id)),
      'Only founders, premium people and organisers get the member price');
    kind = 'fixed';
    value = memberReduction(ev.participation_fee, ev.venue_fee);
  } else if (free) {
    need(['skip', 'paid'].includes(free), 'Choose which kind of free entry');
    kind = 'percent'; // 100% stays free if the price changes
    value = 100;
  } else if (discount_id) {
    const d = db.prepare('SELECT * FROM discounts WHERE id = ?').get(discount_id);
    need(d, 'Discount not found');
    ({ kind, value } = d);
  } else {
    need(Number(amount) > 0, 'Enter the discount amount');
    kind = 'fixed';
    value = toBani(amount);
  }
  const given = db.prepare('SELECT COUNT(*) n FROM event_discounts WHERE event_id = ?').get(ev.id).n;
  need(!ev.participants || given < ev.participants, `All ${ev.participants} participants already have a discount — raise the number of people first`);
  tx(() => {
    try {
      db.prepare(`INSERT INTO event_discounts (event_id, person_id, discount_id, kind, value, amount, note, member, free) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(ev.id, Number(person_id), !member && !free && discount_id ? Number(discount_id) : null, kind, value,
          discountAmount(kind, value, ev.participation_fee), note?.trim() || (waive ? 'No community part' : null), member ? 1 : 0, !member && free ? free : null);
    } catch (e) {
      if (e.status) throw e;
      throw httpError(400, 'This person already pays a reduced price at this event');
    }
    syncTrainingVouchers(ev.id); // a voucher used here is a % of what's left to pay
  });
  res.json({ ok: true });
});

router.delete('/event-discounts/:id', (req, res) => {
  tx(() => {
    const d = db.prepare('SELECT event_id FROM event_discounts WHERE id = ?').get(idParam(req));
    db.prepare('DELETE FROM event_discounts WHERE id = ?').run(idParam(req));
    if (d) syncTrainingVouchers(d.event_id);
  });
  res.json({ ok: true });
});
