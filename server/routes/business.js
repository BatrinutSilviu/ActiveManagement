// The business this copy of the app is for (domain/business.js): its name, look, currency and switched-on parts.
import express from 'express';
import { FEATURES, getBusiness, readBusiness, setBusiness, TYPES } from '../domain/business.js';
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
  const { type, ...body } = req.body;
  const { value, error } = readBusiness(body, getBusiness());
  need(!error, error);
  res.json(setBusiness(value));
});
