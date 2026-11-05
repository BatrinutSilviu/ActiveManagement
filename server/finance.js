// All money maths for events, the profit split and the funds lives here, so every
// page (event, month, sport, dashboard) reports the same numbers.
import { db, eventTaskShares, getPointsRates, getSplit, getStartingBalance, getTaskShares, splitResolver, toBani, toRon, manualTaskPoints } from './db.js';

export const r2 = (v) => Math.round(v * 100) / 100;

// Event status values in the DB: 'planned' = live (still being set up / running),
// 'completed' = finalized (counts towards the funds), 'cancelled'.
export const FINALIZED = 'completed';
export const LIVE = 'planned';

// People let in free "as if they hadn't signed up" don't bring in a fee (nor a per-person venue cost).
const SKIPPED = "(SELECT COUNT(*) FROM event_discounts d WHERE d.event_id = e.id AND d.free = 'skip')";
const COUNTED = `MAX(e.participants - ${SKIPPED}, 0)`;

export const EVENT_SQL = `
  SELECT e.*, et.name AS type_name, et.is_sport, et.points_factor, a.name AS activity_name, a.organizer_points AS activity_points,
    ${SKIPPED} AS free_skip_count, ${COUNTED} AS counted_participants,
    CASE WHEN e.price_parts = 1 AND e.venue_mode = 'fixed' AND e.participants > 0
      THEN ROUND(e.venue_total * ${COUNTED} * 1.0 / e.participants) + ${COUNTED} * e.community_fee
      ELSE ${COUNTED} * e.participation_fee END AS fee_gross,
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
    (SELECT COUNT(*) FROM transactions t WHERE t.event_id = e.id) AS tx_count,
    (SELECT COALESCE(SUM(h.points), 0) FROM event_highlights h WHERE h.event_id = e.id) AS impact_points
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

/**
 * Points an event earns, in four parts, each times its weight from Settings and the sport's multiplier:
 *   time   — its activity's points from the points table (what organising it takes)
 *   people — points per so many participants (counted ones)
 *   money  — points per so many RON of profit; an estimate until the month closes (see computeRealPoints)
 *   impact — the points of what made it special (collaboration, special guest…)
 */
export function eventPoints(e, profit, rates = getPointsRates()) {
  const factor = e.points_factor ?? 1;
  const time = (e.activity_points || 0) * rates.wTime * factor;
  const people = rates.peopleStep > 0 ? ((e.counted_participants || 0) / rates.peopleStep) * rates.peoplePoints * rates.wPeople * factor : 0;
  const money = rates.moneyStep > 0 && profit > 0 ? (profit / rates.moneyStep) * rates.moneyPoints * rates.wProfit * factor : 0;
  const impact = (e.impact_points || 0) * rates.wImpact * factor;
  return { time: r2(time), people: r2(people), money: r2(money), impact: r2(impact), total: r2(time + people + money + impact), factor };
}

export function shapeEvent(e, split = getSplit(), rates = getPointsRates()) {
  // Not a sport (e.g. Social): no sport fund, the community's share all goes to the general fund.
  if (e.is_sport === 0) split = { ...split, generalShare: 100 };
  // Fee income = people × fee − what members don't pay (they pay only the venue's part).
  // The venue (people × venue fee, or a fixed total) is an organizing cost. People let in free
  // without signing up aren't counted at all.
  // Discounts and fees we pay for someone (free, paid by us) come out of the general community fund,
  // not the event: its fees count as if those people paid in full, and `fund_paid` is spent from the
  // general fund once the event is finalized (see computeFunds / computeYear).
  const feeGross = toRon(e.fee_gross), discounts = toRon(e.discounts), memberDiscounts = toRon(e.member_discounts);
  const feeIncome = r2(feeGross - memberDiscounts), otherIncome = toRon(e.other_income);
  const venueCost = toRon(e.venue_cost), stockCost = toRon(e.stock_cost), coveredFees = toRon(e.covered_fees);
  const fundPaid = r2(discounts + coveredFees);
  const organizing = r2(toRon(e.organizing) + venueCost);
  const benefits = r2(toRon(e.benefit_tx) + stockCost);
  const income = r2(feeIncome + otherIncome), expenses = r2(organizing + benefits);
  const profit = r2(income - expenses);
  const { benefit_tx, points: pointsSet, ...rest } = e;
  const auto = eventPoints(e, profit, rates);
  return {
    points_auto: auto, points: e.points_manual ? pointsSet : auto.total,
    ...rest, budget: toRon(e.budget), community_fee: toRon(e.community_fee), participation_fee: toRon(e.participation_fee), venue_fee: toRon(e.venue_fee), venue_total: toRon(e.venue_total),
    fee_gross: feeGross, discounts, member_discounts: memberDiscounts, venue_cost: venueCost, fee_income: feeIncome, other_income: otherIncome, organizing, benefits, stock_cost: stockCost, covered_fees: coveredFees, fund_paid: fundPaid,
    income, expenses, profit, split: splitProfit(profit, split),
  };
}

// Each event is split with the targets of its own month. In a closed month, events use their real
// points (points_estimate keeps the estimate); `real = false` gives the estimates only.
function rawEvents(where = '', params = [], order = 'ORDER BY e.date', real = true) {
  const splitFor = splitResolver(), rates = getPointsRates();
  const closed = real ? closedMonths() : new Map();
  return db.prepare(`${EVENT_SQL} ${where} ${order}`).all(...params).map((e) => {
    const s = shapeEvent(e, splitFor(e.date.slice(0, 7)), rates);
    const fixed = closed.get(s.date.slice(0, 7))?.data[s.id];
    s.points_estimate = s.points;
    s.points_real = fixed && !s.points_manual ? fixed : null;
    if (s.points_real) s.points = fixed.total;
    return s;
  });
}

/* ------------------------------------------------- real points per month */

// During the month an event's points are an estimate. When the month closes (on the 1st), the month's
// profit decides: each finalized event's profit points are multiplied by (month's profit ÷ the profit
// of the events that made one), so the profit points shared out match what the month really made —
// events at a loss pull everyone's down, and if the month made nothing there are none. Time,
// participants and impact points, and points set by hand, don't change.

const closedMonths = () => new Map(db.prepare('SELECT * FROM month_points').all()
  .map((r) => [r.month, { ...r, data: JSON.parse(r.data), profit: toRon(r.profit) }]));

/** What the month's real points are with today's numbers (not stored). */
export function computeRealPoints(ym) {
  const events = rawEvents("WHERE strftime('%Y-%m', e.date) = ? AND e.status = 'completed'", [ym], 'ORDER BY e.date', false);
  const profit = r2(events.reduce((a, e) => a + e.profit, 0));
  const gains = events.reduce((a, e) => a + Math.max(e.profit, 0), 0);
  const scale = gains > 0 ? Math.min(Math.max(profit, 0) / gains, 1) : 0;
  return {
    month: ym, profit, gains: r2(gains), scale,
    events: events.map((e) => {
      const a = e.points_auto;
      const money = e.points_manual ? null : r2(a.money * scale);
      return { id: e.id, name: e.name, date: e.date, type_name: e.type_name, profit: e.profit, estimate: e.points_estimate,
        manual: !!e.points_manual, time: a.time, people: a.people, impact: a.impact, money_estimate: a.money, money,
        total: e.points_manual ? e.points_estimate : r2(a.time + a.people + a.impact + money) };
    }),
  };
}

/** Calculates and freezes a month's real points (userId null = automatic). */
export function closeMonth(ym, userId = null) {
  const r = computeRealPoints(ym);
  const data = Object.fromEntries(r.events.map((e) => [e.id, { time: e.time, people: e.people, impact: e.impact, money: e.money, total: e.total, manual: e.manual }]));
  db.prepare(`INSERT INTO month_points (month, data, profit, scale, calculated_at, calculated_by) VALUES (?, ?, ?, ?, datetime('now'), ?)
    ON CONFLICT(month) DO UPDATE SET data = excluded.data, profit = excluded.profit, scale = excluded.scale,
      calculated_at = excluded.calculated_at, calculated_by = excluded.calculated_by`)
    .run(ym, JSON.stringify(data), toBani(r.profit), r.scale, userId);
  return r;
}

/** The monthly review: estimates, the frozen real points, and whether they're out of date. */
export function reviewMonth(ym) {
  const row = db.prepare('SELECT m.*, u.name AS by_name FROM month_points m LEFT JOIN users u ON u.id = m.calculated_by WHERE month = ?').get(ym);
  const now = computeRealPoints(ym);
  const stored = row ? JSON.parse(row.data) : null;
  const same = stored && now.events.length === Object.keys(stored).length
    && now.events.every((e) => stored[e.id] && Math.abs(stored[e.id].total - e.total) < 0.01);
  const live = db.prepare("SELECT COUNT(*) n FROM events WHERE strftime('%Y-%m', date) = ? AND status = 'planned'").get(ym).n;
  return {
    month: ym, now, live,
    closed: row ? { at: row.calculated_at, by: row.by_name || null, auto: row.calculated_by == null, profit: toRon(row.profit), scale: row.scale,
      data: stored, outOfDate: !same } : null,
    canClose: ym < new Date().toISOString().slice(0, 7),
  };
}

/** On the 1st (checked hourly): every past month with finalized events and no real points yet gets them. */
export function closeDueMonths() {
  const current = new Date().toISOString().slice(0, 7);
  const due = db.prepare(`SELECT DISTINCT strftime('%Y-%m', date) AS m FROM events WHERE status = 'completed'
    AND strftime('%Y-%m', date) < ? AND strftime('%Y-%m', date) NOT IN (SELECT month FROM month_points) ORDER BY m`).all(current);
  for (const { m } of due) {
    try { closeMonth(m); console.log(`Real points calculated for ${m}`); } catch (e) { console.error(`Real points for ${m} failed:`, e.message); }
  }
  return due.map((d) => d.m);
}

export function startPointsSchedule() {
  setTimeout(closeDueMonths, 30 * 1000).unref();
  setInterval(closeDueMonths, 60 * 60 * 1000).unref();
}

/**
 * Task lines of events: each task gets its share (%) of the event's points, and the people on it
 * share those equally. free = 1: done for free, the points are the community's.
 */
export function taskLines(where = '1', params = []) {
  const shares = getTaskShares();
  const lines = db.prepare(`
    SELECT t.id, t.event_id, t.task, t.person_id, t.free, p.name AS person_name, p.is_founder, e.points AS event_points,
      e.name AS title, e.date, e.status, e.skipped_tasks, e.task_points, a.name AS activity_name,
      (SELECT COUNT(*) FROM event_tasks x WHERE x.event_id = t.event_id AND x.task = t.task) AS sharing
    FROM event_tasks t JOIN events e ON e.id = t.event_id JOIN people p ON p.id = t.person_id
    LEFT JOIN activities a ON a.id = e.activity_id
    WHERE ${where} ORDER BY e.date, t.id`).all(...params);
  // An event's points depend on its profit unless typed by hand, so they come from the shaped event.
  const ids = [...new Set(lines.map((l) => l.event_id))];
  const points = new Map(ids.length ? rawEvents(`WHERE e.id IN (${ids.map(() => '?').join(',')})`, ids).map((e) => [e.id, e.points]) : []);
  return lines.map((l) => {
    const total = points.get(l.event_id) ?? 0;
    const share = eventTaskShares(l.skipped_tasks, shares)[l.task];
    const byHand = manualTaskPoints(l.task_points)[l.task];
    const taskTotal = byHand ?? (total * share) / 100;
    return { ...l, event_points: total, manual: byHand !== undefined, points: r2(taskTotal / l.sharing) };
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
// reinvested = everything spent from the fund; for the general fund that includes event discounts (discounts).
const blankFund = () => ({ starting: 0, allocated: 0, topups: 0, reinvested: 0, discounts: 0, balance: 0, pending: 0, events: 0 });

function finishFund(f) {
  for (const k of ['starting', 'allocated', 'topups', 'reinvested', 'discounts', 'pending']) f[k] = r2(f[k]);
  f.balance = r2(f.starting + f.allocated + f.topups - f.reinvested);
  return f;
}

/** All-time fund balances: general community fund and one per sport. */
export function computeFunds() {
  const general = blankFund();
  const bySport = new Map(sports().map((s) => [s.id, { id: s.id, name: s.name, is_sport: s.is_sport, ...blankFund() }]));
  const start = getStartingBalance();
  general.starting = Number(start.general) || 0;
  for (const [id, amount] of Object.entries(start.sports)) if (bySport.has(Number(id))) bySport.get(Number(id)).starting = Number(amount) || 0;
  for (const e of loadEvents("WHERE e.status IN ('completed', 'planned')")) {
    const s = bySport.get(e.type_id);
    if (e.status === FINALIZED) {
      general.allocated += e.split.general;
      general.reinvested += e.fund_paid; // the event's discounts are paid by the general fund
      general.discounts += e.fund_paid;
      s.allocated += e.split.sport;
      s.events++;
      general.events++;
    } else {
      general.pending += e.split.general - e.fund_paid;
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
      for (const k of ['starting', 'allocated', 'topups', 'reinvested', 'discounts', 'pending', 'events']) a[k] += s[k];
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
    reinvestedGeneral: 0, reinvestedSport: 0, discounts: 0, topups: 0, events: 0, live: 0,
    bySport: Object.fromEntries(list.map((s) => [s.id, { allocated: 0, reinvested: 0, profit: 0, events: 0 }])),
  }));
  const events = loadEvents("WHERE strftime('%Y', e.date) = ? AND e.status != 'cancelled'", [y]);
  for (const e of events) {
    const m = months[monthOf(e.date) - 1];
    if (e.status !== FINALIZED) { m.live++; continue; }
    m.events++;
    m.income += e.income; m.expenses += e.expenses; m.profit += e.profit;
    m.reinvestedGeneral += e.fund_paid; m.discounts += e.fund_paid; // discounts are paid by the general fund
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
  let running = Number(getStartingBalance().sports[id]) || 0; // what this sport's fund started with
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
 * Money the community holds: starting balance + finalized profit + donations − reinvested − payouts sent.
 * Equals the funds + payouts still owed (+ an organisers' share nobody earned points for).
 */
export function computeCash(funds = computeFunds()) {
  const months = computePayoutMonths();
  const sum = (k) => r2(months.reduce((a, m) => a + m[k], 0));
  const profit = r2(loadEvents("WHERE e.status = 'completed'").reduce((a, e) => a + e.profit, 0));
  const topups = r2(funds.general.topups + funds.sportsTotal.topups);
  const reinvested = r2(funds.general.reinvested + funds.sportsTotal.reinvested);
  const paid = sum('paid');
  const starting = r2(funds.general.starting + funds.sportsTotal.starting);
  // Vouchers given but not used yet: still in the account, but the funds will pay them out.
  const today = new Date().toISOString().slice(0, 10);
  // Percentage vouchers have no value until they're used at a training: counted apart (pct).
  const vouchers = db.prepare(`SELECT COUNT(*) AS n, COALESCE(SUM(value), 0) AS value, COALESCE(SUM(percent IS NOT NULL), 0) AS pct FROM vouchers
    WHERE used_date IS NULL AND (expires IS NULL OR expires >= ?)`).get(today);
  return {
    funds: r2(funds.general.balance + funds.sportsTotal.balance), openVouchers: { n: vouchers.n, pct: vouchers.pct, value: toRon(vouchers.value) },
    balance: r2(starting + profit + topups - reinvested - paid), starting, profit, topups, reinvested, paid, owed: sum('owed'), unassigned: sum('unassigned'),
    unpaidMonths: months.filter((m) => m.owed >= 0.01), // paid more than calculated isn't "not paid"
  };
}

/** Records the payouts for a month: whatever each person is owed now (all of it the first time). */
// `amounts` ({ personId: RON }) records what was really sent, e.g. a round 700 each; without it,
// whatever each person is owed. `date` is when it was paid (today by default).
export function applyPayouts(ym, userId, { amounts, date } = {}) {
  const r = computeFounders(ym);
  const lines = amounts
    ? Object.entries(amounts).map(([id, v]) => ({ id: Number(id), amount: Number(v) || 0 })).filter((l) => Math.abs(l.amount) >= 0.01)
      .map((l) => ({ ...l, name: r.people.find((p) => p.id === l.id)?.name || db.prepare('SELECT name FROM people WHERE id = ?').get(l.id)?.name }))
    : r.people.filter((p) => Math.abs(p.owed) >= 0.01).map((p) => ({ id: p.id, name: p.name, amount: p.owed }));
  if (lines.some((l) => !l.name)) throw Object.assign(new Error('Unknown person'), { status: 400 });
  const ins = db.prepare(`INSERT INTO payouts (month, person_id, person_name, amount, paid_at, created_by)
    VALUES (?, ?, ?, ?, COALESCE(?, date('now')), ?)`);
  for (const l of lines) ins.run(ym, l.id ?? null, l.name, toBani(l.amount), date || null, userId ?? null);
  return lines.length;
}
