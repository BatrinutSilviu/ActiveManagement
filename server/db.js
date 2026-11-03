import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const DB_PATH = process.env.DB_PATH || resolve(root, 'data/active.db');
mkdirSync(dirname(DB_PATH), { recursive: true });

export const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS event_types (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE
);
CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('income','expense')),
  UNIQUE (name, kind)
);
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  type_id INTEGER NOT NULL REFERENCES event_types(id),
  sport TEXT,
  date TEXT NOT NULL,
  end_date TEXT,
  location TEXT,
  status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','completed','cancelled')),
  participants INTEGER NOT NULL DEFAULT 0,
  budget INTEGER NOT NULL DEFAULT 0,          -- planned expenses, in bani
  notes TEXT,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY,
  event_id INTEGER REFERENCES events(id) ON DELETE CASCADE,   -- NULL = general / overhead
  kind TEXT NOT NULL CHECK (kind IN ('income','expense')),
  category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  amount INTEGER NOT NULL CHECK (amount >= 0),                -- in bani
  date TEXT NOT NULL,
  description TEXT,
  payment_method TEXT,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_tx_event ON transactions(event_id);
CREATE INDEX IF NOT EXISTS idx_tx_date ON transactions(date);
CREATE INDEX IF NOT EXISTS idx_events_date ON events(date);
CREATE TABLE IF NOT EXISTS imports (
  id INTEGER PRIMARY KEY,
  source TEXT,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
-- Community members: founders, organizers and whoever holds stock.
CREATE TABLE IF NOT EXISTS people (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE,
  is_founder INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1
);
-- Organizer / co-organizer of an event, with the points they earn for it.
CREATE TABLE IF NOT EXISTS event_people (
  id INTEGER PRIMARY KEY,
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  person_id INTEGER NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('organizer','co-organizer')),
  points REAL NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS stock_items (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE,
  unit TEXT NOT NULL DEFAULT 'pcs',
  unit_price INTEGER NOT NULL DEFAULT 0          -- in bani
);
-- How much of each item each person currently holds.
CREATE TABLE IF NOT EXISTS stock_holdings (
  item_id INTEGER NOT NULL REFERENCES stock_items(id) ON DELETE CASCADE,
  person_id INTEGER NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  qty REAL NOT NULL DEFAULT 0,
  PRIMARY KEY (item_id, person_id)
);
-- Products taken from stock for an event; price is frozen at the moment of use.
CREATE TABLE IF NOT EXISTS event_stock (
  id INTEGER PRIMARY KEY,
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  item_id INTEGER NOT NULL REFERENCES stock_items(id),
  person_id INTEGER REFERENCES people(id) ON DELETE SET NULL,
  qty REAL NOT NULL CHECK (qty > 0),
  unit_price INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`);

// Migrations for databases created by earlier versions.
const columns = (table) => db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
if (!columns('transactions').includes('import_id'))
  db.exec('ALTER TABLE transactions ADD COLUMN import_id INTEGER REFERENCES imports(id) ON DELETE SET NULL');
if (!columns('events').includes('import_id'))
  db.exec('ALTER TABLE events ADD COLUMN import_id INTEGER REFERENCES imports(id) ON DELETE SET NULL');
// admin: everything, incl. accounts and imports · editor: events and money · viewer: read-only.
// Accounts that existed before roles were added stay admins.
if (!columns('users').includes('role'))
  db.exec("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'admin' CHECK (role IN ('admin', 'editor', 'viewer'))");
if (!columns('events').includes('participation_fee'))
  db.exec('ALTER TABLE events ADD COLUMN participation_fee INTEGER NOT NULL DEFAULT 0'); // in bani, per person
// Transactions without an event move money in/out of a fund: a sport's fund, or the general fund when NULL.
if (!columns('transactions').includes('fund_sport_id'))
  db.exec('ALTER TABLE transactions ADD COLUMN fund_sport_id INTEGER REFERENCES event_types(id) ON DELETE SET NULL');
if (!columns('categories').includes('cost_group')) {
  db.exec("ALTER TABLE categories ADD COLUMN cost_group TEXT NOT NULL DEFAULT 'organizing'");
  db.exec("UPDATE categories SET cost_group = 'benefit' WHERE kind = 'expense' AND name IN ('Equipment', 'Prizes & trophies', 'Food & drinks')");
}

// Event "types" are the sports. Older databases had generic Sport/Tournament tags.
export const SPORTS = ['Football', 'Volleyball', 'Basketball', 'Handball', 'Padel', 'Running', 'Hiking', 'Biking',
  'Tennis', 'Foot tennis', 'Hyrox'];
if (!db.prepare("SELECT 1 FROM event_types WHERE name = 'Football'").get()) {
  const ins = db.prepare('INSERT OR IGNORE INTO event_types (name) VALUES (?)');
  for (const s of SPORTS) ins.run(s);
  db.exec(`UPDATE events SET type_id = (SELECT id FROM event_types et WHERE et.name = events.sport COLLATE NOCASE)
    WHERE sport IS NOT NULL AND EXISTS (SELECT 1 FROM event_types et WHERE et.name = events.sport COLLATE NOCASE)`);
  db.exec(`DELETE FROM event_types WHERE name IN ('Sport', 'Tournament')
    AND NOT EXISTS (SELECT 1 FROM events e WHERE e.type_id = event_types.id)`);
}

if (!db.prepare('SELECT 1 FROM categories LIMIT 1').get()) {
  const c = db.prepare('INSERT INTO categories (name, kind, cost_group) VALUES (?, ?, ?)');
  for (const n of ['Participation fees', 'Registration fees', 'Sponsorship', 'Donations', 'Merchandise', 'Other income'])
    c.run(n, 'income', 'organizing');
  for (const n of ['Venue rental', 'Trainers', 'Referees', 'Transport', 'Marketing', 'Insurance', 'Medical', 'Other expenses'])
    c.run(n, 'expense', 'organizing');
  for (const n of ['Food & drinks', 'Prizes & trophies', 'Equipment']) c.run(n, 'expense', 'benefit');
}
if (!db.prepare("SELECT 1 FROM categories WHERE name = 'Trainers'").get())
  db.prepare("INSERT INTO categories (name, kind, cost_group) VALUES ('Trainers', 'expense', 'organizing')").run();

/* ------------------------------------------------ points & contributions */

db.exec(`
-- The points catalogue: what an activity is worth for its main organiser and each co-organiser.
-- *_max is set when the table gives a range (e.g. 3–5); the low end is the default.
CREATE TABLE IF NOT EXISTS activities (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE,
  organizer_points REAL NOT NULL DEFAULT 0,
  organizer_max REAL,
  co_points REAL NOT NULL DEFAULT 0,
  co_max REAL,
  sport_id INTEGER REFERENCES event_types(id) ON DELETE SET NULL,  -- default activity for this sport's events
  sort INTEGER NOT NULL DEFAULT 0
);
-- Points earned outside an event (partnership secured, promo work…).
CREATE TABLE IF NOT EXISTS contributions (
  id INTEGER PRIMARY KEY,
  person_id INTEGER NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  activity_id INTEGER REFERENCES activities(id) ON DELETE SET NULL,
  date TEXT NOT NULL,
  points REAL NOT NULL DEFAULT 0,
  note TEXT,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
-- Split targets set for one specific month (overrides the default split).
CREATE TABLE IF NOT EXISTS month_splits (
  month TEXT PRIMARY KEY,                 -- YYYY-MM
  value TEXT NOT NULL
);
`);
db.exec(`
-- Reusable discounts, e.g. "Founders – Hyrox free" (100%, Hyrox) or "Student" (20%, any sport).
CREATE TABLE IF NOT EXISTS discounts (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE,
  kind TEXT NOT NULL CHECK (kind IN ('percent', 'fixed')),
  value REAL NOT NULL,                     -- percent (0–100) or a fixed amount in bani
  sport_id INTEGER REFERENCES event_types(id) ON DELETE CASCADE   -- NULL = any sport
);
-- Which discounts each person is entitled to.
CREATE TABLE IF NOT EXISTS person_discounts (
  person_id INTEGER NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  discount_id INTEGER NOT NULL REFERENCES discounts(id) ON DELETE CASCADE,
  PRIMARY KEY (person_id, discount_id)
);
-- A discount actually given at an event. The amount is fixed when added (recomputed only
-- if the event's fee changes), so editing a discount later doesn't rewrite past events.
CREATE TABLE IF NOT EXISTS event_discounts (
  id INTEGER PRIMARY KEY,
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  person_id INTEGER NOT NULL REFERENCES people(id),
  discount_id INTEGER REFERENCES discounts(id) ON DELETE SET NULL, -- NULL = one-off amount
  kind TEXT NOT NULL CHECK (kind IN ('percent', 'fixed')),
  value REAL NOT NULL,
  amount INTEGER NOT NULL,                 -- in bani
  note TEXT,
  UNIQUE (event_id, person_id)
);
`);

if (!columns('events').includes('activity_id'))
  db.exec('ALTER TABLE events ADD COLUMN activity_id INTEGER REFERENCES activities(id) ON DELETE SET NULL');

if (!db.prepare('SELECT 1 FROM activities LIMIT 1').get()) {
  const sport = (n) => db.prepare('SELECT id FROM event_types WHERE name = ?').get(n)?.id ?? null;
  const ins = db.prepare(`INSERT INTO activities (name, organizer_points, organizer_max, co_points, co_max, sport_id, sort)
    VALUES (?, ?, ?, ?, ?, ?, ?)`);
  [
    ['Running event', 1, null, 1, null, 'Running'],
    ['Football match', 2, null, 1, null, 'Football'],
    ['Hyrox event', 3, null, 1, null, 'Hyrox'],
    ['Padel — 2 hours', 4, null, 1, null, 'Padel'],
    ['Padel — 3–4 hours', 6, null, 2, null, null],
    ['Padel — 2 days', 10, null, 2, null, null],
    ['Day hike', 8, null, 2, null, 'Hiking'],
    ['Via ferrata', 9, null, 2, null, null],
    ['Weekend at a cabin + hike', 12, null, 3, null, null],
    ['Free event with a sports club or partner', 3, 5, 1, 2, null],
    ['Major promotional event', 4, null, 2, null, null],
    ['Concrete partnership secured', 4, null, 0, null, null],
  ].forEach(([name, op, omax, cp, cmax, s], i) => ins.run(name, op, omax, cp, cmax, sport(s), i));
}

// Event tasks. An event is worth `events.points`; each task gets a fixed share of that (set in
// Settings, see getTaskShares) and the people on a task share its points equally. Someone doing a
// task for free (free = 1) gives their points to the community: that money goes to the event's sport fund.
export const TASKS = ['announce', 'signups', 'fees', 'hosting', 'buying'];
db.exec(`CREATE TABLE IF NOT EXISTS event_tasks (
  id INTEGER PRIMARY KEY,
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  task TEXT NOT NULL CHECK (task IN ('announce', 'signups', 'fees', 'hosting', 'buying')),
  person_id INTEGER NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  free INTEGER NOT NULL DEFAULT 0
)`);
db.exec('CREATE INDEX IF NOT EXISTS event_tasks_event ON event_tasks (event_id)');
// Before tasks, an event had an organiser (its points = the event's points) and co-organisers.
// The organiser takes every task, co-organisers help host; the co-organiser bonus is dropped.
if (!columns('events').includes('points')) {
  db.exec('ALTER TABLE events ADD COLUMN points REAL NOT NULL DEFAULT 0');
  tx(() => {
    const ins = db.prepare('INSERT INTO event_tasks (event_id, task, person_id) VALUES (?, ?, ?)');
    for (const ev of db.prepare('SELECT DISTINCT event_id FROM event_people').all()) {
      const rows = db.prepare('SELECT * FROM event_people WHERE event_id = ? ORDER BY role DESC, points DESC, id').all(ev.event_id);
      const lead = rows.find((r) => r.role === 'organizer') || rows[0];
      db.prepare('UPDATE events SET points = ? WHERE id = ?').run(lead.points, ev.event_id);
      for (const t of TASKS) ins.run(ev.event_id, t, lead.person_id);
      for (const r of rows) if (r.person_id !== lead.person_id) ins.run(ev.event_id, 'hosting', r.person_id);
    }
  });
}

// Stock categories: one per sport plus "Miscellaneous" (with a "Halloween" subcategory to start).
// Categories can have subcategories; a product sits in one (Miscellaneous when none is chosen).
db.exec(`CREATE TABLE IF NOT EXISTS stock_categories (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  parent_id INTEGER REFERENCES stock_categories(id) ON DELETE CASCADE,
  sport_id INTEGER UNIQUE REFERENCES event_types(id) ON DELETE SET NULL
)`);
if (!columns('stock_items').includes('category_id'))
  db.exec('ALTER TABLE stock_items ADD COLUMN category_id INTEGER REFERENCES stock_categories(id) ON DELETE SET NULL');

/** Makes sure every sport has its category and Miscellaneous exists; returns Miscellaneous's id. */
export function ensureStockCategories() {
  let misc = db.prepare("SELECT id FROM stock_categories WHERE parent_id IS NULL AND sport_id IS NULL AND name = 'Miscellaneous'").get()?.id;
  if (!misc) {
    misc = Number(db.prepare("INSERT INTO stock_categories (name) VALUES ('Miscellaneous')").run().lastInsertRowid);
    db.prepare("INSERT INTO stock_categories (name, parent_id) VALUES ('Halloween', ?)").run(misc);
  }
  db.prepare(`INSERT INTO stock_categories (name, sport_id) SELECT et.name, et.id FROM event_types et
    WHERE et.is_sport = 1 AND NOT EXISTS (SELECT 1 FROM stock_categories c WHERE c.sport_id = et.id)`).run();
  db.prepare('UPDATE stock_categories SET name = (SELECT name FROM event_types WHERE id = sport_id) WHERE sport_id IS NOT NULL').run();
  db.prepare('UPDATE stock_items SET category_id = ? WHERE category_id IS NULL').run(misc);
  return misc;
}

// Stock someone bought: usual items / prizes for events, or merchandise from a secured partnership.
// The amount (what they paid) only drives the buyer's points; buying stock isn't an expense itself.
db.exec(`CREATE TABLE IF NOT EXISTS stock_purchases (
  id INTEGER PRIMARY KEY,
  item_id INTEGER NOT NULL REFERENCES stock_items(id) ON DELETE CASCADE,
  person_id INTEGER NOT NULL REFERENCES people(id) ON DELETE CASCADE,   -- who bought it
  holder_id INTEGER REFERENCES people(id) ON DELETE SET NULL,           -- who keeps it
  qty REAL NOT NULL CHECK (qty > 0),
  amount INTEGER NOT NULL DEFAULT 0,                                    -- bani paid
  kind TEXT NOT NULL CHECK (kind IN ('items', 'merch')),
  date TEXT NOT NULL,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
)`);

// Vouchers we give as prizes (e.g. padel court time won at a padel event) and the winner uses later.
// Giving one costs nothing yet; when it's used, what we pay the venue is recorded as money spent from
// the sport's fund (a transaction, linked here), on the day it's used.
db.exec(`CREATE TABLE IF NOT EXISTS vouchers (
  id INTEGER PRIMARY KEY,
  event_id INTEGER REFERENCES events(id) ON DELETE SET NULL,      -- where it was won (optional)
  person_id INTEGER NOT NULL REFERENCES people(id),               -- who won it
  sport_id INTEGER REFERENCES event_types(id) ON DELETE SET NULL, -- whose fund pays when it's used
  value INTEGER NOT NULL DEFAULT 0,                               -- bani, what it's worth
  code TEXT,
  note TEXT,
  issued_date TEXT NOT NULL,
  expires TEXT,
  used_date TEXT,
  transaction_id INTEGER REFERENCES transactions(id) ON DELETE SET NULL,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
)`);

/* -------------------------------------------------------- member prices */

// Members — founders, premium people and anyone who has organised an event — pay only the venue's
// part of an event's price; everyone else pays the full price (e.g. Hyrox: 50 RON, 40 to the venue).
// A member attending is stored as an event_discounts row with member = 1, worth price − venue cost.
if (!columns('people').includes('is_premium'))
  db.exec('ALTER TABLE people ADD COLUMN is_premium INTEGER NOT NULL DEFAULT 0');
if (!columns('event_types').includes('default_fee'))
  db.exec(`ALTER TABLE event_types ADD COLUMN default_fee INTEGER NOT NULL DEFAULT 0;        -- bani per person
    ALTER TABLE event_types ADD COLUMN default_venue_fee INTEGER NOT NULL DEFAULT 0;            -- bani per person`);
if (!columns('events').includes('venue_fee'))
  db.exec('ALTER TABLE events ADD COLUMN venue_fee INTEGER NOT NULL DEFAULT 0'); // bani per person, paid on to the venue
if (!columns('event_discounts').includes('member'))
  db.exec('ALTER TABLE event_discounts ADD COLUMN member INTEGER NOT NULL DEFAULT 0');

// Optional list of who came to an event, with a tick for whether they have paid.
// It doesn't drive the money: the event's participant count still does.
db.exec(`CREATE TABLE IF NOT EXISTS event_attendees (
  id INTEGER PRIMARY KEY,
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  person_id INTEGER NOT NULL REFERENCES people(id),
  paid INTEGER NOT NULL DEFAULT 0,
  UNIQUE (event_id, person_id)
)`);

// Equipment the community keeps and reuses (balls, mats, rackets…), unlike stock that gets used up.
// One row per piece or per group of identical pieces in the same state with the same person.
db.exec(`CREATE TABLE IF NOT EXISTS equipment (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  sport_id INTEGER REFERENCES event_types(id) ON DELETE SET NULL,
  qty INTEGER NOT NULL DEFAULT 1 CHECK (qty > 0),
  unit_cost INTEGER NOT NULL DEFAULT 0,            -- bani per piece
  bought_on TEXT,
  state TEXT NOT NULL DEFAULT 'good' CHECK (state IN ('new','good','worn','broken','lost')),
  person_id INTEGER REFERENCES people(id) ON DELETE SET NULL,   -- who has it; NULL = in storage
  notes TEXT
)`);

// Activities whose points grow with the event: the organiser gets `people_points` more for every
// `people_step` participants, and `money_points` more for every `money_step` RON of fees
// (participants × price), capped at organizer_max when set. E.g. a social event.
if (!columns('activities').includes('people_step')) {
  db.exec(`ALTER TABLE activities ADD COLUMN people_step REAL;
    ALTER TABLE activities ADD COLUMN people_points REAL;
    ALTER TABLE activities ADD COLUMN money_step REAL;     -- RON
    ALTER TABLE activities ADD COLUMN money_points REAL;`);
  if (!db.prepare("SELECT 1 FROM activities WHERE name = 'Social event'").get())
    db.prepare(`INSERT INTO activities (name, organizer_points, co_points, people_step, people_points, money_step, money_points, sort)
      VALUES ('Social event', 1, 1, 10, 1, 500, 1, (SELECT COALESCE(MAX(sort), 0) + 1 FROM activities))`).run();
}

// Stock used at an event is charged to it either way. `kept`: 1 = we still own it afterwards (the
// quantity stays), 2 = partly used (just a note; the quantity stays too — correct it on the Stock
// page if needed), 0 = used up (the holder's quantity went down).
if (!columns('event_stock').includes('kept'))
  db.exec('ALTER TABLE event_stock ADD COLUMN kept INTEGER NOT NULL DEFAULT 0');

// Event types that aren't a sport (e.g. Social) have no reinvestment fund: the community's whole
// share of their profit goes to the general fund.
if (!columns('event_types').includes('is_sport')) {
  db.exec('ALTER TABLE event_types ADD COLUMN is_sport INTEGER NOT NULL DEFAULT 1');
  db.prepare("INSERT OR IGNORE INTO event_types (name) VALUES ('Social')").run();
  db.prepare("UPDATE event_types SET is_sport = 0 WHERE name = 'Social' COLLATE NOCASE").run();
  db.prepare(`UPDATE activities SET sport_id = (SELECT id FROM event_types WHERE name = 'Social' COLLATE NOCASE)
    WHERE name = 'Social event' AND sport_id IS NULL`).run();
}

// Some kinds of event earn more points for the same time and profit: e.g. Social × 1.5.
if (!columns('event_types').includes('points_factor')) {
  db.exec('ALTER TABLE event_types ADD COLUMN points_factor REAL NOT NULL DEFAULT 1');
  db.prepare("UPDATE event_types SET points_factor = 1.5 WHERE name = 'Social' COLLATE NOCASE").run();
}

// The venue is paid either per participant (venue_fee × people) or as one fixed amount for the
// whole event (venue_total). With a fixed venue, venue_fee is only what members pay.
if (!columns('events').includes('venue_mode'))
  db.exec(`ALTER TABLE events ADD COLUMN venue_mode TEXT NOT NULL DEFAULT 'per_person' CHECK (venue_mode IN ('per_person', 'fixed'));
    ALTER TABLE events ADD COLUMN venue_total INTEGER NOT NULL DEFAULT 0;   -- bani, used when venue_mode = 'fixed'`);

// Free entry comes in two kinds (event_discounts.free):
//  'skip' — the person doesn't pay and costs us nothing: counted as if they hadn't signed up
//           (no fee income, no venue part for them);
//  'paid' — we pay their fee from our budget: the fee still counts as income and the same
//           amount is a cost (benefits offered).
if (!columns('event_discounts').includes('free')) {
  db.exec("ALTER TABLE event_discounts ADD COLUMN free TEXT CHECK (free IN ('skip', 'paid'))");
  // Free entries given before the two kinds existed become 'paid', which keeps their profit the same.
  db.exec("UPDATE event_discounts SET free = 'paid' WHERE member = 0 AND discount_id IS NULL AND kind = 'percent' AND value = 100");
}

export const memberReduction = (fee, venueFee) => Math.max(fee - venueFee, 0);

export const IS_MEMBER_SQL = `(p.is_founder = 1 OR p.is_premium = 1
  OR EXISTS (SELECT 1 FROM event_tasks et WHERE et.person_id = p.id))`;

// Hyrox costs 50 RON a person, 40 of which goes to the venue. The spreadsheet recorded past sessions
// as people × 10 (only our share); they become people × 50 with 40 a person to the venue, so their
// profit stays the same. Discounts already given keep the amount they were worth.
export function applyHyroxPricing() {
  const hyrox = db.prepare("SELECT * FROM event_types WHERE name = 'Hyrox' COLLATE NOCASE").get();
  if (!hyrox) return;
  tx(() => {
    if (!hyrox.default_fee) db.prepare('UPDATE event_types SET default_fee = 5000, default_venue_fee = 4000 WHERE id = ?').run(hyrox.id);
    const ids = db.prepare('SELECT id FROM events WHERE type_id = ? AND participation_fee = 1000 AND venue_fee = 0').all(hyrox.id);
    for (const { id } of ids) {
      db.prepare("UPDATE event_discounts SET kind = 'fixed', value = amount WHERE event_id = ? AND kind = 'percent'").run(id);
      // 10 RON off for a member is exactly the member price now.
      db.prepare(`UPDATE event_discounts SET member = 1, discount_id = NULL WHERE event_id = ? AND amount = 1000
        AND person_id IN (SELECT p.id FROM people p WHERE ${IS_MEMBER_SQL})`).run(id);
      db.prepare('UPDATE events SET participation_fee = 5000, venue_fee = 4000 WHERE id = ?').run(id);
    }
  });
}
if (!db.prepare("SELECT 1 FROM settings WHERE key = 'migrated:hyrox-pricing'").get()) {
  applyHyroxPricing();
  db.prepare("INSERT INTO settings (key, value) VALUES ('migrated:hyrox-pricing', ?)").run(new Date().toISOString());
}

// An event's points come from the time spent on it and the money it made (see getPointsRates):
// (The hours columns are no longer used: the time an event takes is now in its activity's points, see
// eventPoints.) plus points per so many RON of profit.
// points_manual = 1 keeps the points typed by hand in events.points instead.
if (!columns('events').includes('hours_before')) {
  db.exec(`ALTER TABLE events ADD COLUMN hours_before REAL NOT NULL DEFAULT 0;
    ALTER TABLE events ADD COLUMN hours_during REAL NOT NULL DEFAULT 0;
    ALTER TABLE events ADD COLUMN hours_after REAL NOT NULL DEFAULT 0;
    ALTER TABLE events ADD COLUMN points_manual INTEGER NOT NULL DEFAULT 0;`);
  // Events that already have points (from their organisers) keep them, so past payouts don't change.
  db.exec('UPDATE events SET points_manual = 1 WHERE points > 0');
}

// Stock purchases earn the buyer points per so many RON spent, at a rate for each kind of purchase.
export const DEFAULT_POINTS_RATES = { moneyStep: 100, moneyPoints: 1,
  itemsStep: 200, itemsPoints: 1, merchStep: 100, merchPoints: 1 };
export function getPointsRates() {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'points_rates'").get();
  return { ...DEFAULT_POINTS_RATES, ...(row ? JSON.parse(row.value) : {}) };
}
export function setPointsRates(rates) {
  db.prepare("INSERT INTO settings (key, value) VALUES ('points_rates', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
    .run(JSON.stringify(rates));
}

// Tasks an event didn't need (e.g. nothing to buy), comma-separated: their share goes to the other tasks.
if (!columns('events').includes('skipped_tasks')) db.exec("ALTER TABLE events ADD COLUMN skipped_tasks TEXT NOT NULL DEFAULT ''");

/** Each task's share (%) for one event: the needed tasks share 100% in proportion to their usual shares. */
export function eventTaskShares(skipped = '', shares = getTaskShares()) {
  const off = new Set(String(skipped || '').split(',').filter(Boolean));
  const kept = TASKS.filter((t) => !off.has(t));
  const total = kept.reduce((a, t) => a + (Number(shares[t]) || 0), 0);
  return Object.fromEntries(TASKS.map((t) => [t, off.has(t) || !total ? 0 : ((Number(shares[t]) || 0) * 100) / total]));
}

// Price set as two parts (venue part + community part). With a fixed venue the venue part is the total ÷
// people, which rarely divides exactly (465 / 21 = 22.142857…): fees then count the venue total itself plus
// the community part × people, so the venue is exactly covered and the community gets exactly its part.
if (!columns('events').includes('price_parts')) {
  db.exec(`ALTER TABLE events ADD COLUMN price_parts INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE events ADD COLUMN community_fee INTEGER NOT NULL DEFAULT 0;   -- bani per person`);
}

// Share of an event's points for each task, in %; they add up to 100.
export const DEFAULT_TASK_SHARES = { announce: 15, signups: 15, fees: 15, hosting: 40, buying: 15 };
export function getTaskShares() {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'task_shares'").get();
  return { ...DEFAULT_TASK_SHARES, ...(row ? JSON.parse(row.value) : {}) };
}
export function setTaskShares(shares) {
  db.prepare("INSERT INTO settings (key, value) VALUES ('task_shares', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
    .run(JSON.stringify(shares));
}

// Payouts actually sent for a month. "Mark as paid" stores what each person was due then; if the
// month's figures change later, paying again stores only the difference as extra rows.
db.exec(`CREATE TABLE IF NOT EXISTS payouts (
  id INTEGER PRIMARY KEY,
  month TEXT NOT NULL,                    -- YYYY-MM the payout is for
  person_id INTEGER REFERENCES people(id) ON DELETE SET NULL,
  person_name TEXT NOT NULL,
  amount INTEGER NOT NULL,                -- bani; negative when a loss is taken back
  paid_at TEXT NOT NULL DEFAULT (date('now')),
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
)`);
db.exec('CREATE INDEX IF NOT EXISTS payouts_month ON payouts (month)');

/* ----------------------------------------------------- starting balance */

// What the community had when it started (before the first event in the app): an amount for the
// general fund and optionally for sport funds. It counts in the fund balances and money in hand,
// never in a month's profit or payouts. Amounts in RON: { date, general, sports: { [sportId]: amount } }.
export function getStartingBalance() {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'starting_balance'").get();
  return { date: null, general: 0, sports: {}, ...(row ? JSON.parse(row.value) : {}) };
}
export function setStartingBalance(v) {
  db.prepare("INSERT INTO settings (key, value) VALUES ('starting_balance', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
    .run(JSON.stringify(v));
}

/* --------------------------------------------------------- profit split */

// Percentages of profit: founders get `foundersStandard`% split equally, organisers get
// `foundersPoints`% shared by points, and the rest is reinvested in the community — of which
// `generalShare`% goes to the general fund and the remainder to the event's sport fund.
// (Field names kept from the first version; in the UI they are "Founders" and "Organisers".)
export const DEFAULT_SPLIT = { foundersStandard: 20, foundersPoints: 30, generalShare: 100 / 3 };

export function getSplit() {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'split'").get();
  return { ...DEFAULT_SPLIT, ...(row ? JSON.parse(row.value) : {}) };
}

export function setSplit(split) {
  db.prepare("INSERT INTO settings (key, value) VALUES ('split', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
    .run(JSON.stringify(split));
}

/** Returns a function month (YYYY-MM) -> split, using month targets where set. */
export function splitResolver() {
  const base = getSplit();
  const overrides = new Map(db.prepare('SELECT month, value FROM month_splits').all()
    .map((r) => [r.month, { ...base, ...JSON.parse(r.value), custom: true }]));
  return (ym) => overrides.get(ym) || base;
}

export function setMonthSplit(ym, split) {
  if (!split) return db.prepare('DELETE FROM month_splits WHERE month = ?').run(ym);
  db.prepare('INSERT INTO month_splits (month, value) VALUES (?, ?) ON CONFLICT(month) DO UPDATE SET value = excluded.value')
    .run(ym, JSON.stringify(split));
}

// Money is stored as integer bani; the API speaks RON with 2 decimals.
export const toBani = (v) => Math.round(Number(v || 0) * 100);
export const toRon = (v) => Math.round(Number(v || 0)) / 100;

export function tx(fn) {
  db.exec('BEGIN');
  try {
    const r = fn();
    db.exec('COMMIT');
    return r;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}
