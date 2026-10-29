import express from 'express';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { db, getSplit, IS_MEMBER_SQL, memberReduction, setMonthSplit, setSplit, splitResolver, toBani, toRon, tx } from './db.js';
import { checkRole, createSession, currentUser, destroySession, hashPassword, requireAuth, ROLES, verifyPassword } from './auth.js';
import {
  computeFounders, computeFunds, computeSport, computeYear, FINALIZED, LIVE, loadEvents, loadFundTx, r2,
} from './finance.js';

const app = express();
// Trust the reverse proxy in front (Nginx on loopback, or Traefik on the private Docker network).
app.set('trust proxy', ['loopback', 'uniquelocal']);
app.use(express.json({ limit: '10mb' }));

const api = express.Router();
app.use('/api', api);

const httpError = (status, message) => Object.assign(new Error(message), { status });
const need = (cond, msg) => { if (!cond) throw httpError(400, msg); };
const isDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
const idParam = (req) => Number(req.params.id);
const today = () => new Date().toISOString().slice(0, 10);

/* ---------------------------------------------------------------- auth */

api.get('/auth/me', (req, res) => {
  const needsSetup = !db.prepare('SELECT 1 FROM users LIMIT 1').get();
  res.json({ user: currentUser(req), needsSetup });
});

api.post('/auth/setup', (req, res) => {
  if (db.prepare('SELECT 1 FROM users LIMIT 1').get()) throw httpError(403, 'Setup already completed');
  const { name, email, password } = req.body;
  need(name && email && password?.length >= 8, 'Name, email and a password of at least 8 characters are required');
  const { lastInsertRowid } = db.prepare('INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)')
    .run(name.trim(), email.trim(), hashPassword(password));
  createSession(res, Number(lastInsertRowid));
  res.json({ ok: true });
});

// Brute-force protection: after too many wrong passwords from one IP (or for one email),
// logins are refused for a while. Kept in memory; a restart clears it.
const LOGIN_WINDOW_MS = 15 * 60 * 1000, MAX_PER_IP = 10, MAX_PER_EMAIL = 5;
const failures = new Map(); // key -> timestamps of recent failed attempts
const recent = (key) => (failures.get(key) || []).filter((t) => Date.now() - t < LOGIN_WINDOW_MS);

api.post('/auth/login', (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const keys = [[`ip:${req.ip}`, MAX_PER_IP], [`email:${email}`, MAX_PER_EMAIL]];
  if (keys.some(([k, max]) => recent(k).length >= max))
    throw httpError(429, 'Too many failed attempts — try again in 15 minutes');
  const u = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!u || !verifyPassword(String(req.body.password || ''), u.password_hash)) {
    for (const [k] of keys) failures.set(k, [...recent(k), Date.now()]);
    throw httpError(401, 'Wrong email or password');
  }
  for (const [k] of keys) failures.delete(k);
  createSession(res, u.id);
  res.json({ ok: true });
});

api.post('/auth/logout', (req, res) => {
  destroySession(req, res);
  res.json({ ok: true });
});

api.use(requireAuth, checkRole);

/* ------------------------------------------------------------- accounts */

api.get('/users', (req, res) => {
  res.json(db.prepare('SELECT id, name, email, role, created_at FROM users ORDER BY name').all());
});

api.post('/users', (req, res) => {
  const { name, email, password, role = 'viewer' } = req.body;
  need(name && email && password?.length >= 8, 'Name, email and a password of at least 8 characters are required');
  need(ROLES.includes(role), 'Invalid role');
  try {
    db.prepare('INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)')
      .run(name.trim(), email.trim(), hashPassword(password), role);
  } catch {
    throw httpError(400, 'An account with this email already exists');
  }
  res.json({ ok: true });
});

// Admins can't change their own role, so there is always at least one admin left.
api.put('/users/:id/role', (req, res) => {
  need(ROLES.includes(req.body.role), 'Invalid role');
  need(idParam(req) !== req.user.id, "You can't change your own role");
  db.prepare('UPDATE users SET role = ? WHERE id = ?').run(req.body.role, idParam(req));
  res.json({ ok: true });
});

api.put('/users/me/password', (req, res) => {
  const { current, password } = req.body;
  const u = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.user.id);
  need(verifyPassword(String(current || ''), u.password_hash), 'Current password is wrong');
  need(password?.length >= 8, 'New password must have at least 8 characters');
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(password), req.user.id);
  res.json({ ok: true });
});

api.delete('/users/:id', (req, res) => {
  need(idParam(req) !== req.user.id, "You can't remove yourself");
  db.prepare('DELETE FROM users WHERE id = ?').run(idParam(req));
  res.json({ ok: true });
});

/* ------------------------------------------------------ profit split */

api.get('/settings/split', (req, res) => res.json(getSplit()));

api.put('/settings/split', (req, res) => {
  const s = readSplit(req.body);
  setSplit(s);
  res.json(s);
});

/* ----------------------------------------------------- sports & categories */

api.get('/event-types', (req, res) => {
  res.json(db.prepare(`
    SELECT et.id, et.name, et.default_fee, et.default_venue_fee, COUNT(e.id) AS events FROM event_types et
    LEFT JOIN events e ON e.type_id = et.id GROUP BY et.id ORDER BY et.name`).all()
    .map((t) => ({ ...t, default_fee: toRon(t.default_fee), default_venue_fee: toRon(t.default_venue_fee) })));
});

