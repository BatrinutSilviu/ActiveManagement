import { useState } from 'react';
import Modal from './Modal.jsx';
import { api } from '../api.js';
import { useApi } from '../hooks.js';
import { money, number, today } from '../format.js';

export const STATUS_LABELS = { planned: 'Live', completed: 'Finalized', cancelled: 'Cancelled' };

// Create or edit an event and its points; who did which task, costs and stock are managed on the event page.
// Price per person = venue part + community part. Fill in the two parts and the total follows, or fill in
// the total and the community part follows (total − venue part). Only the total and the venue part are
// stored; the community part is what's left. With a fixed venue, the venue part is the venue total ÷ people.
const r2 = (v) => Math.round(v * 100) / 100;
function venueShare(next) {
  const n = Number(next.participants) || 0, total = Number(next.venue_total) || 0;
  return n && total ? String(r2(total / n)) : '';
}
/** Re-derives the linked prices; `from` is 'parts' (venue + community → total) or 'total' (total − venue → community). */
function linkPrices(next, from, autoShare) {
  const out = { ...next };
  if (out.venue_mode === 'fixed' && autoShare && venueShare(out)) out.venue_fee = venueShare(out);
  const venue = Number(out.venue_fee) || 0;
  if (from === 'parts') {
    out.participation_fee = out.venue_fee === '' && out.community === '' ? '' : String(r2(venue + (Number(out.community) || 0)));
  } else {
    out.community = out.participation_fee === '' ? '' : String(r2((Number(out.participation_fee) || 0) - venue));
  }
  return out;
}

