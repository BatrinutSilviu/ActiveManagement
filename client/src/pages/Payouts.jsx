import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useApi, useChartColors } from '../hooks.js';
import { date, money, money0, number, signedMoney } from '../format.js';
import Modal, { confirmDelete } from '../components/Modal.jsx';
import { IconEdit, IconPlus, IconTrash } from '../components/Icons.jsx';
import { monthName, pctLabel } from './Dashboard.jsx';

const shiftMonth = (ym, d) => {
  const [y, m] = ym.split('-').map(Number);
  const t = new Date(y, m - 1 + d, 1);
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}`;
};
const r2 = (v) => Math.round(v * 100) / 100;

export function pointsLabel(a, role = 'organizer') {
  const [lo, hi] = role === 'organizer' ? [a.organizer_points, a.organizer_max] : [a.co_points, a.co_max];
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
      <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
        <button className="btn btn-primary" disabled={!dirty} onClick={save}>Save for {monthName(month)}</button>
        {split.custom && <button className="btn" onClick={reset}>Use default</button>}
      </div>
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
        Organisers of events get their points on the event page.</p>
      <div className="form-grid">
        <label className="field">Person
          <select value={f.person_id} onChange={set('person_id')} required>
            <option value="">Choose…</option>
            {people?.filter((p) => p.active).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        <label className="field">Date<input type="date" value={f.date} onChange={set('date')} required /></label>
        <label className="field full">Activity
          <select value={f.activity_id || ''} onChange={pickActivity}>
            <option value="">— other —</option>
            {activities?.map((a) => <option key={a.id} value={a.id}>{a.name} · {pointsLabel(a)} pts</option>)}
          </select>
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

export default function Payouts() {
  const c = useChartColors();
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const { data: r, loading, reload } = useApi(`/payouts?month=${month}`);
  const [form, setForm] = useState(null);
  if (!r) return null;

  const s = r.split;
  const communityPct = 100 - s.foundersStandard - s.foundersPoints;
  const parts = [
    { key: 'community', label: `Community ${pctLabel(communityPct)}`, value: r.pools.community, color: c.sportfund },
    { key: 'standard', label: `Founders ${pctLabel(s.foundersStandard)}`, value: r.pools.standard, color: c.founders },
    { key: 'points', label: `Organisers ${pctLabel(s.foundersPoints)}`, value: r.pools.points, color: c.general },
  ];
  const payable = r.people.reduce((a, p) => a + p.total, 0);
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
                </div>
              </div>
            </div>

            <div className="card">
              <div className="card-pad card-head" style={{ marginBottom: 0 }}>
                <div><h2>To pay · {monthName(month)}</h2><p>Founders’ equal share + organisers’ share by points</p></div>
                <strong>{money(payable)}</strong>
              </div>
              <div className="table-wrap">
                {r.people.length ? (
                  <table>
                    <thead><tr><th>Person</th><th className="r">Founder share</th><th className="r">Points</th><th className="r">Organiser share</th><th className="r">Total</th></tr></thead>
                    <tbody>
                      {r.people.map((p) => (
                        <tr key={p.id}>
                          <td><strong>{p.name}</strong>{p.founder && <span className="badge" style={{ marginLeft: 6 }}>Founder</span>}</td>
                          <td className="r">{money(p.standard)}</td>
                          <td className="r">
                            {number(p.points)}
                            {r.totalPoints > 0 && <span className="muted"> · {Math.round((p.points / r.totalPoints) * 100)}%</span>}
                          </td>
                          <td className="r">{money(p.pointsAmount)}</td>
                          <td className="r"><strong>{money(p.total)}</strong></td>
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

        <div className="card">
          <div className="card-pad card-head" style={{ marginBottom: 0 }}>
            <div><h2>Points earned · {monthName(month)}</h2>
              <p>From finalized events’ organisers and contributions outside events{r.pendingPoints ? ` · ${number(r.pendingPoints)} more points on live events` : ''}</p></div>
            <button className="btn btn-sm" onClick={() => setForm({})}><IconPlus width="14" />Add points</button>
          </div>
          <div className="table-wrap">
            {r.ledger.length ? (
              <table>
                <thead><tr><th>Date</th><th>Person</th><th>For</th><th>Activity</th><th>Role</th><th className="r">Points</th><th /></tr></thead>
                <tbody>
                  {r.ledger.map((l) => (
                    <tr key={`${l.source}-${l.id}`}>
                      <td>{date(l.date)}</td>
                      <td>{l.person_name}</td>
                      <td className="cell-wrap">{l.event_id ? <Link to={`/events/${l.event_id}`}>{l.title}</Link> : l.title}</td>
                      <td className="secondary">{l.activity_name || '—'}</td>
                      <td className="secondary">{l.role === 'organizer' ? 'Organiser' : l.role === 'co-organizer' ? 'Co-organiser' : 'Contribution'}</td>
                      <td className="r"><strong>{number(l.points)}</strong></td>
                      <td className="r">
                        {l.source === 'contribution' && (
                          <>
                            <button className="icon-btn" aria-label="Edit" onClick={() => setForm({ item: l })}><IconEdit /></button>
                            <button className="icon-btn" aria-label="Delete" onClick={() => delContribution(l)}><IconTrash /></button>
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <div className="empty">No points yet this month. Add organisers on events, or add points for other work.</div>}
          </div>
        </div>
      </div>

      {form && <ContributionForm month={month} item={form.item} onClose={() => setForm(null)} onSaved={() => { setForm(null); reload(); }} />}
    </div>
  );
}
