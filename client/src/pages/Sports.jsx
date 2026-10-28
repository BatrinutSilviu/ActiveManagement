import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useApi, useChartColors } from '../hooks.js';
import { date, money, money0, MONTHS, signedMoney } from '../format.js';
import Kpi from '../components/Kpi.jsx';
import TxForm from '../components/TxForm.jsx';
import TxTable from '../components/TxTable.jsx';
import { confirmDelete } from '../components/Modal.jsx';
import { BalanceLine, GroupedBars } from '../components/Charts.jsx';
import { IconPlus, IconTrend } from '../components/Icons.jsx';
import { StatusBadge } from './Events.jsx';

const ymLabel = (ym) => `${MONTHS[Number(ym.slice(5, 7)) - 1]} ${ym.slice(2, 4)}`;

export function SportsList() {
  const navigate = useNavigate();
  const { data: sports, reload } = useApi('/sports/summary');
  const { data: funds, reload: reloadFunds } = useApi('/funds');
  const [form, setForm] = useState(null);
  if (!sports || !funds) return null;
  const sorted = [...sports].sort((a, b) => b.totalEvents - a.totalEvents || a.name.localeCompare(b.name));

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Sports</h1>
          <p>Each sport’s reinvestment fund: what its events earned for it, what was reinvested, and what is left.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setForm({ fund: 'general' })}><IconPlus width="16" />Record reinvestment</button>
      </div>
      <div className="stack">
        <div className="grid grid-kpi">
          <Kpi label="Left to reinvest (all sports)" hero value={money0(funds.sportsTotal.balance)}
            sub={`${money0(funds.sportsTotal.allocated)} earned · ${money0(funds.sportsTotal.reinvested)} reinvested`} />
          <Kpi label="General community fund" icon={IconTrend} tone="profit" value={money0(funds.general.balance)}
            sub={`${money0(funds.general.reinvested)} spent so far`} />
        </div>
        <div className="sport-grid">
          {sorted.map((s) => {
            const used = s.allocated + s.topups > 0 ? Math.min(s.reinvested / (s.allocated + s.topups), 1) : 0;
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
  if (error) return <div className="error-box">{error}</div>;
  if (!r) return null;
  const { sport, fund, months } = r;
  const recent = months.slice(-18).map((m) => ({ ...m, label: ymLabel(m.month) }));
  const finalized = r.events.filter((e) => e.status === 'completed');
  const del = async (t) => {
    if (!confirmDelete('this fund movement')) return;
    await api.del(`/transactions/${t.id}`);
    reload();
  };

  return (
    <div>
      <div style={{ marginBottom: 10 }}><Link to="/sports">← Sports</Link></div>
      <div className="page-head">
        <div>
          <h1>{sport.name}</h1>
          <p>{finalized.length} finalized events · {money0(finalized.reduce((s, e) => s + e.income, 0))} income ·
            {' '}{signedMoney(finalized.reduce((s, e) => s + e.profit, 0))} profit</p>
        </div>
        <div className="page-actions">
          <button className="btn" onClick={() => setForm({ kind: 'income' })}>Add money</button>
          <button className="btn btn-primary" onClick={() => setForm({ kind: 'expense' })}><IconPlus width="16" />Record reinvestment</button>
        </div>
      </div>

      <div className="stack">
        <div className="grid grid-kpi">
          <Kpi label="Left to reinvest" hero value={money0(fund.balance)} sub={fund.pending ? `${signedMoney(fund.pending)} pending from live events` : 'available now'} />
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
              <thead><tr><th>Month</th><th className="r">Events</th><th className="r">Income</th><th className="r">Profit</th><th className="r">Added to fund</th><th className="r">Reinvested</th><th className="r">Balance</th></tr></thead>
              <tbody>
                {[...months].reverse().map((m) => (
                  <tr key={m.month}>
                    <td>{ymLabel(m.month)}</td>
                    <td className="r">{m.events}</td>
                    <td className="r">{money0(m.income)}</td>
                    <td className={`r ${m.profit < 0 ? 'neg' : ''}`}>{signedMoney(m.profit)}</td>
                    <td className="r">{money0(m.allocated + m.topups)}</td>
                    <td className="r">{m.reinvested ? `−${money0(m.reinvested)}` : '—'}</td>
                    <td className={`r ${m.balance < 0 ? 'neg' : ''}`}><strong>{money0(m.balance)}</strong></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

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
              <thead><tr><th>Date</th><th>Event</th><th>Status</th><th className="r">People</th><th className="r">Income</th><th className="r">Profit</th><th className="r">To this fund</th></tr></thead>
              <tbody>
                {r.events.map((e) => (
                  <tr key={e.id} className="clickable" onClick={() => navigate(`/events/${e.id}`)}>
                    <td>{date(e.date)}</td>
                    <td>{e.name}</td>
                    <td><StatusBadge status={e.status} /></td>
                    <td className="r">{e.participants}</td>
                    <td className="r">{money0(e.income)}</td>
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
        <TxForm tx={form.tx} fund={Number(id)} defaultKind={form.kind || 'expense'}
          onClose={() => setForm(null)} onSaved={() => { setForm(null); reload(); }} />
      )}
    </div>
  );
}
