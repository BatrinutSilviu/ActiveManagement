// Points for developing the community's apps (Settings → Points → Development): once a week, the commits of the
// configured person on the Active repos are read from GitHub, turned into hours of work, and added as a
// "Development & programming" contribution worth `perHour` points an hour — one per week (split when a week spans two
// months, so each part counts in its own month). The agreed rate is 1 point per hour.
//
// Hours from commits (the usual estimate, as in git-hours): the commits of all the repos are put on one timeline, so
// work on two apps at once counts once. A commit less than `maxGapMin` after the previous one counts the time in
// between as worked; one after a longer break starts a session, credited `firstCommitMin` for the work before it.
// So 500 small commits and 1 big one are both measured by the time they took, not by their number.
//
// Weeks are re-counted for a while (commits pushed late, a repo added), but a month whose points are already closed
// (month_points) is never changed. Commits are kept in dev_commits, so GitHub is only asked for the recent ones.
import { db, tx } from '../db/connection.js';
import { getDevPoints, getDevStatus, setDevStatus } from '../db/settings.js';
import { errorFields, log } from '../log.js';
import { featureOn } from './business.js';

const ACTIVITY = 'Development & programming';
const TZ = 'Europe/Bucharest';
const DAY = 86_400_000;

/** "YYYY-MM-DD" of a moment, in Romanian time. */
const localDay = (ms) => new Date(ms).toLocaleDateString('sv-SE', { timeZone: TZ });
/** ISO week of a day ("2026-W48") and its Sunday. */
function isoWeek(day) {
  const d = new Date(`${day}T12:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7; // Monday 0
  const thursday = new Date(d.getTime() + (3 - dow) * DAY);
  const yearStart = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((thursday - yearStart) / DAY + 1) / 7);
  return { week: `${thursday.getUTCFullYear()}-W${String(week).padStart(2, '0')}`, sunday: new Date(d.getTime() + (6 - dow) * DAY).toISOString().slice(0, 10) };
}

/**
 * Minutes worked per day from commit times (ms, any order): the gap since the previous commit when it's short,
 * else a new session's first-commit allowance. The minutes go to the day of the commit that closes them.
 */
export function minutesByDay(times, { maxGapMin = 120, firstCommitMin = 30 } = {}) {
  const sorted = [...new Set(times)].sort((a, b) => a - b);
  const out = new Map();
  sorted.forEach((t, i) => {
    const gap = i ? (t - sorted[i - 1]) / 60_000 : Infinity;
    const min = gap <= maxGapMin ? gap : firstCommitMin;
    out.set(localDay(t), (out.get(localDay(t)) || 0) + min);
  });
  return out;
}

/** The commits of one repo since a moment, from GitHub (default branch). A token is needed for a private repo. */
async function fetchRepo(repo, sinceIso) {
  const out = [];
  for (let page = 1; page <= 30; page++) {
    const res = await fetch(`https://api.github.com/repos/${repo}/commits?since=${encodeURIComponent(sinceIso)}&per_page=100&page=${page}`, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'community-management',
        ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}) },
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) throw new Error(res.status === 404 ? `${repo}: not found (a private repo needs GITHUB_TOKEN)` : `${repo}: GitHub answered ${res.status}`);
    const list = await res.json();
    for (const c of list) out.push({ sha: c.sha, email: String(c.commit?.author?.email || '').toLowerCase(), at: Date.parse(c.commit?.author?.date) });
    if (list.length < 100) break;
  }
  return out;
}

function activityId() {
  return db.prepare('SELECT id FROM activities WHERE name = ?').get(ACTIVITY)?.id
    ?? Number(db.prepare('INSERT INTO activities (name, organizer_points, sort) VALUES (?, 0, 999)').run(ACTIVITY).lastInsertRowid);
}

const fmtHours = (min) => { const h = Math.floor(min / 60), m = Math.round(min % 60); return h && m ? `${h} h ${m} min` : h ? `${h} h` : `${m} min`; };

/**
 * Fetches the new commits and brings each complete week's contribution up to date. `now` for tests.
 * Returns { weeks: [{ key, minutes, commits, points }], errors }.
 */
