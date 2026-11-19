// Add / edit a patient, and a package of sessions they pay for together.
import { useState } from 'react';
import { api } from '../../api.js';
import { useBusiness } from '../../business.js';
import { CURRENCY } from '../../format.js';
import Modal from '../../components/Modal.jsx';
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
  <button type="button" className="btn" onClick={onClose}>Cancel</button>
  <button className="btn btn-primary" disabled={saving}>Save</button>
</>;

export function PatientForm({ patient, onClose, onSaved }) {
  const { term } = useBusiness();
  const { f, set, error, saving, save } = useForm(
    { first_name: '', last_name: '', phone: '', email: '', address: '', birth_date: '', about: '', ...(patient || {}), archived: !!patient?.archived },
    (v) => (patient ? api.put(`/clients/${patient.id}`, v) : api.post('/clients', v)), onSaved);
  return (
    <Modal title={patient ? `Edit ${term('person')}` : `New ${term('person')}`} onClose={onClose} onSubmit={save} footer={footer(onClose, saving)}>
      {error && <div className="error-box">{error}</div>}
      <div className="form-grid">
        <label className="field">First name<input value={f.first_name || ''} onChange={set('first_name')} required autoFocus /></label>
        <label className="field">Surname<input value={f.last_name || ''} onChange={set('last_name')} required /></label>
        <label className="field">Phone<input type="tel" value={f.phone || ''} onChange={set('phone')} /></label>
        <label className="field">Email<input type="email" value={f.email || ''} onChange={set('email')} /></label>
        <label className="field full">Address<input value={f.address || ''} onChange={set('address')} placeholder="Where the home visits are" /></label>
        <label className="field">Birth date<input type="date" value={f.birth_date || ''} onChange={set('birth_date')} /></label>
        <div className="field full"><strong>Tutor</strong> <span className="hint">— the parent or guardian</span></div>
        <label className="field">Name<input value={f.tutor_name || ''} onChange={set('tutor_name')} /></label>
        <label className="field">Relation<input value={f.tutor_relation || ''} onChange={set('tutor_relation')} placeholder="Mother, father, grandparent…" /></label>
        <label className="field">Phone<input type="tel" value={f.tutor_phone || ''} onChange={set('tutor_phone')} /></label>
        <label className="field">Email<input type="email" value={f.tutor_email || ''} onChange={set('tutor_email')} /></label>
        <label className="field full">About <span className="hint">— what to keep in mind: condition, history, what works…</span>
          <textarea value={f.about || ''} onChange={set('about')} rows={4} />
        </label>
        {patient && (
          <label className="field full check-field">
            <input type="checkbox" checked={f.archived} onChange={set('archived')} />
            <span>Archived <span className="hint">— no longer coming; hidden from the lists, nothing is deleted</span></span>
          </label>
        )}
      </div>
    </Modal>
  );
}

export function PackageForm({ pkg, clientId, onClose, onSaved }) {
  const { term } = useBusiness();
  const { f, set, error, saving, save } = useForm(
    { name: '10 sessions', sessions: 10, price: '', date: localToday(), expires: '', note: '', ...(pkg || {}) },
    (v) => (pkg ? api.put(`/packages/${pkg.id}`, v) : api.post(`/clients/${clientId}/packages`, v)), onSaved);
  return (
    <Modal title={pkg ? 'Edit package' : 'New package'} onClose={onClose} onSubmit={save} footer={footer(onClose, saving)}>
      {error && <div className="error-box">{error}</div>}
      <p className="hint" style={{ margin: 0 }}>A number of {term('events')} paid for together. {term('events')[0].toUpperCase() + term('events').slice(1)} booked
        with it have no price of their own; bill the package itself with an invoice or receipt.</p>
      <div className="form-grid">
        <label className="field full">Name<input value={f.name} onChange={set('name')} required /></label>
        <label className="field">Number of {term('events')}<input type="number" min="1" step="1" value={f.sessions} onChange={set('sessions')} required /></label>
        <label className="field">Price ({CURRENCY})<input type="number" min="0" step="0.01" value={f.price} onChange={set('price')} required /></label>
        <label className="field">Bought on<input type="date" value={f.date} onChange={set('date')} required /></label>
        <label className="field">Valid until <span className="hint">(optional)</span><input type="date" value={f.expires || ''} onChange={set('expires')} /></label>
        <label className="field full">Note<input value={f.note || ''} onChange={set('note')} /></label>
      </div>
    </Modal>
  );
}
