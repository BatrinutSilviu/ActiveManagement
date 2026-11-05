// Events created in the community's other apps are pushed here (POST /api/integrations/events) and
// become events in this app: padel tournaments from padel.activetimisoara.ro, hikes and via ferratas
// from hikes.activetimisoara.ro. Each app sends its own record as it is; this file turns it into the
// fields of an event. See upsertSyncedEvent in index.js for how they're applied.

// Events dated before this aren't created (older ones were imported from the spreadsheet).
export const SYNC_FROM = process.env.SYNC_FROM || '2026-11-04';

const day = (v) => (v ? String(typeof v === 'string' ? v : new Date(v).toISOString()).slice(0, 10) : null);
const num = (v) => (v == null || v === '' ? 0 : Number(v) || 0);
const lines = (...l) => l.filter(Boolean).join('\n');

const PADEL_TYPES = {
  AMERICANO: 'Americano', AMERICANO_CHAMPIONS: 'Americano Champions', AMERICANO_GIRLS: 'Americano Girls',
  CHALLENGER: 'Challenger', TEAM_AMERICANO: 'Team Americano', KING_OF_THE_COURT: 'King of the Court', MASTERS: 'Masters',
};
const PADEL_LEVELS = { 1: 'Elite', 2: 'Premier', 3: 'Gold', 4: 'Silver', 5: 'Bronze', 6: 'Beginner', 7: 'Girls' };

/**
 * A padel tournament (padel app's Tournament + confirmedCount + url). Every tournament type counts.
 * Price = its entry fee per person; there's no location or time in the padel app.
 */
export function mapPadel(t) {
  const type = PADEL_TYPES[t.type] || t.type;
  const level = PADEL_LEVELS[t.division] || (t.division ? `Division ${t.division}` : null);
  return {
    name: t.name,
    sport: 'Padel',
    activity: null, // the sport's usual kind of event
    date: day(t.date),
    end_date: null,
    location: null,
    participants: num(t.confirmedCount),
    participation_fee: num(t.entryFee),
    venue_fee: null, // not known in the padel app: set on the event here
    status: 'planned',
    notes: lines(
      `${type}${level ? ` · ${level}` : ''}`,
      t.maxPlayers ? `Up to ${t.maxPlayers} players` : null,
      t.advanceFee ? `Advance: ${t.advanceFee} RON per person` : null,
    ),
  };
}

/**
 * A hike or via ferrata (hikes app's Hike + confirmedCount + url). Drafts are synced too. Its notes aren't
 * taken (they're for participants); notes typed here are kept.
 * Hike price = entry fee, plus accommodation when there is one (the accommodation is the venue's part).
 * Via ferrata: the hikes app keeps its total price in accommodationPrice.
 */
export function mapHike(h) {
  const via = h.type === 'via_ferrata';
  const lodging = !via && h.hasAccommodation ? num(h.accommodationPrice) : 0;
  const price = via ? num(h.accommodationPrice) || num(h.entryFee) : num(h.entryFee) + lodging;
  const end = via ? null : day(h.endDate);
  const multiDay = end && end > day(h.date);
  return {
    name: h.title,
    sport: 'Hiking',
    activity: via ? 'Via ferrata' : multiDay || h.hasAccommodation ? 'Weekend at a cabin + hike' : 'Day hike',
    date: day(h.date),
    end_date: multiDay ? end : null,
    location: [...new Set([h.destination, h.mountainRange].filter(Boolean))].join(', ') || null,
    participants: num(h.confirmedCount),
    participation_fee: price,
    venue_fee: lodging || null,
    status: h.status === 'cancelled' ? 'cancelled' : 'planned',
    // No notes: a hike's details and description are written for its participants, not for this app.
  };
}

export const SOURCES = {
  padel: { label: 'Padel app', map: mapPadel },
  hikes: { label: 'Hikes app', map: mapHike },
};

// The fields a source owns. A field is overwritten only when the source's value for it changed since
// the last push, so whatever was corrected by hand here (e.g. the venue part, notes) is kept otherwise.
export const SYNCED_FIELDS = ['name', 'date', 'end_date', 'location', 'participants', 'participation_fee', 'venue_fee', 'notes', 'status'];
