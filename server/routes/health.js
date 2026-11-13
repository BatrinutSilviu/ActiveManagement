import express from 'express';
import { db, integrity } from '../db.js';

export const router = express.Router();

// For Docker's health check: the process answers and the database can be read (and passed its check at start).
router.get('/health', (req, res) => {
  db.prepare('SELECT 1').get();
  if (!integrity.ok) return res.status(503).json({ ok: false, error: 'Database integrity check failed', problems: integrity.problems });
  res.json({ ok: true });
});
