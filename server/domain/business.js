// Which business this copy of the app is for: its name, look, currency, and which parts of the app it uses.
// Every business runs its own copy (own server or container, own database), so this is one stored setting.
// The business type decides the defaults: a "community" (Active: events, sport funds, profit split, points…)
// or a "practice" (e.g. a therapist doing home visits: sessions and money, without the community extras).
import { db } from '../db/connection.js';

/** The parts of the app that can be switched on or off, with the name shown in Settings. */
export const FEATURES = {
  events: 'Community events (attendees, discounts, costs) and the monthly report',
  practice: 'Patients, sessions, packages, invoices and receipts',
  payouts: 'Payouts, points and the profit split',
  funds: 'Sport funds page',
  vouchers: 'Vouchers',
  partners: 'Partners and partner prizes',
  stock: 'Stock and equipment',
  import: 'Spreadsheet import',
  server: 'Server status page',
  sync: 'Events pushed from other apps (padel, hikes)',
  calendar: 'Public calendar for the website',
};
const all = (on, except = {}) => ({ ...Object.fromEntries(Object.keys(FEATURES).map((k) => [k, on])), ...except });

/** What things are called, per business type (lowercase; the UI capitalises where needed). */
export const TYPES = {
  community: {
    label: 'Community (events, sport funds, profit split)',
    features: all(true, { practice: false }),
    terms: { event: 'event', events: 'events', sport: 'sport', sports: 'sports', person: 'person', people: 'people' },
  },
  practice: {
    label: 'Practice (sessions with clients or patients)',
    features: all(false, { practice: true }),
    terms: { event: 'session', events: 'sessions', sport: 'service', sports: 'services', person: 'patient', people: 'patients' },
  },
};

const DEFAULTS = { name: '', tagline: '', color: '#2a78d6', currency: 'RON', locale: 'ro-RO', website: '', address: '', entities: [], language: 'en' };

/** Databases made before this setting existed are Active's: that's what they get. */
export const ACTIVE = { type: 'community', name: 'Active', tagline: 'Community admin', website: 'https://activetimisoara.ro' };

let cache; // undefined = not read yet; null = not set up yet

/** The business, with its type's defaults filled in; null before the first-run setup. */
export function getBusiness() {
  if (cache === undefined) {
    const row = db.prepare("SELECT value FROM settings WHERE key = 'business'").get();
    cache = row ? complete(JSON.parse(row.value)) : null;
  }
  return cache;
}

function complete(stored) {
  const type = TYPES[stored.type] ? stored.type : 'community';
  return { ...DEFAULTS, ...stored, type, features: { ...TYPES[type].features, ...stored.features }, terms: TYPES[type].terms };
}

/** Stores the business (only what's set; terms always come from the type). */
export function setBusiness(value) {
  const { terms, ...stored } = value;
  db.prepare("INSERT INTO settings (key, value) VALUES ('business', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
    .run(JSON.stringify(stored));
  cache = undefined; // read again next time (also right if a transaction around this rolls back)
  return complete(stored);
}

export const featureOn = (name) => getBusiness()?.features[name] ?? false;
export const currency = () => getBusiness()?.currency || DEFAULTS.currency;

/**
 * Checks and tidies business settings from a form (for setup, or a change in Settings), on top of `current`.
 * Returns the value to store, or a message saying what's wrong.
 */
export function readBusiness(body, current = {}) {
  const v = { ...current };
  const text = (k, max) => { if (body[k] !== undefined) v[k] = String(body[k] ?? '').trim().slice(0, max); };
  if (body.type !== undefined) {
    if (!TYPES[body.type]) return { error: 'Unknown business type' };
    v.type = body.type;
  }
  text('name', 60); text('tagline', 60); text('website', 200); text('address', 300);
  if (!v.name) return { error: 'The business needs a name' };
  if (v.website && !/^https?:\/\/\S+$/i.test(v.website)) return { error: 'The website must start with http:// or https://' };
  if (body.color !== undefined) {
    if (!/^#[0-9a-f]{6}$/i.test(body.color)) return { error: 'The colour must look like #2a78d6' };
    v.color = body.color.toLowerCase();
  }
  if (body.currency !== undefined || body.locale !== undefined) {
    const cur = String(body.currency ?? v.currency ?? DEFAULTS.currency).trim().toUpperCase();
    const loc = String(body.locale ?? v.locale ?? DEFAULTS.locale).trim();
    try { new Intl.NumberFormat(loc, { style: 'currency', currency: cur }); } catch { return { error: 'Unknown currency or number format' }; }
    if (!/^[A-Z]{3}$/.test(cur)) return { error: 'The currency must be a 3-letter code, e.g. RON or EUR' };
    v.currency = cur; v.locale = loc;
  }
  if (body.language !== undefined) {
    if (!['en', 'ro'].includes(body.language)) return { error: 'Unknown language' };
    v.language = body.language;
  }
  // The legal entities a practice's patients are treated through (each patient picks one), e.g. the practice's
  // own company and the therapist as a person. One per line in Settings.
  if (body.entities !== undefined) {
    const list = Array.isArray(body.entities) ? body.entities : String(body.entities).split('\n');
    v.entities = [...new Set(list.map((e) => String(e).trim().slice(0, 80)).filter(Boolean))].slice(0, 20);
  }
  if (body.features !== undefined) {
    v.features = {};
    for (const k of Object.keys(FEATURES)) if (body.features[k] !== undefined) v.features[k] = !!body.features[k];
  }
  return { value: v };
}
