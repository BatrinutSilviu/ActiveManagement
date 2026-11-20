// Add / edit a patient, and a package of sessions they pay for together.
import { useState } from 'react';
import { useApi } from '../../hooks.js';
import { api } from '../../api.js';
import { useBusiness } from '../../business.js';
import { CURRENCY, money0 } from '../../format.js';
import Modal from '../../components/Modal.jsx';
import Select from '../../components/Select.jsx';
import { t } from '../../i18n/index.js';
import { localToday } from './common.jsx';

function useForm(initial, send, onSaved) {
  const [f, setF] = useState(initial);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const save = async () => {
    setSaving(true);
    try { const r = await send(f); onSaved(r?.id); } catch (e) { setError(e.message); setSaving(false); }
  };
  return { f, setF, set, error, saving, save };
}

const footer = (onClose, saving) => <>
  <button type="button" className="btn" onClick={onClose}>{t('Cancel')}</button>
  <button className="btn btn-primary" disabled={saving}>{t('Save')}</button>
</>;

/** Other therapies the patient follows with other therapists: what, with whom, where, how often. Optional. */
function OtherTherapies({ rows, onChange }) {
  const change = (i, k) => (e) => onChange(rows.map((r, j) => (j === i ? { ...r, [k]: e.target.value } : r)));
  return (
    <div className="field full">{t('Other therapies')} <span className="hint">— {t('with other therapists (optional)')}</span>
      <div className="stack" style={{ gap: 8 }}>
        {rows.map((r, i) => (
          <div key={i} className="other-therapy">
            <input value={r.therapy || ''} onChange={change(i, 'therapy')} placeholder={t('Therapy, e.g. speech therapy')} required maxLength={120} />
            <input value={r.therapist || ''} onChange={change(i, 'therapist')} placeholder={t('Therapist')} maxLength={120} />
            <input value={r.place || ''} onChange={change(i, 'place')} placeholder={t('Where')} maxLength={200} />
            <input value={r.frequency || ''} onChange={change(i, 'frequency')} placeholder={t('How often, e.g. 2× a week')} maxLength={80} />
            <button type="button" className="icon-btn" aria-label={t('Remove')} onClick={() => onChange(rows.filter((_, j) => j !== i))}>×</button>
          </div>
        ))}
        <div><button type="button" className="btn btn-sm" onClick={() => onChange([...rows, { therapy: '', therapist: '', place: '', frequency: '' }])}>{t('Add therapy')}</button></div>
      </div>
    </div>
  );
}

/** Their diagnoses, one per line, as many as they have; the ones written for other patients are suggested. */
function Diagnoses({ rows, onChange, known }) {
  return (
    <div className="field full">{t('Diagnoses')}
      <div className="stack" style={{ gap: 8 }}>
        {rows.map((r, i) => (
          <div key={i} className="diagnosis-row">
            <input value={r} onChange={(e) => onChange(rows.map((x, j) => (j === i ? e.target.value : x)))} list="diagnoses"
              placeholder={t('Diagnosis')} maxLength={200} aria-label={t('Diagnosis {n}', { n: i + 1 })} />
            <button type="button" className="icon-btn" aria-label={t('Remove')} onClick={() => onChange(rows.filter((_, j) => j !== i))}>×</button>
          </div>
        ))}
        <datalist id="diagnoses">{known.filter((d) => !rows.includes(d)).map((d) => <option key={d} value={d} />)}</datalist>
        <div><button type="button" className="btn btn-sm" onClick={() => onChange([...rows, ''])}>{t('Add diagnosis')}</button></div>
      </div>
    </div>
  );
}

