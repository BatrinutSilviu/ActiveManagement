import { useState } from 'react';
import { api } from '../../api.js';
import { money, monthName } from '../../format.js';
import Modal from '../../components/Modal.jsx';
import { r2 } from '../../util.js';

/** Record what was really paid to one person for a month: the amount (what they're owed by default) and the date. */
export function PayForm({ month, person: p, onClose, onSaved }) {
  const [amount, setAmount] = useState(() => String(Math.max(r2(p.owed), 0) || ''));
  const [date_, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  // One id for this form: if it's submitted twice (double click, a retry), the server records the payment once.
  const [requestId] = useState(() => crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const paidBefore = Math.abs(p.paid) >= 0.01;
  const save = async () => {
    if (saving) return;
    setSaving(true);
    try { await api.post(`/payouts/${month}/apply`, { amounts: { [p.id]: amount }, date: date_, request_id: requestId }); onSaved(); } catch (e) { setError(e.message); setSaving(false); }
  };
  return (
    <Modal title={`${paidBefore ? 'Record another payment' : 'Mark as paid'} · ${p.name} · ${monthName(month)}`} onClose={onClose} onSubmit={save}
      footer={<><button type="button" className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={saving}>Record {money(Number(amount) || 0)}</button></>}>
      {error && <div className="error-box">{error}</div>}
      <p className="hint" style={{ margin: 0 }}>Enter what {p.name} was actually sent{paidBefore ? ' this time' : ''} — it can differ from the calculated amount
        (e.g. a round 700). The difference stays visible on this page.</p>
      <div className="form-grid">
        <label className="field">Amount
          <input type="number" step="0.01" value={amount} placeholder="0" onChange={(e) => setAmount(e.target.value)} required autoFocus />
          <span className="hint">
            {paidBefore ? `still owed ${money(p.owed)}` : `calculated ${money(p.total)}`}
            {p.awarded >= 0.01 ? ` (after ${money(p.awarded)} in awards)` : ''}
          </span>
        </label>
        <label className="field">Paid on<input type="date" value={date_} onChange={(e) => setDate(e.target.value)} required /></label>
      </div>
    </Modal>
  );
}
