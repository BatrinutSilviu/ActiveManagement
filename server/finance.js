// All money maths for events, the profit split and the funds lives here, so every
// page (event, month, sport, dashboard) reports the same numbers.
import { db, getSplit, splitResolver, toRon } from './db.js';

export const r2 = (v) => Math.round(v * 100) / 100;

// Event status values in the DB: 'planned' = live (still being set up / running),
// 'completed' = finalized (counts towards the funds), 'cancelled'.
export const FINALIZED = 'completed';
export const LIVE = 'planned';

export const EVENT_SQL = `
  SELECT e.*, et.name AS type_name, a.name AS activity_name,
    e.participants * e.participation_fee AS fee_gross, e.participants * e.venue_fee AS venue_cost,
    (SELECT COALESCE(SUM(d.amount), 0) FROM event_discounts d WHERE d.event_id = e.id AND d.member = 0) AS discounts,
    (SELECT COUNT(*) FROM event_discounts d WHERE d.event_id = e.id AND d.member = 0) AS discount_count,
    (SELECT COALESCE(SUM(d.amount), 0) FROM event_discounts d WHERE d.event_id = e.id AND d.member = 1) AS member_discounts,
    (SELECT COUNT(*) FROM event_discounts d WHERE d.event_id = e.id AND d.member = 1) AS member_count,
    (SELECT COALESCE(SUM(t.amount), 0) FROM transactions t WHERE t.event_id = e.id AND t.kind = 'income') AS other_income,
    (SELECT COALESCE(SUM(t.amount), 0) FROM transactions t LEFT JOIN categories c ON c.id = t.category_id
       WHERE t.event_id = e.id AND t.kind = 'expense' AND COALESCE(c.cost_group, 'organizing') = 'organizing') AS organizing,
    (SELECT COALESCE(SUM(t.amount), 0) FROM transactions t JOIN categories c ON c.id = t.category_id
       WHERE t.event_id = e.id AND t.kind = 'expense' AND c.cost_group = 'benefit') AS benefit_tx,
    (SELECT COALESCE(SUM(s.qty * s.unit_price), 0) FROM event_stock s WHERE s.event_id = e.id) AS stock_cost,
    (SELECT COUNT(*) FROM transactions t WHERE t.event_id = e.id) AS tx_count
  FROM events e JOIN event_types et ON et.id = e.type_id LEFT JOIN activities a ON a.id = e.activity_id`;

/** Split a profit (RON) into founders' and community parts. Losses split the same way. */
export function splitProfit(profit, split = getSplit()) {
  const standard = (profit * split.foundersStandard) / 100;
  const points = (profit * split.foundersPoints) / 100;
  const community = profit - standard - points;
  const general = (community * split.generalShare) / 100;
  return {
    founders: r2(standard + points), standard: r2(standard), points: r2(points),
    community: r2(community), general: r2(general), sport: r2(community - general),
  };
}

export function shapeEvent(e, split = getSplit()) {
  // Fee income = people × fee − discounts − what members don't pay (they pay only the venue's part).
  // The venue's part (people × venue fee) is an organizing cost.
  const feeGross = toRon(e.fee_gross), discounts = toRon(e.discounts), memberDiscounts = toRon(e.member_discounts);
  const feeIncome = r2(feeGross - discounts - memberDiscounts), otherIncome = toRon(e.other_income);
  const venueCost = toRon(e.venue_cost), stockCost = toRon(e.stock_cost);
  const organizing = r2(toRon(e.organizing) + venueCost);
  const benefits = r2(toRon(e.benefit_tx) + stockCost);
  const income = r2(feeIncome + otherIncome), expenses = r2(organizing + benefits);
  const profit = r2(income - expenses);
  const { benefit_tx, ...rest } = e;
  return {
    ...rest, budget: toRon(e.budget), participation_fee: toRon(e.participation_fee), venue_fee: toRon(e.venue_fee),
    fee_gross: feeGross, discounts, member_discounts: memberDiscounts, venue_cost: venueCost, fee_income: feeIncome, other_income: otherIncome, organizing, benefits, stock_cost: stockCost,
    income, expenses, profit, split: splitProfit(profit, split),
  };
}

// Each event is split with the targets of its own month.
export function loadEvents(where = '', params = [], order = 'ORDER BY e.date') {
  const splitFor = splitResolver();
  return db.prepare(`${EVENT_SQL} ${where} ${order}`).all(...params).map((e) => shapeEvent(e, splitFor(e.date.slice(0, 7))));
}

