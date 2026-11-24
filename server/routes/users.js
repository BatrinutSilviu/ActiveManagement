// App accounts (admins, editors, viewers, and parents for a practice) and changing one's own password.
import express from 'express';
import { endSessions, hashPassword, PARENT, ROLES, verifyPassword } from '../auth.js';
import { featureOn } from '../domain/business.js';
import { db, tx } from '../db.js';
import { httpError, idParam, need } from '../http.js';

export const router = express.Router({ caseSensitive: true });

router.get('/users', (req, res) => {
  const kids = db.prepare('SELECT pc.user_id, c.id, c.name FROM parent_clients pc JOIN clients c ON c.id = pc.client_id ORDER BY c.name').all();
  res.json(db.prepare(`SELECT id, name, email, CASE WHEN parent = 1 THEN 'parent' ELSE role END AS role, created_at FROM users ORDER BY name`).all()
    .map((u) => ({ ...u, children: u.role === PARENT ? kids.filter((k) => k.user_id === u.id).map(({ id, name }) => ({ id, name })) : [] })));
});

// A parent account: only where there are patients (a practice), and stored as a viewer flagged parent.
const roleOk = (role) => ROLES.includes(role) || (role === PARENT && featureOn('practice'));

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
  tx(() => {
    let id;
    try {
      id = Number(db.prepare('INSERT INTO users (name, email, password_hash, role, parent) VALUES (?, ?, ?, ?, ?)')
        .run(name.trim(), email.trim().toLowerCase(), hashPassword(password), role === PARENT ? 'viewer' : role, role === PARENT ? 1 : 0).lastInsertRowid);
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
  tx(() => {
    db.prepare('UPDATE users SET role = ?, parent = ? WHERE id = ?').run(role === PARENT ? 'viewer' : role, role === PARENT ? 1 : 0, idParam(req));
    if (role !== PARENT) db.prepare('DELETE FROM parent_clients WHERE user_id = ?').run(idParam(req));
  });
  endSessions(idParam(req)); // the new role counts from their next sign-in
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
