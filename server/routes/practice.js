// A practice (business type "practice"): patients, notes about them, sessions, packages of sessions, and the
// invoices and receipts issued (only recorded here, never sent anywhere). In the code a patient is a "client" and
// a session an "appointment" (`sessions` is the sign-in table); the app shows the business's own words.
//
// Money is counted when it's paid: ticking an invoice or receipt paid adds an income transaction on the day it was
// paid (shown in Transactions, counted in the account and the month), unticking removes it. What's owed:
//   - not billed yet: sessions done that aren't in a package, and packages, with no invoice or receipt yet;
//   - billed, not paid: invoices and receipts without the paid tick.
import express from 'express';
import { db, tx } from '../db.js';
import { toBani, toRon } from '../domain/money.js';
import { httpError, idParam, isDate, need, today } from '../http.js';

export const router = express.Router({ caseSensitive: true });

const text = (v, max = 2000) => (v == null ? null : String(v).trim().slice(0, max) || null);
const isTime = (s) => /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
const optDate = (v, what) => { if (!v) return null; need(isDate(v), `${what} isn't a valid date`); return v; };
const money = (v, what) => { const n = Number(v || 0); need(Number.isFinite(n) && n >= 0, `${what} can't be negative`); return toBani(n); };
const dayParam = (req) => (isDate(req.query.today) ? req.query.today : today()); // the browser's today (time zone)
const addDays = (d, n) => { const x = new Date(`${d}T00:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };

function getClient(id) {
  const c = db.prepare('SELECT * FROM clients WHERE id = ?').get(id);
  if (!c) throw httpError(404, 'This patient no longer exists');
  return c;
}

/* --------------------------------------------------------------------------------------------- patients */

// What a patient still owes: sessions done (outside packages) and packages with no invoice yet, and invoices
// not paid yet. In bani.
const UNBILLED_SQL = `(SELECT COALESCE(SUM(a.price), 0) FROM appointments a WHERE a.client_id = c.id AND a.status = 'done'
    AND a.package_id IS NULL AND a.invoice_id IS NULL)
  + (SELECT COALESCE(SUM(p.price), 0) FROM packages p WHERE p.client_id = c.id AND p.invoice_id IS NULL)`;
const UNPAID_SQL = '(SELECT COALESCE(SUM(i.amount), 0) FROM invoices i WHERE i.client_id = c.id AND i.paid = 0)';

router.get('/clients', (req, res) => {
  const day = dayParam(req);
  const rows = db.prepare(`
    SELECT c.*,
      (SELECT COUNT(*) FROM appointments a WHERE a.client_id = c.id AND a.status = 'done') AS sessions_done,
      (SELECT MAX(a.date) FROM appointments a WHERE a.client_id = c.id AND a.status = 'done') AS last_session,
      (SELECT MIN(a.date) FROM appointments a WHERE a.client_id = c.id AND a.status = 'scheduled' AND a.date >= ?) AS next_session,
      ${UNBILLED_SQL} AS unbilled, ${UNPAID_SQL} AS unpaid
    FROM clients c ORDER BY c.archived, c.last_name, c.first_name`).all(day);
  res.json(rows.map((c) => ({ ...c, unbilled: toRon(c.unbilled), unpaid: toRon(c.unpaid) })));
});

// First name and surname apart; `name` is kept as the full "First Last" the lists and joins show. A bare `name`
// (the quick add in the session form) is split: first word the first name, the rest the surname.
const CLIENT_FIELDS = ['first_name', 'last_name', 'name', 'phone', 'email', 'address', 'birth_date', 'about', 'archived',
  'tutor_name', 'tutor_relation', 'tutor_phone', 'tutor_email', 'association'];
function readClient(body) {
  let first = text(body.first_name, 60), last = text(body.last_name, 60);
  if (!first && !last && text(body.name, 120)) [first, last] = (([f, ...r]) => [f, r.join(' ') || null])(text(body.name, 120).split(/\s+/));
  need(first, 'The first name is required');
  need(last, 'The surname is required');
  return [first, last, `${first} ${last}`, text(body.phone, 60), text(body.email, 120), text(body.address, 300),
    optDate(body.birth_date, 'The birth date'), text(body.about, 10000), body.archived ? 1 : 0,
    text(body.tutor_name, 120), text(body.tutor_relation, 60), text(body.tutor_phone, 60), text(body.tutor_email, 120),
    text(body.association, 120)];
}

router.post('/clients', (req, res) => {
  const { lastInsertRowid } = db.prepare(`INSERT INTO clients (${CLIENT_FIELDS.join(', ')})
    VALUES (${CLIENT_FIELDS.map(() => '?').join(', ')})`).run(...readClient(req.body));
  res.json({ id: Number(lastInsertRowid) });
});

router.put('/clients/:id', (req, res) => {
  getClient(idParam(req));
  db.prepare(`UPDATE clients SET ${CLIENT_FIELDS.map((f) => `${f} = ?`).join(', ')} WHERE id = ?`)
    .run(...readClient(req.body), idParam(req));
  res.json({ ok: true });
});

// Their sessions, packages and notes go with them. Not when they have invoices: those are money records to keep
// (archive the patient instead).
router.delete('/clients/:id', (req, res) => {
  getClient(idParam(req));
  need(!db.prepare('SELECT 1 FROM invoices WHERE client_id = ?').get(idParam(req)),
    'This patient has invoices or receipts, which have to stay: archive them instead');
  db.prepare('DELETE FROM clients WHERE id = ?').run(idParam(req));
  res.json({ ok: true });
});

router.get('/clients/:id', (req, res) => {
  const id = idParam(req);
  const c = getClient(id);
  const owed = db.prepare(`SELECT ${UNBILLED_SQL} AS unbilled, ${UNPAID_SQL} AS unpaid FROM clients c WHERE c.id = ?`).get(id);
  res.json({
    ...c, unbilled: toRon(owed.unbilled), unpaid: toRon(owed.unpaid),
    notes: db.prepare('SELECT * FROM client_notes WHERE client_id = ? ORDER BY date DESC, id DESC').all(id),
    packages: loadPackages('WHERE p.client_id = ?', [id]),
    appointments: loadAppointments('WHERE a.client_id = ?', [id], 'ORDER BY a.date DESC, a.start_time DESC'),
    invoices: loadInvoices('WHERE i.client_id = ?', [id]),
  });
});

/* ------------------------------------------------------------------------------------------------ notes */

function readNote(body) {
  need(isDate(body.date), 'A valid date is required');
  const t = text(body.text, 20000);
  need(t, 'The note is empty');
  return [body.date, t];
}

router.post('/clients/:id/notes', (req, res) => {
  getClient(idParam(req));
  const { lastInsertRowid } = db.prepare('INSERT INTO client_notes (client_id, date, text) VALUES (?, ?, ?)')
    .run(idParam(req), ...readNote(req.body));
  res.json({ id: Number(lastInsertRowid) });
});

router.put('/client-notes/:id', (req, res) => {
  const r = db.prepare('UPDATE client_notes SET date = ?, text = ? WHERE id = ?').run(...readNote(req.body), idParam(req));
  if (!r.changes) throw httpError(404, 'This note no longer exists');
  res.json({ ok: true });
});

router.delete('/client-notes/:id', (req, res) => {
  db.prepare('DELETE FROM client_notes WHERE id = ?').run(idParam(req));
  res.json({ ok: true });
});

/* --------------------------------------------------------------------------------------------- packages */

function loadPackages(where, params) {
  return db.prepare(`
    SELECT p.*, c.name AS client_name, i.number AS invoice_number, i.kind AS invoice_kind, i.paid AS invoice_paid,
      (SELECT COUNT(*) FROM appointments a WHERE a.package_id = p.id AND a.status = 'done') AS used,
      (SELECT COUNT(*) FROM appointments a WHERE a.package_id = p.id AND a.status = 'scheduled') AS booked
    FROM packages p JOIN clients c ON c.id = p.client_id LEFT JOIN invoices i ON i.id = p.invoice_id
    ${where} ORDER BY p.date DESC, p.id DESC`).all(...params)
    .map((p) => ({ ...p, price: toRon(p.price), left: p.sessions - p.used - p.booked }));
}

function readPackage(body) {
  const name = text(body.name, 120);
  need(name, 'Give the package a name, e.g. 10 sessions');
  const sessions = Number(body.sessions);
  need(Number.isInteger(sessions) && sessions > 0 && sessions <= 500, 'The number of sessions must be a whole number above 0');
  need(isDate(body.date), 'A valid date is required');
  return [name, sessions, money(body.price, 'The price'), body.date, optDate(body.expires, 'The expiry date'), text(body.note, 2000)];
}

router.get('/packages', (req, res) => {
  res.json(req.query.client_id ? loadPackages('WHERE p.client_id = ?', [Number(req.query.client_id)]) : loadPackages('', []));
});

router.post('/clients/:id/packages', (req, res) => {
  getClient(idParam(req));
  const { lastInsertRowid } = db.prepare('INSERT INTO packages (client_id, name, sessions, price, date, expires, note) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(idParam(req), ...readPackage(req.body));
  res.json({ id: Number(lastInsertRowid) });
});

router.put('/packages/:id', (req, res) => {
  const v = readPackage(req.body);
  const used = db.prepare("SELECT COUNT(*) AS n FROM appointments WHERE package_id = ? AND status != 'cancelled'").get(idParam(req)).n;
  need(v[1] >= used, `${used} sessions already use this package: it can't have fewer`);
  const r = db.prepare('UPDATE packages SET name = ?, sessions = ?, price = ?, date = ?, expires = ?, note = ? WHERE id = ?').run(...v, idParam(req));
  if (!r.changes) throw httpError(404, 'This package no longer exists');
  res.json({ ok: true });
});

