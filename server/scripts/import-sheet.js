// One-off import of a hand-structured spreadsheet export (see data/import/*.mjs, kept out of git).
//
//   npm run import:sheet -- data/import/sheet-2026.mjs           # check + import
//   npm run import:sheet -- data/import/sheet-2026.mjs --check   # only compare with the sheet's daily balances
//
// The data module exports:
//   source     — name shown on the Import page (also used to refuse importing the same file twice)
//   founders   — people to create as founders if they don't exist yet
//   events     — [{ date, name, sport, activity, income: [people, fee] | { income, people? }, location, costs: [[amount, description, category]] }]
//   fund       — [{ date, kind, amount, description, category, fund: 'general' | sport name }]  (money not tied to an event)
//   skipped    — lines deliberately left out (e.g. payouts already made), only used for the balance check
//   sheetDaily — { 'YYYY-MM-DD': net } daily totals from the sheet, used to check the data before importing
//
// Events dated before today are created as finalized, the rest as live. The whole run is one
// import, so it can be undone from the Import page.
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { applyHyroxPricing, db, toBani, tx } from '../db.js';

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--'));
if (!file) {
  console.error('Usage: npm run import:sheet -- <data file> [--check]');
  process.exit(1);
}
const data = await import(pathToFileURL(resolve(file)).href);
const { source, founders = [], events, fund = [], skipped = [], sheetDaily = {} } = data;

/* ---- 1. compare with the sheet's own daily balances */
const incomeOf = (e) => (Array.isArray(e.income) ? e.income[0] * e.income[1] : e.income.income);
const net = {};
const add = (d, v) => (net[d] = (net[d] || 0) + v);
for (const e of events) add(e.date, incomeOf(e) - e.costs.reduce((s, c) => s + c[0], 0));
for (const f of fund) add(f.date, f.kind === 'income' ? f.amount : -f.amount);
for (const s of skipped) add(s.date, -s.amount);
const days = Object.keys(sheetDaily);
const mismatches = days.filter((d) => net[d] !== sheetDaily[d]);
console.log(`Balance check: ${days.length - mismatches.length}/${days.length} days match the sheet.`);
for (const d of mismatches) console.log(`  ${d}: data gives ${net[d] ?? 0}, sheet says ${sheetDaily[d]}`);
if (args.includes('--check')) process.exit(0);

/* ---- 2. import */
const admin = db.prepare('SELECT id FROM users ORDER BY id LIMIT 1').get();
if (!admin) {
  console.error('No admin account yet — open the app and create the first admin, then run this again.');
  process.exit(1);
}
if (db.prepare('SELECT 1 FROM imports WHERE source = ?').get(source)) {
  console.error(`“${source}” was already imported. Undo it on the Import page first if you want to re-import.`);
  process.exit(1);
}

const today = new Date().toISOString().slice(0, 10);
const result = tx(() => {
  for (const name of founders) db.prepare('INSERT OR IGNORE INTO people (name, is_founder) VALUES (?, 1)').run(name);

  // Sports and categories the data needs but a fresh database may not have.
  for (const s of new Set([...events.map((e) => e.sport), ...fund.filter((f) => f.fund !== 'general').map((f) => f.fund)]))
    db.prepare('INSERT OR IGNORE INTO event_types (name) VALUES (?)').run(s);
  const ensureCat = (name, kind) =>
    db.prepare('SELECT id FROM categories WHERE name = ? AND kind = ?').get(name, kind)?.id
    ?? Number(db.prepare("INSERT INTO categories (name, kind, cost_group) VALUES (?, ?, 'organizing')").run(name, kind).lastInsertRowid);
  const sport = (n) => db.prepare('SELECT id FROM event_types WHERE name = ?').get(n).id;
  const activity = (n) => {
    if (!n) return null;
    const a = db.prepare('SELECT id FROM activities WHERE name = ?').get(n);
    if (!a) throw new Error(`Activity “${n}” is not in the points table`);
    return a.id;
  };

  const importId = Number(db.prepare('INSERT INTO imports (source, created_by) VALUES (?, ?)').run(source, admin.id).lastInsertRowid);
  const insEvent = db.prepare(`INSERT INTO events (name, type_id, activity_id, date, location, status, participants,
    participation_fee, created_by, import_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const insTx = db.prepare(`INSERT INTO transactions (event_id, kind, category_id, amount, date, description, fund_sport_id,
    created_by, import_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);

  for (const e of events) {
    const [people, fee] = Array.isArray(e.income) ? e.income : [e.income.people || 0, 0];
    const id = Number(insEvent.run(e.name, sport(e.sport), activity(e.activity), e.date, e.location ?? null,
      e.date < today ? 'completed' : 'planned', people, toBani(fee), admin.id, importId).lastInsertRowid);
    // Amounts that don't follow a people × fee pattern are recorded as collected income.
    if (!Array.isArray(e.income) && e.income.income > 0)
      insTx.run(id, 'income', ensureCat('Participation fees', 'income'), toBani(e.income.income), e.date, 'Collected (from sheet)',
        null, admin.id, importId);
    for (const [amount, description, category] of e.costs)
      insTx.run(id, 'expense', ensureCat(category, 'expense'), toBani(amount), e.date, description, null, admin.id, importId);
  }
  for (const f of fund)
    insTx.run(null, f.kind, ensureCat(f.category, f.kind), toBani(f.amount), f.date, f.description,
      f.fund === 'general' ? null : sport(f.fund), admin.id, importId);
  return { importId };
});
// The sheet records Hyrox as people × 10 (our share only); switch to full price + venue cost.
applyHyroxPricing();

console.log(`Imported ${events.length} events and ${fund.length} fund movements as import #${result.importId}.`);
if (skipped.length) {
  console.log('Left out on purpose:');
  for (const s of skipped) console.log(`  ${s.date}  ${s.amount} RON  ${s.description}`);
}
