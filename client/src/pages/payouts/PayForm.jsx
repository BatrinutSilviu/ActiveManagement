import { useState } from 'react';
import { api } from '../../api.js';
import { money, monthName } from '../../format.js';
import Modal from '../../components/Modal.jsx';
import { r2 } from '../../util.js';

/** Record what was really paid for a month: each person's amount (owed by default) and the date. */
export function PayForm({ month, r, onClose, onSaved }) {
  const [amounts, setAmounts] = useState(() => Object.fromEntries(r.people.map((p) => [p.id, String(Math.max(r2(p.owed), 0) || '')])));
  const [date_, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  // One id for this form: if it's submitted twice (double click, a retry), the server records the payment once.
  const [requestId] = useState(() => crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const total = Object.values(amounts).reduce((a, v) => a + (Number(v) || 0), 0);
  const paidAny = !!r.payout.paidAt;
  const save = async () => {
    if (saving) return;
    setSaving(true);
    try { await api.post(`/payouts/${month}/apply`, { amounts, date: date_, request_id: requestId }); onSaved(); } catch (e) { setError(e.message); setSaving(false); }
  };
  return (
    <Modal title={`${paidAny ? 'Record another payment' : 'Mark as paid'} · ${monthName(month)}`} onClose={onClose} onSubmit={save}
      footer={<><button type="button" className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={saving}>Record {money(total)}</button></>}>
      {error && <div className="error-box">{error}</div>}
      <p className="hint" style={{ margin: 0 }}>Enter what each person was actually sent{paidAny ? ' this time' : ''} — it can differ from the calculated amount
        (e.g. a round 700 each). The difference stays visible on this page.{r.liveEvents ? ` ${r.liveEvents} live event${r.liveEvents > 1 ? 's aren’t' : ' isn’t'} counted yet.` : ''}</p>
      <div className="form-grid">
        {r.people.map((p) => (
          <label key={p.id} className="field">{p.name}
            <input type="number" step="0.01" value={amounts[p.id] ?? ''} placeholder="0" onChange={(e) => setAmounts({ ...amounts, [p.id]: e.target.value })} />
            <span className="hint">{paidAny ? `still owed ${money(p.owed)}` : `calculated ${money(p.total)}`}</span>
          </label>
        ))}
        <label className="field">Paid on<input type="date" value={date_} onChange={(e) => setDate(e.target.value)} required /></label>
      </div>
    </Modal>
  );
}
