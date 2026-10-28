import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useApi, usePersistentState } from '../hooks.js';
import { money, money0, number } from '../format.js';
import Modal, { confirmDelete } from '../components/Modal.jsx';
import Kpi from '../components/Kpi.jsx';
import { IconBox, IconPlus, IconTrash, IconUsers } from '../components/Icons.jsx';

function ItemForm({ item, people, onClose, onSaved }) {
  const [f, setF] = useState(() => ({ name: '', unit: 'pcs', unit_price: '', person_id: '', qty: '', ...(item || {}) }));
  const [error, setError] = useState(null);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const save = async () => {
    try {
      if (item) await api.put(`/stock/items/${item.id}`, f);
      else await api.post('/stock/items', f);
      onSaved();
    } catch (e) { setError(e.message); }
  };
  return (
    <Modal title={item ? `Edit ${item.name}` : 'New product'} onClose={onClose} onSubmit={save}
      footer={<><button type="button" className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary">Save</button></>}>
      {error && <div className="error-box">{error}</div>}
      <div className="form-grid">
        <label className="field full">Name<input value={f.name} onChange={set('name')} placeholder="e.g. Water 0.5L" autoFocus required /></label>
        <label className="field">Unit<input value={f.unit} onChange={set('unit')} placeholder="pcs, bottles, kg…" /></label>
        <label className="field">Price per unit (RON)<input type="number" min="0" step="0.01" value={f.unit_price} onChange={set('unit_price')} required /></label>
        {!item && (
          <>
            <label className="field">Held by
              <select value={f.person_id} onChange={set('person_id')}>
                <option value="">— nobody yet —</option>
                {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </label>
            <label className="field">Quantity<input type="number" min="0" step="any" value={f.qty} onChange={set('qty')} disabled={!f.person_id} /></label>
          </>
        )}
      </div>
    </Modal>
  );
}

function MoveForm({ item, people, mode, onClose, onSaved }) {
  const [f, setF] = useState({ from: item.holdings[0]?.person_id || '', to: '', person_id: '', qty: '' });
  const [error, setError] = useState(null);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const save = async () => {
    try {
      if (mode === 'add') await api.put('/stock/holdings', { item_id: item.id, person_id: f.person_id, qty: f.qty, mode: 'add' });
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
          <label className="field">To
            <select value={f.person_id} onChange={set('person_id')} required>
              <option value="">Choose person…</option>
              {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
        ) : (
          <>
            <label className="field">From
              <select value={f.from} onChange={set('from')} required>
                {item.holdings.map((h) => <option key={h.person_id} value={h.person_id}>{h.name} ({number(h.qty)})</option>)}
              </select>
            </label>
            <label className="field">To
              <select value={f.to} onChange={set('to')} required>
                <option value="">Choose person…</option>
                {people.filter((p) => String(p.id) !== String(f.from)).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </label>
          </>
        )}
        <label className="field">Quantity ({item.unit})<input type="number" min="0.01" step="any" value={f.qty} onChange={set('qty')} autoFocus required /></label>
      </div>
      {mode === 'add' && <p className="hint" style={{ margin: 0 }}>Adds to what this person already holds. To correct a count, edit the number in the table.</p>}
    </Modal>
  );
}

// Inline number editor that saves on blur / Enter.
function InlineNumber({ value, onSave, step = 'any', prefix, width = 84 }) {
  const [v, setV] = useState(String(value));
  useEffect(() => setV(String(value)), [value]);
  const commit = () => { if (Number(v) !== Number(value) && v !== '') onSave(Number(v)); };
  return (
    <span className="inline-num">
      {prefix}
      <input className="select-sm num-input" type="number" min="0" step={step} value={v} style={{ width }}
        onChange={(e) => setV(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} />
    </span>
  );
}

export default function Stock() {
  const { data: items, reload } = useApi('/stock');
  const { data: allPeople, reload: reloadPeople } = useApi('/people');
  const [view, setView] = usePersistentState('am-stock-view', 'items');
  const [form, setForm] = useState(null); // { item? } | { move: item, mode }
  const [error, setError] = useState(null);
  const people = allPeople?.filter((p) => p.active) || [];
  const refresh = () => { reload(); reloadPeople(); };
  const run = async (fn) => { try { await fn(); setError(null); refresh(); } catch (e) { setError(e.message); refresh(); } };

  if (!items || !allPeople) return null;
  const totalValue = items.reduce((s, i) => s + i.value, 0);
  const holders = people.map((p) => ({
    ...p, items: items.flatMap((i) => i.holdings.filter((h) => h.person_id === p.id).map((h) => ({ ...h, item: i }))),
  })).filter((p) => p.items.length);

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Stock</h1>
          <p>Products the community owns, who holds them, and what they’re worth. Using them at an event charges their cost to the event.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setForm({})}><IconPlus width="16" />New product</button>
      </div>

      <div className="stack">
        {error && <div className="error-box">{error}</div>}
        <div className="grid grid-kpi">
          <Kpi label="Stock value" icon={IconBox} tone="profit" value={money0(totalValue)} sub={`${items.length} products`} />
          <Kpi label="People holding stock" icon={IconUsers} value={holders.length} sub={holders.map((h) => h.name.split(' ')[0]).join(', ') || '—'} />
          <Kpi label="Running low" value={items.filter((i) => i.qty <= 5).length} sub={items.filter((i) => i.qty <= 5).map((i) => i.name).join(', ') || 'nothing'} />
        </div>

        <div className="segmented" style={{ alignSelf: 'flex-start' }}>
          <button className={view === 'items' ? 'on' : ''} onClick={() => setView('items')}>By product</button>
          <button className={view === 'people' ? 'on' : ''} onClick={() => setView('people')}>By person</button>
        </div>

        {view === 'items' ? (
          <div className="card table-wrap">
            {items.length ? (
              <table>
                <thead><tr><th>Product</th><th className="r">Price / unit</th><th>Who has it</th><th className="r">Total</th><th className="r">Value</th><th className="r">Used at events</th><th /></tr></thead>
                <tbody>
                  {items.map((i) => (
                    <tr key={i.id}>
                      <td><div className="row-title">{i.name}</div><div className="row-sub">{i.unit}</div></td>
                      <td className="r">
                        <InlineNumber value={i.unit_price} step="0.01" width={90}
                          onSave={(v) => run(() => api.put(`/stock/items/${i.id}`, { ...i, unit_price: v }))} />
                      </td>
                      <td className="cell-wrap">
                        <div className="holders">
                          {i.holdings.map((h) => (
                            <span className="holder" key={h.person_id}>
                              {h.name.split(' ')[0]}
                              <InlineNumber value={h.qty} width={64}
                                onSave={(v) => run(() => api.put('/stock/holdings', { item_id: i.id, person_id: h.person_id, qty: v }))} />
                            </span>
                          ))}
                          <button className="btn btn-sm btn-ghost" onClick={() => setForm({ move: i, mode: 'add' })}><IconPlus width="13" />Add</button>
                          {i.holdings.length > 0 && <button className="btn btn-sm btn-ghost" onClick={() => setForm({ move: i, mode: 'move' })}>Move</button>}
                        </div>
                      </td>
                      <td className={`r ${i.qty <= 5 ? 'neg' : ''}`}><strong>{number(i.qty)}</strong> <span className="muted">{i.unit}</span></td>
                      <td className="r">{money(i.value)}</td>
                      <td className="r secondary">{number(i.used)}</td>
                      <td className="r">
                        <button className="btn btn-sm btn-ghost" onClick={() => setForm({ item: i })}>Edit</button>
                        <button className="icon-btn" aria-label="Delete" onClick={() => confirmDelete(i.name) && run(() => api.del(`/stock/items/${i.id}`))}><IconTrash /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot><tr><td colSpan={4}>Total value</td><td className="r">{money(totalValue)}</td><td colSpan={2} /></tr></tfoot>
              </table>
            ) : <div className="empty">No products yet. Add water, fruit, balls… with their price.</div>}
          </div>
        ) : (
          <div className="grid grid-2">
            {holders.map((p) => (
              <div className="card" key={p.id}>
                <div className="card-pad card-head" style={{ marginBottom: 0 }}>
                  <div><h2>{p.name}</h2><p>{p.items.length} products · {money0(p.items.reduce((s, h) => s + h.qty * h.item.unit_price, 0))}</p></div>
                </div>
                <div className="table-wrap">
                  <table>
                    <tbody>
                      {p.items.map((h) => (
                        <tr key={h.item.id}>
                          <td>{h.item.name}</td>
                          <td className="r">
                            <InlineNumber value={h.qty} width={70}
                              onSave={(v) => run(() => api.put('/stock/holdings', { item_id: h.item.id, person_id: p.id, qty: v }))} />
                            {' '}<span className="muted">{h.item.unit}</span>
                          </td>
                          <td className="r secondary">{money(h.qty * h.item.unit_price)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
            {!holders.length && <div className="card empty">Nobody holds stock yet.</div>}
          </div>
        )}
        {!people.length && <p className="hint">Add people in <Link to="/settings">Settings → People</Link> to assign stock to them.</p>}
      </div>

      {form && !form.move && <ItemForm item={form.item} people={people} onClose={() => setForm(null)} onSaved={() => { setForm(null); refresh(); }} />}
      {form?.move && <MoveForm item={form.move} mode={form.mode} people={people} onClose={() => setForm(null)} onSaved={() => { setForm(null); refresh(); }} />}
    </div>
  );
}
