// All money maths for events, the profit split and the funds lives here, so every
// page (event, month, sport, dashboard) reports the same numbers.
import { db, getPointsRates, getSplit, getTaskShares, splitResolver, toBani, toRon } from './db.js';

export const r2 = (v) => Math.round(v * 100) / 100;

// Event status values in the DB: 'planned' = live (still being set up / running),
// 'completed' = finalized (counts towards the funds), 'cancelled'.
export const FINALIZED = 'completed';
export const LIVE = 'planned';

// People let in free "as if they hadn't signed up" don't bring in a fee (nor a per-person venue cost).
const SKIPPED = "(SELECT COUNT(*) FROM event_discounts d WHERE d.event_id = e.id AND d.free = 'skip')";
const COUNTED = `MAX(e.participants - ${SKIPPED}, 0)`;

export const EVENT_SQL = `
  SELECT e.*, et.name AS type_name, et.is_sport, a.name AS activity_name,
    ${SKIPPED} AS free_skip_count, ${COUNTED} AS counted_participants,
    ${COUNTED} * e.participation_fee AS fee_gross,
    CASE WHEN e.venue_mode = 'fixed' THEN e.venue_total ELSE ${COUNTED} * e.venue_fee END AS venue_cost,
    (SELECT COALESCE(SUM(d.amount), 0) FROM event_discounts d WHERE d.event_id = e.id AND d.member = 0 AND d.free IS NULL) AS discounts,
    (SELECT COUNT(*) FROM event_discounts d WHERE d.event_id = e.id AND d.member = 0 AND d.free IS NULL) AS discount_count,
    (SELECT COALESCE(SUM(d.amount), 0) FROM event_discounts d WHERE d.event_id = e.id AND d.free = 'paid') AS covered_fees,
    (SELECT COUNT(*) FROM event_discounts d WHERE d.event_id = e.id AND d.free = 'paid') AS covered_count,
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

/** Points an event earns: hours before / during / after at their rates, plus points per so many RON of profit. */
export function eventPoints(e, profit, rates = getPointsRates()) {
  const time = e.hours_before * rates.before + e.hours_during * rates.during + e.hours_after * rates.after;
  const money = rates.moneyStep > 0 && profit > 0 ? (profit / rates.moneyStep) * rates.moneyPoints : 0;
  return { time: r2(time), money: r2(money), total: r2(time + money) };
}

export function shapeEvent(e, split = getSplit(), rates = getPointsRates()) {
  // Not a sport (e.g. Social): no sport fund, the community's share all goes to the general fund.
  if (e.is_sport === 0) split = { ...split, generalShare: 100 };
  // Fee income = people × fee − discounts − what members don't pay (they pay only the venue's part).
  // The venue (people × venue fee, or a fixed total) is an organizing cost. People let in free
  // without signing up aren't counted at all; fees we pay for someone are a benefit cost.
  const feeGross = toRon(e.fee_gross), discounts = toRon(e.discounts), memberDiscounts = toRon(e.member_discounts);
  const feeIncome = r2(feeGross - discounts - memberDiscounts), otherIncome = toRon(e.other_income);
  const venueCost = toRon(e.venue_cost), stockCost = toRon(e.stock_cost), coveredFees = toRon(e.covered_fees);
  const organizing = r2(toRon(e.organizing) + venueCost);
  const benefits = r2(toRon(e.benefit_tx) + stockCost + coveredFees);
  const income = r2(feeIncome + otherIncome), expenses = r2(organizing + benefits);
  const profit = r2(income - expenses);
  const { benefit_tx, points: pointsSet, ...rest } = e;
  const auto = eventPoints(e, profit, rates);
  return {
    points_auto: auto, points: e.points_manual ? pointsSet : auto.total,
    ...rest, budget: toRon(e.budget), participation_fee: toRon(e.participation_fee), venue_fee: toRon(e.venue_fee), venue_total: toRon(e.venue_total),
    fee_gross: feeGross, discounts, member_discounts: memberDiscounts, venue_cost: venueCost, fee_income: feeIncome, other_income: otherIncome, organizing, benefits, stock_cost: stockCost, covered_fees: coveredFees,
    income, expenses, profit, split: splitProfit(profit, split),
  };
}

// Each event is split with the targets of its own month.
function rawEvents(where = '', params = [], order = 'ORDER BY e.date') {
  const splitFor = splitResolver(), rates = getPointsRates();
  return db.prepare(`${EVENT_SQL} ${where} ${order}`).all(...params).map((e) => shapeEvent(e, splitFor(e.date.slice(0, 7)), rates));
}

/**
 * Task lines of events: each task gets its share (%) of the event's points, and the people on it
 * share those equally. free = 1: done for free, the points are the community's.
 */
export function taskLines(where = '1', params = []) {
  const shares = getTaskShares();
  const lines = db.prepare(`
    SELECT t.id, t.event_id, t.task, t.person_id, t.free, p.name AS person_name, p.is_founder, e.points AS event_points,
      e.name AS title, e.date, e.status, a.name AS activity_name,
      (SELECT COUNT(*) FROM event_tasks x WHERE x.event_id = t.event_id AND x.task = t.task) AS sharing
    FROM event_tasks t JOIN events e ON e.id = t.event_id JOIN people p ON p.id = t.person_id
    LEFT JOIN activities a ON a.id = e.activity_id
    WHERE ${where} ORDER BY e.date, t.id`).all(...params);
  // An event's points depend on its profit unless typed by hand, so they come from the shaped event.
  const ids = [...new Set(lines.map((l) => l.event_id))];
  const points = new Map(ids.length ? rawEvents(`WHERE e.id IN (${ids.map(() => '?').join(',')})`, ids).map((e) => [e.id, e.points]) : []);
  return lines.map((l) => {
    const total = points.get(l.event_id) ?? 0;
    return { ...l, event_points: total, points: r2((total * (shares[l.task] || 0)) / 100 / l.sharing) };
  });
}

/** Stock purchases with the points they earn the buyer: amount ÷ step × points, by kind. */
export function purchaseLines(where = '1', params = []) {
  const rates = getPointsRates();
  return db.prepare(`
    SELECT sp.*, p.name AS person_name, h.name AS holder_name, i.name AS item_name, i.unit
    FROM stock_purchases sp JOIN people p ON p.id = sp.person_id JOIN stock_items i ON i.id = sp.item_id
    LEFT JOIN people h ON h.id = sp.holder_id WHERE ${where} ORDER BY sp.date DESC, sp.id DESC`).all(...params).map((l) => {
    const amount = toRon(l.amount);
    const [step, pts] = l.kind === 'merch' ? [rates.merchStep, rates.merchPoints] : [rates.itemsStep, rates.itemsPoints];
    return { ...l, amount, points: step > 0 ? r2((amount / step) * pts) : 0 };
  });
}

/**
 * Money earned by tasks done for free, per finalized event: the organisers' pool of its month is
 * shared by points, and the free points' part goes to the event's sport fund instead of a person.
 */
function freeTaskMoney() {
  const pool = new Map(), points = new Map(), free = new Map(), monthOfEvent = new Map();
  const add = (m, k, v) => m.set(k, (m.get(k) || 0) + v);
  const lines = taskLines("e.status = 'completed'");
  if (!lines.some((l) => l.free)) return free;
  for (const e of rawEvents("WHERE e.status = 'completed'")) {
    monthOfEvent.set(e.id, e.date.slice(0, 7));
    add(pool, e.date.slice(0, 7), e.split.points);
  }
  for (const l of lines) {
    add(points, l.date.slice(0, 7), l.points);
    if (l.free) add(free, l.event_id, l.points);
  }
  for (const c of db.prepare("SELECT strftime('%Y-%m', date) AS ym, SUM(points) AS n FROM contributions GROUP BY ym").all()) add(points, c.ym, c.n);
  for (const l of purchaseLines()) add(points, l.date.slice(0, 7), l.points);
  const money = new Map();
  for (const [id, fp] of free) {
    const ym = monthOfEvent.get(id), total = points.get(ym);
    if (total) money.set(id, r2((pool.get(ym) * fp) / total));
  }
  return money;
}

export function loadEvents(where = '', params = [], order = 'ORDER BY e.date') {
  const list = rawEvents(where, params, order);
  const free = list.some((e) => e.status === FINALIZED) ? freeTaskMoney() : new Map();
  for (const e of list) {
    const amt = free.get(e.id) || 0;
    const s = e.split;
    s.freeTasks = amt;
    s.freeTo = e.is_sport === 0 ? 'general' : 'sport';
    if (!amt) continue;
    s.points = r2(s.points - amt); s.founders = r2(s.founders - amt);
    s.community = r2(s.community + amt); s[s.freeTo] = r2(s[s.freeTo] + amt);
  }
  return list;
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

const sports = () => db.prepare('SELECT id, name, is_sport FROM event_types ORDER BY name').all();
const blankFund = () => ({ allocated: 0, topups: 0, reinvested: 0, balance: 0, pending: 0, events: 0 });

function finishFund(f) {
  for (const k of ['allocated', 'topups', 'reinvested', 'pending']) f[k] = r2(f[k]);
  f.balance = r2(f.allocated + f.topups - f.reinvested);
  return f;
}

/** All-time fund balances: general community fund and one per sport. */
export function computeFunds() {
  const general = blankFund();
  const bySport = new Map(sports().map((s) => [s.id, { id: s.id, name: s.name, is_sport: s.is_sport, ...blankFund() }]));
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
  const list = [...bySport.values()].filter((s) => s.is_sport).map(({ is_sport, ...f }) => finishFund(f));
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
  // General vs sport fund comes from each event, since non-sport events give all of it to the general fund.
  // Money from tasks done for free is kept apart (freeTasks): it's part of the organisers' pool.
  const fromEvents = (list, total) => {
    const p = splitProfit(total, split);
    p.freeTasks = r2(list.reduce((s, e) => s + (e.split.freeTasks || 0), 0));
    p.general = r2(list.reduce((s, e) => s + e.split.general - (e.split.freeTo === 'general' ? e.split.freeTasks || 0 : 0), 0));
    p.sport = r2(p.community - p.general);
    return p;
  };
  const pools = fromEvents(done, profit);
  const pending = fromEvents(live, r2(live.reduce((s, e) => s + e.profit, 0)));

  // Every points line of the month, from event tasks and from standalone contributions.
  const ids = (list) => list.map((e) => e.id);
  const linesOf = (list) => (list.length ? taskLines(`t.event_id IN (${list.map(() => '?').join(',')})`, ids(list)) : []);
  const ledger = [
    ...linesOf(done).map((l) => ({ source: 'event', id: l.id, person_id: l.person_id, person_name: l.person_name, task: l.task, free: l.free,
      points: l.points, event_id: l.event_id, title: l.title, date: l.date, activity_name: l.activity_name, sharing: l.sharing })),
    ...db.prepare(`
      SELECT 'contribution' AS source, c.id, c.person_id, p.name AS person_name, NULL AS task, c.points, NULL AS event_id,
        COALESCE(c.note, a.name, 'Contribution') AS title, c.date, a.name AS activity_name, c.activity_id, c.note
      FROM contributions c JOIN people p ON p.id = c.person_id LEFT JOIN activities a ON a.id = c.activity_id
      WHERE strftime('%Y-%m', c.date) = ?`).all(ym),
    ...purchaseLines("strftime('%Y-%m', sp.date) = ?", [ym]).filter((l) => l.points).map((l) => ({
      source: 'purchase', id: l.id, person_id: l.person_id, person_name: l.person_name, task: null, kind: l.kind, points: l.points,
      event_id: null, title: `Bought ${l.qty} ${l.unit} ${l.item_name} · ${l.amount} RON`, date: l.date, activity_name: null })),
  ].sort((a, b) => a.date.localeCompare(b.date));
  const pendingPoints = r2(linesOf(live).reduce((s, l) => s + l.points, 0));
  const totalPoints = r2(ledger.reduce((s, l) => s + l.points, 0));
  const freePoints = r2(ledger.filter((l) => l.free).reduce((s, l) => s + l.points, 0));

  const founders = db.prepare('SELECT id, name FROM people WHERE is_founder = 1 AND active = 1 ORDER BY name').all();
  const people = new Map();
  const person = (id, name) => people.get(id) || people.set(id, { id, name, standard: 0, points: 0, pointsAmount: 0, lines: 0 }).get(id);
  for (const f of founders) person(f.id, f.name).standard = r2(pools.standard / founders.length);
  for (const l of ledger) {
    if (l.free) continue; // done for free: the community's points
    const p = person(l.person_id, l.person_name);
    p.points += l.points;
    p.lines++;
  }
  for (const p of people.values()) p.points = r2(p.points);
  for (const p of people.values()) p.pointsAmount = totalPoints ? r2((pools.points * p.points) / totalPoints) : 0;
  // What was already sent for this month; someone paid earlier but no longer due shows as overpaid.
  const sent = db.prepare('SELECT person_id, person_name, SUM(amount) AS amount, MAX(paid_at) AS paid_at FROM payouts WHERE month = ? GROUP BY person_id, person_name').all(ym);
  for (const s of sent) if (!people.has(s.person_id)) person(s.person_id, s.person_name);
  const rows = [...people.values()]
    .map((p) => {
      const total = r2(p.standard + p.pointsAmount);
      const paid = toRon(sent.filter((s) => s.person_id === p.id).reduce((a, s) => a + s.amount, 0));
      return { ...p, total, paid, owed: r2(total - paid), founder: founders.some((f) => f.id === p.id) };
    })
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
  const paidAt = sent.reduce((a, s) => (s.paid_at > a ? s.paid_at : a), '') || null;
  return {
    month: ym, split, profit, pools, pending, liveEvents: live.length, pendingPoints, events: done, live,
    founders: founders.length, totalPoints, freePoints, people: rows, ledger,
    payout: {
      paidAt, due: r2(rows.reduce((a, p) => a + p.total, 0)), paid: r2(rows.reduce((a, p) => a + p.paid, 0)),
      owed: r2(rows.reduce((a, p) => a + p.owed, 0)),
    },
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

/** Months that have payouts due or sent, with what is still owed for each. */
export function computePayoutMonths() {
  const months = db.prepare(`
    SELECT DISTINCT strftime('%Y-%m', date) AS m FROM events WHERE status = 'completed'
    UNION SELECT DISTINCT strftime('%Y-%m', date) FROM contributions
    UNION SELECT DISTINCT month FROM payouts ORDER BY m`).all().map((r) => r.m);
  return months.map((m) => {
    const r = computeFounders(m);
    return { month: m, ...r.payout, unassigned: r.unassignedPoints };
  });
}

/**
 * Money the community holds: finalized profit + donations − reinvested − payouts sent.
 * Equals the funds + payouts still owed (+ an organisers' share nobody earned points for).
 */
export function computeCash(funds = computeFunds()) {
  const months = computePayoutMonths();
  const sum = (k) => r2(months.reduce((a, m) => a + m[k], 0));
  const profit = r2(loadEvents("WHERE e.status = 'completed'").reduce((a, e) => a + e.profit, 0));
  const topups = r2(funds.general.topups + funds.sportsTotal.topups);
  const reinvested = r2(funds.general.reinvested + funds.sportsTotal.reinvested);
  const paid = sum('paid');
  return {
    balance: r2(profit + topups - reinvested - paid), profit, topups, reinvested, paid, owed: sum('owed'), unassigned: sum('unassigned'),
    unpaidMonths: months.filter((m) => Math.abs(m.owed) >= 0.01),
  };
}

/** Records the payouts for a month: whatever each person is owed now (all of it the first time). */
export function applyPayouts(ym, userId) {
  const r = computeFounders(ym);
  const due = r.people.filter((p) => Math.abs(p.owed) >= 0.01);
  if (!due.length) return 0;
  const ins = db.prepare('INSERT INTO payouts (month, person_id, person_name, amount, created_by) VALUES (?, ?, ?, ?, ?)');
  for (const p of due) ins.run(ym, p.id ?? null, p.name, toBani(p.owed), userId ?? null);
  return due.length;
}
