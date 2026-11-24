// Settings → Development points (admins): who gets organiser points for developing the apps, worked out every week
// from their commits on GitHub (server: domain/devPoints.js).
import { useState } from 'react';
import { api } from '../../api.js';
import { useApi } from '../../hooks.js';
import { number } from '../../format.js';
import Select from '../../components/Select.jsx';
import { t } from '../../i18n/index.js';

const hours = (min) => number(Math.round((min / 60) * 100) / 100);

export function DevPoints() {
  const { data, reload } = useApi('/settings/dev-points');
  const { data: people } = useApi('/people');
  const [f, setF] = useState(null);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  if (!data) return null;
  const v = f || { ...data.config, emails: data.config.emails.join(', '), repos: data.config.repos.join('\n') };
  const set = (k) => (e) => setF({ ...v, [k]: e.target.value });
  const save = async (e) => {
    e.preventDefault();
    try { await api.put('/settings/dev-points', v); setMsg({ ok: true, text: t('Saved.') }); setF(null); reload(); }
    catch (err) { setMsg({ ok: false, text: err.message }); }
  };
  const runNow = async () => {
    setBusy(true); setMsg(null);
    try {
      const r = await api.post('/settings/dev-points/run');
      setMsg(r.skipped ? { ok: false, text: t(r.skipped) }
        : { ok: !r.errors.length, text: [t('{n} weeks counted.', { n: r.weeks.length }), ...r.errors].join(' ') });
      reload();
    } catch (err) { setMsg({ ok: false, text: err.message }); } finally { setBusy(false); }
  };
  const s = data.status;
  return (
    <div className="card card-pad">
      <div className="card-head"><div><h2>{t('Development points')}</h2>
        <p>{t('Every week, the commits on the apps’ repos become hours of work and points for the person below, as a “Development & programming” contribution. Commits less than the longest gap apart count the time between them; a commit after a longer break starts a session worth the session start. Months already closed aren’t changed.')}</p></div></div>
      {msg && <div className={msg.ok ? 'pos' : 'error-box'} style={{ marginBottom: 10 }}>{msg.text}</div>}
      <form onSubmit={save} className="form-grid">
        <label className="field">{t('Person')}
          <Select value={v.person_id ? String(v.person_id) : ''} onChange={set('person_id')}>
            <option value="">{t('Choose…')}</option>
            {people?.filter((p) => p.active || p.id === v.person_id).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
        </label>
        <label className="field">{t('Their git email(s)')}<input value={v.emails} onChange={set('emails')} placeholder="name@example.com" /></label>
        <label className="field full">{t('Repos')} <span className="hint">— {t('owner/name, one per line')}</span>
          <textarea rows={4} value={v.repos} onChange={set('repos')} /></label>
        <label className="field">{t('Points per hour')}<input type="number" min="0" max="100" step="any" value={v.perHour} onChange={set('perHour')} /></label>
        <label className="field">{t('Count from')}<input type="date" value={v.since} onChange={set('since')} /></label>
        <label className="field">{t('Longest gap (minutes)')}<input type="number" min="10" max="600" value={v.maxGapMin} onChange={set('maxGapMin')} /></label>
        <label className="field">{t('Session start (minutes)')}<input type="number" min="0" max="240" value={v.firstCommitMin} onChange={set('firstCommitMin')} /></label>
        <div className="full" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <button className="btn" disabled={!f}>{t('Save')}</button>
          <button type="button" className="btn" onClick={runNow} disabled={busy || !!f}>{busy ? t('Counting…') : t('Count now')}</button>
          <span className="hint">{[s.at && t('Last counted {when}', { when: new Date(s.at).toLocaleString() }),
            !data.token && t('No GITHUB_TOKEN on the server: private repos are skipped')].filter(Boolean).join(' · ')}</span>
        </div>
        {s.errors?.length > 0 && <div className="full error-box">{s.errors.join(' · ')}</div>}
      </form>
      {data.weeks.length > 0 && (
        <div className="table-wrap" style={{ marginTop: 14 }}>
          <table>
            <thead><tr><th>{t('Week')}</th><th className="r">{t('Commits')}</th><th className="r">{t('Hours')}</th><th className="r">{t('Points')}</th></tr></thead>
            <tbody>{data.weeks.map((w) => (
              <tr key={w.key}><td>{w.key.replace('|', ' · ')}</td><td className="r">{w.commits}</td><td className="r">{hours(w.minutes)}</td><td className="r"><strong>{number(w.points ?? 0)}</strong></td></tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}