/** Transactions not tied to an event: money spent from (reinvested) or added to a fund. */
export function loadFundTx(where = '', params = []) {
  return db.prepare(`
    SELECT t.*, c.name AS category_name, et.name AS fund_name, u.name AS created_by_name FROM transactions t
    LEFT JOIN categories c ON c.id = t.category_id
    LEFT JOIN event_types et ON et.id = t.fund_sport_id
    LEFT JOIN users u ON u.id = t.created_by
    WHERE t.event_id IS NULL ${where} ORDER BY t.date`).all(...params).map((t) => ({ ...t, amount: toRon(t.amount) }));
}

const sports = () => db.prepare('SELECT id, name FROM event_types ORDER BY name').all();
const blankFund = () => ({ allocated: 0, topups: 0, reinvested: 0, balance: 0, pending: 0, events: 0 });

function finishFund(f) {
  for (const k of ['allocated', 'topups', 'reinvested', 'pending']) f[k] = r2(f[k]);
  f.balance = r2(f.allocated + f.topups - f.reinvested);
  return f;
}

/** All-time fund balances: general community fund and one per sport. */
export function computeFunds() {
  const general = blankFund();
  const bySport = new Map(sports().map((s) => [s.id, { id: s.id, name: s.name, ...blankFund() }]));
  for (const e of loadEvents("WHERE e.status IN ('completed', 'planned')")) {
    const s = bySport.get(e.type_id);
    if (e.status === FINALIZED) {
      general.allocated += e.split.general;
      s.allocated += e.split.sport;
      s.events++;
      general.events++;
    } else {
      general.pending += e.split.general;
      s.pending += e.split.sport;
    }
  }
  for (const t of loadFundTx()) {
    const f = t.fund_sport_id ? bySport.get(t.fund_sport_id) : general;
    if (!f) continue;
    if (t.kind === 'expense') f.reinvested += t.amount;
    else f.topups += t.amount;
  }
  const list = [...bySport.values()].map(finishFund);
  return {
    general: finishFund(general),
    sports: list,
    sportsTotal: finishFund(list.reduce((a, s) => {
      for (const k of ['allocated', 'topups', 'reinvested', 'pending', 'events']) a[k] += s[k];
      return a;
    }, blankFund())),
  };
}

const monthOf = (d) => Number(d.slice(5, 7));

/** Month-by-month figures for one year (finalized events only). */
export function computeYear(year) {
  const y = String(year);
  const list = sports();
  const months = Array.from({ length: 12 }, (_, i) => ({
    month: i + 1, income: 0, expenses: 0, profit: 0, founders: 0, standard: 0, points: 0, general: 0, sport: 0,
    reinvestedGeneral: 0, reinvestedSport: 0, topups: 0, events: 0, live: 0,
    bySport: Object.fromEntries(list.map((s) => [s.id, { allocated: 0, reinvested: 0, profit: 0, events: 0 }])),
  }));
  const events = loadEvents("WHERE strftime('%Y', e.date) = ? AND e.status != 'cancelled'", [y]);
  for (const e of events) {
    const m = months[monthOf(e.date) - 1];
    if (e.status !== FINALIZED) { m.live++; continue; }
    m.events++;
    m.income += e.income; m.expenses += e.expenses; m.profit += e.profit;
    for (const k of ['founders', 'standard', 'points', 'general', 'sport']) m[k] += e.split[k];
    const s = m.bySport[e.type_id];
    s.allocated += e.split.sport; s.profit += e.profit; s.events++;
  }
  for (const t of loadFundTx("AND strftime('%Y', t.date) = ?", [y])) {
    const m = months[monthOf(t.date) - 1];
    if (t.kind === 'income') { m.topups += t.amount; continue; }
    if (t.fund_sport_id) { m.reinvestedSport += t.amount; if (m.bySport[t.fund_sport_id]) m.bySport[t.fund_sport_id].reinvested += t.amount; }
    else m.reinvestedGeneral += t.amount;
  }
  for (const m of months) {
    for (const [k, v] of Object.entries(m)) if (typeof v === 'number' && k !== 'month') m[k] = r2(v);
    for (const s of Object.values(m.bySport)) for (const k of Object.keys(s)) s[k] = r2(s[k]);
  }
  return { year: Number(y), sports: list, months, events };
}

/**
 * Payouts for a month: founders share their % equally; organisers share theirs in proportion
 * to the points earned that month (event organisers of finalized events + standalone contributions).
 */
