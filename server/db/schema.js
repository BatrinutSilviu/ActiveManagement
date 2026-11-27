// The database schema, and the migrations that bring a database made by an earlier version up to date.
// They run in order, every time the app starts (each one checks whether it's still needed), and all of them
// as ONE transaction: a crash or an error part-way through leaves the database exactly as it was (rather than
// e.g. one of two new columns added, which the "column missing?" checks would then never finish).
// New migrations go at the end of migrate().
import { db, columns, tx } from './connection.js';
import { IS_MEMBER_SQL } from '../domain/pricing.js';
import { purchaseFund } from '../domain/stock.js';
import { log } from '../log.js';
import { ACTIVE, getBusiness, setBusiness } from '../domain/business.js';

// Event "types" are the sports. Older databases had generic Sport/Tournament tags.
export const SPORTS = ['Football', 'Volleyball', 'Basketball', 'Handball', 'Padel', 'Running', 'Hiking', 'Biking',
  'Tennis', 'Foot tennis', 'Hyrox'];

// Hyrox costs 50 RON a person, 40 of which goes to the venue. The spreadsheet recorded past sessions
// as people × 10 (only our share); they become people × 50 with 40 a person to the venue, so their
// profit stays the same. Discounts already given keep the amount they were worth.
// (Also run by scripts/import-sheet.js after importing.)
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

/* ------------------------------------------------- starting data by business type */

// [name, kind, cost group] — what a new business starts with; they can be renamed or removed in Settings.
const COMMUNITY_CATEGORIES = [
  ...['Participation fees', 'Registration fees', 'Sponsorship', 'Donations', 'Merchandise', 'Other income'].map((n) => [n, 'income', 'organizing']),
  ...['Venue rental', 'Trainers', 'Referees', 'Transport', 'Marketing', 'Insurance', 'Medical', 'Other expenses'].map((n) => [n, 'expense', 'organizing']),
  ...['Food & drinks', 'Prizes & trophies', 'Equipment'].map((n) => [n, 'expense', 'benefit']),
];
const PRACTICE_CATEGORIES = [
  ...['Session fees', 'Other income'].map((n) => [n, 'income', 'organizing']),
  ...['Travel & fuel', 'Car', 'Equipment', 'Consumables', 'Courses & training', 'Phone & software', 'Insurance',
    'Taxes & fees', 'Accounting', 'Other expenses'].map((n) => [n, 'expense', 'organizing']),
];

function addCategories(list) {
  const c = db.prepare('INSERT INTO categories (name, kind, cost_group) VALUES (?, ?, ?)');
  for (const [name, kind, group] of list) c.run(name, kind, group);
}

