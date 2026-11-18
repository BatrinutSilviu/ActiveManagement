// Signing in and out, and creating the first account.
import express from 'express';
import { createSession, currentUser, destroySession, hashPassword, verifyPassword } from '../auth.js';
import { db, seedBusiness, tx } from '../db.js';
import { getBusiness, readBusiness, setBusiness } from '../domain/business.js';
import { httpError, need } from '../http.js';

export const router = express.Router({ caseSensitive: true });

router.get('/auth/me', (req, res) => {
  const needsSetup = !db.prepare('SELECT 1 FROM users LIMIT 1').get();
  res.json({ user: currentUser(req), needsSetup });
});

// First run: the first admin account, and (on a new database) which business this copy is for, with the
// starting data for its type (categories, services or sports…).
router.post('/auth/setup', (req, res) => {
  if (db.prepare('SELECT 1 FROM users LIMIT 1').get()) throw httpError(403, 'Setup already completed');
  const { name, email, password } = req.body;
  need(name && email && password?.length >= 8, 'Name, email and a password of at least 8 characters are required');
  let business = null;
  if (!getBusiness()) {
    const { value, error } = readBusiness({ type: 'practice', ...req.body.business });
    need(!error, error);
    business = value;
  }
  const userId = tx(() => {
    if (business) { setBusiness(business); seedBusiness(business.type); }
    return Number(db.prepare('INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)')
      .run(name.trim(), email.trim().toLowerCase(), hashPassword(password)).lastInsertRowid);
  });
  createSession(res, userId);
  res.json({ ok: true });
});

// Brute-force protection: after too many wrong passwords from one IP (or for one email),
// logins are refused for a while. Stored in the database (login_failures), so a restart doesn't clear it.
const LOGIN_WINDOW_MS = 15 * 60 * 1000, MAX_PER_IP = 10, MAX_PER_EMAIL = 5;
const recentCount = (key) => db.prepare('SELECT COUNT(*) AS n FROM login_failures WHERE key = ? AND at > ?')
  .get(key, Date.now() - LOGIN_WINDOW_MS).n;
const addFailure = (key) => db.prepare('INSERT INTO login_failures (key, at) VALUES (?, ?)').run(key, Date.now());
const clearFailures = (key) => db.prepare('DELETE FROM login_failures WHERE key = ?').run(key);
// Forget old failures so the table doesn't grow forever.
setInterval(() => {
  db.prepare('DELETE FROM login_failures WHERE at <= ?').run(Date.now() - LOGIN_WINDOW_MS);
}, LOGIN_WINDOW_MS).unref();

router.post('/auth/login', (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const keys = [[`ip:${req.ip}`, MAX_PER_IP], [`email:${email}`, MAX_PER_EMAIL]];
  if (keys.some(([k, max]) => recentCount(k) >= max))
    throw httpError(429, 'Too many failed attempts — try again in 15 minutes');
  const u = db.prepare('SELECT * FROM users WHERE lower(email) = ?').get(email);
  // verifyPassword runs for unknown emails too (against a dummy hash), so timing reveals nothing.
  if (!verifyPassword(String(req.body.password || ''), u?.password_hash) || !u) {
    for (const [k] of keys) addFailure(k);
    throw httpError(401, 'Wrong email or password');
  }
  for (const [k] of keys) clearFailures(k);
  createSession(res, u.id);
  res.json({ ok: true });
});

router.post('/auth/logout', (req, res) => {
  destroySession(req, res);
  res.json({ ok: true });
});
