import { db, foldName } from '../db/connection.js';
import { log } from '../log.js';
import { isDate, localDay, need, today } from '../http.js';
import { SOURCES, SYNC_FROM, SYNCED_FIELDS } from '../sync.js';
import { toBani } from './money.js';
import { whoIs } from './people.js';
import { repriceEvent } from './pricing.js';
import { LIVE } from '../finance.js';

// Applies the records pushed by the community's other apps (POST /api/integrations/events, see routes/integrations.js)
// to our events; sync.js turns each app's record into the fields of an event.

const nameWords = (v) => new Set(foldName(v).split(/[^a-z0-9#]+/).filter((w) => w.length > 1 || /\d/.test(w)));
/** A hand-made event (not from any app) that is this record: same day and sport, and the same name,
 *  the same tournament number (#95) or mostly the same words. */
function findHandMade(m) {
  const list = db.prepare(`SELECT e.id, e.name, e.status FROM events e JOIN event_types t ON t.id = e.type_id
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

/** The event type (sport) a pushed record names. This app owns the list of event types: the other apps
 *  pick from it (GET /api/public/event-types) and never add to it, so a name not here goes under "Other". */
function eventType(name, source) {
  const found = db.prepare('SELECT * FROM event_types WHERE name = ? COLLATE NOCASE').get(name);
  if (found) return found;
  log('warn', 'Synced event has an unknown event type; filed under Other', { source, type: name });
  return db.prepare("SELECT * FROM event_types WHERE name = 'Other' COLLATE NOCASE").get()
    ?? db.prepare("INSERT INTO event_types (name) VALUES ('Other') RETURNING *").get();
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
      if (own.status !== 'completed') syncAttendees(own.id, m, {}); // a finalized event's numbers never change
      return { action: 'linked', id: own.id };
    }
    const sport = eventType(m.sport, source);
    const activity = (m.activity && db.prepare('SELECT id FROM activities WHERE name = ? COLLATE NOCASE').get(m.activity))
      || db.prepare('SELECT id FROM activities WHERE sport_id = ? ORDER BY sort LIMIT 1').get(sport.id);
    const fee = toBani(m.participation_fee);
    const venue = Math.min(m.venue_fee == null ? sport.default_venue_fee || 0 : toBani(m.venue_fee), fee);
    const id = Number(db.prepare(`
      INSERT INTO events (name, type_id, activity_id, date, end_date, start_time, end_time, location, status, participants, participation_fee,
        venue_fee, advance_fee, notes, prizes, source, external_id, external_url, sync_data, synced_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`).run(
      m.name, sport.id, activity?.id ?? null, m.date, m.end_date, m.start_time ?? null, m.end_time ?? null, m.location, m.status,
      m.participants, fee, venue, Math.min(toBani(m.advance_fee), fee), m.notes || null, m.prizes ? JSON.stringify(m.prizes) : null,
      source, externalId, url, JSON.stringify(m)).lastInsertRowid);
    syncPartnerPrizes(id, source, externalId, m);
    syncAttendees(id, m, {});
    return { action: 'created', id };
  }
  if (ev.status === 'completed') return { action: 'ignored', reason: 'finalized', id: ev.id };
  const before = JSON.parse(ev.sync_data || '{}');
  const changed = SYNCED_FIELDS.filter((k) => k in m && JSON.stringify(m[k]) !== JSON.stringify(before[k]));
  const set = {};
  for (const k of changed) {
    if (k === 'participation_fee' || k === 'advance_fee') set[k] = toBani(m[k]);
    else if (k === 'venue_fee') { if (m[k] != null) set[k] = toBani(m[k]); }
    else if (k === 'status') { if (m.status === 'cancelled' || ev.status === 'cancelled') set.status = m.status; }
    else if (k === 'prizes') set[k] = m[k] ? JSON.stringify(m[k]) : null;
    else set[k] = m[k] ?? null;
  }
  if ('participation_fee' in set || 'venue_fee' in set) {
    const fee = set.participation_fee ?? ev.participation_fee;
    set.venue_fee = Math.min(set.venue_fee ?? ev.venue_fee, fee);
  }
  if ('participation_fee' in set || 'advance_fee' in set) set.advance_fee = Math.min(set.advance_fee ?? ev.advance_fee, set.participation_fee ?? ev.participation_fee);
  // Its type changed in that app (e.g. a general event moved from Running to Social): move it here too.
  if (m.sport && before.sport && foldName(m.sport) !== foldName(before.sport)) {
    const type = eventType(m.sport, source);
    if (type.id !== ev.type_id) set.type_id = type.id;
  }
  const keys = Object.keys(set);
  db.prepare(`UPDATE events SET ${keys.map((k) => `${k} = ?, `).join('')}external_url = ?, sync_data = ?, synced_at = datetime('now') WHERE id = ?`)
    .run(...keys.map((k) => set[k]), url ?? ev.external_url, JSON.stringify(m), ev.id);
  if ('participation_fee' in set || 'venue_fee' in set) repriceEvent(ev.id);
  if ('prizes' in set) syncPartnerPrizes(ev.id, source, externalId, m);
  const attendees = syncAttendees(ev.id, m, before);
  if (attendees) keys.push('attendees');
  return { action: keys.length ? 'updated' : 'unchanged', id: ev.id, fields: keys };
}

/**
 * An app's list of the events it still has from `from` on (its nightly check): our live events from that app in that
 * range that aren't on it were deleted there while a push was lost, so they're cancelled like a delete push. An empty
 * list changes nothing (it may be a broken query rather than no events). Finalized events are never touched, nor
 * ones pushed in the last hour: one created there after the app read its list would otherwise be cancelled (and a
 * cancelled event isn't brought back by later pushes).
 */
export function cancelMissing(source, ids, from) {
  need(Array.isArray(ids), 'ids must be a list');
  need(isDate(from), 'from must be a date');
  if (!ids.length) return [];
  const known = new Set(ids.map(String));
  return db.prepare(`SELECT external_id FROM events WHERE source = ? AND date >= ? AND status = ?
    AND (synced_at IS NULL OR synced_at < datetime('now', '-1 hour'))`).all(source, from, LIVE)
    .filter((e) => !known.has(e.external_id))
    .map((e) => ({ ...upsertSyncedEvent(source, e.external_id, null), external_id: e.external_id }));
}

// The app's sign-up list (m.players) becomes the event's attendees, on every push: who signed up is added, who
// left is kept as dropped out (every drop-out is noted, paid or not; see dropOut). Only the attendees that came from
// the app (synced) are ever dropped — the ones added here by hand stay; a name already on the list by hand becomes
// the app's. Someone the app says pulled out (m.withdrawals) whom we never had is added as dropped out. Each tick the app sends (paid, advance_paid)
// follows the app's only when it changed there since the last push, so a tick set here is kept otherwise.
// Returns whether anything changed.
const TICKS = ['paid', 'advance_paid'];
function syncAttendees(eventId, m, before) {
  if (!Array.isArray(m.players)) return false;
  // People are matched by the app's id for them (ref) when it sends one, else by name — but never to someone with a
  // different id (two people with the same name stay two).
  const index = (list) => {
    const refOf = (x) => x.ref ?? x.external_ref ?? null;
    const byRef = new Map(), byName = new Map();
    for (const x of list) {
      if (refOf(x)) byRef.set(refOf(x), x);
      byName.set(foldName(x.name), x);
    }
    return (p) => {
      const ref = refOf(p), same = byName.get(foldName(p.name));
      return (ref && byRef.get(ref)) || (same && (!ref || !refOf(same) || refOf(same) === ref) ? same : undefined);
    };
  };
  const prevOf = index(before.players || []);
  const rows = db.prepare('SELECT * FROM event_attendees WHERE event_id = ?').all(eventId);
  let rowOf = index(rows);
  const onList = new Set(); // ids of the rows the app lists now
  let changed = false;
  const insert = (p, extra = {}) => {
    let who = whoIs({ name: p.name });
    // Someone else here already has this name (two people with the same name there): "Name (2)", not linked to People.
    const taken = (n) => rows.some((r) => foldName(r.name) === foldName(n));
    if (taken(who.name)) {
      let k = 2;
      while (taken(`${who.name} (${k})`)) k++;
      who = { person_id: null, name: `${who.name} (${k})` };
    }
    const row = { event_id: eventId, person_id: who.person_id, name: who.name, paid: p.paid ? 1 : 0, advance_paid: p.advance_paid ? 1 : 0,
      synced: 1, external_ref: p.ref ?? null, ...extra };
    const keys = Object.keys(row);
    row.id = Number(db.prepare(`INSERT INTO event_attendees (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`)
      .run(...keys.map((k) => row[k])).lastInsertRowid);
    rows.push(row);
    rowOf = index(rows);
    changed = true;
    return row;
  };
  for (const p of m.players) {
    const prev = prevOf(p);
    const row = rowOf(p);
    if (!row) { onList.add(insert(p).id); continue; }
    onList.add(row.id);
    // The app is the source of truth: someone on its list is coming (signed up again after dropping out, or a
    // drop marked here by hand), and only leaving the app's list makes them dropped out (see below).
    const next = { synced: 1, dropped: null, dropped_at: null, drop_note: null, external_ref: p.ref ?? row.external_ref };
    // Renamed there (matched by ref): someone from People keeps their People name (their discount rows use it);
    // anyone else takes the new name, and so do their discount rows at this event, unless someone else has it.
    if (!row.person_id && foldName(p.name) !== foldName(row.name) && !rows.some((r) => r !== row && foldName(r.name) === foldName(p.name))) {
      const who = whoIs({ name: p.name });
      db.prepare('UPDATE event_discounts SET name = ? WHERE event_id = ? AND fold(name) = ?').run(who.name, eventId, foldName(row.name));
      Object.assign(next, { name: who.name, person_id: who.person_id });
    }
    for (const k of TICKS) {
      if (typeof p[k] !== 'boolean' || prev?.[k] === p[k]) continue;
      // A hand-added row the app now has too: ticked if either says so.
      next[k] = !row.synced && row[k] ? 1 : p[k] ? 1 : 0;
    }
    const keys = Object.keys(next).filter((k) => next[k] !== row[k]);
    if (keys.length) {
      db.prepare(`UPDATE event_attendees SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`).run(...keys.map((k) => next[k]), row.id);
      Object.assign(row, next);
      changed = true;
    }
  }
  // Gone from the app's list: dropped out, on the day the app says (else today), with who took them off.
  const withdrawals = Array.isArray(m.withdrawals) ? m.withdrawals : [];
  const withdrawalOf = index(withdrawals);
  for (const r of rows) {
    if (!r.synced || onList.has(r.id) || r.dropped) continue;
    // The app says they'd been confirmed (paid) but that never reached us (e.g. confirmed and withdrawn between two
    // pushes): ticked now, so keeping or refunding it can be decided here. A tick the app had sent and someone
    // cleared here stays cleared.
    const w = withdrawalOf(r), prev = prevOf(r);
    const fromApp = (k) => (r[k] || (w?.[k] && prev?.[k] !== true) ? 1 : 0);
    const ticks = { paid: fromApp('paid'), advance_paid: fromApp('advance_paid') };
    db.prepare('UPDATE event_attendees SET paid = ?, advance_paid = ?, dropped = ?, dropped_at = ?, drop_note = ? WHERE id = ?')
      .run(ticks.paid, ticks.advance_paid, ...dropOut(ticks, w), r.id);
    changed = true;
  }
  // Someone the app says pulled out whom we never had.
  for (const w of withdrawals) {
    if (rowOf(w)) continue;
    const [dropped, dropped_at, drop_note] = dropOut(w, w);
    insert(w, { dropped, dropped_at, drop_note });
  }
  return changed;
}

/** How attendee `a` starts out once dropped out: having paid, waiting for a decision here (keep or refund);
 *  having paid nothing, there's nothing to keep ('refunded'). */
export const droppedState = (a) => (a.paid || a.advance_paid ? 'undecided' : 'refunded');
/** [dropped, dropped_at, drop_note] for attendee `a` leaving an app's list (`w`: what the app said about it, if
 *  anything). */
const dropOut = (a, w) => [droppedState(a), w?.date || localDay(), w?.by_admin ? 'Taken off by the app’s admin' : null];

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
