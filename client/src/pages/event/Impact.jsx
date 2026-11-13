import { useState } from 'react';
import { api } from '../../api.js';
import { useAction, useApi, usePermissions } from '../../hooks.js';
import { number } from '../../format.js';
import CardError from '../../components/CardError.jsx';
import { IconEdit, IconPlus, IconTrash } from '../../components/Icons.jsx';
import Select from '../../components/Select.jsx';

const HIGHLIGHT_LABELS = { collab: 'Collaboration', guest: 'Special guest', special: 'Special event' };

/** What made the event special: each line adds impact points to the event (times the impact weight). */
export default function Impact({ e, reload }) {
  const { data: rates } = useApi('/settings/points-rates');
  const { data: partners } = useApi('/partners');
  const { canEdit } = usePermissions();
  const blank = { kind: 'collab', title: '', partner_id: '', points: '' };
  const [f, setF] = useState(null);
  const [error, run] = useAction(reload);
  const list = e.highlights || [];
  if (!list.length && !canEdit) return null;
  const set = (k) => (ev) => setF({ ...f, [k]: ev.target.value });
  const save = async (ev) => {
    ev.preventDefault();
    if (await run(() => (f.id ? api.put(`/event-highlights/${f.id}`, f) : api.post(`/events/${e.id}/highlights`, f)))) setF(null);
  };
  const total = list.reduce((a, h) => a + h.points, 0);
  const defaultPts = rates ? rates[`${f?.kind}Points`] : '';
  return (
    <div className="card">
      <div className="card-pad card-head" style={{ marginBottom: 0 }}>
        <div><h2>Impact</h2><p>What made this event special — a collaboration, a special guest, a special edition. Each adds impact points to the event{rates && rates.wImpact !== 1 ? ` (× ${number(rates.wImpact)} weight)` : ''}.</p></div>
        {canEdit && !f && <button className="btn btn-sm" onClick={() => setF(blank)}><IconPlus width="14" />Add</button>}
      </div>
      <CardError error={error} />
      {list.length > 0 && (
        <div className="table-wrap">
          <table>
            <thead><tr><th>What</th><th>Who / what</th><th className="r">Points</th>{canEdit && <th />}</tr></thead>
            <tbody>
              {list.map((h) => (
                <tr key={h.id}>
                  <td>{HIGHLIGHT_LABELS[h.kind]}</td>
                  <td className="cell-wrap">{h.title}{h.partner_name && h.partner_name !== h.title ? <div className="row-sub">with {h.partner_name}</div> : null}</td>
                  <td className="r">{number(h.points)}</td>
                  {canEdit && <td className="r" style={{ whiteSpace: 'nowrap' }}>
                    <button className="icon-btn" aria-label="Edit" onClick={() => setF({ ...h, partner_id: h.partner_id ?? '' })}><IconEdit width="14" /></button>
                    <button className="icon-btn" aria-label="Delete" onClick={() => window.confirm(`Remove “${h.title}”? The event loses its ${number(h.points)} impact points.`) && run(() => api.del(`/event-highlights/${h.id}`))}><IconTrash width="14" /></button>
                  </td>}
                </tr>
              ))}
            </tbody>
            {list.length > 1 && <tfoot><tr><td colSpan={2}>Total</td><td className="r">{number(total)}</td>{canEdit && <td />}</tr></tfoot>}
          </table>
        </div>
      )}
      {!list.length && !f && <p className="hint" style={{ padding: '0 22px 16px', margin: 0 }}>Nothing special recorded.</p>}
      {f && (
        <form onSubmit={save} className="card-pad form-grid" style={{ paddingTop: 0 }}>
          <label className="field">What was special
            <Select value={f.kind} onChange={set('kind')}>
              {Object.entries(HIGHLIGHT_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </Select>
          </label>
          {f.kind === 'collab' && (
            <label className="field">Partner (optional)
              <Select value={f.partner_id} onChange={set('partner_id')}>
                <option value="">— not a saved partner —</option>
                {(partners || []).filter((p) => p.active || String(p.id) === String(f.partner_id)).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </Select>
            </label>
          )}
          <label className="field">{f.kind === 'guest' ? 'Guest' : f.kind === 'collab' ? 'Collaboration with' : 'What'}
            <input value={f.title} onChange={set('title')} required={!(f.kind === 'collab' && f.partner_id)}
              placeholder={f.kind === 'guest' ? 'e.g. a national champion' : f.kind === 'collab' ? 'the partner’s name if not saved' : 'e.g. first edition, charity event'} />
          </label>
          <label className="field">Points
            <input type="number" min="0" step="0.5" value={f.points} onChange={set('points')} placeholder={String(defaultPts ?? '')} />
          </label>
          <div className="full" style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-primary btn-sm">Save</button>
            <button type="button" className="btn btn-sm" onClick={() => setF(null)}>Cancel</button>
          </div>
        </form>
      )}
    </div>
  );
}