export default function EventForm({ event, onClose, onSaved }) {
  const { data: types } = useApi('/event-types');
  const { data: allPeople } = useApi('/people');
  const { data: rates } = useApi('/settings/points-rates');
  const { data: activities } = useApi('/activities');
  const [f, setF] = useState(() => linkPrices({
    name: '', type_id: '', activity_id: '', date: today(), end_date: '', location: '', status: 'planned',
    participants: '', participation_fee: '', venue_fee: '', venue_mode: 'per_person', training: 0, venue_total: '', budget: '', notes: '', community: '', ...(event || {}),
    ...(event?.price_parts ? { community: String(event.community_fee) } : {}),
  }, event?.price_parts ? 'parts' : 'total', true));
  // Which side was typed last: the two parts (stored as such: fees = venue total + community part × people,
  // exact even when the venue doesn't divide evenly), or the total price.
  const [from, setFrom] = useState(event?.price_parts ? 'parts' : 'total');
  // A new event can start with one organiser on every task; tasks are changed on the event page.
  const [lead, setLead] = useState('');
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  // With a fixed venue the per-person part follows people / total / price, until it's typed by hand.
  const share = venueShare;
  // Calculated unless typed by hand in this form (opening an event shows the calculated value again).
  const [shareTouched, setShareTouched] = useState(false);
  const set = (k) => (e) => {
    const next = { ...f, [k]: e.target.value };
    let side = from, auto = !shareTouched;
    if (k === 'community') side = 'parts';
    if (k === 'participation_fee') side = 'total';
    if (k === 'venue_fee') auto = false;
    if (k === 'venue_fee' && next.venue_mode === 'fixed') setShareTouched(true);
    setFrom(side);
    setF(['community', 'participation_fee', 'venue_fee', 'participants', 'venue_total', 'venue_mode'].includes(k) ? linkPrices(next, side, auto) : next);
  };
  const sportId = f.type_id || types?.[0]?.id;
  // Choosing a sport takes its default prices (e.g. Hyrox: 50 RON, 40 of it to the venue) and its usual kind of event.
  const changeSport = (e) => {
    const sport = types?.find((t) => String(t.id) === e.target.value);
    const prices = sport?.default_fee ? { participation_fee: sport.default_fee, venue_fee: sport.default_venue_fee || '' } : {};
    const usual = activities?.find((a) => String(a.sport_id) === e.target.value);
    const next = { ...f, ...prices, type_id: e.target.value, activity_id: usual ? usual.id : f.activity_id };
    if (sport?.default_fee) setFrom('total');
    setF(linkPrices(next, sport?.default_fee ? 'total' : from, !shareTouched));
  };
  // Points for the time the event takes come from its kind of event; the profit adds more once costs are in.
  const factor = types?.find((t) => String(t.id) === String(sportId))?.points_factor ?? 1;
  const activity = activities?.find((a) => String(a.id) === String(f.activity_id));
  const timePoints = (activity?.organizer_points || 0) * factor;
  const people = Number(f.participants) || 0, fee = Number(f.participation_fee) || 0, venue = Number(f.venue_fee) || 0;
  const feeIncome = people * fee;
  const fixedVenue = f.venue_mode === 'fixed';
  const venueCost = fixedVenue ? Number(f.venue_total) || 0 : people * venue;
  const active = allPeople?.filter((p) => p.active) || [];

  const save = async () => {
    setSaving(true);
    try {
      // Members never pay more than the price (nothing for a free event).
      const { community, ...rest } = f;
      const body = { ...rest, type_id: sportId, venue_fee: Math.min(Number(f.venue_fee) || 0, Number(f.participation_fee) || 0),
        price_parts: from === 'parts', community_fee: Number(community) || 0 };
      if (event) {
        await api.put(`/events/${event.id}`, body);
        onSaved(event.id);
      } else {
        const r = await api.post('/events', { ...body, lead_id: lead || null });
        onSaved(r.id);
      }
    } catch (e) {
      setError(e.message);
      setSaving(false);
    }
  };

  return (
    <Modal title={event ? 'Edit event' : 'New event'} onClose={onClose} onSubmit={save}
      footer={<>
        <button type="button" className="btn" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" disabled={saving}>{event ? 'Save changes' : 'Create event'}</button>
      </>}>
      {error && <div className="error-box">{error}</div>}
      <div className="form-grid">
        <label className="field full">Event name
          <input value={f.name} onChange={set('name')} placeholder="e.g. Saturday padel meetup" autoFocus required />
        </label>
        <label className="field">Sport
          <select value={sportId || ''} onChange={changeSport}>
            {types?.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </label>
        <label className="field">Date
          <input type="date" value={f.date} onChange={set('date')} required />
          <span className="hint">The event counts in this month’s statistics</span>
        </label>
        <label className="field full check-field">
          <input type="checkbox" checked={!!f.training} onChange={(e) => setF({ ...f, training: e.target.checked ? 1 : 0 })} />
          <span>Training session <span className="hint">— run by the community; % off vouchers of this sport can be used here, paid from its fund</span></span>
        </label>
        <label className="field">Venue cost
          <select value={f.venue_mode} onChange={set('venue_mode')}>
            <option value="per_person">Per participant</option>
            <option value="fixed">Fixed total for the event</option>
          </select>
          <span className="hint">{fixedVenue ? 'The same amount however many people come' : 'Paid on to the venue for each participant'}</span>
        </label>
        {fixedVenue ? (
          <label className="field">Venue total (RON)
            <input type="number" min="0" step="0.01" value={f.venue_total} onChange={set('venue_total')} placeholder="0" />
            <span className="hint">Or leave 0 and add the venue as a cost on the event page</span>
          </label>
        ) : <div className="hide-sm" />}
        <label className="field">Number of people
          <input type="number" min="0" value={f.participants} onChange={set('participants')} placeholder="0" />
        </label>
        <div className="full price-parts">
          <span className="form-section" style={{ margin: 0 }}>Price per person <span className="hint">— fill in the two parts, or the total</span></span>
          <div className="price-grid">
            <label className="field">{fixedVenue ? 'Venue part' : 'Venue part'} (RON)
              <input type="number" min="0" step="0.01" value={f.venue_fee} onChange={set('venue_fee')} placeholder="0" />
              <span className="hint">{fixedVenue
                ? (shareTouched
                  ? <>Set by hand{share(f) && share(f) !== String(f.venue_fee) ? <> · <button type="button" className="link-btn" onClick={() => { setShareTouched(false); setF(linkPrices({ ...f, venue_fee: share(f) }, from, true)); }}>use {money(Number(share(f)))}</button></> : null}</>
                  : people && Number(f.venue_total) ? `${money(Number(f.venue_total))} ÷ ${people} people` : 'Venue total ÷ people')
                : 'Paid on to the venue · members pay only this'}</span>
            </label>
            <span className="price-op" aria-hidden="true">+</span>
            <label className="field">Community part (RON)
              <input type="number" step="0.01" value={f.community} onChange={set('community')} placeholder="0" />
              <span className={`hint ${Number(f.community) < 0 ? 'neg' : ''}`}>{Number(f.community) < 0 ? 'Less than the venue part — the price doesn’t cover it' : 'What the community keeps'}</span>
            </label>
            <span className="price-op" aria-hidden="true">=</span>
            <label className="field">Total price (RON)
              <input type="number" min="0" step="0.01" value={f.participation_fee} onChange={set('participation_fee')} placeholder="0" />
              <span className="hint">{from === 'parts'
                ? (fixedVenue ? 'Venue part + community part · the profit counts the community part × people exactly' : 'Venue part + community part')
                : 'What each person pays'}</span>
            </label>
          </div>
        </div>
        <div className="full fee-preview">
          Income from fees: <strong>{money(feeIncome)}</strong>
          <span className="muted"> ({people} × {money(fee)})</span>
          {venueCost > 0 && <> · venue: <strong>−{money(venueCost)}</strong><span className="muted">{fixedVenue ? ' (fixed)' : ` (${people} × ${money(venue)})`}</span></>}
          <span className="muted">{event?.discounts || event?.member_discounts
            ? ` · − ${money(event.discounts + event.member_discounts)} discounts & member prices`
            : ' · members and discounts are added on the event page'}</span>
        </div>
        <label className="field">Location
          <input value={f.location || ''} onChange={set('location')} placeholder="Venue" />
        </label>
        <label className="field">Budget for costs (optional)
          <input type="number" min="0" step="0.01" value={f.budget} onChange={set('budget')} placeholder="0" />
        </label>
        {event && (
          <label className="field">Status
            <select value={f.status} onChange={set('status')}>
              {Object.entries(STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
        )}
        {event && (
          <label className="field">End date <span className="hint">(multi-day events)</span>
            <input type="date" value={f.end_date || ''} min={f.date} onChange={set('end_date')} />
          </label>
        )}
        <div className="full form-section">Points <span className="hint">— shared between the event’s tasks</span></div>
        <label className="field full">Kind of event
          <select value={f.activity_id || ''} onChange={set('activity_id')}>
            <option value="">— not in the points table —</option>
            {activities?.map((a) => <option key={a.id} value={a.id}>{a.name} · {number(a.organizer_points)} pts</option>)}
          </select>
          <span className="hint">Its points (from the points table in Settings) are what the time it takes is worth</span>
        </label>
        {rates && <p className="hint full" style={{ margin: 0 }}>{number(Math.round(timePoints * 100) / 100)} points for the time
          {rates.moneyStep > 0 && rates.moneyPoints > 0 ? ` + ${number(rates.moneyPoints * factor)} per ${number(rates.moneyStep)} RON of profit` : ''}{factor !== 1 ? ` (× ${number(factor)} for this kind of event)` : ''}{event?.points_manual ? ' · this event’s points are set by hand on its page' : ''}</p>}
        {!event && (
          <label className="field">Organiser
            <select value={lead} onChange={(e) => setLead(e.target.value)}>
              <option value="">— none yet —</option>
              {active.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <span className="hint">Put on every task; change who did what on the event page</span>
          </label>
        )}
        {!event && allPeople && !active.length && <p className="hint full">Add people in Settings → People to pick organisers.</p>}
        <label className="field full">Notes
          <textarea value={f.notes || ''} onChange={set('notes')} placeholder="Logistics, contacts, reminders…" />
        </label>
      </div>
      {!event && <p className="hint" style={{ margin: 0 }}>The event starts as <b>Live</b>. Add costs and products from stock on its page, then finalize it.</p>}
    </Modal>
  );
}
