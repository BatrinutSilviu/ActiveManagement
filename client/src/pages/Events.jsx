import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { qs } from '../api.js';
import { useApi, usePermissions, usePersistentState } from '../hooks.js';
import { date, money0, number, signedMoney } from '../format.js';
import EventForm, { STATUS_LABELS } from '../components/EventForm.jsx';
import { IconPlus } from '../components/Icons.jsx';

export function StatusBadge({ status }) {
  return <span className={`badge status-${status}`}><span className="dot" />{STATUS_LABELS[status]}</span>;
}

export default function Events() {
  const navigate = useNavigate();
  const [filters, setFilters] = usePersistentState('am-events-filters', { year: '', type: '', status: '', q: '' });
  const set = (k) => (e) => setFilters({ ...filters, [k]: e.target.value });
  const { data: events, loading, reload } = useApi(`/events${qs(filters)}`);
  const { data: years } = useApi('/stats/years');
  const { data: types } = useApi('/event-types');
  const [creating, setCreating] = useState(false);
  const { canEdit } = usePermissions();

  const list = events || [];
  const sum = (k) => list.reduce((s, e) => s + e[k], 0);

  return (
    <div className={loading ? 'loading' : ''}>
      <div className="page-head">
        <div>
          <h1>Events</h1>
          <p>Every event with its fees, costs and profit. Live events don’t count towards the funds until finalized.</p>
        </div>
        {canEdit && <button className="btn btn-primary" onClick={() => setCreating(true)}><IconPlus width="16" />New event</button>}
      </div>

      <div className="filters">
        <input type="search" placeholder="Search name, sport, location…" value={filters.q} onChange={set('q')} />
        <select value={filters.year} onChange={set('year')} aria-label="Year">
          <option value="">All years</option>
          {years?.map((y) => <option key={y}>{y}</option>)}
        </select>
        <select value={filters.type} onChange={set('type')} aria-label="Sport">
          <option value="">All sports</option>
          {types?.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <select value={filters.status} onChange={set('status')} aria-label="Status">
          <option value="">Any status</option>
          <option value="planned">Live</option>
          <option value="completed">Finalized</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>

      <div className="card table-wrap">
        {list.length ? (
          <table>
            <thead>
              <tr>
                <th className="hide-sm">Date</th><th>Event</th><th className="hide-sm">Sport</th><th className="hide-sm">Status</th><th className="r hide-sm">People</th>
                <th className="r hide-sm">Income</th><th className="r hide-sm">Costs</th><th className="r">Profit</th><th className="r hide-sm">Sport fund</th>
              </tr>
            </thead>
            <tbody>
              {list.map((e) => (
                <tr key={e.id} className="clickable" onClick={() => navigate(`/events/${e.id}`)}>
                  <td className="hide-sm">{date(e.date)}</td>
                  <td className="cell-wrap">
                    <div className="row-title">{e.name}</div>
                    <div className="row-sub hide-sm">{e.location}</div>
                    <div className="row-sub show-sm">{date(e.date)} · {e.type_name}{e.status !== 'completed' && <> · <StatusBadge status={e.status} /></>}</div>
                  </td>
                  <td className="hide-sm"><span className="badge">{e.type_name}</span></td>
                  <td className="hide-sm"><StatusBadge status={e.status} /></td>
                  <td className="r hide-sm">{number(e.participants)}</td>
                  <td className="r hide-sm">{money0(e.income)}</td>
                  <td className="r hide-sm">{money0(e.expenses)}</td>
                  <td className={`r ${e.profit > 0 ? 'pos' : e.profit < 0 ? 'neg' : ''}`}>{signedMoney(e.profit)}</td>
                  <td className="r secondary hide-sm">{e.status === 'cancelled' ? '—' : signedMoney(e.split.sport)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={4} className="hide-sm">{list.length} events</td>
                <td className="show-sm">{list.length} events</td>
                <td className="r hide-sm">{number(sum('participants'))}</td>
                <td className="r hide-sm">{money0(sum('income'))}</td>
                <td className="r hide-sm">{money0(sum('expenses'))}</td>
                <td className={`r ${sum('profit') >= 0 ? 'pos' : 'neg'}`}>{signedMoney(sum('profit'))}</td>
                <td className="hide-sm" />
              </tr>
            </tfoot>
          </table>
        ) : (
          <div className="empty">{loading ? 'Loading…' : 'No events match these filters.'}</div>
        )}
      </div>

      {creating && <EventForm onClose={() => setCreating(false)} onSaved={(id) => { reload(); navigate(`/events/${id}`); }} />}
    </div>
  );
}
