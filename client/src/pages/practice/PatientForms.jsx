// Add / edit a patient, and a package of sessions they pay for together.
import { useState } from 'react';
import { useApi } from '../../hooks.js';
import { api } from '../../api.js';
import { useBusiness } from '../../business.js';
import { CURRENCY } from '../../format.js';
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
  return { f, set, error, saving, save };
}

const footer = (onClose, saving) => <>
  <button type="button" className="btn" onClick={onClose}>{t('Cancel')}</button>
  <button className="btn btn-primary" disabled={saving}>{t('Save')}</button>
</>;

export function PatientForm({ patient, onClose, onSaved }) {
  const { term, business } = useBusiness();
  const entities = business?.entities || [];
  const { data: all } = useApi('/clients');
  const associations = [...new Set((all || []).map((c) => c.association).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const { f, set, error, saving, save } = useForm(
    { first_name: '', last_name: '', phone: '', email: '', address: '', birth_date: '', about: '', ...(patient || {}), archived: !!patient?.archived },
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
        <label className="field">{t('Birth date')}<input type="date" value={f.birth_date || ''} onChange={set('birth_date')} /></label>
        {(entities.length > 0 || f.entity) && (
          <label className="field full">{t('Legal entity')} <span className="hint">{t('— who they are treated through')}</span>
            <Select value={f.entity || ''} onChange={set('entity')} required>
              <option value="">{t('Choose…')}</option>
              {[...new Set([...entities, ...(f.entity ? [f.entity] : [])])].map((e) => <option key={e} value={e}>{e}</option>)}
            </Select>
          </label>
        )}
        <label className="field">{t('Contract number')}<input value={f.contract_number || ''} onChange={set('contract_number')} /></label>
        <label className="field">{t('Contract date')}<input type="date" value={f.contract_date || ''} onChange={set('contract_date')} /></label>
        <label className="field full">{t('Association')} <span className="hint">{t('— the sponsor they belong to, if any')}</span>
          <input value={f.association || ''} onChange={set('association')} list="associations" />
          <datalist id="associations">{associations.map((a) => <option key={a} value={a} />)}</datalist>
        </label>
        <div className="field full"><strong>{t('Tutor')}</strong> <span className="hint">{t('— the parent or guardian')}</span></div>
        <label className="field">{t('Name')}<input value={f.tutor_name || ''} onChange={set('tutor_name')} /></label>
        <label className="field">{t('Relation')}<input value={f.tutor_relation || ''} onChange={set('tutor_relation')} placeholder={t('Mother, father, grandparent…')} /></label>
        <label className="field">{t('Phone')}<input type="tel" value={f.tutor_phone || ''} onChange={set('tutor_phone')} /></label>
        <label className="field">{t('Email')}<input type="email" value={f.tutor_email || ''} onChange={set('tutor_email')} /></label>
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

export function PackageForm({ pkg, clientId, onClose, onSaved }) {
  const { term, Term } = useBusiness();
  const { f, set, error, saving, save } = useForm(
    { name: t(`10 ${term('events')}`), sessions: 10, price: '', date: localToday(), expires: '', note: '', ...(pkg || {}) },
    (v) => (pkg ? api.put(`/packages/${pkg.id}`, v) : api.post(`/clients/${clientId}/packages`, v)), onSaved);
  return (
    <Modal title={pkg ? t('Edit package') : t('New package')} onClose={onClose} onSubmit={save} footer={footer(onClose, saving)}>
      {error && <div className="error-box">{error}</div>}
      <p className="hint" style={{ margin: 0 }}>{t(`A number of ${term('events')} paid for together. ${Term('events')} booked with it have no price of their own; bill the package itself with an invoice or receipt.`)}</p>
      <div className="form-grid">
        <label className="field full">{t('Name')}<input value={f.name} onChange={set('name')} required /></label>
        <label className="field">{t(`Number of ${term('events')}`)}<input type="number" min="1" step="1" value={f.sessions} onChange={set('sessions')} required /></label>
        <label className="field">{t('Price ({currency})', { currency: CURRENCY })}<input type="number" min="0" step="0.01" value={f.price} onChange={set('price')} required /></label>
        <label className="field">{t('Bought on')}<input type="date" value={f.date} onChange={set('date')} required /></label>
        <label className="field">{t('Valid until')} <span className="hint">{t('(optional)')}</span><input type="date" value={f.expires || ''} onChange={set('expires')} /></label>
        <label className="field full">{t('Note')}<input value={f.note || ''} onChange={set('note')} /></label>
      </div>
    </Modal>
  );
}
