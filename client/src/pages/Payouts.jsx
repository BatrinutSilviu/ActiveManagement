import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useApi, useChartColors, usePermissions } from '../hooks.js';
import { date, money, money0, monthName, number, pctLabel, signedMoney } from '../format.js';
import { confirmDelete } from '../components/Modal.jsx';
import { IconEdit, IconPlus, IconTrash } from '../components/Icons.jsx';
import { TASK_LABELS } from '../points.js';
import { Targets } from './payouts/Targets.jsx';
import { ContributionForm } from './payouts/ContributionForm.jsx';
import { PayForm } from './payouts/PayForm.jsx';
import { PointsReview } from './payouts/PointsReview.jsx';
import { PayoutHistory } from './payouts/PayoutHistory.jsx';

const shiftMonth = (ym, d) => {
  const [y, m] = ym.split('-').map(Number);
  const t = new Date(y, m - 1 + d, 1);
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}`;
};

export default function Payouts() {
  const c = useChartColors();
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const { data: r, loading, reload: reloadMonth } = useApi(`/payouts?month=${month}`);
  const [version, setVersion] = useState(0);
  const reload = () => { reloadMonth(); setVersion((v) => v + 1); };
  const [form, setForm] = useState(null);
  const [paying, setPaying] = useState(false);
  const { canEdit } = usePermissions();
  if (!r) return null;

  const s = r.split;
  const communityPct = 100 - s.foundersStandard - s.foundersPoints;
  const parts = [
    { key: 'community', label: `Community ${pctLabel(communityPct)}`, value: r.pools.community, color: c.sportfund },
    { key: 'standard', label: `Founders ${pctLabel(s.foundersStandard)}`, value: r.pools.standard, color: c.founders },
    { key: 'points', label: `Organisers ${pctLabel(s.foundersPoints)}`, value: r.pools.points, color: c.general },
  ];
  const pay = r.payout;
  const paidAny = !!pay.paidAt;
  const owing = Math.abs(pay.owed) >= 0.01;
  const markPaid = () => setPaying(true);
  const restToFund = async () => {
    const owed = r.people.filter((p) => p.owed >= 0.01);
    if (!window.confirm(`Give the rest to the general community fund instead of paying it?\n\n${owed.map((p) => `${p.name}: ${money(p.owed)}`).join('\n')}\n\n${money(owed.reduce((a, p) => a + p.owed, 0))} goes to the general fund and ${monthName(month)} counts as settled.`)) return;
    await api.post(`/payouts/${month}/to-fund`);
    reload();
  };
  const undoPaid = async () => {
    if (!window.confirm(`Undo the payouts recorded for ${monthName(month)}? The month will show as unpaid again.`)) return;
    await api.del(`/payouts/${month}`);
    reload();
  };
  const delContribution = async (l) => {
    if (!confirmDelete(`${l.points} points for ${l.person_name}`)) return;
    await api.del(`/contributions/${l.id}`);
    reload();
  };

  return (
    <div className={loading ? 'loading' : ''}>
      <div className="page-head">
        <div>
          <h1>Payouts</h1>
          <p>This month’s profit, how it’s divided, and what each founder and organiser gets.</p>
        </div>
        <div className="month-nav">
          <button className="btn btn-sm" onClick={() => setMonth(shiftMonth(month, -1))} aria-label="Previous month">‹</button>
          <input type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} aria-label="Month" />
          <button className="btn btn-sm" onClick={() => setMonth(shiftMonth(month, 1))} aria-label="Next month">›</button>
        </div>
      </div>

      <div className="stack">
        {r.unpaidMonths.some((m) => m.month !== month) && (
          <div className="unpaid-months">
            <span className="muted">Not paid yet:</span>
            {r.unpaidMonths.filter((m) => m.month !== month).map((m) => (
              <button key={m.month} className="btn btn-sm" onClick={() => setMonth(m.month)}>
                {monthName(m.month)} · {m.paid ? `${signedMoney(m.owed)} difference` : money0(m.owed)}
              </button>
            ))}
          </div>
        )}
        <div className="grid grid-3-1" style={{ alignItems: 'start' }}>
          <div className="stack">
            <div className="card card-pad">
              <div className="card-head">
                <div><h2>Profit · {monthName(month)}</h2><p>{r.events.length} finalized events{r.liveEvents ? ` · ${r.liveEvents} still live (not counted yet)` : ''}</p></div>
              </div>
              <div className="profit-hero">
                <strong className={r.profit < 0 ? 'neg' : ''}>{signedMoney(r.profit)}</strong>
                {r.liveEvents > 0 && <span className="muted">+ {signedMoney(r.pending.founders + r.pending.community)} expected from live events</span>}
              </div>
              <div className="split-bar" style={{ height: 14 }} role="img" aria-label="Profit split">
                {r.profit > 0 && parts.map((p) => <div key={p.key} style={{ width: `${(p.value / r.profit) * 100}%`, background: p.color }} />)}
              </div>
              <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', marginTop: 18 }}>
                <div className="mini-stat">
                  <span className="mini-label"><i style={{ background: c.sportfund }} />Reinvest in community {pctLabel(communityPct)}</span>
                  <strong>{money0(r.pools.community)}</strong>
                  <span className="muted">{money0(r.pools.general)} general · {money0(r.pools.sport)} sport funds</span>
                </div>
                <div className="mini-stat">
                  <span className="mini-label"><i style={{ background: c.founders }} />Founders {pctLabel(s.foundersStandard)}</span>
                  <strong>{money0(r.pools.standard)}</strong>
                  <span className="muted">{r.founders ? `${money(r.pools.standard / r.founders)} each · ${r.founders} founders` : 'no founders set'}</span>
                </div>
                <div className="mini-stat">
                  <span className="mini-label"><i style={{ background: c.general }} />Organisers {pctLabel(s.foundersPoints)}</span>
                  <strong>{money0(r.pools.points)}</strong>
                  <span className="muted">{r.totalPoints ? `${number(r.totalPoints)} points · ${money(r.pools.points / r.totalPoints)} per point` : 'no points this month'}</span>
                  {r.pools.freeTasks !== 0 && <span className="muted">{money0(r.pools.freeTasks)} of it to the funds ({[r.freePoints ? `${number(r.freePoints)} pts done for free` : '', r.nobodyPoints ? `${number(r.nobodyPoints)} pts of tasks nobody did` : ''].filter(Boolean).join(', ')})</span>}
                </div>
              </div>
            </div>

            <div className="card">
              <div className="card-pad card-head" style={{ marginBottom: 0 }}>
                <div><h2>To pay · {monthName(month)}</h2><p>Founders’ equal share + organisers’ share by points</p></div>
                <div className="payout-status">
                  <strong>{money(pay.due)}</strong>
                  {paidAny && <span className="badge status-completed">Paid {date(pay.paidAt)}</span>}
                  {canEdit && (!paidAny || pay.owed >= 0.01) && (
                    <button className="btn btn-sm btn-primary" onClick={markPaid}>{paidAny ? `Pay the rest ${money(pay.owed)}` : 'Mark as paid'}</button>
                  )}
                  {canEdit && pay.owed >= 0.01 && (
                    <button className="btn btn-sm" onClick={restToFund} title="Not paid to the founders / organisers: it goes to the general community fund">
                      {paidAny ? 'Rest' : 'All'} to community fund</button>
                  )}
                  {canEdit && paidAny && <button className="btn btn-sm" onClick={undoPaid}>Undo</button>}
                </div>
              </div>
              {paidAny && owing && (
                <p className="hint" style={{ padding: '0 22px 12px', margin: 0 }}>
                  {money(pay.paid)} was paid against {money(pay.due)} calculated, so {pay.owed > 0 ? `${money(pay.owed)} more is owed` : `${money(-pay.owed)} more was paid than calculated`}.
                </p>
              )}
              {pay.toFund >= 0.01 && (
                <p className="hint" style={{ padding: '0 22px 12px', margin: 0 }}>{money(pay.toFund)} of it went to the general community fund instead of being paid out.</p>
              )}
              <div className="table-wrap">
                {r.people.length ? (
                  <table>
                    <thead><tr><th>Person</th><th className="r hide-sm">Founder share</th><th className="r hide-sm">Points</th><th className="r hide-sm">Organiser share</th><th className="r">Total</th>{paidAny && <th className="r">Paid</th>}</tr></thead>
                    <tbody>
                      {r.people.map((p) => (
                        <tr key={p.id}>
                          <td>
                            <strong>{p.name}</strong>{p.founder && <span className="badge hide-sm" style={{ marginLeft: 6 }}>Founder</span>}
                            <div className="row-sub show-sm">{money0(p.standard)} founder · {money0(p.pointsAmount)} organiser ({number(p.points)}p)
                              {p.freePoints > 0 ? ` · ${number(p.freePoints)}p free` : ''}{p.pendingPoints > 0 ? ` · ${number(p.pendingPoints)}p live` : ''}</div>
                          </td>
                          <td className="r hide-sm">{money(p.standard)}</td>
                          <td className="r hide-sm">
                            {number(p.points)}
                            {r.totalPoints > 0 && <span className="muted"> · {Math.round((p.points / r.totalPoints) * 100)}%</span>}
                            {p.freePoints > 0 && <div className="row-sub">+ {number(p.freePoints)} done for free</div>}
                            {p.pendingPoints > 0 && <div className="row-sub">+ {number(p.pendingPoints)} from live events</div>}
                          </td>
                          <td className="r hide-sm">{money(p.pointsAmount)}</td>
                          <td className="r"><strong>{money(p.total)}</strong></td>
                          {paidAny && (
                            <td className="r">
                              {money(p.paid)}
                              {p.toFund >= 0.01 && <div className="row-sub">incl. {money(p.toFund)} to the fund</div>}
                              {Math.abs(p.owed) >= 0.01 && <div className={`row-sub ${p.owed < 0 ? 'neg' : ''}`}>{signedMoney(p.owed)} {p.owed > 0 ? 'owed' : 'overpaid'}</div>}
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : <div className="empty">Mark founders in Settings → People.</div>}
              </div>
              {r.unassignedPoints > 0 && (
                <p className="hint" style={{ padding: '0 22px 16px', margin: 0 }}>Nobody earned points this month, so the organisers’ {money0(r.unassignedPoints)} isn’t assigned to anyone.</p>
              )}
            </div>
          </div>
          <Targets month={month} split={s} onSaved={reload} />
        </div>

        <PointsReview key={month} month={month} onChanged={reload} />

        <div className="card">
          <div className="card-pad card-head" style={{ marginBottom: 0 }}>
            <div><h2>Points earned · {monthName(month)}</h2>
              <p>From finalized events’ tasks, stock purchases and contributions outside events{r.pendingPoints ? ` · ${number(r.pendingPoints)} more points on live events` : ''}</p></div>
            {canEdit && <button className="btn btn-sm" onClick={() => setForm({})}><IconPlus width="14" />Add points</button>}
          </div>
          <div className="table-wrap">
            {r.ledger.length ? (
              <table>
                <thead><tr><th className="hide-sm">Date</th><th>Person</th><th>For</th><th className="hide-sm">Activity</th><th className="hide-sm">Task</th><th className="r">Points</th>{canEdit && <th />}</tr></thead>
                <tbody>
                  {r.ledger.map((l) => (
                    <tr key={`${l.source}-${l.id}`}>
                      <td className="hide-sm">{date(l.date)}</td>
                      <td>{l.person_name}{l.free ? <span className="badge status-completed" style={{ marginLeft: 6 }}>free</span> : null}</td>
                      <td className="cell-wrap">
                        {l.event_id ? <Link to={`/events/${l.event_id}`}>{l.title}</Link> : l.title}
                        <div className="row-sub show-sm">{date(l.date)}{l.activity_name ? ` · ${l.activity_name}` : ''}</div>
                      </td>
                      <td className="secondary hide-sm">{l.activity_name || '—'}</td>
                      <td className="secondary hide-sm">{l.task ? `${TASK_LABELS[l.task]}${l.sharing > 1 ? ` (shared by ${l.sharing})` : ''}` : l.source === 'purchase' ? (l.kind === 'merch' ? 'Bought partnership merchandise' : 'Bought items / prizes') : 'Contribution'}</td>
                      <td className="r"><strong>{number(l.points)}</strong></td>
                      {canEdit && (
                        <td className="r actions">
                          {l.source === 'contribution' && (
                            <>
                              <button className="icon-btn" aria-label="Edit" onClick={() => setForm({ item: l })}><IconEdit /></button>
                              <button className="icon-btn" aria-label="Delete" onClick={() => delContribution(l)}><IconTrash /></button>
                            </>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <div className="empty">No points yet this month. Add who did each task on the events, or add points for other work.</div>}
          </div>
        </div>

        <PayoutHistory version={version} onOpen={(m) => { setMonth(m); window.scrollTo({ top: 0, behavior: 'smooth' }); }} />
      </div>

      {paying && <PayForm month={month} r={r} onClose={() => setPaying(false)} onSaved={() => { setPaying(false); reload(); }} />}
      {form && <ContributionForm month={month} item={form.item} onClose={() => setForm(null)} onSaved={() => { setForm(null); reload(); }} />}
    </div>
  );
}