router.delete('/packages/:id', (req, res) => {
  need(!db.prepare('SELECT 1 FROM appointments WHERE package_id = ?').get(idParam(req)),
    'Sessions use this package: take them out of it (or delete them) first');
  db.prepare('DELETE FROM packages WHERE id = ?').run(idParam(req));
  res.json({ ok: true });
});

/* ------------------------------------------------------------------------------------------- sessions */

function loadAppointments(where, params, order = 'ORDER BY a.date, a.start_time') {
  return db.prepare(`
    SELECT a.*, c.name AS client_name, c.phone AS client_phone, COALESCE(a.address, c.address) AS place,
      et.name AS type_name, p.name AS package_name, i.number AS invoice_number, i.kind AS invoice_kind, i.paid AS invoice_paid
    FROM appointments a JOIN clients c ON c.id = a.client_id
    LEFT JOIN event_types et ON et.id = a.type_id
    LEFT JOIN packages p ON p.id = a.package_id
    LEFT JOIN invoices i ON i.id = a.invoice_id
    ${where} ${order}`).all(...params).map((a) => ({ ...a, price: toRon(a.price) }));
}

const STATUSES = ['scheduled', 'done', 'cancelled'];

function readAppointment(body, id = null) {
  const clientId = Number(body.client_id);
  getClient(clientId);
  need(isDate(body.date), 'A valid date is required');
  const start = body.start_time || null, end = body.end_time || null;
  need((!start || isTime(start)) && (!end || isTime(end)), 'Times must look like 14:30');
  need(!start || !end || end > start, 'The session must end after it starts');
  const status = body.status || 'scheduled';
  need(STATUSES.includes(status), 'Unknown status');
  const typeId = body.type_id ? Number(body.type_id) : null;
  need(!typeId || db.prepare('SELECT 1 FROM event_types WHERE id = ?').get(typeId), 'Unknown service');
  let packageId = body.package_id ? Number(body.package_id) : null;
  if (packageId) {
    const p = loadPackages('WHERE p.id = ?', [packageId])[0];
    need(p && p.client_id === clientId, 'That package belongs to someone else');
    // Room in it: this session itself already counts when it's being edited and was in it.
    const mine = id ? db.prepare("SELECT 1 FROM appointments WHERE id = ? AND package_id = ? AND status != 'cancelled'").get(id, packageId) : null;
    need(status === 'cancelled' || mine || p.left > 0, `The package “${p.name}” has no sessions left`);
  }
  if (status === 'cancelled' && packageId) packageId = null; // a cancelled session gives its place in the package back
  // In a package: paid with the package, so it has no price of its own.
  const price = packageId ? 0 : money(body.price, 'The price');
  return [clientId, typeId, body.date, start, end, text(body.address, 300), status, price, packageId, text(body.note, 5000)];
}

