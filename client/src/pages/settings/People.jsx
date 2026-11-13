// Settings: people, and the saved discounts each is entitled to.
import { useState } from 'react';
import { api } from '../../api.js';
import { useAction, useApi } from '../../hooks.js';
import { discountLabel, money0 } from '../../format.js';
import Modal, { confirmDelete } from '../../components/Modal.jsx';
import { IconEdit, IconTrash } from '../../components/Icons.jsx';
import { rename } from './rename.js';

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

export function People() {
  const { data, reload } = useApi('/people');
  const { data: discounts, reload: reloadDiscounts } = useApi('/discounts');
  const [editing, setEditing] = useState(null);
  const [error, run] = useAction(reload);
  const [f, setF] = useState({ name: '', is_founder: false, is_premium: false });
  const save = (p, patch) => run(() => api.put(`/people/${p.id}`, { ...p, ...patch }));
  return (
    <div className="card card-pad">
      <div className="card-head"><div><h2>People</h2><p>Founders share the founders’ part equally; everyone earns organiser points and can hold stock. Members — founders, premium people and anyone who has organised an event — pay only the venue’s part of an event’s price.</p></div></div>
      {error && <div className="error-box" style={{ marginBottom: 10 }}>{error}</div>}
      <div className="table-wrap" style={{ maxHeight: 420 }}>
        <table>
          <thead><tr><th style={{ width: '100%' }}>Name</th><th>Founder</th><th>Premium</th><th className="hide-sm">Discounts</th><th className="r hide-sm">Organised</th><th className="r hide-sm">Points</th><th className="r hide-sm">Holds stock</th><th className="r hide-sm">Discounts received</th><th /></tr></thead>
          <tbody>
            {data?.map((p) => (
              <tr key={p.id} className={p.active ? '' : 'row-off'}>
                <td className="cell-wrap">
                  {p.name}{p.is_member ? <span className="badge" style={{ marginLeft: 6 }} title="Pays only the venue’s part of event prices">Member</span> : null}
                  <div className="row-sub show-sm">
                    {discounts?.filter((d) => p.discount_ids.includes(d.id)).map((d) => d.name).join(', ')}
                    {p.discount_ids.length ? ' · ' : ''}<button className="link-btn" onClick={() => setEditing(p)}>{p.discount_ids.length ? 'Edit discounts' : '+ Discount'}</button>
                    {' · '}<button className="link-btn" onClick={() => save(p, { active: !p.active })}>{p.active ? 'Deactivate' : 'Activate'}</button>
                  </div>
                </td>
                <td><input type="checkbox" checked={!!p.is_founder} onChange={(e) => save(p, { is_founder: e.target.checked })} aria-label="Founder" /></td>
                <td><input type="checkbox" checked={!!p.is_premium} onChange={(e) => save(p, { is_premium: e.target.checked })} aria-label="Premium" /></td>
                <td className="cell-wrap hide-sm">
                  <div className="holders">
                    {discounts?.filter((d) => p.discount_ids.includes(d.id)).map((d) => <span key={d.id} className="badge">{d.name}</span>)}
                    <button className="btn btn-sm btn-ghost" onClick={() => setEditing(p)}>{p.discount_ids.length ? 'Edit' : '+ Add'}</button>
                  </div>
                </td>
                <td className="r hide-sm">{p.events}</td>
                <td className="r hide-sm">{p.points}</td>
                <td className="r hide-sm">{p.stock_value ? money0(p.stock_value) : '—'}</td>
                <td className="r hide-sm">{p.discounts_received ? <span title={`${p.discounted_events} events`}>{money0(p.discounts_received)}</span> : '—'}</td>
                <td className="r actions">
                  <button className="btn btn-sm btn-ghost hide-sm" onClick={() => save(p, { active: !p.active })}>{p.active ? 'Deactivate' : 'Activate'}</button>
                  <button className="icon-btn" aria-label="Rename" onClick={() => { const n = rename(p.name); if (n) save(p, { name: n }); }}><IconEdit /></button>
                  <button className="icon-btn" aria-label="Delete" onClick={() => confirmDelete(p.name) && run(() => api.del(`/people/${p.id}`))}><IconTrash /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <form className="filters" style={{ margin: '14px 0 0' }}
        onSubmit={async (e) => { e.preventDefault(); if (await run(() => api.post('/people', f))) setF({ name: '', is_founder: false, is_premium: false }); }}>
        <input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Full name" required style={{ flex: 1 }} />
        <label className="check"><input type="checkbox" checked={f.is_founder} onChange={(e) => setF({ ...f, is_founder: e.target.checked })} />Founder</label>
        <label className="check"><input type="checkbox" checked={f.is_premium} onChange={(e) => setF({ ...f, is_premium: e.target.checked })} />Premium</label>
        <button className="btn">Add person</button>
      </form>
      {editing && discounts && (
        <PersonDiscounts person={editing} discounts={discounts} onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); reload(); reloadDiscounts(); }} />
      )}
    </div>
  );
}
