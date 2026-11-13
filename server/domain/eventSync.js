import { db } from '../db/connection.js';
import { isDate, need, today } from '../http.js';
import { SOURCES, SYNC_FROM, SYNCED_FIELDS } from '../sync.js';
import { toBani } from './money.js';
import { repriceEvent } from './pricing.js';

// Applies the records pushed by the community's other apps (POST /api/integrations/events, see routes/integrations.js)
// to our events; sync.js turns each app's record into the fields of an event.

const foldName = (v) => String(v ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const nameWords = (v) => new Set(foldName(v).split(/[^a-z0-9#]+/).filter((w) => w.length > 1 || /\d/.test(w)));
/** A hand-made event (not from any app) that is this record: same day and sport, and the same name,
 *  the same tournament number (#95) or mostly the same words. */
function findHandMade(m) {
  const list = db.prepare(`SELECT e.id, e.name FROM events e JOIN event_types t ON t.id = e.type_id
    WHERE e.source IS NULL AND e.date = ? AND t.name = ? COLLATE NOCASE AND e.status != 'cancelled'`).all(m.date, m.sport);
  const exact = list.find((e) => foldName(e.name).trim() === foldName(m.name).trim());
  if (exact) return exact;
  const num = foldName(m.name).match(/#\d+/)?.[0];
  if (num) { const same = list.filter((e) => foldName(e.name).match(/#\d+/)?.[0] === num); if (same.length === 1) return same[0]; }
  const want = nameWords(m.name);
  const score = (e) => { const w = nameWords(e.name); const both = [...w].filter((x) => want.has(x)).length; return both / (new Set([...w, ...want]).size || 1); };
  const best = list.map((e) => ({ e, k: score(e) })).sort((a, b) => b.k - a.k);
  return best[0] && best[0].k >= 0.5 && !(best[1] && best[1].k === best[0].k) ? best[0].e : null;
}

/** Creates, updates, links or cancels the event for one pushed record (record null = deleted in that app). */
export function upsertSyncedEvent(source, externalId, record) {
  const ev = db.prepare('SELECT * FROM events WHERE source = ? AND external_id = ?').get(source, externalId);
  const label = SOURCES[source].label;
  if (!record) {
    if (!ev) return { action: 'ignored', reason: 'not here' };
    if (ev.status === 'completed') return { action: 'ignored', reason: 'finalized', id: ev.id };
    // Pushes are retried: a delete that arrives again changes nothing (and doesn't add the note twice).
    if (ev.status === 'cancelled') return { action: 'unchanged', id: ev.id };
    db.prepare(`UPDATE events SET status = 'cancelled', notes = TRIM(COALESCE(notes, '') || ?), synced_at = datetime('now') WHERE id = ?`)
      .run(`\n\nDeleted in the ${label} on ${today()}.`, ev.id);
    return { action: 'cancelled', id: ev.id };
  }
  const m = SOURCES[source].map(record);
  need(isDate(m.date), 'The record has no valid date');
  // A link to the event in its app: only https addresses are kept (it ends up in links on pages).
  const url = typeof record.url === 'string' && /^https:\/\/[^\s"'<>]+$/.test(record.url) ? record.url : null;
  if (!ev) {
    if (m.date < SYNC_FROM) return { action: 'ignored', reason: `dated before ${SYNC_FROM}` };
    // Already entered here by hand (same day and sport, same name or tournament number): link it instead
    // of creating a duplicate. Its fields stay as they are; later changes in the other app are applied.
    const own = findHandMade(m);
    if (own) {
      db.prepare(`UPDATE events SET source = ?, external_id = ?, external_url = ?, sync_data = ?, synced_at = datetime('now') WHERE id = ?`)
        .run(source, externalId, url, JSON.stringify(m), own.id);
      return { action: 'linked', id: own.id };
    }
    const sport = db.prepare('SELECT * FROM event_types WHERE name = ? COLLATE NOCASE').get(m.sport)
      ?? { id: Number(db.prepare('INSERT INTO event_types (name) VALUES (?)').run(m.sport).lastInsertRowid) };
    const activity = (m.activity && db.prepare('SELECT id FROM activities WHERE name = ? COLLATE NOCASE').get(m.activity))
      || db.prepare('SELECT id FROM activities WHERE sport_id = ? ORDER BY sort LIMIT 1').get(sport.id);
    const fee = toBani(m.participation_fee);
    const venue = Math.min(m.venue_fee == null ? sport.default_venue_fee || 0 : toBani(m.venue_fee), fee);
    const id = Number(db.prepare(`
      INSERT INTO events (name, type_id, activity_id, date, end_date, start_time, end_time, location, status, participants, participation_fee,
        venue_fee, notes, prizes, source, external_id, external_url, sync_data, synced_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`).run(
      m.name, sport.id, activity?.id ?? null, m.date, m.end_date, m.start_time ?? null, m.end_time ?? null, m.location, m.status,
      m.participants, fee, venue, m.notes || null, m.prizes ? JSON.stringify(m.prizes) : null,
      source, externalId, url, JSON.stringify(m)).lastInsertRowid);
    syncPartnerPrizes(id, source, externalId, m);
    return { action: 'created', id };
  }
  if (ev.status === 'completed') return { action: 'ignored', reason: 'finalized', id: ev.id };
  const before = JSON.parse(ev.sync_data || '{}');
  const changed = SYNCED_FIELDS.filter((k) => k in m && JSON.stringify(m[k]) !== JSON.stringify(before[k]));
  const set = {};
  for (const k of changed) {
    if (k === 'participation_fee') set[k] = toBani(m[k]);
    else if (k === 'venue_fee') { if (m[k] != null) set[k] = toBani(m[k]); }
    else if (k === 'status') { if (m.status === 'cancelled' || ev.status === 'cancelled') set.status = m.status; }
    else if (k === 'prizes') set[k] = m[k] ? JSON.stringify(m[k]) : null;
    else set[k] = m[k] ?? null;
  }
  if ('participation_fee' in set || 'venue_fee' in set) {
    const fee = set.participation_fee ?? ev.participation_fee;
    set.venue_fee = Math.min(set.venue_fee ?? ev.venue_fee, fee);
  }
  const keys = Object.keys(set);
  db.prepare(`UPDATE events SET ${keys.map((k) => `${k} = ?, `).join('')}external_url = ?, sync_data = ?, synced_at = datetime('now') WHERE id = ?`)
    .run(...keys.map((k) => set[k]), url ?? ev.external_url, JSON.stringify(m), ev.id);
  if ('participation_fee' in set || 'venue_fee' in set) repriceEvent(ev.id);
  if ('prizes' in set) syncPartnerPrizes(ev.id, source, externalId, m);
  return { action: keys.length ? 'updated' : 'unchanged', id: ev.id, fields: keys };
}

// The partner prizes an app advertises for its event become partner prize records here, one per place,
// keyed "<source>:<external id>:<place>". A later push updates the partner and the prize; the winner, value
// and note filled in here are kept. A prize the app no longer has goes away, unless it already has a winner.
// Partners are matched by name, and added when new.
function syncPartnerPrizes(eventId, source, externalId, m) {
  if (!Array.isArray(m.prizes)) return;
  const prefix = `${source}:${externalId}:`;
  const event = db.prepare('SELECT date, type_id FROM events WHERE id = ?').get(eventId);
  const keep = new Set();
  for (const p of m.prizes.filter((p) => p.partner)) {
    const key = `${prefix}${p.place}`;
    keep.add(key);
    const partnerId = db.prepare('SELECT id FROM partners WHERE name = ?').get(p.partner)?.id
      ?? Number(db.prepare('INSERT INTO partners (name, sport_id) VALUES (?, ?)').run(p.partner, event.type_id).lastInsertRowid);
    const prize = `${p.label}: ${p.prize}`;
    const row = db.prepare('SELECT id FROM partner_prizes WHERE sync_key = ?').get(key);
    if (row) db.prepare('UPDATE partner_prizes SET partner_id = ?, event_id = ?, prize = ?, date = ? WHERE id = ?').run(partnerId, eventId, prize, event.date, row.id);
    else {
      db.prepare(`INSERT INTO partner_prizes (partner_id, event_id, prize, qty, date, note, sync_key) VALUES (?, ?, ?, 1, ?, ?, ?)`)
        .run(partnerId, eventId, prize, event.date, `From the ${SOURCES[source].label}`, key);
    }
  }
  for (const row of db.prepare('SELECT id, sync_key, person_id, winner_name FROM partner_prizes WHERE sync_key LIKE ?').all(`${prefix}%`)) {
    if (keep.has(row.sync_key)) continue;
    if (row.person_id || row.winner_name) db.prepare('UPDATE partner_prizes SET sync_key = NULL WHERE id = ?').run(row.id);
    else db.prepare('DELETE FROM partner_prizes WHERE id = ?').run(row.id);
  }
}
