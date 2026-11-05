// Brings the app's events and fund movements in line with the sheet data (data/import/*.mjs, kept out
// of git), for everything dated before a cut-off day. Safe to run again: what already matches is left alone.
//
//   npm run sync:sheet -- data/import/sheet-2026.mjs                      # preview: shows what would change, changes nothing
//   npm run sync:sheet -- data/import/sheet-2026.mjs --apply              # make the changes
//   npm run sync:sheet -- data/import/sheet-2026.mjs --before 2026-11-01  # cut-off (default: 1 Nov 2026)
//   ... --keep-live      don't finalize past events that are still live
//   ... --remove-extra   also delete costs / fund movements added in the app that the sheet doesn't have
//
// For each event in the sheet the app event is found by date, sport and name (or the same name a few days
// apart). If its income and costs already match the sheet, it's left untouched. Otherwise the parts that
// come from the sheet are set: participants, fee, the amount collected and the cost lines. Costs someone
// added in the app (not from an import) are only reported, unless --remove-extra. Events and fund movements
// missing from the app are created, as one import that can be undone on the Import page.
// Organizers, tasks, discounts, stock and points set in the app are kept.
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { db, toBani, toRon } from '../db.js';
import { closeMonth, loadEvents } from '../finance.js';

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def; };
const file = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--before');
if (!file) {
  console.error('Usage: npm run sync:sheet -- <data file> [--apply] [--before YYYY-MM-DD] [--keep-live]');
  process.exit(1);
}
const APPLY = args.includes('--apply'), KEEP_LIVE = args.includes('--keep-live'), REMOVE_EXTRA = args.includes('--remove-extra');
const BEFORE = opt('--before', '2026-11-01');
if (!/^\d{4}-\d{2}-\d{2}$/.test(BEFORE)) { console.error('--before needs a date like 2026-11-01'); process.exit(1); }

const data = await import(pathToFileURL(resolve(file)).href);
const events = data.events.filter((e) => e.date < BEFORE);
const fund = (data.fund || []).filter((f) => f.date < BEFORE);
const FROM = [...events, ...fund].map((x) => x.date).sort()[0];
const today = new Date().toISOString().slice(0, 10);

const fold = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const words = (s) => new Set(fold(s).split(' ').filter(Boolean));
const likeness = (a, b) => { const x = words(a), y = words(b); const both = [...x].filter((w) => y.has(w)).length; return both / (new Set([...x, ...y]).size || 1); };
const days = (a, b) => Math.abs(new Date(a) - new Date(b)) / 864e5;
const ron = (v) => `${Math.round(v * 100) / 100}`;
const same = (a, b) => Math.abs(a - b) < 0.005;

const admin = db.prepare('SELECT id FROM users ORDER BY id LIMIT 1').get();
if (!admin) { console.error('No admin account yet — create one in the app first.'); process.exit(1); }

const report = { ok: 0, changed: [], created: [], fund: [], kept: [], left: [], appOnly: [], finalized: [] };
const touchedMonths = new Set();
let syncImportId = null;
const importId = () => (syncImportId ??= Number(db.prepare('INSERT INTO imports (source, created_by) VALUES (?, ?)')
  .run(`Sheet sync before ${BEFORE} (${today})`, admin.id).lastInsertRowid));

const sportId = (n) => db.prepare('SELECT id FROM event_types WHERE name = ? COLLATE NOCASE').get(n)?.id
  ?? Number(db.prepare('INSERT INTO event_types (name) VALUES (?)').run(n).lastInsertRowid);
const activityId = (n) => (n ? db.prepare('SELECT id FROM activities WHERE name = ?').get(n)?.id ?? null : null);
const catId = (name, kind) => db.prepare('SELECT id FROM categories WHERE name = ? AND kind = ?').get(name, kind)?.id
  ?? Number(db.prepare("INSERT INTO categories (name, kind, cost_group) VALUES (?, ?, 'organizing')").run(name, kind).lastInsertRowid);
