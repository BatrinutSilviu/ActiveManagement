// Payouts to founders and organisers, month by month, and the monthly review of points they're based on.
import express from 'express';
import { db, tx } from '../db.js';
import { r2, sumBy, toRon } from '../domain/money.js';
import { addAward, applyPayouts, closeMonth, computeCash, computeFounders, reviewMonth } from '../finance.js';
import { isDate, isMonth, need, today } from '../http.js';

export const router = express.Router({ caseSensitive: true });

router.get(['/founders', '/payouts'], (req, res) => {
  const r = computeFounders(isMonth(req.query.month) ? req.query.month : today().slice(0, 7));
  res.json({ ...r, unpaidMonths: computeCash().unpaidMonths });
});

// "Mark as paid", one person at a time: `amounts` is { personId: RON } with what was really sent.
// request_id: the form's random id, so the same submission arriving twice is recorded once.
router.post('/payouts/:month/apply', (req, res) => {
  need(isMonth(req.params.month), 'Invalid month');
  need(!req.body.date || isDate(req.body.date), 'Invalid date');
  const requestId = req.body.request_id == null ? null : String(req.body.request_id);
  need(!requestId || /^[\w-]{8,64}$/.test(requestId), 'Invalid request id');
  const n = tx(() => applyPayouts(req.params.month, req.user.id, { amounts: req.body.amounts, date: req.body.date, requestId }));
  need(n > 0, 'Enter at least one amount paid');
  res.json({ ok: true, people: n });
});

// What's still owed for the month goes to the general community fund instead of the people
// (only to `person_id`'s, when given).
router.post('/payouts/:month/to-fund', (req, res) => {
  need(isMonth(req.params.month), 'Invalid month');
  const personId = req.body?.person_id == null ? null : Number(req.body.person_id);
  need(personId == null || Number.isInteger(personId), 'Invalid person');
  const n = tx(() => applyPayouts(req.params.month, req.user.id, { toFund: true, personId }));
  need(n > 0, 'Nothing is owed for this month');
  res.json({ ok: true, people: n });
});

// An award for the month: cash or a benefit worth `amount` RON, taken off the person's points and payout.
router.post('/payouts/:month/awards', (req, res) => {
  const ym = req.params.month;
  need(isMonth(ym), 'Invalid month');
  const b = req.body || {};
  const personId = Number(b.person_id);
  need(Number.isInteger(personId), 'Pick who gets the award');
  need(b.kind === 'money' || b.kind === 'benefit', 'Pick money or a benefit');
  const description = String(b.description ?? '').trim();
  need(description.length > 0 && description.length <= 200, 'Say what the award is');
  const amount = Number(b.amount);
  need(Number.isFinite(amount) && amount > 0 && amount < 1e7, 'Enter what the award is worth');
  need(!b.date || isDate(b.date), 'Invalid date');
  const id = tx(() => addAward(ym, req.user.id, { personId, kind: b.kind, description, amount, date: b.date }));
  res.json({ ok: true, id });
});

router.delete('/payouts/awards/:id', (req, res) => {
  const n = db.prepare('DELETE FROM payouts WHERE id = ? AND award IS NOT NULL').run(Number(req.params.id)).changes;
  need(n > 0, 'Award not found');
  res.json({ ok: true });
});

// Every payout ever recorded, newest first: one entry per payment (month + day paid), with who got what.
// Each award is an entry of its own.
router.get('/payouts/history', (req, res) => {
  const rows = db.prepare(`SELECT id, month, paid_at, to_fund, person_name, amount, award FROM payouts
    ORDER BY paid_at DESC, month DESC, to_fund, person_name`).all();
  const groups = new Map();
  for (const r of rows) {
    const key = r.award ? `award|${r.id}` : `${r.paid_at}|${r.month}|${r.to_fund}`;
    if (!groups.has(key)) {
      groups.set(key, { key, month: r.month, paidAt: r.paid_at, toFund: !r.award && !!r.to_fund, total: 0, people: [],
        award: r.award ? { description: r.award, kind: r.to_fund ? 'benefit' : 'money' } : null });
    }
    const g = groups.get(key);
    g.people.push({ name: r.person_name, amount: toRon(r.amount) });
    g.total = r2(g.total + toRon(r.amount));
  }
  const list = [...groups.values()];
  res.json({ payments: list, paid: sumBy(list.filter((g) => !g.toFund && !g.award), (g) => g.total),
    toFund: sumBy(list.filter((g) => g.toFund), (g) => g.total), awarded: sumBy(list.filter((g) => g.award), (g) => g.total) });
});

// Undo: forget the payments recorded for the month — only `person`'s, when given. Awards stay (delete them on their own).
router.delete('/payouts/:month', (req, res) => {
  need(isMonth(req.params.month), 'Invalid month');
  const person = req.query.person == null ? null : Number(req.query.person);
  need(person == null || Number.isInteger(person), 'Invalid person');
  if (person == null) db.prepare('DELETE FROM payouts WHERE month = ? AND award IS NULL').run(req.params.month);
  else db.prepare('DELETE FROM payouts WHERE month = ? AND person_id = ? AND award IS NULL').run(req.params.month, person);
  res.json({ ok: true });
});

// Monthly review of points: estimates vs. the real points calculated when the month closed.
router.get('/points-review/:month', (req, res) => {
  need(isMonth(req.params.month), 'Invalid month');
  res.json(reviewMonth(req.params.month));
});

// Calculate (or recalculate) a past month's real points now.
router.post('/points-review/:month', (req, res) => {
  const ym = req.params.month;
  need(isMonth(ym), 'Invalid month');
  need(ym < today().slice(0, 7), 'Real points are calculated once the month is over');
  closeMonth(ym, req.user.id);
  res.json(reviewMonth(ym));
});
