// The practice's patients: who they are, when they were last / are next seen, and what they owe.
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { qs } from '../../api.js';
import { useApi, usePermissions } from '../../hooks.js';
import Select from '../../components/Select.jsx';
import { useBusiness } from '../../business.js';
import { date, money0 } from '../../format.js';
import { IconPlus } from '../../components/Icons.jsx';
import { fold } from '../../util.js';
import { PatientForm } from './PatientForms.jsx';
import { localToday } from './common.jsx';

export default function Patients() {
  const navigate = useNavigate();
  const { canEdit } = usePermissions();
  const { term, Term } = useBusiness();
  const { data, loading } = useApi(`/clients${qs({ today: localToday() })}`);
  const [q, setQ] = useState('');
  const [archived, setArchived] = useState(false);
  const [assoc, setAssoc] = useState('');
  const [entity, setEntity] = useState('');
  const entities = [...new Set((data || []).map((c) => c.entity).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const associations = [...new Set((data || []).map((c) => c.association).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const [creating, setCreating] = useState(false);
  const list = (data || []).filter((c) => (archived || !c.archived) && (!assoc || c.association === assoc) && (!entity || c.entity === entity)
    && (!q || fold(`${c.name} ${c.phone || ''} ${c.address || ''} ${c.tutor_name || ''} ${c.tutor_phone || ''} ${c.association || ''}`).includes(fold(q))));
  const nArchived = (data || []).filter((c) => c.archived).length;

  return (
    <div className={loading ? 'loading' : ''}>
      <div className="page-head">
        <div><h1>{Term('people')}</h1><p>Contact details, notes, {term('events')}, packages and what each one still owes.</p></div>
        {canEdit && <button className="btn btn-primary" onClick={() => setCreating(true)}><IconPlus width="16" />New {term('person')}</button>}
      </div>
      <div className="filters">
        <input type="search" placeholder="Search name, tutor, phone, address…" value={q} onChange={(e) => setQ(e.target.value)} />
        {entities.length > 1 && (
          <Select value={entity} onChange={(e) => setEntity(e.target.value)} aria-label="Legal entity">
            <option value="">All legal entities</option>
            {entities.map((e) => <option key={e} value={e}>{e}</option>)}
          </Select>
        )}
        {associations.length > 0 && (
          <Select value={assoc} onChange={(e) => setAssoc(e.target.value)} aria-label="Association">
            <option value="">All associations</option>
            {associations.map((a) => <option key={a} value={a}>{a}</option>)}
          </Select>
        )}
        {nArchived > 0 && <label className="check"><input type="checkbox" checked={archived} onChange={(e) => setArchived(e.target.checked)} />Show archived ({nArchived})</label>}
      </div>
      <div className="card table-wrap">
        {list.length ? (
          <table>
            <thead><tr>
              <th>Name</th><th className="hide-sm">Phone</th><th className="hide-sm">Last {term('event')}</th><th className="hide-sm">Next</th>
              <th className="r hide-sm">Done</th><th className="r">Owes</th>
            </tr></thead>
            <tbody>
              {list.map((c) => (
                <tr key={c.id} className="clickable" onClick={() => navigate(`/patients/${c.id}`)}>
                  <td className="cell-wrap">
                    <div className="row-title">{c.name}{c.entity && entities.length > 1 && <> <span className="badge">{c.entity}</span></>}{c.association && <> <span className="badge">{c.association}</span></>}{!!c.archived && <> <span className="badge">archived</span></>}</div>
                    {c.tutor_name && <div className="row-sub">Tutor: {c.tutor_name}{c.tutor_relation ? ` (${c.tutor_relation})` : ''}</div>}
                    <div className="row-sub">{c.address}</div>
                    <div className="row-sub show-sm">{c.phone}{c.next_session ? ` · next ${date(c.next_session)}` : ''}</div>
                  </td>
                  <td className="hide-sm">{c.phone || c.tutor_phone || <span className="muted">—</span>}</td>
                  <td className="hide-sm">{c.last_session ? date(c.last_session) : <span className="muted">—</span>}</td>
                  <td className="hide-sm">{c.next_session ? date(c.next_session) : <span className="muted">—</span>}</td>
                  <td className="r hide-sm">{c.sessions_done}</td>
                  <td className={`r ${c.unbilled + c.unpaid > 0 ? 'neg' : 'muted'}`}>{c.unbilled + c.unpaid > 0 ? money0(c.unbilled + c.unpaid) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <div className="empty">{loading ? 'Loading…' : data?.length ? 'Nobody matches.' : `No ${term('people')} yet.`}</div>}
      </div>
      {creating && <PatientForm onClose={() => setCreating(false)} onSaved={(id) => navigate(`/patients/${id}`)} />}
    </div>
  );
}
