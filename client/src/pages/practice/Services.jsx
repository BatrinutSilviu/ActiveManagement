// Settings for a practice: the services offered, each with the price a new session starts with.
import { useState } from 'react';
import { api } from '../../api.js';
import { useAction, useApi } from '../../hooks.js';
import { useBusiness } from '../../business.js';
import { CURRENCY } from '../../format.js';
import { confirmDelete } from '../../components/Modal.jsx';
import { IconEdit, IconTrash } from '../../components/Icons.jsx';
import { t } from '../../i18n/index.js';
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
      <div className="card-head"><div><h2>{t(Term('sports'))}</h2><p>{t(`What you offer, and the price a new ${term('event')} of each starts with`)}</p></div></div>
      {error && <div className="error-box" style={{ marginBottom: 10 }}>{error}</div>}
      {data?.length ? (
        <div className="table-wrap" style={{ marginBottom: 12 }}>
          <table>
            <thead><tr><th style={{ width: '100%' }}>{t(Term('sport'))}</th><th className="r">{t('Price ({currency})', { currency: CURRENCY })}</th><th /></tr></thead>
            <tbody>
              {data.map((x) => (
                <tr key={`${x.id}-${x.default_fee}`}>
                  <td>{x.name}</td>
                  <td className="r">
                    <input className="select-sm num-input" type="number" min="0" step="0.01" defaultValue={x.default_fee || ''} placeholder="0"
                      aria-label={t('{name} price', { name: x.name })} style={{ width: 100 }}
                      onBlur={(e) => Number(e.target.value || 0) !== x.default_fee && run(() => api.put(`/event-types/${x.id}`, { default_fee: Number(e.target.value || 0), default_venue_fee: 0 }))} />
                  </td>
                  <td className="r actions">
                    <button className="icon-btn" aria-label={t('Rename')} onClick={() => { const n = rename(x.name); if (n) run(() => api.put(`/event-types/${x.id}`, { name: n })); }}><IconEdit /></button>
                    <button className="icon-btn" aria-label={t('Delete')} onClick={() => confirmDelete(`“${x.name}”`) && run(() => api.del(`/event-types/${x.id}`))}><IconTrash /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      <form onSubmit={add} style={{ display: 'flex', gap: 8 }}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t(`New ${term('sport')}, e.g. Manual therapy`)} required style={{ flex: 1 }} />
        <button className="btn">{t('Add')}</button>
      </form>
    </div>
  );
}
