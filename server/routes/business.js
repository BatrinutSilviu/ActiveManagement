// The business this copy of the app is for (domain/business.js): its name, look, currency and switched-on parts.
import express from 'express';
import { FEATURES, getBusiness, readBusiness, setBusiness, TYPES } from '../domain/business.js';
import { db, tx } from '../db.js';
import { need } from '../http.js';

// Read before signing in too: the sign-in page shows the business's name and colour, and first-run setup the types.
export const publicRouter = express.Router({ caseSensitive: true });

publicRouter.get('/business', (req, res) => {
  const types = Object.fromEntries(Object.entries(TYPES).map(([k, t]) => [k, t.label]));
  res.json({ business: getBusiness(), types, features: FEATURES });
});

// Changing it: admins only (see checkRole). The type is chosen at setup and stays.
export const router = express.Router({ caseSensitive: true });

router.put('/business', (req, res) => {
  const { type, renames, conditionRenames, ...body } = req.body;
  const { value, error } = readBusiness(body, getBusiness());
  need(!error, error);
  // A practice location renamed in Settings → Services ({ old: new }): its sessions follow it.
  res.json(tx(() => {
    const move = db.prepare('UPDATE appointments SET location = ? WHERE location = ?');
    for (const [from, to] of Object.entries(renames ?? {})) if (from !== to && value.locations?.some((l) => l.name === to)) move.run(to, from);
    // An illness category renamed: its patients follow it.
    const recat = db.prepare('UPDATE OR IGNORE client_conditions SET name = ? WHERE name = ?');
    for (const [from, to] of Object.entries(conditionRenames ?? {})) if (from !== to && value.conditions?.includes(to)) recat.run(to, from);
    return setBusiness(value);
  }));
});