export async function runDevPoints({ now = Date.now() } = {}) {
  const cfg = getDevPoints();
  if (!cfg.person_id || !cfg.emails.length || !cfg.repos.length) return { skipped: 'Not set up: pick the person, their git email and the repos' };
  const emails = new Set(cfg.emails.map((e) => e.toLowerCase()));

  // Only commits from two weeks before the last one we have (or from the start date) are asked for again.
  const last = db.prepare('SELECT MAX(at) AS at FROM dev_commits').get().at;
  const since = new Date(Math.max(Date.parse(`${cfg.since}T00:00:00Z`) - DAY, last ? last - 14 * DAY : 0)).toISOString();
  const errors = [];
  for (const repo of cfg.repos) {
    try {
      const commits = await fetchRepo(repo, since);
      const ins = db.prepare('INSERT OR IGNORE INTO dev_commits (sha, repo, email, at) VALUES (?, ?, ?, ?)');
      tx(() => { for (const c of commits) if (c.sha && Number.isFinite(c.at)) ins.run(c.sha, repo, c.email, c.at); });
    } catch (e) { errors.push(e.message); }
  }

  // Hours per day from every repo's commits by this person, then per (week, month) part of each complete week.
  const mine = db.prepare(`SELECT at, repo, email FROM dev_commits WHERE at >= ?`).all(Date.parse(`${cfg.since}T00:00:00Z`) - DAY)
    .filter((r) => cfg.repos.includes(r.repo) && emails.has(r.email)).map((r) => r.at);
  const perDay = minutesByDay(mine, cfg);
  const commitsPerDay = new Map();
  for (const t of mine) commitsPerDay.set(localDay(t), (commitsPerDay.get(localDay(t)) || 0) + 1);
  const today = localDay(now);
  const buckets = new Map();
  for (const [day, min] of perDay) {
    if (day < cfg.since) continue;
    const { week, sunday } = isoWeek(day);
    if (sunday >= today) continue; // the week isn't over
    const key = `${week}|${day.slice(0, 7)}`;
    const b = buckets.get(key) || { key, week, month: day.slice(0, 7), last: day, minutes: 0, commits: 0 };
    b.minutes += min; b.commits += commitsPerDay.get(day) || 0; if (day > b.last) b.last = day;
    buckets.set(key, b);
  }

  // One contribution per part; months already closed stay as they are.
  const closed = new Set(db.prepare('SELECT month FROM month_points').all().map((r) => r.month));
  const act = activityId();
  const done = [];
  tx(() => {
    const known = new Map(db.prepare('SELECT * FROM dev_weeks').all().map((r) => [r.key, r]));
    for (const b of buckets.values()) {
      if (closed.has(b.month)) continue;
      const points = Math.round((b.minutes / 60) * cfg.perHour * 100) / 100;
      const note = `${ACTIVITY} · ${b.week} · ${fmtHours(b.minutes)}, ${b.commits} ${b.commits === 1 ? 'commit' : 'commits'}`;
      const row = known.get(b.key);
      const exists = row?.contribution_id && db.prepare('SELECT 1 FROM contributions WHERE id = ?').get(row.contribution_id);
      let cid = row?.contribution_id;
      if (exists) db.prepare('UPDATE contributions SET person_id = ?, activity_id = ?, date = ?, points = ?, note = ? WHERE id = ?').run(cfg.person_id, act, b.last, points, note, cid);
      else cid = Number(db.prepare('INSERT INTO contributions (person_id, activity_id, date, points, note) VALUES (?, ?, ?, ?, ?)').run(cfg.person_id, act, b.last, points, note).lastInsertRowid);
      db.prepare(`INSERT INTO dev_weeks (key, contribution_id, minutes, commits, updated_at) VALUES (?, ?, ?, ?, datetime('now'))
        ON CONFLICT(key) DO UPDATE SET contribution_id = excluded.contribution_id, minutes = excluded.minutes, commits = excluded.commits, updated_at = excluded.updated_at`)
        .run(b.key, cid, b.minutes, b.commits);
      done.push({ key: b.key, minutes: Math.round(b.minutes), commits: b.commits, points });
    }
  });
  setDevStatus({ at: new Date(now).toISOString(), week: isoWeek(localDay(now - 7 * DAY)).week, errors });
  return { weeks: done, errors };
}

/** The weeks counted so far (newest first), for Settings. */
export const devWeeks = () => db.prepare(`SELECT w.key, w.minutes, w.commits, c.points, c.date FROM dev_weeks w
  LEFT JOIN contributions c ON c.id = w.contribution_id ORDER BY w.key DESC LIMIT 26`).all();

/** Checked hourly: runs once a week, on the first check after the week is over. */
export function startDevPointsSchedule() {
  const check = async () => {
    if (!featureOn('payouts')) return; // only where there are organiser points (the community)
    const lastWeek = isoWeek(localDay(Date.now() - 7 * DAY)).week;
    const status = getDevStatus();
    if (status.week === lastWeek && !status.errors?.length) return;
    // After a failed run, try again only every 6 hours.
    if (status.week === lastWeek && Date.now() - Date.parse(status.at) < 6 * 3600_000) return;
    try {
      const r = await runDevPoints();
      if (!r.skipped) log(r.errors.length ? 'warn' : 'info', 'Development points counted', { weeks: r.weeks.length, errors: r.errors });
    } catch (e) { log('error', 'Development points failed', errorFields(e)); }
  };
  setTimeout(check, 90 * 1000).unref();
  setInterval(check, 60 * 60 * 1000).unref();
}
