// The kilometre log: the km driven each day to the home visits, a month at a time, and the saved addresses to start
// and finish from.
import { useState } from 'react';
import { api, qs } from '../../api.js';
import { useAction, useApi, usePermissions } from '../../hooks.js';
import Kpi from '../../components/Kpi.jsx';
import Modal, { confirmDelete } from '../../components/Modal.jsx';
import { IconChevronLeft, IconEdit, IconPlus, IconTrash } from '../../components/Icons.jsx';
import { dateLocale, t, tn } from '../../i18n/index.js';
import TripForm, { km } from './TripForm.jsx';
import { dayMonth, iso, localToday, weekday } from './common.jsx';

const addMonths = (m, n) => { const d = new Date(`${m}-01T12:00:00`); d.setMonth(d.getMonth() + n); return iso(d).slice(0, 7); };
const monthLabel = (m) => { const s = new Date(`${m}-01T12:00:00`).toLocaleDateString(dateLocale(), { month: 'long', year: 'numeric' }); return s[0].toUpperCase() + s.slice(1); };

export default function Trips() {
  const { canEdit } = usePermissions();
  const today = localToday();
  const [month, setMonth] = useState(today.slice(0, 7));
  const { data, loading, reload } = useApi(`/trips${qs({ month })}`);
  const [day, setDay] = useState(null);
  const days = data?.days || [];
  const logged = days.filter((d) => d.trip);
  const missing = days.filter((d) => !d.trip && d.home > 0 && d.date <= today);

  return (
    <div className={loading ? 'loading' : ''}>
      <div className="page-head">
        <div><h1>{t('Kilometres')}</h1><p>{t('The road driven each working day: from the start, through the day’s visits, to the finish. The km come from the map.')}</p></div>
        {canEdit && <button className="btn btn-primary" onClick={() => setDay(today)}><IconPlus width="16" />{t('Today’s km')}</button>}
      </div>
      <div className="filters">
        <div className="segmented">
          <button onClick={() => setMonth(addMonths(month, -1))} aria-label={t('Previous')}><IconChevronLeft width="15" /></button>
          <button className={month === today.slice(0, 7) ? 'on' : ''} onClick={() => setMonth(today.slice(0, 7))}>{t('This month')}</button>
          <button onClick={() => setMonth(addMonths(month, 1))} aria-label={t('Next')}><IconChevronLeft width="15" style={{ transform: 'rotate(180deg)' }} /></button>
        </div>
        <strong>{monthLabel(month)}</strong>
      </div>
      <div className="grid grid-kpi" style={{ marginBottom: 16 }}>
        <Kpi label={t('Driven this month')} value={km(data?.total ?? 0)} sub={tn(logged.length, '{n} day', '{n} days')} hero />
        <Kpi label={t('Days with home visits not logged')} value={<span className={missing.length ? 'neg' : ''}>{missing.length}</span>} />
      </div>
      <div className="card table-wrap">
        {days.length ? (
          <table>
            <thead><tr><th>{t('Day')}</th><th className="hide-sm">{t('Route')}</th><th className="r">{t('Km')}</th></tr></thead>
            <tbody>
              {days.map((d) => (
                <tr key={d.date} onClick={() => canEdit && setDay(d.date)} className={canEdit ? 'clickable' : ''}>
                  <td>
                    <div className="row-title">{weekday(d.date)} {dayMonth(d.date)}</div>
                    <div className="row-sub">{tn(d.sessions, '{n} session', '{n} sessions')}{d.home ? ` · ${tn(d.home, '{n} at home', '{n} at home')}` : ''}</div>
                  </td>
                  <td className="hide-sm cell-wrap secondary">
                    {d.trip ? [d.trip.start_address, ...d.trip.stops.map((s) => s.label || s.address), d.trip.end_address].join(' → ') : '—'}
                    {d.trip?.note && <div className="row-sub">{d.trip.note}</div>}
                  </td>
                  <td className="r">
                    {d.trip ? <><strong>{km(d.trip.total)}</strong>{d.trip.km_manual != null && <div className="row-sub">{t('map: {km}', { km: km(d.trip.km ?? 0) })}</div>}</>
                      : d.home && d.date <= today ? <span className="badge badge-warn">{t('Not logged')}</span> : <span className="muted">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <div className="empty">{t('No sessions this month.')}</div>}
      </div>
      <Places canEdit={canEdit} />
      {day && <TripForm date={day} onClose={() => setDay(null)} onSaved={reload} />}
    </div>
  );
}

/** The addresses kept to pick as a day's start or finish (home, the practice…). */
function Places({ canEdit }) {
  const { data, reload } = useApi('/places');
  const [form, setForm] = useState(null);
  const [err, run] = useAction(reload);
  const del = (p) => confirmDelete(p.name) && run(() => api.del(`/places/${p.id}`));
  return (
    <section className="card card-pad" style={{ marginTop: 16 }}>
      <div className="card-head">
        <div><h2>{t('Saved addresses')}</h2><p className="hint">{t('Picked with one tap as a day’s start or finish. The practice’s locations are offered too.')}</p></div>
        {canEdit && <button className="btn btn-sm" onClick={() => setForm({ name: '', address: '' })}><IconPlus width="14" />{t('Add')}</button>}
      </div>
      {err && <div className="error-box">{err}</div>}
      {data?.length ? (
        <div className="stack" style={{ gap: 8 }}>
          {data.map((p) => (
            <div key={p.id} className="place-row">
              <div><div className="row-title">{p.name}</div><div className="row-sub">{p.address}</div></div>
              {canEdit && <div className="row-actions">
                <button className="icon-btn" onClick={() => setForm(p)} aria-label={t('Edit')}><IconEdit width="15" /></button>
                <button className="icon-btn" onClick={() => del(p)} aria-label={t('Delete')}><IconTrash width="15" /></button>
              </div>}
            </div>
          ))}
        </div>
      ) : <p className="muted">{t('None yet. Add your home, or save an address straight from a day’s start or finish.')}</p>}
      {form && <PlaceForm place={form} onClose={() => setForm(null)} onSaved={() => { setForm(null); reload(); }} />}
    </section>
  );
}

function PlaceForm({ place, onClose, onSaved }) {
  const [f, setF] = useState(place);
  const [error, setError] = useState(null);
  const save = async () => {
    try { await (place.id ? api.put(`/places/${place.id}`, f) : api.post('/places', f)); onSaved(); } catch (e) { setError(e.message); }
  };
  return (
    <Modal title={place.id ? t('Edit address') : t('New address')} onClose={onClose} onSubmit={save}
      footer={<><button type="button" className="btn" onClick={onClose}>{t('Cancel')}</button><button className="btn btn-primary">{t('Save')}</button></>}>
      {error && <div className="error-box">{error}</div>}
      <label className="field">{t('Name')}<input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder={t('e.g. Home')} required autoFocus /></label>
      <label className="field">{t('Address')}<input value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} placeholder={t('Street, number, town')} required /></label>
    </Modal>
  );
}
