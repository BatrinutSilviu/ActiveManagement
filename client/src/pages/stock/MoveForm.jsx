import { useState } from 'react';
import { api } from '../../api.js';
import { number } from '../../format.js';
import Modal from '../../components/Modal.jsx';
import Select from '../../components/Select.jsx';
import { blankPurchase, purchaseBody, PurchaseFields } from './PurchaseFields.jsx';

export function MoveForm({ item, people, founders, mode, onClose, onSaved }) {
  const [f, setF] = useState({ from: item.holdings[0]?.person_id || '', to: '', person_id: '', qty: '' });
  const [purchase, setPurchase] = useState(blankPurchase);
  const [error, setError] = useState(null);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const save = async () => {
    try {
      if (mode === 'add') await api.put('/stock/holdings', { item_id: item.id, person_id: f.person_id, qty: f.qty, mode: 'add', ...purchaseBody(purchase, f.person_id, f.qty, item.unit_price) });
      else await api.post('/stock/transfer', { item_id: item.id, from: Number(f.from), to: Number(f.to), qty: f.qty });
      onSaved();
    } catch (e) { setError(e.message); }
  };
  return (
    <Modal title={mode === 'add' ? `Add ${item.name}` : `Move ${item.name}`} onClose={onClose} onSubmit={save}
      footer={<><button type="button" className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary">Save</button></>}>
      {error && <div className="error-box">{error}</div>}
      <div className="form-grid">
        {mode === 'add' ? (
          <label className="field">Kept by
            <Select value={f.person_id} onChange={set('person_id')} required>
              <option value="">Choose founder…</option>
              {founders.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
          </label>
        ) : (
          <>
            <label className="field">From
              <Select value={f.from} onChange={set('from')} required>
                {item.holdings.map((h) => <option key={h.person_id} value={h.person_id}>{h.name} ({number(h.qty)})</option>)}
              </Select>
            </label>
            <label className="field">To
              <Select value={f.to} onChange={set('to')} required>
                <option value="">Choose founder…</option>
                {founders.filter((p) => String(p.id) !== String(f.from)).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </Select>
            </label>
          </>
        )}
        <label className="field">Quantity ({item.unit})<input type="number" min="0.01" step="any" value={f.qty} onChange={set('qty')} autoFocus required /></label>
        {mode === 'add' && <PurchaseFields p={purchase} setP={setPurchase} people={people} holder={f.person_id} qty={f.qty} price={item.unit_price} />}
      </div>
      {mode === 'add' && <p className="hint" style={{ margin: 0 }}>Adds to what this person already holds. Untick “Bought now” for stock that was given to us; to correct a count, edit the number in the table.</p>}
    </Modal>
  );
}
