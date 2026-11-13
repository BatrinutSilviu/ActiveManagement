// Settings: the profit split (default and per month), the starting balance, points rates and task shares.
import express from 'express';
import {
  db, getPointsRates, getSplit, getStartingBalance, getTaskShares, POINTS_RATE_KEYS, setMonthSplit, setPointsRates, setSplit,
  setStartingBalance, setTaskShares, splitResolver, tx,
} from '../db.js';
import { sumBy } from '../domain/money.js';
import { TASKS } from '../domain/tasks.js';
import { recalcClosedMonths } from '../finance.js';
import { isDate, isMonth, need } from '../http.js';

export const router = express.Router({ caseSensitive: true });

/** The profit split's percentages from a form (see getSplit). */
function readSplit(body) {
  const s = { foundersStandard: Number(body.foundersStandard), foundersPoints: Number(body.foundersPoints),
    generalShare: Number(body.generalShare) };
  need(Object.values(s).every((v) => Number.isFinite(v) && v >= 0), 'Percentages must be positive numbers');
  need(s.foundersStandard + s.foundersPoints <= 100, 'Founders + organisers cannot exceed 100%');
  need(s.generalShare <= 100, "General fund share can't exceed 100%");
  return s;
}

router.get('/settings/split', (req, res) => res.json(getSplit()));

router.put('/settings/split', (req, res) => {
  const s = readSplit(req.body);
  setSplit(s);
  res.json(s);
});

router.get('/settings/starting-balance', (req, res) => res.json(getStartingBalance()));

router.put('/settings/starting-balance', (req, res) => {
  const { date = null, general = 0, sports = {} } = req.body;
  need(!date || isDate(date), 'Invalid date');
  const amount = (v) => { need(Number.isFinite(Number(v || 0)), 'Amounts must be numbers'); return Math.round(Number(v || 0) * 100) / 100; };
  const sportAmounts = {};
  for (const [id, v] of Object.entries(sports)) {
    need(db.prepare('SELECT 1 FROM event_types WHERE id = ?').get(Number(id)), 'Unknown sport');
    if (amount(v)) sportAmounts[id] = amount(v);
  }
  const value = { date: date || null, general: amount(general), sports: sportAmounts };
  setStartingBalance(value);
  res.json(value);
});

router.get('/settings/points-rates', (req, res) => res.json(getPointsRates()));

router.put('/settings/points-rates', (req, res) => {
  const cur = getPointsRates();
  const rates = Object.fromEntries(POINTS_RATE_KEYS.map((k) => [k, Number(req.body[k] ?? cur[k])]));
  need(Object.values(rates).every((v) => Number.isFinite(v) && v >= 0), 'Rates must be positive numbers');
  tx(() => { setPointsRates(rates); recalcClosedMonths(req.user.id); });
  res.json(rates);
});

router.get('/settings/task-shares', (req, res) => res.json(getTaskShares()));

router.put('/settings/task-shares', (req, res) => {
  const shares = Object.fromEntries(TASKS.map((t) => [t, Number(req.body[t])]));
  need(Object.values(shares).every((v) => Number.isFinite(v) && v >= 0), 'Shares must be positive numbers');
  const total = sumBy(Object.values(shares), (v) => v);
  need(total === 100, `The task shares add up to ${total}% — they must make 100%`);
  setTaskShares(shares);
  res.json(shares);
});

/* ------------------------------------------- split targets for one month */

router.get('/splits/:month', (req, res) => {
  need(isMonth(req.params.month), 'Invalid month');
  res.json({ split: splitResolver()(req.params.month), default: getSplit() });
});

router.put('/splits/:month', (req, res) => {
  need(isMonth(req.params.month), 'Invalid month');
  setMonthSplit(req.params.month, readSplit(req.body));
  res.json({ ok: true });
});

router.delete('/splits/:month', (req, res) => {
  setMonthSplit(req.params.month, null);
  res.json({ ok: true });
});
