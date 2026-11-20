// One day's road: where it started, the visits in the order driven (from the day's sessions, changeable), where it
// ended. Saving works out the km from the map and shows each leg.
import { useEffect, useState } from 'react';
import { api } from '../../api.js';
import { useApi } from '../../hooks.js';
import { useBusiness } from '../../business.js';
import Modal, { confirmDelete } from '../../components/Modal.jsx';
import { IconArrowDown, IconArrowUp, IconPlus, IconTrash, IconX } from '../../components/Icons.jsx';
import { dateLocale, t, tn } from '../../i18n/index.js';
import { dayMonth, mapsUrl, weekday } from './common.jsx';

export const km = (n) => `${Number(n).toLocaleString(dateLocale(), { maximumFractionDigits: 1 })} km`;

const sameStops = (a, b) => a.length === b.length && a.every((s, i) => s.address === b[i].address);

export default function TripForm({ date, onClose, onSaved }) {
  const { business } = useBusiness();
  const { data } = useApi(`/trips/${date}`);
  const { data: saved, reload: reloadPlaces } = useApi('/places');
  const [f, setF] = useState(null);
  const [result, setResult] = useState(null); // { km, legs, points } after saving
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  // A saved day as it was; a new one from the day's visits, starting and ending where the last day saved did.
  useEffect(() => {
    if (!data || f) return;
    const visits = data.visits.filter((v) => v.address).map(({ label, address }) => ({ label, address }));
    setF(data.trip
      ? { start_address: data.trip.start_address, end_address: data.trip.end_address, stops: data.trip.stops, km_manual: data.trip.km_manual ?? '', note: data.trip.note || '' }
      : { start_address: data.previous?.start_address || '', end_address: data.previous?.end_address || '', stops: visits, km_manual: '', note: '' });
  }, [data]); // eslint-disable-line react-hooks/exhaustive-deps

  // Addresses to pick with one tap: the saved places and the practice's locations.
  const places = [...(saved || []), ...(business?.locations || []).filter((l) => l.address)];
  const fromVisits = (data?.visits || []).filter((v) => v.address).map(({ label, address }) => ({ label, address }));
  const noAddress = (data?.visits || []).filter((v) => !v.address);

  const set = (k, v) => { setF({ ...f, [k]: v }); setResult(null); };
  const setStop = (i, patch) => set('stops', f.stops.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const move = (i, d) => { const s = [...f.stops]; [s[i], s[i + d]] = [s[i + d], s[i]]; set('stops', s); };

  const save = async () => {
    setSaving(true); setError(null);
    try {
      const r = await api.put(`/trips/${date}`, f);
      setResult(r);
      onSaved?.();
    } catch (e) { setError(e.message); } finally { setSaving(false); }
  };
  const del = async () => {
    if (!confirmDelete(t('the km of this day'))) return;
    try { await api.del(`/trips/${date}`); onSaved?.(); onClose(); } catch (e) { setError(e.message); }
  };
  const savePlace = async (address) => {
    const name = window.prompt(t('A name for this address, e.g. Home'));
    if (!name?.trim()) return;
    try { await api.post('/places', { name, address }); reloadPlaces(); } catch (e) { setError(e.message); }
  };

  const total = result ? Number(f.km_manual !== '' ? f.km_manual : result.km) : null;
  return (
    <Modal title={t('Km on {day}', { day: `${weekday(date)} ${dayMonth(date)}` })} onClose={onClose} onSubmit={save}
      footer={<>
        {data?.trip && <button type="button" className="icon-btn btn-danger" onClick={del} style={{ marginRight: 'auto' }} aria-label={t('Delete')} title={t('Delete')}><IconTrash width="16" /></button>}
        <button type="button" className="btn" onClick={onClose}>{result ? t('Close') : t('Cancel')}</button>
        <button className="btn btn-primary" disabled={saving || !f}>{saving ? t('Working out the km…') : t('Work out the km and save')}</button>
      </>}>
      {error && <div className="error-box">{error}</div>}
      {!f ? <p className="muted">{t('Loading…')}</p> : <>
        {result && (
          <div className="trip-result">
            <div><span className="kpi-label">{t('Driven')}</span><strong>{km(total)}</strong>
              {f.km_manual !== '' && <span className="hint"> {t('(the map says {km})', { km: km(result.km) })}</span>}</div>
            <ol className="trip-legs">
              {result.legs.map((l, i) => (
                <li key={i}>
                  <span>{i === 0 ? t('Start') : f.stops[i - 1]?.label || f.stops[i - 1]?.address} → {i === result.legs.length - 1 ? t('Finish') : f.stops[i]?.label || f.stops[i]?.address}</span>
                  <b>{km(l)}</b>
                </li>
              ))}
            </ol>
            {result.points.some((p) => p.approx) && (
              <div className="hint warn">{t('Only the town was found for: {list}. Write these addresses more fully for an exact distance.', {
                list: result.points.filter((p) => p.approx).map((p) => p.address).join('; ') })}</div>
            )}
          </div>
        )}
        <AddressField label={t('Start')} value={f.start_address} onChange={(v) => set('start_address', v)} places={places} onSave={savePlace} />

        <div className="field full">
          <div className="trip-stops-head">
            <span>{tn(f.stops.length, '{n} stop', '{n} stops')}</span>
            {!sameStops(f.stops, fromVisits) && fromVisits.length > 0 && (
              <button type="button" className="link-btn" onClick={() => set('stops', fromVisits)}>{t('Take them from the day’s sessions again')}</button>
            )}
          </div>
          {noAddress.length > 0 && (
            <div className="hint warn">{t('No address for: {list}. Add it to the patient (or the session) to have it here.', { list: noAddress.map((v) => v.label).join(', ') })}</div>
          )}
          <ol className="trip-stops">
            {f.stops.map((s, i) => (
              <li key={i}>
                <span className="trip-num">{i + 1}</span>
                <div className="trip-stop">
                  {s.label && <strong>{s.label}</strong>}
                  <input value={s.address} onChange={(e) => setStop(i, { address: e.target.value })} aria-label={t('Address of stop {n}', { n: i + 1 })} />
                </div>
                <div className="trip-stop-actions">
                  <button type="button" className="icon-btn" disabled={i === 0} onClick={() => move(i, -1)} aria-label={t('Earlier')}><IconArrowUp width="15" /></button>
                  <button type="button" className="icon-btn" disabled={i === f.stops.length - 1} onClick={() => move(i, 1)} aria-label={t('Later')}><IconArrowDown width="15" /></button>
                  <button type="button" className="icon-btn" onClick={() => set('stops', f.stops.filter((_, j) => j !== i))} aria-label={t('Remove stop')}><IconX width="15" /></button>
                </div>
              </li>
            ))}
          </ol>
          <button type="button" className="btn btn-sm" onClick={() => set('stops', [...f.stops, { label: '', address: '' }])}><IconPlus width="14" />{t('Add a stop')}</button>
        </div>

        <AddressField label={t('Finish')} value={f.end_address} onChange={(v) => set('end_address', v)} places={places} onSave={savePlace}
          extra={f.start_address && f.end_address !== f.start_address
            ? <button type="button" className="chip" onClick={() => set('end_address', f.start_address)}>{t('Same as the start')}</button> : null} />

        <div className="form-grid">
          <label className="field">{t('Km, if different')} <span className="hint">{t('— your own figure, e.g. from the odometer')}</span>
            <input type="number" min="0" step="0.1" value={f.km_manual} onChange={(e) => set('km_manual', e.target.value)} />
          </label>
          <label className="field">{t('Note')}<input value={f.note} onChange={(e) => set('note', e.target.value)} /></label>
        </div>
      </>}
    </Modal>
  );
}

/** An address typed in, or picked with one tap from the saved places; one not saved yet can be saved. */
function AddressField({ label, value, onChange, places, onSave, extra }) {
  const known = places.some((p) => p.address.trim().toLowerCase() === value.trim().toLowerCase());
  return (
    <div className="field full">
      <label className="field">{label}
        <input value={value} onChange={(e) => onChange(e.target.value)} required placeholder={t('Street, number, town')} />
      </label>
      <div className="chips" style={{ marginTop: 6 }}>
        {places.map((p) => (
          <button type="button" key={`${p.id ?? 'loc'}-${p.name}`} className={`chip ${p.address === value ? 'on' : ''}`} onClick={() => onChange(p.address)} title={p.address}>{p.name}</button>
        ))}
        {extra}
        {value.trim() && !known && <button type="button" className="chip chip-add" onClick={() => onSave(value.trim())}><IconPlus width="12" />{t('Save this address')}</button>}
        {value.trim() && <a className="chip" href={mapsUrl(value)} target="_blank" rel="noreferrer">{t('map')} ↗</a>}
      </div>
    </div>
  );
}
