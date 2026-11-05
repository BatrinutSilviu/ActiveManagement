import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useApi, useChartColors, usePermissions } from '../hooks.js';
import { date, money, money0, number, signedMoney } from '../format.js';
import Modal, { confirmDelete } from '../components/Modal.jsx';
import { IconEdit, IconPlus, IconTrash } from '../components/Icons.jsx';
import { monthName, pctLabel } from './Dashboard.jsx';
import { scales, TASK_LABELS } from '../points.js';
import Select from '../components/Select.jsx';

const shiftMonth = (ym, d) => {
  const [y, m] = ym.split('-').map(Number);
  const t = new Date(y, m - 1 + d, 1);
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}`;
};
const r2 = (v) => Math.round(v * 100) / 100;

export function pointsLabel(a) {
  const [lo, hi] = [a.organizer_points, a.organizer_max];
  if (scales(a)) return hi ? `${number(lo)}–${number(hi)}` : `${number(lo)}+`;
  return hi ? `${number(lo)}–${number(hi)}` : number(lo);
}


/** Targets for the month: community / founders / organisers, must add up to 100%. */
function Targets({ month, split, onSaved }) {
  const toForm = (s) => ({
    community: r2(100 - s.foundersStandard - s.foundersPoints), founders: s.foundersStandard, organisers: s.foundersPoints,
    generalShare: r2(s.generalShare),
  });
  const [f, setF] = useState(() => toForm(split));
  const [error, setError] = useState(null);
  const { canEdit } = usePermissions();
  useEffect(() => setF(toForm(split)), [split]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const total = r2(Number(f.community) + Number(f.founders) + Number(f.organisers));
  const dirty = JSON.stringify(f) !== JSON.stringify(toForm(split));

  const save = async () => {
    if (total !== 100) return setError(`The three targets add up to ${total}% — they must make 100%.`);
    try {
      await api.put(`/splits/${month}`, { foundersStandard: f.founders, foundersPoints: f.organisers, generalShare: f.generalShare });
      setError(null);
      onSaved();
    } catch (e) { setError(e.message); }
  };
  const reset = async () => { await api.del(`/splits/${month}`); onSaved(); };

  return (
    <div className="card card-pad">
      <div className="card-head">
        <div><h2>Targets for {monthName(month)}</h2><p>How this month’s profit is divided</p></div>
        {split.custom ? <span className="badge status-planned">Set for this month</span> : <span className="badge">Default</span>}
      </div>
      {error && <div className="error-box" style={{ marginBottom: 12 }}>{error}</div>}
      <fieldset className="plain" disabled={!canEdit}>
      <div className="targets">
        <label className="field">Reinvest in community<div className="pct-input"><input type="number" min="0" max="100" step="0.5" value={f.community} onChange={set('community')} /><span>%</span></div></label>
        <label className="field">Founders (equal)<div className="pct-input"><input type="number" min="0" max="100" step="0.5" value={f.founders} onChange={set('founders')} /><span>%</span></div></label>
        <label className="field">Organisers (by points)<div className="pct-input"><input type="number" min="0" max="100" step="0.5" value={f.organisers} onChange={set('organisers')} /><span>%</span></div></label>
      </div>
      <div className={`targets-total ${total === 100 ? '' : 'neg'}`}>Total {total}%{total !== 100 && ' — must be 100%'}</div>
      <label className="field" style={{ marginTop: 12 }}>Of the community share, to the general fund
        <div className="pct-input"><input type="number" min="0" max="100" step="0.01" value={f.generalShare} onChange={set('generalShare')} /><span>%</span></div>
        <span className="hint">The rest goes to each event’s sport fund. ⅓ = 33.33</span>
      </label>
      </fieldset>
      {canEdit && (
        <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
          <button className="btn btn-primary" disabled={!dirty} onClick={save}>Save for {monthName(month)}</button>
          {split.custom && <button className="btn" onClick={reset}>Use default</button>}
        </div>
      )}
      <p className="hint" style={{ margin: '10px 0 0' }}>The default split is set in <Link to="/settings">Settings</Link>.</p>
    </div>
  );
}

function ContributionForm({ month, item, onClose, onSaved }) {
  const { data: people } = useApi('/people');
  const { data: activities } = useApi('/activities');
  const [f, setF] = useState(() => ({
    person_id: '', activity_id: '', points: '', note: '',
    date: month === new Date().toISOString().slice(0, 7) ? new Date().toISOString().slice(0, 10) : `${month}-01`, ...(item || {}),
  }));
  const [error, setError] = useState(null);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const pickActivity = (e) => {
    const a = activities.find((x) => String(x.id) === e.target.value);
    setF({ ...f, activity_id: e.target.value, points: a ? a.organizer_points : f.points });
  };
  const save = async () => {
    try {
      if (item) await api.put(`/contributions/${item.id}`, f);
      else await api.post('/contributions', f);
      onSaved();
    } catch (e) { setError(e.message); }
  };
  const act = activities?.find((x) => String(x.id) === String(f.activity_id));
  return (
    <Modal title={item ? 'Edit contribution' : 'Add points'} onClose={onClose} onSubmit={save}
      footer={<><button type="button" className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary">Save</button></>}>
      {error && <div className="error-box">{error}</div>}
      <p className="hint" style={{ margin: 0 }}>For work that isn’t an event in the app — a partnership, a promo event, a free event with a partner club.
        People get points for event tasks on the event page.</p>
      <div className="form-grid">
        <label className="field">Person
          <Select value={f.person_id} onChange={set('person_id')} required>
            <option value="">Choose…</option>
            {people?.filter((p) => p.active).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
        </label>
        <label className="field">Date<input type="date" value={f.date} onChange={set('date')} required /></label>
        <label className="field full">Activity
          <Select value={f.activity_id || ''} onChange={pickActivity}>
            <option value="">— other —</option>
            {activities?.map((a) => <option key={a.id} value={a.id}>{a.name} · {pointsLabel(a)} pts</option>)}
          </Select>
        </label>
        <label className="field">Points
          <input type="number" min="0" step="0.5" value={f.points} onChange={set('points')} required />
          {act?.organizer_max && <span className="hint">Between {number(act.organizer_points)} and {number(act.organizer_max)} depending on complexity</span>}
        </label>
        <label className="field">Note<input value={f.note || ''} onChange={set('note')} placeholder="e.g. Partnership with Padel Arena" /></label>
      </div>
    </Modal>
  );
}

/** Record what was really paid for a month: each person's amount (owed by default) and the date. */
function PayForm({ month, r, onClose, onSaved }) {
  const [amounts, setAmounts] = useState(() => Object.fromEntries(r.people.map((p) => [p.id, String(Math.max(r2(p.owed), 0) || '')])));
  const [date_, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [error, setError] = useState(null);
  const total = Object.values(amounts).reduce((a, v) => a + (Number(v) || 0), 0);
  const paidAny = !!r.payout.paidAt;
  const save = async () => {
    try { await api.post(`/payouts/${month}/apply`, { amounts, date: date_ }); onSaved(); } catch (e) { setError(e.message); }
  };
  return (
    <Modal title={`${paidAny ? 'Record another payment' : 'Mark as paid'} · ${monthName(month)}`} onClose={onClose} onSubmit={save}
      footer={<><button type="button" className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary">Record {money(total)}</button></>}>
      {error && <div className="error-box">{error}</div>}
      <p className="hint" style={{ margin: 0 }}>Enter what each person was actually sent{paidAny ? ' this time' : ''} — it can differ from the calculated amount
        (e.g. a round 700 each). The difference stays visible on this page.{r.liveEvents ? ` ${r.liveEvents} live event${r.liveEvents > 1 ? 's aren’t' : ' isn’t'} counted yet.` : ''}</p>
      <div className="form-grid">
        {r.people.map((p) => (
          <label key={p.id} className="field">{p.name}
            <input type="number" step="0.01" value={amounts[p.id] ?? ''} placeholder="0" onChange={(e) => setAmounts({ ...amounts, [p.id]: e.target.value })} />
            <span className="hint">{paidAny ? `still owed ${money(p.owed)}` : `calculated ${money(p.total)}`}</span>
          </label>
        ))}
        <label className="field">Paid on<input type="date" value={date_} onChange={(e) => setDate(e.target.value)} required /></label>
      </div>
    </Modal>
  );
}

/**
 * Monthly review of points. During the month each event's points are an estimate (its time points + its own
 * profit's points). Once the month is over — automatically on the 1st, or with the button — each event's
 * profit points are scaled to what the month really made, and frozen.
 */
function PointsReview({ month, onChanged }) {
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

export default function Payouts() {
  const c = useChartColors();
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const { data: r, loading, reload } = useApi(`/payouts?month=${month}`);
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
                  {r.pools.freeTasks !== 0 && <span className="muted">{money0(r.pools.freeTasks)} of it to sport funds ({number(r.freePoints)} pts done for free)</span>}
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
                            <div className="row-sub show-sm">{money0(p.standard)} founder · {money0(p.pointsAmount)} organiser ({number(p.points)}p)</div>
                          </td>
                          <td className="r hide-sm">{money(p.standard)}</td>
                          <td className="r hide-sm">
                            {number(p.points)}
                            {r.totalPoints > 0 && <span className="muted"> · {Math.round((p.points / r.totalPoints) * 100)}%</span>}
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
      </div>

      {paying && <PayForm month={month} r={r} onClose={() => setPaying(false)} onSaved={() => { setPaying(false); reload(); }} />}
      {form && <ContributionForm month={month} item={form.item} onClose={() => setForm(null)} onSaved={() => { setForm(null); reload(); }} />}
    </div>
  );
}