router.get('/appointments', (req, res) => {
  const where = [], params = [];
  if (isDate(req.query.from)) { where.push('a.date >= ?'); params.push(req.query.from); }
  if (isDate(req.query.to)) { where.push('a.date <= ?'); params.push(req.query.to); }
  if (req.query.client_id) { where.push('a.client_id = ?'); params.push(Number(req.query.client_id)); }
  if (STATUSES.includes(req.query.status)) { where.push('a.status = ?'); params.push(req.query.status); }
  res.json(loadAppointments(where.length ? `WHERE ${where.join(' AND ')}` : '', params));
});

router.post('/appointments', (req, res) => {
  const { lastInsertRowid } = db.prepare(`INSERT INTO appointments (client_id, type_id, date, start_time, end_time, address, status, price,
    package_id, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(...readAppointment(req.body));
  res.json({ id: Number(lastInsertRowid) });
});

router.put('/appointments/:id', (req, res) => {
  const id = idParam(req);
  need(db.prepare('SELECT 1 FROM appointments WHERE id = ?').get(id), 'This session no longer exists');
  db.prepare(`UPDATE appointments SET client_id = ?, type_id = ?, date = ?, start_time = ?, end_time = ?, address = ?, status = ?, price = ?,
    package_id = ?, note = ? WHERE id = ?`).run(...readAppointment(req.body, id), id);
  res.json({ ok: true });
});

// Done / cancelled / back to scheduled, from the lists.
router.put('/appointments/:id/status', (req, res) => {
  const a = db.prepare('SELECT * FROM appointments WHERE id = ?').get(idParam(req));
  if (!a) throw httpError(404, 'This session no longer exists');
  const v = readAppointment({ ...a, price: toRon(a.price), status: req.body.status }, a.id);
  db.prepare('UPDATE appointments SET status = ?, package_id = ? WHERE id = ?').run(v[6], v[8], a.id);
  res.json({ ok: true });
});

router.delete('/appointments/:id', (req, res) => {
  db.prepare('DELETE FROM appointments WHERE id = ?').run(idParam(req));
  res.json({ ok: true });
});

/* -------------------------------------------------------------------------------- invoices and receipts */

function loadInvoices(where, params) {
  return db.prepare(`
    SELECT i.*, c.name AS client_name,
      (SELECT COUNT(*) FROM appointments a WHERE a.invoice_id = i.id) AS sessions,
      (SELECT GROUP_CONCAT(p.name, ', ') FROM packages p WHERE p.invoice_id = i.id) AS package_names
    FROM invoices i LEFT JOIN clients c ON c.id = i.client_id
    ${where} ORDER BY i.date DESC, i.id DESC`).all(...params).map((i) => ({ ...i, amount: toRon(i.amount) }));
}

const KIND_LABELS = { invoice: 'Invoice', receipt: 'Receipt' };

/** Paid: its income transaction exists and matches it; not paid: there's none. */
function syncPayment(id) {
  const i = db.prepare('SELECT i.*, c.name AS client_name FROM invoices i LEFT JOIN clients c ON c.id = i.client_id WHERE i.id = ?').get(id);
  if (!i.paid) {
    if (i.transaction_id) {
      db.prepare('UPDATE invoices SET transaction_id = NULL WHERE id = ?').run(id);
      db.prepare('DELETE FROM transactions WHERE id = ?').run(i.transaction_id);
    }
    return;
  }
  const category = db.prepare("SELECT id FROM categories WHERE kind = 'income' ORDER BY name = 'Session fees' DESC, id LIMIT 1").get()?.id ?? null;
  const description = [KIND_LABELS[i.kind] + (i.number ? ` ${i.number}` : ''), i.client_name].filter(Boolean).join(' · ');
  const values = [category, i.amount, i.paid_date || i.date, description, i.payment_method];
  if (i.transaction_id && db.prepare('SELECT 1 FROM transactions WHERE id = ?').get(i.transaction_id)) {
    db.prepare('UPDATE transactions SET category_id = ?, amount = ?, date = ?, description = ?, payment_method = ? WHERE id = ?')
      .run(...values, i.transaction_id);
  } else {
    const { lastInsertRowid } = db.prepare(`INSERT INTO transactions (kind, category_id, amount, date, description, payment_method)
      VALUES ('income', ?, ?, ?, ?, ?)`).run(...values);
    db.prepare('UPDATE invoices SET transaction_id = ? WHERE id = ?').run(Number(lastInsertRowid), id);
  }
}

function readInvoice(body) {
  need(KIND_LABELS[body.kind], 'Choose invoice or receipt');
  need(isDate(body.date), 'A valid date is required');
  const amount = toBani(Number(body.amount));
  need(amount > 0, 'The amount must be more than 0');
  const clientId = body.client_id ? Number(body.client_id) : null;
  if (clientId) getClient(clientId);
  const paid = body.paid ? 1 : 0;
  const paidDate = paid ? optDate(body.paid_date, 'The payment date') || body.date : null;
  return [body.kind, text(body.number, 40), body.date, clientId, amount, text(body.description, 1000), paid, paidDate,
    paid ? text(body.payment_method, 40) : null];
}

/** Puts the chosen sessions and packages on the invoice (and takes off the ones no longer chosen). */
function setItems(id, clientId, body) {
  const ids = (k) => [...new Set((Array.isArray(body[k]) ? body[k] : []).map(Number).filter(Boolean))];
  db.prepare('UPDATE appointments SET invoice_id = NULL WHERE invoice_id = ?').run(id);
  db.prepare('UPDATE packages SET invoice_id = NULL WHERE invoice_id = ?').run(id);
  for (const [table, list, what] of [['appointments', ids('appointment_ids'), 'session'], ['packages', ids('package_ids'), 'package']]) {
    for (const itemId of list) {
      const row = db.prepare(`SELECT client_id, invoice_id FROM ${table} WHERE id = ?`).get(itemId);
      need(row, `A ${what} on it no longer exists`);
      need(row.client_id === clientId, `A ${what} on it belongs to another patient`);
      need(!row.invoice_id, `A ${what} on it is already on another invoice or receipt`);
      db.prepare(`UPDATE ${table} SET invoice_id = ? WHERE id = ?`).run(id, itemId);
    }
  }
}

router.get('/invoices', (req, res) => {
  const where = [], params = [];
  if (req.query.paid === '0' || req.query.paid === '1') { where.push('i.paid = ?'); params.push(Number(req.query.paid)); }
  if (KIND_LABELS[req.query.kind]) { where.push('i.kind = ?'); params.push(req.query.kind); }
  if (/^\d{4}$/.test(req.query.year || '')) { where.push("strftime('%Y', i.date) = ?"); params.push(req.query.year); }
  if (req.query.client_id) { where.push('i.client_id = ?'); params.push(Number(req.query.client_id)); }
  res.json(loadInvoices(where.length ? `WHERE ${where.join(' AND ')}` : '', params));
});

// The number after the last one of this kind, e.g. AP-0042 -> AP-0043 ('' when the last one has no number at its end).
router.get('/invoices/next-number', (req, res) => {
  const last = db.prepare("SELECT number FROM invoices WHERE kind = ? AND number IS NOT NULL ORDER BY id DESC LIMIT 1")
    .get(String(req.query.kind || 'invoice'))?.number;
  const m = last?.match(/^(.*?)(\d+)$/);
  res.json({ number: m ? m[1] + String(Number(m[2]) + 1).padStart(m[2].length, '0') : '' });
});

// What can go on an invoice for this patient: sessions done outside packages, and packages, with no invoice yet
// (or already on invoice `invoice_id`, when editing it).
router.get('/clients/:id/billable', (req, res) => {
  const id = idParam(req), inv = Number(req.query.invoice_id) || -1;
  res.json({
    appointments: loadAppointments(`WHERE a.client_id = ? AND a.status = 'done' AND a.package_id IS NULL AND a.price > 0
      AND (a.invoice_id IS NULL OR a.invoice_id = ?)`, [id, inv]),
    packages: loadPackages('WHERE p.client_id = ? AND p.price > 0 AND (p.invoice_id IS NULL OR p.invoice_id = ?)', [id, inv]),
  });
});

router.get('/invoices/:id', (req, res) => {
  const i = loadInvoices('WHERE i.id = ?', [idParam(req)])[0];
  if (!i) throw httpError(404, 'This invoice no longer exists');
  res.json({ ...i,
    appointment_ids: db.prepare('SELECT id FROM appointments WHERE invoice_id = ?').all(i.id).map((r) => r.id),
    package_ids: db.prepare('SELECT id FROM packages WHERE invoice_id = ?').all(i.id).map((r) => r.id) });
});

router.post('/invoices', (req, res) => {
  const v = readInvoice(req.body);
  const id = tx(() => {
    const newId = Number(db.prepare(`INSERT INTO invoices (kind, number, date, client_id, amount, description, paid, paid_date, payment_method)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(...v).lastInsertRowid);
    setItems(newId, v[3], req.body);
    syncPayment(newId);
    return newId;
  });
  res.json({ id });
});