export function PatientForm({ patient, onClose, onSaved }) {
  const { term, business } = useBusiness();
  const entities = business?.entities || [];
  const conditions = business?.conditions || [];
  const { data: all } = useApi('/clients');
  const associations = [...new Set((all || []).map((c) => c.association).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const knownDiagnoses = [...new Set((all || []).flatMap((c) => c.diagnoses || []))].sort((a, b) => a.localeCompare(b));
  const { f, setF, set, error, saving, save } = useForm(
    { first_name: '', last_name: '', phone: '', email: '', address: '', birth_date: '', about: '', conditions: [], other_therapies: [], ...(patient || {}), diagnoses: patient?.diagnoses?.length ? patient.diagnoses : [''], archived: !!patient?.archived },
    (v) => (patient ? api.put(`/clients/${patient.id}`, v) : api.post('/clients', v)), onSaved);
  return (
    <Modal title={patient ? t(`Edit ${term('person')}`) : t(`New ${term('person')}`)} onClose={onClose} onSubmit={save} footer={footer(onClose, saving)}>
      {error && <div className="error-box">{error}</div>}
      <div className="form-grid">
        <label className="field">{t('First name')}<input value={f.first_name || ''} onChange={set('first_name')} required autoFocus /></label>
        <label className="field">{t('Surname')}<input value={f.last_name || ''} onChange={set('last_name')} required /></label>
        <label className="field">{t('Phone')}<input type="tel" value={f.phone || ''} onChange={set('phone')} /></label>
        <label className="field">{t('Email')}<input type="email" value={f.email || ''} onChange={set('email')} /></label>
        <label className="field full">{t('Address')}<input value={f.address || ''} onChange={set('address')} placeholder={t('Where the home visits are')} /></label>
        <label className="field full">{t('Travel fee ({currency})', { currency: CURRENCY })} <span className="hint">— {t('usual cost of driving to them; filled in on home visits')}</span>
          <input type="number" min="0" step="0.01" value={f.travel_fee || ''} onChange={set('travel_fee')} placeholder="0" /></label>
        <label className="field">{t('Birth date')}<input type="date" value={f.birth_date || ''} onChange={set('birth_date')} /></label>
        {(entities.length > 0 || f.entity) && (
          <label className="field full">{t('Legal entity')} <span className="hint">{t('— who they are treated through')}</span>
            <Select value={f.entity || ''} onChange={set('entity')} required>
              <option value="">{t('Choose…')}</option>
              {[...new Set([...entities, ...(f.entity ? [f.entity] : [])])].map((e) => <option key={e} value={e}>{e}</option>)}
            </Select>
          </label>
        )}
        {(conditions.length > 0 || f.conditions?.length > 0) && (
          <div className="field full">{t('Illness categories')} <span className="hint">— {t('tap all that apply')}</span>
            <div className="chips" role="group" aria-label={t('Illness categories')}>
              {[...new Set([...conditions, ...(f.conditions || [])])].map((x) => {
                const on = (f.conditions || []).includes(x);
                return <button type="button" key={x} className={`chip${on ? ' on' : ''}`} aria-pressed={on}
                  onClick={() => setF({ ...f, conditions: on ? f.conditions.filter((y) => y !== x) : [...(f.conditions || []), x] })}>{on ? '✓ ' : ''}{x}</button>;
              })}
            </div>
          </div>
        )}
        <Diagnoses rows={f.diagnoses} onChange={(diagnoses) => setF({ ...f, diagnoses })} known={knownDiagnoses} />
        <label className="field half">{t('Contract number')}<input value={f.contract_number || ''} onChange={set('contract_number')} /></label>
        <label className="field half">{t('Contract date')}<input type="date" value={f.contract_date || ''} onChange={set('contract_date')} /></label>
        <label className="field full">{t('Association')} <span className="hint">{t('— the sponsor they belong to, if any')}</span>
          <input value={f.association || ''} onChange={set('association')} list="associations" />
          <datalist id="associations">{associations.map((a) => <option key={a} value={a} />)}</datalist>
        </label>
        <div className="field full"><strong>{t('Tutor')}</strong> <span className="hint">{t('— the parent or guardian')}</span></div>
        <label className="field">{t('Name')}<input value={f.tutor_name || ''} onChange={set('tutor_name')} /></label>
        <label className="field">{t('Relation')}<input value={f.tutor_relation || ''} onChange={set('tutor_relation')} placeholder={t('Mother, father, grandparent…')} /></label>
        <label className="field">{t('Phone')}<input type="tel" value={f.tutor_phone || ''} onChange={set('tutor_phone')} /></label>
        <label className="field">{t('Email')}<input type="email" value={f.tutor_email || ''} onChange={set('tutor_email')} /></label>
        <OtherTherapies rows={f.other_therapies || []} onChange={(other_therapies) => setF({ ...f, other_therapies })} />
        <label className="field full">{t('About')} <span className="hint">{t('— what to keep in mind: condition, history, what works…')}</span>
          <textarea value={f.about || ''} onChange={set('about')} rows={4} />
        </label>
        {patient && (
          <label className="field full check-field">
            <input type="checkbox" checked={f.archived} onChange={set('archived')} />
            <span>{t('Archived')} <span className="hint">{t('— no longer coming; hidden from the lists, nothing is deleted')}</span></span>
          </label>
        )}
      </div>
    </Modal>
  );
}

/** What a package is made of: rows of a service (or any service) and how many sessions, with the total. */
export function PackageItems({ items, onChange, services }) {
  const { term } = useBusiness();
  const rows = items.length ? items : [{ service_id: '', sessions: '' }];
  const change = (i, k) => (e) => onChange(rows.map((r, j) => (j === i ? { ...r, [k]: e.target.value } : r)));
  const sum = rows.reduce((a, r) => a + (Number(r.sessions) || 0), 0);
  return (
    <div className="field full">{t('What it includes')} <span className="hint">— {t(`${term('events')} of a service, or of any service`)}</span>
      <div className="stack" style={{ gap: 6 }}>
        {rows.map((r, i) => (
          <div key={i} className="package-item">
            <Select value={r.service_id ? String(r.service_id) : ''} onChange={change(i, 'service_id')} aria-label={t('Service')}>
              <option value="">{t('Any service')}</option>
              {services?.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </Select>
            <input type="number" min="1" step="1" value={r.sessions} onChange={change(i, 'sessions')} required aria-label={t(`Number of ${term('events')}`)} />
            <button type="button" className="icon-btn" aria-label={t('Remove')} disabled={rows.length === 1}
              onClick={() => onChange(rows.filter((_, j) => j !== i))}>×</button>
          </div>
        ))}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <button type="button" className="btn btn-sm" onClick={() => onChange([...rows, { service_id: '', sessions: '' }])}>{t('Add service')}</button>
          <span className="hint">{t(`Total: {n} ${term('events')}`, { n: sum })}</span>
        </div>
      </div>
    </div>
  );
}

const itemsForForm = (items) => (items || []).map((it) => ({ service_id: it.service_id ? String(it.service_id) : '', sessions: it.sessions }));

export function PackageForm({ pkg, clientId, onClose, onSaved }) {
  const { term, Term } = useBusiness();
  const { data: kinds } = useApi('/package-types');
  const { data: services } = useApi('/event-types');
  const { f, setF, set, error, saving, save } = useForm(
    { name: t(`10 ${term('events')}`), price: '', date: localToday(), expires: '', note: '', ...(pkg || {}),
      items: pkg ? itemsForForm(pkg.items) : [{ service_id: '', sessions: 10 }] },
    (v) => (pkg ? api.put(`/packages/${pkg.id}`, v) : api.post(`/clients/${clientId}/packages`, v)), onSaved);
  // A package type fills everything in; the expiry is its days from the day it's bought.
  const expiry = (date, days) => {
    if (!date || !days) return '';
    const d = new Date(`${date}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + Number(days));
    return d.toISOString().slice(0, 10);
  };
  const pickKind = (e) => {
    const k = kinds?.find((x) => String(x.id) === e.target.value);
    if (!k) return setF({ ...f, kind: '' });
    setF({ ...f, kind: e.target.value, name: k.name, price: k.price, items: itemsForForm(k.items), valid_days: k.valid_days, expires: expiry(f.date, k.valid_days) });
  };
  const pickDate = (e) => setF({ ...f, date: e.target.value, expires: f.valid_days ? expiry(e.target.value, f.valid_days) : f.expires });
  return (
    <Modal title={pkg ? t('Edit package') : t('New package')} onClose={onClose} onSubmit={save} footer={footer(onClose, saving)}>
      {error && <div className="error-box">{error}</div>}
      <p className="hint" style={{ margin: 0 }}>{t(`A number of ${term('events')} paid for together. ${Term('events')} booked with it have no price of their own; bill the package itself with an invoice or receipt.`)}</p>
      <div className="form-grid">
        {!pkg && kinds?.length > 0 && (
          <label className="field full">{t('Package type')}
            <Select value={f.kind || ''} onChange={pickKind}>
              <option value="">{t('— a package of its own —')}</option>
              {kinds.map((k) => <option key={k.id} value={k.id}>{k.name} · {money0(k.price)}</option>)}
            </Select>
          </label>
        )}
        <label className="field full">{t('Name')}<input value={f.name} onChange={set('name')} required /></label>
        <PackageItems items={f.items} onChange={(items) => setF({ ...f, items })} services={services} />
        <label className="field full">{t('Price ({currency})', { currency: CURRENCY })}<input type="number" min="0" step="0.01" value={f.price} onChange={set('price')} required /></label>
        <label className="field half">{t('Bought on')}<input type="date" value={f.date} onChange={pickDate} required /></label>
        <label className="field half">{t('Valid until')} <span className="hint">{t('(optional)')}</span><input type="date" value={f.expires || ''} onChange={set('expires')} /></label>
        <label className="field full">{t('Note')}<input value={f.note || ''} onChange={set('note')} /></label>
      </div>
    </Modal>
  );
}

/** "3 Terapie manuală · 4 any service": what a package or package type includes. */
export const itemsLabel = (items, term) => (items || []).map((it) => `${it.sessions} ${it.service_name || t(`× any ${term('event')}`)}`).join(' · ');
