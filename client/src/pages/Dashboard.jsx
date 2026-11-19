import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { qs } from '../api.js';
import { useApi, useChartColors, usePermissions, usePersistentState } from '../hooks.js';
import { change, date, money, money0, monthName, MONTHS, number, pct, pctLabel, signedMoney } from '../format.js';
import Kpi from '../components/Kpi.jsx';
import EventForm from '../components/EventForm.jsx';
import { BarList, CumulativeChart, EventProfitList, IncomeExpenseChart, Legend, ProfitChart, SignedBarList } from '../components/Charts.jsx';
import { IconArrowDown, IconArrowUp, IconCalendar, IconPlus, IconTrend, IconUsers } from '../components/Icons.jsx';
import Select from '../components/Select.jsx';
import { useBusiness } from '../business.js';
import { t, tn } from '../i18n/index.js';

export function PeriodFilters({ year, setYear, type, setType, allowAll = true }) {
  const { data: years } = useApi('/stats/years');
  const { data: types } = useApi('/event-types');
  return (
    <div className="filters">
      <Select value={year} onChange={(e) => setYear(e.target.value)} aria-label={t('Year')}>
        {allowAll && <option value="">{t('All years')}</option>}
        {years?.map((y) => <option key={y} value={y}>{y}</option>)}
      </Select>
      {setType && (
        <Select value={type} onChange={(e) => setType(e.target.value)} aria-label={t('Sport')}>
          <option value="">{t('All sports')}</option>
          {types?.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
        </Select>
      )}
    </div>
  );
}

/** The money the community has in its account, and what that money is (funds, payouts still to send…). */
function AccountSection() {
  const { data: f } = useApi('/funds');
  const { on } = useBusiness();
  if (!f) return null;
  const c = f.cash;
  const parts = [
    { label: t('In the funds'), value: c.funds, hint: t('general + sport funds, to reinvest'), to: on('funds') ? '/sports' : null },
    c.owed >= 0
      ? { label: t('Still to pay out'), value: c.owed, hint: t('founders’ and organisers’ payouts not sent yet'), to: '/payouts' }
      : { label: t('Paid out beyond the calculated payouts'), value: c.owed, hint: t('more was sent than the profit split gives'), to: '/payouts' },
    { label: t('Organisers’ share with no points'), value: c.unassigned, hint: t('nobody earned points in those months'), to: '/payouts' },
  ].filter((p) => Math.abs(p.value) >= 0.01).map((p) => (p.to === '/payouts' && !on('payouts') ? { ...p, to: null } : p));
  return (
    <section className="card card-pad account-card">
      <div className="account-main">
        <span className="kpi-label">{t('Money in the account')}</span>
        <strong className={`account-value ${c.balance < 0 ? 'neg' : ''}`}>{money(c.balance)}</strong>
        <span className="muted">{t('Starting balance + finalized events’ profit + donations − reinvested − payouts sent. Compare it with the bank statement now and then.')}</span>
      </div>
      <div className="account-parts">
        {parts.map((p) => {
          const inner = <><span>{p.label}<small>{p.hint}</small></span><strong className={p.value < 0 ? 'neg' : ''}>{money0(p.value)}</strong></>;
          return p.to ? <Link key={p.label} to={p.to} className="account-part">{inner}</Link> : <div key={p.label} className="account-part">{inner}</div>;
        })}
        {on('vouchers') && c.openVouchers.n > 0 && (
          <Link to="/vouchers" className="account-part note">
            <span>{t('Unused vouchers')}<small>{t('already in the funds above; paid when they’re used')}{c.openVouchers.pct ? ` · ${t('plus {pct} % off, valued when used', { pct: c.openVouchers.pct })}` : ''}</small></span>
            <strong>{money0(c.openVouchers.value)}</strong>
          </Link>
        )}
      </div>
    </section>
  );
}

/** Chart 1: live totals of the general fund and each sport's reinvestment fund. */
function FundsSection() {
  const navigate = useNavigate();
  const c = useChartColors();
  const { data: f } = useApi('/funds');
  if (!f) return null;
  const s = f.split;
  const community = 100 - s.foundersStandard - s.foundersPoints;
  const items = [...f.sports].filter((x) => x.starting || x.allocated || x.reinvested || x.topups).sort((a, b) => b.balance - a.balance)
    .map((x) => ({ id: x.id, name: x.name, value: x.balance, sub: t('{allocated} allocated · {reinvested} reinvested', { allocated: money0(x.allocated), reinvested: money0(x.reinvested) }) }));
  const pending = f.general.pending + f.sportsTotal.pending;

  return (
    <section className="stack">
      <div className="section-head">
        <h2>{t('Reinvestment funds')} <span className="live-dot">{t('live')}</span> <Link to="/sports/general" className="section-link">{t('General fund details →')}</Link></h2>
        <p>{t('{pct} of every finalized event’s profit goes to the community: {general} of that to the general fund, the rest to the sport’s own fund.', { pct: pctLabel(community), general: pctLabel(s.generalShare) })}</p>
      </div>
      <div className="grid grid-kpi">
        <Kpi label={t('General community fund')} hero value={money0(f.general.balance)}
          sub={`${f.general.starting ? `${t('{amount} starting', { amount: money0(f.general.starting) })} · ` : ''}${t('{amount} from events', { amount: money0(f.general.allocated) })}${f.general.topups ? ` · ${t('+{amount} donations', { amount: money0(f.general.topups) })}` : ''} · ${t('−{amount} spent', { amount: money0(f.general.reinvested) })}${f.general.discounts ? ` (${t('incl. {amount} event discounts', { amount: money0(f.general.discounts) })})` : ''}`} />
        <Kpi label={t('All sport funds')} icon={IconTrend} tone="profit" value={money0(f.sportsTotal.balance)}
          sub={`${f.sportsTotal.starting ? `${t('{amount} starting', { amount: money0(f.sportsTotal.starting) })} · ` : ''}${t('{allocated} allocated · −{reinvested} reinvested', { allocated: money0(f.sportsTotal.allocated), reinvested: money0(f.sportsTotal.reinvested) })}`} />
        <Kpi label={t('Reinvested to date')} value={money0(f.general.reinvested + f.sportsTotal.reinvested)}
          sub={t('{sports} in sports · {general} general', { sports: money0(f.sportsTotal.reinvested), general: money0(f.general.reinvested) })} />
        <Kpi label={t('Pending from live events')} value={signedMoney(pending)}
          sub={t('added when those events are finalized')} />
      </div>
      <div className="card card-pad">
        <div className="card-head">
          <div><h2>{t('Fund balance per sport')}</h2><p>{t('What each sport has left to reinvest · click a sport for its history')}</p></div>
          <Legend items={[{ name: t('Available'), color: c.sportfund }, { name: t('Overspent'), color: c.neg }]} />
        </div>
        <SignedBarList items={items} color={c.sportfund} onOpen={(it) => navigate(`/sports/${it.id}`)}
          empty={t('No finalized events yet')} />
      </div>
    </section>
  );
}

/** Chart 2: founders' remuneration for a month (standard share + points-based share). */
function FoundersSection() {
  const c = useChartColors();
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const { data: r, loading } = useApi(`/founders?month=${month}`);
  if (!r) return null;
  const s = r.split;
  const totalPool = r.pools.standard + r.pools.points;
  const stdW = totalPool > 0 ? (r.pools.standard / totalPool) * 100 : 50;

  return (
    <section className={`stack ${loading ? 'loading' : ''}`}>
      <div className="section-head row">
        <div>
          <h2>{t('Payouts')} · {monthName(month)} <Link to="/payouts" className="section-link">{t('Open payouts →')}</Link></h2>
          <p>{t('{founders} of the month’s profit is split equally between founders, {organisers} between organisers by points', { founders: pctLabel(s.foundersStandard), organisers: pctLabel(s.foundersPoints) })}{s.custom ? ` (${t('targets set for this month')})` : ''}.</p>
        </div>
        <input type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} aria-label={t('Month')} style={{ width: 'auto' }} />
      </div>
      <div className="grid grid-2">
        <div className="card card-pad">
          <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
            <div className="mini-stat">
              <span className="mini-label"><i style={{ background: c.founders }} />{t('Founders')} ({pctLabel(s.foundersStandard)})</span>
              <strong>{money0(r.pools.standard)}</strong>
              <span className="muted">{r.founders ? t('{amount} each · {n} founders', { amount: money0(r.pools.standard / r.founders), n: r.founders }) : t('no founders set')}</span>
            </div>
            <div className="mini-stat">
              <span className="mini-label"><i style={{ background: c.general }} />{t('Organisers')} ({pctLabel(s.foundersPoints)})</span>
              <strong>{money0(r.pools.points)}</strong>
              <span className="muted">{r.totalPoints ? t('{n} points · {amount} per point', { n: number(r.totalPoints), amount: money0(r.pools.points / r.totalPoints) }) : t('no points recorded')}</span>
            </div>
            <div className="mini-stat">
              <span className="mini-label">{t('Profit this month')}</span>
              <strong className={r.profit < 0 ? 'neg' : ''}>{signedMoney(r.profit)}</strong>
              <span className="muted">{t('{n} finalized', { n: r.events.length })}{r.liveEvents ? ` · ${t('{n} still live', { n: r.liveEvents })}` : ''}</span>
            </div>
          </div>
          <div className="split-bar" role="img" aria-label={t('Standard {standard}, points {points}', { standard: money0(r.pools.standard), points: money0(r.pools.points) })}>
            <div style={{ width: `${stdW}%`, background: c.founders }} />
            <div style={{ width: `${100 - stdW}%`, background: c.general }} />
          </div>
          {r.liveEvents > 0 && (
            <p className="muted" style={{ margin: '12px 0 0' }}>
              {tn(r.liveEvents, '{amount} more once the live event is finalized.', '{amount} more once the {n} live events are finalized.', { amount: signedMoney(r.pending.founders) })}
            </p>
          )}
        </div>
        <div className="card">
          <div className="card-pad card-head" style={{ marginBottom: 0 }}><h2>{t('Per person')}</h2></div>
          <div className="table-wrap">
            {r.people.length ? (
              <table>
                <thead><tr><th>{t('Person')}</th><th className="r hide-sm">{t('Founder')}</th><th className="r hide-sm">{t('Organiser')}</th><th className="r">{t('Total')}</th></tr></thead>
                <tbody>
                  {r.people.map((p) => (
                    <tr key={p.id}>
                      <td>
                        {p.name}{p.founder && <span className="badge hide-sm" style={{ marginLeft: 6 }}>{t('Founder')}</span>}
                        <div className="row-sub show-sm">{t('{standard} founder · {points} organiser', { standard: money0(p.standard), points: money0(p.pointsAmount) })} ({number(p.points)}p)</div>
                      </td>
                      <td className="r hide-sm">{money0(p.standard)}</td>
                      <td className="r hide-sm" title={t('{n} points', { n: number(p.points) })}>{money0(p.pointsAmount)} <span className="muted">· {number(p.points)}p</span></td>
                      <td className="r"><strong>{money0(p.total)}</strong></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <div className="empty">{t('Add founders in Settings → People, and organisers on events.')}</div>}
          </div>
        </div>
      </div>
    </section>
  );
}

function YearOverview() {
  const navigate = useNavigate();
  const c = useChartColors();
  const [year, setYear] = usePersistentState('am-dash-year', String(new Date().getFullYear()));
  const [type, setType] = usePersistentState('am-dash-type', '');
  const { data: s, loading, error } = useApi(`/stats${qs({ year, type })}`);

  if (error) return <div className="error-box">{error}</div>;
  if (!s) return null;

  const { totals, previous, kpis } = s;
  const hasPrev = previous && (previous.income || previous.expenses);
  const prevLabel = year ? t('vs {year}', { year: Number(year) - 1 }) : '';
  const xFormat = year ? (m) => MONTHS[Number(m) - 1] : undefined;
  const completed = s.events.filter((e) => e.status === 'completed');
  const ranked = [...completed].sort((a, b) => b.profit - a.profit);
  const top = ranked.slice(0, 5);
  const bottom = ranked.slice(-5).reverse().filter((e) => !top.includes(e));
  const best = [...s.periods].filter((p) => p.income || p.expenses).sort((a, b) => b.profit - a.profit);

  return (
    <section className={`stack ${loading ? 'loading' : ''}`}>
      <div className="section-head row">
        <div>
          <h2>{year ? t('{year} overview', { year }) : t('All-time overview')}</h2>
          <p>{t('Finalized events only')}{type ? ` · ${t('one sport')}` : ''}</p>
        </div>
        <PeriodFilters year={year} setYear={setYear} type={type} setType={setType} />
      </div>

      <div className="grid grid-kpi">
        <Kpi label={t('Income')} icon={IconArrowUp} tone="income" value={money0(totals.income)}
          delta={hasPrev ? change(totals.income, previous.income) : null} sub={hasPrev ? prevLabel : null} />
        <Kpi label={t('Expenses')} icon={IconArrowDown} tone="expense" value={money0(totals.expenses)} goodWhenUp={false}
          delta={hasPrev ? change(totals.expenses, previous.expenses) : null}
          sub={t('{organizing} organizing · {benefits} benefits', { organizing: money0(s.costs.organizing), benefits: money0(s.costs.benefits) })} />
        <Kpi label={t('Net profit')} icon={IconTrend} tone="profit" value={<span className={totals.profit >= 0 ? '' : 'neg'}>{signedMoney(totals.profit)}</span>}
          delta={hasPrev ? change(totals.profit, previous.profit) : null} sub={t('margin {pct}', { pct: pct(kpis.margin) })} />
        <Kpi label={t('Events')} icon={IconCalendar} value={number(kpis.completed)}
          sub={`${t('finalized')}${kpis.planned ? ` · ${t('{n} live', { n: kpis.planned })}` : ''} · ${t('{n} profitable', { n: kpis.profitable })}`} />
        <Kpi label={t('Participants')} icon={IconUsers} value={number(kpis.participants)}
          sub={kpis.avgParticipants ? t('{n} per event · {amount} each', { n: number(kpis.avgParticipants), amount: money0(kpis.incomePerParticipant) }) : null} />
      </div>

      <div className="card card-pad">
        <div className="card-head"><div><h2>{t('Where the profit went')}</h2><p>{t('Split of the {amount} profit', { amount: signedMoney(totals.profit) })}</p></div></div>
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))' }}>
          <div className="mini-stat"><span className="mini-label"><i style={{ background: c.founders }} />{t('Founders & organisers')}</span><strong>{money0(s.split.founders)}</strong></div>
          <div className="mini-stat"><span className="mini-label"><i style={{ background: c.sportfund }} />{t('Sport funds')}</span><strong>{money0(s.split.sport)}</strong></div>
          <div className="mini-stat"><span className="mini-label"><i style={{ background: c.general }} />{t('General fund')}</span><strong>{money0(s.split.general)}</strong></div>
        </div>
      </div>

      <div className="card card-pad">
        <div className="card-head"><div><h2>{t(year ? 'Income vs. expenses per month' : 'Income vs. expenses per year')}</h2><p>{t('Counted in the month the event took place')}</p></div></div>
        {s.periods.length ? <IncomeExpenseChart data={s.periods} xKey="period" xFormat={xFormat} /> : <div className="empty">{t('No finalized events yet')}</div>}
      </div>

      <div className="grid grid-2">
        <div className="card card-pad">
          <div className="card-head">
            <div>
              <h2>{t(year ? 'Profit per month' : 'Profit per year')}</h2>
              {best.length > 0 && (
                <p>{t('Best:')} {xFormat ? xFormat(best[0].period) : best[0].period} ({signedMoney(best[0].profit)}) ·
                  {t('Worst:')} {xFormat ? xFormat(best.at(-1).period) : best.at(-1).period} ({signedMoney(best.at(-1).profit)})</p>
              )}
            </div>
          </div>
          <ProfitChart data={s.periods} xKey="period" xFormat={xFormat} />
        </div>
        <div className="card card-pad">
          <div className="card-head">
            <div><h2>{t('Cumulative profit')}</h2>
              <p>{t('Running total:')} {signedMoney(s.periods.filter((p) => p.cumulative != null).at(-1)?.cumulative ?? 0)}</p></div>
          </div>
          <CumulativeChart data={s.periods} xKey="period" xFormat={xFormat} />
        </div>
      </div>

      <div className="grid grid-2">
        <div className="card">
          <div className="card-pad card-head" style={{ marginBottom: 0 }}><h2>{t('Results by sport')}</h2><Link to="/sports">{t('Sports')} →</Link></div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>{t('Sport')}</th><th className="r hide-sm">{t('Events')}</th><th className="r hide-sm">{t('Income')}</th><th className="r">{t('Profit')}</th><th className="r hide-sm">{t('Per event')}</th></tr></thead>
              <tbody>
                {s.byType.filter((x) => x.events).sort((a, b) => b.profit - a.profit).map((x) => (
                  <tr key={x.id} className="clickable" onClick={() => navigate(`/sports/${x.id}`)}>
                    <td>{x.name}<div className="row-sub show-sm">{t('{n} events · {income} income · {each} each', { n: x.events, income: money0(x.income), each: signedMoney(x.profit / x.events) })}</div></td>
                    <td className="r hide-sm">{x.events}</td>
                    <td className="r hide-sm">{money0(x.income)}</td>
                    <td className={`r ${x.profit >= 0 ? 'pos' : 'neg'}`}>{signedMoney(x.profit)}</td>
                    <td className="r hide-sm">{signedMoney(x.profit / x.events)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="card">
          <div className="card-pad card-head" style={{ marginBottom: 0 }}><h2>{t('Live events')}</h2><Link to="/events">{t('All events →')}</Link></div>
          {s.live.length ? (
            <div className="table-wrap">
              <table>
                <thead><tr><th>{t('Date')}</th><th>{t('Event')}</th><th className="r">{t('Profit so far')}</th></tr></thead>
                <tbody>
                  {s.live.map((e) => (
                    <tr key={e.id} className="clickable" onClick={() => navigate(`/events/${e.id}`)}>
                      <td>{date(e.date)}</td>
                      <td className="cell-wrap"><div className="row-title">{e.name}</div><div className="row-sub">{e.type_name}</div></td>
                      <td className={`r ${e.profit >= 0 ? 'pos' : 'neg'}`}>{signedMoney(e.profit)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <div className="empty">{t('No live events')}</div>}
        </div>
      </div>

      <div className="grid grid-2">
        <div className="card card-pad">
          <div className="card-head"><h2>{t('Where the money goes')}</h2><span className="muted">{t('{amount} total', { amount: money0(totals.expenses) })}</span></div>
          <BarList items={s.expenseByCategory.map((x) => ({ name: x.name, value: x.total }))} color={c.expense} />
        </div>
        <div className="card card-pad">
          <div className="card-head"><h2>{t('Where the money comes from')}</h2><span className="muted">{t('{amount} total', { amount: money0(totals.income) })}</span></div>
          <BarList items={s.incomeByCategory.map((x) => ({ name: x.name, value: x.total }))} color={c.income} />
        </div>
      </div>

      <div className="grid grid-2">
        <div className="card card-pad">
          <div className="card-head"><h2>{t('Most profitable events')}</h2></div>
          <EventProfitList events={top} onOpen={(e) => navigate(`/events/${e.id}`)} />
        </div>
        <div className="card card-pad">
          <div className="card-head"><h2>{t('Least profitable events')}</h2></div>
          <EventProfitList events={bottom} onOpen={(e) => navigate(`/events/${e.id}`)} />
        </div>
      </div>
    </section>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const { canEdit } = usePermissions();
  const { on, term } = useBusiness();
  return (
    <div>
      <div className="page-head">
        <div>
          <h1>{t('Dashboard')}</h1>
          <p>{t(on('payouts') ? 'Funds, founders’ remuneration and how the community is doing.' : 'Money in the account and how the business is doing.')}</p>
        </div>
        {canEdit && <button className="btn btn-primary" onClick={() => setCreating(true)}><IconPlus width="16" />{t(`New ${term('event')}`)}</button>}
      </div>
      <div className="stack" style={{ gap: 40 }}>
        <AccountSection />
        {on('funds') && <FundsSection />}
        {on('payouts') && <FoundersSection />}
        <YearOverview />
      </div>
      {creating && <EventForm onClose={() => setCreating(false)} onSaved={(id) => navigate(`/events/${id}`)} />}
    </div>
  );
}
