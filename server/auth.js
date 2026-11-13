import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { db } from './db.js';

const SESSION_DAYS = 14;
const COOKIE = 'am_session';

export function hashPassword(pw) {
  const salt = randomBytes(16);
  return `${salt.toString('hex')}:${scryptSync(pw, salt, 64).toString('hex')}`;
}

// Only a hash of each session token is stored, so a copy of the database (a backup) holds no
// working sessions.
const tokenHash = (token) => createHash('sha256').update(token).digest('hex');

// Spent on unknown emails too, so a login's timing doesn't tell whether an account exists.
const DUMMY_HASH = hashPassword(randomBytes(16).toString('hex'));
export function verifyPassword(pw, stored = DUMMY_HASH) {
  const [salt, hash] = stored.split(':');
  const a = Buffer.from(hash, 'hex');
  const b = scryptSync(pw, Buffer.from(salt, 'hex'), 64);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function createSession(res, userId) {
  const token = randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + SESSION_DAYS * 864e5);
  db.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)').run(tokenHash(token), userId, expires.toISOString());
  res.cookie(COOKIE, token, {
    httpOnly: true,
    // Strict: the other *.activetimisoara.ro sites count as the same site for Lax.
    sameSite: 'strict',
    secure: process.env.COOKIE_SECURE === 'true',
    expires,
  });
}

function readCookie(req, name) {
  const raw = req.headers.cookie || '';
  for (const part of raw.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return null;
}

export function currentUser(req) {
  const token = readCookie(req, COOKIE);
  if (!token) return null;
  return db.prepare(`
    SELECT u.id, u.name, u.email, u.role FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token = ? AND s.expires_at > ?`).get(tokenHash(token), new Date().toISOString()) || null;
}

export function destroySession(req, res) {
  const token = readCookie(req, COOKIE);
  if (token) db.prepare('DELETE FROM sessions WHERE token = ?').run(tokenHash(token));
  res.clearCookie(COOKIE);
}

/** Signs a user out everywhere (after a password or role change), except the session `keepReq` uses. */
export function endSessions(userId, keepReq = null) {
  const keep = keepReq && readCookie(keepReq, COOKIE);
  db.prepare('DELETE FROM sessions WHERE user_id = ? AND token != ?').run(userId, keep ? tokenHash(keep) : '');
}

export function requireAuth(req, res, next) {
  const user = currentUser(req);
  if (!user) return res.status(401).json({ error: 'Not signed in' });
  req.user = user;
  next();
}

export const ROLES = ['admin', 'editor', 'viewer'];

// Viewers may only read; changing anything needs an editor. Accounts, imports and backups are admin-only.
// Everyone may change their own password.
export function checkRole(req, res, next) {
  const { role } = req.user;
  if (req.method === 'PUT' && req.path === '/users/me/password') return next();
  // Routes match case-sensitively (every router is created with caseSensitive), and this check is
  // case-insensitive too, so /api/Users can't slip past it.
  const adminOnly = /^\/(users|imports?|backups|server)(\/|$)/i.test(req.path);
  if (adminOnly && role !== 'admin') return res.status(403).json({ error: 'Only admins can do this' });
  if (!['GET', 'HEAD'].includes(req.method) && role === 'viewer') return res.status(403).json({ error: 'Your account can only view data' });
  next();
}
