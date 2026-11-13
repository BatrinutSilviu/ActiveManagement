// Figures for the dashboard and the reports: a year (or all years) at a glance, a period's money, month by month.
import express from 'express';
import { db } from '../db.js';
import { r2, sumBy, toRon } from '../domain/money.js';
import { computeYear, FINALIZED, LIVE, loadEvents, loadFundTx } from '../finance.js';
import { today } from '../http.js';

export const router = express.Router();

// The whole picture for a period (what the Transactions list alone can't show, since participation
// fees live on events): finalized events' fees and profit, fund money in/out, payouts sent — and so the
// change in the account. Live events are only counted once finalized.
router.get('/stats/period', (req, res) => {
  const y = /^\d{4}$/.test(req.query.year || '') ? req.query.year : null;
  const m = y && /^\d{1,2}$/.test(req.query.month || '') ? String(req.query.month).padStart(2, '0') : null;
  const fmt = m ? '%Y-%m' : '%Y', val = m ? `${y}-${m}` : y;
  const evWhere = y ? `AND strftime('${fmt}', e.date) = ?` : '', evParams = y ? [val] : [];
  const done = loadEvents(`WHERE e.status = 'completed' ${evWhere}`, evParams);
  const live = loadEvents(`WHERE e.status = 'planned' ${evWhere}`, evParams);
  const fund = loadFundTx(y ? `AND strftime('${fmt}', t.date) = ?` : '', evParams);
  const paid = toRon(db.prepare(`SELECT COALESCE(SUM(amount), 0) AS s FROM payouts WHERE to_fund = 0 ${y ? `AND strftime('${fmt}', paid_at) = ?` : ''}`).get(...evParams).s);
  const fees = sumBy(done, (e) => e.fee_income), eventProfit = sumBy(done, (e) => e.profit);
  const fundNet = sumBy(fund, (t) => (t.kind === 'income' ? t.amount : -t.amount));
  res.json({ events: done.length, live: live.length, liveProfit: sumBy(live, (e) => e.profit), fees, eventProfit, fundNet, paid,
    overall: r2(eventProfit + fundNet - paid) });
});

router.get('/stats/years', (req, res) => {
  const rows = db.prepare(`SELECT DISTINCT strftime('%Y', date) AS y FROM events
    UNION SELECT DISTINCT strftime('%Y', date) FROM transactions ORDER BY y DESC`).all();
  const years = rows.map((r) => r.y);
  const now = today().slice(0, 4);
  if (!years.includes(now)) years.unshift(now);
  res.json(years.sort().reverse());
});

