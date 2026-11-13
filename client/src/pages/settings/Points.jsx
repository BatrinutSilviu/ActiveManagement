// Settings: how points are made (rates and weights), shared between tasks, and the points table.
import { useState } from 'react';
import { api } from '../../api.js';
import { useAction, useApi } from '../../hooks.js';
import { confirmDelete } from '../../components/Modal.jsx';
import { IconEdit, IconTrash } from '../../components/Icons.jsx';
import { TASK_LABELS, TASKS } from '../../points.js';
import Select from '../../components/Select.jsx';
import { rename } from './rename.js';

/** How an event's points are made (four weighted parts), and points for buying stock. */
export function PointsRates() {
  const { data, reload } = useApi('/settings/points-rates');
  const [f, setF] = useState(null);
  const [msg, setMsg] = useState(null);
  if (!data) return null;
  const v = f || data;
  const input = (k, step = 0.5, style = { width: 72 }) => (
    <input className="select-sm num-input" type="number" min="0" step={step} value={v[k]} onChange={(e) => setF({ ...v, [k]: e.target.value })} style={style} />
  );
  const save = async (e) => {
    e.preventDefault();
    try { await api.put('/settings/points-rates', v); setMsg({ ok: true, text: 'Saved. Every event’s points use the new rates, past months included (except points set by hand).' }); setF(null); reload(); }
    catch (err) { setMsg({ ok: false, text: err.message }); }
  };
  return (
    <div className="card card-pad">
      <div className="card-head"><div><h2>Event points</h2><p>An event’s points = (time × weight) + (participants × weight) + (profit × weight) + (impact × weight), times its sport’s multiplier; they’re then shared between its tasks. Profit points are an estimate until the 1st of the next month, when they’re scaled to what the whole month made. Buying stock earns points too.</p></div></div>
      {msg && <div className={msg.ok ? 'pos' : 'error-box'} style={{ marginBottom: 10 }}>{msg.text}</div>}
      <form onSubmit={save} className="stack" style={{ gap: 10 }}>
        <div className="form-section">Weights <span className="hint">— 1 = as is, 2 = counts double, 0 = ignored</span></div>
        <div className="weights">
          {[['wTime', 'Time'], ['wPeople', 'Participants'], ['wProfit', 'Profit'], ['wImpact', 'Impact']].map(([k, label]) => (
            <label key={k} className="field">{label}{input(k, 0.1, null)}</label>
          ))}
        </div>
        <div className="form-section" style={{ marginTop: 6 }}>Rates</div>
        <div className="rate-line">Time: the kind of event’s points (points table below)</div>
        <div className="rate-line">{input('peoplePoints')} points per {input('peopleStep', 1)} participants — in full when the event made at least {input('peopleProfit', 1)} RON profit per person, less below that, none without profit</div>
        <div className="rate-line">{input('moneyPoints')} points per {input('moneyStep', 10)} RON of profit</div>
        <div className="rate-line">Impact, usual points: collaboration {input('collabPoints')} · special guest {input('guestPoints')} · special event {input('specialPoints')}</div>
        <div className="form-section" style={{ marginTop: 6 }}>Stock purchases <span className="hint">— points for whoever bought it</span></div>
        <div className="rate-line">{input('itemsPoints')} points per {input('itemsStep', 10)} RON of usual items / prizes</div>
        <div className="rate-line">{input('merchPoints')} points per {input('merchStep', 10)} RON of partnership merchandise</div>
        <div><button className="btn" disabled={!f}>Save rates</button></div>
      </form>
    </div>
  );
}

/** How an event's points are shared between its tasks. */
export function TaskShares() {
  const { data, reload } = useApi('/settings/task-shares');
  const [f, setF] = useState(null);
  const [msg, setMsg] = useState(null);
  if (!data) return null;
  const v = f || data;
  const total = Math.round(TASKS.reduce((a, t) => a + Number(v[t] || 0), 0) * 100) / 100;
  const save = async (e) => {
    e.preventDefault();
    try { await api.put('/settings/task-shares', v); setMsg({ ok: true, text: 'Saved. Every event’s task points use the new shares.' }); setF(null); reload(); }
    catch (err) { setMsg({ ok: false, text: err.message }); }
  };
  return (
    <div className="card card-pad">
      <div className="card-head"><div><h2>Event tasks</h2><p>Each task’s share of an event’s points. People on the same task share its points; a task done for free, or with nobody on it, gives its points’ money to the event’s fund.</p></div></div>
      {msg && <div className={msg.ok ? 'pos' : 'error-box'} style={{ marginBottom: 10 }}>{msg.text}</div>}
      <form onSubmit={save} className="stack" style={{ gap: 14 }}>
        <div className="targets">
          {TASKS.map((t) => (
            <label key={t} className="field">{TASK_LABELS[t]}
              <div className="pct-input"><input type="number" min="0" max="100" step="any" value={v[t]} onChange={(e) => setF({ ...v, [t]: e.target.value })} /><span>%</span></div>
            </label>
          ))}
        </div>
        <div className={`targets-total ${total === 100 ? '' : 'neg'}`}>Total {total}%{total !== 100 && ' — must be 100%'}</div>
        <div><button className="btn" disabled={!f || total !== 100}>Save shares</button></div>
      </form>
    </div>
  );
}

