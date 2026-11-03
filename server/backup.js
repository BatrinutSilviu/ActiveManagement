// Automatic database backups, made by the app itself so nothing has to be installed on the server.
// Every BACKUP_EVERY_DAYS (default 2) a consistent copy goes to <data dir>/backups as auto-*.db; the
// last BACKUP_KEEP (default 30, so about two months) are kept. Admins can also back up now and download
// any backup from Settings, to keep a copy off the server. The deploy script's pre-deploy-*.db copies
// live in the same folder and are listed too.
import { mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { db, DB_PATH } from './db.js';

export const BACKUP_DIR = process.env.BACKUP_DIR || resolve(dirname(DB_PATH), 'backups');
export const EVERY_DAYS = Number(process.env.BACKUP_EVERY_DAYS) || 2;
const KEEP = Number(process.env.BACKUP_KEEP) || 30;
const DAY = 24 * 60 * 60 * 1000;
export const BACKUP_NAME = /^(auto|manual|pre-deploy)-[\dT-]+\.db$/;

export function listBackups() {
  mkdirSync(BACKUP_DIR, { recursive: true });
  return readdirSync(BACKUP_DIR).filter((n) => BACKUP_NAME.test(n)).map((name) => {
    const st = statSync(join(BACKUP_DIR, name));
    return { name, kind: name.split('-')[0] === 'pre' ? 'pre-deploy' : name.split('-')[0], size: st.size, at: st.mtime.toISOString() };
  }).sort((a, b) => b.at.localeCompare(a.at));
}

const stamp = () => new Date().toISOString().slice(0, 23).replace(/[:.]/g, '-'); // 2026-11-03T14-05-09-123

/** Writes a consistent copy of the database (VACUUM INTO works while the app keeps running). */
export function makeBackup(kind = 'auto') {
  mkdirSync(BACKUP_DIR, { recursive: true });
  const name = `${kind}-${stamp()}.db`;
  db.exec(`VACUUM INTO '${join(BACKUP_DIR, name).replace(/'/g, "''")}'`);
  // Keep the newest automatic backups; manual and pre-deploy ones are managed separately.
  for (const old of listBackups().filter((b) => b.kind === 'auto').slice(KEEP)) rmSync(join(BACKUP_DIR, old.name));
  return name;
}

export function backupStatus() {
  const list = listBackups();
  const lastAuto = list.find((b) => b.kind === 'auto');
  const last = list[0];
  return {
    everyDays: EVERY_DAYS, keep: KEEP, dir: BACKUP_DIR, last: last?.at || null,
    nextDue: lastAuto ? new Date(Date.parse(lastAuto.at) + EVERY_DAYS * DAY).toISOString() : null, backups: list,
  };
}

/** Checks hourly; backs up when the last automatic backup is EVERY_DAYS old (or there is none). */
export function backupIfDue(now = Date.now()) {
  try {
    const lastAuto = listBackups().find((b) => b.kind === 'auto');
    if (lastAuto && now - Date.parse(lastAuto.at) < EVERY_DAYS * DAY) return null;
    const name = makeBackup('auto');
    console.log(`Backup written: ${name}`);
    return name;
  } catch (e) {
    console.error('Automatic backup failed:', e.message);
    return null;
  }
}

export function startBackupSchedule() {
  const check = () => backupIfDue();
  setTimeout(check, 60 * 1000).unref(); // a minute after start, then every hour
  setInterval(check, 60 * 60 * 1000).unref();
}
