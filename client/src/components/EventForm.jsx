import { r2 } from '../util.js';
import { useState } from 'react';
import Modal from './Modal.jsx';
import { api } from '../api.js';
import { useApi, usePermissions } from '../hooks.js';
import { useBusiness } from '../business.js';
import { CURRENCY, money, number, today } from '../format.js';
import Select from './Select.jsx';
import { t, tn } from '../i18n/index.js';

// Getters, so the labels follow the language wherever they're read (StatusBadge too).
export const STATUS_LABELS = {
  get planned() { return t('Live'); }, get completed() { return t('Finalized'); }, get cancelled() { return t('Cancelled'); },
};

// Create or edit an event and its points; who did which task, costs and stock are managed on the event page.
// Price per person = venue part + community part. Fill in the two parts and the total follows, or fill in
// the total and the community part follows (total − venue part). Only the total and the venue part are
// stored; the community part is what's left. With a fixed venue, the venue part is the venue total ÷ people.
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

// `copyOf`: start a new event from an existing one's setup (new date, no people yet); `copyCosts` = how many
// cost / income lines it has that can be copied along.
export default function EventForm({ event, copyOf, copyCosts = 0, onClose, onSaved }) {
  const src = event || (copyOf && { ...copyOf, date: today(), end_date: '', status: 'planned', participants: '' });
  const { data: types } = useApi('/event-types');
  const { data: allPeople } = useApi('/people');
  const { data: rates } = useApi('/settings/points-rates');
  const { on } = useBusiness();
  const { data: activities } = useApi(on('payouts') ? '/activities' : null);
  const [f, setF] = useState(() => linkPrices({
    name: '', type_id: '', activity_id: '', date: today(), end_date: '', location: '', status: 'planned',
    start_time: '', end_time: '', participants: '', participation_fee: '', venue_fee: '', advance_fee: '', venue_mode: 'per_person', training: 0, venue_total: '', budget: '', notes: '', community: '', ...(src || {}),
    ...(src?.price_parts ? { community: String(src.community_fee) } : {}),
  }, src?.price_parts ? 'parts' : 'total', true));
  // Which side was typed last: the two parts (stored as such: fees = venue total + community part × people,
  // exact even when the venue doesn't divide evenly), or the total price.
  const [from, setFrom] = useState(src?.price_parts ? 'parts' : 'total');
  const [withCosts, setWithCosts] = useState(false);
  // A new event can start with one organiser on every task; tasks are changed on the event page.
  const [lead, setLead] = useState('');
  const { isOrganizer } = usePermissions();
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
    const sport = types?.find((x) => String(x.id) === e.target.value);
    const prices = sport?.default_fee ? { participation_fee: sport.default_fee, venue_fee: sport.default_venue_fee || '' } : {};
    const usual = activities?.find((a) => String(a.sport_id) === e.target.value);
    const next = { ...f, ...prices, type_id: e.target.value, activity_id: usual ? usual.id : f.activity_id };
    if (sport?.default_fee) setFrom('total');
    setF(linkPrices(next, sport?.default_fee ? 'total' : from, !shareTouched));
  };
  // Points for the time the event takes come from its kind of event; the profit adds more once costs are in.
  const factor = types?.find((x) => String(x.id) === String(sportId))?.points_factor ?? 1;
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
      const body = { ...rest, advance_fee: Number(f.advance_fee) || 0, type_id: sportId, venue_fee: Math.min(Number(f.venue_fee) || 0, Number(f.participation_fee) || 0),
        price_parts: from === 'parts', community_fee: Number(community) || 0 };
      if (event) {
        await api.put(`/events/${event.id}`, body);
        onSaved(event.id);
      } else {
        const r = await api.post('/events', { ...body, lead_id: lead || null, ...(copyOf ? { copy_from: copyOf.id, copy_costs: withCosts } : {}) });
        onSaved(r.id);
      }
    } catch (e) {
      setError(e.message);
      setSaving(false);
    }
  };

  return (
    <Modal title={t(event ? 'Edit event' : copyOf ? 'Duplicate event' : 'New event')} onClose={onClose} onSubmit={save}
      footer={<>
        <button type="button" className="btn" onClick={onClose}>{t('Cancel')}</button>
        <button className="btn btn-primary" disabled={saving}>{t(event ? 'Save changes' : copyOf ? 'Create copy' : 'Create event')}</button>
      </>}>
      {error && <div className="error-box">{error}</div>}
      {copyOf && <p className="hint" style={{ margin: 0 }}>{t('A new event with the setup of “{name}” — pick its date. People, attendees, discounts and stock start empty.', { name: copyOf.name })}</p>}
      <div className="form-grid">
        <label className="field full">{t('Event name')}
          <input value={f.name} onChange={set('name')} placeholder={t('e.g. Saturday padel meetup')} autoFocus required />
        </label>
        <label className="field">{t('Sport')}
          <Select value={sportId || ''} onChange={changeSport}>
            {types?.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </Select>
        </label>
        <label className="field">{t('Date')}
          <input type="date" value={f.date} onChange={set('date')} required />
          <span className="hint">{t('The event counts in this month’s statistics')}</span>
        </label>
        <label className="field">{t('Venue cost')}
          <Select value={f.venue_mode} onChange={set('venue_mode')}>
            <option value="per_person">{t('Per participant')}</option>
            <option value="fixed">{t('Fixed total for the event')}</option>
          </Select>
          <span className="hint">{t(fixedVenue ? 'The same amount however many people come' : 'Paid on to the venue for each participant')}</span>
        </label>
        {fixedVenue ? (
          <label className="field">{t('Venue total')} ({CURRENCY})
            <input type="number" min="0" step="0.01" value={f.venue_total} onChange={set('venue_total')} placeholder="0" />
            <span className="hint">{t('Or leave 0 and add the venue as a cost on the event page')}</span>
          </label>
        ) : <div className="hide-sm" />}
        <label className="field">{t('Number of people')}
          <input type="number" min="0" value={f.participants} onChange={set('participants')} placeholder="0" />
        </label>
        <div className="full price-parts">
          <span className="form-section" style={{ margin: 0 }}>{t('Price per person')} <span className="hint">— {t('fill in the two parts, or the total')}</span></span>
          <div className="price-grid">
            <label className="field">{t('Venue part')} ({CURRENCY})
              <input type="number" min="0" step="0.01" value={f.venue_fee} onChange={set('venue_fee')} placeholder="0" />
              <span className="hint">{fixedVenue
                ? (shareTouched
                  ? <>{t('Set by hand')}{share(f) && share(f) !== String(f.venue_fee) ? <> · <button type="button" className="link-btn" onClick={() => { setShareTouched(false); setF(linkPrices({ ...f, venue_fee: share(f) }, from, true)); }}>{t('use {amount}', { amount: money(Number(share(f))) })}</button></> : null}</>
                  : people && Number(f.venue_total) ? t('{total} ÷ {n} people', { total: money(Number(f.venue_total)), n: people }) : t('Venue total ÷ people'))
                : t('Paid on to the venue · members pay only this')}</span>
            </label>
            <span className="price-op" aria-hidden="true">+</span>
            <label className="field">{t('Community part')} ({CURRENCY})
              <input type="number" step="0.01" value={f.community} onChange={set('community')} placeholder="0" />
              <span className={`hint ${Number(f.community) < 0 ? 'neg' : ''}`}>{t(Number(f.community) < 0 ? 'Less than the venue part — the price doesn’t cover it' : 'What the community keeps')}</span>
            </label>
            <span className="price-op" aria-hidden="true">=</span>
            <label className="field">{t('Total price')} ({CURRENCY})
              <input type="number" min="0" step="0.01" value={f.participation_fee} onChange={set('participation_fee')} placeholder="0" />
              <span className="hint">{from === 'parts'
                ? t(fixedVenue ? 'Venue part + community part · the profit counts the community part × people exactly' : 'Venue part + community part')
                : t('What each person pays')}</span>
            </label>
          </div>
        </div>
        <label className="field">{t('Advance per person')} ({CURRENCY})
          <input type="number" min="0" step="0.01" value={f.advance_fee || ''} onChange={set('advance_fee')} placeholder="0" />
          <span className="hint">{t('Paid to hold a place, part of the price · 0 = none')}</span>
        </label>
        <div className="hide-sm" />
        <div className="full fee-preview">
          {t('Income from fees:')} <strong>{money(feeIncome)}</strong>
          <span className="muted"> ({people} × {money(fee)})</span>
          {venueCost > 0 && <> · {t('venue:')} <strong>−{money(venueCost)}</strong><span className="muted">{fixedVenue ? ` (${t('fixed')})` : ` (${people} × ${money(venue)})`}</span></>}
          <span className="muted">{event?.member_discounts || event?.fund_paid
            ? `${event.member_discounts ? ` · − ${t('{amount} let off to people paying only the venue', { amount: money(event.member_discounts) })}` : ''}${event.fund_paid ? ` · ${t('{amount} discounts paid by the general fund', { amount: money(event.fund_paid) })}` : ''}`
            : ` · ${t('members and discounts are added on the event page')}`}</span>
        </div>
        <label className="field">{t('Starts at')} <span className="hint">{t('(optional)')}</span>
          <input type="time" value={f.start_time || ''} onChange={set('start_time')} />
        </label>
        <label className="field">{t('Ends at')} <span className="hint">{t('(optional)')}</span>
          <input type="time" value={f.end_time || ''} onChange={set('end_time')} />
        </label>
        <label className="field">{t('Location')}
          <input value={f.location || ''} onChange={set('location')} placeholder={t('Venue')} />
        </label>
        <label className="field">{t('Budget for costs (optional)')}
          <input type="number" min="0" step="0.01" value={f.budget} onChange={set('budget')} placeholder="0" />
        </label>
        {event && (
          <label className="field">{t('Status')}
            <Select value={f.status} onChange={set('status')}>
              {Object.entries(STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </Select>
          </label>
        )}
        {event && (
          <label className="field">{t('End date')} <span className="hint">{t('(multi-day events)')}</span>
            <input type="date" value={f.end_date || ''} min={f.date} onChange={set('end_date')} />
          </label>
        )}
        {on('payouts') && <>
        <div className="full form-section">{t('Points')} <span className="hint">— {t('shared between the event’s tasks')}</span></div>
        <label className="field full">{t('Kind of event')}
          <Select value={f.activity_id || ''} onChange={set('activity_id')}>
            <option value="">— {t('not in the points table')} —</option>
            {activities?.map((a) => <option key={a.id} value={a.id}>{a.name} · {t('{n} pts', { n: number(a.organizer_points) })}</option>)}
          </Select>
          <span className="hint">{t('Its points (from the points table in Settings) are what the time it takes is worth')}</span>
        </label>
        {rates && <p className="hint full" style={{ margin: 0 }}>{t('{n} points for the time', { n: number(Math.round(timePoints * 100) / 100) })}
          {rates.moneyStep > 0 && rates.moneyPoints > 0 ? ` + ${t('{n} per {step} {currency} of profit', { n: number(rates.moneyPoints * factor), step: number(rates.moneyStep), currency: CURRENCY })}` : ''}{factor !== 1 ? ` (${t('× {n} for this kind of event', { n: number(factor) })})` : ''}{event?.points_manual ? ` · ${t('this event’s points are set by hand on its page')}` : ''}</p>}
        {/* An organizer's own events always have them on every task (the server sees to it). */}
        {!event && !isOrganizer && (
          <label className="field">{t('Organiser')}
            <Select value={lead} onChange={(e) => setLead(e.target.value)}>
              <option value="">— {t('none yet')} —</option>
              {active.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
            <span className="hint">{t('Put on every task; change who did what on the event page')}</span>
          </label>
        )}
        {!event && !isOrganizer && allPeople && !active.length && <p className="hint full">{t('Add people in Settings → People to pick organisers.')}</p>}
        </>}
        <label className="field full">{t('Notes')}
          <textarea value={f.notes || ''} onChange={set('notes')} placeholder={t('Logistics, contacts, reminders…')} />
        </label>
        {copyOf && copyCosts > 0 && (
          <label className="field full check-field">
            <input type="checkbox" checked={withCosts} onChange={(e) => setWithCosts(e.target.checked)} />
            <span>{t('Also copy its costs & extra income')} <span className="hint">— {tn(copyCosts, '{n} line, dated on the new event’s day; change the amounts after', '{n} lines, dated on the new event’s day; change the amounts after')}</span></span>
          </label>
        )}
      </div>
      {!event && <p className="hint" style={{ margin: 0 }}>{t('The event starts as')} <b>{t('Live')}</b>. {t('Add costs and products from stock on its page, then finalize it.')}</p>}
    </Modal>
  );
}
