// Exports for accounting.
import express from 'express';
import { db } from '../db.js';
import { toRon } from '../domain/money.js';

export const router = express.Router();

router.get('/export/transactions.csv', (req, res) => {
  const year = req.query.year ? String(req.query.year) : null;
  const rows = db.prepare(`
    SELECT t.date, t.kind, t.amount, c.name AS category, c.cost_group, e.name AS event, et.name AS sport, e.date AS event_date,
      CASE WHEN t.event_id IS NULL THEN COALESCE(f.name || ' fund', 'General fund') END AS fund,
      t.description, t.payment_method, u.name AS added_by
    FROM transactions t
    LEFT JOIN categories c ON c.id = t.category_id
    LEFT JOIN events e ON e.id = t.event_id
    LEFT JOIN event_types et ON et.id = e.type_id
    LEFT JOIN event_types f ON f.id = t.fund_sport_id
    LEFT JOIN users u ON u.id = t.created_by
    ${year ? "WHERE strftime('%Y', COALESCE(e.date, t.date)) = ?" : ''}
    ORDER BY t.date`).all(...(year ? [year] : []));
  const cols = ['date', 'kind', 'amount', 'category', 'cost_group', 'event', 'sport', 'event_date', 'fund', 'description', 'payment_method', 'added_by'];
  const esc = (v) => (v == null ? '' : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  const csv = [cols.join(','), ...rows.map((r) => cols.map((c) => esc(c === 'amount' ? toRon(r[c]).toFixed(2) : r[c])).join(','))]
    .join('\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="active-transactions${year ? '-' + year : ''}.csv"`);
  res.send('﻿' + csv);
});
