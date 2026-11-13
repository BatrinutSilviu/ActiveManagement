import express from 'express';
import { db, integrity } from '../db.js';

export const router = express.Router({ caseSensitive: true });

// For Docker's health check: the process answers and the database can be read (and passed its check at start).
router.get('/health', (req, res) => {
  db.prepare('SELECT 1').get();
  // The details are in the logs (written at start); the public answer only says it failed.
  if (!integrity.ok) return res.status(503).json({ ok: false, error: 'Database integrity check failed' });
  res.json({ ok: true });
});
