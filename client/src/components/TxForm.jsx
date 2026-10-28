import { useState } from 'react';
import Modal from './Modal.jsx';
import { api } from '../api.js';
import { useApi } from '../hooks.js';
import { today } from '../format.js';

export const PAYMENT_METHODS = ['Cash', 'Card', 'Bank transfer', 'Other'];
const GROUP_LABELS = { organizing: 'Organizing costs', benefit: 'Benefits offered' };

// Add / edit an income or expense. Pass `eventId` to lock it to an event, or `fund`
// ('general' | sport id) to record money spent from / added to a fund.
export default function TxForm({ tx, eventId, eventDate, fund, defaultKind = 'income', onClose, onSaved }) {
  const { data: categories } = useApi('/categories');
  const { data: events } = useApi(eventId || fund != null ? null : '/events');
  const { data: sports } = useApi(eventId ? null : '/event-types');
  const [f, setF] = useState(() => ({
    kind: defaultKind, amount: '', category_id: '', date: eventDate || today(), description: '',
    payment_method: 'Bank transfer', event_id: eventId || '',
    fund_sport_id: fund && fund !== 'general' ? fund : '', ...(tx || {}),
  }));
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const cats = categories?.filter((c) => c.kind === f.kind) || [];
  const isFund = !f.event_id;
  const groups = f.kind === 'expense' && !isFund ? ['organizing', 'benefit'] : [null];

  const save = async () => {
    setSaving(true);
    try {
      const body = { ...f, category_id: f.category_id || cats[0]?.id };
      if (tx) await api.put(`/transactions/${tx.id}`, body);
      else await api.post('/transactions', body);
      onSaved();
    } catch (e) {
      setError(e.message);
      setSaving(false);
    }
  };

  const title = tx ? 'Edit transaction'
    : isFund ? (f.kind === 'expense' ? 'Record reinvestment' : 'Add money to a fund')
    : f.kind === 'income' ? 'Add income' : 'Add cost';

  return (
    <Modal title={title} onClose={onClose} onSubmit={save}
      footer={<>
        <button type="button" className="btn" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" disabled={saving}>Save</button>
      </>}>
      {error && <div className="error-box">{error}</div>}
      <div className="segmented" role="radiogroup" aria-label="Kind">
        {['expense', 'income'].map((k) => (
          <button type="button" key={k} className={f.kind === k ? 'on' : ''} role="radio" aria-checked={f.kind === k}
            onClick={() => setF({ ...f, kind: k, category_id: '' })}>
            {k === 'income' ? (isFund ? 'Money in (donation…)' : 'Income') : (isFund ? 'Money spent' : 'Cost')}
          </button>
        ))}
      </div>
      <div className="form-grid">
        <label className="field">Amount (RON)
          <input type="number" min="0.01" step="0.01" value={f.amount} onChange={set('amount')} autoFocus required />
        </label>
        <label className="field">Category
          <select value={f.category_id || cats[0]?.id || ''} onChange={set('category_id')}>
            {groups.map((g) => {
              const opts = cats.filter((c) => !g || (c.cost_group || 'organizing') === g)
                .map((c) => <option key={c.id} value={c.id}>{c.name}</option>);
              return g ? <optgroup key={g} label={GROUP_LABELS[g]}>{opts}</optgroup> : opts;
            })}
          </select>
        </label>
        <label className="field">Date
          <input type="date" value={f.date} onChange={set('date')} required />
        </label>
        <label className="field">Payment method
          <select value={f.payment_method || ''} onChange={set('payment_method')}>
            {PAYMENT_METHODS.map((m) => <option key={m}>{m}</option>)}
          </select>
        </label>
        {!eventId && fund == null && (
          <label className="field full">Event
            <select value={f.event_id || ''} onChange={set('event_id')}>
              <option value="">— Not an event: money from / to a fund —</option>
              {events?.map((e) => <option key={e.id} value={e.id}>{e.date} · {e.name}</option>)}
            </select>
          </label>
        )}
        {isFund && (
          <label className="field full">Fund
            <select value={f.fund_sport_id || ''} onChange={set('fund_sport_id')}>
              <option value="">General community fund</option>
              {sports?.map((s) => <option key={s.id} value={s.id}>{s.name} reinvestment fund</option>)}
            </select>
            <span className="hint">{f.kind === 'expense' ? 'Spending is subtracted from this fund (a reinvestment).' : 'Added straight to this fund, not split.'}</span>
          </label>
        )}
        <label className="field full">Description
          <input value={f.description || ''} onChange={set('description')} placeholder={isFund ? 'e.g. 4 new padel rackets' : 'e.g. Court rental 2h'} />
        </label>
      </div>
    </Modal>
  );
}
