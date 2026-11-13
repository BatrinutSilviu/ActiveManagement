// Optimistic concurrency for the edit forms of events and transactions (see the version triggers in db/schema.js).
import { db } from '../db/connection.js';
import { httpError } from '../http.js';

// The form was opened before someone else changed this record: refuse, rather than write its old values back
// over their change. Only when the form says which version it had (see events.version in db.js).
export function checkVersion(table, id, body, what) {
  if (body.version == null || body.version === '') return;
  const row = db.prepare(`SELECT version FROM ${table} WHERE id = ?`).get(id);
  if (!row) throw httpError(404, `This ${what} no longer exists`);
  if (row.version !== Number(body.version))
    throw httpError(409, `Someone else changed this ${what} after you opened it, so it wasn't saved. Close this form and open it again `
      + 'to see the current values, then make your change again.');
}
