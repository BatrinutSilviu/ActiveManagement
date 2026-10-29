import { useNavigate } from 'react-router-dom';
import { qs } from '../api.js';
import { useApi, useChartColors, usePersistentState } from '../hooks.js';
import { date, money0, MONTHS, MONTHS_LONG, signedMoney } from '../format.js';
import { GroupedBars } from '../components/Charts.jsx';
import { IconDownload } from '../components/Icons.jsx';
import { pctLabel } from './Dashboard.jsx';

export default function Monthly() {
  const navigate = useNavigate();
  const c = useChartColors();
  const now = new Date();
  const [year, setYear] = usePersistentState('am-month-year', String(now.getFullYear()));
  const [month, setMonth] = usePersistentState('am-month-month', now.getMonth() + 1);
  const { data: years } = useApi('/stats/years');
  const { data: y, loading } = useApi(`/monthly${qs({ year })}`);
  const { data: split } = useApi('/settings/split');

  if (!y || !split) return null;
  const m = y.months[month - 1];
  const community = 100 - split.foundersStandard - split.foundersPoints;
  const generalPct = pctLabel((community * split.generalShare) / 100);
  const sportPct = pctLabel((community * (100 - split.generalShare)) / 100);
  const chart1 = y.months.map((x) => ({ ...x, label: MONTHS[x.month - 1] }));
  const chart2 = y.sports.map((s) => ({ name: s.name, id: s.id, ...m.bySport[s.id] }))
    .filter((s) => s.allocated || s.reinvested || s.events);
  const monthEvents = y.events.filter((e) => Number(e.date.slice(5, 7)) === month);
  const sum = (k) => y.months.reduce((a, x) => a + x[k], 0);

  return (
    <div className={loading ? 'loading' : ''}>
      <div className="page-head">
        <div>
          <h1>Monthly statistics</h1>
          <p>Finalized events, split with each month’s targets (default {pctLabel(split.foundersStandard)} founders · {pctLabel(split.foundersPoints)} organisers ·
            {' '}{generalPct} general fund · {sportPct} sport funds).</p>
        </div>
        <a className="btn" href={`/api/export/transactions.csv${qs({ year })}`}><IconDownload width="15" />Export CSV</a>
      </div>

      <div className="filters">
        <select value={year} onChange={(e) => setYear(e.target.value)} aria-label="Year">
          {years?.map((v) => <option key={v}>{v}</option>)}
        </select>
        <div className="month-pills" role="tablist" aria-label="Month">
          {MONTHS.map((label, i) => (
            <button key={label} role="tab" aria-selected={month === i + 1} className={month === i + 1 ? 'on' : ''}
              onClick={() => setMonth(i + 1)}>{label}</button>
          ))}
        </div>
      </div>

      <div className="stack">
        <div className="grid grid-kpi">
          <div className="card kpi"><div className="kpi-label"><i className="kpi-key" style={{ background: c.income }} />Total income · {MONTHS_LONG[month - 1]}</div>
            <div className="kpi-value">{money0(m.income)}</div><div className="kpi-sub">{m.events} events · profit {signedMoney(m.profit)}</div></div>
          <div className="card kpi"><div className="kpi-label"><i className="kpi-key" style={{ background: c.founders }} />Founders & organisers</div>
            <div className="kpi-value">{money0(m.founders)}</div><div className="kpi-sub">{money0(m.standard)} founders · {money0(m.points)} organisers</div></div>
          <div className="card kpi"><div className="kpi-label"><i className="kpi-key" style={{ background: c.sportfund }} />Sport funds {sportPct}</div>
            <div className="kpi-value">{money0(m.sport)}</div><div className="kpi-sub">{money0(m.reinvestedSport)} reinvested this month</div></div>
          <div className="card kpi"><div className="kpi-label"><i className="kpi-key" style={{ background: c.general }} />General fund {generalPct}</div>
            <div className="kpi-value">{money0(m.general)}</div><div className="kpi-sub">{money0(m.reinvestedGeneral)} spent this month</div></div>
        </div>

        <div className="card card-pad">
          <div className="card-head">
            <div><h2>Income and its split · {year}</h2><p>Total income per month, and how the profit was divided</p></div>
          </div>
          <GroupedBars data={chart1} xKey="label" height={300} allTicks series={[
            { key: 'income', name: 'Total income', color: c.income },
            { key: 'founders', name: 'Founders & organisers', color: c.founders },
            { key: 'sport', name: `Sport funds ${sportPct}`, color: c.sportfund },
            { key: 'general', name: `General fund ${generalPct}`, color: c.general },
          ]} extraRows={(d) => [{ name: 'Profit', value: signedMoney(d.profit) }]} />
        </div>

        <div className="card card-pad">
          <div className="card-head">
            <div><h2>Sport funds · {MONTHS_LONG[month - 1]} {year}</h2><p>Added to each sport’s fund vs. reinvested from it this month</p></div>
          </div>
          {chart2.length ? (
            <GroupedBars data={chart2} xKey="name" height={260} allTicks series={[
              { key: 'allocated', name: 'Added to fund', color: c.sportfund },
              { key: 'reinvested', name: 'Reinvested', color: c.reinvested },
            ]} extraRows={(d) => [{ name: 'Events', value: d.events }]} />
          ) : <div className="empty">No sport activity in {MONTHS_LONG[month - 1]}</div>}
        </div>

        <div className="card">
          <div className="card-pad card-head" style={{ marginBottom: 0 }}><h2>Events in {MONTHS_LONG[month - 1]}</h2></div>
          <div className="table-wrap">
            {monthEvents.length ? (
              <table>
                <thead><tr><th className="hide-sm">Date</th><th>Event</th><th className="hide-sm">Status</th><th className="r hide-sm">Fees</th><th className="r hide-sm">Organizing</th><th className="r hide-sm">Benefits</th>
                  <th className="r">Profit</th><th className="r">Founders</th><th className="r hide-sm">General</th><th className="r hide-sm">Sport fund</th></tr></thead>
                <tbody>
                  {monthEvents.map((e) => (
                    <tr key={e.id} className="clickable" onClick={() => navigate(`/events/${e.id}`)}>
                      <td className="hide-sm">{date(e.date)}</td>
                      <td className="cell-wrap">
                        <div className="row-title">{e.name}</div>
                        <div className="row-sub"><span className="show-sm">{date(e.date)} · </span>{e.type_name}{e.status !== 'completed' && <span className="show-sm"> · Live</span>}</div>
                      </td>
                      <td className="hide-sm">{e.status === 'completed' ? 'Finalized' : <span className="badge status-planned"><span className="dot" />Live</span>}</td>
                      <td className="r hide-sm">{money0(e.fee_income)}</td>
                      <td className="r hide-sm">{money0(e.organizing)}</td>
                      <td className="r hide-sm">{money0(e.benefits)}</td>
                      <td className={`r ${e.profit >= 0 ? 'pos' : 'neg'}`}>{signedMoney(e.profit)}</td>
                      <td className="r">{money0(e.split.founders)}</td>
                      <td className="r hide-sm">{money0(e.split.general)}</td>
                      <td className="r hide-sm">{money0(e.split.sport)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <div className="empty">No events this month</div>}
          </div>
        </div>

        <div className="card">
          <div className="card-pad card-head" style={{ marginBottom: 0 }}><h2>Monthly statement · {year}</h2></div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Month</th><th className="r hide-sm">Events</th><th className="r">Income</th><th className="r hide-sm">Costs</th><th className="r">Profit</th>
                <th className="r hide-sm">Founders & org.</th><th className="r hide-sm">Sport funds</th><th className="r hide-sm">General fund</th><th className="r hide-sm">Reinvested</th></tr></thead>
              <tbody>
                {y.months.map((x) => (
                  <tr key={x.month} className={`clickable ${x.month === month ? 'row-selected' : ''}`} onClick={() => setMonth(x.month)}>
                    <td>{MONTHS_LONG[x.month - 1]}{x.live ? <span className="muted"> · {x.live} live</span> : ''}</td>
                    <td className="r hide-sm">{x.events}</td>
                    <td className="r">{money0(x.income)}</td>
                    <td className="r hide-sm">{money0(x.expenses)}</td>
                    <td className={`r ${x.profit > 0 ? 'pos' : x.profit < 0 ? 'neg' : ''}`}>{signedMoney(x.profit)}</td>
                    <td className="r hide-sm">{money0(x.founders)}</td>
                    <td className="r hide-sm">{money0(x.sport)}</td>
                    <td className="r hide-sm">{money0(x.general)}</td>
                    <td className="r hide-sm">{money0(x.reinvestedSport + x.reinvestedGeneral)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td>Total</td><td className="r hide-sm">{sum('events')}</td><td className="r">{money0(sum('income'))}</td><td className="r hide-sm">{money0(sum('expenses'))}</td>
                  <td className="r">{signedMoney(sum('profit'))}</td><td className="r hide-sm">{money0(sum('founders'))}</td><td className="r hide-sm">{money0(sum('sport'))}</td>
                  <td className="r hide-sm">{money0(sum('general'))}</td><td className="r hide-sm">{money0(sum('reinvestedSport') + sum('reinvestedGeneral'))}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
