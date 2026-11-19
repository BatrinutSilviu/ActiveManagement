import { useNavigate } from 'react-router-dom';
import { qs } from '../api.js';
import { useApi, useChartColors, usePersistentState } from '../hooks.js';
import { date, money0, MONTHS, MONTHS_LONG, pctLabel, signedMoney } from '../format.js';
import { GroupedBars } from '../components/Charts.jsx';
import { IconDownload } from '../components/Icons.jsx';
import Select from '../components/Select.jsx';
import { t } from '../i18n/index.js';

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
          <h1>{t('Monthly statistics')}</h1>
          <p>{t('Finalized events, split with each month’s targets (default {founders} founders · {organisers} organisers · {general} general fund · {sport} sport funds).', { founders: pctLabel(split.foundersStandard), organisers: pctLabel(split.foundersPoints), general: generalPct, sport: sportPct })}</p>
        </div>
        <a className="btn" href={`/api/export/transactions.csv${qs({ year })}`}><IconDownload width="15" />{t('Export CSV')}</a>
      </div>

      <div className="filters">
        <Select value={year} onChange={(e) => setYear(e.target.value)} aria-label={t('Year')}>
          {years?.map((v) => <option key={v}>{v}</option>)}
        </Select>
        <div className="month-pills" role="tablist" aria-label={t('Month')}>
          {MONTHS.map((label, i) => (
            <button key={label} role="tab" aria-selected={month === i + 1} className={month === i + 1 ? 'on' : ''}
              onClick={() => setMonth(i + 1)}>{label}</button>
          ))}
        </div>
      </div>

      <div className="stack">
        <div className="grid grid-kpi">
          <div className="card kpi"><div className="kpi-label"><i className="kpi-key" style={{ background: c.income }} />{t('Total income')} · {MONTHS_LONG[month - 1]}</div>
            <div className="kpi-value">{money0(m.income)}</div><div className="kpi-sub">{t('{n} events · profit {profit}', { n: m.events, profit: signedMoney(m.profit) })}</div></div>
          <div className="card kpi"><div className="kpi-label"><i className="kpi-key" style={{ background: c.founders }} />{t('Founders & organisers')}</div>
            <div className="kpi-value">{money0(m.founders)}</div><div className="kpi-sub">{t('{founders} founders · {organisers} organisers', { founders: money0(m.standard), organisers: money0(m.points) })}</div></div>
          <div className="card kpi"><div className="kpi-label"><i className="kpi-key" style={{ background: c.sportfund }} />{t('Sport funds')} {sportPct}</div>
            <div className="kpi-value">{money0(m.sport)}</div><div className="kpi-sub">{t('{amount} reinvested this month', { amount: money0(m.reinvestedSport) })}</div></div>
          <div className="card kpi"><div className="kpi-label"><i className="kpi-key" style={{ background: c.general }} />{t('General fund')} {generalPct}</div>
            <div className="kpi-value">{money0(m.general)}</div><div className="kpi-sub">{t('{amount} spent this month', { amount: money0(m.reinvestedGeneral) })}{m.discounts ? ` (${t('incl. {amount} event discounts', { amount: money0(m.discounts) })})` : ''}</div></div>
        </div>

        <div className="card card-pad">
          <div className="card-head">
            <div><h2>{t('Income and its split')} · {year}</h2><p>{t('Total income per month, and how the profit was divided')}</p></div>
          </div>
          <GroupedBars data={chart1} xKey="label" height={300} allTicks series={[
            { key: 'income', name: t('Total income'), color: c.income },
            { key: 'founders', name: t('Founders & organisers'), color: c.founders },
            { key: 'sport', name: `${t('Sport funds')} ${sportPct}`, color: c.sportfund },
            { key: 'general', name: `${t('General fund')} ${generalPct}`, color: c.general },
          ]} extraRows={(d) => [{ name: t('Profit'), value: signedMoney(d.profit) }]} />
        </div>

        <div className="card card-pad">
          <div className="card-head">
            <div><h2>{t('Sport funds')} · {MONTHS_LONG[month - 1]} {year}</h2><p>{t('Added to each sport’s fund vs. reinvested from it this month')}</p></div>
          </div>
          {chart2.length ? (
            <GroupedBars data={chart2} xKey="name" height={260} allTicks series={[
              { key: 'allocated', name: t('Added to fund'), color: c.sportfund },
              { key: 'reinvested', name: t('Reinvested'), color: c.reinvested },
            ]} extraRows={(d) => [{ name: t('Events'), value: d.events }]} />
          ) : <div className="empty">{t('No sport activity in {month}', { month: MONTHS_LONG[month - 1] })}</div>}
        </div>

        <div className="card">
          <div className="card-pad card-head" style={{ marginBottom: 0 }}><h2>{t('Events in {month}', { month: MONTHS_LONG[month - 1] })}</h2></div>
          <div className="table-wrap">
            {monthEvents.length ? (
              <table>
                <thead><tr><th className="hide-sm">{t('Date')}</th><th>{t('Event')}</th><th className="hide-sm">{t('Status')}</th><th className="r hide-sm">{t('Fees')}</th><th className="r hide-sm">{t('Organizing')}</th><th className="r hide-sm">{t('Benefits')}</th>
                  <th className="r">{t('Profit')}</th><th className="r">{t('Founders')}</th><th className="r hide-sm">{t('General')}</th><th className="r hide-sm">{t('Sport fund')}</th></tr></thead>
                <tbody>
                  {monthEvents.map((e) => (
                    <tr key={e.id} className="clickable" onClick={() => navigate(`/events/${e.id}`)}>
                      <td className="hide-sm">{date(e.date)}</td>
                      <td className="cell-wrap">
                        <div className="row-title">{e.name}</div>
                        <div className="row-sub"><span className="show-sm">{date(e.date)} · </span>{e.type_name}{e.status !== 'completed' && <span className="show-sm"> · {t('Live')}</span>}</div>
                      </td>
                      <td className="hide-sm">{e.status === 'completed' ? t('Finalized') : <span className="badge status-planned"><span className="dot" />{t('Live')}</span>}</td>
                      <td className="r hide-sm">{money0(e.fee_income)}</td>
                      <td className="r hide-sm">{money0(e.organizing)}</td>
                      <td className="r hide-sm">{money0(e.benefits)}</td>
                      <td className={`r ${e.profit >= 0 ? 'pos' : 'neg'}`}>{signedMoney(e.profit)}</td>
                      <td className="r">{money0(e.split.founders)}</td>
                      <td className="r hide-sm">{money0(e.split.general)}</td>
                      <td className="r hide-sm">{e.is_sport ? money0(e.split.sport) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <div className="empty">{t('No events this month')}</div>}
          </div>
        </div>

        <div className="card">
          <div className="card-pad card-head" style={{ marginBottom: 0 }}><h2>{t('Monthly statement')} · {year}</h2></div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>{t('Month')}</th><th className="r hide-sm">{t('Events')}</th><th className="r">{t('Income')}</th><th className="r hide-sm">{t('Costs')}</th><th className="r">{t('Profit')}</th>
                <th className="r hide-sm">{t('Founders & org.')}</th><th className="r hide-sm">{t('Sport funds')}</th><th className="r hide-sm">{t('General fund')}</th><th className="r hide-sm">{t('Reinvested')}</th></tr></thead>
              <tbody>
                {y.months.map((x) => (
                  <tr key={x.month} className={`clickable ${x.month === month ? 'row-selected' : ''}`} onClick={() => setMonth(x.month)}>
                    <td>{MONTHS_LONG[x.month - 1]}{x.live ? <span className="muted"> · {t('{n} live', { n: x.live })}</span> : ''}</td>
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
                  <td>{t('Total')}</td><td className="r hide-sm">{sum('events')}</td><td className="r">{money0(sum('income'))}</td><td className="r hide-sm">{money0(sum('expenses'))}</td>
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