export function Activities() {
  const { data, reload } = useApi('/activities');
  const { data: sports } = useApi('/event-types');
  const [error, run] = useAction(reload);
  const blank = { name: '', organizer_points: '', organizer_max: '', sport_id: '' };
  const [f, setF] = useState(blank);
  const field = (a, k, props = {}) => (
    <input className="select-sm num-input" type="number" min="0" step="0.5" defaultValue={a[k] ?? ''} {...props}
      onBlur={(e) => String(e.target.value) !== String(a[k] ?? '') && run(() => api.put(`/activities/${a.id}`, { ...a, [k]: e.target.value }))} />
  );
  const sportSelect = (a, style) => (
    <Select className="select-sm" value={a.sport_id || ''} style={style} aria-label={`${a.name}: usual for which sport`}
      onChange={(e) => run(() => api.put(`/activities/${a.id}`, { ...a, sport_id: e.target.value }))}>
      <option value="">Usual for no sport</option>
      {sports?.map((sp) => <option key={sp.id} value={sp.id}>{sp.name}</option>)}
    </Select>
  );
  return (
    <div className="card">
      <div className="card-pad card-head" style={{ marginBottom: 0 }}>
        <div><h2>Points table</h2><p>What each kind of event is worth for the time it takes — changing it updates every event, past months included, and points for work outside events (a partnership, a promo stand…) added on the Payouts page. The sport sets the usual kind for its new events.</p></div>
      </div>
      {error && <div className="error-box" style={{ margin: '0 22px 12px' }}>{error}</div>}
      <div className="table-wrap">
        <table>
          <thead><tr><th style={{ width: '100%' }}>Activity</th><th className="r">Points</th><th className="r">Max</th><th className="hide-sm">Usual for sport</th><th className="r hide-sm">Used</th><th className="hide-sm" /></tr></thead>
          <tbody>
            {data?.map((a) => (
              <tr key={`${a.id}-${a.organizer_points}-${a.co_points}-${a.organizer_max}-${a.co_max}-${a.people_step}-${a.people_points}-${a.money_step}-${a.money_points}`}>
                <td className="cell-wrap">
                  {a.name}
                  <div className="show-sm" style={{ marginTop: 6 }}>{sportSelect(a, { width: '100%' })}</div>
                  <div className="row-actions show-sm">
                    <button className="link-btn" onClick={() => { const n = rename(a.name); if (n) run(() => api.put(`/activities/${a.id}`, { ...a, name: n })); }}>Rename</button>
                    <button className="link-btn" style={{ color: 'var(--bad-text)' }} onClick={() => confirmDelete(a.name) && run(() => api.del(`/activities/${a.id}`))}>Delete</button>
                  </div>
                </td>
                <td className="r">{field(a, 'organizer_points')}</td>
                <td className="r">{field(a, 'organizer_max', { placeholder: '—' })}</td>
                <td className="hide-sm">{sportSelect(a, { width: 150 })}</td>
                <td className="r muted hide-sm">{a.uses}</td>
                <td className="r actions hide-sm">
                  <button className="icon-btn" aria-label="Rename" onClick={() => { const n = rename(a.name); if (n) run(() => api.put(`/activities/${a.id}`, { ...a, name: n })); }}><IconEdit /></button>
                  <button className="icon-btn" aria-label="Delete" onClick={() => confirmDelete(a.name) && run(() => api.del(`/activities/${a.id}`))}><IconTrash /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <form className="inline-form" onSubmit={async (e) => { e.preventDefault(); if (await run(() => api.post('/activities', f))) setF(blank); }}>
        <input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="New activity" required style={{ flex: '2 1 200px' }} className="select-sm" />
        <input className="select-sm num-input" type="number" min="0" step="0.5" placeholder="Points" value={f.organizer_points} onChange={(e) => setF({ ...f, organizer_points: e.target.value })} required style={{ width: 96 }} />
        <button className="btn btn-sm">Add</button>
      </form>
    </div>
  );
}