// Overview for a year (or all years) and optionally one sport. Money figures use
// finalized events only; live events are listed separately.
router.get('/stats', (req, res) => {
  const year = req.query.year ? String(req.query.year) : null;
  const type = req.query.type ? Number(req.query.type) : null;
  const scope = (y) => {
    const w = ["e.status != 'cancelled'"], p = [];
    if (y) { w.push("strftime('%Y', e.date) = ?"); p.push(y); }
    if (type) { w.push('e.type_id = ?'); p.push(type); }
    return loadEvents('WHERE ' + w.join(' AND '), p);
  };
  const totalsOf = (list) => {
    const income = sumBy(list, (e) => e.income), expenses = sumBy(list, (e) => e.expenses);
    return { income, expenses, profit: r2(income - expenses) };
  };
  const events = scope(year);
  const held = events.filter((e) => e.status === FINALIZED);
  const live = events.filter((e) => e.status === LIVE);
  const totals = totalsOf(held);
  const previous = year ? totalsOf(scope(String(Number(year) - 1)).filter((e) => e.status === FINALIZED)) : null;

  const periodOf = (d) => (year ? d.slice(5, 7) : d.slice(0, 4));
  const buckets = new Map();
  if (year) for (let m = 1; m <= 12; m++) buckets.set(String(m).padStart(2, '0'), []);
  for (const e of held) (buckets.get(periodOf(e.date)) || buckets.set(periodOf(e.date), []).get(periodOf(e.date))).push(e);
  let running = 0;
  const now = today();
  const periods = [...buckets.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([period, list]) => {
    const s = totalsOf(list);
    running += s.profit;
    const future = year && `${year}-${period}` > now.slice(0, 7) && !list.length;
    return { period, ...s, events: list.length, cumulative: future ? null : r2(running) };
  });

  const byType = db.prepare('SELECT id, name FROM event_types ORDER BY name').all()
    .filter((t) => !type || t.id === type)
    .map((t) => {
      const list = held.filter((e) => e.type_id === t.id);
      return { id: t.id, name: t.name, events: list.length, ...totalsOf(list) };
    }).filter((t) => t.events || !type);

  // Category breakdowns for the finalized events in scope.
  const ids = held.map((e) => e.id);
  const inList = ids.length ? `t.event_id IN (${ids.map(() => '?').join(',')})` : '0';
  const byCategory = (kind) => db.prepare(`
    SELECT COALESCE(c.name, 'Uncategorised') AS name, SUM(t.amount) AS total FROM transactions t
    LEFT JOIN categories c ON c.id = t.category_id WHERE ${inList} AND t.kind = ? GROUP BY c.id`)
    .all(...ids, kind).map((r) => ({ name: r.name, total: toRon(r.total) }));
  const expenseByCategory = byCategory('expense');
  const stockCost = sumBy(held, (e) => e.stock_cost);
  if (stockCost) expenseByCategory.push({ name: 'Products from stock', total: stockCost });
  const venueCost = sumBy(held, (e) => e.venue_cost);
  if (venueCost) expenseByCategory.push({ name: 'Venue rental', total: venueCost });
  const incomeByCategory = byCategory('income');
  const feeIncome = sumBy(held, (e) => e.fee_income);
  const discountsGiven = sumBy(held, (e) => e.discounts);
  if (feeIncome) incomeByCategory.push({ name: 'Participation fees (people × price − member prices)', total: feeIncome });
  const merge = (list) => [...list.reduce((m, x) => m.set(x.name, (m.get(x.name) || 0) + x.total), new Map())]
    .map(([name, total]) => ({ name, total: r2(total) })).sort((a, b) => b.total - a.total);

  const participants = held.reduce((s, e) => s + e.participants, 0);
  res.json({
    totals,
    previous,
    split: {
      founders: sumBy(held, (e) => e.split.founders),
      general: sumBy(held, (e) => e.split.general),
      sport: sumBy(held, (e) => e.split.sport),
    },
    costs: {
      organizing: sumBy(held, (e) => e.organizing),
      benefits: sumBy(held, (e) => e.benefits),
    },
    kpis: {
      margin: totals.income ? totals.profit / totals.income : null,
      events: events.length,
      completed: held.length,
      planned: live.length,
      profitable: held.filter((e) => e.profit > 0).length,
      avgProfit: held.length ? totals.profit / held.length : null,
      participants,
      avgParticipants: held.length ? participants / held.length : null,
      incomePerParticipant: participants ? totals.income / participants : null,
      costPerParticipant: participants ? totals.expenses / participants : null,
      discounts: discountsGiven,
      discountedEntries: held.reduce((s, e) => s + e.discount_count, 0),
    },
    periods,
    byType,
    expenseByCategory: merge(expenseByCategory),
    incomeByCategory: merge(incomeByCategory),
    events,
    live: loadEvents(`WHERE e.status = 'planned' ${type ? 'AND e.type_id = ?' : ''}`, type ? [type] : [], 'ORDER BY e.date LIMIT 8'),
  });
});

// Month-by-month figures for one year (the Monthly page).
router.get('/monthly', (req, res) => {
  const year = /^\d{4}$/.test(req.query.year || '') ? req.query.year : today().slice(0, 4);
  res.json(computeYear(year));
});
