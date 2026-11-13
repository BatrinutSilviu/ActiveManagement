// Events pushed from the community's other apps (padel, hikes).
import express from 'express';
import { timingSafeEqual } from 'node:crypto';
import { tx } from '../db.js';
import { upsertSyncedEvent } from '../domain/eventSync.js';
import { httpError, need } from '../http.js';
import { SOURCES } from '../sync.js';

export const router = express.Router({ caseSensitive: true });

// The padel and hikes apps push every created / changed / deleted tournament or hike here, with the
// shared secret INTEGRATION_TOKEN as a Bearer token. Body: { source: 'padel' | 'hikes', id, deleted?, record }.
// - New: created as a live event (hike drafts too), unless dated before SYNC_FROM.
// - Changed: only the fields whose value changed in that app since the last push are updated, so
//   corrections made here are kept. Finalized events are never changed.
// - Deleted there: cancelled here (never deleted: it may already have costs).
router.post('/integrations/events', (req, res) => {
  const token = process.env.INTEGRATION_TOKEN;
  if (!token) throw httpError(503, 'Integration not configured (INTEGRATION_TOKEN)');
  const given = Buffer.from(String(req.headers.authorization || '').replace(/^Bearer\s+/i, ''));
  const want = Buffer.from(token);
  if (given.length !== want.length || !timingSafeEqual(given, want)) throw httpError(401, 'Wrong integration token');
  const { source, id, deleted, record } = req.body || {};
  need(SOURCES[source], 'Unknown source');
  need(id, 'Missing id');
  res.json(tx(() => upsertSyncedEvent(source, String(id), deleted ? null : record)));
});
