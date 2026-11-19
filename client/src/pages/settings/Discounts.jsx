// Settings: the saved discounts.
import { useState } from 'react';
import { api } from '../../api.js';
import { useAction, useApi } from '../../hooks.js';
import { CURRENCY, discountLabel } from '../../format.js';
import { confirmDelete } from '../../components/Modal.jsx';
import { IconEdit, IconTrash } from '../../components/Icons.jsx';
import Select from '../../components/Select.jsx';
import { t } from '../../i18n/index.js';

export function Discounts() {
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
        <div><h2>{t('Discounts')}</h2><p>{t('Reusable discounts — give them to people in the People table, then apply them on events. Changing one doesn’t alter past events.')}</p></div>
      </div>
      {error && <div className="error-box" style={{ margin: '0 22px 12px' }}>{error}</div>}
      {data?.length > 0 && (
        <div className="table-wrap">
          <table>
            <thead><tr><th>{t('Discount')}</th><th className="r">{t('Value')}</th><th className="hide-sm">{t('Sport')}</th><th className="hide-sm">{t('Who has it')}</th><th className="r hide-sm">{t('Used')}</th><th /></tr></thead>
            <tbody>
              {data.map((d) => (
                <tr key={d.id} className={editId === d.id ? 'row-selected' : ''}>
                  <td className="cell-wrap">
                    <strong>{d.name}</strong>
                    <div className="row-sub show-sm">{d.sport_name || t('Any sport')} · {t('used {n}×', { n: d.uses })} · {d.people.map((p) => p.name).join(', ') || t('nobody has it')}</div>
                  </td>
                  <td className="r">{discountLabel(d)}</td>
                  <td className="secondary hide-sm">{d.sport_name || t('Any sport')}</td>
                  <td className="cell-wrap secondary hide-sm">{d.people.map((p) => p.name).join(', ') || '—'}</td>
                  <td className="r muted hide-sm">{d.uses}</td>
                  <td className="r actions">
                    <button className="icon-btn" aria-label={t('Edit')} onClick={() => { setEditId(d.id); setF({ name: d.name, kind: d.kind, value: d.value, sport_id: d.sport_id || '' }); }}><IconEdit /></button>
                    <button className="icon-btn" aria-label={t('Delete')} onClick={() => confirmDelete(t('discount “{name}” (past events keep their amounts)', { name: d.name })) && run(() => api.del(`/discounts/${d.id}`))}><IconTrash /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <form className="inline-form" onSubmit={submit}>
        <input className="select-sm" value={f.name} onChange={set('name')} placeholder={t('e.g. Founders – Hyrox free')} required style={{ flex: '2 1 200px' }} />
        <Select className="select-sm" value={f.kind} onChange={set('kind')} style={{ flex: '0 1 130px' }}>
          <option value="percent">{t('% off')}</option>
          <option value="fixed">{t('{currency} off', { currency: CURRENCY })}</option>
        </Select>
        <input className="select-sm num-input" type="number" min="0.01" step="0.01" max={f.kind === 'percent' ? 100 : undefined}
          placeholder={f.kind === 'percent' ? '%' : CURRENCY} value={f.value} onChange={set('value')} required />
        <Select className="select-sm" value={f.sport_id} onChange={set('sport_id')} style={{ flex: '1 1 140px' }}>
          <option value="">{t('Any sport')}</option>
          {sports?.map((sp) => <option key={sp.id} value={sp.id}>{sp.name}</option>)}
        </Select>
        <button className="btn btn-sm">{editId ? t('Save') : t('Add')}</button>
        {editId && <button type="button" className="btn btn-sm btn-ghost" onClick={() => { setEditId(null); setF(blank); }}>{t('Cancel')}</button>}
      </form>
    </div>
  );
}
