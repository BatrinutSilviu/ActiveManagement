import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, qs } from '../api.js';
import { useApi, usePermissions, usePersistentState } from '../hooks.js';
import { date, money0, number, signedMoney } from '../format.js';
import EventForm from '../components/EventForm.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import { IconEdit, IconPlus } from '../components/Icons.jsx';
import Select from '../components/Select.jsx';
import { useBusiness } from '../business.js';
import { t } from '../i18n/index.js';

export default function Events() {
  const navigate = useNavigate();
  const [filters, setFilters] = usePersistentState('am-events-filters', { year: '', type: '', status: '', q: '' });
  const set = (k) => (e) => setFilters({ ...filters, [k]: e.target.value });
  const { data: events, loading, reload } = useApi(`/events${qs(filters)}`);
  const { data: years } = useApi('/stats/years');
  const { data: types } = useApi('/event-types');
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(null); // the full event being edited from the list
  const { canEdit } = usePermissions();
  const { term, Term } = useBusiness();

  const list = events || [];
  const sum = (k) => list.reduce((s, e) => s + e[k], 0);
  const edit = (ev, id) => {
    ev.stopPropagation();
    api.get(`/events/${id}`).then(setEditing).catch((err) => alert(err.message));
  };

  return (
    <div className={loading ? 'loading' : ''}>
      <div className="page-head">
        <div>
          <h1>{t(Term('events'))}</h1>
          <p>{t(`Every ${term('event')} with its fees, costs and profit. Live ${term('events')} don’t count in the money until finalized.`)}</p>
        </div>
        {canEdit && <button className="btn btn-primary" onClick={() => setCreating(true)}><IconPlus width="16" />{t(`New ${term('event')}`)}</button>}
      </div>

      <div className="filters">
        <input type="search" placeholder={t('Search name, sport, location…')} value={filters.q} onChange={set('q')} />
        <Select value={filters.year} onChange={set('year')} aria-label={t('Year')}>
          <option value="">{t('All years')}</option>
          {years?.map((y) => <option key={y}>{y}</option>)}
        </Select>
        <Select value={filters.type} onChange={set('type')} aria-label={t('Sport')}>
          <option value="">{t('All sports')}</option>
          {types?.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
        </Select>
        <Select value={filters.status} onChange={set('status')} aria-label={t('Status')}>
          <option value="">{t('Any status')}</option>
          <option value="planned">{t('Live')}</option>
          <option value="completed">{t('Finalized')}</option>
          <option value="cancelled">{t('Cancelled')}</option>
        </Select>
      </div>

      <div className="card table-wrap">
        {list.length ? (
          <table>
            <thead>
              <tr>
                <th className="hide-sm">{t('Date')}</th><th>{t('Event')}</th><th className="hide-sm">{t('Sport')}</th><th className="hide-sm">{t('Status')}</th><th className="r hide-sm">{t('People')}</th>
                <th className="r hide-sm">{t('Income')}</th><th className="r hide-sm">{t('Costs')}</th><th className="r">{t('Profit')}</th><th className="r hide-sm">{t('Sport fund')}</th>{canEdit && <th />}
              </tr>
            </thead>
            <tbody>
              {list.map((e) => (
                <tr key={e.id} className="clickable" onClick={() => navigate(`/events/${e.id}`)}>
                  <td className="hide-sm">{date(e.date)}</td>
                  <td className="cell-wrap">
                    <div className="row-title">{e.name}{!!e.training && <> <span className="badge badge-training">{t('Training')}</span></>}</div>
                    <div className="row-sub hide-sm">{e.location}</div>
                    <div className="row-sub show-sm">{date(e.date)} · {e.type_name}{e.status !== 'completed' && <> · <StatusBadge status={e.status} /></>}</div>
                  </td>
                  <td className="hide-sm"><span className="badge">{e.type_name}</span></td>
                  <td className="hide-sm"><StatusBadge status={e.status} /></td>
                  <td className="r hide-sm">{number(e.participants)}</td>
                  <td className="r hide-sm">{money0(e.income)}</td>
                  <td className="r hide-sm">{money0(e.expenses)}</td>
                  <td className={`r ${e.profit > 0 ? 'pos' : e.profit < 0 ? 'neg' : ''}`}>{signedMoney(e.profit)}</td>
                  <td className="r secondary hide-sm">{e.status === 'cancelled' || !e.is_sport ? '—' : signedMoney(e.split.sport)}</td>
                  {canEdit && <td className="r actions"><button className="icon-btn" aria-label={t('Edit {name}', { name: e.name })} title={t('Edit')} onClick={(ev) => edit(ev, e.id)}><IconEdit /></button></td>}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={4} className="hide-sm">{t('{n} events', { n: list.length })}</td>
                <td className="show-sm">{t('{n} events', { n: list.length })}</td>
                <td className="r hide-sm">{number(sum('participants'))}</td>
                <td className="r hide-sm">{money0(sum('income'))}</td>
                <td className="r hide-sm">{money0(sum('expenses'))}</td>
                <td className={`r ${sum('profit') >= 0 ? 'pos' : 'neg'}`}>{signedMoney(sum('profit'))}</td>
                <td className="hide-sm" />
                {canEdit && <td />}
              </tr>
            </tfoot>
          </table>
        ) : (
          <div className="empty">{t(loading ? 'Loading…' : 'No events match these filters.')}</div>
        )}
      </div>

      {editing && <EventForm event={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} />}
      {creating && <EventForm onClose={() => setCreating(false)} onSaved={(id) => { reload(); navigate(`/events/${id}`); }} />}
    </div>
  );
}
