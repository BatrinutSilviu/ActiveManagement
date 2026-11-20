// A practice (business type "practice"): patients, notes about them, sessions, packages of sessions, and the
// invoices and receipts issued (only recorded here, never sent anywhere). In the code a patient is a "client" and
// a session an "appointment" (`sessions` is the sign-in table); the app shows the business's own words.
//
// Money is counted when it's paid: ticking an invoice or receipt paid adds an income transaction on the day it was
// paid (shown in Transactions, counted in the account and the month), unticking removes it. What's owed:
//   - not billed yet: sessions done that aren't in a package, travel fees of home visits done (package or not), and
//     packages, with no invoice or receipt yet;
//   - billed, not paid: invoices and receipts without the paid tick.
import express from 'express';
import { db, tx } from '../db.js';
import { toBani, toRon } from '../domain/money.js';
import { getBusiness } from '../domain/business.js';
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
const UNBILLED_SQL = `(SELECT COALESCE(SUM(a.price + a.travel_fee), 0) FROM appointments a WHERE a.client_id = c.id AND a.status = 'done'
    AND a.invoice_id IS NULL)
  + (SELECT COALESCE(SUM(p.price), 0) FROM packages p WHERE p.client_id = c.id AND p.invoice_id IS NULL)`;
const UNPAID_SQL = '(SELECT COALESCE(SUM(i.amount), 0) FROM invoices i WHERE i.client_id = c.id AND i.paid = 0)';

router.get('/clients', (req, res) => {
  const day = dayParam(req);
  const rows = db.prepare(`
    SELECT c.*,
      (SELECT COUNT(*) FROM appointments a WHERE a.client_id = c.id AND a.status = 'done') AS sessions_done,
      (SELECT MAX(a.date) FROM appointments a WHERE a.client_id = c.id AND a.status = 'done') AS last_session,
      (SELECT MIN(a.date) FROM appointments a WHERE a.client_id = c.id AND a.status = 'scheduled' AND a.date >= ?) AS next_session,
      ${UNBILLED_SQL} AS unbilled, ${UNPAID_SQL} AS unpaid, ${CONDITIONS_SQL}
    FROM clients c ORDER BY c.archived, c.last_name, c.first_name`).all(day).map(withConditions);
  res.json(rows.map((c) => ({ ...c, unbilled: toRon(c.unbilled), unpaid: toRon(c.unpaid) })));
});

// First name and surname apart; `name` is kept as the full "First Last" the lists and joins show. A bare `name`
// (the quick add in the session form) is split: first word the first name, the rest the surname.
const CLIENT_FIELDS = ['first_name', 'last_name', 'name', 'phone', 'email', 'address', 'birth_date', 'about', 'archived',
  'tutor_name', 'tutor_relation', 'tutor_phone', 'tutor_email', 'association', 'entity', 'contract_number', 'contract_date', 'travel_fee', 'other_therapies'];
