import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { qs } from '../api.js';
import { useApi, useChartColors, usePermissions, usePersistentState } from '../hooks.js';
import { change, date, money0, MONTHS, MONTHS_LONG, number, pct, signedMoney } from '../format.js';
import Kpi from '../components/Kpi.jsx';
import EventForm from '../components/EventForm.jsx';
import { BarList, CumulativeChart, EventProfitList, IncomeExpenseChart, Legend, ProfitChart, SignedBarList } from '../components/Charts.jsx';
import { IconArrowDown, IconArrowUp, IconCalendar, IconPlus, IconTrend, IconUsers } from '../components/Icons.jsx';

export function PeriodFilters({ year, setYear, type, setType, allowAll = true }) {
  const { data: years } = useApi('/stats/years');
  const { data: types } = useApi('/event-types');
  return (
    <div className="filters">
      <select value={year} onChange={(e) => setYear(e.target.value)} aria-label="Year">
        {allowAll && <option value="">All years</option>}
        {years?.map((y) => <option key={y} value={y}>{y}</option>)}
      </select>
      {setType && (
        <select value={type} onChange={(e) => setType(e.target.value)} aria-label="Sport">
          <option value="">All sports</option>
          {types?.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      )}
    </div>
  );
}

export const pctLabel = (v) => `${Math.round(v * 10) / 10}%`;
export const monthName = (ym) => `${MONTHS_LONG[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`;

/** Chart 1: live totals of the general fund and each sport's reinvestment fund. */
function FundsSection() {
  const navigate = useNavigate();
  const c = useChartColors();
  const { data: f } = useApi('/funds');
  if (!f) return null;
  const s = f.split;
  const community = 100 - s.foundersStandard - s.foundersPoints;
  const items = [...f.sports].filter((x) => x.allocated || x.reinvested || x.topups).sort((a, b) => b.balance - a.balance)
    .map((x) => ({ id: x.id, name: x.name, value: x.balance, sub: `${money0(x.allocated)} allocated · ${money0(x.reinvested)} reinvested` }));
  const pending = f.general.pending + f.sportsTotal.pending;

  return (
    <section className="stack">
      <div className="section-head">
        <h2>Reinvestment funds <span className="live-dot">live</span></h2>
        <p>{pctLabel(community)} of every finalized event’s profit goes to the community:
          {' '}{pctLabel(s.generalShare)} of that to the general fund, the rest to the sport’s own fund.</p>
      </div>
      <div className="grid grid-kpi">
        <Kpi label="General community fund" hero value={money0(f.general.balance)}
          sub={`${money0(f.general.allocated)} from events${f.general.topups ? ` · +${money0(f.general.topups)} donations` : ''} · −${money0(f.general.reinvested)} spent`} />
        <Kpi label="All sport funds" icon={IconTrend} tone="profit" value={money0(f.sportsTotal.balance)}
          sub={`${money0(f.sportsTotal.allocated)} allocated · −${money0(f.sportsTotal.reinvested)} reinvested`} />
        <Kpi label="Reinvested to date" value={money0(f.general.reinvested + f.sportsTotal.reinvested)}
          sub={`${money0(f.sportsTotal.reinvested)} in sports · ${money0(f.general.reinvested)} general`} />
        <Kpi label="Pending from live events" value={signedMoney(pending)}
          sub="added when those events are finalized" />
      </div>
      <div className="card card-pad">
        <div className="card-head">
          <div><h2>Fund balance per sport</h2><p>What each sport has left to reinvest · click a sport for its history</p></div>
          <Legend items={[{ name: 'Available', color: c.sportfund }, { name: 'Overspent', color: c.neg }]} />
        </div>
        <SignedBarList items={items} color={c.sportfund} onOpen={(it) => navigate(`/sports/${it.id}`)}
          empty="No finalized events yet" />
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
          <h2>Payouts · {monthName(month)} <Link to="/payouts" className="section-link">Open payouts →</Link></h2>
          <p>{pctLabel(s.foundersStandard)} of the month’s profit is split equally between founders,
            {' '}{pctLabel(s.foundersPoints)} between organisers by points{s.custom ? ' (targets set for this month)' : ''}.</p>
        </div>
        <input type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} aria-label="Month" style={{ width: 'auto' }} />
      </div>
      <div className="grid grid-2">
        <div className="card card-pad">
          <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
            <div className="mini-stat">
              <span className="mini-label"><i style={{ background: c.founders }} />Founders ({pctLabel(s.foundersStandard)})</span>
              <strong>{money0(r.pools.standard)}</strong>
              <span className="muted">{r.founders ? `${money0(r.pools.standard / r.founders)} each · ${r.founders} founders` : 'no founders set'}</span>
            </div>
            <div className="mini-stat">
              <span className="mini-label"><i style={{ background: c.general }} />Organisers ({pctLabel(s.foundersPoints)})</span>
              <strong>{money0(r.pools.points)}</strong>
              <span className="muted">{r.totalPoints ? `${number(r.totalPoints)} points · ${money0(r.pools.points / r.totalPoints)} per point` : 'no points recorded'}</span>
            </div>
            <div className="mini-stat">
              <span className="mini-label">Profit this month</span>
              <strong className={r.profit < 0 ? 'neg' : ''}>{signedMoney(r.profit)}</strong>
              <span className="muted">{r.events.length} finalized{r.liveEvents ? ` · ${r.liveEvents} still live` : ''}</span>
            </div>
          </div>
          <div className="split-bar" role="img" aria-label={`Standard ${money0(r.pools.standard)}, points ${money0(r.pools.points)}`}>
            <div style={{ width: `${stdW}%`, background: c.founders }} />
            <div style={{ width: `${100 - stdW}%`, background: c.general }} />
          </div>
          {r.liveEvents > 0 && (
            <p className="muted" style={{ margin: '12px 0 0' }}>
              {signedMoney(r.pending.founders)} more once the {r.liveEvents} live event{r.liveEvents > 1 ? 's are' : ' is'} finalized.
            </p>
          )}
        </div>
        <div className="card">
          <div className="card-pad card-head" style={{ marginBottom: 0 }}><h2>Per person</h2></div>
          <div className="table-wrap">
            {r.people.length ? (
              <table>
                <thead><tr><th>Person</th><th className="r hide-sm">Founder</th><th className="r hide-sm">Organiser</th><th className="r">Total</th></tr></thead>
                <tbody>
                  {r.people.map((p) => (
                    <tr key={p.id}>
                      <td>
                        {p.name}{p.founder && <span className="badge hide-sm" style={{ marginLeft: 6 }}>Founder</span>}
                        <div className="row-sub show-sm">{money0(p.standard)} founder · {money0(p.pointsAmount)} organiser ({number(p.points)}p)</div>
                      </td>
                      <td className="r hide-sm">{money0(p.standard)}</td>
                      <td className="r hide-sm" title={`${number(p.points)} points`}>{money0(p.pointsAmount)} <span className="muted">· {number(p.points)}p</span></td>
                      <td className="r"><strong>{money0(p.total)}</strong></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <div className="empty">Add founders in Settings → People, and organisers on events.</div>}
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
  const prevLabel = year ? `vs ${Number(year) - 1}` : '';
  const xFormat = year ? (m) => MONTHS[Number(m) - 1] : undefined;
  const periodWord = year ? 'month' : 'year';
  const completed = s.events.filter((e) => e.status === 'completed');
  const ranked = [...completed].sort((a, b) => b.profit - a.profit);
  const top = ranked.slice(0, 5);
  const bottom = ranked.slice(-5).reverse().filter((e) => !top.includes(e));
  const best = [...s.periods].filter((p) => p.income || p.expenses).sort((a, b) => b.profit - a.profit);

  return (
    <section className={`stack ${loading ? 'loading' : ''}`}>
      <div className="section-head row">
        <div>
          <h2>{year ? `${year} overview` : 'All-time overview'}</h2>
          <p>Finalized events only{type ? ' · one sport' : ''}</p>
        </div>
        <PeriodFilters year={year} setYear={setYear} type={type} setType={setType} />
      </div>

      <div className="grid grid-kpi">
        <Kpi label="Income" icon={IconArrowUp} tone="income" value={money0(totals.income)}
          delta={hasPrev ? change(totals.income, previous.income) : null} sub={hasPrev ? prevLabel : null} />
        <Kpi label="Expenses" icon={IconArrowDown} tone="expense" value={money0(totals.expenses)} goodWhenUp={false}
          delta={hasPrev ? change(totals.expenses, previous.expenses) : null}
          sub={`${money0(s.costs.organizing)} organizing · ${money0(s.costs.benefits)} benefits`} />
        <Kpi label="Net profit" icon={IconTrend} tone="profit" value={<span className={totals.profit >= 0 ? '' : 'neg'}>{signedMoney(totals.profit)}</span>}
          delta={hasPrev ? change(totals.profit, previous.profit) : null} sub={`margin ${pct(kpis.margin)}`} />
        <Kpi label="Events" icon={IconCalendar} value={number(kpis.completed)}
          sub={`finalized${kpis.planned ? ` · ${kpis.planned} live` : ''} · ${kpis.profitable} profitable`} />
        <Kpi label="Participants" icon={IconUsers} value={number(kpis.participants)}
          sub={kpis.avgParticipants ? `${number(kpis.avgParticipants)} per event · ${money0(kpis.incomePerParticipant)} each` : null} />
      </div>

      <div className="card card-pad">
        <div className="card-head"><div><h2>Where the profit went</h2><p>Split of the {signedMoney(totals.profit)} profit</p></div></div>
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))' }}>
          <div className="mini-stat"><span className="mini-label"><i style={{ background: c.founders }} />Founders & organisers</span><strong>{money0(s.split.founders)}</strong></div>
          <div className="mini-stat"><span className="mini-label"><i style={{ background: c.sportfund }} />Sport funds</span><strong>{money0(s.split.sport)}</strong></div>
          <div className="mini-stat"><span className="mini-label"><i style={{ background: c.general }} />General fund</span><strong>{money0(s.split.general)}</strong></div>
        </div>
      </div>

      <div className="card card-pad">
        <div className="card-head"><div><h2>Income vs. expenses per {periodWord}</h2><p>Counted in the month the event took place</p></div></div>
        {s.periods.length ? <IncomeExpenseChart data={s.periods} xKey="period" xFormat={xFormat} /> : <div className="empty">No finalized events yet</div>}
      </div>

      <div className="grid grid-2">
        <div className="card card-pad">
          <div className="card-head">
            <div>
              <h2>Profit per {periodWord}</h2>
              {best.length > 0 && (
                <p>Best: {xFormat ? xFormat(best[0].period) : best[0].period} ({signedMoney(best[0].profit)}) ·
                  Worst: {xFormat ? xFormat(best.at(-1).period) : best.at(-1).period} ({signedMoney(best.at(-1).profit)})</p>
              )}
            </div>
          </div>
          <ProfitChart data={s.periods} xKey="period" xFormat={xFormat} />
        </div>
        <div className="card card-pad">
          <div className="card-head">
            <div><h2>Cumulative profit</h2>
              <p>Running total: {signedMoney(s.periods.filter((p) => p.cumulative != null).at(-1)?.cumulative ?? 0)}</p></div>
          </div>
          <CumulativeChart data={s.periods} xKey="period" xFormat={xFormat} />
        </div>
      </div>

      <div className="grid grid-2">
        <div className="card">
          <div className="card-pad card-head" style={{ marginBottom: 0 }}><h2>Results by sport</h2><Link to="/sports">Sports →</Link></div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Sport</th><th className="r hide-sm">Events</th><th className="r hide-sm">Income</th><th className="r">Profit</th><th className="r hide-sm">Per event</th></tr></thead>
              <tbody>
                {s.byType.filter((t) => t.events).sort((a, b) => b.profit - a.profit).map((t) => (
                  <tr key={t.id} className="clickable" onClick={() => navigate(`/sports/${t.id}`)}>
                    <td>{t.name}<div className="row-sub show-sm">{t.events} events · {money0(t.income)} income · {signedMoney(t.profit / t.events)} each</div></td>
                    <td className="r hide-sm">{t.events}</td>
                    <td className="r hide-sm">{money0(t.income)}</td>
                    <td className={`r ${t.profit >= 0 ? 'pos' : 'neg'}`}>{signedMoney(t.profit)}</td>
                    <td className="r hide-sm">{signedMoney(t.profit / t.events)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="card">
          <div className="card-pad card-head" style={{ marginBottom: 0 }}><h2>Live events</h2><Link to="/events">All events →</Link></div>
          {s.live.length ? (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Date</th><th>Event</th><th className="r">Profit so far</th></tr></thead>
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
          ) : <div className="empty">No live events</div>}
        </div>
      </div>

      <div className="grid grid-2">
        <div className="card card-pad">
          <div className="card-head"><h2>Where the money goes</h2><span className="muted">{money0(totals.expenses)} total</span></div>
          <BarList items={s.expenseByCategory.map((x) => ({ name: x.name, value: x.total }))} color={c.expense} />
        </div>
        <div className="card card-pad">
          <div className="card-head"><h2>Where the money comes from</h2><span className="muted">{money0(totals.income)} total</span></div>
          <BarList items={s.incomeByCategory.map((x) => ({ name: x.name, value: x.total }))} color={c.income} />
        </div>
      </div>

      <div className="grid grid-2">
        <div className="card card-pad">
          <div className="card-head"><h2>Most profitable events</h2></div>
          <EventProfitList events={top} onOpen={(e) => navigate(`/events/${e.id}`)} />
        </div>
        <div className="card card-pad">
          <div className="card-head"><h2>Least profitable events</h2></div>
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
  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Dashboard</h1>
          <p>Funds, founders’ remuneration and how the community is doing.</p>
        </div>
        {canEdit && <button className="btn btn-primary" onClick={() => setCreating(true)}><IconPlus width="16" />New event</button>}
      </div>
      <div className="stack" style={{ gap: 40 }}>
        <FundsSection />
        <FoundersSection />
        <YearOverview />
      </div>
      {creating && <EventForm onClose={() => setCreating(false)} onSaved={(id) => navigate(`/events/${id}`)} />}
    </div>
  );
}
