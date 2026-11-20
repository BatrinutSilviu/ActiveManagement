// Book or change a session: patient, service, when, where, and how it's paid (its own price, or a package).
import { useEffect, useState } from 'react';
import { api } from '../../api.js';
import { useApi } from '../../hooks.js';
import { useBusiness } from '../../business.js';
import { CURRENCY, money0 } from '../../format.js';
import Modal from '../../components/Modal.jsx';
import Select from '../../components/Select.jsx';
import { IconCopy, IconTrash } from '../../components/Icons.jsx';
import { confirmDelete } from '../../components/Modal.jsx';
import { t, tn } from '../../i18n/index.js';
import { addDays, dayMonth, localToday, SESSION_STATUS, VENUES, weekday } from './common.jsx';

export default function SessionForm({ session: given, clientId, date, onClose, onSaved }) {
  // The session being changed; null for a new one (also after Duplicate, which turns the form into a new session).
  const [session, setSession] = useState(given);
  const [copiedFrom, setCopiedFrom] = useState(null); // the date of the session duplicated, to say so
  const { term, Term, business } = useBusiness();
  const locations = business?.locations || [];
  // The therapists (Settings → Services), plus one the session has that has since been removed.
  const therapists = [...(business?.therapists || []), ...(session?.therapist && !business?.therapists?.includes(session.therapist) ? [session.therapist] : [])];
  // The practice's locations, plus one a session was booked at that has since been removed.
  const places = [...locations, ...(session?.location && !locations.some((l) => l.name === session.location) ? [{ name: session.location }] : [])];
  const { data: clients, reload: reloadClients } = useApi('/clients');
  const { data: types } = useApi('/event-types');
  const [f, setF] = useState(() => ({
    client_id: clientId || '', type_id: '', date: date || localToday(), start_time: '', end_time: '', venue: 'home', address: '', location: '', travel_fee: '',
    status: 'scheduled', price: '', package_id: '', note: '', therapist: therapists.length === 1 ? therapists[0] : '',
    ...(session || {}),
    repeat: false, repeat_until: session?.series_until || '', scope: 'one', // weekly repeat (new), or how far a change reaches (series)
  }));
  const { data: packages } = useApi(f.client_id ? `/packages?client_id=${f.client_id}` : null);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  // A new session starts with the only service there is, at its price.
  useEffect(() => {
    if (!session && !f.type_id && types?.length === 1) setF((x) => ({ ...x, type_id: String(types[0].id), price: x.price || types[0].default_fee || '' }));
  }, [types]); // eslint-disable-line react-hooks/exhaustive-deps
  // …and with the patient's running package, if one has sessions left.
  useEffect(() => {
    if (session || !packages || !f.type_id) return; // with no service yet, picking a package picks the service instead
    const open = openPackage(f.type_id);
    setF((x) => ({ ...x, package_id: open ? String(open.id) : '' }));
  }, [packages]); // eslint-disable-line react-hooks/exhaustive-deps

  const client = clients?.find((c) => String(c.id) === String(f.client_id));
  // A new home visit for a patient chosen beforehand (from their page) starts with their usual travel fee.
  useEffect(() => {
    if (!session && client && f.venue === 'home' && f.travel_fee === '' && client.travel_fee) setF((x) => ({ ...x, travel_fee: client.travel_fee }));
  }, [client?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  // Packages it can use: with sessions left, or the one it's already in.
  // Places a package still has for a service: its own part plus the general ones (left_for, from the server).
  const placesFor = (p, typeId) => (typeId && p.left_for?.[typeId] != null ? p.left_for[typeId] : p.left_for?.any ?? 0);
  const fits = (p, typeId) => placesFor(p, typeId) > 0;
  // Packages to offer: those with places left (and the one this session is already in); ones without room for the
  // chosen service are shown but can't be picked.
  const offered = (packages || []).filter((p) => p.left > 0 || String(p.id) === String(session?.package_id));
  const chosen = offered.find((p) => String(p.id) === String(f.package_id));
  // Editing a session already in the chosen package: its place is already counted in what's left.
  const alreadyIn = session && String(session.package_id) === String(f.package_id) && session.status !== 'cancelled';
  // Picking a package with no room for the chosen service (or none chosen yet): the service becomes the first one it
  // still has places for (unless it has general places, which any service can take).
  const [switched, setSwitched] = useState(null); // the service picking a package switched to, to say so
  const pickPackage = (e) => {
    const p = offered.find((x) => String(x.id) === e.target.value);
    const part = p && !fits(p, f.type_id) && p.items.find((it) => it.service_id && it.left > 0);
    const ty = part ? typeOf(part.service_id) : null;
    setSwitched(ty && f.type_id ? ty.name : null);
    setF({ ...f, package_id: e.target.value, ...(ty ? { type_id: String(ty.id), end_time: endFor(f.start_time, ty) ?? f.end_time } : {}) });
  };
  const openPackage = (typeId) => (packages || []).find((p) => (!p.expires || p.expires >= f.date) && fits(p, typeId));

  // The end time follows the start and the service's duration.
  const endFor = (start, type) => {
    if (!start || !type?.duration) return null;
    const [h, m] = start.split(':').map(Number);
    const end = Math.min(h * 60 + m + type.duration, 23 * 60 + 59);
    return `${String(Math.floor(end / 60)).padStart(2, '0')}:${String(end % 60).padStart(2, '0')}`;
  };
  const typeOf = (id) => types?.find((x) => String(x.id) === String(id));
  const pickStart = (e) => setF({ ...f, start_time: e.target.value, end_time: endFor(e.target.value, typeOf(f.type_id)) ?? f.end_time });
  const pickType = (e) => {
    setSwitched(null);
    const ty = typeOf(e.target.value);
    // The package follows: kept if it fits the new service, else the patient's open package that does (new sessions).
    const current = (packages || []).find((p) => String(p.id) === String(f.package_id));
    const packageId = current && (fits(current, e.target.value) || String(current.id) === String(session?.package_id)) ? f.package_id : !session && openPackage(e.target.value) ? String(openPackage(e.target.value).id) : '';
    setF({ ...f, type_id: e.target.value, price: ty?.default_fee ? String(ty.default_fee) : f.price, end_time: endFor(f.start_time, ty) ?? f.end_time, package_id: packageId });
  };
  const addClient = async (name) => {
    const n = name || window.prompt(t(`First name and surname of the new ${term('person')}:`));
    if (!n?.trim()) return;
    const { id } = await api.post('/clients', { name: n.trim() });
    await reloadClients();
    setF((x) => ({ ...x, client_id: String(id), package_id: '' }));
  };

  // Duplicate: the same session (patient, service, therapist, times, place, price) as a new one a week later, scheduled.
  // Its package stays if it still has a place for it, else the patient's open package, if any.
  const duplicate = () => {
    const keep = (packages || []).find((p) => String(p.id) === String(f.package_id) && p.left > 0 && fits(p, f.type_id));
    const next = addDays(f.date, 7);
    const pkg = keep || (packages || []).find((p) => (!p.expires || p.expires >= next) && fits(p, f.type_id));
    const { id, invoice_id, invoice_number, invoice_kind, invoice_paid, cancel_reason, series_id, series_until, ...rest } = f;
    setCopiedFrom(f.date);
    setSession(null);
    setSwitched(null); setError(null);
    setF({ ...rest, date: next, status: 'scheduled', note: '', package_id: pkg ? String(pkg.id) : '', repeat: false, repeat_until: '', scope: 'one',
      therapist: rest.therapist || (therapists.length === 1 ? therapists[0] : '') });
    // Back to the top, where it says it's a copy.
    requestAnimationFrame(() => document.querySelectorAll('.modal, .modal-body').forEach((el) => el.scrollTo?.(0, 0)));
  };

  const save = async () => {
    setSaving(true);
    try {
      const { repeat, repeat_until, scope, ...fields } = f;
      const body = { ...fields, package_id: f.package_id || null, type_id: f.type_id || null,
        ...(session ? (session.series_id ? { scope, repeat_until } : {}) : repeat ? { repeat_until } : {}) };
      const r = session ? await api.put(`/appointments/${session.id}`, body) : await api.post('/appointments', body);
      onSaved(session?.id ?? r.id);
    } catch (e) { setError(e.message); setSaving(false); }
  };

  const del = async () => {
    const following = session.series_id && f.scope === 'following';
    if (!confirmDelete(following ? t(`this ${term('event')} and the following ones of the series`) : t(`this ${term('event')}`))) return;
    try { await api.del(`/appointments/${session.id}${following ? '?scope=following' : ''}`); onSaved(); } catch (e) { setError(e.message); }
  };
  // How many sessions a weekly repeat makes, the first included.
  const weeks = (from, until) => (from && until && until >= from ? Math.floor((new Date(`${until}T12:00:00`) - new Date(`${from}T12:00:00`)) / (7 * 86400000)) + 1 : 0);
  // A new repeat ends, at first, when the package does, else in 12 weeks.
  const toggleRepeat = (on) => setF({ ...f, repeat: on, repeat_until: f.repeat_until || (chosen?.expires && chosen.expires > f.date ? chosen.expires : addDays(f.date, 7 * 11)) });

  return (
    <Modal title={session ? t(`Edit ${term('event')}`) : t(`New ${term('event')}`)} onClose={onClose} onSubmit={save}
      footer={<>
        {session && <button type="button" className="icon-btn btn-danger" onClick={del} aria-label={t('Delete')} title={t('Delete')}><IconTrash width="16" /></button>}
        {session && <button type="button" className="btn" onClick={duplicate} style={{ marginRight: 'auto' }} title={t(`A new ${term('event')} like this one, a week later`)}>
          <IconCopy width="15" />{t('Duplicate')}</button>}
        <button type="button" className="btn" onClick={onClose}>{t('Cancel')}</button>
        <button className="btn btn-primary" disabled={saving}>{t('Save')}</button>
      </>}>
      {error && <div className="error-box">{error}</div>}
      {copiedFrom && <div className="package-hint">{t('A copy of the one on {date}, a week later: check the date and time.', { date: dayMonth(copiedFrom) })}</div>}
      <div className="segmented" role="radiogroup" aria-label={t('Status')}>
        {Object.entries(SESSION_STATUS).map(([k, label]) => (
          <button type="button" key={k} className={f.status === k ? 'on' : ''} role="radio" aria-checked={f.status === k}
            onClick={() => setF({ ...f, status: k })}>{t(label)}</button>
        ))}
      </div>
      <div className="form-grid">
        {f.status === 'cancelled' && (
          <label className="field full">{t('Reason for cancelling')}
            <textarea value={f.cancel_reason || ''} onChange={set('cancel_reason')} rows={2} autoFocus
              placeholder={t('e.g. the child is ill, the family is away…')} />
          </label>
        )}
        <label className="field full">{t(Term('person'))}
          <Select value={f.client_id ? String(f.client_id) : ''} onChange={(e) => {
            const c = clients?.find((x) => String(x.id) === e.target.value);
            setF({ ...f, client_id: e.target.value, package_id: '', travel_fee: f.venue === 'home' ? c?.travel_fee || '' : f.travel_fee });
          }}
            onCreate={addClient} createLabel={t(`New ${term('person')}`)}>
            <option value="">{t('— choose —')}</option>
            {clients?.filter((c) => !c.archived || String(c.id) === String(f.client_id)).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </label>
        <label className="field">{t(Term('sport'))}
          <Select value={f.type_id ? String(f.type_id) : ''} onChange={pickType} required={!!types?.length}>
            <option value="">{t('— choose —')}</option>
            {types?.map((ty) => <option key={ty.id} value={ty.id}>{ty.name}{ty.default_fee ? ` · ${money0(ty.default_fee)}` : ''}</option>)}
          </Select>
        </label>
        {f.client_id && (
          <div className="field full">
            <label className="field">{t('Package')}
              <Select value={f.package_id ? String(f.package_id) : ''} onChange={pickPackage}>
                <option value="">{t('No package (paid separately)')}</option>
                {offered.map((p) => {
                  const ok = fits(p, f.type_id) || String(p.id) === String(session?.package_id);
                  const only = p.items.filter((it) => it.service_id && it.left > 0).map((it) => it.service_name).join(', ');
                  return <option key={p.id} value={p.id}>
                    {p.name} · {ok ? t('{n} left', { n: placesFor(p, f.type_id) }) : t('{n} left for {services}', { n: p.left, services: only })}
                  </option>;
                })}
              </Select>
            </label>
            {chosen && switched && <span className="hint">{t('The service was changed to {service}, which this package covers.', { service: switched })}</span>}
            {chosen && <div className="package-hint">
              <strong>{t('{n} left after this one', { n: Math.max(0, placesFor(chosen, f.type_id) - (alreadyIn ? 0 : 1)) })}</strong>
              <span>{chosen.items.map((it) => `${it.service_name || t('Any service')}: ${it.left}/${it.sessions}`).join(' · ')}</span>
            </div>}
            {!offered.length && <span className="hint">{t('This patient has no package with sessions left.')}</span>}
          </div>
        )}
        {therapists.length > 0 && (
          <label className="field full">{t('Therapist')}
            <Select value={f.therapist || ''} onChange={set('therapist')}>
              <option value="">{t('— choose —')}</option>
              {therapists.map((n) => <option key={n} value={n}>{n}</option>)}
            </Select>
          </label>
        )}
        <label className="field">{t('Date')}<input type="date" value={f.date} onChange={set('date')} required /></label>
        <label className="field half">{t('From')}<input type="time" value={f.start_time || ''} onChange={pickStart} /></label>
        <label className="field half">{t('To')}<input type="time" value={f.end_time || ''} onChange={set('end_time')} /></label>
        {!session && (
          <div className="field full repeat-box">
            <label className="check"><input type="checkbox" checked={f.repeat} onChange={(e) => toggleRepeat(e.target.checked)} />{t('Repeats every week')}</label>
            {f.repeat && <>
              <label className="field">{t('Until')}<input type="date" value={f.repeat_until} min={addDays(f.date, 7)} onChange={set('repeat_until')} required /></label>
              <span className="hint">{tn(weeks(f.date, f.repeat_until), `{n} ${term('event')} in all, every {day}`, `{n} ${term('events')} in all, every {day}`, { day: weekday(f.date) })}
                {f.package_id ? ` · ${t('those beyond the package’s places are paid separately')}` : ''}</span>
            </>}
          </div>
        )}
        {session?.series_id && (
          <div className="field full repeat-box">
            <span>{t('Repeats every week, until')}</span>
            <input type="date" value={f.repeat_until} onChange={set('repeat_until')} required aria-label={t('Until')} />
            <div className="segmented" role="radiogroup" aria-label={t('Changes apply to')}>
              {[['one', 'Only this one'], ['following', 'This and the following ones']].map(([k, label]) => (
                <button type="button" key={k} className={f.scope === k ? 'on' : ''} role="radio" aria-checked={f.scope === k}
                  onClick={() => setF({ ...f, scope: k })}>{t(label)}</button>
              ))}
            </div>
            <span className="hint">{f.scope === 'following'
              ? t('Saving or deleting also changes the following ones still scheduled and not billed.')
              : t('Saving or deleting changes only this one. A new end date applies to the series either way.')}</span>
          </div>
        )}
        <label className="field full">{t('Venue')}
          <Select value={f.venue === 'practice' ? `practice:${f.location || ''}` : 'home'} required
            onChange={(e) => { const [venue, ...name] = e.target.value.split(':'); setF({ ...f, venue, location: name.join(':'), travel_fee: venue === 'home' && !f.travel_fee ? client?.travel_fee || '' : f.travel_fee }); }}>
            <option value="home">{t(VENUES.home)}</option>
            {places.map((l) => <option key={l.name} value={`practice:${l.name}`}>{l.name}{l.address ? ` · ${l.address}` : ''}</option>)}
            {!locations.length && <option value="practice:">{t(VENUES.practice)}</option>}
          </Select>
        </label>
        {f.venue === 'home' && <label className="field full">{t('Address')}
          <input value={f.address || ''} onChange={set('address')} placeholder={client?.address ? t('{address} (their address)', { address: client.address }) : t(`Where the ${term('event')} is`)} />
        </label>}
        {f.venue === 'home' && (
          <label className="field">{t('Travel fee ({currency})', { currency: CURRENCY })}
            <input type="number" min="0" step="0.01" value={f.travel_fee || ''} onChange={set('travel_fee')} placeholder="0" />
          </label>
        )}
        {!f.package_id && (
          <label className="field">{t('Price ({currency})', { currency: CURRENCY })}
            <input type="number" min="0" step="0.01" value={f.price} onChange={set('price')} />
          </label>
        )}
        <label className="field full">{t('Note')} <span className="hint">{t(`— about this ${term('event')} (notes about the ${term('person')} are on their page)`)}</span>
          <textarea value={f.note || ''} onChange={set('note')} rows={2} />
        </label>
      </div>
    </Modal>
  );
}