// The legal entity they're treated through, one of the business's (Settings → Business). The patient form asks
// for it; the quick add from a session doesn't, so it can be empty. One no longer listed is kept as it was.
function readEntity(v) {
  const e = text(v, 80);
  const list = getBusiness()?.entities || [];
  need(!e || list.includes(e) || db.prepare('SELECT 1 FROM clients WHERE entity = ?').get(e), 'Unknown legal entity');
  return e;
}
// Their illness categories, from the business's list (one no longer listed is kept if they had it). Undefined: unchanged.
function readConditions(v, id) {
  if (v === undefined) return undefined;
  const list = [...new Set((Array.isArray(v) ? v : []).map((x) => text(x, 80)).filter(Boolean))];
  const known = getBusiness()?.conditions || [];
  const had = id ? db.prepare('SELECT name FROM client_conditions WHERE client_id = ?').all(id).map((r) => r.name) : [];
  for (const c of list) need(known.includes(c) || had.includes(c), 'Unknown illness category');
  return list;
}
function saveConditions(id, list) {
  if (list === undefined) return;
  db.prepare('DELETE FROM client_conditions WHERE client_id = ?').run(id);
  const add = db.prepare('INSERT INTO client_conditions (client_id, name) VALUES (?, ?)');
  for (const c of list) add.run(id, c);
}
const CONDITIONS_SQL = "(SELECT json_group_array(name) FROM (SELECT name FROM client_conditions WHERE client_id = c.id ORDER BY name)) AS conditions";
const withConditions = (c) => ({ ...c, conditions: JSON.parse(c.conditions || '[]'), travel_fee: toRon(c.travel_fee), other_therapies: JSON.parse(c.other_therapies || '[]') });
// Other therapies they follow with other therapists: rows of what, with whom, where and how often (empty rows dropped).
function readOtherTherapies(v) {
  const rows = (Array.isArray(v) ? v : []).slice(0, 30)
    .map((r) => ({ therapy: text(r?.therapy, 120), therapist: text(r?.therapist, 120), place: text(r?.place, 200), frequency: text(r?.frequency, 80) }))
    .filter((r) => r.therapy || r.therapist || r.place || r.frequency);
  need(rows.every((r) => r.therapy), 'Each other therapy needs a name');
  return rows.length ? JSON.stringify(rows) : null;
}
function readClient(body) {
  let first = text(body.first_name, 60), last = text(body.last_name, 60);
  if (!first && !last && text(body.name, 120)) [first, last] = (([f, ...r]) => [f, r.join(' ') || null])(text(body.name, 120).split(/\s+/));
  need(first, 'The first name is required');
  need(last, 'The surname is required');
  return [first, last, `${first} ${last}`, text(body.phone, 60), text(body.email, 120), text(body.address, 300),
    optDate(body.birth_date, 'The birth date'), text(body.about, 10000), body.archived ? 1 : 0,
    text(body.tutor_name, 120), text(body.tutor_relation, 60), text(body.tutor_phone, 60), text(body.tutor_email, 120),
    text(body.association, 120), readEntity(body.entity),
    text(body.contract_number, 60), optDate(body.contract_date, 'The contract date'), money(body.travel_fee, 'The travel fee'), readOtherTherapies(body.other_therapies)];
}

router.post('/clients', (req, res) => {
  const values = readClient(req.body), conditions = readConditions(req.body.conditions);
  const id = tx(() => {
    const { lastInsertRowid } = db.prepare(`INSERT INTO clients (${CLIENT_FIELDS.join(', ')})
      VALUES (${CLIENT_FIELDS.map(() => '?').join(', ')})`).run(...values);
    saveConditions(Number(lastInsertRowid), conditions);
    return Number(lastInsertRowid);
  });
  res.json({ id });
});

