import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api.js';
import { useApi, usePermissions } from '../../hooks.js';
import { date, money0, monthName, number, signedMoney } from '../../format.js';

/**
 * Monthly review of points. During the month each event's points are an estimate (its time points + its own
 * profit's points). Once the month is over — automatically on the 1st, or with the button — each event's
 * profit points are scaled to what the month really made, and frozen.
 */
export function PointsReview({ month, onChanged }) {
  const { data: r, reload } = useApi(`/points-review/${month}`);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const { canEdit } = usePermissions();
  if (!r) return null;
  const c = r.closed;
  const calc = async () => {
    setBusy(true);
    try { await api.post(`/points-review/${month}`); setError(null); reload(); onChanged(); } catch (e) { setError(e.message); }
    setBusy(false);
  };
  const shown = (e) => (c && c.data[e.id] ? c.data[e.id].total : null);
  const status = !c ? (r.canClose ? 'Not calculated yet' : 'Estimates — the month isn’t over')
    : c.outOfDate ? 'Out of date' : 'Real points';
  return (
    <div className="card">
      <div className="card-pad card-head" style={{ marginBottom: 0 }}>
        <div>
          <h2>Points review · {monthName(month)}</h2>
          <p>Event points are estimates during the month. When it’s over (automatically on the 1st), each event’s profit points are scaled to what the month really made:
            {' '}month’s profit {signedMoney(r.now.profit)} ÷ {money0(r.now.gains)} made by the profitable events = × {number(Math.round(r.now.scale * 1000) / 1000)}.
            Time, participants and impact points, and points set by hand, don’t change.</p>
        </div>
        <div className="payout-status">
          <span className={`badge ${c && !c.outOfDate ? 'status-completed' : c ? 'status-cancelled' : 'status-planned'}`}>{status}</span>
          {canEdit && r.canClose && <button className="btn btn-sm btn-primary" disabled={busy} onClick={calc}>{c ? 'Recalculate' : 'Calculate real points'}</button>}
        </div>
      </div>
      {error && <div className="error-box" style={{ margin: '0 22px 12px' }}>{error}</div>}
      {c && (
        <p className="hint" style={{ padding: '0 22px 12px', margin: 0 }}>
          Calculated {c.auto ? 'automatically' : `by ${c.by || 'someone'}`} on {date(c.at.slice(0, 10))}, with the month’s profit at {signedMoney(c.profit)}.
          {c.outOfDate && ' Something changed since (a cost, a finalized or reopened event…): the points below are still the frozen ones. Press Recalculate to update them.'}
        </p>
      )}
      {r.live > 0 && <p className="hint" style={{ padding: '0 22px 12px', margin: 0 }}>{r.live} event{r.live > 1 ? 's are' : ' is'} still live in this month — not counted until finalized.</p>}
      <div className="table-wrap">
        {r.now.events.length ? (
          <table>
            <thead><tr><th>Event</th><th className="r hide-sm">Profit</th><th className="r hide-sm">Time + people + impact</th><th className="r hide-sm">Profit pts (est. → real)</th><th className="r">Estimate</th><th className="r">Real</th></tr></thead>
            <tbody>
              {r.now.events.map((e) => {
                const real = c ? shown(e) : null;
                const changed = real != null && Math.abs(real - e.estimate) >= 0.01;
                return (
                  <tr key={e.id}>
                    <td className="cell-wrap"><Link to={`/events/${e.id}`}>{e.name}</Link>
                      <div className="row-sub">{date(e.date)} · {e.type_name}{e.manual ? ' · points set by hand' : ''}</div></td>
                    <td className={`r hide-sm ${e.profit < 0 ? 'neg' : ''}`}>{signedMoney(e.profit)}</td>
                    <td className="r secondary hide-sm">{e.manual ? '—' : `${number(e.time)} + ${number(e.people)} + ${number(e.impact)}`}</td>
                    <td className="r secondary hide-sm">{e.manual ? '—' : `${number(e.money_estimate)} → ${number(e.money)}`}</td>
                    <td className="r secondary">{number(e.estimate)}</td>
                    <td className="r">{real == null ? <span className="muted">—</span> : <strong className={changed ? (real < e.estimate ? 'neg' : 'pos') : ''}>{number(real)}</strong>}
                      {c?.outOfDate && Math.abs((real ?? 0) - e.total) >= 0.01 && <div className="row-sub">{number(e.total)} if recalculated</div>}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot><tr><td colSpan={4} className="hide-sm">{r.now.events.length} finalized events</td><td className="show-sm" />
              <td className="r">{number(Math.round(r.now.events.reduce((a, e) => a + e.estimate, 0) * 100) / 100)}</td>
              <td className="r">{c ? number(Math.round(r.now.events.reduce((a, e) => a + (shown(e) ?? 0), 0) * 100) / 100) : '—'}</td></tr></tfoot>
          </table>
        ) : <div className="empty">No finalized events this month.</div>}
      </div>
    </div>
  );
}
