// The community's funds: every fund's balance and money in the account, and the general fund in detail.
import express from 'express';
import { getSplit } from '../db.js';
import { openVouchers } from '../domain/vouchers.js';
import { computeCash, computeFunds, computeGeneral } from '../finance.js';

export const router = express.Router();

router.get('/funds', (req, res) => {
  const funds = computeFunds();
  res.json({ ...funds, cash: computeCash(funds), split: getSplit() });
});

router.get('/funds/general', (req, res) => {
  const r = computeGeneral();
  // Vouchers for non-sport event types are paid from the general fund when they're used.
  r.openVouchers = openVouchers('(v.sport_id IS NULL OR t.is_sport = 0)');
  res.json(r);
});
