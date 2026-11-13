import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api.js';
import { usePermissions } from '../../hooks.js';
import { monthName } from '../../format.js';
import { r2 } from '../../util.js';

/** Targets for the month: community / founders / organisers, must add up to 100%. */
export function Targets({ month, split, onSaved }) {
  const toForm = (s) => ({
    community: r2(100 - s.foundersStandard - s.foundersPoints), founders: s.foundersStandard, organisers: s.foundersPoints,
    generalShare: r2(s.generalShare),
  });
  const [f, setF] = useState(() => toForm(split));
  const [error, setError] = useState(null);
  const { canEdit } = usePermissions();
  useEffect(() => setF(toForm(split)), [split]);
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
