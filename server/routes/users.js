// App accounts (admins, editors, viewers; parents for a practice, organizers for community events) and changing one's own password.
import express from 'express';
import { endSessions, hashPassword, PARENT, ROLES, verifyPassword } from '../auth.js';
import { featureOn } from '../domain/business.js';
import { ORGANIZER } from '../domain/organizer.js';
import { db, tx } from '../db.js';
import { httpError, idParam, need } from '../http.js';

export const router = express.Router({ caseSensitive: true });

router.get('/users', (req, res) => {
  const kids = db.prepare('SELECT pc.user_id, c.id, c.name FROM parent_clients pc JOIN clients c ON c.id = pc.client_id ORDER BY c.name').all();
  res.json(db.prepare(`SELECT u.id, u.name, u.email, CASE WHEN u.parent = 1 THEN 'parent' WHEN u.organizer = 1 THEN 'organizer' ELSE u.role END AS role,
      u.created_at, u.person_id, p.name AS person_name FROM users u LEFT JOIN people p ON p.id = u.person_id ORDER BY u.name`).all()
    .map((u) => ({ ...u, children: u.role === PARENT ? kids.filter((k) => k.user_id === u.id).map(({ id, name }) => ({ id, name })) : [] })));
});

// A parent account: only where there are patients (a practice); an organizer: only where there are events. Both are
// stored as a viewer with their flag (parent / organizer), so without the flag they'd still change nothing.
const roleOk = (role) => ROLES.includes(role) || (role === PARENT && featureOn('practice')) || (role === ORGANIZER && featureOn('events'));
const flags = (role) => ({ role: [PARENT, ORGANIZER].includes(role) ? 'viewer' : role, parent: role === PARENT ? 1 : 0, organizer: role === ORGANIZER ? 1 : 0 });
/** The person (People) an organizer account is: required for one. */
function personFor(role, personId) {
  if (role !== ORGANIZER) return null;
  const id = Number(personId);
  need(id && db.prepare('SELECT 1 FROM people WHERE id = ?').get(id), 'Pick who this organizer is (from People)');
  return id;
}

/** Links a parent to exactly these patients (their children). */
function setChildren(userId, ids) {
  const list = [...new Set((Array.isArray(ids) ? ids : []).map(Number).filter(Boolean))];
  for (const id of list) need(db.prepare('SELECT 1 FROM clients WHERE id = ?').get(id), 'This patient no longer exists');
  db.prepare('DELETE FROM parent_clients WHERE user_id = ?').run(userId);
  for (const id of list) db.prepare('INSERT INTO parent_clients (user_id, client_id) VALUES (?, ?)').run(userId, id);
}

router.post('/users', (req, res) => {
  const { name, email, password, role = 'viewer' } = req.body;
  need(name && email && password?.length >= 8, 'Name, email and a password of at least 8 characters are required');
  need(roleOk(role), 'Invalid role');
  if (role === PARENT) need(Array.isArray(req.body.children) && req.body.children.length, 'Pick the child (or children) this parent can see');
  const person = personFor(role, req.body.person_id), fl = flags(role);
  tx(() => {
    let id;
    try {
      id = Number(db.prepare('INSERT INTO users (name, email, password_hash, role, parent, organizer, person_id) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(name.trim(), email.trim().toLowerCase(), hashPassword(password), fl.role, fl.parent, fl.organizer, person).lastInsertRowid);
    } catch {
      throw httpError(400, 'An account with this email already exists');
    }
    if (role === PARENT) setChildren(id, req.body.children);
  });
  res.json({ ok: true });
});

// Admins can't change their own role, so there is always at least one admin left.
router.put('/users/:id/role', (req, res) => {
  const { role } = req.body;
  need(roleOk(role), 'Invalid role');
  need(idParam(req) !== req.user.id, "You can't change your own role");
  // Becoming a parent starts with no child (they see nothing until one is picked); leaving it drops the links.
  // Becoming an organizer needs the person they are (person_id), else they see no event.
  const fl = flags(role);
  tx(() => {
    const person = role === ORGANIZER ? (req.body.person_id ? personFor(role, req.body.person_id) : null) : null;
    db.prepare('UPDATE users SET role = ?, parent = ?, organizer = ?, person_id = ? WHERE id = ?').run(fl.role, fl.parent, fl.organizer, person, idParam(req));
    if (role !== PARENT) db.prepare('DELETE FROM parent_clients WHERE user_id = ?').run(idParam(req));
  });
  endSessions(idParam(req)); // the new role counts from their next sign-in
  res.json({ ok: true });
});

// Who an organizer account is (People): they see and run that person's events.
router.put('/users/:id/person', (req, res) => {
  need(db.prepare('SELECT organizer FROM users WHERE id = ?').get(idParam(req))?.organizer, 'Only an organizer account is linked to a person');
  db.prepare('UPDATE users SET person_id = ? WHERE id = ?').run(personFor(ORGANIZER, req.body.person_id), idParam(req));
  res.json({ ok: true });
});

// The children a parent account can see.
router.put('/users/:id/children', (req, res) => {
  need(db.prepare('SELECT parent FROM users WHERE id = ?').get(idParam(req))?.parent, 'Only a parent account has children to pick');
  tx(() => setChildren(idParam(req), req.body.children));
  res.json({ ok: true });
});

router.put('/users/me/password', (req, res) => {
  const { current, password } = req.body;
  const u = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.user.id);
  need(verifyPassword(String(current || ''), u.password_hash), 'Current password is wrong');
  need(password?.length >= 8, 'New password must have at least 8 characters');
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(password), req.user.id);
  endSessions(req.user.id, req); // signed out everywhere else
  res.json({ ok: true });
});

router.delete('/users/:id', (req, res) => {
  need(idParam(req) !== req.user.id, "You can't remove yourself");
  db.prepare('DELETE FROM users WHERE id = ?').run(idParam(req));
  res.json({ ok: true });
});
