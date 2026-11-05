import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useApi, usePermissions, usePersistentState } from '../hooks.js';
import { date, money, money0, number } from '../format.js';
import Modal, { confirmDelete } from '../components/Modal.jsx';
import Kpi from '../components/Kpi.jsx';
import Equipment from './Equipment.jsx';
import { IconBox, IconChevronRight, IconEdit, IconPlus, IconTrash, IconUsers } from '../components/Icons.jsx';
import Select from '../components/Select.jsx';

export const PURCHASE_KINDS = { items: 'Usual items / prizes', merch: 'Partnership merchandise' };
const today = () => new Date().toISOString().slice(0, 10);
export const blankPurchase = () => ({ on: true, person_id: '', kind: 'items', amount: '', date: today() });

/** Turns the purchase fields into what the API expects (or nothing when it wasn't bought). */
const purchaseBody = (p, holder, qty, price) => (p.on
  ? { purchase: { kind: p.kind, person_id: p.person_id || holder, date: p.date, amount: p.amount === '' ? (Number(qty) || 0) * (Number(price) || 0) : p.amount } }
  : {});

/** "Bought just now": who bought it, what kind of purchase, what they paid — it earns them points. */
function PurchaseFields({ p, setP, people, holder, qty, price }) {
  const { data: rates } = useApi('/settings/points-rates');
  const set = (k) => (e) => setP({ ...p, [k]: e.target.value });
  const auto = (Number(qty) || 0) * (Number(price) || 0);
  const amount = p.amount === '' ? auto : Number(p.amount) || 0;
  const [step, pts] = rates ? (p.kind === 'merch' ? [rates.merchStep, rates.merchPoints] : [rates.itemsStep, rates.itemsPoints]) : [0, 0];
  const points = step > 0 ? Math.round((amount / step) * pts * 100) / 100 : 0;
  return (
    <>
      <label className="field full check-field">
        <input type="checkbox" checked={p.on} onChange={(e) => setP({ ...p, on: e.target.checked })} />
        Bought now — the buyer gets points for it
      </label>
      {p.on && (
        <>
          <label className="field">Bought by
            <Select value={p.person_id || holder || ''} onChange={set('person_id')} required>
              <option value="">Choose person…</option>
              {people.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </Select>
          </label>
          <label className="field">Kind of purchase
            <Select value={p.kind} onChange={set('kind')}>
              {Object.entries(PURCHASE_KINDS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </Select>
          </label>
          <label className="field">Paid (RON)
            <input type="number" min="0" step="0.01" value={p.amount} onChange={set('amount')} placeholder={String(auto)} />
            <span className="hint">{p.amount === '' ? 'Quantity × price; type the real amount if different' : ' '}</span>
          </label>
          <label className="field">Date<input type="date" value={p.date} onChange={set('date')} required /></label>
          <p className="hint full" style={{ margin: 0 }}>{number(points)} points{rates && step > 0 ? ` (${number(pts)} per ${number(step)} RON for ${PURCHASE_KINDS[p.kind].toLowerCase()})` : ''}</p>
        </>
      )}
    </>
  );
}

/** Category picker: the big categories, each followed by its subcategories. */
function CategorySelect({ cats, value, onChange, placeholder = 'Choose…', ...props }) {
  const top = cats.filter((c) => !c.parent_id);
  return (
    <Select value={value || ''} onChange={onChange} required {...props}>
      <option value="">{placeholder}</option>
      {top.map((c) => (
        <optgroup key={c.id} label={c.name}>
          <option value={c.id}>{c.name}</option>
          {cats.filter((x) => x.parent_id === c.id).map((x) => <option key={x.id} value={x.id}>{c.name} › {x.name}</option>)}
        </optgroup>
      ))}
    </Select>
  );
}

function ItemForm({ item, category, cats, people, founders, onClose, onSaved }) {
  const [f, setF] = useState(() => ({ name: '', unit: 'pcs', unit_price: '', person_id: '', qty: '', category_id: category || '', ...(item || {}) }));
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

function MoveForm({ item, people, founders, mode, onClose, onSaved }) {
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

// Inline number editor that saves on blur / Enter (plain text for viewers).
function InlineNumber({ value, onSave, step = 'any', prefix, width = 84, format = number }) {
  const [v, setV] = useState(String(value));
  const { canEdit } = usePermissions();
  useEffect(() => setV(String(value)), [value]);
  const commit = () => { if (Number(v) !== Number(value) && v !== '') onSave(Number(v)); };
  if (!canEdit) return <span className="inline-num">{prefix}{format(value)}</span>;
  return (
    <span className="inline-num">
      {prefix}
      <input className="select-sm num-input" type="number" min="0" step={step} value={v} style={{ width }}
        onChange={(e) => setV(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} />
    </span>
  );
}

/** Every purchase, newest first, with the points it earned. */
function Purchases({ run }) {
  const { data, reload } = useApi('/stock/purchases');
  const { canEdit } = usePermissions();
  if (!data) return null;
  const del = (l) => window.confirm(`Delete this purchase? ${l.qty} ${l.unit} of ${l.item_name} are taken back from ${l.holder_name || 'the holder'} and ${l.person_name} loses its ${number(l.points)} points.`)
    && run(() => api.del(`/stock/purchases/${l.id}`)).then(reload);
  return (
    <div className="card table-wrap">
      {data.length ? (
        <table>
          <thead><tr><th>Date</th><th>Product</th><th className="hide-sm">Kind</th><th>Bought by</th><th className="r">Paid</th><th className="r">Points</th>{canEdit && <th />}</tr></thead>
          <tbody>
            {data.map((l) => (
              <tr key={l.id}>
                <td>{date(l.date)}</td>
                <td className="cell-wrap">{l.item_name}<div className="row-sub">{number(l.qty)} {l.unit}{l.holder_name && l.holder_id !== l.person_id ? ` · kept by ${l.holder_name}` : ''}<span className="show-sm"> · {PURCHASE_KINDS[l.kind]}</span></div></td>
                <td className="secondary hide-sm">{PURCHASE_KINDS[l.kind]}</td>
                <td>{l.person_name}</td>
                <td className="r">{money(l.amount)}</td>
                <td className="r"><strong>{number(l.points)}</strong></td>
                {canEdit && <td className="r actions"><button className="icon-btn" aria-label="Delete purchase" onClick={() => del(l)}><IconTrash /></button></td>}
              </tr>
            ))}
          </tbody>
        </table>
      ) : <div className="empty">No purchases yet. When you add stock, tick “Bought now” to record who bought it.</div>}
    </div>
  );
}

/** Products of one category: price, who holds how much, total and value. */
function ItemsTable({ items, run, setForm, selected, setSelected }) {
  const { canEdit } = usePermissions();
  const allOn = items.every((i) => selected.has(i.id));
  const pick = (ids, on) => { const next = new Set(selected); ids.forEach((id) => (on ? next.add(id) : next.delete(id))); setSelected(next); };
  return (
    <div className="table-wrap">
      <table>
        <thead><tr>{canEdit && <th className="pick-col"><input type="checkbox" checked={allOn} onChange={(e) => pick(items.map((i) => i.id), e.target.checked)} aria-label="Select all products here" /></th>}<th>Product</th><th className="r hide-sm">Price / unit</th><th className="hide-sm">Who has it</th><th className="r">Total</th><th className="r hide-sm">Value</th><th className="r hide-sm">Used at events</th>{canEdit && <th />}</tr></thead>
        <tbody>
          {items.map((i) => (
            <tr key={i.id} className={selected.has(i.id) ? 'row-picked' : ''}>
              {canEdit && <td className="pick-col"><input type="checkbox" checked={selected.has(i.id)} onChange={(e) => pick([i.id], e.target.checked)} aria-label={`Select ${i.name}`} /></td>}
              <td className="cell-wrap">
                <div className="row-title">{i.name}</div>
                <div className="row-sub">{i.unit}<span className="show-sm"> · {money(i.unit_price)} · worth {money0(i.value)}</span></div>
                <div className="row-sub show-sm">
                  {i.holdings.map((h) => `${h.name} ${number(h.qty)}`).join(' · ') || 'Nobody holds it'}
                  {canEdit && <> · <button className="link-btn" onClick={() => setForm({ move: i, mode: 'add' })}>Add</button></>}
                  {canEdit && i.holdings.length > 0 && <> · <button className="link-btn" onClick={() => setForm({ move: i, mode: 'move' })}>Move</button></>}
                </div>
              </td>
              <td className="r hide-sm">
                <InlineNumber value={i.unit_price} step="0.01" width={90} format={money}
                  onSave={(v) => run(() => api.put(`/stock/items/${i.id}`, { ...i, unit_price: v }))} />
              </td>
              <td className="hide-sm holders-cell">
                <div className="holder-list">
                  {i.holdings.map((h) => (
                    <div className="holder-row" key={h.person_id}>
                      <span className="holder-name">{h.name}</span>
                      <InlineNumber value={h.qty} width={90}
                        onSave={(v) => run(() => api.put('/stock/holdings', { item_id: i.id, person_id: h.person_id, qty: v }))} />
                    </div>
                  ))}
                  {!i.holdings.length && <span className="muted">Nobody holds it</span>}
                  {canEdit && (
                    <div className="holder-actions">
                      <button className="link-btn" onClick={() => setForm({ move: i, mode: 'add' })}>+ Add</button>
                      {i.holdings.length > 0 && <button className="link-btn" onClick={() => setForm({ move: i, mode: 'move' })}>Move</button>}
                    </div>
                  )}
                </div>
              </td>
              <td className={`r ${i.qty <= 5 ? 'neg' : ''}`}><strong>{number(i.qty)}</strong> <span className="muted">{i.unit}</span></td>
              <td className="r hide-sm">{money(i.value)}</td>
              <td className="r secondary hide-sm">{number(i.used)}</td>
              {canEdit && (
                <td className="r actions">
                  <button className="icon-btn" aria-label="Edit" onClick={() => setForm({ item: i })}><IconEdit /></button>
                  <button className="icon-btn" aria-label="Delete" onClick={() => confirmDelete(i.name) && run(() => api.del(`/stock/items/${i.id}`))}><IconTrash /></button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const sumUp = (list) => ({ count: list.length, value: list.reduce((a, i) => a + i.value, 0), low: list.filter((i) => i.qty <= 5).length });

/** A category, collapsed to one line; opening it shows its products and subcategories. */
function Category({ cat, cats, items, open, toggle, run, setForm, selected, setSelected }) {
  const { canEdit } = usePermissions();
  const subs = cats.filter((c) => c.parent_id === cat.id);
  const own = items.filter((i) => i.category_id === cat.id);
  const all = items.filter((i) => i.category_id === cat.id || subs.some((sc) => sc.id === i.category_id));
  const t = sumUp(all);
  const isOpen = open.includes(cat.id);
  const sub = !!cat.parent_id;
  const addSub = () => {
    const name = window.prompt(`New subcategory of ${cat.name}`);
    if (name?.trim()) run(() => api.post('/stock/categories', { name, parent_id: cat.id }));
  };
  const rename = () => {
    const name = window.prompt('Rename subcategory', cat.name);
    if (name?.trim() && name !== cat.name) run(() => api.put(`/stock/categories/${cat.id}`, { name }));
  };
  const remove = () => window.confirm(`Delete the subcategory ${cat.name}? Its products move to the category above.`)
    && run(() => api.del(`/stock/categories/${cat.id}`));
  return (
    <div className={sub ? 'stock-sub' : `card stock-cat ${t.count ? '' : 'is-empty'}`}>
      <div className="cat-head">
        <button className="cat-toggle" onClick={() => toggle(cat.id)} aria-expanded={isOpen}>
          <IconChevronRight width="16" className={`chev ${isOpen ? 'open' : ''}`} />
          <span className="cat-name">{cat.name}</span>
          <span className="muted">{t.count ? `${t.count} product${t.count > 1 ? 's' : ''} · ${money0(t.value)}` : 'No products'}</span>
          {t.low > 0 && <span className="badge low-badge">{t.low} running low</span>}
        </button>
        {canEdit && isOpen && (
          <div className="cat-actions">
            <button className="btn btn-sm btn-ghost" onClick={() => setForm({ category: cat.id })}><IconPlus width="13" />Product</button>
            {!sub && <button className="btn btn-sm btn-ghost" onClick={addSub}><IconPlus width="13" />Subcategory</button>}
            {sub && <button className="icon-btn" aria-label={`Rename ${cat.name}`} onClick={rename}><IconEdit /></button>}
            {sub && <button className="icon-btn" aria-label={`Delete ${cat.name}`} onClick={remove}><IconTrash /></button>}
          </div>
        )}
      </div>
      {isOpen && (
        <div className="cat-body">
          {own.length > 0 && <ItemsTable items={own} run={run} setForm={setForm} selected={selected} setSelected={setSelected} />}
          {subs.map((c) => <Category key={c.id} cat={c} cats={cats} items={items} open={open} toggle={toggle} run={run} setForm={setForm} selected={selected} setSelected={setSelected} />)}
          {!own.length && !subs.length && <div className="empty">No products here yet.</div>}
        </div>
      )}
    </div>
  );
}

export default function Stock() {
  const { data: items, reload } = useApi('/stock');
  const { data: cats, reload: reloadCats } = useApi('/stock/categories');
  const [open, setOpen] = usePersistentState('am-stock-open', []);
  const toggle = (id) => setOpen(open.includes(id) ? open.filter((x) => x !== id) : [...open, id]);
  const [selected, setSelected] = useState(() => new Set());
  // Moving products: they go to the chosen category, which opens so you can see them there.
  const moveTo = (categoryId) => run(async () => {
    await api.post('/stock/items/move', { ids: [...selected], category_id: categoryId });
    const target = cats.find((c) => c.id === Number(categoryId));
    setOpen([...new Set([...open, Number(categoryId), ...(target?.parent_id ? [target.parent_id] : [])])]);
    setSelected(new Set());
  });
  const { data: allPeople, reload: reloadPeople } = useApi('/people');
  const [view, setView] = usePersistentState('am-stock-view', 'items');
  const [form, setForm] = useState(null); // { item? } | { move: item, mode } | { equipment: item | null }
  const [error, setError] = useState(null);
  const { canEdit } = usePermissions();
  const people = allPeople?.filter((p) => p.active) || [];
  const founders = people.filter((p) => p.is_founder); // only founders keep stock
  const refresh = () => { reload(); reloadPeople(); reloadCats(); };
  const run = async (fn) => { try { await fn(); setError(null); refresh(); } catch (e) { setError(e.message); refresh(); } };

  if (!items || !allPeople || !cats) return null;
  // Every big category (one per sport, then Miscellaneous) is listed, collapsed until opened.
  const top = cats.filter((c) => !c.parent_id);
  const totalValue = items.reduce((s, i) => s + i.value, 0);
  const holders = people.map((p) => ({
    ...p, items: items.flatMap((i) => i.holdings.filter((h) => h.person_id === p.id).map((h) => ({ ...h, item: i }))),
  })).filter((p) => p.items.length);

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Stock</h1>
          <p>{view === 'equipment'
            ? 'Things the community keeps and reuses: what they cost, what state they’re in and who has them.'
            : 'Products the community owns, who holds them, and what they’re worth. Using them at an event charges their cost to the event.'}</p>
        </div>
        {canEdit && (view === 'equipment'
          ? <button className="btn btn-primary" onClick={() => setForm({ equipment: null })}><IconPlus width="16" />New equipment</button>
          : <button className="btn btn-primary" onClick={() => setForm({})}><IconPlus width="16" />New product</button>)}
      </div>

      <div className="stack">
        <div className="segmented" style={{ alignSelf: 'flex-start' }}>
          <button className={view === 'items' ? 'on' : ''} onClick={() => setView('items')}>By product</button>
          <button className={view === 'people' ? 'on' : ''} onClick={() => setView('people')}>By person</button>
          <button className={view === 'purchases' ? 'on' : ''} onClick={() => setView('purchases')}>Purchases</button>
          <button className={view === 'equipment' ? 'on' : ''} onClick={() => setView('equipment')}>Equipment</button>
        </div>
        {view === 'equipment' ? <Equipment form={form} setForm={setForm} /> : view === 'purchases' ? <>{error && <div className="error-box">{error}</div>}<Purchases run={run} /></> : <>
        {error && <div className="error-box">{error}</div>}
        <div className="grid grid-kpi">
          <Kpi label="Stock value" icon={IconBox} tone="profit" value={money0(totalValue)} sub={`${items.length} products`} />
          <Kpi label="People holding stock" icon={IconUsers} value={holders.length} sub={holders.map((h) => h.name.split(' ')[0]).join(', ') || '—'} />
          <Kpi label="Running low" value={items.filter((i) => i.qty <= 5).length} sub={items.filter((i) => i.qty <= 5).map((i) => i.name).join(', ') || 'nothing'} />
        </div>

        {view === 'items' ? (
          <div className="stack" style={{ gap: 10 }}>
            {selected.size > 0 && (
              <div className="move-bar" role="region" aria-label="Move selected products">
                <strong>{selected.size} selected</strong>
                <CategorySelect cats={cats} value="" placeholder="Move to category…" aria-label="Move to category"
                  onChange={(e) => e.target.value && moveTo(e.target.value)} />
                <button className="btn btn-sm btn-ghost" onClick={() => setSelected(new Set())}>Clear</button>
              </div>
            )}
            {top.map((c) => <Category key={c.id} cat={c} cats={cats} items={items} open={open} toggle={toggle} run={run} setForm={setForm} selected={selected} setSelected={setSelected} />)}
            {!items.length && <div className="card empty">No products yet. Add water, fruit, balls… with their price.</div>}
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
        </>}
        {!people.length && <p className="hint">Add people in <Link to="/settings">Settings → People</Link> to assign stock to them.</p>}
      </div>

      {form && !form.move && !('equipment' in form) && <ItemForm item={form.item} category={form.category} cats={cats} people={people} founders={founders} onClose={() => setForm(null)} onSaved={() => { setForm(null); refresh(); }} />}
      {form?.move && <MoveForm item={form.move} mode={form.mode} people={people} founders={founders} onClose={() => setForm(null)} onSaved={() => { setForm(null); refresh(); }} />}
    </div>
  );
}
