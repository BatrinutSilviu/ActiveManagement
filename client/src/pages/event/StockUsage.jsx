import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api.js';
import { useAction, useApi, usePermissions } from '../../hooks.js';
import { money, number } from '../../format.js';
import CardError from '../../components/CardError.jsx';
import { confirmDelete } from '../../components/Modal.jsx';
import { IconTrash } from '../../components/Icons.jsx';
import Select from '../../components/Select.jsx';

// What happened to stock after an event: kept (1), partly used (2, quantity unchanged), used up (0).
const afterKey = (k) => (k === 2 ? 'partial' : k ? 'kept' : 'used');
const AFTER_LABELS = { kept: 'Kept — still ours', partial: 'Partly used', used: 'Used up' };
const AFTER_OPTIONS = Object.entries(AFTER_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>);

/** Products taken from stock for the event, and what happened to them after it. */
export default function StockUsage({ e, reload }) {
  const { data: stock, reload: reloadStock } = useApi('/stock');
  const [f, setF] = useState({ item_id: '', person_id: '', qty: '', kept: 'kept' });
  const [error, run] = useAction(() => { reload(); reloadStock(); });
  const { canEdit } = usePermissions();
  const item = stock?.find((i) => String(i.id) === String(f.item_id));
  const holder = item?.holdings.find((h) => String(h.person_id) === String(f.person_id));
  const cost = item && !item.prepaid && Number(f.qty) > 0 ? item.unit_price * Number(f.qty) : 0;

  const add = async (ev) => {
    ev.preventDefault();
    if (await run(() => api.post(`/events/${e.id}/stock`, f))) setF({ item_id: '', person_id: '', qty: '', kept: f.kept });
  };

  return (
    <div className="card">
      <div className="card-pad card-head" style={{ marginBottom: 0 }}>
        <div><h2>Products from stock</h2><p>Cost (price × quantity) is charged to the event, except for products already paid for. Kept and partly used items stay in stock (fix the count on the Stock page if needed); used-up ones come off it.</p></div>
        <span className="muted">{money(e.stock_cost)}</span>
      </div>
      <CardError error={error} />
      {e.stock.length > 0 && (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Product</th><th className="hide-sm">Taken from</th><th className="r hide-sm">Qty</th><th className="hide-sm">After the event</th><th className="r hide-sm">Price</th><th className="r">Cost</th>{canEdit && <th />}</tr></thead>
            <tbody>
              {e.stock.map((s) => (
                <tr key={s.id}>
                  <td>{s.item_name}<div className="row-sub show-sm">{number(s.qty)} {s.unit} × {money(s.unit_price)} · from {s.person_name || '—'} · {AFTER_LABELS[afterKey(s.kept)].toLowerCase()}</div></td>
                  <td className="secondary hide-sm">{s.person_name || '—'}</td>
                  <td className="r hide-sm">{number(s.qty)} {s.unit}</td>
                  <td className="hide-sm">
                    {canEdit ? (
                      <Select className="select-sm" value={afterKey(s.kept)} aria-label={`${s.item_name} after the event`}
                        onChange={(ev) => run(() => api.put(`/event-stock/${s.id}`, { kept: ev.target.value }))}>
                        {AFTER_OPTIONS}
                      </Select>
                    ) : AFTER_LABELS[afterKey(s.kept)]}
                  </td>
                  <td className="r hide-sm">{money(s.unit_price)}</td>
                  <td className={`r ${s.prepaid ? 'secondary' : 'kind-expense'}`}>{s.prepaid ? <span title="Already paid for — not charged to this event">paid already</span> : `−${money(s.cost)}`}</td>
                  {canEdit && (
                    <td className="r actions">
                      <button className="icon-btn" aria-label="Remove and return to stock" title="Remove and return to stock"
                        onClick={() => confirmDelete(s.kept ? 'this line' : `this line (${number(s.qty)} ${s.unit} go back to ${s.person_name || 'stock'})`) && run(() => api.del(`/event-stock/${s.id}`))}><IconTrash /></button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {canEdit && <form className="inline-form" onSubmit={add}>
        <Select className="select-sm" value={f.item_id} onChange={(ev) => setF({ ...f, item_id: ev.target.value, person_id: '', qty: '' })} required>
          <option value="">Product…</option>
          {stock?.map((i) => <option key={i.id} value={i.id} disabled={!i.qty}>{i.name} · {i.prepaid ? 'paid already' : `${money(i.unit_price)}/${i.unit}`} ({number(i.qty)} left)</option>)}
        </Select>
        <Select className="select-sm" value={f.person_id} onChange={(ev) => setF({ ...f, person_id: ev.target.value })} required disabled={!item}>
          <option value="">From…</option>
          {item?.holdings.filter((h) => h.qty > 0).map((h) => <option key={h.person_id} value={h.person_id}>{h.name} ({number(h.qty)})</option>)}
        </Select>
        <input className="select-sm num-input" type="number" min="0.01" step="any" max={holder?.qty} placeholder="Qty" value={f.qty}
          onChange={(ev) => setF({ ...f, qty: ev.target.value })} required aria-label="Quantity" />
        <Select className="select-sm" value={f.kept} onChange={(ev) => setF({ ...f, kept: ev.target.value })} aria-label="After the event">
          {AFTER_OPTIONS}
        </Select>
        <button className="btn btn-sm" disabled={!item}>Add{cost ? ` · ${money(cost)}` : ''}</button>
      </form>}
      {canEdit && stock && !stock.length && <p className="hint" style={{ padding: '0 22px 16px', margin: 0 }}>No products yet — add them on the <Link to="/stock">Stock</Link> page.</p>}
    </div>
  );
}
