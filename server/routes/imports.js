// Importing a spreadsheet (rows parsed in the browser), and undoing an import.
import express from 'express';
import { db, tx } from '../db.js';
import { toBani } from '../domain/money.js';
import { FINALIZED, LIVE } from '../finance.js';
import { httpError, idParam, isDate, need, today } from '../http.js';

export const router = express.Router({ caseSensitive: true });

// Rows arrive already parsed by the browser:
//   events: [{ key, name, date, type_id }]
//   rows:   [{ date, kind, amount, description, category_id, event_key }]
// Events are matched to existing ones by name + date; transactions identical to an
// existing one (same event, date, kind, amount, description) are skipped.
router.post('/import', (req, res) => {
  const { source, events = [], rows = [] } = req.body;
  need(Array.isArray(rows) && rows.length, 'Nothing to import');
  need(rows.length <= 20000, 'Too many rows in one import');

  const result = tx(() => {
    const importId = Number(db.prepare('INSERT INTO imports (source, created_by) VALUES (?, ?)')
      .run(String(source || 'Spreadsheet').slice(0, 200), req.user.id).lastInsertRowid);
    const findEvent = db.prepare('SELECT id FROM events WHERE name = ? COLLATE NOCASE AND date = ?');
    const insEvent = db.prepare(`INSERT INTO events (name, type_id, date, status, created_by, import_id)
      VALUES (?, ?, ?, ?, ?, ?)`);
    const eventIds = new Map();
    let eventsCreated = 0, eventsMatched = 0;

    for (const e of events) {
      need(e.name?.trim() && isDate(e.date) && e.type_id, `Invalid event “${e.name}”`);
      const existing = findEvent.get(e.name.trim(), e.date);
      if (existing) { eventIds.set(e.key, existing.id); eventsMatched++; continue; }
      const id = insEvent.run(e.name.trim(), Number(e.type_id), e.date, e.date < today() ? FINALIZED : LIVE,
        req.user.id, importId).lastInsertRowid;
      eventIds.set(e.key, Number(id));
      eventsCreated++;
    }

    const dupe = db.prepare(`SELECT 1 FROM transactions WHERE event_id IS ? AND date = ? AND kind = ? AND amount = ?
      AND COALESCE(description, '') = ?`);
    const insTx = db.prepare(`INSERT INTO transactions (event_id, kind, category_id, amount, date, description, created_by, import_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
    let inserted = 0, skipped = 0;
    for (const r of rows) {
      need(isDate(r.date) && ['income', 'expense'].includes(r.kind) && Number(r.amount) > 0, 'Invalid row in import');
      const eventId = r.event_key != null ? eventIds.get(r.event_key) ?? null : null;
      const amount = toBani(r.amount), desc = r.description?.trim() || '';
      if (dupe.get(eventId, r.date, r.kind, amount, desc)) { skipped++; continue; }
      insTx.run(eventId, r.kind, r.category_id ? Number(r.category_id) : null, amount, r.date, desc || null, req.user.id, importId);
      inserted++;
    }
    if (!inserted && !eventsCreated) throw httpError(400, 'Everything in this file was already imported');
    return { importId, inserted, skipped, eventsCreated, eventsMatched };
  });
  res.json(result);
});

router.get('/imports', (req, res) => {
  res.json(db.prepare(`
    SELECT i.id, i.source, i.created_at, u.name AS created_by_name,
      (SELECT COUNT(*) FROM transactions t WHERE t.import_id = i.id) AS transactions,
      (SELECT COUNT(*) FROM events e WHERE e.import_id = i.id) AS events
    FROM imports i LEFT JOIN users u ON u.id = i.created_by ORDER BY i.id DESC LIMIT 20`).all());
});

// Undo an import: removes its transactions, and the events it created unless
// someone has since added other transactions, stock or organizers to them.
router.delete('/imports/:id', (req, res) => {
  const id = idParam(req);
  tx(() => {
    db.prepare('DELETE FROM transactions WHERE import_id = ?').run(id);
    db.prepare(`DELETE FROM events WHERE import_id = ?
      AND NOT EXISTS (SELECT 1 FROM transactions t WHERE t.event_id = events.id)
      AND NOT EXISTS (SELECT 1 FROM event_stock s WHERE s.event_id = events.id)
      AND NOT EXISTS (SELECT 1 FROM event_tasks p WHERE p.event_id = events.id)`).run(id);
    db.prepare('UPDATE events SET import_id = NULL WHERE import_id = ?').run(id);
    db.prepare('DELETE FROM imports WHERE id = ?').run(id);
  });
  res.json({ ok: true });
});
