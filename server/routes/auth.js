// Signing in and out, and creating the first account.
import express from 'express';
import { createSession, currentUser, destroySession, hashPassword, verifyPassword } from '../auth.js';
import { db } from '../db.js';
import { httpError, need } from '../http.js';

export const router = express.Router({ caseSensitive: true });

router.get('/auth/me', (req, res) => {
  const needsSetup = !db.prepare('SELECT 1 FROM users LIMIT 1').get();
  res.json({ user: currentUser(req), needsSetup });
});

router.post('/auth/setup', (req, res) => {
  if (db.prepare('SELECT 1 FROM users LIMIT 1').get()) throw httpError(403, 'Setup already completed');
  const { name, email, password } = req.body;
  need(name && email && password?.length >= 8, 'Name, email and a password of at least 8 characters are required');
  const { lastInsertRowid } = db.prepare('INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)')
    .run(name.trim(), email.trim().toLowerCase(), hashPassword(password));
  createSession(res, Number(lastInsertRowid));
  res.json({ ok: true });
});

// Brute-force protection: after too many wrong passwords from one IP (or for one email),
// logins are refused for a while. Kept in memory; a restart clears it.
const LOGIN_WINDOW_MS = 15 * 60 * 1000, MAX_PER_IP = 10, MAX_PER_EMAIL = 5;
const failures = new Map(); // key -> timestamps of recent failed attempts
const recent = (key) => (failures.get(key) || []).filter((t) => Date.now() - t < LOGIN_WINDOW_MS);
// Forget old failures so the map doesn't grow forever.
setInterval(() => {
  for (const key of failures.keys()) if (!recent(key).length) failures.delete(key);
}, LOGIN_WINDOW_MS).unref();

router.post('/auth/login', (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const keys = [[`ip:${req.ip}`, MAX_PER_IP], [`email:${email}`, MAX_PER_EMAIL]];
  if (keys.some(([k, max]) => recent(k).length >= max))
    throw httpError(429, 'Too many failed attempts — try again in 15 minutes');
  const u = db.prepare('SELECT * FROM users WHERE lower(email) = ?').get(email);
  // verifyPassword runs for unknown emails too (against a dummy hash), so timing reveals nothing.
  if (!verifyPassword(String(req.body.password || ''), u?.password_hash) || !u) {
    for (const [k] of keys) failures.set(k, [...recent(k), Date.now()]);
    throw httpError(401, 'Wrong email or password');
  }
  for (const [k] of keys) failures.delete(k);
  createSession(res, u.id);
  res.json({ ok: true });
});

router.post('/auth/logout', (req, res) => {
  destroySession(req, res);
  res.json({ ok: true });
});
