// Settings: sports (with their default prices) and categories of costs and income.
import { useState } from 'react';
import { api } from '../../api.js';
import { useAction, useApi } from '../../hooks.js';
import { confirmDelete } from '../../components/Modal.jsx';
import { IconEdit, IconTrash } from '../../components/Icons.jsx';
import Select from '../../components/Select.jsx';
import { rename } from './rename.js';
import { useBusiness } from '../../business.js';
import { t } from '../../i18n/index.js';

export function Sports() {
  const { data, reload } = useApi('/event-types');
  const [error, run] = useAction(reload);
  const [name, setName] = useState('');
  return (
    <div className="card card-pad">
      <div className="card-head"><div><h2>{t('Sports')}</h2><p>{t('Each sport has its own reinvestment fund, and default prices for new events: the full price, and the venue’s part of it — all that members pay. Untick “Sport fund” for event types that aren’t a sport (e.g. Social): their community share all goes to the general fund. “Points ×” multiplies the points their events earn for time and profit.')}</p></div></div>
      {error && <div className="error-box" style={{ marginBottom: 10 }}>{error}</div>}
      <div className="table-wrap" style={{ maxHeight: 420 }}>
        <table className="compact-table">
          <thead><tr><th style={{ width: '100%' }}>{t('Sport')}</th><th className="r">{t('Price')}</th><th className="r">{t('Venue')}</th><th className="r">{t('Points ×')}</th><th className="hide-sm">{t('Sport fund')}</th><th className="r hide-sm">{t('Events')}</th><th className="hide-sm" /></tr></thead>
          <tbody>
            {data?.map((ty) => (
              <tr key={`${ty.id}-${ty.default_fee}-${ty.default_venue_fee}-${ty.is_sport}-${ty.points_factor}`}>
                <td>
                  {ty.name}
                  <div className="row-actions show-sm">
                    <label className="check"><input type="checkbox" checked={!!ty.is_sport} aria-label={t('{name} has a sport fund', { name: ty.name })}
                      onChange={(e) => run(() => api.put(`/event-types/${ty.id}`, { is_sport: e.target.checked }))} />{t('Sport fund')}</label>
                    <button className="link-btn" onClick={() => { const n = rename(ty.name); if (n) run(() => api.put(`/event-types/${ty.id}`, { name: n })); }}>{t('Rename')}</button>
                    <button className="link-btn" style={{ color: 'var(--bad-text)' }} onClick={() => confirmDelete(t('sport “{name}”', { name: ty.name })) && run(() => api.del(`/event-types/${ty.id}`))}>{t('Delete')}</button>
                  </div>
                </td>
                {['default_fee', 'default_venue_fee'].map((k) => (
                  <td className="r" key={k}>
                    <input className="select-sm num-input" type="number" min="0" step="0.01" defaultValue={ty[k] || ''} placeholder="—"
                      aria-label={k === 'default_fee' ? t('{name} price per person', { name: ty.name }) : t('{name} venue cost per person', { name: ty.name })}
                      onBlur={(e) => Number(e.target.value) !== ty[k] && run(() => api.put(`/event-types/${ty.id}`, { [k]: Number(e.target.value) || 0 }))} />
                  </td>
                ))}
                <td className="r">
                  <input className="select-sm num-input" type="number" min="0.1" step="0.1" defaultValue={ty.points_factor}
                    aria-label={t('{name} points multiplier', { name: ty.name })}
                    onBlur={(e) => Number(e.target.value) > 0 && Number(e.target.value) !== ty.points_factor && run(() => api.put(`/event-types/${ty.id}`, { points_factor: Number(e.target.value) }))} />
                </td>
                <td className="hide-sm">
                  <input type="checkbox" checked={!!ty.is_sport} aria-label={t('{name} has a sport fund', { name: ty.name })}
                    onChange={(e) => run(() => api.put(`/event-types/${ty.id}`, { is_sport: e.target.checked }))} />
                </td>
                <td className="r muted hide-sm">{ty.events}</td>
                <td className="r hide-sm">
                  <button className="icon-btn" aria-label={t('Rename')} onClick={() => { const n = rename(ty.name); if (n) run(() => api.put(`/event-types/${ty.id}`, { name: n })); }}><IconEdit /></button>
                  <button className="icon-btn" aria-label={t('Delete')} onClick={() => confirmDelete(t('sport “{name}”', { name: ty.name })) && run(() => api.del(`/event-types/${ty.id}`))}><IconTrash /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <form className="filters" style={{ margin: '14px 0 0' }}
        onSubmit={async (e) => { e.preventDefault(); if (await run(() => api.post('/event-types', { name }))) setName(''); }}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('New sport')} required style={{ flex: 1 }} />
        <button className="btn">{t('Add')}</button>
      </form>
    </div>
  );
}

export function Categories() {
  const { data, reload } = useApi('/categories');
  const [error, run] = useAction(reload);
  const [f, setF] = useState({ name: '', kind: 'expense', cost_group: 'organizing' });
  // Without community events (a practice) costs aren't split into organizing costs and benefits offered.
  const { on } = useBusiness();
  const simple = !on('events');
  const lists = simple ? [
    { title: 'Income', filter: (c) => c.kind === 'income', cls: 'kind-income' },
    { title: 'Expenses', filter: (c) => c.kind === 'expense', cls: 'kind-expense' },
  ] : [
    { title: 'Income', filter: (c) => c.kind === 'income', cls: 'kind-income' },
    { title: 'Organizing costs', hint: 'venues, trainers, referees…', filter: (c) => c.kind === 'expense' && c.cost_group !== 'benefit', cls: 'kind-expense' },
    { title: 'Benefits offered', hint: 'drinks, food, prizes…', filter: (c) => c.kind === 'expense' && c.cost_group === 'benefit', cls: 'kind-expense' },
  ];
  return (
    <div className="card card-pad">
      <div className="card-head"><div><h2>{t('Categories')}</h2><p>{simple ? t('What money comes in for and goes out on') : t('Cost categories are either organizing costs or benefits offered to participants')}</p></div></div>
      {error && <div className="error-box" style={{ marginBottom: 10 }}>{error}</div>}
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(320px, 100%), 1fr))', gap: 24 }}>
        {lists.map((l) => (
          <div key={l.title}>
            <h3 style={{ marginBottom: 6 }} className={l.cls}>{t(l.title)} {l.hint && <span className="muted" style={{ textTransform: 'none', letterSpacing: 0, fontWeight: 450 }}>· {t(l.hint)}</span>}</h3>
            <table className="compact-table">
              <tbody>
                {data?.filter(l.filter).map((c) => (
                  <tr key={c.id}>
                    <td>{c.name}</td>
                    <td className="r muted">{c.uses}</td>
                    <td className="r">
                      {c.kind === 'expense' && !simple && (
                        <button className="btn btn-sm btn-ghost" title={t('Move to the other group')}
                          onClick={() => run(() => api.put(`/categories/${c.id}`, { cost_group: c.cost_group === 'benefit' ? 'organizing' : 'benefit' }))}>
                          {c.cost_group === 'benefit' ? t('→ Organizing') : t('→ Benefit')}
                        </button>
                      )}
                      <button className="icon-btn" aria-label={t('Rename')} onClick={() => { const n = rename(c.name); if (n) run(() => api.put(`/categories/${c.id}`, { name: n })); }}><IconEdit /></button>
                      <button className="icon-btn" aria-label={t('Delete')}
                        onClick={() => confirmDelete(c.uses ? t('category “{name}” (its {n} transactions become uncategorised)', { name: c.name, n: c.uses }) : t('category “{name}”', { name: c.name })) && run(() => api.del(`/categories/${c.id}`))}><IconTrash /></button>
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
        <input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder={t('New category')} required style={{ flex: 1 }} />
        <Select value={f.kind === 'income' ? 'income' : f.cost_group} onChange={(e) => setF(e.target.value === 'income'
          ? { ...f, kind: 'income', cost_group: 'organizing' } : { ...f, kind: 'expense', cost_group: e.target.value })}>
          <option value="organizing">{simple ? t('Expense') : t('Organizing cost')}</option>
          {!simple && <option value="benefit">{t('Benefit offered')}</option>}
          <option value="income">{t('Income')}</option>
        </Select>
        <button className="btn">{t('Add')}</button>
      </form>
    </div>
  );
}