export function computeFounders(ym) {
  const split = splitResolver()(ym);
  const events = loadEvents("WHERE strftime('%Y-%m', e.date) = ? AND e.status != 'cancelled'", [ym]);
  const done = events.filter((e) => e.status === FINALIZED);
  const live = events.filter((e) => e.status === LIVE);
  const profit = r2(done.reduce((s, e) => s + e.profit, 0));
  const pools = splitProfit(profit, split);
  const pending = splitProfit(r2(live.reduce((s, e) => s + e.profit, 0)), split);

  // Every points line of the month, from events and from standalone contributions.
  const ledger = [
    ...(done.length ? db.prepare(`
      SELECT 'event' AS source, ep.id, ep.person_id, p.name AS person_name, ep.role, ep.points, e.id AS event_id,
        e.name AS title, e.date, a.name AS activity_name
      FROM event_people ep JOIN people p ON p.id = ep.person_id JOIN events e ON e.id = ep.event_id
      LEFT JOIN activities a ON a.id = e.activity_id
      WHERE ep.event_id IN (${done.map(() => '?').join(',')})`).all(...done.map((e) => e.id)) : []),
    ...db.prepare(`
      SELECT 'contribution' AS source, c.id, c.person_id, p.name AS person_name, NULL AS role, c.points, NULL AS event_id,
        COALESCE(c.note, a.name, 'Contribution') AS title, c.date, a.name AS activity_name, c.activity_id, c.note
      FROM contributions c JOIN people p ON p.id = c.person_id LEFT JOIN activities a ON a.id = c.activity_id
      WHERE strftime('%Y-%m', c.date) = ?`).all(ym),
  ].sort((a, b) => a.date.localeCompare(b.date));
  const pendingPoints = live.length ? db.prepare(`SELECT COALESCE(SUM(points), 0) AS n FROM event_people
    WHERE event_id IN (${live.map(() => '?').join(',')})`).get(...live.map((e) => e.id)).n : 0;
  const totalPoints = ledger.reduce((s, l) => s + l.points, 0);

  const founders = db.prepare('SELECT id, name FROM people WHERE is_founder = 1 AND active = 1 ORDER BY name').all();
  const people = new Map();
  const person = (id, name) => people.get(id) || people.set(id, { id, name, standard: 0, points: 0, pointsAmount: 0, lines: 0 }).get(id);
  for (const f of founders) person(f.id, f.name).standard = r2(pools.standard / founders.length);
  for (const l of ledger) {
    const p = person(l.person_id, l.person_name);
    p.points += l.points;
    p.lines++;
  }
  for (const p of people.values()) p.pointsAmount = totalPoints ? r2((pools.points * p.points) / totalPoints) : 0;
  const rows = [...people.values()]
    .map((p) => ({ ...p, total: r2(p.standard + p.pointsAmount), founder: founders.some((f) => f.id === p.id) }))
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
  return {
    month: ym, split, profit, pools, pending, liveEvents: live.length, pendingPoints, events: done, live,
    founders: founders.length, totalPoints, people: rows, ledger,
    unassignedPoints: totalPoints ? 0 : pools.points, // nobody earned points: the organisers' share is not paid out
  };
}

/** Everything about one sport's fund, month by month across all time. */
export function computeSport(id) {
  const sport = db.prepare('SELECT id, name FROM event_types WHERE id = ?').get(id);
  if (!sport) return null;
  const events = loadEvents("WHERE e.type_id = ? AND e.status != 'cancelled'", [id], 'ORDER BY e.date DESC');
  const fundTx = loadFundTx('AND t.fund_sport_id = ?', [id]).reverse();
  const byMonth = new Map();
  const month = (ym) => byMonth.get(ym) || byMonth.set(ym, { month: ym, allocated: 0, reinvested: 0, topups: 0, profit: 0, income: 0, events: 0 }).get(ym);
  for (const e of events) {
    if (e.status !== FINALIZED) continue;
    const m = month(e.date.slice(0, 7));
    m.allocated += e.split.sport; m.profit += e.profit; m.income += e.income; m.events++;
  }
  for (const t of fundTx) {
    const m = month(t.date.slice(0, 7));
    if (t.kind === 'expense') m.reinvested += t.amount; else m.topups += t.amount;
  }
  let running = 0;
  const months = [...byMonth.values()].sort((a, b) => a.month.localeCompare(b.month)).map((m) => {
    for (const k of ['allocated', 'reinvested', 'topups', 'profit', 'income']) m[k] = r2(m[k]);
    running += m.allocated + m.topups - m.reinvested;
    return { ...m, balance: r2(running) };
  });
  const fund = computeFunds().sports.find((s) => s.id === Number(id));
  return { sport, fund, months, events, fundTx };
}
