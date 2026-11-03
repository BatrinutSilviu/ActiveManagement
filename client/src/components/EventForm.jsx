import { useState } from 'react';
import Modal from './Modal.jsx';
import { api } from '../api.js';
import { useApi } from '../hooks.js';
import { money, number, today } from '../format.js';

export const STATUS_LABELS = { planned: 'Live', completed: 'Finalized', cancelled: 'Cancelled' };

// Create or edit an event and its points; who did which task, costs and stock are managed on the event page.
export default function EventForm({ event, onClose, onSaved }) {
  const { data: types } = useApi('/event-types');
  const { data: allPeople } = useApi('/people');
  const { data: rates } = useApi('/settings/points-rates');
  const [f, setF] = useState(() => ({
    name: '', type_id: '', activity_id: '', date: today(), end_date: '', location: '', status: 'planned',
    participants: '', participation_fee: '', venue_fee: '', venue_mode: 'per_person', venue_total: '', budget: '', notes: '', ...(event || {}),
    hours_before: event?.hours_before || '', hours_during: event?.hours_during || '', hours_after: event?.hours_after || '',
  }));
  // A new event can start with one organiser on every task; tasks are changed on the event page.
  const [lead, setLead] = useState('');
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const sportId = f.type_id || types?.[0]?.id;
  // Choosing a sport takes its default prices (e.g. Hyrox: 50 RON, 40 of it to the venue).
  const changeSport = (e) => {
    const sport = types?.find((t) => String(t.id) === e.target.value);
    const prices = sport?.default_fee ? { participation_fee: sport.default_fee, venue_fee: sport.default_venue_fee || '' } : {};
    setF({ ...f, ...prices, type_id: e.target.value });
  };
  // Points for the time spent; the profit adds more once the event's costs are in.
  const timePoints = rates ? (Number(f.hours_before) || 0) * rates.before + (Number(f.hours_during) || 0) * rates.during
    + (Number(f.hours_after) || 0) * rates.after : 0;
  const people = Number(f.participants) || 0, fee = Number(f.participation_fee) || 0, venue = Number(f.venue_fee) || 0;
  const feeIncome = people * fee;
  const fixedVenue = f.venue_mode === 'fixed';
  const venueCost = fixedVenue ? Number(f.venue_total) || 0 : people * venue;
  const active = allPeople?.filter((p) => p.active) || [];

  const save = async () => {
    setSaving(true);
    try {
      const body = { ...f, type_id: sportId };
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
        <label className="field">Number of people
          <input type="number" min="0" value={f.participants} onChange={set('participants')} placeholder="0" />
        </label>
        <label className="field">Price (RON / person)
          <input type="number" min="0" step="0.01" value={f.participation_fee} onChange={set('participation_fee')} placeholder="0" />
        </label>
        <label className="field">Venue cost
          <select value={f.venue_mode} onChange={set('venue_mode')}>
            <option value="per_person">Per participant</option>
            <option value="fixed">Fixed total for the event</option>
          </select>
          <span className="hint">{fixedVenue ? 'The same amount however many people come' : 'Paid on to the venue for each participant'}</span>
        </label>
        {fixedVenue && (
          <label className="field">Venue total (RON)
            <input type="number" min="0" step="0.01" value={f.venue_total} onChange={set('venue_total')} placeholder="0" />
            <span className="hint">Or leave 0 and add the venue as a cost on the event page</span>
          </label>
        )}
        <label className="field">{fixedVenue ? 'Members pay (RON / person)' : 'Venue’s part (RON / person)'}
          <input type="number" min="0" step="0.01" max={fee || undefined} value={f.venue_fee} onChange={set('venue_fee')} placeholder="0" />
          <span className="hint">{fixedVenue ? 'Optional member price; doesn’t change the venue cost' : 'Members pay only this.'}</span>
        </label>
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
        <div className="full form-section">Time spent <span className="hint">— with the profit, it sets the event’s points, shared between its tasks</span></div>
        <div className="full hours-grid">
          <label className="field">Hours before<input type="number" min="0" step="0.5" value={f.hours_before} onChange={set('hours_before')} placeholder="0" /><span className="hint">Preparing</span></label>
          <label className="field">Hours during<input type="number" min="0" step="0.5" value={f.hours_during} onChange={set('hours_during')} placeholder="0" /><span className="hint">The event itself</span></label>
          <label className="field">Hours after<input type="number" min="0" step="0.5" value={f.hours_after} onChange={set('hours_after')} placeholder="0" /><span className="hint">Wrapping up</span></label>
        </div>
        {rates && <p className="hint full" style={{ margin: 0 }}>{number(Math.round(timePoints * 100) / 100)} points for time
          {rates.moneyStep > 0 && rates.moneyPoints > 0 ? ` + ${number(rates.moneyPoints)} per ${number(rates.moneyStep)} RON of profit` : ''}{event?.points_manual ? ' · this event’s points are set by hand on its page' : ''}</p>}
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
