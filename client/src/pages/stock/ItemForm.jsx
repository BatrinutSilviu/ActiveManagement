import { useState } from 'react';
import { api } from '../../api.js';
import { number } from '../../format.js';
import Modal from '../../components/Modal.jsx';
import { IconPlus } from '../../components/Icons.jsx';
import Select from '../../components/Select.jsx';
import { blankPurchase, purchaseBody, PurchaseFields } from './PurchaseFields.jsx';
import { CategorySelect } from './CategorySelect.jsx';

export function ItemForm({ item, category, cats, people, founders, onClose, onSaved }) {
  const [f, setF] = useState(() => ({ name: '', unit: 'pcs', unit_price: '', person_id: '', qty: '', category_id: category || '', prepaid: 0, ...(item || {}) }));
  // On edit: how much each person holds, editable; people can be added.
  const [held, setHeld] = useState(() => (item?.holdings || []).map((h) => ({ person_id: h.person_id, qty: String(h.qty), was: h.qty })));
  const [purchase, setPurchase] = useState(blankPurchase);
  const [error, setError] = useState(null);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const setQty = (i, qty) => setHeld(held.map((h, j) => (j === i ? { ...h, qty } : h)));
  const total = held.reduce((s, h) => s + (Number(h.qty) || 0), 0);
  const save = async () => {
    try {
      if (item) {
        await api.put(`/stock/items/${item.id}`, f);
        for (const h of held) {
          if (!h.person_id || h.qty === '' || Number(h.qty) === h.was) continue;
          await api.put('/stock/holdings', { item_id: item.id, person_id: h.person_id, qty: Number(h.qty) });
        }
      } else await api.post('/stock/items', { ...f, ...(f.person_id && Number(f.qty) > 0 ? purchaseBody(purchase, f.person_id, f.qty, f.unit_price) : {}) });
      onSaved();
    } catch (e) { setError(e.message); }
  };
  const free = founders.filter((p) => !held.some((h) => String(h.person_id) === String(p.id)));
  return (
    <Modal title={item ? `Edit ${item.name}` : 'New product'} onClose={onClose} onSubmit={save}
      footer={<><button type="button" className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary">Save</button></>}>
      {error && <div className="error-box">{error}</div>}
      <div className="form-grid">
        <label className="field full">Name<input value={f.name} onChange={set('name')} placeholder="e.g. Water 0.5L" autoFocus required /></label>
        <label className="field">Category<CategorySelect cats={cats} value={f.category_id} onChange={set('category_id')} /></label>
        <label className="field">Unit<input value={f.unit} onChange={set('unit')} placeholder="pcs, bottles, kg…" /></label>
        <label className="field">Price per unit (RON)<input type="number" min="0" step="0.01" value={f.unit_price} onChange={set('unit_price')} required /></label>
        <label className="field full check-field">
          <input type="checkbox" checked={!!f.prepaid} onChange={(e) => setF({ ...f, prepaid: e.target.checked ? 1 : 0 })} />
          <span>Already paid for <span className="hint">— bought earlier (e.g. from a fund): events that use it aren’t charged for it, including past ones</span></span>
        </label>
        {!item ? (
          <>
            <label className="field">Held by
              <Select value={f.person_id} onChange={set('person_id')}>
                <option value="">— nobody yet —</option>
                {founders.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </Select>
            </label>
            <label className="field">Quantity<input type="number" min="0" step="any" value={f.qty} onChange={set('qty')} disabled={!f.person_id} /></label>
            {f.person_id && Number(f.qty) > 0 && (
              <PurchaseFields p={purchase} setP={setPurchase} people={people} holder={f.person_id} qty={f.qty} price={f.unit_price} />
            )}
          </>
        ) : (
          <>
            <div className="full form-section">Quantity <span className="hint">— {number(total)} {f.unit || ''} in total</span></div>
            {held.map((h, i) => {
              const known = people.find((p) => String(p.id) === String(h.person_id)) || item.holdings.find((x) => x.person_id === h.person_id);
              return (
                <label className="field" key={i}>{h.was !== undefined ? `Held by ${known?.name || '—'}` : (
                  <Select className="select-sm" value={h.person_id} onChange={(e) => setHeld(held.map((x, j) => (j === i ? { ...x, person_id: e.target.value } : x)))} required aria-label="Held by">
                    <option value="">Who holds it…</option>
                    {[...free, ...(known ? [known] : [])].map((p) => <option key={p.id ?? p.person_id} value={p.id ?? p.person_id}>{p.name}</option>)}
                  </Select>
                )}
                  <input type="number" min="0" step="any" value={h.qty} onChange={(e) => setQty(i, e.target.value)} aria-label="Quantity" />
                </label>
              );
            })}
            {free.length > 0 && (
              <div className="full">
                <button type="button" className="btn btn-sm btn-ghost" onClick={() => setHeld([...held, { person_id: '', qty: '' }])}>
                  <IconPlus width="13" />{held.length ? 'Someone else holds some too' : 'Set who holds it'}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}