api.post('/event-types', (req, res) => {
  need(req.body.name?.trim(), 'Name is required');
  try {
    db.prepare('INSERT INTO event_types (name) VALUES (?)').run(req.body.name.trim());
  } catch {
    throw httpError(400, 'This sport already exists');
  }
  res.json({ ok: true });
});

// Name and the default prices new events of this sport start with.
api.put('/event-types/:id', (req, res) => {
  const t = db.prepare('SELECT * FROM event_types WHERE id = ?').get(idParam(req));
  if (!t) throw httpError(404, 'Sport not found');
  const { name = t.name, default_fee = toRon(t.default_fee), default_venue_fee = toRon(t.default_venue_fee) } = req.body;
  need(String(name).trim(), 'Name is required');
  need(Number(default_fee) >= 0 && Number(default_venue_fee) >= 0, 'Prices can’t be negative');
  need(Number(default_venue_fee) <= Number(default_fee), 'The venue’s part can’t be more than the full price');
  db.prepare('UPDATE event_types SET name = ?, default_fee = ?, default_venue_fee = ? WHERE id = ?')
    .run(String(name).trim(), toBani(default_fee), toBani(default_venue_fee), idParam(req));
  res.json({ ok: true });
});

api.delete('/event-types/:id', (req, res) => {
  need(!db.prepare('SELECT 1 FROM events WHERE type_id = ?').get(idParam(req)), 'This sport has events and cannot be deleted');
  db.prepare('DELETE FROM event_types WHERE id = ?').run(idParam(req));
  res.json({ ok: true });
});

api.get('/categories', (req, res) => {
  res.json(db.prepare(`
    SELECT c.id, c.name, c.kind, c.cost_group, COUNT(t.id) AS uses FROM categories c
    LEFT JOIN transactions t ON t.category_id = c.id GROUP BY c.id ORDER BY c.kind, c.cost_group DESC, c.id`).all());
});

