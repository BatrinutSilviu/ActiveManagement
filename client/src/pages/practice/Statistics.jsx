// Hours worked in a period: by the patients' legal entity, by service, and the two together.
import { useState } from 'react';
import { qs } from '../../api.js';
import { useApi, usePersistentState } from '../../hooks.js';
import { useBusiness } from '../../business.js';
import Kpi from '../../components/Kpi.jsx';
import { dateLocale, t, tn } from '../../i18n/index.js';
import { addDays, iso, localToday } from './common.jsx';

/** 750 -> "12 h 30 min" */
export const hours = (min) => {
  const h = Math.floor(min / 60), m = Math.round(min % 60);
  return h && m ? `${h} h ${m} min` : h ? `${h} h` : `${m} min`;
};
const monthStart = (d) => `${d.slice(0, 7)}-01`;
const monthEnd = (d) => { const x = new Date(`${monthStart(d)}T12:00:00`); x.setMonth(x.getMonth() + 1); return addDays(iso(x), -1); };
function preset(k) {
  const today = localToday();
  if (k === 'month') return [monthStart(today), monthEnd(today)];
  if (k === 'last') { const d = addDays(monthStart(today), -1); return [monthStart(d), monthEnd(d)]; }
  return [`${today.slice(0, 4)}-01-01`, `${today.slice(0, 4)}-12-31`];
}
const PRESETS = [['month', 'This month'], ['last', 'Last month'], ['year', 'This year']];

/** Totals of the cells grouped by `key` (entity or service), biggest first. */
function group(cells, key) {
  const m = new Map();
  for (const c of cells) {
    const g = m.get(c[key] ?? '') ?? m.set(c[key] ?? '', { name: c[key], sessions: 0, minutes: 0, no_time: 0 }).get(c[key] ?? '');
    g.sessions += c.sessions; g.minutes += c.minutes; g.no_time += c.no_time;
  }
  return [...m.values()].sort((a, b) => b.minutes - a.minutes || b.sessions - a.sessions);
}

export default function Statistics() {
  const { term, Term } = useBusiness();
  const [period, setPeriod] = usePersistentState('am-stats-period', 'month');
  const [custom, setCustom] = useState(() => preset('month'));
  const [scheduled, setScheduled] = usePersistentState('am-stats-scheduled', false);
  const [from, to] = period === 'custom' ? custom : preset(period);
  const { data, loading } = useApi(`/practice/stats${qs({ from, to, scheduled: scheduled ? 1 : '' })}`);
  const cells = data?.cells || [];
  const entities = group(cells, 'entity'), services = group(cells, 'service');
  const total = group(cells, 'none')[0] || { sessions: 0, minutes: 0, no_time: 0 };
  const setDate = (i) => (e) => { if (!e.target.value) return; const c = [from, to]; c[i] = e.target.value; setCustom(c); setPeriod('custom'); };
  const noEntity = t('No legal entity'), noService = t(`No ${term('sport')}`);

  return (
    <div className={loading ? 'loading' : ''}>
      <div className="page-head">
        <div><h1>{t('Statistics')}</h1><p>{t(`Hours worked, by legal entity and by ${term('sport')}. A ${term('event')}’s time runs from its start to its end, else its ${term('sport')}’s duration.`)}</p></div>
      </div>
      <div className="filters">
        <div className="segmented">
          {PRESETS.map(([k, label]) => <button key={k} className={period === k ? 'on' : ''} onClick={() => setPeriod(k)}>{t(label)}</button>)}
        </div>
        <input type="date" value={from} onChange={setDate(0)} aria-label={t('From')} style={{ width: 'auto' }} />
        <span className="muted">–</span>
        <input type="date" value={to} onChange={setDate(1)} aria-label={t('To')} style={{ width: 'auto' }} />
        <label className="check"><input type="checkbox" checked={scheduled} onChange={(e) => setScheduled(e.target.checked)} />{t('Include scheduled')}</label>
      </div>
      <div className="grid grid-kpi" style={{ marginBottom: 16 }}>
        <Kpi label={t(scheduled ? 'Hours (done and scheduled)' : 'Hours worked')} value={hours(total.minutes)} hero
          sub={new Date(`${from}T12:00:00`).toLocaleDateString(dateLocale(), { day: 'numeric', month: 'short' }) + ' – ' + new Date(`${to}T12:00:00`).toLocaleDateString(dateLocale(), { day: 'numeric', month: 'short', year: 'numeric' })} />
        <Kpi label={t(Term('events'))} value={total.sessions} />
        {total.no_time > 0 && <Kpi label={t('Without a duration')} value={total.no_time} sub={t(`not counted in the hours: give them an end time, or the ${term('sport')} a duration`)} />}
      </div>
      {!cells.length ? <div className="card empty">{t(`No ${term('events')} done in this period.`)}</div> : <>
        <div className="grid grid-2" style={{ marginBottom: 16 }}>
          <Breakdown title={t('By legal entity')} rows={entities} empty={noEntity} total={total.minutes} />
          <Breakdown title={t(`By ${term('sport')}`)} rows={services} empty={noService} total={total.minutes} />
        </div>
        <div className="card">
          <div className="card-pad" style={{ paddingBottom: 0 }}><div className="card-head"><div><h2>{t(`Legal entity × ${term('sport')}`)}</h2>
            <p>{t(`Hours, and the number of ${term('events')} under them`)}</p></div></div></div>
          <div className="table-wrap">
            <table className="stats-matrix">
              <thead><tr><th />{services.map((s) => <th key={s.name ?? ''} className="r">{s.name ?? noService}</th>)}<th className="r">{t('Total')}</th></tr></thead>
              <tbody>
                {entities.map((e) => (
                  <tr key={e.name ?? ''}>
                    <th>{e.name ?? <span className="muted">{noEntity}</span>}</th>
                    {services.map((s) => {
                      const c = cells.find((x) => (x.entity ?? '') === (e.name ?? '') && (x.service ?? '') === (s.name ?? ''));
                      return <td key={s.name ?? ''} className="r">{c ? <><strong>{hours(c.minutes)}</strong><div className="row-sub">{c.sessions}</div></> : <span className="muted">—</span>}</td>;
                    })}
                    <td className="r"><strong>{hours(e.minutes)}</strong><div className="row-sub">{e.sessions}</div></td>
                  </tr>
                ))}
              </tbody>
              <tfoot><tr><th>{t('Total')}</th>{services.map((s) => <td key={s.name ?? ''} className="r"><strong>{hours(s.minutes)}</strong><div className="row-sub">{s.sessions}</div></td>)}
                <td className="r"><strong>{hours(total.minutes)}</strong><div className="row-sub">{total.sessions}</div></td></tr></tfoot>
            </table>
          </div>
        </div>
      </>}
    </div>
  );
}

function Breakdown({ title, rows, empty, total }) {
  const { term } = useBusiness();
  return (
    <section className="card card-pad">
      <div className="card-head"><h2>{title}</h2></div>
      <div className="stack" style={{ gap: 12 }}>
        {rows.map((r) => (
          <div key={r.name ?? ''} className="stat-row">
            <div className="stat-top">
              <span>{r.name ?? <span className="muted">{empty}</span>}</span>
              <strong>{hours(r.minutes)}</strong>
            </div>
            <div className="stat-bar"><i style={{ width: `${total ? (r.minutes / total) * 100 : 0}%` }} /></div>
            <div className="row-sub">{tn(r.sessions, `{n} ${term('event')}`, `{n} ${term('events')}`)}
              {total > 0 && ` · ${Math.round((r.minutes / total) * 100)}%`}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
