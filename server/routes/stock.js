// Stock: products, their categories, who holds how much, and purchases (see domain/stock.js).
import express from 'express';
import { db, tx } from '../db.js';
import { r2, toBani, toRon } from '../domain/money.js';
import { ensureStockCategories, movePurchaseFunds, needFounder, purchaseFund, recordPurchase } from '../domain/stock.js';
import { purchaseLines } from '../finance.js';
import { httpError, idParam, need } from '../http.js';

export const router = express.Router({ caseSensitive: true });

router.get('/stock', (req, res) => {
  ensureStockCategories();
  const items = db.prepare('SELECT * FROM stock_items ORDER BY name').all();
  const holdings = db.prepare(`
    SELECT h.item_id, h.person_id, h.qty, p.name FROM stock_holdings h JOIN people p ON p.id = h.person_id
    WHERE h.qty != 0 ORDER BY p.name`).all();
  const used = db.prepare('SELECT item_id, SUM(qty) AS qty FROM event_stock GROUP BY item_id').all();
  res.json(items.map((i) => {
    const hs = holdings.filter((h) => h.item_id === i.id).map(({ person_id, name, qty }) => ({ person_id, name, qty }));
    const qty = hs.reduce((s, h) => s + h.qty, 0);
    return { ...i, unit_price: toRon(i.unit_price), holdings: hs, qty, value: r2(qty * toRon(i.unit_price)),
      used: used.find((u) => u.item_id === i.id)?.qty || 0 };
  }));
});

/* ------------------------------------------------------ stock categories */

router.get('/stock/categories', (req, res) => {
  ensureStockCategories();
  res.json(db.prepare(`SELECT c.*, (SELECT COUNT(*) FROM stock_items i WHERE i.category_id = c.id) AS items
    FROM stock_categories c ORDER BY c.sport_id IS NULL AND c.parent_id IS NULL, c.name COLLATE NOCASE`).all());
});

// Subcategories only: the big categories are the sports and Miscellaneous.
router.post('/stock/categories', (req, res) => {
  need(req.body.name?.trim(), 'Name is required');
  const parent = db.prepare('SELECT * FROM stock_categories WHERE id = ?').get(Number(req.body.parent_id));
  need(parent, 'Choose the category it belongs to');
  need(!db.prepare('SELECT 1 FROM stock_categories WHERE parent_id = ? AND name = ? COLLATE NOCASE').get(parent.id, req.body.name.trim()),
    'That subcategory already exists');
  const { lastInsertRowid } = db.prepare('INSERT INTO stock_categories (name, parent_id) VALUES (?, ?)').run(req.body.name.trim(), parent.id);
  res.json({ id: Number(lastInsertRowid) });
});

router.put('/stock/categories/:id', (req, res) => {
  const c = db.prepare('SELECT * FROM stock_categories WHERE id = ?').get(idParam(req));
  need(c?.parent_id, 'Only subcategories can be renamed — sports are renamed in Settings');
  need(req.body.name?.trim(), 'Name is required');
  db.prepare('UPDATE stock_categories SET name = ? WHERE id = ?').run(req.body.name.trim(), c.id);
  res.json({ ok: true });
});

// Deleting a subcategory moves its products (and its own subcategories) up to its parent.
router.delete('/stock/categories/:id', (req, res) => {
  const c = db.prepare('SELECT * FROM stock_categories WHERE id = ?').get(idParam(req));
  need(c?.parent_id, 'Only subcategories can be deleted');
  tx(() => {
    db.prepare('UPDATE stock_items SET category_id = ? WHERE category_id = ?').run(c.parent_id, c.id);
    db.prepare('UPDATE stock_categories SET parent_id = ? WHERE parent_id = ?').run(c.parent_id, c.id);
    db.prepare('DELETE FROM stock_categories WHERE id = ?').run(c.id);
  });
  res.json({ ok: true });
});

/* --------------------------------------------------------------- products */

function readItem(body) {
  need(body.name?.trim(), 'Item name is required');
  need(Number(body.unit_price) >= 0, 'Price must be 0 or more');
  const category = Number(body.category_id) || ensureStockCategories();
  need(db.prepare('SELECT 1 FROM stock_categories WHERE id = ?').get(category), 'Unknown category');
  return [body.name.trim(), body.unit?.trim() || 'pcs', toBani(body.unit_price), category, body.prepaid ? 1 : 0];
}

router.post('/stock/items', (req, res) => {
  const result = tx(() => {
    let id;
    try {
      id = Number(db.prepare('INSERT INTO stock_items (name, unit, unit_price, category_id, prepaid) VALUES (?, ?, ?, ?, ?)').run(...readItem(req.body)).lastInsertRowid);
    } catch (e) {
      if (e.status) throw e;
      throw httpError(400, 'An item with this name already exists');
    }
    if (req.body.person_id && Number(req.body.qty) > 0) {
      needFounder(req.body.person_id);
      db.prepare('INSERT INTO stock_holdings (item_id, person_id, qty) VALUES (?, ?, ?)').run(id, Number(req.body.person_id), Number(req.body.qty));
      if (req.body.purchase) recordPurchase(id, req.body.person_id, req.body.qty, req.body, req.user.id);
    }
    return { id };
  });
  res.json(result);
});

