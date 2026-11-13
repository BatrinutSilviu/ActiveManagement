// App accounts (admins, editors, viewers) and changing one's own password.
import express from 'express';
import { hashPassword, ROLES, verifyPassword } from '../auth.js';
import { db } from '../db.js';
import { httpError, idParam, need } from '../http.js';

export const router = express.Router();

router.get('/users', (req, res) => {
  res.json(db.prepare('SELECT id, name, email, role, created_at FROM users ORDER BY name').all());
});

router.post('/users', (req, res) => {
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
router.put('/users/:id/role', (req, res) => {
  need(ROLES.includes(req.body.role), 'Invalid role');
  need(idParam(req) !== req.user.id, "You can't change your own role");
  db.prepare('UPDATE users SET role = ? WHERE id = ?').run(req.body.role, idParam(req));
  res.json({ ok: true });
});

router.put('/users/me/password', (req, res) => {
  const { current, password } = req.body;
  const u = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.user.id);
  need(verifyPassword(String(current || ''), u.password_hash), 'Current password is wrong');
  need(password?.length >= 8, 'New password must have at least 8 characters');
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(password), req.user.id);
  res.json({ ok: true });
});

router.delete('/users/:id', (req, res) => {
  need(idParam(req) !== req.user.id, "You can't remove yourself");
  db.prepare('DELETE FROM users WHERE id = ?').run(idParam(req));
  res.json({ ok: true });
});
