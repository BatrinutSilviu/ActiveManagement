// Settings for a practice: the services offered (each with its colour, how long it lasts and the price a new session
// starts with), and the venues: the patient's home or one of the practice's locations.
import { useEffect, useRef, useState } from 'react';
import { api } from '../../api.js';
import { useAction, useApi, usePermissions } from '../../hooks.js';
import { useBusiness } from '../../business.js';
import { CURRENCY, money0 } from '../../format.js';
import { confirmDelete } from '../../components/Modal.jsx';
import { IconEdit, IconTrash } from '../../components/Icons.jsx';
import { t } from '../../i18n/index.js';
import { rename } from '../settings/rename.js';
import { itemsLabel, PackageItems } from './PatientForms.jsx';

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
          <table className="services-table">
            <thead><tr><th style={{ width: '100%' }}>{t(Term('sport'))}</th><th>{t('Colour')}</th><th className="r">{t('Duration (min)')}</th><th className="r">{t('Price ({currency})', { currency: CURRENCY })}</th><th /></tr></thead>
            <tbody>
              {data.map((x) => (
                <tr key={`${x.id}-${x.default_fee}-${x.duration}-${x.color}`}>
                  <td>{x.name}</td>
                  <td data-label={t('Colour')}>
                    <ColorPick value={x.color} label={t('{name} colour', { name: x.name })}
                      onPick={(color) => run(() => api.put(`/event-types/${x.id}`, { color }))} />
                  </td>
                  <td className="r" data-label={t('Duration (min)')}>
                    <input className="select-sm num-input" type="number" min="1" max="1440" step="1" defaultValue={x.duration || ''} placeholder="—"
                      aria-label={t('{name} duration', { name: x.name })} style={{ width: 80 }}
                      onBlur={(e) => (Number(e.target.value) || null) !== x.duration && run(() => api.put(`/event-types/${x.id}`, { duration: e.target.value }))} />
                  </td>
                  <td className="r" data-label={t('Price ({currency})', { currency: CURRENCY })}>
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

/** The illness categories a patient can be put in (business.conditions), picked in the patient form. */
export function Conditions() {
  const { business } = useBusiness();
  const { isAdmin } = usePermissions();
  const saved = business?.conditions || [];
  const [list, setList] = useState(null); // being edited: [{ name, was }]
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const rows = list ?? saved.map((name) => ({ name, was: name }));
  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const conditionRenames = Object.fromEntries(rows.filter((r) => r.was && r.was !== r.name.trim()).map((r) => [r.was, r.name.trim()]));
      await api.put('/business', { conditions: rows.map((r) => r.name), conditionRenames });
      setList(null); setError(null);
      window.dispatchEvent(new Event('am:business'));
    } catch (err) { setError(err.message); }
    setSaving(false);
  };
  return (
    <div className="card card-pad">
      <div className="card-head"><div><h2>{t('Illness categories')}</h2><p>{t('What a patient can be treated for; picked in the patient form')}</p></div></div>
      {error && <div className="error-box" style={{ marginBottom: 10 }}>{error}</div>}
      <form onSubmit={save} className="stack" style={{ gap: 6 }}>
        {!rows.length && <p className="muted" style={{ margin: 0 }}>{t('None yet.')}</p>}
        {rows.map((r, i) => (isAdmin ? (
          <div key={i} style={{ display: 'flex', gap: 6 }}>
            <input value={r.name} onChange={(e) => setList(rows.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} maxLength={80} required style={{ flex: 1 }} />
            <button type="button" className="btn btn-sm" onClick={() => setList(rows.filter((_, j) => j !== i))}>{t('Remove')}</button>
          </div>
        ) : <div key={i}>{r.name}</div>))}
        {isAdmin && <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="btn btn-sm" onClick={() => setList([...rows, { name: '' }])}>{t('Add category')}</button>
          {list && <button className="btn btn-primary btn-sm" disabled={saving}>{t('Save')}</button>}
          {list && <button type="button" className="btn btn-sm" onClick={() => { setList(null); setError(null); }}>{t('Cancel')}</button>}
        </div>}
      </form>
    </div>
  );
}

/** Package types: ready-made packages to sell (sessions, price, validity, optionally one service). */
export function PackageTypes() {
  const { term } = useBusiness();
  const { canEdit } = usePermissions();
  const { data, reload } = useApi('/package-types');
  const { data: services } = useApi('/event-types');
  const [error, run] = useAction(reload);
  const [f, setF] = useState(null); // being added / edited
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const save = async (e) => {
    e.preventDefault();
    if (await run(() => (f.id ? api.put(`/package-types/${f.id}`, f) : api.post('/package-types', f)))) setF(null);
  };
  const months = (n) => (n ? t('valid {n} months', { n }) : t('no expiry'));
  return (
    <div className="card card-pad">
      <div className="card-head"><div><h2>{t('Package types')}</h2><p>{t(`Ready-made packages of ${term('events')}: picked when selling a package to a patient`)}</p></div>
        {canEdit && !f && <button className="btn btn-sm" onClick={() => setF({ name: '', price: '', valid_months: '', items: [{ service_id: '', sessions: 10 }] })}>{t('Add package type')}</button>}</div>
      {error && <div className="error-box" style={{ marginBottom: 10 }}>{error}</div>}
      {f && (
        <form onSubmit={save} className="form-grid" style={{ marginBottom: 14 }}>
          <label className="field full">{t('Name')}<input value={f.name} onChange={set('name')} required autoFocus placeholder={t("e.g. 10 sessions Kinetoterapie 50'")} /></label>
          <PackageItems items={f.items} onChange={(items) => setF({ ...f, items })} services={services} />
          <label className="field half">{t('Price ({currency})', { currency: CURRENCY })}<input type="number" min="0" step="0.01" value={f.price} onChange={set('price')} required /></label>
          <label className="field half">{t('Valid for (months)')}<input type="number" min="1" step="1" value={f.valid_months ?? ''} onChange={set('valid_months')} placeholder={t('no expiry')} /></label>
          <div className="full" style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-primary btn-sm">{t('Save')}</button>
            <button type="button" className="btn btn-sm" onClick={() => setF(null)}>{t('Cancel')}</button>
          </div>
        </form>
      )}
      {data?.length ? (
        <div className="stack" style={{ gap: 0 }}>
          {data.map((k) => (
            <div key={k.id} className="side-item" style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="row-title">{k.name}</div>
                <div className="row-sub">{itemsLabel(k.items, term)}</div>
                <div className="row-sub">{t(`{n} ${term('events')}`, { n: k.sessions })} · {money0(k.price)} · {months(k.valid_months)}</div>
              </div>
              {canEdit && <span className="actions">
                <button className="icon-btn" aria-label={t('Edit')} onClick={() => setF({ ...k, items: k.items.map((it) => ({ service_id: it.service_id ? String(it.service_id) : '', sessions: it.sessions })), valid_months: k.valid_months ?? '' })}><IconEdit /></button>
                <button className="icon-btn" aria-label={t('Delete')} onClick={() => confirmDelete(`“${k.name}”`) && run(() => api.del(`/package-types/${k.id}`))}><IconTrash /></button>
              </span>}
            </div>
          ))}
        </div>
      ) : !f && <p className="muted" style={{ margin: 0 }}>{t('None yet.')}</p>}
    </div>
  );
}
