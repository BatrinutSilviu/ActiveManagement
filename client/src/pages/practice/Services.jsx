// Settings for a practice: the services offered (each with its colour, how long it lasts and the price a new session
// starts with), and the venues: the patient's home or one of the practice's locations.
import { useEffect, useRef, useState } from 'react';
import { api } from '../../api.js';
import { useAction, useApi, usePermissions } from '../../hooks.js';
import { useBusiness } from '../../business.js';
import { CURRENCY } from '../../format.js';
import { confirmDelete } from '../../components/Modal.jsx';
import { IconEdit, IconTrash } from '../../components/Icons.jsx';
import { t } from '../../i18n/index.js';
import { rename } from '../settings/rename.js';

export function Services() {
  const { term, Term } = useBusiness();
  const { data, reload } = useApi('/event-types');
  const [error, run] = useAction(reload);
  const [name, setName] = useState('');
  const add = async (e) => {
    e.preventDefault();
    if (await run(() => api.post('/event-types', { name, is_sport: false }))) setName('');
  };
  return (
    <div className="card card-pad">
      <div className="card-head"><div><h2>{t(Term('sports'))}</h2><p>{t(`What you offer, its colour on the timetable, how long each lasts, and the price a new ${term('event')} of each starts with`)}</p></div></div>
      {error && <div className="error-box" style={{ marginBottom: 10 }}>{error}</div>}
      {data?.length ? (
        <div className="table-wrap" style={{ marginBottom: 12 }}>
          <table>
            <thead><tr><th style={{ width: '100%' }}>{t(Term('sport'))}</th><th>{t('Colour')}</th><th className="r">{t('Duration (min)')}</th><th className="r">{t('Price ({currency})', { currency: CURRENCY })}</th><th /></tr></thead>
            <tbody>
              {data.map((x) => (
                <tr key={`${x.id}-${x.default_fee}-${x.duration}-${x.color}`}>
                  <td>{x.name}</td>
                  <td>
                    <ColorPick value={x.color} label={t('{name} colour', { name: x.name })}
                      onPick={(color) => run(() => api.put(`/event-types/${x.id}`, { color }))} />
                  </td>
                  <td className="r">
                    <input className="select-sm num-input" type="number" min="1" max="1440" step="1" defaultValue={x.duration || ''} placeholder="—"
                      aria-label={t('{name} duration', { name: x.name })} style={{ width: 80 }}
                      onBlur={(e) => (Number(e.target.value) || null) !== x.duration && run(() => api.put(`/event-types/${x.id}`, { duration: e.target.value }))} />
                  </td>
                  <td className="r">
                    <input className="select-sm num-input" type="number" min="0" step="0.01" defaultValue={x.default_fee || ''} placeholder="0"
                      aria-label={t('{name} price', { name: x.name })} style={{ width: 100 }}
                      onBlur={(e) => Number(e.target.value || 0) !== x.default_fee && run(() => api.put(`/event-types/${x.id}`, { default_fee: Number(e.target.value || 0), default_venue_fee: 0 }))} />
                  </td>
                  <td className="r actions">
                    <button className="icon-btn" aria-label={t('Rename')} onClick={() => { const n = rename(x.name); if (n) run(() => api.put(`/event-types/${x.id}`, { name: n })); }}><IconEdit /></button>
                    <button className="icon-btn" aria-label={t('Delete')} onClick={() => confirmDelete(`“${x.name}”`) && run(() => api.del(`/event-types/${x.id}`))}><IconTrash /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      <form onSubmit={add} style={{ display: 'flex', gap: 8 }}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t(`New ${term('sport')}, e.g. Manual therapy`)} required style={{ flex: 1 }} />
        <button className="btn">{t('Add')}</button>
      </form>
    </div>
  );
}

/** A colour picker that saves once a colour is chosen (the native change event), not on every move while choosing. */
function ColorPick({ value, label, onPick }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    const picked = () => { if (el.value !== value) onPick(el.value); };
    el.addEventListener('change', picked);
    return () => el.removeEventListener('change', picked);
  });
  return <input ref={ref} type="color" defaultValue={value || '#2a78d6'} aria-label={label} title={t('Its colour on the timetable')}
    style={{ width: 40, height: 30, padding: 2 }} />;
}

/** Where sessions happen: at the patient's home, or at one of the practice's locations (business.locations). */
export function Venues() {
  const { business } = useBusiness();
  const { isAdmin } = usePermissions();
  const saved = business?.locations || [];
  const [list, setList] = useState(null); // being edited: [{ name, address, was }]
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const rows = list ?? saved.map((l) => ({ ...l, was: l.name }));
  const change = (i, k) => (e) => setList(rows.map((l, j) => (j === i ? { ...l, [k]: e.target.value } : l)));
  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const renames = Object.fromEntries(rows.filter((l) => l.was && l.was !== l.name.trim()).map((l) => [l.was, l.name.trim()]));
      await api.put('/business', { locations: rows.map(({ name, address }) => ({ name, address })), renames });
      setList(null); setError(null);
      window.dispatchEvent(new Event('am:business')); // the session form follows
    } catch (err) { setError(err.message); }
    setSaving(false);
  };
  return (
    <div className="card card-pad">
      <div className="card-head"><div><h2>{t('Venues')}</h2><p>{t('Where sessions happen: at the patient’s home, or at one of the practice’s locations')}</p></div></div>
      {error && <div className="error-box" style={{ marginBottom: 10 }}>{error}</div>}
      <form onSubmit={save} className="stack" style={{ gap: 6 }}>
        <div className="row-title">{t("At the patient's home")} <span className="hint">— {t('the address on their page, or one given for the session')}</span></div>
        {rows.map((l, i) => (isAdmin ? (
          <div key={i} style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <input value={l.name} onChange={change(i, 'name')} placeholder={t('Name, e.g. Sânandrei')} maxLength={60} required style={{ flex: '1 1 160px' }} />
            <input value={l.address} onChange={change(i, 'address')} placeholder={t('Address')} maxLength={300} style={{ flex: '3 1 240px' }} />
            <button type="button" className="btn btn-sm" onClick={() => setList(rows.filter((_, j) => j !== i))}>{t('Remove')}</button>
          </div>
        ) : <div key={i}><span className="row-title">{l.name}</span> <span className="muted">{l.address}</span></div>))}
        {isAdmin && <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="btn btn-sm" onClick={() => setList([...rows, { name: '', address: '' }])}>{t('Add location')}</button>
          {list && <button className="btn btn-primary btn-sm" disabled={saving}>{t('Save')}</button>}
          {list && <button type="button" className="btn btn-sm" onClick={() => { setList(null); setError(null); }}>{t('Cancel')}</button>}
        </div>}
      </form>
    </div>
  );
}
