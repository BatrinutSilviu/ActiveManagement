// Products from stock used at an event (see domain/stock.js).
import express from 'express';
import { db, tx } from '../db.js';
import { keptValue, returnStock, takeStock } from '../domain/stock.js';
import { idParam, need } from '../http.js';

export const router = express.Router({ caseSensitive: true });

// Use products from someone's stock at an event: cost = qty × current price is charged to the event.
// Kept items stay in stock (we still own them); used-up ones come off the holder's quantity.
router.post('/events/:id/stock', (req, res) => {
  const { item_id, person_id, qty } = req.body;
  const kept = req.body.kept === undefined ? 1 : keptValue(req.body.kept);
  need(item_id && person_id && Number(qty) > 0, 'Choose a product, who it comes from and a quantity');
  tx(() => {
    const item = db.prepare('SELECT * FROM stock_items WHERE id = ?').get(item_id);
    need(item, 'Product not found');
    takeStock(item, person_id, qty);
    if (kept === 0) db.prepare('UPDATE stock_holdings SET qty = qty - ? WHERE item_id = ? AND person_id = ?').run(Number(qty), item_id, person_id);
    db.prepare('INSERT INTO event_stock (event_id, item_id, person_id, qty, unit_price, kept) VALUES (?, ?, ?, ?, ?, ?)')
      .run(idParam(req), item_id, person_id, Number(qty), item.unit_price, kept);
  });
  res.json({ ok: true });
});

// Switch a line between kept / partly used (in stock) and used up (off the holder's quantity). The cost stays.
router.put('/event-stock/:id', (req, res) => {
  const kept = keptValue(req.body.kept);
  tx(() => {
    const s = db.prepare('SELECT * FROM event_stock WHERE id = ?').get(idParam(req));
    need(s, 'Not found');
    const wasInStock = s.kept !== 0, inStock = kept !== 0;
    if (wasInStock && !inStock && s.person_id) {
      takeStock(db.prepare('SELECT * FROM stock_items WHERE id = ?').get(s.item_id), s.person_id, s.qty);
      db.prepare('UPDATE stock_holdings SET qty = qty - ? WHERE item_id = ? AND person_id = ?').run(s.qty, s.item_id, s.person_id);
    } else if (!wasInStock && inStock) returnStock({ ...s, kept: 0 });
    db.prepare('UPDATE event_stock SET kept = ? WHERE id = ?').run(kept, s.id);
  });
  res.json({ ok: true });
});

router.delete('/event-stock/:id', (req, res) => {
  tx(() => {
    const s = db.prepare('SELECT * FROM event_stock WHERE id = ?').get(idParam(req));
    if (!s) return;
    returnStock(s);
    db.prepare('DELETE FROM event_stock WHERE id = ?').run(s.id);
  });
  res.json({ ok: true });
});
