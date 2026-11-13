// The database: import it from here. Importing this module opens the connection (db/connection.js) and brings
// the schema up to date (db/schema.js) before anything else can use it; the settings stored in it are read and
// written through db/settings.js.
import { db } from './db/connection.js';
import { migrate } from './db/schema.js';
import { log } from './log.js';

export { DB_PATH, db, integrity, tx } from './db/connection.js';
export { applyHyroxPricing, SPORTS } from './db/schema.js';
export {
  getPointsRates, getSplit, getStartingBalance, getTaskShares, POINTS_RATE_KEYS, setMonthSplit, setPointsRates, setSplit,
  setStartingBalance, setTaskShares, splitResolver,
} from './db/settings.js';
export { toBani, toRon } from './domain/money.js';

migrate();

// Rows pointing at something that no longer exists. Shouldn't happen with foreign keys on, so say it loudly.
const orphans = db.prepare('PRAGMA foreign_key_check').all();
if (orphans.length) log('error', 'Foreign key check found rows pointing at missing rows', { count: orphans.length, rows: orphans.slice(0, 20) });
