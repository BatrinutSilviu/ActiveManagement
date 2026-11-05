import { useState } from 'react';
import { api } from '../api.js';
import { useApi, usePermissions, usePersistentState } from '../hooks.js';
import { date, money, money0, number, today } from '../format.js';
import Modal, { confirmDelete } from '../components/Modal.jsx';
import Kpi from '../components/Kpi.jsx';
import { IconBox, IconEdit, IconTrash, IconUsers } from '../components/Icons.jsx';
import Select from '../components/Select.jsx';

export const STATES = [
  { key: 'new', label: 'New' },
  { key: 'good', label: 'Good' },
  { key: 'worn', label: 'Worn' },
  { key: 'broken', label: 'Broken' },
  { key: 'lost', label: 'Lost' },
];
const stateLabel = (k) => STATES.find((s) => s.key === k)?.label || k;
const stateClass = { new: 'status-completed', good: 'status-completed', worn: 'state-worn', broken: 'state-bad', lost: 'state-bad' };

export function EquipmentForm({ item, people, sports, onClose, onSaved }) {
  const [f, setF] = useState(() => ({
    name: '', sport_id: '', qty: 1, unit_cost: '', bought_on: today(), state: 'new', person_id: '', notes: '',
    ...(item ? { ...item, sport_id: item.sport_id ?? '', person_id: item.person_id ?? '', bought_on: item.bought_on ?? '', notes: item.notes ?? '' } : {}),
  }));
  const [error, setError] = useState(null);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const save = async () => {
    try {
      if (item) await api.put(`/equipment/${item.id}`, f);
      else await api.post('/equipment', f);
      onSaved();
    } catch (e) { setError(e.message); }
  };
  const total = (Number(f.qty) || 0) * (Number(f.unit_cost) || 0);
  return (
    <Modal title={item ? `Edit ${item.name}` : 'New equipment'} onClose={onClose} onSubmit={save}
      footer={<><button type="button" className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary">Save</button></>}>
      {error && <div className="error-box">{error}</div>}
      <div className="form-grid">
        <label className="field full">Name<input value={f.name} onChange={set('name')} placeholder="e.g. Padel racket Bullpadel" autoFocus required /></label>
        <label className="field">Sport
          <Select value={f.sport_id} onChange={set('sport_id')}>
            <option value="">Any / general</option>
            {sports.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
        </label>
        <label className="field">State
          <Select value={f.state} onChange={set('state')}>
            {STATES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </Select>
        </label>
        <label className="field">Pieces<input type="number" min="1" step="1" value={f.qty} onChange={set('qty')} required /></label>
        <label className="field">Cost per piece (RON)<input type="number" min="0" step="0.01" value={f.unit_cost} onChange={set('unit_cost')} /></label>
        <label className="field">Bought on<input type="date" value={f.bought_on} onChange={set('bought_on')} /></label>
        <label className="field">Who has it
          <Select value={f.person_id} onChange={set('person_id')}>
            <option value="">— in storage / nobody —</option>
            {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
        </label>
        <label className="field full">Notes<input value={f.notes} onChange={set('notes')} placeholder="Where it's kept, serial number, what's wrong with it…" /></label>
      </div>
      {total > 0 && Number(f.qty) > 1 && <p className="hint" style={{ margin: 0 }}>Total cost {money(total)}</p>}
      <p className="hint" style={{ margin: 0 }}>Pieces that differ in state or holder go on separate lines, e.g. 8 balls Good with Ana and 2 Worn in storage.</p>
    </Modal>
  );
}

/** Things the community keeps and reuses: what they cost, what state they're in, who has them. */
export default function Equipment({ form, setForm }) {
  const { data: items, reload } = useApi('/equipment');
  const { data: allPeople } = useApi('/people');
  const { data: sports } = useApi('/event-types');
  const [filters, setFilters] = usePersistentState('am-equipment-filters', { q: '', state: '', person: '' });
  const [error, setError] = useState(null);
  const { canEdit } = usePermissions();
  const run = async (fn) => { try { await fn(); setError(null); } catch (e) { setError(e.message); } reload(); };
  const setFilter = (k) => (e) => setFilters({ ...filters, [k]: e.target.value });

  if (!items || !allPeople || !sports) return null;
  const people = allPeople.filter((p) => p.active);
  const kept = items.filter((i) => i.state !== 'lost');
  const value = kept.reduce((s, i) => s + i.qty * i.unit_cost, 0);
  const pieces = kept.reduce((s, i) => s + i.qty, 0);
  const needsAttention = items.filter((i) => i.state === 'broken' || i.state === 'worn');
  const holders = [...new Set(kept.map((i) => i.person_name).filter(Boolean))];

  const q = filters.q.trim().toLowerCase();
  const shown = items.filter((i) => (!q || `${i.name} ${i.notes || ''} ${i.sport_name || ''}`.toLowerCase().includes(q))
    && (!filters.state || i.state === filters.state)
    && (!filters.person || (filters.person === 'none' ? !i.person_id : String(i.person_id) === filters.person)));

  return (
    <>
      {error && <div className="error-box">{error}</div>}
      <div className="grid grid-kpi">
        <Kpi label="Equipment cost" icon={IconBox} tone="profit" value={money0(value)} sub={`${number(pieces)} pieces, lost ones not counted`} />
        <Kpi label="People holding equipment" icon={IconUsers} value={holders.length} sub={holders.map((n) => n.split(' ')[0]).join(', ') || '—'} />
        <Kpi label="Worn or broken" value={needsAttention.reduce((s, i) => s + i.qty, 0)} sub={needsAttention.map((i) => i.name).join(', ') || 'nothing'} />
      </div>

      {items.length > 0 && (
        <div className="filters">
          <input type="search" placeholder="Search name, sport or notes…" value={filters.q} onChange={setFilter('q')} />
          <Select value={filters.state} onChange={setFilter('state')} aria-label="State">
            <option value="">All states</option>
            {STATES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </Select>
          <Select value={filters.person} onChange={setFilter('person')} aria-label="Who has it">
            <option value="">Anyone</option>
            <option value="none">In storage / nobody</option>
            {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
        </div>
      )}

      <div className="card table-wrap">
        {shown.length ? (
          <table>
            <thead><tr>
              <th>Item</th><th className="r">Pieces</th><th>State</th><th className="hide-sm">Who has it</th>
              <th className="r hide-sm">Cost / piece</th><th className="r hide-sm">Total cost</th><th className="hide-sm">Bought</th>{canEdit && <th />}
            </tr></thead>
            <tbody>
              {shown.map((i) => (
                <tr key={i.id} className={i.state === 'lost' ? 'row-off' : ''}>
                  <td className="cell-wrap">
                    <div className="row-title">{i.name}</div>
                    <div className="row-sub">{[i.sport_name, i.notes].filter(Boolean).join(' · ')}</div>
                    <div className="row-sub show-sm">{i.person_name || 'In storage'} · {money(i.qty * i.unit_cost)}{i.bought_on ? ` · ${date(i.bought_on)}` : ''}</div>
                  </td>
                  <td className="r">{number(i.qty)}</td>
                  <td>
                    {canEdit ? (
                      <Select className={`select-sm badge ${stateClass[i.state]}`} value={i.state} aria-label={`State of ${i.name}`}
                        onChange={(e) => run(() => api.put(`/equipment/${i.id}`, { ...i, state: e.target.value }))}>
                        {STATES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                      </Select>
                    ) : <span className={`badge ${stateClass[i.state]}`}>{stateLabel(i.state)}</span>}
                  </td>
                  <td className="hide-sm">
                    {canEdit ? (
                      <Select className="select-sm" value={i.person_id ?? ''} aria-label={`Who has ${i.name}`}
                        onChange={(e) => run(() => api.put(`/equipment/${i.id}`, { ...i, person_id: e.target.value }))}>
                        <option value="">In storage</option>
                        {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                        {i.person_id && !people.some((p) => p.id === i.person_id) && <option value={i.person_id}>{i.person_name}</option>}
                      </Select>
                    ) : (i.person_name || <span className="muted">In storage</span>)}
                  </td>
                  <td className="r hide-sm">{money(i.unit_cost)}</td>
                  <td className="r hide-sm">{money(i.qty * i.unit_cost)}</td>
                  <td className="secondary hide-sm">{date(i.bought_on)}</td>
                  {canEdit && (
                    <td className="r actions">
                      <button className="icon-btn" aria-label="Edit" onClick={() => setForm({ equipment: i })}><IconEdit /></button>
                      <button className="icon-btn" aria-label="Delete" onClick={() => confirmDelete(i.name) && run(() => api.del(`/equipment/${i.id}`))}><IconTrash /></button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        ) : <div className="empty">{items.length ? 'Nothing matches these filters.' : 'No equipment yet. Add balls, mats, rackets… with what they cost and who has them.'}</div>}
      </div>

      {form?.equipment !== undefined && (
        <EquipmentForm item={form.equipment} people={people} sports={sports}
          onClose={() => setForm(null)} onSaved={() => { setForm(null); reload(); }} />
      )}
    </>
  );
}
