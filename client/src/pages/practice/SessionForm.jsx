// Book or change a session: patient, service, when, where, and how it's paid (its own price, or a package).
import { useEffect, useState } from 'react';
import { api } from '../../api.js';
import { useApi } from '../../hooks.js';
import { useBusiness } from '../../business.js';
import { CURRENCY, money0 } from '../../format.js';
import Modal from '../../components/Modal.jsx';
import Select from '../../components/Select.jsx';
import { localToday, SESSION_STATUS } from './common.jsx';

export default function SessionForm({ session, clientId, date, onClose, onSaved }) {
  const { term, Term } = useBusiness();
  const { data: clients, reload: reloadClients } = useApi('/clients');
  const { data: types } = useApi('/event-types');
  const [f, setF] = useState(() => ({
    client_id: clientId || '', type_id: '', date: date || localToday(), start_time: '', end_time: '', address: '',
    status: 'scheduled', price: '', package_id: '', note: '',
    ...(session || {}),
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
    if (session || !packages) return;
    const open = packages.find((p) => p.left > 0 && (!p.expires || p.expires >= f.date));
    setF((x) => ({ ...x, package_id: open ? String(open.id) : '' }));
  }, [packages]); // eslint-disable-line react-hooks/exhaustive-deps

  const client = clients?.find((c) => String(c.id) === String(f.client_id));
  // Packages it can use: with sessions left, or the one it's already in.
  const usable = (packages || []).filter((p) => p.left > 0 || String(p.id) === String(session?.package_id));

  const pickType = (e) => {
    const t = types?.find((x) => String(x.id) === e.target.value);
    setF({ ...f, type_id: e.target.value, price: t?.default_fee ? String(t.default_fee) : f.price });
  };
  const addClient = async (name) => {
    const n = name || window.prompt(`Name of the new ${term('person')}:`);
    if (!n?.trim()) return;
    const { id } = await api.post('/clients', { name: n.trim() });
    await reloadClients();
    setF((x) => ({ ...x, client_id: String(id), package_id: '' }));
  };

  const save = async () => {
    setSaving(true);
    try {
      const body = { ...f, package_id: f.package_id || null, type_id: f.type_id || null };
      const r = session ? await api.put(`/appointments/${session.id}`, body) : await api.post('/appointments', body);
      onSaved(session?.id ?? r.id);
    } catch (e) { setError(e.message); setSaving(false); }
  };

  return (
    <Modal title={session ? `Edit ${term('event')}` : `New ${term('event')}`} onClose={onClose} onSubmit={save}
      footer={<>
        <button type="button" className="btn" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" disabled={saving}>Save</button>
      </>}>
      {error && <div className="error-box">{error}</div>}
      <div className="segmented" role="radiogroup" aria-label="Status">
        {Object.entries(SESSION_STATUS).map(([k, label]) => (
          <button type="button" key={k} className={f.status === k ? 'on' : ''} role="radio" aria-checked={f.status === k}
            onClick={() => setF({ ...f, status: k })}>{label}</button>
        ))}
      </div>
      <div className="form-grid">
        <label className="field full">{Term('person')}
          <Select value={f.client_id ? String(f.client_id) : ''} onChange={(e) => setF({ ...f, client_id: e.target.value, package_id: '' })}
            onCreate={addClient} createLabel={`New ${term('person')}`}>
            <option value="">— choose —</option>
            {clients?.filter((c) => !c.archived || String(c.id) === String(f.client_id)).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </label>
        <label className="field">{Term('sport')}
          <Select value={f.type_id ? String(f.type_id) : ''} onChange={pickType}>
            <option value="">—</option>
            {types?.map((t) => <option key={t.id} value={t.id}>{t.name}{t.default_fee ? ` · ${money0(t.default_fee)}` : ''}</option>)}
          </Select>
        </label>
        <label className="field">Date<input type="date" value={f.date} onChange={set('date')} required /></label>
        <label className="field">From<input type="time" value={f.start_time || ''} onChange={set('start_time')} /></label>
        <label className="field">To<input type="time" value={f.end_time || ''} onChange={set('end_time')} /></label>
        <label className="field full">Address
          <input value={f.address || ''} onChange={set('address')} placeholder={client?.address ? `${client.address} (their address)` : 'Where the session is'} />
        </label>
        {f.client_id && (
          <label className="field">Paid with
            <Select value={f.package_id ? String(f.package_id) : ''} onChange={set('package_id')}>
              <option value="">Its own price</option>
              {usable.map((p) => <option key={p.id} value={p.id}>{p.name} · {p.left} left</option>)}
            </Select>
          </label>
        )}
        {!f.package_id && (
          <label className="field">Price ({CURRENCY})
            <input type="number" min="0" step="0.01" value={f.price} onChange={set('price')} />
          </label>
        )}
        <label className="field full">Note <span className="hint">— about this {term('event')} (notes about the {term('person')} are on their page)</span>
          <textarea value={f.note || ''} onChange={set('note')} rows={2} />
        </label>
      </div>
    </Modal>
  );
}
