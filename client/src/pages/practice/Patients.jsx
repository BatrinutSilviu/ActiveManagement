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
import { t } from '../../i18n/index.js';
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
  const [condition, setCondition] = useState('');
  const [bornFrom, setBornFrom] = useState('');
  const [bornTo, setBornTo] = useState('');
  const conditions = [...new Set((data || []).flatMap((c) => c.conditions || []))].sort((a, b) => a.localeCompare(b));
  const entities = [...new Set((data || []).map((c) => c.entity).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const associations = [...new Set((data || []).map((c) => c.association).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const [creating, setCreating] = useState(false);
  const list = (data || []).filter((c) => (archived || !c.archived) && (!assoc || c.association === assoc) && (!entity || c.entity === entity)
    && (!condition || c.conditions?.includes(condition))
    && (!bornFrom || (c.birth_date && c.birth_date >= bornFrom)) && (!bornTo || (c.birth_date && c.birth_date <= bornTo))
    && (!q || fold(`${c.name} ${c.phone || ''} ${c.address || ''} ${c.tutor_name || ''} ${c.tutor_phone || ''} ${c.association || ''}`).includes(fold(q))));
  const nArchived = (data || []).filter((c) => c.archived).length;

  return (
    <div className={loading ? 'loading' : ''}>
      <div className="page-head">
        <div><h1>{t(Term('people'))}</h1><p>{t(`Contact details, notes, ${term('events')}, packages and what each one still owes.`)}</p></div>
        {canEdit && <button className="btn btn-primary" onClick={() => setCreating(true)}><IconPlus width="16" />{t(`New ${term('person')}`)}</button>}
      </div>
      <div className="filters">
        <input type="search" placeholder={t('Search name, tutor, phone, address…')} value={q} onChange={(e) => setQ(e.target.value)} />
        {entities.length > 0 && (
          <Select value={entity} onChange={(e) => setEntity(e.target.value)} aria-label={t('Legal entity')}>
            <option value="">{t('All legal entities')}</option>
            {entities.map((e) => <option key={e} value={e}>{e}</option>)}
          </Select>
        )}
        {conditions.length > 0 && (
          <Select value={condition} onChange={(e) => setCondition(e.target.value)} aria-label={t('Illness category')}>
            <option value="">{t('All illness categories')}</option>
            {conditions.map((x) => <option key={x} value={x}>{x}</option>)}
          </Select>
        )}
        <label className="check born-filter"><span className="born-label">{t('Born between')}</span>
          <input type="date" value={bornFrom} onChange={(e) => setBornFrom(e.target.value)} aria-label={t('Born from')} />
          <span>{t('and')}</span>
          <input type="date" value={bornTo} onChange={(e) => setBornTo(e.target.value)} aria-label={t('Born until')} />
        </label>
        {associations.length > 0 && (
          <Select value={assoc} onChange={(e) => setAssoc(e.target.value)} aria-label={t('Association')}>
            <option value="">{t('All associations')}</option>
            {associations.map((a) => <option key={a} value={a}>{a}</option>)}
          </Select>
        )}
        {nArchived > 0 && <label className="check"><input type="checkbox" checked={archived} onChange={(e) => setArchived(e.target.checked)} />{t('Show archived ({n})', { n: nArchived })}</label>}
      </div>
      <div className="card table-wrap">
        {list.length ? (
          <table>
            <thead><tr>
              <th>{t('Name')}</th><th className="hide-sm">{t('Legal entity')}</th><th className="hide-sm">{t('Phone')}</th><th className="hide-sm">{t(`Last ${term('event')}`)}</th><th className="hide-sm">{t('Next')}</th>
              <th className="r hide-sm">{t('Done')}</th><th className="r">{t('Owes')}</th>
            </tr></thead>
            <tbody>
              {list.map((c) => (
                <tr key={c.id} className="clickable" onClick={() => navigate(`/patients/${c.id}`)}>
                  <td className="cell-wrap">
                    <div className="row-title">{c.name}{c.conditions?.map((x) => <span key={x} className="badge" style={{ marginLeft: 4 }}>{x}</span>)}{c.association && <> <span className="badge">{c.association}</span></>}{!!c.archived && <> <span className="badge">{t('archived')}</span></>}</div>
                    {c.tutor_name && <div className="row-sub">{t('Tutor')}: {c.tutor_name}{c.tutor_relation ? ` (${c.tutor_relation})` : ''}</div>}
                    <div className="row-sub">{c.address}</div>
                    {c.entity && <div className="row-sub show-sm">{t('Legal entity')}: {c.entity}</div>}
                    {c.birth_date && <div className="row-sub">{t('Born {date}', { date: date(c.birth_date) })}</div>}
                    <div className="row-sub show-sm">{c.phone}{c.next_session ? ` · ${t('next {date}', { date: date(c.next_session) })}` : ''}</div>
                  </td>
                  <td className="hide-sm cell-wrap">{c.entity || <span className="muted">—</span>}</td>
                  <td className="hide-sm">{c.phone || c.tutor_phone || <span className="muted">—</span>}</td>
                  <td className="hide-sm">{c.last_session ? date(c.last_session) : <span className="muted">—</span>}</td>
                  <td className="hide-sm">{c.next_session ? date(c.next_session) : <span className="muted">—</span>}</td>
                  <td className="r hide-sm">{c.sessions_done}</td>
                  <td className={`r ${c.unbilled + c.unpaid > 0 ? 'neg' : 'muted'}`}>{c.unbilled + c.unpaid > 0 ? money0(c.unbilled + c.unpaid) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <div className="empty">{loading ? t('Loading…') : data?.length ? t('Nobody matches.') : t(`No ${term('people')} yet.`)}</div>}
      </div>
      {creating && <PatientForm onClose={() => setCreating(false)} onSaved={(id) => navigate(`/patients/${id}`)} />}
    </div>
  );
}