api.post('/categories', (req, res) => {
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

api.put('/categories/:id', (req, res) => {
  const c = db.prepare('SELECT * FROM categories WHERE id = ?').get(idParam(req));
  if (!c) throw httpError(404, 'Category not found');
  const name = req.body.name?.trim() || c.name;
  const group = ['organizing', 'benefit'].includes(req.body.cost_group) ? req.body.cost_group : c.cost_group;
  db.prepare('UPDATE categories SET name = ?, cost_group = ? WHERE id = ?').run(name, group, c.id);
  res.json({ ok: true });
});

api.delete('/categories/:id', (req, res) => {
  db.prepare('DELETE FROM categories WHERE id = ?').run(idParam(req));
  res.json({ ok: true });
});

/* --------------------------------------------------------------- people */

api.get('/people', (req, res) => {
  res.json(db.prepare(`
    SELECT p.*, ${IS_MEMBER_SQL} AS is_member, (SELECT COUNT(*) FROM event_people ep WHERE ep.person_id = p.id) AS events,
      (SELECT COALESCE(SUM(ep.points), 0) FROM event_people ep WHERE ep.person_id = p.id) AS points,
      (SELECT COALESCE(SUM(h.qty * i.unit_price), 0) FROM stock_holdings h JOIN stock_items i ON i.id = h.item_id
        WHERE h.person_id = p.id) AS stock_value,
      (SELECT json_group_array(pd.discount_id) FROM person_discounts pd WHERE pd.person_id = p.id) AS discount_ids,
      (SELECT COALESCE(SUM(ed.amount), 0) FROM event_discounts ed WHERE ed.person_id = p.id AND ed.member = 0) AS discounts_received,
      (SELECT COUNT(*) FROM event_discounts ed WHERE ed.person_id = p.id AND ed.member = 0) AS discounted_events
    FROM people p ORDER BY p.active DESC, p.is_founder DESC, p.name`).all().map((p) => ({
    ...p, stock_value: toRon(p.stock_value), discounts_received: toRon(p.discounts_received), discount_ids: JSON.parse(p.discount_ids),
  })));
});

function readPerson(body) {
  need(body.name?.trim(), 'Name is required');
  return [body.name.trim(), body.is_founder ? 1 : 0, body.is_premium ? 1 : 0, body.active === false || body.active === 0 ? 0 : 1];
}

api.post('/people', (req, res) => {
  try {
    const { lastInsertRowid } = db.prepare('INSERT INTO people (name, is_founder, is_premium, active) VALUES (?, ?, ?, ?)').run(...readPerson(req.body));
    res.json({ id: Number(lastInsertRowid) });
  } catch (e) {
    if (e.status) throw e;
    throw httpError(400, 'A person with this name already exists');
  }
});

api.put('/people/:id', (req, res) => {
  db.prepare('UPDATE people SET name = ?, is_founder = ?, is_premium = ?, active = ? WHERE id = ?').run(...readPerson(req.body), idParam(req));
  res.json({ ok: true });
});

api.delete('/people/:id', (req, res) => {
  need(!db.prepare('SELECT 1 FROM stock_holdings WHERE person_id = ? AND qty > 0').get(idParam(req)),
    'This person still holds stock — move it to someone else first');
  need(!db.prepare('SELECT 1 FROM event_people WHERE person_id = ?').get(idParam(req)),
    'This person has organized events — mark them inactive instead, so their points history is kept');
  need(!db.prepare('SELECT 1 FROM event_discounts WHERE person_id = ?').get(idParam(req)),
    'This person received discounts at events — mark them inactive instead, so that history is kept');
  db.prepare('DELETE FROM people WHERE id = ?').run(idParam(req));
  res.json({ ok: true });
});

// Replace the set of discounts a person is entitled to.
api.put('/people/:id/discounts', (req, res) => {
  const ids = (req.body.discount_ids || []).map(Number).filter(Boolean);
  tx(() => {
    db.prepare('DELETE FROM person_discounts WHERE person_id = ?').run(idParam(req));
    const ins = db.prepare('INSERT INTO person_discounts (person_id, discount_id) VALUES (?, ?)');
    for (const d of ids) ins.run(idParam(req), d);
  });
  res.json({ ok: true });
});

/* ------------------------------------------------------------ discounts */

const shapeDiscount = (d) => ({ ...d, value: d.kind === 'fixed' ? toRon(d.value) : d.value });

api.get('/discounts', (req, res) => {
  res.json(db.prepare(`
    SELECT d.*, et.name AS sport_name,
      (SELECT json_group_array(json_object('id', p.id, 'name', p.name)) FROM person_discounts pd
        JOIN people p ON p.id = pd.person_id WHERE pd.discount_id = d.id) AS people,
      (SELECT COUNT(*) FROM event_discounts ed WHERE ed.discount_id = d.id) AS uses
    FROM discounts d LEFT JOIN event_types et ON et.id = d.sport_id ORDER BY d.name`).all()
    .map((d) => shapeDiscount({ ...d, people: JSON.parse(d.people) })));
});

function readDiscount(b) {
  need(b.name?.trim(), 'Name is required');
  need(['percent', 'fixed'].includes(b.kind), 'Choose a percentage or a fixed amount');
  const v = Number(b.value);
  need(Number.isFinite(v) && v > 0, 'The discount must be greater than 0');
  need(b.kind !== 'percent' || v <= 100, 'A percentage discount can be at most 100%');
  return [b.name.trim(), b.kind, b.kind === 'fixed' ? toBani(v) : v, b.sport_id ? Number(b.sport_id) : null];
}

api.post('/discounts', (req, res) => {
  try {
    const { lastInsertRowid } = db.prepare('INSERT INTO discounts (name, kind, value, sport_id) VALUES (?, ?, ?, ?)').run(...readDiscount(req.body));
    res.json({ id: Number(lastInsertRowid) });
  } catch (e) {
    if (e.status) throw e;
    throw httpError(400, 'A discount with this name already exists');
  }
});

// Editing a discount only affects events it is added to from now on.
api.put('/discounts/:id', (req, res) => {
  db.prepare('UPDATE discounts SET name = ?, kind = ?, value = ?, sport_id = ? WHERE id = ?').run(...readDiscount(req.body), idParam(req));
  res.json({ ok: true });
});

api.delete('/discounts/:id', (req, res) => {
  db.prepare('DELETE FROM discounts WHERE id = ?').run(idParam(req));
  res.json({ ok: true });
});

const discountAmount = (kind, value, fee) => Math.round(kind === 'percent' ? (fee * value) / 100 : Math.min(value, fee));

// Give a person a discount at an event: one of their saved discounts, or a one-off amount.
api.post('/events/:id/discounts', (req, res) => {
  const ev = db.prepare('SELECT * FROM events WHERE id = ?').get(idParam(req));
  if (!ev) throw httpError(404, 'Event not found');
  const { person_id, discount_id, amount, note, member } = req.body;
  need(person_id, 'Choose a person');
  let kind, value;
  if (member) {
    need(ev.venue_fee > 0, 'Set the venue cost per person on this event first — members pay only that');
    need(db.prepare(`SELECT 1 FROM people p WHERE p.id = ? AND ${IS_MEMBER_SQL}`).get(Number(person_id)),
      'Only founders, premium people and organisers get the member price');
    kind = 'fixed';
    value = memberReduction(ev.participation_fee, ev.venue_fee);
  } else if (discount_id) {
    const d = db.prepare('SELECT * FROM discounts WHERE id = ?').get(discount_id);
    need(d, 'Discount not found');
    ({ kind, value } = d);
  } else {
    need(Number(amount) > 0, 'Enter the discount amount');
    kind = 'fixed';
    value = toBani(amount);
  }
  const given = db.prepare('SELECT COUNT(*) n FROM event_discounts WHERE event_id = ?').get(ev.id).n;
  need(!ev.participants || given < ev.participants, `All ${ev.participants} participants already have a discount — raise the number of people first`);
  try {
    db.prepare(`INSERT INTO event_discounts (event_id, person_id, discount_id, kind, value, amount, note, member) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(ev.id, Number(person_id), !member && discount_id ? Number(discount_id) : null, kind, value,
        discountAmount(kind, value, ev.participation_fee), note?.trim() || null, member ? 1 : 0);
  } catch (e) {
    if (e.status) throw e;
    throw httpError(400, 'This person already pays a reduced price at this event');
  }
  res.json({ ok: true });
});

api.delete('/event-discounts/:id', (req, res) => {
  db.prepare('DELETE FROM event_discounts WHERE id = ?').run(idParam(req));
  res.json({ ok: true });
});

/* ---------------------------------------------------------------- stock */

api.get('/stock', (req, res) => {
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

function readItem(body) {
  need(body.name?.trim(), 'Item name is required');
  need(Number(body.unit_price) >= 0, 'Price must be 0 or more');
  return [body.name.trim(), body.unit?.trim() || 'pcs', toBani(body.unit_price)];
}

api.post('/stock/items', (req, res) => {
  const result = tx(() => {
    let id;
    try {
      id = Number(db.prepare('INSERT INTO stock_items (name, unit, unit_price) VALUES (?, ?, ?)').run(...readItem(req.body)).lastInsertRowid);
    } catch (e) {
      if (e.status) throw e;
      throw httpError(400, 'An item with this name already exists');
    }
    if (req.body.person_id && Number(req.body.qty) > 0)
      db.prepare('INSERT INTO stock_holdings (item_id, person_id, qty) VALUES (?, ?, ?)').run(id, Number(req.body.person_id), Number(req.body.qty));
    return { id };
  });
  res.json(result);
});

api.put('/stock/items/:id', (req, res) => {
  db.prepare('UPDATE stock_items SET name = ?, unit = ?, unit_price = ? WHERE id = ?').run(...readItem(req.body), idParam(req));
  res.json({ ok: true });
});

api.delete('/stock/items/:id', (req, res) => {
  need(!db.prepare('SELECT 1 FROM event_stock WHERE item_id = ?').get(idParam(req)), 'This item was used at events and cannot be deleted');
  db.prepare('DELETE FROM stock_items WHERE id = ?').run(idParam(req));
  res.json({ ok: true });
});

// Set (mode 'set') or add to (mode 'add') the quantity one person holds.
api.put('/stock/holdings', (req, res) => {
  const { item_id, person_id, qty, mode = 'set' } = req.body;
  need(item_id && person_id && Number.isFinite(Number(qty)), 'Item, person and quantity are required');
  const cur = db.prepare('SELECT qty FROM stock_holdings WHERE item_id = ? AND person_id = ?').get(item_id, person_id)?.qty || 0;
  const next = mode === 'add' ? cur + Number(qty) : Number(qty);
  need(next >= 0, 'Quantity cannot go below 0');
  db.prepare(`INSERT INTO stock_holdings (item_id, person_id, qty) VALUES (?, ?, ?)
    ON CONFLICT(item_id, person_id) DO UPDATE SET qty = excluded.qty`).run(item_id, person_id, next);
  res.json({ qty: next });
});

api.post('/stock/transfer', (req, res) => {
  const { item_id, from, to, qty } = req.body;
  need(item_id && from && to && from !== to && Number(qty) > 0, 'Choose an item, two different people and a quantity');
  tx(() => {
    const cur = db.prepare('SELECT qty FROM stock_holdings WHERE item_id = ? AND person_id = ?').get(item_id, from)?.qty || 0;
    need(cur >= Number(qty), `Only ${cur} available to move`);
    db.prepare('UPDATE stock_holdings SET qty = qty - ? WHERE item_id = ? AND person_id = ?').run(Number(qty), item_id, from);
    db.prepare(`INSERT INTO stock_holdings (item_id, person_id, qty) VALUES (?, ?, ?)
      ON CONFLICT(item_id, person_id) DO UPDATE SET qty = qty + excluded.qty`).run(item_id, to, Number(qty));
  });
  res.json({ ok: true });
});

/* --------------------------------------------------------------- events */

function readEvent(body) {
  const { name, type_id, activity_id, date, end_date, location, status = LIVE, participants, participation_fee, venue_fee, budget, notes } = body;
  need(name?.trim(), 'Event name is required');
  need(type_id, 'Sport is required');
  need(isDate(date), 'A valid date is required');
  need(!end_date || (isDate(end_date) && end_date >= date), 'End date must be after the start date');
  need(['planned', 'completed', 'cancelled'].includes(status), 'Invalid status');
  need(toBani(venue_fee) >= 0 && toBani(venue_fee) <= toBani(participation_fee), 'The venue cost per person can’t be more than the price');
  return [name.trim(), Number(type_id), activity_id ? Number(activity_id) : null, date, end_date || null, location?.trim() || null,
    status, Math.max(0, Number(participants) || 0), toBani(participation_fee), toBani(venue_fee), toBani(budget), notes?.trim() || null];
}

api.get('/events', (req, res) => {
  const where = [], params = [];
  if (req.query.year) { where.push("strftime('%Y', e.date) = ?"); params.push(String(req.query.year)); }
  if (req.query.type) { where.push('e.type_id = ?'); params.push(Number(req.query.type)); }
  if (req.query.status) { where.push('e.status = ?'); params.push(String(req.query.status)); }
  if (req.query.q) {
    where.push('(e.name LIKE ? OR e.location LIKE ? OR et.name LIKE ?)');
    const q = `%${req.query.q}%`;
    params.push(q, q, q);
  }
  res.json(loadEvents(where.length ? 'WHERE ' + where.join(' AND ') : '', params, 'ORDER BY e.date DESC'));
});

api.get('/events/:id', (req, res) => {
  const [e] = loadEvents('WHERE e.id = ?', [idParam(req)]);
  if (!e) throw httpError(404, 'Event not found');
  e.people = db.prepare(`SELECT ep.*, p.name, p.is_founder FROM event_people ep JOIN people p ON p.id = ep.person_id
    WHERE ep.event_id = ? ORDER BY ep.role, p.name`).all(e.id);
  e.discountList = db.prepare(`SELECT ed.*, p.name AS person_name, d.name AS discount_name FROM event_discounts ed
    JOIN people p ON p.id = ed.person_id LEFT JOIN discounts d ON d.id = ed.discount_id WHERE ed.event_id = ? ORDER BY ed.member DESC, p.name`)
    .all(e.id).map((d) => ({ ...d, amount: toRon(d.amount), value: d.kind === 'fixed' ? toRon(d.value) : d.value }));
  e.stock = db.prepare(`SELECT s.*, i.name AS item_name, i.unit, p.name AS person_name FROM event_stock s
    JOIN stock_items i ON i.id = s.item_id LEFT JOIN people p ON p.id = s.person_id WHERE s.event_id = ? ORDER BY s.id`)
    .all(e.id).map((s) => ({ ...s, unit_price: toRon(s.unit_price), cost: r2(s.qty * toRon(s.unit_price)) }));
  res.json(e);
});

const insertEventPeople = (eventId, people = []) => {
  const ins = db.prepare('INSERT INTO event_people (event_id, person_id, role, points) VALUES (?, ?, ?, ?)');
  for (const p of people) {
    if (!p.person_id) continue;
    need(['organizer', 'co-organizer'].includes(p.role), 'Invalid organizer role');
    ins.run(eventId, Number(p.person_id), p.role, Math.max(0, Number(p.points) || 0));
  }
};

api.post('/events', (req, res) => {
  const id = tx(() => {
    const id = Number(db.prepare(`
      INSERT INTO events (name, type_id, activity_id, date, end_date, location, status, participants, participation_fee, venue_fee, budget, notes, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(...readEvent(req.body), req.user.id).lastInsertRowid);
    insertEventPeople(id, req.body.people);
    return id;
  });
  res.json({ id });
});

api.put('/events/:id', (req, res) => {
  db.prepare(`
    UPDATE events SET name = ?, type_id = ?, activity_id = ?, date = ?, end_date = ?, location = ?, status = ?, participants = ?,
      participation_fee = ?, venue_fee = ?, budget = ?, notes = ? WHERE id = ?`).run(...readEvent(req.body), idParam(req));
  // A new price changes what each discount (and the member price) is worth at this event.
  const { participation_fee: fee = 0, venue_fee: venue = 0 } = db.prepare('SELECT * FROM events WHERE id = ?').get(idParam(req)) || {};
  for (const d of db.prepare('SELECT * FROM event_discounts WHERE event_id = ?').all(idParam(req))) {
    const value = d.member ? memberReduction(fee, venue) : d.value;
    db.prepare('UPDATE event_discounts SET value = ?, amount = ? WHERE id = ?').run(value, discountAmount(d.kind, value, fee), d.id);
  }
  res.json({ ok: true });
});

api.put('/events/:id/status', (req, res) => {
  need(['planned', 'completed', 'cancelled'].includes(req.body.status), 'Invalid status');
  db.prepare('UPDATE events SET status = ? WHERE id = ?').run(req.body.status, idParam(req));
  res.json({ ok: true });
});

// Deleting an event gives its used stock back to whoever it was taken from.
api.delete('/events/:id', (req, res) => {
  tx(() => {
    for (const s of db.prepare('SELECT * FROM event_stock WHERE event_id = ?').all(idParam(req))) returnStock(s);
    db.prepare('DELETE FROM events WHERE id = ?').run(idParam(req));
  });
  res.json({ ok: true });
});

api.post('/events/:id/people', (req, res) => {
  insertEventPeople(idParam(req), [req.body]);
  res.json({ ok: true });
});

api.put('/event-people/:id', (req, res) => {
  const { role, points } = req.body;
  need(['organizer', 'co-organizer'].includes(role), 'Invalid organizer role');
  db.prepare('UPDATE event_people SET role = ?, points = ? WHERE id = ?').run(role, Math.max(0, Number(points) || 0), idParam(req));
  res.json({ ok: true });
});

api.delete('/event-people/:id', (req, res) => {
  db.prepare('DELETE FROM event_people WHERE id = ?').run(idParam(req));
  res.json({ ok: true });
});

function returnStock(s) {
  if (!s.person_id) return;
  db.prepare(`INSERT INTO stock_holdings (item_id, person_id, qty) VALUES (?, ?, ?)
    ON CONFLICT(item_id, person_id) DO UPDATE SET qty = qty + excluded.qty`).run(s.item_id, s.person_id, s.qty);
}

// Use products from someone's stock at an event: cost = qty × current price, stock goes down.
api.post('/events/:id/stock', (req, res) => {
  const { item_id, person_id, qty } = req.body;
  need(item_id && person_id && Number(qty) > 0, 'Choose a product, who it comes from and a quantity');
  tx(() => {
    const item = db.prepare('SELECT * FROM stock_items WHERE id = ?').get(item_id);
    need(item, 'Product not found');
    const held = db.prepare('SELECT qty FROM stock_holdings WHERE item_id = ? AND person_id = ?').get(item_id, person_id)?.qty || 0;
    need(held >= Number(qty), `Only ${held} ${item.unit} of ${item.name} available from this person`);
    db.prepare('UPDATE stock_holdings SET qty = qty - ? WHERE item_id = ? AND person_id = ?').run(Number(qty), item_id, person_id);
    db.prepare('INSERT INTO event_stock (event_id, item_id, person_id, qty, unit_price) VALUES (?, ?, ?, ?, ?)')
      .run(idParam(req), item_id, person_id, Number(qty), item.unit_price);
  });
  res.json({ ok: true });
});

api.delete('/event-stock/:id', (req, res) => {
  tx(() => {
    const s = db.prepare('SELECT * FROM event_stock WHERE id = ?').get(idParam(req));
    if (!s) return;
    returnStock(s);
    db.prepare('DELETE FROM event_stock WHERE id = ?').run(s.id);
  });
  res.json({ ok: true });
});

/* --------------------------------------------------------- transactions */

const shapeTx = (t) => ({ ...t, amount: toRon(t.amount) });

function readTx(body) {
  const { event_id, kind, category_id, amount, date, description, payment_method, fund_sport_id } = body;
  need(['income', 'expense'].includes(kind), 'Choose income or expense');
  need(Number(amount) > 0, 'Amount must be greater than 0');
  need(isDate(date), 'A valid date is required');
  return [event_id ? Number(event_id) : null, kind, category_id ? Number(category_id) : null, toBani(amount), date,
    description?.trim() || null, payment_method || null, !event_id && fund_sport_id ? Number(fund_sport_id) : null];
}

api.get('/transactions', (req, res) => {
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
    SELECT t.*, c.name AS category_name, c.cost_group, e.name AS event_name, f.name AS fund_name, u.name AS created_by_name
    FROM transactions t
    LEFT JOIN categories c ON c.id = t.category_id
    LEFT JOIN events e ON e.id = t.event_id
    LEFT JOIN event_types f ON f.id = t.fund_sport_id
    LEFT JOIN users u ON u.id = t.created_by
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY t.date DESC, t.id DESC`).all(...params);
  res.json(rows.map(shapeTx));
});

api.post('/transactions', (req, res) => {
  const { lastInsertRowid } = db.prepare(`
    INSERT INTO transactions (event_id, kind, category_id, amount, date, description, payment_method, fund_sport_id, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(...readTx(req.body), req.user.id);
  res.json({ id: Number(lastInsertRowid) });
});

api.put('/transactions/:id', (req, res) => {
  db.prepare(`
    UPDATE transactions SET event_id = ?, kind = ?, category_id = ?, amount = ?, date = ?, description = ?,
      payment_method = ?, fund_sport_id = ? WHERE id = ?`).run(...readTx(req.body), idParam(req));
  res.json({ ok: true });
});

api.delete('/transactions/:id', (req, res) => {
  db.prepare('DELETE FROM transactions WHERE id = ?').run(idParam(req));
  res.json({ ok: true });
});

/* ------------------------------------------------- month split targets */

const isMonth = (s) => /^\d{4}-\d{2}$/.test(s || '');

function readSplit(body) {
  const s = { foundersStandard: Number(body.foundersStandard), foundersPoints: Number(body.foundersPoints),
    generalShare: Number(body.generalShare) };
  need(Object.values(s).every((v) => Number.isFinite(v) && v >= 0), 'Percentages must be positive numbers');
  need(s.foundersStandard + s.foundersPoints <= 100, 'Founders + organisers cannot exceed 100%');
  need(s.generalShare <= 100, "General fund share can't exceed 100%");
  return s;
}

api.get('/splits/:month', (req, res) => {
  need(isMonth(req.params.month), 'Invalid month');
  res.json({ split: splitResolver()(req.params.month), default: getSplit() });
});

api.put('/splits/:month', (req, res) => {
  need(isMonth(req.params.month), 'Invalid month');
  setMonthSplit(req.params.month, readSplit(req.body));
  res.json({ ok: true });
});

api.delete('/splits/:month', (req, res) => {
  setMonthSplit(req.params.month, null);
  res.json({ ok: true });
});

/* ------------------------------------------- points catalogue & contributions */

api.get('/activities', (req, res) => {
  res.json(db.prepare(`SELECT a.*, et.name AS sport_name,
      (SELECT COUNT(*) FROM events e WHERE e.activity_id = a.id) + (SELECT COUNT(*) FROM contributions c WHERE c.activity_id = a.id) AS uses
    FROM activities a LEFT JOIN event_types et ON et.id = a.sport_id ORDER BY a.sort, a.id`).all());
});

function readActivity(b) {
  need(b.name?.trim(), 'Name is required');
  const num = (v) => (v === '' || v == null ? null : Math.max(0, Number(v)));
  return [b.name.trim(), num(b.organizer_points) ?? 0, num(b.organizer_max), num(b.co_points) ?? 0, num(b.co_max),
    b.sport_id ? Number(b.sport_id) : null];
}

api.post('/activities', (req, res) => {
  const sort = db.prepare('SELECT COALESCE(MAX(sort), 0) + 1 AS n FROM activities').get().n;
  try {
    db.prepare(`INSERT INTO activities (name, organizer_points, organizer_max, co_points, co_max, sport_id, sort)
      VALUES (?, ?, ?, ?, ?, ?, ?)`).run(...readActivity(req.body), sort);
  } catch (e) {
    if (e.status) throw e;
    throw httpError(400, 'An activity with this name already exists');
  }
  res.json({ ok: true });
});

api.put('/activities/:id', (req, res) => {
  db.prepare(`UPDATE activities SET name = ?, organizer_points = ?, organizer_max = ?, co_points = ?, co_max = ?, sport_id = ?
    WHERE id = ?`).run(...readActivity(req.body), idParam(req));
  res.json({ ok: true });
});

api.delete('/activities/:id', (req, res) => {
  db.prepare('DELETE FROM activities WHERE id = ?').run(idParam(req));
  res.json({ ok: true });
});

function readContribution(b) {
  need(b.person_id, 'Choose a person');
  need(isDate(b.date), 'A valid date is required');
  need(Number(b.points) >= 0, 'Points must be 0 or more');
  return [Number(b.person_id), b.activity_id ? Number(b.activity_id) : null, b.date, Number(b.points) || 0, b.note?.trim() || null];
}

api.post('/contributions', (req, res) => {
  db.prepare('INSERT INTO contributions (person_id, activity_id, date, points, note, created_by) VALUES (?, ?, ?, ?, ?, ?)')
    .run(...readContribution(req.body), req.user.id);
  res.json({ ok: true });
});

api.put('/contributions/:id', (req, res) => {
  db.prepare('UPDATE contributions SET person_id = ?, activity_id = ?, date = ?, points = ?, note = ? WHERE id = ?')
    .run(...readContribution(req.body), idParam(req));
  res.json({ ok: true });
});

api.delete('/contributions/:id', (req, res) => {
  db.prepare('DELETE FROM contributions WHERE id = ?').run(idParam(req));
  res.json({ ok: true });
});

/* ---------------------------------------------------------------- funds */

api.get('/funds', (req, res) => res.json({ ...computeFunds(), split: getSplit() }));

api.get(['/founders', '/payouts'], (req, res) => {
  res.json(computeFounders(isMonth(req.query.month) ? req.query.month : today().slice(0, 7)));
});

api.get('/monthly', (req, res) => {
  const year = /^\d{4}$/.test(req.query.year || '') ? req.query.year : today().slice(0, 4);
  res.json(computeYear(year));
});

api.get('/sports/summary', (req, res) => {
  const funds = computeFunds();
  const counts = db.prepare(`SELECT type_id, COUNT(*) AS n, SUM(status = 'planned') AS live, MAX(date) AS last
    FROM events WHERE status != 'cancelled' GROUP BY type_id`).all();
  res.json(funds.sports.map((s) => {
    const c = counts.find((x) => x.type_id === s.id);
    return { ...s, totalEvents: c?.n || 0, liveEvents: c?.live || 0, lastEvent: c?.last || null };
  }));
});

api.get('/sports/:id', (req, res) => {
  const r = computeSport(idParam(req));
  if (!r) throw httpError(404, 'Sport not found');
  res.json(r);
});

/* ---------------------------------------------------------------- stats */

api.get('/stats/years', (req, res) => {
  const rows = db.prepare(`SELECT DISTINCT strftime('%Y', date) AS y FROM events
    UNION SELECT DISTINCT strftime('%Y', date) FROM transactions ORDER BY y DESC`).all();
  const years = rows.map((r) => r.y);
  const now = today().slice(0, 4);
  if (!years.includes(now)) years.unshift(now);
  res.json(years.sort().reverse());
});

// Overview for a year (or all years) and optionally one sport. Money figures use
// finalized events only; live events are listed separately.
api.get('/stats', (req, res) => {
  const year = req.query.year ? String(req.query.year) : null;
  const type = req.query.type ? Number(req.query.type) : null;
  const scope = (y) => {
    const w = ["e.status != 'cancelled'"], p = [];
    if (y) { w.push("strftime('%Y', e.date) = ?"); p.push(y); }
    if (type) { w.push('e.type_id = ?'); p.push(type); }
    return loadEvents('WHERE ' + w.join(' AND '), p);
  };
  const sum = (list) => {
    const income = r2(list.reduce((s, e) => s + e.income, 0)), expenses = r2(list.reduce((s, e) => s + e.expenses, 0));
    return { income, expenses, profit: r2(income - expenses) };
  };
  const events = scope(year);
  const held = events.filter((e) => e.status === FINALIZED);
  const live = events.filter((e) => e.status === LIVE);
  const totals = sum(held);
  const previous = year ? sum(scope(String(Number(year) - 1)).filter((e) => e.status === FINALIZED)) : null;

  const periodOf = (d) => (year ? d.slice(5, 7) : d.slice(0, 4));
  const buckets = new Map();
  if (year) for (let m = 1; m <= 12; m++) buckets.set(String(m).padStart(2, '0'), []);
  for (const e of held) (buckets.get(periodOf(e.date)) || buckets.set(periodOf(e.date), []).get(periodOf(e.date))).push(e);
  let running = 0;
  const now = today();
  const periods = [...buckets.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([period, list]) => {
    const s = sum(list);
    running += s.profit;
    const future = year && `${year}-${period}` > now.slice(0, 7) && !list.length;
    return { period, ...s, events: list.length, cumulative: future ? null : r2(running) };
  });

  const byType = db.prepare('SELECT id, name FROM event_types ORDER BY name').all()
    .filter((t) => !type || t.id === type)
    .map((t) => {
      const list = held.filter((e) => e.type_id === t.id);
      return { id: t.id, name: t.name, events: list.length, ...sum(list) };
    }).filter((t) => t.events || !type);

  // Category breakdowns for the finalized events in scope.
  const ids = held.map((e) => e.id);
  const inList = ids.length ? `t.event_id IN (${ids.map(() => '?').join(',')})` : '0';
  const byCategory = (kind) => db.prepare(`
    SELECT COALESCE(c.name, 'Uncategorised') AS name, SUM(t.amount) AS total FROM transactions t
    LEFT JOIN categories c ON c.id = t.category_id WHERE ${inList} AND t.kind = ? GROUP BY c.id`)
    .all(...ids, kind).map((r) => ({ name: r.name, total: toRon(r.total) }));
  const expenseByCategory = byCategory('expense');
  const stockCost = r2(held.reduce((s, e) => s + e.stock_cost, 0));
  if (stockCost) expenseByCategory.push({ name: 'Products from stock', total: stockCost });
  const venueCost = r2(held.reduce((s, e) => s + e.venue_cost, 0));
  if (venueCost) expenseByCategory.push({ name: 'Venue rental', total: venueCost });
  const incomeByCategory = byCategory('income');
  const feeIncome = r2(held.reduce((s, e) => s + e.fee_income, 0));
  const discountsGiven = r2(held.reduce((s, e) => s + e.discounts, 0));
  if (feeIncome) incomeByCategory.push({ name: 'Participation fees (people × price − discounts)', total: feeIncome });
  const merge = (list) => [...list.reduce((m, x) => m.set(x.name, (m.get(x.name) || 0) + x.total), new Map())]
    .map(([name, total]) => ({ name, total: r2(total) })).sort((a, b) => b.total - a.total);

  const participants = held.reduce((s, e) => s + e.participants, 0);
  res.json({
    totals,
    previous,
    split: {
      founders: r2(held.reduce((s, e) => s + e.split.founders, 0)),
      general: r2(held.reduce((s, e) => s + e.split.general, 0)),
      sport: r2(held.reduce((s, e) => s + e.split.sport, 0)),
    },
    costs: {
      organizing: r2(held.reduce((s, e) => s + e.organizing, 0)),
      benefits: r2(held.reduce((s, e) => s + e.benefits, 0)),
    },
    kpis: {
      margin: totals.income ? totals.profit / totals.income : null,
      events: events.length,
      completed: held.length,
      planned: live.length,
      profitable: held.filter((e) => e.profit > 0).length,
      avgProfit: held.length ? totals.profit / held.length : null,
      participants,
      avgParticipants: held.length ? participants / held.length : null,
      incomePerParticipant: participants ? totals.income / participants : null,
      costPerParticipant: participants ? totals.expenses / participants : null,
      discounts: discountsGiven,
      discountedEntries: held.reduce((s, e) => s + e.discount_count, 0),
    },
    periods,
    byType,
    expenseByCategory: merge(expenseByCategory),
    incomeByCategory: merge(incomeByCategory),
    events,
    live: loadEvents(`WHERE e.status = 'planned' ${type ? 'AND e.type_id = ?' : ''}`, type ? [type] : [], 'ORDER BY e.date LIMIT 8'),
  });
});

/* --------------------------------------------------------------- import */

// Rows arrive already parsed by the browser:
//   events: [{ key, name, date, type_id }]
//   rows:   [{ date, kind, amount, description, category_id, event_key }]
// Events are matched to existing ones by name + date; transactions identical to an
// existing one (same event, date, kind, amount, description) are skipped.
api.post('/import', (req, res) => {
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

api.get('/imports', (req, res) => {
  res.json(db.prepare(`
    SELECT i.id, i.source, i.created_at, u.name AS created_by_name,
      (SELECT COUNT(*) FROM transactions t WHERE t.import_id = i.id) AS transactions,
      (SELECT COUNT(*) FROM events e WHERE e.import_id = i.id) AS events
    FROM imports i LEFT JOIN users u ON u.id = i.created_by ORDER BY i.id DESC LIMIT 20`).all());
});

// Undo an import: removes its transactions, and the events it created unless
// someone has since added other transactions, stock or organizers to them.
api.delete('/imports/:id', (req, res) => {
  const id = idParam(req);
  tx(() => {
    db.prepare('DELETE FROM transactions WHERE import_id = ?').run(id);
    db.prepare(`DELETE FROM events WHERE import_id = ?
      AND NOT EXISTS (SELECT 1 FROM transactions t WHERE t.event_id = events.id)
      AND NOT EXISTS (SELECT 1 FROM event_stock s WHERE s.event_id = events.id)
      AND NOT EXISTS (SELECT 1 FROM event_people p WHERE p.event_id = events.id)`).run(id);
    db.prepare('UPDATE events SET import_id = NULL WHERE import_id = ?').run(id);
    db.prepare('DELETE FROM imports WHERE id = ?').run(id);
  });
  res.json({ ok: true });
});

/* --------------------------------------------------------------- export */

api.get('/export/transactions.csv', (req, res) => {
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

/* ---------------------------------------------------------- errors/static */

api.use((req, res) => res.status(404).json({ error: 'Not found' }));

app.use((err, req, res, next) => {
  if (!err.status) console.error(err);
  res.status(err.status || 500).json({ error: err.status ? err.message : 'Something went wrong' });
});

const dist = resolve(dirname(fileURLToPath(import.meta.url)), '../client/dist');
if (existsSync(dist)) {
  app.use(express.static(dist));
  app.get('/{*splat}', (req, res) => res.sendFile(resolve(dist, 'index.html')));
}

const port = Number(process.env.PORT || 3001);
const host = process.env.HOST || '0.0.0.0'; // use 127.0.0.1 behind a reverse proxy
app.listen(port, host, () => console.log(`Active Management on http://${host}:${port}`));