router.put('/stock/items/:id', (req, res) => {
  tx(() => {
    db.prepare('UPDATE stock_items SET name = ?, unit = ?, unit_price = ?, category_id = ?, prepaid = ? WHERE id = ?').run(...readItem(req.body), idParam(req));
    movePurchaseFunds(idParam(req));
  });
  res.json({ ok: true });
});

// Move several products to another category at once.
router.post('/stock/items/move', (req, res) => {
  const ids = (Array.isArray(req.body.ids) ? req.body.ids : []).map(Number).filter(Boolean);
  need(ids.length, 'Choose the products to move');
  need(db.prepare('SELECT 1 FROM stock_categories WHERE id = ?').get(Number(req.body.category_id)), 'Choose a category');
  tx(() => {
    db.prepare(`UPDATE stock_items SET category_id = ? WHERE id IN (${ids.map(() => '?').join(',')})`).run(Number(req.body.category_id), ...ids);
    for (const id of ids) movePurchaseFunds(id);
  });
  res.json({ ok: true, moved: ids.length });
});

router.delete('/stock/items/:id', (req, res) => {
  need(!db.prepare('SELECT 1 FROM event_stock WHERE item_id = ?').get(idParam(req)), 'This item was used at events and cannot be deleted');
  tx(() => {
    // Its purchases go too, and with them the money they took from the fund.
    db.prepare('DELETE FROM transactions WHERE id IN (SELECT transaction_id FROM stock_purchases WHERE item_id = ?)').run(idParam(req));
    db.prepare('DELETE FROM stock_items WHERE id = ?').run(idParam(req));
  });
  res.json({ ok: true });
});

/* ------------------------------------------------- purchases and holdings */

router.get('/stock/purchases', (req, res) => res.json(purchaseLines()));

// Paid earlier (already in the budget) or not: switches whether it's spent from the fund.
router.put('/stock/purchases/:id/paid-before', (req, res) => {
  need(db.prepare('SELECT 1 FROM stock_purchases WHERE id = ?').get(idParam(req)), 'Purchase not found');
  tx(() => {
    db.prepare('UPDATE stock_purchases SET paid_before = ? WHERE id = ?').run(req.body.paid_before ? 1 : 0, idParam(req));
    purchaseFund(idParam(req), req.user.id);
  });
  res.json({ ok: true });
});

// Undoing a purchase takes the quantity back from whoever keeps it (as much as they still hold).
router.delete('/stock/purchases/:id', (req, res) => {
  const p = db.prepare('SELECT * FROM stock_purchases WHERE id = ?').get(idParam(req));
  need(p, 'Purchase not found');
  tx(() => {
    if (p.holder_id) db.prepare('UPDATE stock_holdings SET qty = MAX(qty - ?, 0) WHERE item_id = ? AND person_id = ?').run(p.qty, p.item_id, p.holder_id);
    if (p.transaction_id) db.prepare('DELETE FROM transactions WHERE id = ?').run(p.transaction_id);
    db.prepare('DELETE FROM stock_purchases WHERE id = ?').run(p.id);
  });
  res.json({ ok: true });
});

// Set (mode 'set') or add to (mode 'add') the quantity one person holds.
router.put('/stock/holdings', (req, res) => {
  const { item_id, person_id, qty, mode = 'set' } = req.body;
  need(item_id && person_id && Number.isFinite(Number(qty)), 'Item, person and quantity are required');
  const cur = db.prepare('SELECT qty FROM stock_holdings WHERE item_id = ? AND person_id = ?').get(item_id, person_id)?.qty || 0;
  const next = mode === 'add' ? cur + Number(qty) : Number(qty);
  need(next >= 0, 'Quantity cannot go below 0');
  need(!req.body.purchase || (mode === 'add' && Number(qty) > 0), 'A purchase needs a quantity');
  if (next > cur) needFounder(person_id); // lowering what a non-founder still holds stays possible
  tx(() => {
    db.prepare(`INSERT INTO stock_holdings (item_id, person_id, qty) VALUES (?, ?, ?)
      ON CONFLICT(item_id, person_id) DO UPDATE SET qty = excluded.qty`).run(item_id, person_id, next);
    if (req.body.purchase) recordPurchase(item_id, person_id, qty, req.body, req.user.id);
  });
  res.json({ qty: next });
});

router.post('/stock/transfer', (req, res) => {
  const { item_id, from, to, qty } = req.body;
  need(item_id && from && to && from !== to && Number(qty) > 0, 'Choose an item, two different people and a quantity');
  needFounder(to);
  tx(() => {
    const cur = db.prepare('SELECT qty FROM stock_holdings WHERE item_id = ? AND person_id = ?').get(item_id, from)?.qty || 0;
    need(cur >= Number(qty), `Only ${cur} available to move`);
    db.prepare('UPDATE stock_holdings SET qty = qty - ? WHERE item_id = ? AND person_id = ?').run(Number(qty), item_id, from);
    db.prepare(`INSERT INTO stock_holdings (item_id, person_id, qty) VALUES (?, ?, ?)
      ON CONFLICT(item_id, person_id) DO UPDATE SET qty = qty + excluded.qty`).run(item_id, to, Number(qty));
  });
  res.json({ ok: true });
});
