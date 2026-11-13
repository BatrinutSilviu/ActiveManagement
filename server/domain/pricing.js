// What people pay at an event: member prices and discounts.
// Members — founders, premium people and anyone who has organised an event — pay only the venue's
// part of an event's price; everyone else pays the full price (e.g. Hyrox: 50 RON, 40 to the venue).
// A member attending is stored as an event_discounts row with member = 1, worth price − venue cost.
import { db } from '../db/connection.js';
import { syncTrainingVouchers } from './vouchers.js';

/** SQL condition: person `p` is a member. */
export const IS_MEMBER_SQL = `(p.is_founder = 1 OR p.is_premium = 1
  OR EXISTS (SELECT 1 FROM event_tasks et WHERE et.person_id = p.id))`;

/** What the member price takes off the full price (bani). */
export const memberReduction = (fee, venueFee) => Math.max(fee - venueFee, 0);

/** What a discount takes off a price (bani): a percentage of it, or a fixed amount (at most the price). */
export const discountAmount = (kind, value, fee) => Math.round(kind === 'percent' ? (fee * value) / 100 : Math.min(value, fee));

/** A new price changes what each discount (and the member price) and each voucher used there is worth. */
export function repriceEvent(id) {
  const { participation_fee: fee = 0, venue_fee: venue = 0 } = db.prepare('SELECT * FROM events WHERE id = ?').get(id) || {};
  for (const d of db.prepare('SELECT * FROM event_discounts WHERE event_id = ?').all(id)) {
    const value = d.member ? memberReduction(fee, venue) : d.value;
    db.prepare('UPDATE event_discounts SET value = ?, amount = ? WHERE id = ?').run(value, discountAmount(d.kind, value, fee), d.id);
  }
  syncTrainingVouchers(id);
}