const insTx = db.prepare(`INSERT INTO transactions (event_id, kind, category_id, amount, date, description, fund_sport_id, created_by, import_id)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
const isHyrox = (s) => fold(s) === 'hyrox';
const shaped = (id) => loadEvents('WHERE e.id = ?', [id])[0];

/** What the sheet says an event brought in, cost and made. Hyrox is kept as our share (people × 10). */
function sheetMoney(s) {
  const income = Array.isArray(s.income) ? s.income[0] * s.income[1] : s.income.income;
  const costs = s.costs.reduce((a, c) => a + c[0], 0);
  return { income, costs, profit: income - costs };
}
/** Does the app event agree with the sheet? Hyrox only by profit (the app books the venue's part both ways). */
function agrees(ev, s) {
  const m = sheetMoney(s);
  if (!same(ev.profit, m.profit)) return false;
  return isHyrox(s.sport) || (same(ev.income, m.income) && same(ev.expenses, m.costs));
}

db.exec('BEGIN');
try {
  /* ---- events */
  const appEvents = db.prepare(`SELECT e.*, et.name AS type_name FROM events e JOIN event_types et ON et.id = e.type_id
    WHERE e.date >= date(?, '-5 days') AND e.date < ?`).all(FROM, BEFORE);
  const used = new Set();
  const findEvent = (s) => {
    const pool = appEvents.filter((e) => !used.has(e.id) && fold(e.type_name) === fold(s.sport));
    const sameDay = pool.filter((e) => e.date === s.date);
    const best = (list) => list.map((e) => ({ e, k: likeness(e.name, s.name) })).sort((a, b) => b.k - a.k)[0];
    const exact = sameDay.find((e) => fold(e.name) === fold(s.name));
    if (exact) return exact;
    const b = best(sameDay);
    if (b && (b.k > 0 || sameDay.length === 1)) return b.e;
    const moved = pool.find((e) => fold(e.name) === fold(s.name) && days(e.date, s.date) <= 3); // date changed in the app
    return moved || null;
  };
  // Exact names first, so a similar name never takes another event's match.
  const order = [...events.keys()].sort((a, b) => {
    const ex = (s) => (appEvents.some((e) => e.date === s.date && fold(e.name) === fold(s.name)) ? 0 : 1);
    return ex(events[a]) - ex(events[b]);
  });
  const matches = new Map();
  for (const i of order) { const m = findEvent(events[i]); if (m) { used.add(m.id); matches.set(i, m); } }

  for (const [i, s] of events.entries()) {
    const label = `${s.date}  ${s.name}`;
    const want = sheetMoney(s);
    const [people, fee] = Array.isArray(s.income) ? s.income : [s.income.people ?? null, null];
    let row = matches.get(i);

    if (!row) {
      // Not in the app: create it like the import does.
      const hyrox = isHyrox(s.sport) && fee === 10;
      const id = Number(db.prepare(`INSERT INTO events (name, type_id, activity_id, date, location, status, participants,
        participation_fee, venue_fee, created_by, import_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
        s.name, sportId(s.sport), activityId(s.activity), s.date, s.location ?? null, s.date < today ? 'completed' : 'planned',
        people || 0, toBani(hyrox ? 50 : fee || 0), toBani(hyrox ? 40 : 0), admin.id, importId()).lastInsertRowid);
      if (!Array.isArray(s.income) && s.income.income > 0)
        insTx.run(id, 'income', catId('Participation fees', 'income'), toBani(s.income.income), s.date, 'Collected (from sheet)', null, admin.id, importId());
      for (const [amount, description, category] of s.costs)
        insTx.run(id, 'expense', catId(category, 'expense'), toBani(amount), s.date, description, null, admin.id, importId());
      const ev = shaped(id);
      report.created.push(`${label}  (${s.sport}; income ${ron(ev.income)}, costs ${ron(ev.expenses)}, profit ${ron(ev.profit)} RON)`);
      touchedMonths.add(s.date.slice(0, 7));
      continue;
    }

    const notes = [];
    if (row.date !== s.date) {
      db.prepare('UPDATE events SET date = ? WHERE id = ?').run(s.date, row.id);
      notes.push(`date ${row.date} → ${s.date}`);
      touchedMonths.add(row.date.slice(0, 7));
    }
    if (row.status === 'cancelled') report.left.push(`${label}: cancelled in the app but in the sheet — left cancelled`);
    else if (row.status === 'planned' && s.date < today && !KEEP_LIVE) {
      db.prepare("UPDATE events SET status = 'completed' WHERE id = ?").run(row.id);
      report.finalized.push(label);
      touchedMonths.add(s.date.slice(0, 7));
    }
    const before = shaped(row.id);
    if (agrees(before, s)) {
      if (notes.length) report.changed.push(`${label}: ${notes.join('; ')}`);
      else report.ok++;
      continue;
    }

    // Participants and fee (a Hyrox fee is the full price in the app, so only the people count is set).
    if (people != null && row.participants !== people) {
      db.prepare('UPDATE events SET participants = ? WHERE id = ?').run(people, row.id);
      notes.push(`participants ${row.participants} → ${people}`);
    }
    if (fee != null && !isHyrox(s.sport) && !row.price_parts && row.participation_fee !== toBani(fee)) {
      db.prepare('UPDATE events SET participation_fee = ? WHERE id = ?').run(toBani(fee), row.id);
      notes.push(`fee ${toRon(row.participation_fee)} → ${fee}`);
    }
    if (isHyrox(s.sport) && fee === 10 && row.participation_fee === 1000 && !row.venue_fee) // still the sheet's 10 RON: switch to 50 / 40
      db.prepare('UPDATE events SET participation_fee = 5000, venue_fee = 4000 WHERE id = ?').run(row.id);

    // Amount collected (when the sheet gives a lump sum instead of people × fee).
    const incomeTx = db.prepare("SELECT * FROM transactions WHERE event_id = ? AND kind = 'income' ORDER BY id").all(row.id);
    if (!Array.isArray(s.income)) {
      const amount = toBani(s.income.income);
      const t = incomeTx.find((x) => x.amount === amount) || incomeTx.find((x) => x.description === 'Collected (from sheet)') || (incomeTx.length === 1 ? incomeTx[0] : null);
      if (t && t.amount !== amount) {
        if (amount > 0) db.prepare('UPDATE transactions SET amount = ? WHERE id = ?').run(amount, t.id);
        else db.prepare('DELETE FROM transactions WHERE id = ?').run(t.id);
        notes.push(`collected ${toRon(t.amount)} → ${s.income.income}`);
      } else if (!t && amount > 0) {
        insTx.run(row.id, 'income', catId('Participation fees', 'income'), amount, s.date, 'Collected (from sheet)', null, admin.id, importId());
        notes.push(`collected + ${s.income.income}`);
      }
    }

    // Cost lines: keep matching ones, fix amounts of the same line, add missing ones, drop imported lines the sheet no longer has.
    let left = db.prepare("SELECT * FROM transactions WHERE event_id = ? AND kind = 'expense' ORDER BY id").all(row.id);
    const take = (pred) => { const t = left.find(pred); if (t) left = left.filter((x) => x !== t); return t; };
    const missing = [];
    for (const c of s.costs) if (!take((t) => t.amount === toBani(c[0]) && fold(t.description) === fold(c[1]))) missing.push(c);
    for (const c of missing) {
      const t = take((t) => fold(t.description) === fold(c[1])) || take((t) => t.amount === toBani(c[0]));
      if (t && t.amount !== toBani(c[0])) {
        db.prepare('UPDATE transactions SET amount = ? WHERE id = ?').run(toBani(c[0]), t.id);
        notes.push(`cost “${c[1]}” ${toRon(t.amount)} → ${c[0]}`);
      } else if (!t) {
        insTx.run(row.id, 'expense', catId(c[2], 'expense'), toBani(c[0]), s.date, c[1], null, admin.id, importId());
        notes.push(`cost + ${c[0]} “${c[1]}”`);
      }
    }
    for (const t of left) {
      if ((t.import_id != null && t.import_id !== syncImportId) || REMOVE_EXTRA) {
        db.prepare('DELETE FROM transactions WHERE id = ?').run(t.id);
        notes.push(`cost − ${toRon(t.amount)} “${t.description}” (${t.import_id != null ? 'no longer in the sheet' : 'added in the app, not in the sheet'})`);
      } else report.kept.push(`${label}: cost ${toRon(t.amount)} “${t.description}” was added in the app, not in the sheet — kept (--remove-extra deletes it)`);
    }

    const after = shaped(row.id);
    touchedMonths.add(s.date.slice(0, 7));
    if (notes.length) report.changed.push(`${label}: ${notes.join('; ')}  [profit ${ron(before.profit)} → ${ron(after.profit)}, sheet ${ron(want.profit)}]`);
    if (!agrees(after, s)) {
      const why = [after.discounts && 'discounts', after.member_discounts && 'member prices', after.free_skip_count && 'free entries',
        after.stock_cost && 'stock used', after.venue_cost && !isHyrox(s.sport) && 'venue fee', row.price_parts && 'split price'].filter(Boolean);
      report.left.push(`${label}: app income ${ron(after.income)} / costs ${ron(after.expenses)} / profit ${ron(after.profit)}, sheet ${ron(want.income)} / ${ron(want.costs)} / ${ron(want.profit)}`
        + (why.length ? ` — the app also has ${why.join(', ')}; check by hand` : ' — check by hand'));
    }
  }
  for (const e of appEvents)
    if (!used.has(e.id) && e.date >= FROM && e.status !== 'cancelled')
      report.appOnly.push(`${e.date}  ${e.name}  (${e.type_name}, ${e.status === 'completed' ? 'finalized' : 'live'})`);

  /* ---- money not tied to an event */
  const appFund = db.prepare(`SELECT t.*, et.name AS fund_name FROM transactions t LEFT JOIN event_types et ON et.id = t.fund_sport_id
    WHERE t.event_id IS NULL AND t.date >= date(?, '-7 days') AND t.date < ?
      AND t.id NOT IN (SELECT transaction_id FROM stock_purchases WHERE transaction_id IS NOT NULL) ORDER BY t.date, t.id`).all(FROM, BEFORE);
  let pool = appFund;
  const take = (pred) => { const t = pool.find(pred); if (t) pool = pool.filter((x) => x !== t); return t; };
  for (const f of fund) {
    const amount = toBani(f.amount), label = `${f.date}  ${f.kind} ${f.amount} “${f.description}”`;
    const fundId = f.fund === 'general' ? null : sportId(f.fund);
    if (take((t) => t.date === f.date && t.kind === f.kind && t.amount === amount)) continue;
    const t = take((t) => t.kind === f.kind && fold(t.description) === fold(f.description) && days(t.date, f.date) <= 7 && (t.date === f.date || t.amount === amount));
    if (t) {
      db.prepare('UPDATE transactions SET amount = ?, date = ? WHERE id = ?').run(amount, f.date, t.id);
      report.fund.push(`${label}: was ${toRon(t.amount)} on ${t.date} — fixed`);
      touchedMonths.add(f.date.slice(0, 7));
      continue;
    }
    insTx.run(null, f.kind, catId(f.category, f.kind), amount, f.date, f.description, fundId, admin.id, importId());
    report.fund.push(`${label}: missing — added (${f.fund} fund)`);
    touchedMonths.add(f.date.slice(0, 7));
  }
  for (const t of pool) {
    if (t.date < FROM) continue;
    if ((t.import_id != null && t.import_id !== syncImportId) || REMOVE_EXTRA) {
      db.prepare('DELETE FROM transactions WHERE id = ?').run(t.id);
      report.fund.push(`${t.date}  ${t.kind} ${toRon(t.amount)} “${t.description}”: ${t.import_id != null ? 'imported earlier' : 'added in the app'}, not in the sheet — removed`);
      touchedMonths.add(t.date.slice(0, 7));
    } else report.kept.push(`${t.date}  ${t.kind} ${toRon(t.amount)} “${t.description}” (${t.fund_name || 'general'} fund) was added in the app, not in the sheet — kept`);
  }

  /* ---- months whose real points are already calculated get them again */
  const closed = db.prepare('SELECT month FROM month_points ORDER BY month').all().map((r) => r.month).filter((m) => touchedMonths.has(m));
  for (const m of closed) closeMonth(m);

  /* ---- report */
  const section = (title, list) => { if (list.length) { console.log(`\n${title} (${list.length})`); for (const l of list) console.log(`  ${l}`); } };
  console.log(`${APPLY ? 'Syncing' : 'Preview (nothing is saved — add --apply to save)'}: ${events.length} events and ${fund.length} fund movements from the sheet, before ${BEFORE}.`);
  console.log(`${report.ok} events already match the sheet.`);
  section('Events changed to match the sheet', report.changed);
  section('Events missing from the app — created', report.created);
  section('Live events in the past — finalized', report.finalized);
  section('Money not tied to an event', report.fund);
  section('STILL DIFFERENT from the sheet — please check', report.left);
  section('In the app but not in the sheet — kept as they are', report.kept);
  section('Events in the app that the sheet doesn’t have — kept', report.appOnly);
  if (closed.length) console.log(`\nReal points recalculated for ${closed.join(', ')}.`);
  if (syncImportId) console.log(`\nNew rows are import #${syncImportId}; it can be undone on the Import page.`);

  if (APPLY) { db.exec('COMMIT'); console.log('\nSaved.'); }
  else db.exec('ROLLBACK');
} catch (e) {
  db.exec('ROLLBACK');
  throw e;
}
