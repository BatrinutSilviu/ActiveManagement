// People is only the team (founders and the organisers we add). Others — voucher winners, attendees,
// people given a discount — are kept by name on those rows, linked to a person only when they are one of us.
import { db } from '../db/connection.js';
import { need } from '../http.js';

/** Who a row is about: the person picked (body.person_id), or a typed name, linked to People when it matches someone there. */
export function whoIs(body, missing = 'Enter a name') {
  const picked = Number(body.person_id) ? db.prepare('SELECT id, name FROM people WHERE id = ?').get(Number(body.person_id)) : null;
  if (picked) return { person_id: picked.id, name: picked.name };
  const name = String(body.name ?? '').trim().replace(/\s+/g, ' ');
  need(name, missing);
  need(name.length <= 120, 'That name is too long');
  const known = db.prepare('SELECT id, name FROM people WHERE name = ? COLLATE NOCASE').get(name);
  return known ? { person_id: known.id, name: known.name } : { person_id: null, name };
}
