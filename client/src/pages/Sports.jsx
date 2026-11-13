import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useApi, useChartColors, usePermissions } from '../hooks.js';
import { date, money, money0, MONTHS, signedMoney } from '../format.js';
import Kpi from '../components/Kpi.jsx';
import TxForm from '../components/TxForm.jsx';
import TxTable from '../components/TxTable.jsx';
import { confirmDelete } from '../components/Modal.jsx';
import { BalanceLine, GroupedBars } from '../components/Charts.jsx';
import { IconPlus, IconTrash, IconTrend, IconChevronLeft } from '../components/Icons.jsx';
import StatusBadge from '../components/StatusBadge.jsx';

const ymLabel = (ym) => `${MONTHS[Number(ym.slice(5, 7)) - 1]} ${ym.slice(2, 4)}`;

export function SportsList() {
  const navigate = useNavigate();
  const { data: sports, reload } = useApi('/sports/summary');
  const { data: funds, reload: reloadFunds } = useApi('/funds');
  const [form, setForm] = useState(null);
  const { canEdit } = usePermissions();
  if (!sports || !funds) return null;
  const sorted = [...sports].sort((a, b) => b.totalEvents - a.totalEvents || a.name.localeCompare(b.name));

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Sports</h1>
          <p>The general community fund and each sport’s reinvestment fund: what their events earned for them, what was reinvested, and what is left. Click one for its details.</p>
        </div>
        {canEdit && <button className="btn btn-primary" onClick={() => setForm({ fund: 'general' })}><IconPlus width="16" />Record reinvestment</button>}
      </div>
      <div className="stack">
        <div className="grid grid-kpi">
          <Kpi label="Left to reinvest (all sports)" hero value={money0(funds.sportsTotal.balance)}
            sub={`${money0(funds.sportsTotal.allocated)} earned · ${money0(funds.sportsTotal.reinvested)} reinvested`} />
          <Kpi label="General community fund" icon={IconTrend} tone="profit" value={money0(funds.general.balance)}
            sub={`${money0(funds.general.reinvested)} spent so far`} />
        </div>
        <div className="sport-grid">
          <button className="card sport-card" onClick={() => navigate('/sports/general')}>
            <div className="sport-card-top">
              <h2>General fund</h2>
              <span className="muted">all events</span>
            </div>
            <div className={`sport-balance ${funds.general.balance < 0 ? 'neg' : ''}`}>{money0(funds.general.balance)}</div>
            <div className="muted" style={{ fontSize: 12.5 }}>left to spend</div>
            <div className="progress" style={{ margin: '12px 0 8px' }}>
              <div style={{ width: `${(() => { const g = funds.general, inn = g.starting + g.allocated + g.topups; return inn > 0 ? Math.min(g.reinvested / inn, 1) * 100 : 0; })()}%`, background: 'var(--reinvested)' }} />
            </div>
            <div className="sport-card-foot">
              <span>{money0(funds.general.allocated + funds.general.topups)} added</span>
              <span>{money0(funds.general.reinvested)} spent</span>
            </div>
          </button>
          {sorted.map((s) => {
            const used = s.starting + s.allocated + s.topups > 0 ? Math.min(s.reinvested / (s.starting + s.allocated + s.topups), 1) : 0;
            return (
              <button className="card sport-card" key={s.id} onClick={() => navigate(`/sports/${s.id}`)}>
                <div className="sport-card-top">
                  <h2>{s.name}</h2>
                  <span className="muted">{s.totalEvents} events{s.liveEvents ? ` · ${s.liveEvents} live` : ''}</span>
                </div>
                <div className={`sport-balance ${s.balance < 0 ? 'neg' : ''}`}>{money0(s.balance)}</div>
                <div className="muted" style={{ fontSize: 12.5 }}>left to reinvest</div>
                <div className="progress" style={{ margin: '12px 0 8px' }} title={`${Math.round(used * 100)}% reinvested`}>
                  <div style={{ width: `${used * 100}%`, background: 'var(--reinvested)' }} />
                </div>
                <div className="sport-card-foot">
                  <span>{money0(s.allocated)} earned</span>
                  <span>{money0(s.reinvested)} reinvested</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>
      {form && <TxForm fund={form.fund} defaultKind="expense" onClose={() => setForm(null)} onSaved={() => { setForm(null); reload(); reloadFunds(); }} />}
    </div>
  );
}

export function SportDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const c = useChartColors();
  const { data: r, reload, error } = useApi(`/sports/${id}`);
  const [form, setForm] = useState(null);
  const { canEdit } = usePermissions();
  if (error) return <div className="error-box">{error}</div>;
  if (!r) return null;
  const { sport, fund, months } = r;
  const recent = months.slice(-18).map((m) => ({ ...m, label: ymLabel(m.month) }));
  const finalized = r.events.filter((e) => e.status === 'completed');
  const addPart = async () => {
    const name = window.prompt(`Name of the new part of the ${sport.name} fund (e.g. Active Padel Academy):`);
    if (!name?.trim()) return;
    try { await api.post('/fund-parts', { sport_id: sport.id, name }); reload(); } catch (e) { window.alert(e.message); }
  };
  const delPart = async (p) => {
    if (!window.confirm(`Stop counting “${p.name}” apart? Its ${p.count} movements stay in the ${sport.name} fund.`)) return;
    await api.del(`/fund-parts/${p.id}`);
    reload();
  };
  const del = async (t) => {
    if (!confirmDelete('this fund movement')) return;
    await api.del(`/transactions/${t.id}`);
    reload();
  };

  return (
    <div>
      <Link to="/sports" className="back-link"><IconChevronLeft width="16" height="16" />Sports</Link>
      <div className="page-head">
        <div>
          <h1>{sport.name}</h1>
          <p>{finalized.length} finalized events · {money0(finalized.reduce((s, e) => s + e.income, 0))} income ·
            {' '}{signedMoney(finalized.reduce((s, e) => s + e.profit, 0))} profit</p>
        </div>
        {canEdit && (
          <div className="page-actions">
            <button className="btn" onClick={() => setForm({ kind: 'income' })}>Add money</button>
            <button className="btn btn-primary" onClick={() => setForm({ kind: 'expense' })}><IconPlus width="16" />Record reinvestment</button>
          </div>
        )}
      </div>

      <div className="stack">
        <div className="grid grid-kpi">
          <Kpi label="Left to reinvest" hero value={money0(fund.balance)} sub={[fund.starting && `incl. ${money0(fund.starting)} starting balance`, fund.pending ? `${signedMoney(fund.pending)} pending from live events` : 'available now',
            r.openVouchers?.n > r.openVouchers?.pct && `${money0(r.openVouchers.value)} in ${r.openVouchers.n - r.openVouchers.pct} unused voucher${r.openVouchers.n - r.openVouchers.pct > 1 ? 's' : ''} still to pay`,
            r.openVouchers?.pct && `${r.openVouchers.pct} % off voucher${r.openVouchers.pct > 1 ? 's' : ''} not used yet`].filter(Boolean).join(' · ')} />
          <Kpi label="Earned for the fund" icon={IconTrend} tone="profit" value={money0(fund.allocated)} sub={`from ${fund.events} finalized events`} />
          <Kpi label="Reinvested" value={money0(fund.reinvested)} sub={fund.topups ? `+${money0(fund.topups)} added directly` : `${r.fundTx.filter((t) => t.kind === 'expense').length} purchases`} />
        </div>

        <div className="grid grid-2">
          <div className="card card-pad">
            <div className="card-head"><div><h2>Earned vs. reinvested per month</h2><p>Last {recent.length} months with activity</p></div></div>
            {recent.length ? (
              <GroupedBars data={recent} xKey="label" height={250} series={[
                { key: 'allocated', name: 'Added to fund', color: c.sportfund },
                { key: 'reinvested', name: 'Reinvested', color: c.reinvested },
              ]} extraRows={(d) => [{ name: 'Balance after', value: money(d.balance) }]} />
            ) : <div className="empty">No activity yet</div>}
          </div>
          <div className="card card-pad">
            <div className="card-head"><div><h2>Fund balance over time</h2><p>What was left to reinvest at the end of each month</p></div></div>
            {recent.length ? <BalanceLine data={recent} xKey="label" yKey="balance" height={278} name="Left to reinvest" /> : <div className="empty">No activity yet</div>}
          </div>
        </div>

        <div className="card">
          <div className="card-pad card-head" style={{ marginBottom: 0 }}><h2>Month by month</h2></div>
          <div className="table-wrap" style={{ maxHeight: 420 }}>
            <table>
              <thead><tr><th>Month</th><th className="r hide-sm">Events</th><th className="r hide-sm">Income</th><th className="r hide-sm">Profit</th><th className="r">Added to fund</th><th className="r">Reinvested</th><th className="r">Balance</th></tr></thead>
              <tbody>
                {[...months].reverse().map((m) => (
                  <tr key={m.month}>
                    <td>{ymLabel(m.month)}</td>
                    <td className="r hide-sm">{m.events}</td>
                    <td className="r hide-sm">{money0(m.income)}</td>
                    <td className={`r hide-sm ${m.profit < 0 ? 'neg' : ''}`}>{signedMoney(m.profit)}</td>
                    <td className="r">{money0(m.allocated + m.topups)}</td>
                    <td className="r">{m.reinvested ? `−${money0(m.reinvested)}` : '—'}</td>
                    <td className={`r ${m.balance < 0 ? 'neg' : ''}`}><strong>{money0(m.balance)}</strong></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {(r.parts.length > 0 || canEdit) && (
          <div className="card">
            <div className="card-pad card-head" style={{ marginBottom: 0 }}>
              <div><h2>Parts of the fund</h2><p>Paid from the {sport.name} fund, but counted apart</p></div>
              {canEdit && <button className="btn btn-sm" onClick={addPart}><IconPlus width="14" />Add a part</button>}
            </div>
            <div className="table-wrap">
              {r.parts.length ? (
                <table>
                  <thead><tr><th>Part</th><th className="r hide-sm">Movements</th><th className="r">Spent</th><th className="r hide-sm">Added</th>{canEdit && <th />}</tr></thead>
                  <tbody>
                    {r.parts.map((p) => (
                      <tr key={p.id}>
                        <td><strong>{p.name}</strong><div className="row-sub show-sm">{p.count} movements</div></td>
                        <td className="r hide-sm">{p.count}</td>
                        <td className="r"><strong>{p.spent ? `−${money(p.spent)}` : '—'}</strong></td>
                        <td className="r hide-sm">{p.added ? `+${money(p.added)}` : '—'}</td>
                        {canEdit && (
                          <td className="r actions">
                            <button className="btn btn-sm" onClick={() => setForm({ kind: 'expense', part: p.id })}><span className="hide-sm">Record spending</span><span className="show-sm">Spend</span></button>
                            <button className="icon-btn" aria-label="Remove part" onClick={() => delPart(p)}><IconTrash /></button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : <div className="empty">No parts. Add one to count a project’s spending apart, e.g. an academy.</div>}
            </div>
          </div>
        )}

        <div className="card">
          <div className="card-pad card-head" style={{ marginBottom: 0 }}><div><h2>Reinvestments &amp; fund movements</h2><p>Purchases paid from this sport’s fund</p></div></div>
          <div className="table-wrap">
            <TxTable rows={r.fundTx} showEvent={false} onEdit={(t) => setForm({ tx: t })} onDelete={del}
              empty="Nothing reinvested yet. Record a purchase with “Record reinvestment”." />
          </div>
        </div>

        <div className="card">
          <div className="card-pad card-head" style={{ marginBottom: 0 }}><h2>Events</h2></div>
          <div className="table-wrap" style={{ maxHeight: 480 }}>
            <table>
              <thead><tr><th className="hide-sm">Date</th><th>Event</th><th className="hide-sm">Status</th><th className="r hide-sm">People</th><th className="r hide-sm">Income</th><th className="r">Profit</th><th className="r">To this fund</th></tr></thead>
              <tbody>
                {r.events.map((e) => (
                  <tr key={e.id} className="clickable" onClick={() => navigate(`/events/${e.id}`)}>
                    <td className="hide-sm">{date(e.date)}</td>
                    <td className="cell-wrap">
                      {e.name}
                      <div className="row-sub show-sm">{date(e.date)}{e.status !== 'completed' && <> · <StatusBadge status={e.status} /></>}</div>
                    </td>
                    <td className="hide-sm"><StatusBadge status={e.status} /></td>
                    <td className="r hide-sm">{e.participants}</td>
                    <td className="r hide-sm">{money0(e.income)}</td>
                    <td className={`r ${e.profit >= 0 ? 'pos' : 'neg'}`}>{signedMoney(e.profit)}</td>
                    <td className="r">{money0(e.split.sport)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {form && (
        <TxForm tx={form.tx} fund={Number(id)} part={form.part} defaultKind={form.kind || 'expense'}
          onClose={() => setForm(null)} onSaved={() => { setForm(null); reload(); }} />
      )}
    </div>
  );
}

/** The general community fund: what fed it (every event's general share, payouts left to it, donations) and what it paid for. */
export function GeneralFundDetail() {
  const navigate = useNavigate();
  const c = useChartColors();
  const { data: r, reload, error } = useApi('/funds/general');
  const [form, setForm] = useState(null);
  const { canEdit } = usePermissions();
  if (error) return <div className="error-box">{error}</div>;
  if (!r) return null;
  const { fund, months } = r;
  const recent = months.slice(-18).map((m) => ({ ...m, label: ymLabel(m.month) }));
  const del = async (t) => {
    if (!confirmDelete('this fund movement')) return;
    await api.del(`/transactions/${t.id}`);
    reload();
  };
  const fromPayouts = r.payouts.reduce((a, p) => a + p.amount, 0);
  const v = r.openVouchers;

  return (
    <div>
      <Link to="/sports" className="back-link"><IconChevronLeft width="16" height="16" />Sports</Link>
      <div className="page-head">
        <div>
          <h1>General community fund</h1>
          <p>Gets the general share of every finalized event (all of the community share for events that aren’t a sport), payouts left to the community and donations.
            {' '}It pays for the community’s own spending and for the discounts given at events.</p>
        </div>
        {canEdit && (
          <div className="page-actions">
            <button className="btn" onClick={() => setForm({ kind: 'income' })}>Add money</button>
            <button className="btn btn-primary" onClick={() => setForm({ kind: 'expense' })}><IconPlus width="16" />Record spending</button>
          </div>
        )}
      </div>

      <div className="stack">
        <div className="grid grid-kpi">
          <Kpi label="Left to spend" hero value={money0(fund.balance)} sub={[fund.starting && `incl. ${money0(fund.starting)} starting balance`,
            fund.pending ? `${signedMoney(fund.pending)} pending from live events` : 'available now',
            v?.n > v?.pct && `${money0(v.value)} in ${v.n - v.pct} unused voucher${v.n - v.pct > 1 ? 's' : ''} still to pay`].filter(Boolean).join(' · ')} />
          <Kpi label="Earned from events" icon={IconTrend} tone="profit" value={money0(fund.allocated - fromPayouts)} sub={`from ${fund.events} finalized events`} />
          <Kpi label="Donations & payouts left to it" value={money0(fund.topups + fromPayouts)}
            sub={`${money0(fund.topups)} added directly · ${money0(fromPayouts)} from payouts`} />
          <Kpi label="Spent" value={money0(fund.reinvested)} sub={`${money0(fund.reinvested - fund.discounts)} spending · ${money0(fund.discounts)} event discounts`} />
        </div>

        <div className="grid grid-2">
          <div className="card card-pad">
            <div className="card-head"><div><h2>Added vs. spent per month</h2><p>Last {recent.length} months with activity</p></div></div>
            {recent.length ? (
              <GroupedBars data={recent} xKey="label" height={250} series={[
                { key: 'added', name: 'Added to fund', color: c.general },
                { key: 'reinvested', name: 'Spent', color: c.reinvested },
              ]} extraRows={(d) => [{ name: 'Balance after', value: money(d.balance) }]} />
            ) : <div className="empty">No activity yet</div>}
          </div>
          <div className="card card-pad">
            <div className="card-head"><div><h2>Fund balance over time</h2><p>What was left at the end of each month</p></div></div>
            {recent.length ? <BalanceLine data={recent} xKey="label" yKey="balance" height={278} name="Left to spend" /> : <div className="empty">No activity yet</div>}
          </div>
        </div>

        <div className="card">
          <div className="card-pad card-head" style={{ marginBottom: 0 }}><h2>Month by month</h2></div>
          <div className="table-wrap" style={{ maxHeight: 420 }}>
            <table>
              <thead><tr><th>Month</th><th className="r hide-sm">Events</th><th className="r">From events</th><th className="r hide-sm">Donations &amp; payouts</th>
                <th className="r">Spent</th><th className="r hide-sm">Discounts</th><th className="r">Balance</th></tr></thead>
              <tbody>
                {[...months].reverse().map((m) => (
                  <tr key={m.month}>
                    <td>{ymLabel(m.month)}</td>
                    <td className="r hide-sm">{m.events}</td>
                    <td className="r">{money0(m.allocated)}</td>
                    <td className="r hide-sm">{m.topups + m.payouts ? money0(m.topups + m.payouts) : '—'}</td>
                    <td className="r">{m.spent ? `−${money0(m.spent)}` : '—'}</td>
                    <td className="r hide-sm">{m.discounts ? `−${money0(m.discounts)}` : '—'}</td>
                    <td className={`r ${m.balance < 0 ? 'neg' : ''}`}><strong>{money0(m.balance)}</strong></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card">
          <div className="card-pad card-head" style={{ marginBottom: 0 }}><div><h2>Spending &amp; donations</h2><p>Money spent from or added straight to the general fund</p></div></div>
          <div className="table-wrap">
            <TxTable rows={r.fundTx} showEvent={false} onEdit={(t) => setForm({ tx: t })} onDelete={del}
              empty="Nothing spent from the general fund yet. Record a purchase with “Record spending”." />
          </div>
        </div>

        {r.payouts.length > 0 && (
          <div className="card">
            <div className="card-pad card-head" style={{ marginBottom: 0 }}><div><h2>Payouts left to the community</h2><p>What people were owed for a month and gave to the general fund instead</p></div></div>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Month</th><th className="hide-sm">Recorded</th><th className="r hide-sm">People</th><th className="r">Amount</th></tr></thead>
                <tbody>
                  {r.payouts.map((p) => (
                    <tr key={`${p.month}-${p.paid_at}`} className="clickable" onClick={() => navigate('/payouts')}>
                      <td>{ymLabel(p.month)}<div className="row-sub show-sm">{date(p.paid_at)}</div></td>
                      <td className="hide-sm">{date(p.paid_at)}</td>
                      <td className="r hide-sm">{p.people}</td>
                      <td className="r">{money0(p.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="card">
          <div className="card-pad card-head" style={{ marginBottom: 0 }}><div><h2>Events</h2><p>Each event’s share for the general fund, and the discounts it paid for them</p></div></div>
          <div className="table-wrap" style={{ maxHeight: 480 }}>
            <table>
              <thead><tr><th className="hide-sm">Date</th><th>Event</th><th className="hide-sm">Sport</th><th className="hide-sm">Status</th>
                <th className="r hide-sm">Profit</th><th className="r">To this fund</th><th className="r">Discounts paid</th></tr></thead>
              <tbody>
                {r.events.map((e) => (
                  <tr key={e.id} className="clickable" onClick={() => navigate(`/events/${e.id}`)}>
                    <td className="hide-sm">{date(e.date)}</td>
                    <td className="cell-wrap">
                      {e.name}
                      <div className="row-sub show-sm">{date(e.date)} · {e.type_name}{e.status !== 'completed' && <> · <StatusBadge status={e.status} /></>}</div>
                    </td>
                    <td className="hide-sm">{e.type_name}</td>
                    <td className="hide-sm"><StatusBadge status={e.status} /></td>
                    <td className={`r hide-sm ${e.profit >= 0 ? 'pos' : 'neg'}`}>{signedMoney(e.profit)}</td>
                    <td className="r">{money0(e.split.general)}</td>
                    <td className="r">{e.fund_paid ? `−${money0(e.fund_paid)}` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {form && (
        <TxForm tx={form.tx} fund="general" defaultKind={form.kind || 'expense'}
          onClose={() => setForm(null)} onSaved={() => { setForm(null); reload(); }} />
      )}
    </div>
  );
}