function addActivities() {
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

// Points for helping outside events, given by hand as contributions (Payouts → Add points): picking the activity fills
// in its points (or the lower end of its range), which stay editable (e.g. hours × the per-hour points). Merch is
// rewarded for the work, not what it cost (buying it earns no points, see merchPoints): setting up a product or
// partnership is the hard part, then each batch ordered, then picking it up and handing it out.
const HELP_ACTIVITIES = [
  ['Ideas & research (per hour)', 1.5], // research, finding new features and ideas
  ['Testing & bugs (per hour)', 1],     // testing the apps and finding bugs
  ['New merch product or partnership', 3, 8], // research, supplier, samples, design
  ['Merch: taking orders & ordering (per batch)', 2],
  ['Merch pick-up', 0.5],
  ['Merch distribution (per session)', 0.5],
];
function addHelpActivities() {
  const ins = db.prepare(`INSERT INTO activities (name, organizer_points, organizer_max, co_points, sort)
    SELECT ?, ?, ?, 0, (SELECT COALESCE(MAX(sort), 0) + 1 FROM activities) WHERE NOT EXISTS (SELECT 1 FROM activities WHERE name = ?)`);
  for (const [name, pts, max = null] of HELP_ACTIVITIES) ins.run(name, pts, max, name);
  // Added once: one an admin deletes stays deleted.
  db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('migrated:help-activities', ?)").run(new Date().toISOString());
}

/** The starting data for a new business of this type, added at first-run setup (on an empty database). */
export function seedBusiness(type) {
  tx(() => {
    const type_ = db.prepare('INSERT OR IGNORE INTO event_types (name, is_sport) VALUES (?, ?)');
    if (type === 'community') {
      for (const s of SPORTS) type_.run(s, 1);
      type_.run('Social', 0);
      addCategories(COMMUNITY_CATEGORIES);
      addActivities();
      db.prepare(`INSERT INTO activities (name, organizer_points, co_points, people_step, people_points, money_step, money_points, sort,
        sport_id) VALUES ('Social event', 1, 1, 10, 1, 500, 1, (SELECT COALESCE(MAX(sort), 0) + 1 FROM activities),
        (SELECT id FROM event_types WHERE name = 'Social'))`).run();
      addHelpActivities();
    } else {
      // A practice adds its own services in Settings (where a session happens is its venue, not a service).
      addCategories(PRACTICE_CATEGORIES);
    }
  });
}

/** Brings the database up to date, in one transaction (nested tx() calls below become savepoints). */
export function migrate() {
  tx(runMigrations);
}

// The steps stay at the left margin: the SQL in them is stored in sqlite_master exactly as written, so
// re-indenting it would change the schema text of new databases.
function runMigrations() {
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

// Which business this database is for (domain/business.js). One with accounts but no such setting was made
// before it existed, so it's Active's. A new database gets it at first-run setup, which also adds the starting
// data for its type (seedBusiness): the community steps below that add starting data only run for a community.
if (!getBusiness() && db.prepare('SELECT 1 FROM users LIMIT 1').get()) setBusiness(ACTIVE);
const community = getBusiness()?.type === 'community';

// Migrations for databases created by earlier versions.
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

if (community && !db.prepare("SELECT 1 FROM event_types WHERE name = 'Football'").get()) {
  const ins = db.prepare('INSERT OR IGNORE INTO event_types (name) VALUES (?)');
  for (const s of SPORTS) ins.run(s);
  db.exec(`UPDATE events SET type_id = (SELECT id FROM event_types et WHERE et.name = events.sport COLLATE NOCASE)
    WHERE sport IS NOT NULL AND EXISTS (SELECT 1 FROM event_types et WHERE et.name = events.sport COLLATE NOCASE)`);
  db.exec(`DELETE FROM event_types WHERE name IN ('Sport', 'Tournament')
    AND NOT EXISTS (SELECT 1 FROM events e WHERE e.type_id = event_types.id)`);
}

if (community && !db.prepare('SELECT 1 FROM categories LIMIT 1').get()) addCategories(COMMUNITY_CATEGORIES);
if (community && !db.prepare("SELECT 1 FROM categories WHERE name = 'Trainers'").get())
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

if (community && !db.prepare('SELECT 1 FROM activities LIMIT 1').get()) addActivities();

// Event tasks (see domain/tasks.js).
db.exec(`CREATE TABLE IF NOT EXISTS event_tasks (
  id INTEGER PRIMARY KEY,
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  task TEXT NOT NULL CHECK (task IN ('announce', 'signups', 'fees', 'logistics', 'hosting', 'buying')),
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
      for (const t of ['announce', 'signups', 'fees', 'hosting', 'buying']) ins.run(ev.event_id, t, lead.person_id);
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

// Stock someone bought: usual items / prizes for events, or merchandise from a secured partnership.
// The amount paid earns the buyer points, and is spent from the fund of the product's category (see purchaseFund).
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
// How long a session of this service lasts, in minutes (a practice's services); fills in a session's end time.
if (!columns('event_types').includes('duration')) db.exec('ALTER TABLE event_types ADD COLUMN duration INTEGER');
// Its colour on the practice's timetable (#rrggbb).
if (!columns('event_types').includes('color')) db.exec('ALTER TABLE event_types ADD COLUMN color TEXT');
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
  if (community && !db.prepare("SELECT 1 FROM activities WHERE name = 'Social event'").get())
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
  if (community) db.prepare("INSERT OR IGNORE INTO event_types (name) VALUES ('Social')").run();
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
//  'paid' — we pay their venue part from the general fund (it counts as income and the fund pays it);
//           their community part is let off, like a member price (see covered_waived in finance.js).
if (!columns('event_discounts').includes('free')) {
  db.exec("ALTER TABLE event_discounts ADD COLUMN free TEXT CHECK (free IN ('skip', 'paid'))");
  // Free entries given before the two kinds existed become 'paid', which keeps their profit the same.
  db.exec("UPDATE event_discounts SET free = 'paid' WHERE member = 0 AND discount_id IS NULL AND kind = 'percent' AND value = 100");
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

// Parts of a sport's fund, e.g. "Active Padel Academy" inside Padel: its spending still comes out of the
// sport's fund, but is counted apart so you can see what that part costs.
db.exec(`CREATE TABLE IF NOT EXISTS fund_parts (
  id INTEGER PRIMARY KEY,
  sport_id INTEGER NOT NULL REFERENCES event_types(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  UNIQUE (sport_id, name)
)`);
if (!columns('transactions').includes('fund_part_id'))
  db.exec('ALTER TABLE transactions ADD COLUMN fund_part_id INTEGER REFERENCES fund_parts(id) ON DELETE SET NULL');
if (!db.prepare("SELECT 1 FROM settings WHERE key = 'migrated:padel-academy'").get()) {
  const padel = db.prepare("SELECT id FROM event_types WHERE name = 'Padel' COLLATE NOCASE").get();
  if (padel) db.prepare('INSERT OR IGNORE INTO fund_parts (sport_id, name) VALUES (?, ?)').run(padel.id, 'Active Padel Academy');
  db.prepare("INSERT INTO settings (key, value) VALUES ('migrated:padel-academy', ?)").run(new Date().toISOString());
}

// Stock already paid for (e.g. bought earlier from a fund): using it at an event costs the event nothing.
if (!columns('stock_items').includes('prepaid')) db.exec('ALTER TABLE stock_items ADD COLUMN prepaid INTEGER NOT NULL DEFAULT 0');

// paid_before = 1: bought and paid earlier, already counted in the budget (e.g. in the old sheet). It's
// recorded for the stock and the buyer's points, but not spent from the fund again.
if (!columns('stock_purchases').includes('paid_before')) db.exec('ALTER TABLE stock_purchases ADD COLUMN paid_before INTEGER NOT NULL DEFAULT 0');
if (!columns('stock_purchases').includes('transaction_id')) {
  db.exec('ALTER TABLE stock_purchases ADD COLUMN transaction_id INTEGER REFERENCES transactions(id) ON DELETE SET NULL');
  tx(() => { for (const { id } of db.prepare('SELECT id FROM stock_purchases').all()) purchaseFund(id); }); // purchases made before
}

// Tasks an event didn't need (e.g. nothing to buy), comma-separated: their share goes to the other tasks.
if (!columns('events').includes('skipped_tasks')) db.exec("ALTER TABLE events ADD COLUMN skipped_tasks TEXT NOT NULL DEFAULT ''");
// Tasks whose points were typed by hand for this event, as JSON { task: points }; the others follow the event's points.
if (!columns('events').includes('task_points')) db.exec("ALTER TABLE events ADD COLUMN task_points TEXT NOT NULL DEFAULT '{}'");

// "Organising logistics" (venue, providers, partners — not the participants) came after the first five tasks.
// Existing events get it as "not needed", so their points don't change; new events have it like any task.
// Its 10% comes proportionally from the other shares.
if (!db.prepare("SELECT sql FROM sqlite_master WHERE name = 'event_tasks'").get().sql.includes('logistics')) {
  tx(() => {
    db.exec(`CREATE TABLE event_tasks_new (
      id INTEGER PRIMARY KEY,
      event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      task TEXT NOT NULL CHECK (task IN ('announce', 'signups', 'fees', 'logistics', 'hosting', 'buying')),
      person_id INTEGER NOT NULL REFERENCES people(id) ON DELETE CASCADE,
      free INTEGER NOT NULL DEFAULT 0
    );
    INSERT INTO event_tasks_new SELECT id, event_id, task, person_id, free FROM event_tasks;
    DROP TABLE event_tasks;
    ALTER TABLE event_tasks_new RENAME TO event_tasks;
    CREATE INDEX IF NOT EXISTS event_tasks_event ON event_tasks (event_id);`);
    db.exec("UPDATE events SET skipped_tasks = CASE WHEN skipped_tasks = '' THEN 'logistics' ELSE skipped_tasks || ',logistics' END");
    const saved = db.prepare("SELECT value FROM settings WHERE key = 'task_shares'").get();
    if (saved) {
      const s = JSON.parse(saved.value);
      if (s.logistics === undefined) {
        // Every other share × 0.9: with logistics "not needed" they scale back to exactly what they were.
        for (const k of Object.keys(s)) s[k] = Math.round((Number(s[k]) || 0) * 0.9 * 100) / 100;
        s.logistics = 10;
        db.prepare("UPDATE settings SET value = ? WHERE key = 'task_shares'").run(JSON.stringify(s));
      }
    }
  });
}

// Price set as two parts (venue part + community part). With a fixed venue the venue part is the total ÷
// people, which rarely divides exactly (465 / 21 = 22.142857…): fees then count the venue total itself plus
// the community part × people, so the venue is exactly covered and the community gets exactly its part.
if (!columns('events').includes('price_parts')) {
  db.exec(`ALTER TABLE events ADD COLUMN price_parts INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE events ADD COLUMN community_fee INTEGER NOT NULL DEFAULT 0;   -- bani per person`);
}

// Training sessions the community runs (events.training = 1). A voucher can be a percentage off one
// (vouchers.percent) instead of a fixed value: it's worth nothing until it's used at a training, then
// it's worth that % of what the person pays there. That amount is spent from the voucher's sport fund
// (its transaction), so the person pays less but the training's own fees and profit stay whole.
if (!columns('events').includes('training'))
  db.exec('ALTER TABLE events ADD COLUMN training INTEGER NOT NULL DEFAULT 0');
if (!columns('vouchers').includes('percent'))
  db.exec(`ALTER TABLE vouchers ADD COLUMN percent REAL;                                     -- NULL = fixed value
    ALTER TABLE vouchers ADD COLUMN used_event_id INTEGER REFERENCES events(id) ON DELETE SET NULL; -- the training it was used at`);

// Events pushed from the community's other apps (padel / hikes, see server/sync.js): which app and record
// they came from, a link back, and the fields as last pushed (JSON) so later pushes only change what changed there.
if (!columns('events').includes('source')) {
  db.exec(`ALTER TABLE events ADD COLUMN source TEXT;
    ALTER TABLE events ADD COLUMN external_id TEXT;
    ALTER TABLE events ADD COLUMN external_url TEXT;
    ALTER TABLE events ADD COLUMN sync_data TEXT;
    ALTER TABLE events ADD COLUMN synced_at TEXT;
    CREATE UNIQUE INDEX IF NOT EXISTS events_external ON events (source, external_id) WHERE external_id IS NOT NULL;`);
}

// What made an event special — its impact points (see HIGHLIGHT_KINDS in domain/tasks.js).
db.exec(`CREATE TABLE IF NOT EXISTS event_highlights (
  id INTEGER PRIMARY KEY,
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('collab', 'guest', 'special')),
  title TEXT NOT NULL,
  partner_id INTEGER REFERENCES partners(id) ON DELETE SET NULL,
  points REAL NOT NULL DEFAULT 0
)`);

// Partners (clubs, shops, sponsors…) and the prizes they give at our events. Only a record of what
// partners contributed: their prizes never count in any profit, fund or payout.
db.exec(`CREATE TABLE IF NOT EXISTS partners (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE,
  sport_id INTEGER REFERENCES event_types(id) ON DELETE SET NULL,  -- NULL = any sport
  contact TEXT,
  notes TEXT,
  active INTEGER NOT NULL DEFAULT 1
)`);
db.exec(`CREATE TABLE IF NOT EXISTS partner_prizes (
  id INTEGER PRIMARY KEY,
  partner_id INTEGER NOT NULL REFERENCES partners(id),
  event_id INTEGER REFERENCES events(id) ON DELETE SET NULL,      -- where it was given (optional)
  person_id INTEGER REFERENCES people(id) ON DELETE SET NULL,     -- who won it (optional)
  winner_name TEXT,                                               -- or a winner who isn't in People
  prize TEXT NOT NULL,
  qty INTEGER NOT NULL DEFAULT 1 CHECK (qty > 0),
  value INTEGER,                                                  -- bani, estimated value of all of it; informative only
  date TEXT NOT NULL,
  note TEXT,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
)`);

// When an event starts and ends ("HH:MM", local time; optional) and the prizes its source app advertises
// (JSON [{ place, prize, partner }], partner null = offered by us). Partner prizes pushed by an app are also
// partner_prizes rows, marked with sync_key "<source>:<external id>:<place>" so later pushes update them.
if (!columns('events').includes('start_time')) {
  db.exec(`ALTER TABLE events ADD COLUMN start_time TEXT;
    ALTER TABLE events ADD COLUMN end_time TEXT;
    ALTER TABLE events ADD COLUMN prizes TEXT;`);
}
if (!columns('partner_prizes').includes('sync_key')) {
  db.exec(`ALTER TABLE partner_prizes ADD COLUMN sync_key TEXT;
    CREATE UNIQUE INDEX IF NOT EXISTS partner_prizes_sync ON partner_prizes (sync_key) WHERE sync_key IS NOT NULL;`);
}

// An event's points are an estimate until its month is closed: then each event's profit points are
// scaled to what it really contributed to the month's profit (see finance.js, computeRealPoints) and
// stored here, frozen, per event: { [eventId]: { time, money, total, manual } }.
db.exec(`CREATE TABLE IF NOT EXISTS month_points (
  month TEXT PRIMARY KEY,                 -- YYYY-MM
  data TEXT NOT NULL,
  profit INTEGER NOT NULL,                -- bani, the month's profit when calculated
  scale REAL NOT NULL,                    -- what each event's profit points were multiplied by
  calculated_at TEXT NOT NULL DEFAULT (datetime('now')),
  calculated_by INTEGER REFERENCES users(id) ON DELETE SET NULL   -- NULL = automatically on the 1st
)`);

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
// to_fund = 1: not sent to the person — what they were still owed went to the general community fund instead.
if (!columns('payouts').includes('to_fund')) db.exec('ALTER TABLE payouts ADD COLUMN to_fund INTEGER NOT NULL DEFAULT 0');
// The form that recorded the rows (a random id it sends): submitting it twice (double click, a retry) must
// not record the payment twice — see applyPayouts.
if (!columns('payouts').includes('request_id')) {
  db.exec(`ALTER TABLE payouts ADD COLUMN request_id TEXT;
    CREATE INDEX IF NOT EXISTS payouts_request ON payouts (request_id) WHERE request_id IS NOT NULL;`);
}

// Awards: money or a benefit (a racket, a free entry…) given to someone against their month, worth `amount`.
// It comes off what they're owed for that month and off their points (at the month's money per point).
// award = what it was (null on an ordinary payout). Cash awards (to_fund = 0) leave the account like a payout;
// a benefit's value (to_fund = 1) goes to the general fund, which pays for the benefit.
if (!columns('payouts').includes('award')) db.exec('ALTER TABLE payouts ADD COLUMN award TEXT');

// Edit forms send a whole event / transaction back. `version` goes up on every change to what those forms
// edit (by anyone: another admin, a push from the padel or hikes app, a script), so a form opened before that
// change is refused (409) instead of silently writing the old values back over it. Triggers, so no writer can forget.
// Sessions are stored as token hashes now (auth.js): the old plaintext ones are dropped once
// (everyone signs in again), and the column marks that this was done.
if (!columns('sessions').includes('hashed')) {
  db.exec('DELETE FROM sessions; ALTER TABLE sessions ADD COLUMN hashed INTEGER NOT NULL DEFAULT 1');
}
if (!columns('events').includes('version')) db.exec('ALTER TABLE events ADD COLUMN version INTEGER NOT NULL DEFAULT 0');
if (!columns('transactions').includes('version')) db.exec('ALTER TABLE transactions ADD COLUMN version INTEGER NOT NULL DEFAULT 0');
db.exec(`
CREATE TRIGGER IF NOT EXISTS events_version AFTER UPDATE OF name, type_id, activity_id, date, end_date, start_time, end_time, location,
  status, participants, participation_fee, venue_fee, budget, notes, venue_mode, venue_total, price_parts, community_fee, training ON events
BEGIN UPDATE events SET version = version + 1 WHERE id = NEW.id; END;
CREATE TRIGGER IF NOT EXISTS transactions_version AFTER UPDATE OF event_id, kind, category_id, amount, date, description,
  payment_method, fund_sport_id, fund_part_id ON transactions
BEGIN UPDATE transactions SET version = version + 1 WHERE id = NEW.id; END;
`);

// Failed sign-ins (routes/auth.js): kept in the database so a restart doesn't reset the brute-force limit.
db.exec(`CREATE TABLE IF NOT EXISTS login_failures (
  key TEXT NOT NULL,
  at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS login_failures_key ON login_failures (key, at);`);

// People is only the team: founders and the organisers we add. Voucher winners, attendees and people given a
// discount are kept by name (and linked to a person only when they are one of us), so naming them no longer
// adds anyone to People. Once: the three tables get a name and an optional person, and everyone in People
// who is neither a founder, premium nor has done any work for the community (organised, bought or holds
// stock, has equipment, points or payouts…) is dropped — their vouchers, attendances and discounts keep the name.
if (!columns('vouchers').includes('name')) {
  db.exec(`CREATE TABLE vouchers_new (
  id INTEGER PRIMARY KEY,
  event_id INTEGER REFERENCES events(id) ON DELETE SET NULL,      -- where it was won (optional)
  person_id INTEGER REFERENCES people(id) ON DELETE SET NULL,     -- the winner, when they're in People
  name TEXT NOT NULL,                                             -- who won it
  sport_id INTEGER REFERENCES event_types(id) ON DELETE SET NULL, -- whose fund pays when it's used
  value INTEGER NOT NULL DEFAULT 0,                               -- bani, what it's worth
  code TEXT,
  note TEXT,
  issued_date TEXT NOT NULL,
  expires TEXT,
  used_date TEXT,
  transaction_id INTEGER REFERENCES transactions(id) ON DELETE SET NULL,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  percent REAL,                                                   -- NULL = fixed value
  used_event_id INTEGER REFERENCES events(id) ON DELETE SET NULL  -- the training it was used at
);
INSERT INTO vouchers_new (id, event_id, person_id, name, sport_id, value, code, note, issued_date, expires, used_date, transaction_id,
  created_by, created_at, percent, used_event_id)
  SELECT v.id, v.event_id, v.person_id, p.name, v.sport_id, v.value, v.code, v.note, v.issued_date, v.expires, v.used_date, v.transaction_id,
  v.created_by, v.created_at, v.percent, v.used_event_id FROM vouchers v JOIN people p ON p.id = v.person_id;
DROP TABLE vouchers;
ALTER TABLE vouchers_new RENAME TO vouchers;

CREATE TABLE event_attendees_new (
  id INTEGER PRIMARY KEY,
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  person_id INTEGER REFERENCES people(id) ON DELETE SET NULL,     -- when they're in People
  name TEXT NOT NULL COLLATE NOCASE,
  paid INTEGER NOT NULL DEFAULT 0,
  UNIQUE (event_id, name)
);
INSERT INTO event_attendees_new (id, event_id, person_id, name, paid)
  SELECT a.id, a.event_id, a.person_id, p.name, a.paid FROM event_attendees a JOIN people p ON p.id = a.person_id;
DROP TABLE event_attendees;
ALTER TABLE event_attendees_new RENAME TO event_attendees;

CREATE TABLE event_discounts_new (
  id INTEGER PRIMARY KEY,
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  person_id INTEGER REFERENCES people(id) ON DELETE SET NULL,     -- when they're in People
  name TEXT NOT NULL COLLATE NOCASE,
  discount_id INTEGER REFERENCES discounts(id) ON DELETE SET NULL, -- NULL = one-off amount
  kind TEXT NOT NULL CHECK (kind IN ('percent', 'fixed')),
  value REAL NOT NULL,
  amount INTEGER NOT NULL,                 -- in bani
  note TEXT,
  member INTEGER NOT NULL DEFAULT 0,
  free TEXT CHECK (free IN ('skip', 'paid')),
  UNIQUE (event_id, name)
);
INSERT INTO event_discounts_new (id, event_id, person_id, name, discount_id, kind, value, amount, note, member, free)
  SELECT d.id, d.event_id, d.person_id, p.name, d.discount_id, d.kind, d.value, d.amount, d.note, d.member, d.free
  FROM event_discounts d JOIN people p ON p.id = d.person_id;
DROP TABLE event_discounts;
ALTER TABLE event_discounts_new RENAME TO event_discounts;`);

  const keep = `p.is_founder = 1 OR p.is_premium = 1
    OR EXISTS (SELECT 1 FROM event_tasks x WHERE x.person_id = p.id) OR EXISTS (SELECT 1 FROM event_people x WHERE x.person_id = p.id)
    OR EXISTS (SELECT 1 FROM contributions x WHERE x.person_id = p.id) OR EXISTS (SELECT 1 FROM stock_holdings x WHERE x.person_id = p.id)
    OR EXISTS (SELECT 1 FROM stock_purchases x WHERE p.id IN (x.person_id, x.holder_id)) OR EXISTS (SELECT 1 FROM event_stock x WHERE x.person_id = p.id)
    OR EXISTS (SELECT 1 FROM equipment x WHERE x.person_id = p.id) OR EXISTS (SELECT 1 FROM payouts x WHERE x.person_id = p.id)
    OR EXISTS (SELECT 1 FROM person_discounts x WHERE x.person_id = p.id) OR EXISTS (SELECT 1 FROM partner_prizes x WHERE x.person_id = p.id)`;
  const dropped = db.prepare(`SELECT p.id, p.name FROM people p WHERE NOT (${keep})`).all();
  // ON DELETE SET NULL unlinks their vouchers, attendances and discounts; the names stay on them.
  for (const p of dropped) db.prepare('DELETE FROM people WHERE id = ?').run(p.id);
  if (dropped.length) log('info', 'People: removed everyone who is not part of the team', { count: dropped.length, names: dropped.map((p) => p.name) });
}

/* ------------------------------------------------- practice (business type "practice", routes/practice.js) */

// A practice's patients (called clients in the code: the name shown comes from the business's terms), notes about
// them, the sessions booked with them (appointments: "sessions" is the sign-in table), packages of sessions paid
// for together, and the invoices and receipts issued. Money is counted when it's paid: ticking an invoice paid
// adds its income transaction (transaction_id), unticking removes it. All amounts in bani.
db.exec(`
CREATE TABLE IF NOT EXISTS clients (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL COLLATE NOCASE,
  phone TEXT,
  email TEXT,
  address TEXT,
  birth_date TEXT,
  about TEXT,                              -- the general note: what to keep in mind about them
  archived INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS client_notes (
  id INTEGER PRIMARY KEY,
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  text TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS client_notes_client ON client_notes (client_id, date);
CREATE TABLE IF NOT EXISTS invoices (
  id INTEGER PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('invoice', 'receipt')),
  number TEXT,                             -- as issued; optional (e.g. paid in cash without a document)
  date TEXT NOT NULL,
  client_id INTEGER REFERENCES clients(id) ON DELETE SET NULL,
  amount INTEGER NOT NULL CHECK (amount > 0),
  description TEXT,
  paid INTEGER NOT NULL DEFAULT 0,
  paid_date TEXT,
  payment_method TEXT,
  transaction_id INTEGER REFERENCES transactions(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS invoices_client ON invoices (client_id);
CREATE TABLE IF NOT EXISTS packages (
  id INTEGER PRIMARY KEY,
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sessions INTEGER NOT NULL CHECK (sessions > 0),
  price INTEGER NOT NULL DEFAULT 0 CHECK (price >= 0),
  date TEXT NOT NULL,                      -- sold on
  expires TEXT,
  note TEXT,
  invoice_id INTEGER REFERENCES invoices(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS packages_client ON packages (client_id);
CREATE TABLE IF NOT EXISTS appointments (
  id INTEGER PRIMARY KEY,
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  type_id INTEGER REFERENCES event_types(id) ON DELETE SET NULL,   -- the service
  date TEXT NOT NULL,
  start_time TEXT,
  end_time TEXT,
  address TEXT,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'done', 'cancelled')),
  price INTEGER NOT NULL DEFAULT 0 CHECK (price >= 0),           -- not billed on its own when in a package
  package_id INTEGER REFERENCES packages(id) ON DELETE SET NULL,  -- a package with sessions can only go with its patient
  invoice_id INTEGER REFERENCES invoices(id) ON DELETE SET NULL,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS appointments_date ON appointments (date, start_time);
CREATE INDEX IF NOT EXISTS appointments_client ON appointments (client_id);
`);

// The association (sponsor) a patient belongs to, if any: free text, the form suggests the ones already used.
if (!columns('clients').includes('association')) db.exec('ALTER TABLE clients ADD COLUMN association TEXT');
// Where a session happens: at the patient's home (its address, or theirs) or at the practice.
if (!columns('appointments').includes('venue'))
  db.exec("ALTER TABLE appointments ADD COLUMN venue TEXT NOT NULL DEFAULT 'home' CHECK (venue IN ('home', 'practice'))");
// Which of the practice's locations (Settings → Business), for a session at the practice.
if (!columns('appointments').includes('location')) db.exec('ALTER TABLE appointments ADD COLUMN location TEXT');
// The patient's illness category: one of the business's (Settings → Services).
if (!columns('clients').includes('condition')) db.exec('ALTER TABLE clients ADD COLUMN condition TEXT'); // superseded by client_conditions
// A patient's illness categories (several each), names from the business's list. The single one kept before moves here.
if (!db.prepare("SELECT 1 FROM sqlite_master WHERE name = 'client_conditions'").get()) {
  db.exec(`CREATE TABLE client_conditions (
      client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      PRIMARY KEY (client_id, name)
    );
    INSERT INTO client_conditions (client_id, name) SELECT id, condition FROM clients WHERE condition IS NOT NULL;
    UPDATE clients SET condition = NULL;`);
}
// The patient's contract: its number and the date it was signed.
if (!columns('clients').includes('contract_number'))
  db.exec('ALTER TABLE clients ADD COLUMN contract_number TEXT; ALTER TABLE clients ADD COLUMN contract_date TEXT;');
// Package types (Settings → Services): ready-made packages to sell, e.g. 10 sessions of one service for a price, valid
// some months. A package sold from one copies it; a package tied to a service pays only for sessions of that service.
db.exec(`CREATE TABLE IF NOT EXISTS package_types (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  sessions INTEGER NOT NULL CHECK (sessions > 0),
  price INTEGER NOT NULL DEFAULT 0 CHECK (price >= 0),          -- bani
  valid_months INTEGER,                                          -- superseded by valid_days
  service_id INTEGER REFERENCES event_types(id) ON DELETE SET NULL
)`);
// How long a package type is valid, in days (empty: no expiry). Types made with months get 30 days a month.
if (!columns('package_types').includes('valid_days')) {
  db.exec('ALTER TABLE package_types ADD COLUMN valid_days INTEGER; UPDATE package_types SET valid_days = valid_months * 30, valid_months = NULL WHERE valid_months IS NOT NULL;');
}
if (!columns('packages').includes('service_id'))
  db.exec('ALTER TABLE packages ADD COLUMN service_id INTEGER REFERENCES event_types(id) ON DELETE SET NULL'); // superseded by package_items
// What a package (and a package type) is made of: so many sessions of a service, or of any service (service_id empty,
// the "general" ones). A session takes a place of its own service first, else a general one. sessions on the package
// stays the total. Packages and types made before this get one part: their service (if they had one) or any.
if (!db.prepare("SELECT 1 FROM sqlite_master WHERE name = 'package_items'").get()) {
  db.exec(`CREATE TABLE package_items (
      package_id INTEGER NOT NULL REFERENCES packages(id) ON DELETE CASCADE,
      service_id INTEGER REFERENCES event_types(id) ON DELETE SET NULL,
      sessions INTEGER NOT NULL CHECK (sessions > 0)
    );
    CREATE INDEX package_items_package ON package_items (package_id);
    CREATE TABLE package_type_items (
      package_type_id INTEGER NOT NULL REFERENCES package_types(id) ON DELETE CASCADE,
      service_id INTEGER REFERENCES event_types(id) ON DELETE CASCADE,
      sessions INTEGER NOT NULL CHECK (sessions > 0)
    );
    INSERT INTO package_items (package_id, service_id, sessions) SELECT id, service_id, sessions FROM packages;
    INSERT INTO package_type_items (package_type_id, service_id, sessions) SELECT id, service_id, sessions FROM package_types;
    UPDATE packages SET service_id = NULL; UPDATE package_types SET service_id = NULL;`);
}
// Travel: what driving to a patient's home costs. The patient has a usual fee; a home visit has its own (filled in from
// theirs). It's billed with the session, also when a package pays for the session itself. In bani.
if (!columns('clients').includes('travel_fee')) db.exec('ALTER TABLE clients ADD COLUMN travel_fee INTEGER NOT NULL DEFAULT 0');
if (!columns('appointments').includes('travel_fee')) db.exec('ALTER TABLE appointments ADD COLUMN travel_fee INTEGER NOT NULL DEFAULT 0');
// Other therapies a patient follows elsewhere: JSON [{ therapy, therapist, place, frequency }], optional.
if (!columns('clients').includes('other_therapies')) db.exec('ALTER TABLE clients ADD COLUMN other_therapies TEXT');
// Why a session was cancelled.
if (!columns('appointments').includes('cancel_reason')) db.exec('ALTER TABLE appointments ADD COLUMN cancel_reason TEXT');
// The legal entity they're treated through: one of the business's entities (Settings → Business).
if (!columns('clients').includes('entity')) db.exec('ALTER TABLE clients ADD COLUMN entity TEXT');
// A patient's first name and surname kept apart (name stays the full "First Last", which the lists and joins show),
// and their tutor: the parent or guardian who brings them and pays. Existing patients: the first word of the name
// became the first name, the rest the surname.
if (!columns('clients').includes('first_name')) {
  db.exec(`ALTER TABLE clients ADD COLUMN first_name TEXT;
    ALTER TABLE clients ADD COLUMN last_name TEXT;
    ALTER TABLE clients ADD COLUMN tutor_name TEXT;
    ALTER TABLE clients ADD COLUMN tutor_relation TEXT;
    ALTER TABLE clients ADD COLUMN tutor_phone TEXT;
    ALTER TABLE clients ADD COLUMN tutor_email TEXT;`);
  const set = db.prepare('UPDATE clients SET first_name = ?, last_name = ? WHERE id = ?');
  for (const c of db.prepare('SELECT id, name FROM clients').all()) {
    const [first, ...rest] = c.name.trim().split(/\s+/);
    set.run(first, rest.join(' ') || null, c.id);
  }
}

/* ------------------------------------------------------------------- kilometre log (routes/trips.js) */

// The road driven on a working day: from the start address, through the day's visits, to the finish address.
// stops: JSON [{ label, address }] in the order driven; km: the road distance worked out from the map (legs: each
// leg's), km_manual: the therapist's own figure when different. places: addresses kept to pick as start or finish.
// geocodes: where each address is on the map, kept so it's asked for only once (key: the address simplified).
db.exec(`
CREATE TABLE IF NOT EXISTS trips (
  date TEXT PRIMARY KEY,
  start_address TEXT NOT NULL,
  end_address TEXT NOT NULL,
  stops TEXT NOT NULL DEFAULT '[]',
  km REAL,
  legs TEXT,
  km_manual REAL,
  note TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS places (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  address TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS geocodes (
  key TEXT PRIMARY KEY,
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  found TEXT,
  approx INTEGER NOT NULL DEFAULT 0
);
`);
// Who did the session: one of the business's therapists (Settings → Services), by name.
if (!columns('appointments').includes('therapist')) db.exec('ALTER TABLE appointments ADD COLUMN therapist TEXT');
// A session repeating every week until a date: its sessions are all made up front (each an ordinary session) and
// share series_id. Changing or deleting one can take the following ones with it.
db.exec(`CREATE TABLE IF NOT EXISTS series (
  id INTEGER PRIMARY KEY,
  until TEXT NOT NULL,                     -- the last date a session of it can be on
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
)`);
if (!columns('appointments').includes('series_id'))
  db.exec('ALTER TABLE appointments ADD COLUMN series_id INTEGER REFERENCES series(id) ON DELETE SET NULL');
// A patient's diagnoses: JSON ["…", …], free text, as many as they have.
if (!columns('clients').includes('diagnoses')) db.exec('ALTER TABLE clients ADD COLUMN diagnoses TEXT');
// A package's travel fee for each of its sessions (bani): × its sessions, billed with the package; its home visits then
// carry no travel fee of their own.
if (!columns('packages').includes('travel_fee')) db.exec('ALTER TABLE packages ADD COLUMN travel_fee INTEGER NOT NULL DEFAULT 0');
// A package entered once already under way: how many of each part's sessions were done before it was entered here.
if (!columns('package_items').includes('done_before')) db.exec('ALTER TABLE package_items ADD COLUMN done_before INTEGER NOT NULL DEFAULT 0');
// A patient's history from before the app: hours of a service done with them back then, with no dates or sessions.
db.exec(`CREATE TABLE IF NOT EXISTS client_history (
  id INTEGER PRIMARY KEY,
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  service_id INTEGER REFERENCES event_types(id) ON DELETE SET NULL,
  hours REAL NOT NULL CHECK (hours > 0),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
)`);
db.exec('CREATE INDEX IF NOT EXISTS client_history_client ON client_history (client_id)');
// A history entry is either hours of a service (hours) or the days it was done on (dates: JSON ["YYYY-MM-DD", …]).
if (!columns('client_history').includes('dates')) {
  db.exec(`
CREATE TABLE client_history_new (
  id INTEGER PRIMARY KEY,
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  service_id INTEGER REFERENCES event_types(id) ON DELETE SET NULL,
  hours REAL CHECK (hours IS NULL OR hours > 0),
  dates TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK ((hours IS NULL) <> (dates IS NULL))
);
INSERT INTO client_history_new (id, client_id, service_id, hours, created_at) SELECT id, client_id, service_id, hours, created_at FROM client_history;
DROP TABLE client_history;
ALTER TABLE client_history_new RENAME TO client_history;
CREATE INDEX client_history_client ON client_history (client_id);
`);
}
// The advance each person pays to hold their place (bani, 0 = none), part of the price; and which attendees paid it.
if (!columns('events').includes('advance_fee')) db.exec('ALTER TABLE events ADD COLUMN advance_fee INTEGER NOT NULL DEFAULT 0');
if (!columns('event_attendees').includes('advance_paid')) db.exec('ALTER TABLE event_attendees ADD COLUMN advance_paid INTEGER NOT NULL DEFAULT 0');
// Someone who dropped out after paying the advance: 'undecided', 'kept' (the advance is ours: event income) or
// 'refunded'. NULL = still coming.
if (!columns('event_attendees').includes('dropped'))
  db.exec("ALTER TABLE event_attendees ADD COLUMN dropped TEXT CHECK (dropped IN ('undecided', 'kept', 'refunded'))");
// An attendee that came from the event's app (the padel app's sign-up list): kept in step with that list on each push,
// while the ones added here by hand are left alone.
if (!columns('event_attendees').includes('synced')) db.exec('ALTER TABLE event_attendees ADD COLUMN synced INTEGER NOT NULL DEFAULT 0');
// Parent / tutor accounts (practices): they sign in to see only their own children (patients), and change nothing.
// Kept as a flag next to role (which stays 'viewer'), since role's CHECK can't change without rebuilding users.
if (!columns('users').includes('parent')) db.exec('ALTER TABLE users ADD COLUMN parent INTEGER NOT NULL DEFAULT 0');
db.exec(`CREATE TABLE IF NOT EXISTS parent_clients (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, client_id)
)`);
// A patient's attending doctors (JSON [{ name, specialty }], at least one) and the drugs they take (JSON [{ name, dose }]).
if (!columns('clients').includes('doctors')) db.exec('ALTER TABLE clients ADD COLUMN doctors TEXT');
if (!columns('clients').includes('medications')) db.exec('ALTER TABLE clients ADD COLUMN medications TEXT');
// Organizer accounts (community events): linked to a person in People, they see and run only that person's events
// (domain/organizer.js). A flag next to role, like parent, since role's CHECK can't change without rebuilding users.
if (!columns('users').includes('organizer')) db.exec('ALTER TABLE users ADD COLUMN organizer INTEGER NOT NULL DEFAULT 0');
if (!columns('users').includes('person_id')) db.exec('ALTER TABLE users ADD COLUMN person_id INTEGER REFERENCES people(id) ON DELETE SET NULL');
// Development points (domain/devPoints.js): the commits read from GitHub, and the contribution made for each week
// (key "2026-W48|2026-11": a week, split by month).
db.exec(`CREATE TABLE IF NOT EXISTS dev_commits (
  sha TEXT PRIMARY KEY,
  repo TEXT NOT NULL,
  email TEXT NOT NULL,
  at INTEGER NOT NULL                     -- author time, ms
)`);
db.exec(`CREATE TABLE IF NOT EXISTS dev_weeks (
  key TEXT PRIMARY KEY,
  contribution_id INTEGER REFERENCES contributions(id) ON DELETE SET NULL,
  minutes REAL NOT NULL,
  commits INTEGER NOT NULL,
  updated_at TEXT NOT NULL
)`);
// One-off discount amounts (typed by hand, not a saved discount) come out of the event's profit, like a member
// price; saved discounts are paid by the general fund (finance.js). A flag rather than discount_id IS NULL, since
// deleting a saved discount sets discount_id to NULL. Rows from before: fixed amounts without a saved discount (a %
// row with none is a deleted saved discount; a deleted fixed saved discount can't be told apart).
if (!columns('event_discounts').includes('one_off')) {
  db.exec('ALTER TABLE event_discounts ADD COLUMN one_off INTEGER NOT NULL DEFAULT 0');
  db.exec("UPDATE event_discounts SET one_off = 1 WHERE member = 0 AND free IS NULL AND discount_id IS NULL AND kind = 'fixed'");
}
// Every drop-out is noted (domain/eventSync.js): the day they dropped out and a note (e.g. taken off by the app's
// admin). Someone who dropped out having paid nothing is 'refunded': there's nothing to keep.
if (!columns('event_attendees').includes('dropped_at')) db.exec('ALTER TABLE event_attendees ADD COLUMN dropped_at TEXT');
if (!columns('event_attendees').includes('drop_note')) db.exec('ALTER TABLE event_attendees ADD COLUMN drop_note TEXT');
// The app's own id for a synced attendee (padel player, events-site sign-up): matched before the name, so someone
// renamed there stays the same attendee here.
if (!columns('event_attendees').includes('external_ref')) db.exec('ALTER TABLE event_attendees ADD COLUMN external_ref TEXT');
// The help activities (HELP_ACTIVITIES) for a community from before them.
if (community && !db.prepare("SELECT 1 FROM settings WHERE key = 'migrated:help-activities'").get()) addHelpActivities();
}
