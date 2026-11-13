// Vouchers given as prizes, and using them (see domain/vouchers.js).
import express from 'express';
import { db, tx } from '../db.js';
import { toBani, toRon } from '../domain/money.js';
import { shapeVoucher, syncTrainingVouchers, unuseVoucher, VOUCHER_SQL, voucherCategory, voucherText } from '../domain/vouchers.js';
import { idParam, isDate, need, today } from '../http.js';

export const router = express.Router();

router.get('/vouchers', (req, res) => {
  const where = [], params = [];
  if (req.query.event_id) { where.push('v.event_id = ?'); params.push(Number(req.query.event_id)); }
  if (req.query.used_event_id) { where.push('v.used_event_id = ?'); params.push(Number(req.query.used_event_id)); }
  res.json(db.prepare(`${VOUCHER_SQL} ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY v.used_date IS NOT NULL, v.issued_date DESC, v.id DESC`).all(...params).map(shapeVoucher));
});

// A voucher is worth a fixed value, or a percentage off a training session (b.percent; value then 0).
function readVoucher(b) {
  need(db.prepare('SELECT 1 FROM people WHERE id = ?').get(Number(b.person_id)), 'Choose who won it');
  const percent = b.kind === 'percent' ? Number(b.percent) : null;
  need(percent == null || (percent > 0 && percent <= 100), 'The discount must be between 1 and 100%');
  need(percent != null || Number(b.value) >= 0, 'The value can’t be negative');
  const event = b.event_id ? db.prepare('SELECT id, type_id, date FROM events WHERE id = ?').get(Number(b.event_id)) : null;
  need(!b.event_id || event, 'Event not found');
  const sport = Number(b.sport_id) || event?.type_id || null;
  need(sport, 'Choose the sport whose fund pays for it');
  const issued = b.issued_date || event?.date || today();
  need(isDate(issued) && (!b.expires || isDate(b.expires)), 'Invalid date');
  return [event?.id ?? null, Number(b.person_id), sport, percent == null ? toBani(b.value) : 0, percent,
    b.code?.trim() || null, b.note?.trim() || null, issued, b.expires || null];
}

router.post('/vouchers', (req, res) => {
  const { lastInsertRowid } = db.prepare(`INSERT INTO vouchers (event_id, person_id, sport_id, value, percent, code, note, issued_date, expires, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(...readVoucher(req.body), req.user.id);
  res.json({ id: Number(lastInsertRowid) });
});

router.put('/vouchers/:id', (req, res) => {
  const old = db.prepare('SELECT * FROM vouchers WHERE id = ?').get(idParam(req));
  need(old, 'Voucher not found');
  const row = readVoucher(req.body);
  need(!old.used_date || (old.percent == null) === (row[4] == null), 'Undo its use before changing what kind of voucher it is');
  need(!old.used_event_id || row[2] === old.sport_id && row[1] === old.person_id,
    'It was used at a training — undo that first to change who has it or its sport');
  tx(() => {
    db.prepare(`UPDATE vouchers SET event_id = ?, person_id = ?, sport_id = ?, value = ?, percent = ?, code = ?, note = ?, issued_date = ?, expires = ?
      WHERE id = ?`).run(...row, idParam(req));
    if (old.used_event_id) syncTrainingVouchers(old.used_event_id); // a new percentage changes what it's worth
  });
  res.json({ ok: true });
});

// Used: what we actually paid (body.amount) on body.date — for a % voucher too, its % is only a note of
// what was promised. The cost is spent from the voucher's sport fund (general fund if it isn't a sport).
router.post('/vouchers/:id/use', (req, res) => {
  const [v] = db.prepare(`${VOUCHER_SQL} WHERE v.id = ?`).all(idParam(req));
  need(v, 'Voucher not found');
  need(!v.used_date, 'This voucher is already used');
  const date = req.body.date || today();
  need(isDate(date), 'Invalid date');
  const blank = req.body.amount === '' || req.body.amount == null;
  need(!(blank && v.percent != null), 'Enter what we paid for it');
  const ron = blank ? toRon(v.value) : Number(req.body.amount);
  need(Number.isFinite(ron) && ron >= 0, 'The amount can’t be negative');
  const amount = toBani(ron);
  tx(() => {
    const txId = Number(db.prepare(`INSERT INTO transactions (event_id, kind, category_id, amount, date, description, fund_sport_id, created_by)
      VALUES (NULL, 'expense', ?, ?, ?, ?, ?, ?)`).run(voucherCategory(), amount, date, voucherText(v), v.is_sport ? v.sport_id : null, req.user.id).lastInsertRowid);
    db.prepare('UPDATE vouchers SET used_date = ?, transaction_id = ?, used_event_id = NULL WHERE id = ?').run(date, txId, v.id);
  });
  res.json({ ok: true });
});

router.delete('/vouchers/:id/use', (req, res) => {
  const v = db.prepare('SELECT * FROM vouchers WHERE id = ?').get(idParam(req));
  need(v, 'Voucher not found');
  tx(() => unuseVoucher(v));
  res.json({ ok: true });
});

router.delete('/vouchers/:id', (req, res) => {
  const v = db.prepare('SELECT * FROM vouchers WHERE id = ?').get(idParam(req));
  need(v, 'Voucher not found');
  tx(() => {
    unuseVoucher(v);
    db.prepare('DELETE FROM vouchers WHERE id = ?').run(v.id);
  });
  res.json({ ok: true });
});
