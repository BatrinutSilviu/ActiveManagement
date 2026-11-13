// Settings kept as JSON in the `settings` table (one row per key), each with the defaults it starts from:
// what a stored value doesn't set falls back to its default, so new fields need no migration.
import { db } from './connection.js';

function readSetting(key, defaults) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return { ...defaults, ...(row ? JSON.parse(row.value) : {}) };
}

function writeSetting(key, value) {
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .run(key, JSON.stringify(value));
}

/* ----------------------------------------------------------- points rates */

// Stock purchases earn the buyer points per so many RON spent, at a rate for each kind of purchase.
// An event's points have four parts, each with its own weight (×): time (points table), participants
// (points per so many people, in full only when the event made at least `peopleProfit` RON per person), profit (points per so many RON, scaled to the month's profit on the 1st)
// and impact (what was special: a collaboration, a special guest…, see event_highlights).
const DEFAULT_POINTS_RATES = { moneyStep: 100, moneyPoints: 1,
  itemsStep: 200, itemsPoints: 1, merchStep: 100, merchPoints: 1,
  peopleStep: 10, peoplePoints: 1, peopleProfit: 20, collabPoints: 3, guestPoints: 3, specialPoints: 3,
  wTime: 1, wPeople: 1, wProfit: 1, wImpact: 1 };
export const POINTS_RATE_KEYS = Object.keys(DEFAULT_POINTS_RATES);
export const getPointsRates = () => readSetting('points_rates', DEFAULT_POINTS_RATES);
export const setPointsRates = (rates) => writeSetting('points_rates', rates);

/* ------------------------------------------------------------ task shares */

// Share of an event's points for each task, in %; they add up to 100.
const DEFAULT_TASK_SHARES = { announce: 13.5, signups: 13.5, fees: 13.5, logistics: 10, hosting: 36, buying: 13.5 };
export const getTaskShares = () => readSetting('task_shares', DEFAULT_TASK_SHARES);
export const setTaskShares = (shares) => writeSetting('task_shares', shares);

/* ------------------------------------------------------- starting balance */

// What the community had when it started (before the first event in the app): an amount for the
// general fund and optionally for sport funds. It counts in the fund balances and money in hand,
// never in a month's profit or payouts. Amounts in RON: { date, general, sports: { [sportId]: amount } }.
export const getStartingBalance = () => readSetting('starting_balance', { date: null, general: 0, sports: {} });
export const setStartingBalance = (v) => writeSetting('starting_balance', v);

/* ----------------------------------------------------------- profit split */

// Percentages of profit: founders get `foundersStandard`% split equally, organisers get
// `foundersPoints`% shared by points, and the rest is reinvested in the community — of which
// `generalShare`% goes to the general fund and the remainder to the event's sport fund.
// (Field names kept from the first version; in the UI they are "Founders" and "Organisers".)
const DEFAULT_SPLIT = { foundersStandard: 20, foundersPoints: 30, generalShare: 100 / 3 };
export const getSplit = () => readSetting('split', DEFAULT_SPLIT);
export const setSplit = (split) => writeSetting('split', split);

/** Returns a function month (YYYY-MM) -> split, using month targets where set. */
export function splitResolver() {
  const base = getSplit();
  const overrides = new Map(db.prepare('SELECT month, value FROM month_splits').all()
    .map((r) => [r.month, { ...base, ...JSON.parse(r.value), custom: true }]));
  return (ym) => overrides.get(ym) || base;
}

/** Sets a month's own split targets; null goes back to the default split. */
export function setMonthSplit(ym, split) {
  if (!split) return db.prepare('DELETE FROM month_splits WHERE month = ?').run(ym);
  db.prepare('INSERT INTO month_splits (month, value) VALUES (?, ?) ON CONFLICT(month) DO UPDATE SET value = excluded.value')
    .run(ym, JSON.stringify(split));
}
