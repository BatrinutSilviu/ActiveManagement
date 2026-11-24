// Organizer accounts (community events): linked to one person in People, they reach only the events that person has a
// task on — and on those, run them: edit the event, its attendees, discounts, stock used, costs and income, and see its
// money. They can create events (and are put on every task of them). They can't finalize or delete an event (they can cancel one), change its
// tasks or points, or touch a finalized one. Everything else is refused.
//
// checkRole (auth.js) calls organizerCheck for every request of an organizer account: deny by default, each allowed
// route listed here with how to find the event it touches.
import { db } from '../db/connection.js';

export const ORGANIZER = 'organizer';

/** The ids of the events this person has a task on. */
export const organizerEventIds = (personId) =>
  db.prepare('SELECT DISTINCT event_id FROM event_tasks WHERE person_id = ?').all(personId ?? -1).map((r) => r.event_id);

const eventOf = {
  attendee: (id) => db.prepare('SELECT event_id FROM event_attendees WHERE id = ?').get(id)?.event_id,
  discount: (id) => db.prepare('SELECT event_id FROM event_discounts WHERE id = ?').get(id)?.event_id,
  stock: (id) => db.prepare('SELECT event_id FROM event_stock WHERE id = ?').get(id)?.event_id,
  tx: (id) => db.prepare('SELECT event_id FROM transactions WHERE id = ?').get(id)?.event_id,
};

// Lists everyone may read (the forms' pick lists), and per-event reads by ?event_id.
const READS = /^\/(event-types|categories|people|discounts|stock|partners|stats\/years|settings\/points-rates|activities|splits\/\d{4}-\d{2})$/;
const BY_EVENT_QUERY = /^\/(transactions|partner-prizes|vouchers)$/;

/**
 * null when the request is allowed, else the message to refuse it with. May adjust req.body (a new event gets the
 * organizer on all its tasks; an edit keeps the event's status).
 */
export function organizerCheck(req) {
  const { method } = req, path = req.path;
  const mine = new Set(organizerEventIds(req.user.person_id));
  const live = (id) => db.prepare("SELECT 1 FROM events WHERE id = ? AND status != 'completed'").get(id);
  const own = (id) => (id && mine.has(Number(id)) ? null : 'This isn’t one of your events');
  const ownLive = (id) => own(id) || (live(id) ? null : 'This event is finalized: only an admin can change it now');
  let m;

  if (method === 'GET' || method === 'HEAD') {
    if (READS.test(path) || path === '/events') return null; // the events list is filtered to theirs (routes/events.js)
    if ((m = path.match(/^\/events\/(\d+)$/))) return own(m[1]);
    if (BY_EVENT_QUERY.test(path)) return own(req.query.event_id);
    return 'Your account can only see your events';
  }
  if (method === 'POST' && path === '/events') {
    if (req.body.copy_from && own(req.body.copy_from)) return own(req.body.copy_from);
    req.body.lead_id = req.user.person_id; // they run it: on every task
    req.body.status = 'planned';
    return req.user.person_id ? null : 'Your account isn’t linked to a person yet';
  }
  if (method === 'PUT' && (m = path.match(/^\/events\/(\d+)$/))) {
    const err = ownLive(m[1]);
    // Finalizing is an admin's: an organizer can only keep it live or cancel it.
    if (!err && !['planned', 'cancelled'].includes(req.body.status)) req.body.status = 'planned';
    return err;
  }
  if ((m = path.match(/^\/events\/(\d+)\/(attendees|discounts|stock)$/)) && method === 'POST') return ownLive(m[1]);
  if ((m = path.match(/^\/event-attendees\/(\d+)$/)) && ['PUT', 'DELETE'].includes(method)) return ownLive(eventOf.attendee(m[1]));
  if ((m = path.match(/^\/event-discounts\/(\d+)$/)) && method === 'DELETE') return ownLive(eventOf.discount(m[1]));
  if ((m = path.match(/^\/event-stock\/(\d+)$/)) && ['PUT', 'DELETE'].includes(method)) return ownLive(eventOf.stock(m[1]));
  // Costs and income of their events only (never a fund's).
  const onlyEvent = () => (req.body.fund_sport_id || req.body.fund_part_id ? 'Only costs and income of your events' : null);
  if (method === 'POST' && path === '/transactions') return ownLive(req.body.event_id) || onlyEvent();
  if ((m = path.match(/^\/transactions\/(\d+)$/))) {
    if (method === 'DELETE') return ownLive(eventOf.tx(m[1]));
    if (method === 'PUT') return ownLive(eventOf.tx(m[1])) || ownLive(req.body.event_id) || onlyEvent();
  }
  return 'Your account can only run your own events';
}
