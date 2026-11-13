// Vouchers we give as prizes (e.g. padel court time won at a padel event) and the winner uses later.
// Giving one costs nothing yet; when it's used, what we pay the venue is recorded as money spent from the
// sport's fund (a transaction, linked to the voucher), on the day it's used.
import { db } from '../db/connection.js';
import { today } from '../http.js';
import { toRon } from './money.js';

export const VOUCHER_SQL = `
  SELECT v.*, p.name AS person_name, e.name AS event_name, e.date AS event_date, et.name AS sport_name, et.is_sport,
    t.amount AS cost, ue.name AS used_event_name
  FROM vouchers v JOIN people p ON p.id = v.person_id LEFT JOIN events e ON e.id = v.event_id
  LEFT JOIN event_types et ON et.id = v.sport_id LEFT JOIN transactions t ON t.id = v.transaction_id
  LEFT JOIN events ue ON ue.id = v.used_event_id`;

export const shapeVoucher = (v) => ({ ...v, value: toRon(v.value), cost: v.cost == null ? null : toRon(v.cost),
  status: v.used_date ? 'used' : v.expires && v.expires < today() ? 'expired' : 'open' });

/** The expense category a used voucher's cost is booked under (created the first time it's needed). */
export const voucherCategory = () => db.prepare("SELECT id FROM categories WHERE name = 'Vouchers used' AND kind = 'expense'").get()?.id
  ?? Number(db.prepare("INSERT INTO categories (name, kind, cost_group) VALUES ('Vouchers used', 'expense', 'benefit')").run().lastInsertRowid);

/** The description of a used voucher's transaction. */
export const voucherText = (v) => `Voucher${v.code ? ` ${v.code}` : ''}${v.percent != null ? ` −${v.percent}%` : ''} used by ${v.person_name}`
  + `${v.event_name ? ` (won at ${v.event_name})` : ''}`;

/** What a percentage voucher is worth at a training: its % of what that person pays there (price − their discount). */
function trainingVoucherAmount(v, ev) {
  const d = db.prepare('SELECT amount FROM event_discounts WHERE event_id = ? AND person_id = ?').get(ev.id, v.person_id);
  return Math.round((Math.max(ev.participation_fee - (d?.amount || 0), 0) * v.percent) / 100);
}

/** Keeps the vouchers used at a training in line with it: amount (price, discounts, %) and date. */
export function syncTrainingVouchers(eventId) {
  const ev = db.prepare('SELECT * FROM events WHERE id = ?').get(eventId);
  if (!ev) return;
  for (const v of db.prepare('SELECT * FROM vouchers WHERE used_event_id = ? AND percent IS NOT NULL').all(eventId)) {
    db.prepare('UPDATE transactions SET amount = ?, date = ? WHERE id = ?').run(trainingVoucherAmount(v, ev), ev.date, v.transaction_id);
    db.prepare('UPDATE vouchers SET used_date = ? WHERE id = ?').run(ev.date, v.id);
  }
}

/** Not used after all: its cost is removed from the fund again. */
export function unuseVoucher(v) {
  if (v.transaction_id) db.prepare('DELETE FROM transactions WHERE id = ?').run(v.transaction_id);
  db.prepare('UPDATE vouchers SET used_date = NULL, transaction_id = NULL, used_event_id = NULL WHERE id = ?').run(v.id);
}

/**
 * Vouchers given but not used yet (and not expired), among those matching `where` (alias v; t is the voucher's
 * sport): the funds will pay for them when they're used. Percentage vouchers have no value until then: counted apart (pct).
 */
export function openVouchers(where = '1', params = []) {
  const r = db.prepare(`SELECT COUNT(*) AS n, COALESCE(SUM(v.value), 0) AS value, COALESCE(SUM(v.percent IS NOT NULL), 0) AS pct
    FROM vouchers v LEFT JOIN event_types t ON t.id = v.sport_id
    WHERE ${where} AND v.used_date IS NULL AND (v.expires IS NULL OR v.expires >= ?)`).get(...params, today());
  return { ...r, value: toRon(r.value) };
}
