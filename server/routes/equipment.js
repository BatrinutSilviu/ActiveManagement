// Equipment the community keeps and reuses (balls, mats, rackets…).
import express from 'express';
import { db } from '../db.js';
import { toBani, toRon } from '../domain/money.js';
import { idParam, isDate, need } from '../http.js';

export const router = express.Router();

const EQUIPMENT_STATES = ['new', 'good', 'worn', 'broken', 'lost'];

function readEquipment(b) {
  need(b.name?.trim(), 'Name is required');
  const qty = Number(b.qty ?? 1);
  need(Number.isInteger(qty) && qty > 0, 'Quantity must be a whole number above 0');
  need(!(Number(b.unit_cost) < 0), 'Cost cannot be negative');
  need(!b.bought_on || isDate(b.bought_on), 'Enter a valid purchase date');
  need(EQUIPMENT_STATES.includes(b.state || 'good'), 'Unknown state');
  return [b.name.trim(), b.sport_id ? Number(b.sport_id) : null, qty, toBani(b.unit_cost), b.bought_on || null,
    b.state || 'good', b.person_id ? Number(b.person_id) : null, b.notes?.trim() || null];
}

router.get('/equipment', (req, res) => {
  res.json(db.prepare(`SELECT q.*, p.name AS person_name, t.name AS sport_name FROM equipment q
    LEFT JOIN people p ON p.id = q.person_id LEFT JOIN event_types t ON t.id = q.sport_id
    ORDER BY q.name COLLATE NOCASE, q.id`).all().map((q) => ({ ...q, unit_cost: toRon(q.unit_cost) })));
});

router.post('/equipment', (req, res) => {
  const { lastInsertRowid } = db.prepare(`INSERT INTO equipment (name, sport_id, qty, unit_cost, bought_on, state, person_id, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(...readEquipment(req.body));
  res.json({ id: Number(lastInsertRowid) });
});

router.put('/equipment/:id', (req, res) => {
  db.prepare(`UPDATE equipment SET name = ?, sport_id = ?, qty = ?, unit_cost = ?, bought_on = ?, state = ?, person_id = ?, notes = ?
    WHERE id = ?`).run(...readEquipment(req.body), idParam(req));
  res.json({ ok: true });
});

router.delete('/equipment/:id', (req, res) => {
  db.prepare('DELETE FROM equipment WHERE id = ?').run(idParam(req));
  res.json({ ok: true });
});