router.put('/clients/:id', (req, res) => {
  const id = idParam(req);
  getClient(id);
  const values = readClient(req.body), conditions = readConditions(req.body.conditions, id);
  tx(() => {
    db.prepare(`UPDATE clients SET ${CLIENT_FIELDS.map((f) => `${f} = ?`).join(', ')} WHERE id = ?`).run(...values, id);
    saveConditions(id, conditions);
  });
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
  const owed = db.prepare(`SELECT ${UNBILLED_SQL} AS unbilled, ${UNPAID_SQL} AS unpaid, ${CONDITIONS_SQL} FROM clients c WHERE c.id = ?`).get(id);
  res.json({
    ...c, conditions: JSON.parse(owed.conditions), travel_fee: toRon(c.travel_fee), other_therapies: JSON.parse(c.other_therapies || '[]'), unbilled: toRon(owed.unbilled), unpaid: toRon(owed.unpaid),
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

/**
 * How a package's places are taken: a session takes a place of its own service first, else a general one (service_id
 * empty). items: [{ service_id, sessions }]; counts: Map(service id or null -> sessions taking a place). Returns each
 * part with how many are taken and left, and whether they all fit.
 */
function allocate(items, counts) {
  let overflow = 0;
  const parts = items.map((it) => ({ ...it, taken: 0 }));
  const general = parts.filter((p) => p.service_id == null);
  for (const [service, n] of counts) {
    const own = service == null ? null : parts.find((p) => p.service_id === service);
    const take = own ? Math.min(n, own.sessions) : 0;
    if (own) own.taken = take;
    overflow += n - take;
  }
  const generalSize = general.reduce((a, p) => a + p.sessions, 0);
  let spill = overflow;
  for (const g of general) { g.taken = Math.min(spill, g.sessions); spill -= g.taken; }
  for (const p of parts) p.left = p.sessions - p.taken;
  return { parts, fits: overflow <= generalSize, generalLeft: Math.max(0, generalSize - overflow) };
}

const itemsOf = (packageId) => db.prepare(`SELECT pi.service_id, pi.sessions, et.name AS service_name FROM package_items pi
  LEFT JOIN event_types et ON et.id = pi.service_id WHERE pi.package_id = ? ORDER BY pi.service_id IS NULL, et.name`).all(packageId);
// Sessions taking a place in a package (not cancelled), by service; one session can be left out (the one being changed).
const countsOf = (packageId, exceptId = 0) => new Map(db.prepare(`SELECT type_id, COUNT(*) AS n FROM appointments
  WHERE package_id = ? AND status != 'cancelled' AND id != ? GROUP BY type_id`).all(packageId, exceptId).map((r) => [r.type_id, r.n]));

function loadPackages(where, params) {
  return db.prepare(`
    SELECT p.*, c.name AS client_name, i.number AS invoice_number, i.kind AS invoice_kind, i.paid AS invoice_paid,
      (SELECT COUNT(*) FROM appointments a WHERE a.package_id = p.id AND a.status = 'done') AS used,
      (SELECT COUNT(*) FROM appointments a WHERE a.package_id = p.id AND a.status = 'scheduled') AS booked
    FROM packages p JOIN clients c ON c.id = p.client_id LEFT JOIN invoices i ON i.id = p.invoice_id
    ${where} ORDER BY p.date DESC, p.id DESC`).all(...params)
    .map((p) => {
      const { parts, generalLeft } = allocate(itemsOf(p.id), countsOf(p.id));
      // left_for: places a session of each service could still take (its own part plus the general ones).
      const leftFor = { any: generalLeft };
      for (const it of parts) if (it.service_id != null) leftFor[it.service_id] = it.left + generalLeft;
      return { ...p, price: toRon(p.price), items: parts, left: p.sessions - p.used - p.booked, left_for: leftFor };
    });
}

/** The parts of a package (or type) from a form: [{ service_id, sessions }], one per service, merged when repeated. */
function readItems(list) {
  const merged = new Map();
  for (const it of Array.isArray(list) ? list : []) {
    const n = Number(it?.sessions);
    if (!n) continue;
    need(Number.isInteger(n) && n > 0 && n <= 500, 'The number of sessions must be a whole number above 0');
    const service = it.service_id ? Number(it.service_id) : null;
    need(service == null || db.prepare('SELECT 1 FROM event_types WHERE id = ?').get(service), 'Unknown service');
    merged.set(service, (merged.get(service) ?? 0) + n);
  }
  need(merged.size, 'Add at least one service with a number of sessions');
  const items = [...merged].map(([service_id, sessions]) => ({ service_id, sessions }));
  need(items.reduce((a, it) => a + it.sessions, 0) <= 500, 'A package can have at most 500 sessions');
  return items;
}
const total = (items) => items.reduce((a, it) => a + it.sessions, 0);
function saveItems(table, key, id, items) {
  db.prepare(`DELETE FROM ${table} WHERE ${key} = ?`).run(id);
  const add = db.prepare(`INSERT INTO ${table} (${key}, service_id, sessions) VALUES (?, ?, ?)`);
  for (const it of items) add.run(id, it.service_id, it.sessions);
}

function readPackage(body) {
  const name = text(body.name, 120);
  need(name, 'Give the package a name, e.g. 10 sessions');
  need(isDate(body.date), 'A valid date is required');
  const items = readItems(body.items);
  return { values: [name, total(items), money(body.price, 'The price'), body.date, optDate(body.expires, 'The expiry date'), text(body.note, 2000)], items };
}

/* ---------------------------------------------------------------------------------------- package types */

const loadPackageTypes = () => db.prepare('SELECT * FROM package_types ORDER BY name').all().map((x) => ({
  ...x, price: toRon(x.price),
  items: db.prepare(`SELECT pti.service_id, pti.sessions, et.name AS service_name FROM package_type_items pti
    LEFT JOIN event_types et ON et.id = pti.service_id WHERE pti.package_type_id = ? ORDER BY pti.service_id IS NULL, et.name`).all(x.id),
}));

function readPackageType(body) {
  const name = text(body.name, 120);
  need(name, 'Give the package a name, e.g. 10 sessions');
  const days = body.valid_days === '' || body.valid_days == null ? null : Number(body.valid_days);
  need(days == null || (Number.isInteger(days) && days > 0 && days <= 3650), 'Validity must be a whole number of days');
  const items = readItems(body.items);
  return { values: [name, total(items), money(body.price, 'The price'), days], items };
}

router.get('/package-types', (req, res) => res.json(loadPackageTypes()));
router.post('/package-types', (req, res) => {
  const { values, items } = readPackageType(req.body);
  const id = tx(() => {
    const { lastInsertRowid } = db.prepare('INSERT INTO package_types (name, sessions, price, valid_days) VALUES (?, ?, ?, ?)').run(...values);
    saveItems('package_type_items', 'package_type_id', Number(lastInsertRowid), items);
    return Number(lastInsertRowid);
  });
  res.json({ id });
});
router.put('/package-types/:id', (req, res) => {
  const { values, items } = readPackageType(req.body);
  tx(() => {
    const r = db.prepare('UPDATE package_types SET name = ?, sessions = ?, price = ?, valid_days = ? WHERE id = ?').run(...values, idParam(req));
    if (!r.changes) throw httpError(404, 'This package type no longer exists');
    saveItems('package_type_items', 'package_type_id', idParam(req), items);
  });
  res.json({ ok: true });
});
// Packages already sold from it stay as they are (they keep their own copy).
router.delete('/package-types/:id', (req, res) => {
  db.prepare('DELETE FROM package_types WHERE id = ?').run(idParam(req));
  res.json({ ok: true });
});

router.get('/packages', (req, res) => {
  res.json(req.query.client_id ? loadPackages('WHERE p.client_id = ?', [Number(req.query.client_id)]) : loadPackages('', []));
});

router.post('/clients/:id/packages', (req, res) => {
  getClient(idParam(req));
  const { values, items } = readPackage(req.body);
  const id = tx(() => {
    const { lastInsertRowid } = db.prepare('INSERT INTO packages (client_id, name, sessions, price, date, expires, note) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(idParam(req), ...values);
    saveItems('package_items', 'package_id', Number(lastInsertRowid), items);
    return Number(lastInsertRowid);
  });
  res.json({ id });
});

router.put('/packages/:id', (req, res) => {
  const id = idParam(req);
  const { values, items } = readPackage(req.body);
  // The sessions already in it must still find a place.
  need(allocate(items, countsOf(id)).fits, 'The sessions already booked with this package wouldn’t fit in it any more');
  tx(() => {
    const r = db.prepare('UPDATE packages SET name = ?, sessions = ?, price = ?, date = ?, expires = ?, note = ? WHERE id = ?').run(...values, id);
    if (!r.changes) throw httpError(404, 'This package no longer exists');
    saveItems('package_items', 'package_id', id, items);
  });
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
    SELECT a.*, c.name AS client_name, c.phone AS client_phone, CASE WHEN a.venue = 'practice' THEN NULL ELSE COALESCE(a.address, c.address) END AS place,
      et.name AS type_name, et.color AS type_color, et.duration AS type_duration, p.name AS package_name, i.number AS invoice_number, i.kind AS invoice_kind, i.paid AS invoice_paid, s.until AS series_until
    FROM appointments a JOIN clients c ON c.id = a.client_id
    LEFT JOIN series s ON s.id = a.series_id
    LEFT JOIN event_types et ON et.id = a.type_id
    LEFT JOIN packages p ON p.id = a.package_id
    LEFT JOIN invoices i ON i.id = a.invoice_id
    ${where} ${order}`).all(...params)
    // At the practice: the address of its location (Settings → Business).
    .map((a) => ({ ...a, price: toRon(a.price), travel_fee: toRon(a.travel_fee), amount: toRon(a.price + a.travel_fee), place: a.venue === 'practice' ? locationAddress(a.location) : a.place }));
}

const locationAddress = (name) => (getBusiness()?.locations || []).find((l) => l.name === name)?.address || null;

// One of the practice's locations; required when it has any. One no longer listed is kept as it was.
function readLocation(v, id) {
  const name = text(v, 60);
  const list = getBusiness()?.locations || [];
  need(name || id || !list.length, 'Choose which location'); // older sessions booked without one can still be changed
  need(!name || list.some((l) => l.name === name) || db.prepare('SELECT 1 FROM appointments WHERE location = ?').get(name), 'Unknown location');
  return name;
}

// One of the business's therapists; one no longer listed is kept as it was.
function readTherapist(v) {
  const name = text(v, 80);
  need(!name || (getBusiness()?.therapists || []).includes(name) || db.prepare('SELECT 1 FROM appointments WHERE therapist = ?').get(name), 'Unknown therapist');
  return name;
}

const STATUSES = ['scheduled', 'done', 'cancelled'];
const VENUES = ['home', 'practice']; // at the patient's home, or at the practice

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
  // New sessions need one once there are services; older ones booked without one can still be changed.
  need(typeId || id || !db.prepare('SELECT 1 FROM event_types').get(), 'Choose the service');
  const venue = body.venue || 'home';
  need(VENUES.includes(venue), 'Unknown venue');
  let packageId = body.package_id ? Number(body.package_id) : null;
  if (packageId) {
    const p = db.prepare('SELECT client_id, name FROM packages WHERE id = ?').get(packageId);
    need(p && p.client_id === clientId, 'That package belongs to someone else');
    // Room in it for a session of this service: its own part, else a general place (this session itself left out).
    if (status !== 'cancelled') {
      const counts = countsOf(packageId, id ?? 0);
      counts.set(typeId, (counts.get(typeId) ?? 0) + 1);
      need(allocate(itemsOf(packageId), counts).fits, `The package “${p.name}” has no place left for this service`);
    }
  }
  if (status === 'cancelled' && packageId) packageId = null; // a cancelled session gives its place in the package back
  // In a package: paid with the package, so it has no price of its own.
  const price = packageId ? 0 : money(body.price, 'The price');
  return {
    client_id: clientId, type_id: typeId, date: body.date, start_time: start, end_time: end, venue,
    address: venue === 'home' ? text(body.address, 300) : null, location: venue === 'practice' ? readLocation(body.location, id) : null,
    status, price, package_id: packageId, note: text(body.note, 5000), therapist: readTherapist(body.therapist),
    cancel_reason: status === 'cancelled' ? text(body.cancel_reason, 2000) : null, // why it was cancelled
    travel_fee: venue === 'home' ? money(body.travel_fee, 'The travel fee') : 0, // billed with it, package or not
  };
}
const APPOINTMENT_FIELDS = ['client_id', 'type_id', 'date', 'start_time', 'end_time', 'venue', 'address', 'location', 'status', 'price',
  'package_id', 'note', 'cancel_reason', 'travel_fee', 'therapist'];

router.get('/appointments', (req, res) => {
  const where = [], params = [];
  if (isDate(req.query.from)) { where.push('a.date >= ?'); params.push(req.query.from); }
  if (isDate(req.query.to)) { where.push('a.date <= ?'); params.push(req.query.to); }
  if (req.query.client_id) { where.push('a.client_id = ?'); params.push(Number(req.query.client_id)); }
  if (STATUSES.includes(req.query.status)) { where.push('a.status = ?'); params.push(req.query.status); }
  res.json(loadAppointments(where.length ? `WHERE ${where.join(' AND ')}` : '', params));
});

const insertAppointment = (v, seriesId = null) => Number(db.prepare(`INSERT INTO appointments (${APPOINTMENT_FIELDS.join(', ')}, series_id)
  VALUES (${APPOINTMENT_FIELDS.map(() => '?').join(', ')}, ?)`).run(...APPOINTMENT_FIELDS.map((k) => v[k]), seriesId).lastInsertRowid);

/**
 * A session of a series on `date`, like `body`. Its package stays while it has a place; after that the session is paid
 * separately, at the price given or else its service's usual price.
 */
function occurrence(body, date, id = null) {
  try { return readAppointment({ ...body, date }, id); } catch (e) {
    if (!body.package_id || e.status !== 400) throw e;
    const fee = body.type_id ? toRon(db.prepare('SELECT default_fee FROM event_types WHERE id = ?').get(Number(body.type_id))?.default_fee ?? 0) : 0;
    return readAppointment({ ...body, date, package_id: null, price: Number(body.price) || fee }, id);
  }
}

// How far a weekly series may reach: a year.
function readUntil(v, from) {
  need(isDate(v), 'Choose until when it repeats');
  need(v > from, 'It has to repeat until a date after the first session');
  need(v <= addDays(from, 366), 'A session can repeat for at most a year');
  return v;
}

/** Makes the sessions of series `seriesId` every 7 days after `after` up to its end, like `body`. */
function extendSeries(seriesId, body, after, until) {
  for (let d = addDays(after, 7); d <= until; d = addDays(d, 7)) insertAppointment(occurrence({ ...body, status: 'scheduled' }, d), seriesId);
}

// A new session; with repeat_until, one every week up to that date (all made now, sharing a series).
router.post('/appointments', (req, res) => {
  const v = readAppointment(req.body);
  if (!req.body.repeat_until) return res.json({ id: insertAppointment(v) });
  const until = readUntil(req.body.repeat_until, v.date);
  res.json(tx(() => {
    const seriesId = Number(db.prepare('INSERT INTO series (until) VALUES (?)').run(until).lastInsertRowid);
    const id = insertAppointment(v, seriesId);
    extendSeries(seriesId, req.body, v.date, until);
    return { id, count: db.prepare('SELECT COUNT(*) AS n FROM appointments WHERE series_id = ?').get(seriesId).n };
  }));
});

// The sessions of its series after `a` that can still change: scheduled, not billed.
const following = (a) => db.prepare(`SELECT * FROM appointments WHERE series_id = ? AND date > ? AND id != ? AND status = 'scheduled'
  AND invoice_id IS NULL ORDER BY date`).all(a.series_id, a.date, a.id);
// A stored session as the form sends it (money in RON), to make others like it.
const asBody = (r) => ({ ...r, price: toRon(r.price), travel_fee: toRon(r.travel_fee) });

// Changing a session. scope "following" (in a series): the following sessions (scheduled, not billed) get the same
// changes: service, times, place, therapist, price, travel fee, package, and the same move in days if its date moved.
// repeat_until (in a series): its new end; sessions after it go (scheduled, not billed), new ones are made up to it.
router.put('/appointments/:id', (req, res) => {
  const id = idParam(req);
  const old = db.prepare('SELECT * FROM appointments WHERE id = ?').get(id);
  need(old, 'This session no longer exists');
  const v = readAppointment(req.body, id);
  tx(() => {
    db.prepare(`UPDATE appointments SET ${APPOINTMENT_FIELDS.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`)
      .run(...APPOINTMENT_FIELDS.map((k) => v[k]), id);
    if (!old.series_id) return;
    const series = db.prepare('SELECT * FROM series WHERE id = ?').get(old.series_id);
    if (req.body.scope === 'following') {
      const shift = Math.round((new Date(`${v.date}T00:00:00Z`) - new Date(`${old.date}T00:00:00Z`)) / 86400000);
      const like = { ...req.body, cancel_reason: undefined, status: 'scheduled' };
      // Their package places are counted again one by one, in date order.
      const rows = following(old);
      db.prepare(`UPDATE appointments SET package_id = NULL WHERE id IN (${rows.map(() => '?').join(', ') || 'NULL'})`).run(...rows.map((r) => r.id));
      for (const r of rows) {
        const w = occurrence({ ...like, note: r.note }, addDays(r.date, shift), r.id);
        db.prepare(`UPDATE appointments SET ${APPOINTMENT_FIELDS.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`)
          .run(...APPOINTMENT_FIELDS.map((k) => w[k]), r.id);
      }
      // Moved by some days: its end moves with it.
      if (shift) db.prepare('UPDATE series SET until = ? WHERE id = ?').run(addDays(series.until, shift), series.id);
    }
    // A new end: sessions after it go (scheduled, not billed; not this one), and new ones are made up to it, like the
    // last one of the series.
    if (req.body.repeat_until && req.body.repeat_until !== series.until) {
      const until = readUntil(req.body.repeat_until, db.prepare('SELECT MIN(date) AS d FROM appointments WHERE series_id = ?').get(series.id).d);
      db.prepare(`DELETE FROM appointments WHERE series_id = ? AND date > ? AND status = 'scheduled' AND invoice_id IS NULL AND id != ?`).run(series.id, until, id);
      db.prepare('UPDATE series SET until = ? WHERE id = ?').run(until, series.id);
      const last = db.prepare('SELECT * FROM appointments WHERE series_id = ? ORDER BY date DESC LIMIT 1').get(series.id);
      if (until > last.date) extendSeries(series.id, { ...asBody(last), note: null, cancel_reason: null }, last.date, until);
    }
  });
  res.json({ ok: true });
});

// Done / cancelled / back to scheduled, from the lists.
router.put('/appointments/:id/status', (req, res) => {
  const a = db.prepare('SELECT * FROM appointments WHERE id = ?').get(idParam(req));
  if (!a) throw httpError(404, 'This session no longer exists');
  const v = readAppointment({ ...a, price: toRon(a.price), travel_fee: toRon(a.travel_fee), status: req.body.status, cancel_reason: req.body.cancel_reason }, a.id);
  db.prepare('UPDATE appointments SET status = ?, package_id = ?, cancel_reason = ? WHERE id = ?').run(v.status, v.package_id, v.cancel_reason, a.id);
  res.json({ ok: true });
});

// ?scope=following (in a series): the following ones go too (those scheduled and not billed), and the series ends
// the week before this one.
router.delete('/appointments/:id', (req, res) => {
  const a = db.prepare('SELECT * FROM appointments WHERE id = ?').get(idParam(req));
  if (!a) return res.json({ ok: true });
  tx(() => {
    if (a.series_id && req.query.scope === 'following') {
      for (const r of following(a)) db.prepare('DELETE FROM appointments WHERE id = ?').run(r.id);
      db.prepare('UPDATE series SET until = ? WHERE id = ?').run(addDays(a.date, -1), a.series_id);
    }
    db.prepare('DELETE FROM appointments WHERE id = ?').run(a.id);
  });
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

// What can go on an invoice for this patient: sessions done with something to pay (their price outside a package, their
// travel fee either way), and packages, with no invoice yet
// (or already on invoice `invoice_id`, when editing it).
router.get('/clients/:id/billable', (req, res) => {
  const id = idParam(req), inv = Number(req.query.invoice_id) || -1;
  res.json({
    appointments: loadAppointments(`WHERE a.client_id = ? AND a.status = 'done' AND a.price + a.travel_fee > 0
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

// Time worked between two dates, by the patients' legal entity and by service (and both together). A session's time is
// from its start to its end, else its service's duration; sessions with neither are counted apart (no_time). Done
// sessions only, or also the scheduled ones (?scheduled=1: planned time).
const minutesOf = (hm) => { const [h, m] = hm.split(':').map(Number); return h * 60 + m; };
router.get('/practice/stats', (req, res) => {
  need(isDate(req.query.from) && isDate(req.query.to), 'A valid date is required');
  const statuses = req.query.scheduled === '1' ? ['done', 'scheduled'] : ['done'];
  const rows = db.prepare(`SELECT a.start_time, a.end_time, a.therapist, c.entity, et.name AS service, et.duration
    FROM appointments a JOIN clients c ON c.id = a.client_id LEFT JOIN event_types et ON et.id = a.type_id
    WHERE a.date BETWEEN ? AND ? AND a.status IN (${statuses.map(() => '?').join(', ')})`).all(req.query.from, req.query.to, ...statuses);
  const cells = new Map(); // "entity\tservice" -> { entity, service, sessions, minutes, no_time }
  for (const r of rows) {
    const k = `${r.entity ?? ''}\t${r.service ?? ''}`;
    const c = cells.get(k) ?? cells.set(k, { entity: r.entity, service: r.service, sessions: 0, minutes: 0, no_time: 0 }).get(k);
    const min = r.start_time && r.end_time ? minutesOf(r.end_time) - minutesOf(r.start_time) : r.duration || null;
    c.sessions += 1;
    if (min > 0) c.minutes += min; else c.no_time += 1;
  }
  res.json({ from: req.query.from, to: req.query.to, cells: [...cells.values()] });
});

// Names the patients and sessions use, to spot ones no longer in the business's lists (Settings → Services).
router.get('/practice/names-in-use', (req, res) => {
  const col = (sql) => db.prepare(sql).all().map((r) => r.v);
  res.json({
    entities: col('SELECT DISTINCT entity AS v FROM clients WHERE entity IS NOT NULL'),
    conditions: col('SELECT DISTINCT name AS v FROM client_conditions'),
    therapists: col('SELECT DISTINCT therapist AS v FROM appointments WHERE therapist IS NOT NULL'),
  });
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

  const unbilledSessions = loadAppointments(`WHERE a.status = 'done' AND a.price + a.travel_fee > 0 AND a.invoice_id IS NULL`, [],
    'ORDER BY a.date');
  const unbilledPackages = loadPackages('WHERE p.price > 0 AND p.invoice_id IS NULL', []);
  const unpaid = loadInvoices('WHERE i.paid = 0', []).reverse(); // oldest first
  const years = db.prepare(`SELECT DISTINCT strftime('%Y', date) AS y FROM transactions UNION SELECT DISTINCT strftime('%Y', date)
    FROM appointments`).all().map((r) => r.y);
  res.json({
    year, months,
    years: [...new Set([...years, day.slice(0, 4)])].sort().reverse(),
    unbilled: { sessions: unbilledSessions, packages: unbilledPackages,
      amount: Math.round((unbilledSessions.reduce((s, a) => s + a.amount, 0) + unbilledPackages.reduce((s, p) => s + p.price, 0)) * 100) / 100 },
    unpaid: { list: unpaid, amount: Math.round(unpaid.reduce((s, i) => s + i.amount, 0) * 100) / 100 },
    toConfirm: loadAppointments("WHERE a.status = 'scheduled' AND a.date < ?", [day]),
    upcoming: loadAppointments("WHERE a.status = 'scheduled' AND a.date BETWEEN ? AND ?", [day, addDays(day, 6)]),
    // Packages nearly used up: at most one session left to book, and not all of them done yet.
    lowPackages: loadPackages('', []).filter((p) => p.left <= 1 && p.sessions - p.used >= 1 && (!p.expires || p.expires >= day)),
  });
});
