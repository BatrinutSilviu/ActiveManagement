// Stock: products the community buys and uses up at events, held by founders.
import { db } from '../db/connection.js';
import { isDate, need, today } from '../http.js';
import { toBani } from './money.js';

/** Makes sure every sport has its category and Miscellaneous exists; returns Miscellaneous's id. */
export function ensureStockCategories() {
  let misc = db.prepare("SELECT id FROM stock_categories WHERE parent_id IS NULL AND sport_id IS NULL AND name = 'Miscellaneous'").get()?.id;
  if (!misc) {
    misc = Number(db.prepare("INSERT INTO stock_categories (name) VALUES ('Miscellaneous')").run().lastInsertRowid);
    db.prepare("INSERT INTO stock_categories (name, parent_id) VALUES ('Halloween', ?)").run(misc);
  }
  db.prepare(`INSERT INTO stock_categories (name, sport_id) SELECT et.name, et.id FROM event_types et
    WHERE et.is_sport = 1 AND NOT EXISTS (SELECT 1 FROM stock_categories c WHERE c.sport_id = et.id)`).run();
  db.prepare('UPDATE stock_categories SET name = (SELECT name FROM event_types WHERE id = sport_id) WHERE sport_id IS NOT NULL').run();
  db.prepare('UPDATE stock_items SET category_id = ? WHERE category_id IS NULL').run(misc);
  return misc;
}

/* -------------------------------------------------------------- purchases */

// Buying stock is spent from the fund of the product's category: a sport's category (or one of its
// subcategories) → that sport's fund, anything else → the general fund. Each purchase has its fund
// transaction, and the product counts as paid for, so events that use it aren't charged again.

/** The sport whose fund pays for a product (null = general fund). */
function itemSport(itemId) {
  let c = db.prepare('SELECT c.* FROM stock_items i JOIN stock_categories c ON c.id = i.category_id WHERE i.id = ?').get(itemId);
  for (let n = 0; c && !c.sport_id && c.parent_id && n < 10; n++) c = db.prepare('SELECT * FROM stock_categories WHERE id = ?').get(c.parent_id);
  return c?.sport_id ?? null;
}

const purchaseCategory = (kind) => {
  const name = kind === 'merch' ? 'Merchandise' : 'Stock bought';
  return db.prepare("SELECT id FROM categories WHERE name = ? AND kind = 'expense'").get(name)?.id
    ?? Number(db.prepare("INSERT INTO categories (name, kind, cost_group) VALUES (?, 'expense', 'benefit')").run(name).lastInsertRowid);
};

/** Creates (or refreshes) a purchase's fund transaction and marks the product paid for. */
export function purchaseFund(purchaseId, userId = null) {
  const p = db.prepare(`SELECT sp.*, i.name AS item_name, i.unit, pe.name AS buyer FROM stock_purchases sp
    JOIN stock_items i ON i.id = sp.item_id JOIN people pe ON pe.id = sp.person_id WHERE sp.id = ?`).get(purchaseId);
  if (!p) return;
  if (p.transaction_id) db.prepare('DELETE FROM transactions WHERE id = ?').run(p.transaction_id);
  let txId = null;
  if (p.amount > 0 && !p.paid_before) { // paid earlier = already in the books: not taken from the fund again
    txId = Number(db.prepare(`INSERT INTO transactions (event_id, kind, category_id, amount, date, description, fund_sport_id, created_by)
      VALUES (NULL, 'expense', ?, ?, ?, ?, ?, ?)`).run(purchaseCategory(p.kind), p.amount, p.date,
      `Stock: ${p.qty} ${p.unit} ${p.item_name} (bought by ${p.buyer})`, itemSport(p.item_id), userId).lastInsertRowid);
  }
  db.prepare('UPDATE stock_purchases SET transaction_id = ? WHERE id = ?').run(txId, p.id);
  db.prepare('UPDATE stock_items SET prepaid = 1 WHERE id = ?').run(p.item_id);
}

/** A product moved to another category: its purchases are paid by the new category's fund. */
export function movePurchaseFunds(itemId) {
  db.prepare('UPDATE transactions SET fund_sport_id = ? WHERE id IN (SELECT transaction_id FROM stock_purchases WHERE item_id = ?)')
    .run(itemSport(itemId), itemId);
}

/** Only founders keep stock. */
export const needFounder = (id) => need(db.prepare('SELECT 1 FROM people WHERE id = ? AND is_founder = 1').get(Number(id)), 'Stock can only be held by a founder');

/** Records a purchase (body.purchase): the holder gets the quantity, the buyer gets points for the amount paid. */
export function recordPurchase(itemId, holderId, qty, body, userId) {
  const p = body.purchase;
  need(['items', 'merch'].includes(p.kind), 'Choose what kind of purchase it was');
  need(db.prepare('SELECT 1 FROM people WHERE id = ?').get(Number(p.person_id)), 'Choose who bought it');
  need(Number(p.amount) >= 0, 'The amount paid can’t be negative');
  need(!p.date || isDate(p.date), 'Invalid date');
  const { lastInsertRowid } = db.prepare(`INSERT INTO stock_purchases (item_id, person_id, holder_id, qty, amount, kind, date, created_by, paid_before)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(itemId, Number(p.person_id), Number(holderId), Number(qty), toBani(p.amount), p.kind, p.date || today(), userId, p.paid_before ? 1 : 0);
  purchaseFund(Number(lastInsertRowid), userId); // spent from the category's fund
}

/* --------------------------------------------------------- used at events */

// Stock used at an event is charged to it either way. `kept`: 1 = we still own it afterwards (the
// quantity stays), 2 = partly used (just a note; the quantity stays too), 0 = used up (off the holder's quantity).
export const keptValue = (v) => (v === 2 || v === 'partial' ? 2 : v === true || v === 1 || v === 'kept' ? 1 : 0);

/** Checks the person holds at least `qty` of the product. */
export function takeStock(item, personId, qty) {
  const held = db.prepare('SELECT qty FROM stock_holdings WHERE item_id = ? AND person_id = ?').get(item.id, personId)?.qty || 0;
  need(held >= Number(qty), `Only ${held} ${item.unit} of ${item.name} available from this person`);
  return held;
}

/** Gives a used-up event stock line back to whoever it was taken from. */
export function returnStock(s) {
  if (!s.person_id || s.kept) return;
  db.prepare(`INSERT INTO stock_holdings (item_id, person_id, qty) VALUES (?, ?, ?)
    ON CONFLICT(item_id, person_id) DO UPDATE SET qty = qty + excluded.qty`).run(s.item_id, s.person_id, s.qty);
}