router.put('/invoices/:id', (req, res) => {
  const id = idParam(req);
  need(db.prepare('SELECT 1 FROM invoices WHERE id = ?').get(id), 'This invoice no longer exists');
  const v = readInvoice(req.body);
  tx(() => {
    db.prepare(`UPDATE invoices SET kind = ?, number = ?, date = ?, client_id = ?, amount = ?, description = ?, paid = ?, paid_date = ?,
      payment_method = ? WHERE id = ?`).run(...v, id);
    setItems(id, v[3], req.body);
    syncPayment(id);
  });
  res.json({ ok: true });
});

// The paid tick in the lists: paid today (or on `paid_date`), or not paid after all.
router.put('/invoices/:id/paid', (req, res) => {
  const i = db.prepare('SELECT * FROM invoices WHERE id = ?').get(idParam(req));
  if (!i) throw httpError(404, 'This invoice no longer exists');
  const paid = req.body.paid ? 1 : 0;
  const paidDate = paid ? optDate(req.body.paid_date, 'The payment date') || today() : null;
  tx(() => {
    db.prepare('UPDATE invoices SET paid = ?, paid_date = ?, payment_method = ? WHERE id = ?')
      .run(paid, paidDate, paid ? text(req.body.payment_method, 40) ?? i.payment_method : i.payment_method, i.id);
    syncPayment(i.id);
  });
  res.json({ ok: true });
});

