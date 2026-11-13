// Settings: sports (with their default prices) and categories of costs and income.
import { useState } from 'react';
import { api } from '../../api.js';
import { useAction, useApi } from '../../hooks.js';
import { confirmDelete } from '../../components/Modal.jsx';
import { IconEdit, IconTrash } from '../../components/Icons.jsx';
import Select from '../../components/Select.jsx';
import { rename } from './rename.js';

export function Sports() {
  const { data, reload } = useApi('/event-types');
  const [error, run] = useAction(reload);
  const [name, setName] = useState('');
  return (
    <div className="card card-pad">
      <div className="card-head"><div><h2>Sports</h2><p>Each sport has its own reinvestment fund, and default prices for new events: the full price, and the venue’s part of it — all that members pay. Untick “Sport fund” for event types that aren’t a sport (e.g. Social): their community share all goes to the general fund. “Points ×” multiplies the points their events earn for time and profit.</p></div></div>
      {error && <div className="error-box" style={{ marginBottom: 10 }}>{error}</div>}
      <div className="table-wrap" style={{ maxHeight: 420 }}>
        <table className="compact-table">
          <thead><tr><th style={{ width: '100%' }}>Sport</th><th className="r">Price</th><th className="r">Venue</th><th className="r">Points ×</th><th className="hide-sm">Sport fund</th><th className="r hide-sm">Events</th><th className="hide-sm" /></tr></thead>
          <tbody>
            {data?.map((t) => (
              <tr key={`${t.id}-${t.default_fee}-${t.default_venue_fee}-${t.is_sport}-${t.points_factor}`}>
                <td>
                  {t.name}
                  <div className="row-actions show-sm">
                    <label className="check"><input type="checkbox" checked={!!t.is_sport} aria-label={`${t.name} has a sport fund`}
                      onChange={(e) => run(() => api.put(`/event-types/${t.id}`, { is_sport: e.target.checked }))} />Sport fund</label>
                    <button className="link-btn" onClick={() => { const n = rename(t.name); if (n) run(() => api.put(`/event-types/${t.id}`, { name: n })); }}>Rename</button>
                    <button className="link-btn" style={{ color: 'var(--bad-text)' }} onClick={() => confirmDelete(`sport “${t.name}”`) && run(() => api.del(`/event-types/${t.id}`))}>Delete</button>
                  </div>
                </td>
                {['default_fee', 'default_venue_fee'].map((k) => (
                  <td className="r" key={k}>
                    <input className="select-sm num-input" type="number" min="0" step="0.01" defaultValue={t[k] || ''} placeholder="—"
                      aria-label={`${t.name} ${k === 'default_fee' ? 'price' : 'venue cost'} per person`}
                      onBlur={(e) => Number(e.target.value) !== t[k] && run(() => api.put(`/event-types/${t.id}`, { [k]: Number(e.target.value) || 0 }))} />
                  </td>
                ))}
                <td className="r">
                  <input className="select-sm num-input" type="number" min="0.1" step="0.1" defaultValue={t.points_factor}
                    aria-label={`${t.name} points multiplier`}
                    onBlur={(e) => Number(e.target.value) > 0 && Number(e.target.value) !== t.points_factor && run(() => api.put(`/event-types/${t.id}`, { points_factor: Number(e.target.value) }))} />
                </td>
                <td className="hide-sm">
                  <input type="checkbox" checked={!!t.is_sport} aria-label={`${t.name} has a sport fund`}
                    onChange={(e) => run(() => api.put(`/event-types/${t.id}`, { is_sport: e.target.checked }))} />
                </td>
                <td className="r muted hide-sm">{t.events}</td>
                <td className="r hide-sm">
                  <button className="icon-btn" aria-label="Rename" onClick={() => { const n = rename(t.name); if (n) run(() => api.put(`/event-types/${t.id}`, { name: n })); }}><IconEdit /></button>
                  <button className="icon-btn" aria-label="Delete" onClick={() => confirmDelete(`sport “${t.name}”`) && run(() => api.del(`/event-types/${t.id}`))}><IconTrash /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <form className="filters" style={{ margin: '14px 0 0' }}
        onSubmit={async (e) => { e.preventDefault(); if (await run(() => api.post('/event-types', { name }))) setName(''); }}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="New sport" required style={{ flex: 1 }} />
        <button className="btn">Add</button>
      </form>
    </div>
  );
}

export function Categories() {
  const { data, reload } = useApi('/categories');
  const [error, run] = useAction(reload);
  const [f, setF] = useState({ name: '', kind: 'expense', cost_group: 'organizing' });
  const lists = [
    { title: 'Income', filter: (c) => c.kind === 'income', cls: 'kind-income' },
    { title: 'Organizing costs', hint: 'venues, trainers, referees…', filter: (c) => c.kind === 'expense' && c.cost_group !== 'benefit', cls: 'kind-expense' },
    { title: 'Benefits offered', hint: 'drinks, food, prizes…', filter: (c) => c.kind === 'expense' && c.cost_group === 'benefit', cls: 'kind-expense' },
  ];
  return (
    <div className="card card-pad">
      <div className="card-head"><div><h2>Categories</h2><p>Cost categories are either organizing costs or benefits offered to participants</p></div></div>
      {error && <div className="error-box" style={{ marginBottom: 10 }}>{error}</div>}
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(320px, 100%), 1fr))', gap: 24 }}>
        {lists.map((l) => (
          <div key={l.title}>
            <h3 style={{ marginBottom: 6 }} className={l.cls}>{l.title} {l.hint && <span className="muted" style={{ textTransform: 'none', letterSpacing: 0, fontWeight: 450 }}>· {l.hint}</span>}</h3>
            <table className="compact-table">
              <tbody>
                {data?.filter(l.filter).map((c) => (
                  <tr key={c.id}>
                    <td>{c.name}</td>
                    <td className="r muted">{c.uses}</td>
                    <td className="r">
                      {c.kind === 'expense' && (
                        <button className="btn btn-sm btn-ghost" title="Move to the other group"
                          onClick={() => run(() => api.put(`/categories/${c.id}`, { cost_group: c.cost_group === 'benefit' ? 'organizing' : 'benefit' }))}>
                          {c.cost_group === 'benefit' ? '→ Organizing' : '→ Benefit'}
                        </button>
                      )}
                      <button className="icon-btn" aria-label="Rename" onClick={() => { const n = rename(c.name); if (n) run(() => api.put(`/categories/${c.id}`, { name: n })); }}><IconEdit /></button>
                      <button className="icon-btn" aria-label="Delete"
                        onClick={() => confirmDelete(`category “${c.name}”${c.uses ? ` (its ${c.uses} transactions become uncategorised)` : ''}`) && run(() => api.del(`/categories/${c.id}`))}><IconTrash /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
      <form className="filters" style={{ margin: '14px 0 0' }}
        onSubmit={async (e) => { e.preventDefault(); if (await run(() => api.post('/categories', f))) setF({ ...f, name: '' }); }}>
        <input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="New category" required style={{ flex: 1 }} />
        <Select value={f.kind === 'income' ? 'income' : f.cost_group} onChange={(e) => setF(e.target.value === 'income'
          ? { ...f, kind: 'income', cost_group: 'organizing' } : { ...f, kind: 'expense', cost_group: e.target.value })}>
          <option value="organizing">Organizing cost</option>
          <option value="benefit">Benefit offered</option>
          <option value="income">Income</option>
        </Select>
        <button className="btn">Add</button>
      </form>
    </div>
  );
}
