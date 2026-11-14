// The community's public calendar (no sign-in): the upcoming events the other apps pushed here and
// listed publicly — padel tournaments, hikes, via ferratas and general events — with their sign-up link.
// Read by the presentation site (activetimisoara.ro) to fill its calendar. Only what a visitor of those
// apps can already see is shared: no money, participants or notes.
import express from 'express';
import { db } from '../db.js';
import { today } from '../http.js';

export const router = express.Router({ caseSensitive: true });

const DAYS_AHEAD = 120;
const MAX_AGE = 300; // seconds browsers and the site may cache it

router.get('/public/calendar', (req, res) => {
  const from = today();
  const until = new Date(Date.parse(`${from}T00:00:00Z`) + DAYS_AHEAD * 86_400_000).toISOString().slice(0, 10);
  const rows = db.prepare(`
    SELECT e.id, e.name, t.name AS sport, e.date, e.end_date, e.start_time, e.end_time, e.location, e.source, e.external_url
    FROM events e JOIN event_types t ON t.id = e.type_id
    WHERE e.source IS NOT NULL AND e.external_url IS NOT NULL AND e.status = 'planned'
      AND json_extract(e.sync_data, '$.listed') = 1
      AND COALESCE(e.end_date, e.date) >= ? AND e.date <= ?
    ORDER BY e.date, e.start_time, e.name`).all(from, until);
  res.set({
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': `public, max-age=${MAX_AGE}`,
  });
  res.json({
    generatedAt: new Date().toISOString(),
    events: rows.map((r) => ({
      id: `${r.source}-${r.id}`,
      name: r.name,
      sport: r.sport,
      source: r.source,
      date: r.date,
      endDate: r.end_date,
      startTime: r.start_time,
      endTime: r.end_time,
      location: r.location,
      url: r.external_url,
    })),
  });
});

// The community's event types (sports, and kinds of event that aren't one, like Social), managed on the
// Sports page here. This app is their source of truth: the hikes app offers them when an event is created,
// and pushed events are filed under them by name (see eventType in domain/eventSync.js).
router.get('/public/event-types', (req, res) => {
  const rows = db.prepare('SELECT name, is_sport FROM event_types ORDER BY name').all();
  res.set({
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': `public, max-age=${MAX_AGE}`,
  });
  res.json({ eventTypes: rows.map((r) => ({ name: r.name, isSport: !!r.is_sport })) });
});
