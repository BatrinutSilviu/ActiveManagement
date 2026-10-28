import { useState } from 'react';
import { api } from '../api.js';
import { useApi } from '../hooks.js';
import { date, money, money0, number } from '../format.js';
import Modal, { confirmDelete } from '../components/Modal.jsx';
import { IconEdit, IconTrash } from '../components/Icons.jsx';

function useAction(reload) {
  const [error, setError] = useState(null);
  const run = async (fn) => {
    try { await fn(); setError(null); reload(); return true; } catch (e) { setError(e.message); return false; }
  };
  return [error, run];
}

function rename(current) {
  const name = window.prompt('New name', current);
  return name && name.trim() !== current ? name.trim() : null;
}

function Sports() {
  const { data, reload } = useApi('/event-types');
  const [error, run] = useAction(reload);
  const [name, setName] = useState('');
  return (
    <div className="card card-pad">
      <div className="card-head"><div><h2>Sports</h2><p>Every event belongs to a sport, and each sport has its own reinvestment fund</p></div></div>
      {error && <div className="error-box" style={{ marginBottom: 10 }}>{error}</div>}
      <div className="table-wrap" style={{ maxHeight: 420 }}>
        <table>
          <tbody>
            {data?.map((t) => (
              <tr key={t.id}>
                <td>{t.name}</td>
                <td className="r muted">{t.events} events</td>
                <td className="r">
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

export const discountLabel = (d) => (d.kind === 'percent' ? `−${number(d.value)}%` : `−${money(d.value)}`);

function PersonDiscounts({ person, discounts, onClose, onSaved }) {
  const [ids, setIds] = useState(() => new Set(person.discount_ids));
  const toggle = (id) => setIds((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const save = async () => { await api.put(`/people/${person.id}/discounts`, { discount_ids: [...ids] }); onSaved(); };
  return (
    <Modal title={`Discounts for ${person.name}`} onClose={onClose} onSubmit={save}
      footer={<><button type="button" className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary">Save</button></>}>
      {discounts.length ? (
        <div className="check-list">
          {discounts.map((d) => (
            <label key={d.id} className="check">
              <input type="checkbox" checked={ids.has(d.id)} onChange={() => toggle(d.id)} />
              <span><b>{d.name}</b> <span className="muted">{discountLabel(d)} · {d.sport_name || 'any sport'}</span></span>
            </label>
          ))}
        </div>
      ) : <p className="muted" style={{ margin: 0 }}>No discounts defined yet — add them in the Discounts card first.</p>}
    </Modal>
  );
}

function People() {
  const { data, reload } = useApi('/people');
  const { data: discounts, reload: reloadDiscounts } = useApi('/discounts');
  const [editing, setEditing] = useState(null);
  const [error, run] = useAction(reload);
  const [f, setF] = useState({ name: '', is_founder: false });
  const save = (p, patch) => run(() => api.put(`/people/${p.id}`, { ...p, ...patch }));
  return (
    <div className="card card-pad">
      <div className="card-head"><div><h2>People</h2><p>Founders share the founders’ part equally; everyone earns organiser points and can hold stock</p></div></div>
      {error && <div className="error-box" style={{ marginBottom: 10 }}>{error}</div>}
      <div className="table-wrap" style={{ maxHeight: 420 }}>
        <table>
          <thead><tr><th>Name</th><th>Founder</th><th>Discounts</th><th className="r">Organised</th><th className="r">Points</th><th className="r">Holds stock</th><th className="r">Discounts received</th><th /></tr></thead>
          <tbody>
            {data?.map((p) => (
              <tr key={p.id} className={p.active ? '' : 'row-off'}>
                <td>{p.name}</td>
                <td><input type="checkbox" checked={!!p.is_founder} onChange={(e) => save(p, { is_founder: e.target.checked })} aria-label="Founder" /></td>
                <td className="cell-wrap">
                  <div className="holders">
                    {discounts?.filter((d) => p.discount_ids.includes(d.id)).map((d) => <span key={d.id} className="badge">{d.name}</span>)}
                    <button className="btn btn-sm btn-ghost" onClick={() => setEditing(p)}>{p.discount_ids.length ? 'Edit' : '+ Add'}</button>
                  </div>
                </td>
                <td className="r">{p.events}</td>
                <td className="r">{p.points}</td>
                <td className="r">{p.stock_value ? money0(p.stock_value) : '—'}</td>
                <td className="r">{p.discounts_received ? <span title={`${p.discounted_events} events`}>{money0(p.discounts_received)}</span> : '—'}</td>
                <td className="r">
                  <button className="btn btn-sm btn-ghost" onClick={() => save(p, { active: !p.active })}>{p.active ? 'Deactivate' : 'Activate'}</button>
                  <button className="icon-btn" aria-label="Rename" onClick={() => { const n = rename(p.name); if (n) save(p, { name: n }); }}><IconEdit /></button>
                  <button className="icon-btn" aria-label="Delete" onClick={() => confirmDelete(p.name) && run(() => api.del(`/people/${p.id}`))}><IconTrash /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <form className="filters" style={{ margin: '14px 0 0' }}
        onSubmit={async (e) => { e.preventDefault(); if (await run(() => api.post('/people', f))) setF({ name: '', is_founder: false }); }}>
        <input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Full name" required style={{ flex: 1 }} />
        <label className="check"><input type="checkbox" checked={f.is_founder} onChange={(e) => setF({ ...f, is_founder: e.target.checked })} />Founder</label>
        <button className="btn">Add person</button>
      </form>
      {editing && discounts && (
        <PersonDiscounts person={editing} discounts={discounts} onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); reload(); reloadDiscounts(); }} />
      )}
    </div>
  );
}

function Discounts() {
  const { data, reload } = useApi('/discounts');
  const { data: sports } = useApi('/event-types');
  const [error, run] = useAction(reload);
  const blank = { name: '', kind: 'percent', value: '', sport_id: '' };
  const [f, setF] = useState(blank);
  const [editId, setEditId] = useState(null);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = async (e) => {
    e.preventDefault();
    if (await run(() => (editId ? api.put(`/discounts/${editId}`, f) : api.post('/discounts', f)))) { setF(blank); setEditId(null); }
  };
  return (
    <div className="card">
      <div className="card-pad card-head" style={{ marginBottom: 0 }}>
        <div><h2>Discounts</h2><p>Reusable discounts — give them to people in the People table, then apply them on events. Changing one doesn’t alter past events.</p></div>
      </div>
      {error && <div className="error-box" style={{ margin: '0 22px 12px' }}>{error}</div>}
      {data?.length > 0 && (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Discount</th><th className="r">Value</th><th>Sport</th><th>Who has it</th><th className="r">Used</th><th /></tr></thead>
            <tbody>
              {data.map((d) => (
                <tr key={d.id} className={editId === d.id ? 'row-selected' : ''}>
                  <td><strong>{d.name}</strong></td>
                  <td className="r">{discountLabel(d)}</td>
                  <td className="secondary">{d.sport_name || 'Any sport'}</td>
                  <td className="cell-wrap secondary">{d.people.map((p) => p.name).join(', ') || '—'}</td>
                  <td className="r muted">{d.uses}</td>
                  <td className="r">
                    <button className="icon-btn" aria-label="Edit" onClick={() => { setEditId(d.id); setF({ name: d.name, kind: d.kind, value: d.value, sport_id: d.sport_id || '' }); }}><IconEdit /></button>
                    <button className="icon-btn" aria-label="Delete" onClick={() => confirmDelete(`discount “${d.name}” (past events keep their amounts)`) && run(() => api.del(`/discounts/${d.id}`))}><IconTrash /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <form className="inline-form" onSubmit={submit}>
        <input className="select-sm" value={f.name} onChange={set('name')} placeholder="e.g. Founders – Hyrox free" required style={{ flex: '2 1 200px' }} />
        <select className="select-sm" value={f.kind} onChange={set('kind')} style={{ flex: '0 1 130px' }}>
          <option value="percent">% off</option>
          <option value="fixed">RON off</option>
        </select>
        <input className="select-sm num-input" type="number" min="0.01" step="0.01" max={f.kind === 'percent' ? 100 : undefined}
          placeholder={f.kind === 'percent' ? '%' : 'RON'} value={f.value} onChange={set('value')} required />
        <select className="select-sm" value={f.sport_id} onChange={set('sport_id')} style={{ flex: '1 1 140px' }}>
          <option value="">Any sport</option>
          {sports?.map((sp) => <option key={sp.id} value={sp.id}>{sp.name}</option>)}
        </select>
        <button className="btn btn-sm">{editId ? 'Save' : 'Add'}</button>
        {editId && <button type="button" className="btn btn-sm btn-ghost" onClick={() => { setEditId(null); setF(blank); }}>Cancel</button>}
      </form>
    </div>
  );
}

function ProfitSplit() {
  const { data, reload } = useApi('/settings/split');
  const [f, setF] = useState(null);
  const [msg, setMsg] = useState(null);
  if (!data) return null;
  const r2 = (n) => Math.round(n * 100) / 100;
  const v = f || { community: r2(100 - data.foundersStandard - data.foundersPoints), founders: data.foundersStandard,
    organisers: data.foundersPoints, generalShare: r2(data.generalShare) };
  const set = (k) => (e) => setF({ ...v, [k]: e.target.value });
  const total = r2(Number(v.community) + Number(v.founders) + Number(v.organisers));
  const save = async (e) => {
    e.preventDefault();
    if (total !== 100) return setMsg({ ok: false, text: `The targets add up to ${total}% — they must make 100%.` });
    try {
      await api.put('/settings/split', { foundersStandard: v.founders, foundersPoints: v.organisers, generalShare: v.generalShare });
      setMsg({ ok: true, text: 'Saved. Months with their own targets (set on Payouts) keep them.' }); setF(null); reload();
    } catch (err) { setMsg({ ok: false, text: err.message }); }
  };
  return (
    <div className="card card-pad">
      <div className="card-head"><div><h2>Default split</h2><p>Used for every month that has no targets of its own (see Payouts)</p></div></div>
      {msg && <div className={msg.ok ? 'pos' : 'error-box'} style={{ marginBottom: 10 }}>{msg.text}</div>}
      <form onSubmit={save} className="stack" style={{ gap: 14 }}>
        <div className="targets">
          <label className="field">Reinvest in community<div className="pct-input"><input type="number" min="0" max="100" step="0.5" value={v.community} onChange={set('community')} /><span>%</span></div></label>
          <label className="field">Founders (equal)<div className="pct-input"><input type="number" min="0" max="100" step="0.5" value={v.founders} onChange={set('founders')} /><span>%</span></div></label>
          <label className="field">Organisers (by points)<div className="pct-input"><input type="number" min="0" max="100" step="0.5" value={v.organisers} onChange={set('organisers')} /><span>%</span></div></label>
        </div>
        <div className={`targets-total ${total === 100 ? '' : 'neg'}`}>Total {total}%</div>
        <label className="field">Of the community share, to the general fund
          <div className="pct-input"><input type="number" min="0" max="100" step="0.01" value={v.generalShare} onChange={set('generalShare')} /><span>%</span></div>
          <span className="hint">The rest goes to the event’s sport fund. ⅓ = 33.33</span>
        </label>
        <div><button className="btn" disabled={!f}>Save default</button></div>
      </form>
    </div>
  );
}

function Activities() {
  const { data, reload } = useApi('/activities');
  const { data: sports } = useApi('/event-types');
  const [error, run] = useAction(reload);
  const blank = { name: '', organizer_points: '', organizer_max: '', co_points: '', co_max: '', sport_id: '' };
  const [f, setF] = useState(blank);
  const field = (a, k, props = {}) => (
    <input className="select-sm num-input" type="number" min="0" step="0.5" defaultValue={a[k] ?? ''} {...props}
      onBlur={(e) => String(e.target.value) !== String(a[k] ?? '') && run(() => api.put(`/activities/${a.id}`, { ...a, [k]: e.target.value }))} />
  );
  return (
    <div className="card">
      <div className="card-pad card-head" style={{ marginBottom: 0 }}>
        <div><h2>Points table</h2><p>What each activity is worth. Leave “max” empty for a fixed value. The sport sets the default activity for its events.</p></div>
      </div>
      {error && <div className="error-box" style={{ margin: '0 22px 12px' }}>{error}</div>}
      <div className="table-wrap">
        <table>
          <thead><tr><th>Activity</th><th className="r">Organiser</th><th className="r">Max</th><th className="r">Co-organiser</th><th className="r">Max</th><th>Default for sport</th><th className="r">Used</th><th /></tr></thead>
          <tbody>
            {data?.map((a) => (
              <tr key={`${a.id}-${a.organizer_points}-${a.co_points}-${a.organizer_max}-${a.co_max}`}>
                <td>{a.name}</td>
                <td className="r">{field(a, 'organizer_points')}</td>
                <td className="r">{field(a, 'organizer_max', { placeholder: '—' })}</td>
                <td className="r">{field(a, 'co_points')}</td>
                <td className="r">{field(a, 'co_max', { placeholder: '—' })}</td>
                <td>
                  <select className="select-sm" value={a.sport_id || ''} style={{ width: 150 }}
                    onChange={(e) => run(() => api.put(`/activities/${a.id}`, { ...a, sport_id: e.target.value }))}>
                    <option value="">—</option>
                    {sports?.map((sp) => <option key={sp.id} value={sp.id}>{sp.name}</option>)}
                  </select>
                </td>
                <td className="r muted">{a.uses}</td>
                <td className="r">
                  <button className="icon-btn" aria-label="Rename" onClick={() => { const n = rename(a.name); if (n) run(() => api.put(`/activities/${a.id}`, { ...a, name: n })); }}><IconEdit /></button>
                  <button className="icon-btn" aria-label="Delete" onClick={() => confirmDelete(a.name) && run(() => api.del(`/activities/${a.id}`))}><IconTrash /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <form className="inline-form" onSubmit={async (e) => { e.preventDefault(); if (await run(() => api.post('/activities', f))) setF(blank); }}>
        <input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="New activity" required style={{ flex: '2 1 200px' }} className="select-sm" />
        <input className="select-sm num-input" type="number" min="0" step="0.5" placeholder="Org. pts" value={f.organizer_points} onChange={(e) => setF({ ...f, organizer_points: e.target.value })} required style={{ width: 96 }} />
        <input className="select-sm num-input" type="number" min="0" step="0.5" placeholder="Co pts" value={f.co_points} onChange={(e) => setF({ ...f, co_points: e.target.value })} style={{ width: 96 }} />
        <button className="btn btn-sm">Add</button>
      </form>
    </div>
  );
}

function Categories() {
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
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 24 }}>
        {lists.map((l) => (
          <div key={l.title}>
            <h3 style={{ marginBottom: 6 }} className={l.cls}>{l.title} {l.hint && <span className="muted" style={{ textTransform: 'none', letterSpacing: 0, fontWeight: 450 }}>· {l.hint}</span>}</h3>
            <table>
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
        <select value={f.kind === 'income' ? 'income' : f.cost_group} onChange={(e) => setF(e.target.value === 'income'
          ? { ...f, kind: 'income', cost_group: 'organizing' } : { ...f, kind: 'expense', cost_group: e.target.value })}>
          <option value="organizing">Organizing cost</option>
          <option value="benefit">Benefit offered</option>
          <option value="income">Income</option>
        </select>
        <button className="btn">Add</button>
      </form>
    </div>
  );
}

function Admins({ user }) {
  const { data, reload } = useApi('/users');
  const [error, run] = useAction(reload);
  const [f, setF] = useState({ name: '', email: '', password: '' });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <div className="card card-pad">
      <div className="card-head"><div><h2>Admins</h2><p>Everyone here can manage events and money</p></div></div>
      {error && <div className="error-box" style={{ marginBottom: 10 }}>{error}</div>}
      <div className="table-wrap">
        <table>
          <tbody>
            {data?.map((u) => (
              <tr key={u.id}>
                <td><strong>{u.name}</strong>{u.id === user.id && <span className="muted"> (you)</span>}</td>
                <td className="secondary">{u.email}</td>
                <td className="muted">since {date(u.created_at.slice(0, 10))}</td>
                <td className="r">
                  {u.id !== user.id && (
                    <button className="icon-btn" aria-label="Remove" onClick={() => confirmDelete(`admin ${u.name}`) && run(() => api.del(`/users/${u.id}`))}><IconTrash /></button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <form className="form-grid" style={{ marginTop: 14 }}
        onSubmit={async (e) => { e.preventDefault(); if (await run(() => api.post('/users', f))) setF({ name: '', email: '', password: '' }); }}>
        <label className="field">Name<input value={f.name} onChange={set('name')} required /></label>
        <label className="field">Email<input type="email" value={f.email} onChange={set('email')} required /></label>
        <label className="field">Initial password<input type="text" value={f.password} onChange={set('password')} minLength={8} required /></label>
        <div style={{ alignSelf: 'end' }}><button className="btn">Add admin</button></div>
      </form>
    </div>
  );
}

function Password() {
  const [f, setF] = useState({ current: '', password: '' });
  const [msg, setMsg] = useState(null);
  return (
    <div className="card card-pad">
      <div className="card-head"><h2>Change your password</h2></div>
      {msg && <div className={msg.ok ? 'pos' : 'error-box'} style={{ marginBottom: 10 }}>{msg.text}</div>}
      <form className="form-grid" onSubmit={async (e) => {
        e.preventDefault();
        try { await api.put('/users/me/password', f); setMsg({ ok: true, text: 'Password updated.' }); setF({ current: '', password: '' }); }
        catch (err) { setMsg({ ok: false, text: err.message }); }
      }}>
        <label className="field">Current password<input type="password" value={f.current} onChange={(e) => setF({ ...f, current: e.target.value })} required /></label>
        <label className="field">New password<input type="password" value={f.password} minLength={8} onChange={(e) => setF({ ...f, password: e.target.value })} required /></label>
        <div><button className="btn">Update password</button></div>
      </form>
    </div>
  );
}

export default function Settings({ user }) {
  return (
    <div>
      <div className="page-head"><div><h1>Settings</h1><p>People, discounts, points table, default split, sports, categories and admin accounts.</p></div></div>
      <div className="stack">
        <People />
        <Discounts />
        <Activities />
        <div className="grid grid-2">
          <ProfitSplit />
          <Sports />
        </div>
        <Categories />
        <Admins user={user} />
        <Password />
      </div>
    </div>
  );
}
