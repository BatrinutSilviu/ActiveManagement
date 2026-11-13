// Settings: the starting balance and the default profit split.
import { useState } from 'react';
import { api } from '../../api.js';
import { useApi } from '../../hooks.js';
import { money } from '../../format.js';
import { IconPlus } from '../../components/Icons.jsx';
import { r2 } from '../../util.js';

/** What the community had when it started: into the general fund, and optionally sport funds. */
export function StartingBalance() {
  const { data, reload } = useApi('/settings/starting-balance');
  const { data: types } = useApi('/event-types');
  const [f, setF] = useState(null);
  const [msg, setMsg] = useState(null);
  const [showSports, setShowSports] = useState(false);
  if (!data || !types) return null;
  const v = f || data;
  const sports = types.filter((t) => t.is_sport);
  const setSport = (id, val) => setF({ ...v, sports: { ...v.sports, [id]: val } });
  const total = Number(v.general || 0) + Object.values(v.sports).reduce((a, x) => a + (Number(x) || 0), 0);
  const save = async (e) => {
    e.preventDefault();
    try { await api.put('/settings/starting-balance', v); setMsg({ ok: true, text: 'Saved. The funds and money in hand include it.' }); setF(null); reload(); }
    catch (err) { setMsg({ ok: false, text: err.message }); }
  };
  const anySport = Object.values(v.sports).some((x) => Number(x));
  return (
    <div className="card card-pad">
      <div className="card-head"><div><h2>Starting balance</h2><p>What the community had when it started. It’s counted in the funds and money in hand, not in any month’s profit or payouts.</p></div></div>
      {msg && <div className={msg.ok ? 'pos' : 'error-box'} style={{ marginBottom: 10 }}>{msg.text}</div>}
      <form onSubmit={save} className="stack" style={{ gap: 14 }}>
        <div className="form-grid">
          <label className="field">Date<input type="date" value={v.date || ''} onChange={(e) => setF({ ...v, date: e.target.value })} /></label>
          <label className="field">General fund (RON)<input type="number" step="0.01" value={v.general || ''} placeholder="0" onChange={(e) => setF({ ...v, general: e.target.value })} /></label>
        </div>
        {showSports || anySport ? (
          <div className="form-grid">
            {sports.map((t) => (
              <label key={t.id} className="field">{t.name} fund (RON)
                <input type="number" step="0.01" value={v.sports[t.id] || ''} placeholder="0" onChange={(e) => setSport(t.id, e.target.value)} />
              </label>
            ))}
          </div>
        ) : (
          <div><button type="button" className="btn btn-sm btn-ghost" onClick={() => setShowSports(true)}><IconPlus width="13" />Some of it belonged to a sport’s fund</button></div>
        )}
        <div className="targets-total">Total {money(total)}</div>
        <div><button className="btn" disabled={!f}>Save starting balance</button></div>
      </form>
    </div>
  );
}

export function ProfitSplit() {
  const { data, reload } = useApi('/settings/split');
  const [f, setF] = useState(null);
  const [msg, setMsg] = useState(null);
  if (!data) return null;
  const v = f || { community: r2(100 - data.foundersStandard - data.foundersPoints), founders: data.foundersStandard,
    organisers: data.foundersPoints, generalShare: r2(data.generalShare) };
  const set = (k) => (e) => setF({ ...v, [k]: e.target.value });
  const total = r2(Number(v.community) + Number(v.founders) + Number(v.organisers));
  const save = async (e) => {
    e.preventDefault();
    if (total !== 100) return setMsg({ ok: false, text: `The targets add up to ${total}% — they must make 100%.` });
    try {
      await api.put('/settings/split', { foundersStandard: v.founders, foundersPoints: v.organisers, generalShare: v.generalShare });
      setMsg({ ok: true, text: 'Saved. Months with their own targets (set on Payouts) keep them.' }); setF(null); reload();
    } catch (err) { setMsg({ ok: false, text: err.message }); }
  };
  return (
    <div className="card card-pad">
      <div className="card-head"><div><h2>Default split</h2><p>Used for every month that has no targets of its own (see Payouts)</p></div></div>
      {msg && <div className={msg.ok ? 'pos' : 'error-box'} style={{ marginBottom: 10 }}>{msg.text}</div>}
      <form onSubmit={save} className="stack" style={{ gap: 14 }}>
        <div className="targets">
          <label className="field">Reinvest in community<div className="pct-input"><input type="number" min="0" max="100" step="0.5" value={v.community} onChange={set('community')} /><span>%</span></div></label>
          <label className="field">Founders (equal)<div className="pct-input"><input type="number" min="0" max="100" step="0.5" value={v.founders} onChange={set('founders')} /><span>%</span></div></label>
          <label className="field">Organisers (by points)<div className="pct-input"><input type="number" min="0" max="100" step="0.5" value={v.organisers} onChange={set('organisers')} /><span>%</span></div></label>
        </div>
        <div className={`targets-total ${total === 100 ? '' : 'neg'}`}>Total {total}%</div>
        <label className="field">Of the community share, to the general fund
          <div className="pct-input"><input type="number" min="0" max="100" step="0.01" value={v.generalShare} onChange={set('generalShare')} /><span>%</span></div>
          <span className="hint">The rest goes to the event’s sport fund. ⅓ = 33.33</span>
        </label>
        <div><button className="btn" disabled={!f}>Save default</button></div>
      </form>
    </div>
  );
}
