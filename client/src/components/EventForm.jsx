import { useState } from 'react';
import Modal from './Modal.jsx';
import { api } from '../api.js';
import { useApi } from '../hooks.js';
import { money, today } from '../format.js';

export const STATUS_LABELS = { planned: 'Live', completed: 'Finalized', cancelled: 'Cancelled' };
export const DEFAULT_POINTS = { organizer: 2, 'co-organizer': 1 };

// Create or edit an event. On create, the organizer and co-organizer can be set right away;
// costs, stock and extra organizers are managed on the event page.
export default function EventForm({ event, onClose, onSaved }) {
  const { data: types } = useApi('/event-types');
  const { data: allPeople } = useApi(event ? null : '/people');
  const { data: activities } = useApi('/activities');
  const [f, setF] = useState(() => ({
    name: '', type_id: '', activity_id: '', date: today(), end_date: '', location: '', status: 'planned',
    participants: '', participation_fee: '', venue_fee: '', budget: '', notes: '', ...(event || {}),
  }));
  const [org, setOrg] = useState({ organizer: '', organizerPoints: DEFAULT_POINTS.organizer, co: '', coPoints: DEFAULT_POINTS['co-organizer'] });
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const sportId = f.type_id || types?.[0]?.id;
  // Choosing an activity from the points table fills in the organisers' points.
  const applyActivity = (activityId, next = f) => {
    const a = activities?.find((x) => String(x.id) === String(activityId));
    setF({ ...next, activity_id: activityId });
    if (a && !event) setOrg((o) => ({ ...o, organizerPoints: a.organizer_points, coPoints: a.co_points }));
  };
  // A new event also takes the sport's default prices (e.g. Hyrox: 50 RON, 40 of it to the venue).
  const changeSport = (e) => {
    const match = activities?.find((a) => String(a.sport_id) === e.target.value);
    const sport = types?.find((t) => String(t.id) === e.target.value);
    const prices = !event && sport?.default_fee ? { participation_fee: sport.default_fee, venue_fee: sport.default_venue_fee || '' } : {};
    applyActivity(match ? match.id : '', { ...f, ...prices, type_id: e.target.value });
  };
  const activity = activities?.find((x) => String(x.id) === String(f.activity_id));
  const people = Number(f.participants) || 0, fee = Number(f.participation_fee) || 0, venue = Number(f.venue_fee) || 0;
  const feeIncome = people * fee;
  const active = allPeople?.filter((p) => p.active) || [];

  const save = async () => {
    setSaving(true);
    try {
      const body = { ...f, type_id: sportId };
      if (event) {
        await api.put(`/events/${event.id}`, body);
        onSaved(event.id);
      } else {
        body.people = [
          org.organizer && { person_id: org.organizer, role: 'organizer', points: org.organizerPoints },
          org.co && { person_id: org.co, role: 'co-organizer', points: org.coPoints },
        ].filter(Boolean);
        const r = await api.post('/events', body);
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
        <label className="field">Activity (for points)
          <select value={f.activity_id || ''} onChange={(e) => applyActivity(e.target.value)}>
            <option value="">— not in the points table —</option>
            {activities?.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          {activity && <span className="hint">Organiser {activity.organizer_max ? `${activity.organizer_points}–${activity.organizer_max}` : activity.organizer_points} pts
            {' '}· co-organiser +{activity.co_max ? `${activity.co_points}–${activity.co_max}` : activity.co_points}</span>}
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
        <label className="field">Venue’s part (RON / person)
          <input type="number" min="0" step="0.01" max={fee || undefined} value={f.venue_fee} onChange={set('venue_fee')} placeholder="0" />
          <span className="hint">Paid on to the venue for everyone. Members pay only this.</span>
        </label>
        <div className="full fee-preview">
          Income from fees: <strong>{money(feeIncome)}</strong>
          <span className="muted"> ({people} × {money(fee)})</span>
          {venue > 0 && <> · venue: <strong>−{money(people * venue)}</strong><span className="muted"> ({people} × {money(venue)})</span></>}
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
        {!event && (
          <>
            <div className="full form-section">Organisers <span className="hint">— points decide each organiser’s share of the month’s payout</span></div>
            <label className="field">Main organiser
              <select value={org.organizer} onChange={(e) => setOrg({ ...org, organizer: e.target.value })}>
                <option value="">— none —</option>
                {active.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </label>
            <label className="field">Organiser points
              <input type="number" min="0" step="0.5" value={org.organizerPoints} onChange={(e) => setOrg({ ...org, organizerPoints: e.target.value })} />
            </label>
            <label className="field">Co-organiser
              <select value={org.co} onChange={(e) => setOrg({ ...org, co: e.target.value })}>
                <option value="">— none —</option>
                {active.filter((p) => String(p.id) !== String(org.organizer)).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </label>
            <label className="field">Co-organiser points
              <input type="number" min="0" step="0.5" value={org.coPoints} onChange={(e) => setOrg({ ...org, coPoints: e.target.value })} />
            </label>
            {allPeople && !active.length && <p className="hint full">Add people in Settings → People to pick organisers.</p>}
          </>
        )}
        <label className="field full">Notes
          <textarea value={f.notes || ''} onChange={set('notes')} placeholder="Logistics, contacts, reminders…" />
        </label>
      </div>
      {!event && <p className="hint" style={{ margin: 0 }}>The event starts as <b>Live</b>. Add costs and products from stock on its page, then finalize it.</p>}
    </Modal>
  );
}
