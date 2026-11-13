// Payouts to founders and organisers, month by month, and the monthly review of points they're based on.
import express from 'express';
import { db, tx } from '../db.js';
import { r2, sumBy, toRon } from '../domain/money.js';
import { applyPayouts, closeMonth, computeCash, computeFounders, reviewMonth } from '../finance.js';
import { isDate, isMonth, need, today } from '../http.js';

export const router = express.Router({ caseSensitive: true });

router.get(['/founders', '/payouts'], (req, res) => {
  const r = computeFounders(isMonth(req.query.month) ? req.query.month : today().slice(0, 7));
  res.json({ ...r, unpaidMonths: computeCash().unpaidMonths });
});

// "Mark as paid": records what each person is owed for the month (only the difference if paid before).
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

// What's still owed for the month goes to the general community fund instead of the people.
router.post('/payouts/:month/to-fund', (req, res) => {
  need(isMonth(req.params.month), 'Invalid month');
  const n = tx(() => applyPayouts(req.params.month, req.user.id, { toFund: true }));
  need(n > 0, 'Nothing is owed for this month');
  res.json({ ok: true, people: n });
});

// Every payout ever recorded, newest first: one entry per payment (month + day paid), with who got what.
router.get('/payouts/history', (req, res) => {
  const rows = db.prepare(`SELECT month, paid_at, to_fund, person_name, amount FROM payouts
    ORDER BY paid_at DESC, month DESC, to_fund, person_name`).all();
  const groups = new Map();
  for (const r of rows) {
    const key = `${r.paid_at}|${r.month}|${r.to_fund}`;
    if (!groups.has(key)) groups.set(key, { month: r.month, paidAt: r.paid_at, toFund: !!r.to_fund, total: 0, people: [] });
    const g = groups.get(key);
    g.people.push({ name: r.person_name, amount: toRon(r.amount) });
    g.total = r2(g.total + toRon(r.amount));
  }
  const list = [...groups.values()];
  res.json({ payments: list, paid: sumBy(list.filter((g) => !g.toFund), (g) => g.total),
    toFund: sumBy(list.filter((g) => g.toFund), (g) => g.total) });
});

// Undo: forget every payout recorded for the month.
router.delete('/payouts/:month', (req, res) => {
  need(isMonth(req.params.month), 'Invalid month');
  db.prepare('DELETE FROM payouts WHERE month = ?').run(req.params.month);
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
