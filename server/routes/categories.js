// Categories of costs and income.
import express from 'express';
import { db } from '../db.js';
import { httpError, idParam, need } from '../http.js';

export const router = express.Router({ caseSensitive: true });

router.get('/categories', (req, res) => {
  res.json(db.prepare(`
    SELECT c.id, c.name, c.kind, c.cost_group, COUNT(t.id) AS uses FROM categories c
    LEFT JOIN transactions t ON t.category_id = c.id GROUP BY c.id ORDER BY c.kind, c.cost_group DESC, c.id`).all());
});

router.post('/categories', (req, res) => {
  const { name, kind, cost_group = 'organizing' } = req.body;
  need(name?.trim() && ['income', 'expense'].includes(kind), 'Name and kind are required');
  need(['organizing', 'benefit'].includes(cost_group), 'Invalid cost group');
  try {
    db.prepare('INSERT INTO categories (name, kind, cost_group) VALUES (?, ?, ?)').run(name.trim(), kind, cost_group);
  } catch {
    throw httpError(400, 'This category already exists');
  }
  res.json({ ok: true });
});

router.put('/categories/:id', (req, res) => {
  const c = db.prepare('SELECT * FROM categories WHERE id = ?').get(idParam(req));
  if (!c) throw httpError(404, 'Category not found');
  const name = req.body.name?.trim() || c.name;
  const group = ['organizing', 'benefit'].includes(req.body.cost_group) ? req.body.cost_group : c.cost_group;
  db.prepare('UPDATE categories SET name = ?, cost_group = ? WHERE id = ?').run(name, group, c.id);
  res.json({ ok: true });
});

router.delete('/categories/:id', (req, res) => {
  db.prepare('DELETE FROM categories WHERE id = ?').run(idParam(req));
  res.json({ ok: true });
});
