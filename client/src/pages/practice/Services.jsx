// Settings for a practice: the services offered, each with the price a new session starts with.
import { useState } from 'react';
import { api } from '../../api.js';
import { useAction, useApi } from '../../hooks.js';
import { useBusiness } from '../../business.js';
import { CURRENCY } from '../../format.js';
import { confirmDelete } from '../../components/Modal.jsx';
import { IconEdit, IconTrash } from '../../components/Icons.jsx';
import { rename } from '../settings/rename.js';

export function Services() {
  const { term, Term } = useBusiness();
  const { data, reload } = useApi('/event-types');
  const [error, run] = useAction(reload);
  const [name, setName] = useState('');
  const add = async (e) => {
    e.preventDefault();
    if (await run(() => api.post('/event-types', { name, is_sport: false }))) setName('');
  };
  return (
    <div className="card card-pad">
      <div className="card-head"><div><h2>{Term('sports')}</h2><p>What you offer, and the price a new {term('event')} of each starts with</p></div></div>
      {error && <div className="error-box" style={{ marginBottom: 10 }}>{error}</div>}
      {data?.length ? (
        <div className="table-wrap" style={{ marginBottom: 12 }}>
          <table>
            <thead><tr><th style={{ width: '100%' }}>{Term('sport')}</th><th className="r">Price ({CURRENCY})</th><th /></tr></thead>
            <tbody>
              {data.map((t) => (
                <tr key={`${t.id}-${t.default_fee}`}>
                  <td>{t.name}</td>
                  <td className="r">
                    <input className="select-sm num-input" type="number" min="0" step="0.01" defaultValue={t.default_fee || ''} placeholder="0"
                      aria-label={`${t.name} price`} style={{ width: 100 }}
                      onBlur={(e) => Number(e.target.value || 0) !== t.default_fee && run(() => api.put(`/event-types/${t.id}`, { default_fee: Number(e.target.value || 0), default_venue_fee: 0 }))} />
                  </td>
                  <td className="r actions">
                    <button className="icon-btn" aria-label="Rename" onClick={() => { const n = rename(t.name); if (n) run(() => api.put(`/event-types/${t.id}`, { name: n })); }}><IconEdit /></button>
                    <button className="icon-btn" aria-label="Delete" onClick={() => confirmDelete(`“${t.name}”`) && run(() => api.del(`/event-types/${t.id}`))}><IconTrash /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      <form onSubmit={add} style={{ display: 'flex', gap: 8 }}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder={`New ${term('sport')}, e.g. Manual therapy`} required style={{ flex: 1 }} />
        <button className="btn">Add</button>
      </form>
    </div>
  );
}
