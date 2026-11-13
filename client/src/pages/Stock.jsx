import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useApi, usePermissions, usePersistentState } from '../hooks.js';
import { money, money0 } from '../format.js';
import Kpi from '../components/Kpi.jsx';
import Equipment from './Equipment.jsx';
import { IconBox, IconPlus, IconUsers } from '../components/Icons.jsx';
import { CategorySelect } from './stock/CategorySelect.jsx';
import { ItemForm } from './stock/ItemForm.jsx';
import { MoveForm } from './stock/MoveForm.jsx';
import { InlineNumber } from './stock/InlineNumber.jsx';
import { Purchases } from './stock/Purchases.jsx';
import { Category } from './stock/Category.jsx';

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
