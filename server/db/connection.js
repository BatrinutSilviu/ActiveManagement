// The one connection to the SQLite database, and tx() for writes that must happen together.
// Import the database through ../db.js, which also brings the schema up to date before anything uses it.
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { log } from '../log.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const DB_PATH = process.env.DB_PATH || resolve(root, 'data/active.db');
mkdirSync(dirname(DB_PATH), { recursive: true });

export const db = new DatabaseSync(DB_PATH);
// busy_timeout: another connection writing (a script run with docker exec, a backup) makes us wait up to 5 s
// for the lock instead of failing at once. synchronous = FULL: a committed change survives a power cut too
// (with WAL, NORMAL could lose the last transactions) — worth it for money, the app writes little.
db.exec('PRAGMA busy_timeout = 5000; PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL; PRAGMA foreign_keys = ON;');

// A damaged database file is reported loudly at start (and by /api/health) before anything is written to it.
const checked = db.prepare('PRAGMA quick_check').all().map((r) => Object.values(r)[0]);
export const integrity = { ok: checked.length === 1 && checked[0] === 'ok', problems: checked[0] === 'ok' ? [] : checked.slice(0, 20) };
if (!integrity.ok) log('error', 'DATABASE INTEGRITY CHECK FAILED — restore a backup', { db: DB_PATH, problems: integrity.problems });

// Every write made by tx() runs in one transaction, committed or rolled back as a whole. Nested calls become
// savepoints, so a helper that uses tx() can run inside another tx() (or inside the migrations, see schema.js).
// BEGIN IMMEDIATE takes the write lock up front: a transaction that only read first could otherwise fail
// half-way with SQLITE_BUSY when another connection (a script, a backup) has written in the meantime.
let txDepth = 0;
export function tx(fn) {
  const sp = txDepth ? `tx${txDepth}` : null;
  db.exec(sp ? `SAVEPOINT ${sp}` : 'BEGIN IMMEDIATE');
  txDepth++;
  try {
    const r = fn();
    db.exec(sp ? `RELEASE ${sp}` : 'COMMIT');
    return r;
  } catch (e) {
    try { db.exec(sp ? `ROLLBACK TO ${sp}; RELEASE ${sp}` : 'ROLLBACK'); } catch { /* SQLite already rolled it back */ }
    throw e;
  } finally {
    txDepth--;
  }
}

/** The column names of a table (migrations check them to know what an older database still lacks). */
export const columns = (table) => db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