// Its sessions and packages are billable again; its payment (if any) goes from the money.
router.delete('/invoices/:id', (req, res) => {
  const i = db.prepare('SELECT * FROM invoices WHERE id = ?').get(idParam(req));
  if (!i) return res.json({ ok: true });
  tx(() => {
    db.prepare('DELETE FROM invoices WHERE id = ?').run(i.id);
    if (i.transaction_id) db.prepare('DELETE FROM transactions WHERE id = ?').run(i.transaction_id);
  });
  res.json({ ok: true });
});

/* ---------------------------------------------------------------------------------------------- overview */

// The dashboard: the month and the year in money (income = money received), what's owed, and the sessions to see to.
router.get('/practice/overview', (req, res) => {
  const day = dayParam(req);
  const year = /^\d{4}$/.test(req.query.year || '') ? req.query.year : day.slice(0, 4);
  const months = Array.from({ length: 12 }, (_, i) => ({ month: i + 1, income: 0, expenses: 0, profit: 0, sessions: 0 }));
  for (const t of db.prepare(`SELECT kind, CAST(strftime('%m', date) AS INTEGER) AS m, SUM(amount) AS s FROM transactions
    WHERE strftime('%Y', date) = ? GROUP BY kind, m`).all(year)) {
    months[t.m - 1][t.kind === 'income' ? 'income' : 'expenses'] += toRon(t.s);
  }
  for (const a of db.prepare(`SELECT CAST(strftime('%m', date) AS INTEGER) AS m, COUNT(*) AS n FROM appointments
    WHERE status = 'done' AND strftime('%Y', date) = ? GROUP BY m`).all(year)) months[a.m - 1].sessions = a.n;
  for (const m of months) m.profit = Math.round((m.income - m.expenses) * 100) / 100;

  const unbilledSessions = loadAppointments(`WHERE a.status = 'done' AND a.package_id IS NULL AND a.price > 0 AND a.invoice_id IS NULL`, [],
    'ORDER BY a.date');
  const unbilledPackages = loadPackages('WHERE p.price > 0 AND p.invoice_id IS NULL', []);
  const unpaid = loadInvoices('WHERE i.paid = 0', []).reverse(); // oldest first
  const years = db.prepare(`SELECT DISTINCT strftime('%Y', date) AS y FROM transactions UNION SELECT DISTINCT strftime('%Y', date)
    FROM appointments`).all().map((r) => r.y);
  res.json({
    year, months,
    years: [...new Set([...years, day.slice(0, 4)])].sort().reverse(),
    unbilled: { sessions: unbilledSessions, packages: unbilledPackages,
      amount: Math.round((unbilledSessions.reduce((s, a) => s + a.price, 0) + unbilledPackages.reduce((s, p) => s + p.price, 0)) * 100) / 100 },
    unpaid: { list: unpaid, amount: Math.round(unpaid.reduce((s, i) => s + i.amount, 0) * 100) / 100 },
    toConfirm: loadAppointments("WHERE a.status = 'scheduled' AND a.date < ?", [day]),
    upcoming: loadAppointments("WHERE a.status = 'scheduled' AND a.date BETWEEN ? AND ?", [day, addDays(day, 6)]),
    // Packages nearly used up: at most one session left to book, and not all of them done yet.
    lowPackages: loadPackages('', []).filter((p) => p.left <= 1 && p.sessions - p.used >= 1 && (!p.expires || p.expires >= day)),
  });
});
