// Money in and out: costs and extra income of events, and fund movements (with the parts of a sport's fund).
import express from 'express';
import { db, tx } from '../db.js';
import { toBani, toRon } from '../domain/money.js';
import { checkVersion } from '../domain/versions.js';
import { httpError, idParam, isDate, need } from '../http.js';

export const router = express.Router();

const shapeTx = (t) => ({ ...t, amount: toRon(t.amount) });

function readTx(body) {
  const { event_id, kind, category_id, amount, date, description, payment_method, fund_sport_id, fund_part_id } = body;
  need(['income', 'expense'].includes(kind), 'Choose income or expense');
  need(Number(amount) > 0, 'Amount must be greater than 0');
  need(isDate(date), 'A valid date is required');
  const fund = !event_id && fund_sport_id ? Number(fund_sport_id) : null;
  // A part only goes with its own sport's fund.
  const part = fund && fund_part_id ? db.prepare('SELECT id FROM fund_parts WHERE id = ? AND sport_id = ?').get(Number(fund_part_id), fund)?.id ?? null : null;
  return [event_id ? Number(event_id) : null, kind, category_id ? Number(category_id) : null, toBani(amount), date,
    description?.trim() || null, payment_method || null, fund, part];
}

router.get('/transactions', (req, res) => {
  const where = [], params = [];
  if (req.query.event_id === 'general') where.push('t.event_id IS NULL');
  else if (req.query.event_id) { where.push('t.event_id = ?'); params.push(Number(req.query.event_id)); }
  if (req.query.fund === 'general') where.push('t.event_id IS NULL AND t.fund_sport_id IS NULL');
  else if (req.query.fund) { where.push('t.event_id IS NULL AND t.fund_sport_id = ?'); params.push(Number(req.query.fund)); }
  if (req.query.year) { where.push("strftime('%Y', t.date) = ?"); params.push(String(req.query.year)); }
  if (req.query.month) { where.push("strftime('%m', t.date) = ?"); params.push(String(req.query.month).padStart(2, '0')); }
  if (req.query.kind) { where.push('t.kind = ?'); params.push(String(req.query.kind)); }
  if (req.query.category) { where.push('t.category_id = ?'); params.push(Number(req.query.category)); }
  if (req.query.q) { where.push('(t.description LIKE ? OR e.name LIKE ?)'); params.push(`%${req.query.q}%`, `%${req.query.q}%`); }
  const rows = db.prepare(`
    SELECT t.*, c.name AS category_name, c.cost_group, e.name AS event_name, f.name AS fund_name, fp.name AS part_name, u.name AS created_by_name
    FROM transactions t
    LEFT JOIN categories c ON c.id = t.category_id
    LEFT JOIN events e ON e.id = t.event_id
    LEFT JOIN event_types f ON f.id = t.fund_sport_id
    LEFT JOIN fund_parts fp ON fp.id = t.fund_part_id
    LEFT JOIN users u ON u.id = t.created_by
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY t.date DESC, t.id DESC`).all(...params);
  res.json(rows.map(shapeTx));
});

router.post('/transactions', (req, res) => {
  const { lastInsertRowid } = db.prepare(`
    INSERT INTO transactions (event_id, kind, category_id, amount, date, description, payment_method, fund_sport_id, fund_part_id, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(...readTx(req.body), req.user.id);
  res.json({ id: Number(lastInsertRowid) });
});

router.put('/transactions/:id', (req, res) => {
  tx(() => {
    checkVersion('transactions', idParam(req), req.body, 'transaction');
    db.prepare(`
      UPDATE transactions SET event_id = ?, kind = ?, category_id = ?, amount = ?, date = ?, description = ?,
        payment_method = ?, fund_sport_id = ?, fund_part_id = ? WHERE id = ?`).run(...readTx(req.body), idParam(req));
  });
  res.json({ ok: true });
});

// Parts of a sport's fund (e.g. Active Padel Academy in Padel).
router.get('/fund-parts', (req, res) => {
  res.json(db.prepare('SELECT p.id, p.sport_id, p.name FROM fund_parts p ORDER BY p.name').all());
});
router.post('/fund-parts', (req, res) => {
  const name = req.body.name?.trim();
  need(name, 'Enter a name');
  need(db.prepare('SELECT 1 FROM event_types WHERE id = ?').get(Number(req.body.sport_id)), 'Unknown sport');
  try {
    res.json({ id: Number(db.prepare('INSERT INTO fund_parts (sport_id, name) VALUES (?, ?)').run(Number(req.body.sport_id), name).lastInsertRowid) });
  } catch { throw httpError(400, 'This fund already has a part with that name'); }
});
router.delete('/fund-parts/:id', (req, res) => {
  // Its money stays in the sport's fund; it's just no longer counted apart.
  tx(() => {
    db.prepare('UPDATE transactions SET fund_part_id = NULL WHERE fund_part_id = ?').run(idParam(req));
    db.prepare('DELETE FROM fund_parts WHERE id = ?').run(idParam(req));
  });
  res.json({ ok: true });
});

router.delete('/transactions/:id', (req, res) => {
  // A voucher whose cost this was becomes unused again.
  tx(() => {
    db.prepare('UPDATE vouchers SET used_date = NULL, transaction_id = NULL, used_event_id = NULL WHERE transaction_id = ?').run(idParam(req));
    db.prepare('DELETE FROM transactions WHERE id = ?').run(idParam(req));
  });
  res.json({ ok: true });
});
