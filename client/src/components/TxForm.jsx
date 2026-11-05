import { useState } from 'react';
import Modal from './Modal.jsx';
import { api } from '../api.js';
import { useApi } from '../hooks.js';
import { today } from '../format.js';
import Select from './Select.jsx';

export const PAYMENT_METHODS = ['Cash', 'Card', 'Bank transfer', 'Other'];
const GROUP_LABELS = { organizing: 'Organizing costs', benefit: 'Benefits offered' };

// Add / edit an income or expense. Pass `eventId` to lock it to an event, or `fund`
// ('general' | sport id) to record money spent from / added to a fund.
export default function TxForm({ tx, eventId, eventDate, fund, part, defaultKind = 'income', onClose, onSaved }) {
  const { data: categories } = useApi('/categories');
  const { data: events } = useApi(eventId || fund != null ? null : '/events');
  const { data: sports } = useApi(eventId ? null : '/event-types');
  const { data: parts } = useApi(eventId ? null : '/fund-parts');
  const [f, setF] = useState(() => ({
    kind: defaultKind, amount: '', category_id: '', date: eventDate || today(), description: '',
    payment_method: 'Bank transfer', event_id: eventId || '',
    fund_sport_id: fund && fund !== 'general' ? fund : '', fund_part_id: part || '', ...(tx || {}),
  }));
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const cats = categories?.filter((c) => c.kind === f.kind) || [];
  const isFund = !f.event_id;
  const groups = f.kind === 'expense' && !isFund ? ['organizing', 'benefit'] : [null];
  const fundParts = isFund && f.fund_sport_id ? (parts || []).filter((p) => String(p.sport_id) === String(f.fund_sport_id)) : [];
  const fundName = sports?.find((s) => String(s.id) === String(f.fund_sport_id))?.name;

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
          <Select value={f.category_id || cats[0]?.id || ''} onChange={set('category_id')}>
            {groups.map((g) => {
              const opts = cats.filter((c) => !g || (c.cost_group || 'organizing') === g)
                .map((c) => <option key={c.id} value={c.id}>{c.name}</option>);
              return g ? <optgroup key={g} label={GROUP_LABELS[g]}>{opts}</optgroup> : opts;
            })}
          </Select>
        </label>
        <label className="field">Date
          <input type="date" value={f.date} onChange={set('date')} required />
        </label>
        <label className="field">Payment method
          <Select value={f.payment_method || ''} onChange={set('payment_method')}>
            {PAYMENT_METHODS.map((m) => <option key={m}>{m}</option>)}
          </Select>
        </label>
        {!eventId && fund == null && (
          <label className="field full">Event
            <Select value={f.event_id || ''} onChange={set('event_id')}>
              <option value="">— Not an event: money from / to a fund —</option>
              {events?.map((e) => <option key={e.id} value={e.id}>{e.date} · {e.name}</option>)}
            </Select>
          </label>
        )}
        {isFund && (
          <label className="field full">Fund
            <Select value={f.fund_sport_id || ''} onChange={(e) => setF({ ...f, fund_sport_id: e.target.value, fund_part_id: '' })}>
              <option value="">General community fund</option>
              {sports?.filter((s) => s.is_sport || String(s.id) === String(f.fund_sport_id)).map((s) => <option key={s.id} value={s.id}>{s.name} reinvestment fund</option>)}
            </Select>
            <span className="hint">{f.kind === 'expense' ? 'Spending is subtracted from this fund (a reinvestment).' : 'Added straight to this fund, not split.'}</span>
          </label>
        )}
        {fundParts.length > 0 && (
          <label className="field full">Part of the fund
            <Select value={f.fund_part_id || ''} onChange={set('fund_part_id')}>
              <option value="">The {fundName} fund in general</option>
              {fundParts.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
            <span className="hint">Still paid from the {fundName} fund, but counted apart on its page.</span>
          </label>
        )}
        <label className="field full">Description
          <input value={f.description || ''} onChange={set('description')} placeholder={isFund ? 'e.g. 4 new padel rackets' : 'e.g. Court rental 2h'} />
        </label>
      </div>
    </Modal>
  );
}
