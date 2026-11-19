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
import { t, tn } from '../i18n/index.js';

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
          <h1>{t('Sports')}</h1>
          <p>{t('The general community fund and each sport’s reinvestment fund: what their events earned for them, what was reinvested, and what is left. Click one for its details.')}</p>
        </div>
        {canEdit && <button className="btn btn-primary" onClick={() => setForm({ fund: 'general' })}><IconPlus width="16" />{t('Record reinvestment')}</button>}
      </div>
      <div className="stack">
        <div className="grid grid-kpi">
          <Kpi label={t('Left to reinvest (all sports)')} hero value={money0(funds.sportsTotal.balance)}
            sub={`${t('{amount} earned', { amount: money0(funds.sportsTotal.allocated) })} · ${t('{amount} reinvested', { amount: money0(funds.sportsTotal.reinvested) })}`} />
          <Kpi label={t('General community fund')} icon={IconTrend} tone="profit" value={money0(funds.general.balance)}
            sub={t('{amount} spent so far', { amount: money0(funds.general.reinvested) })} />
        </div>
        <div className="sport-grid">
          <button className="card sport-card" onClick={() => navigate('/sports/general')}>
            <div className="sport-card-top">
              <h2>{t('General fund')}</h2>
              <span className="muted">{t('all events')}</span>
            </div>
            <div className={`sport-balance ${funds.general.balance < 0 ? 'neg' : ''}`}>{money0(funds.general.balance)}</div>
            <div className="muted" style={{ fontSize: 12.5 }}>{t('left to spend')}</div>
            <div className="progress" style={{ margin: '12px 0 8px' }}>
              <div style={{ width: `${(() => { const g = funds.general, inn = g.starting + g.allocated + g.topups; return inn > 0 ? Math.min(g.reinvested / inn, 1) * 100 : 0; })()}%`, background: 'var(--reinvested)' }} />
            </div>
            <div className="sport-card-foot">
              <span>{t('{amount} added', { amount: money0(funds.general.allocated + funds.general.topups) })}</span>
              <span>{t('{amount} spent', { amount: money0(funds.general.reinvested) })}</span>
            </div>
          </button>
          {sorted.map((s) => {
            const used = s.starting + s.allocated + s.topups > 0 ? Math.min(s.reinvested / (s.starting + s.allocated + s.topups), 1) : 0;
            return (
              <button className="card sport-card" key={s.id} onClick={() => navigate(`/sports/${s.id}`)}>
                <div className="sport-card-top">
                  <h2>{s.name}</h2>
                  <span className="muted">{tn(s.totalEvents, '{n} event', '{n} events')}{s.liveEvents ? ` · ${t('{n} live', { n: s.liveEvents })}` : ''}</span>
                </div>
                <div className={`sport-balance ${s.balance < 0 ? 'neg' : ''}`}>{money0(s.balance)}</div>
                <div className="muted" style={{ fontSize: 12.5 }}>{t('left to reinvest')}</div>
                <div className="progress" style={{ margin: '12px 0 8px' }} title={t('{pct}% reinvested', { pct: Math.round(used * 100) })}>
                  <div style={{ width: `${used * 100}%`, background: 'var(--reinvested)' }} />
                </div>
                <div className="sport-card-foot">
                  <span>{t('{amount} earned', { amount: money0(s.allocated) })}</span>
                  <span>{t('{amount} reinvested', { amount: money0(s.reinvested) })}</span>
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
    const name = window.prompt(t('Name of the new part of the {sport} fund (e.g. Active Padel Academy):', { sport: sport.name }));
    if (!name?.trim()) return;
    try { await api.post('/fund-parts', { sport_id: sport.id, name }); reload(); } catch (e) { window.alert(e.message); }
  };
  const delPart = async (p) => {
    if (!window.confirm(t('Stop counting “{part}” apart? Its {n} movements stay in the {sport} fund.', { part: p.name, n: p.count, sport: sport.name }))) return;
    await api.del(`/fund-parts/${p.id}`);
    reload();
  };
  const del = async (tx) => {
    if (!confirmDelete(t('this fund movement'))) return;
    await api.del(`/transactions/${tx.id}`);
    reload();
  };

  return (
    <div>
      <Link to="/sports" className="back-link"><IconChevronLeft width="16" height="16" />{t('Sports')}</Link>
      <div className="page-head">
        <div>
          <h1>{sport.name}</h1>
          <p>{tn(finalized.length, '{n} finalized event', '{n} finalized events')} · {t('{amount} income', { amount: money0(finalized.reduce((s, e) => s + e.income, 0)) })} ·
            {' '}{t('{amount} profit', { amount: signedMoney(finalized.reduce((s, e) => s + e.profit, 0)) })}</p>
        </div>
        {canEdit && (
          <div className="page-actions">
            <button className="btn" onClick={() => setForm({ kind: 'income' })}>{t('Add money')}</button>
            <button className="btn btn-primary" onClick={() => setForm({ kind: 'expense' })}><IconPlus width="16" />{t('Record reinvestment')}</button>
          </div>
        )}
      </div>

      <div className="stack">
        <div className="grid grid-kpi">
          <Kpi label={t('Left to reinvest')} hero value={money0(fund.balance)} sub={[fund.starting && t('incl. {amount} starting balance', { amount: money0(fund.starting) }), fund.pending ? t('{amount} pending from live events', { amount: signedMoney(fund.pending) }) : t('available now'),
            r.openVouchers?.n > r.openVouchers?.pct && tn(r.openVouchers.n - r.openVouchers.pct, '{amount} in {n} unused voucher still to pay', '{amount} in {n} unused vouchers still to pay', { amount: money0(r.openVouchers.value) }),
            r.openVouchers?.pct && tn(r.openVouchers.pct, '{n} % off voucher not used yet', '{n} % off vouchers not used yet')].filter(Boolean).join(' · ')} />
          <Kpi label={t('Earned for the fund')} icon={IconTrend} tone="profit" value={money0(fund.allocated)} sub={tn(fund.events, 'from {n} finalized event', 'from {n} finalized events')} />
          <Kpi label={t('Reinvested')} value={money0(fund.reinvested)} sub={fund.topups ? t('+{amount} added directly', { amount: money0(fund.topups) }) : tn(r.fundTx.filter((x) => x.kind === 'expense').length, '{n} purchase', '{n} purchases')} />
        </div>

        <div className="grid grid-2">
          <div className="card card-pad">
            <div className="card-head"><div><h2>{t('Earned vs. reinvested per month')}</h2><p>{t('Last {n} months with activity', { n: recent.length })}</p></div></div>
            {recent.length ? (
              <GroupedBars data={recent} xKey="label" height={250} series={[
                { key: 'allocated', name: t('Added to fund'), color: c.sportfund },
                { key: 'reinvested', name: t('Reinvested'), color: c.reinvested },
              ]} extraRows={(d) => [{ name: t('Balance after'), value: money(d.balance) }]} />
            ) : <div className="empty">{t('No activity yet')}</div>}
          </div>
          <div className="card card-pad">
            <div className="card-head"><div><h2>{t('Fund balance over time')}</h2><p>{t('What was left to reinvest at the end of each month')}</p></div></div>
            {recent.length ? <BalanceLine data={recent} xKey="label" yKey="balance" height={278} name={t('Left to reinvest')} /> : <div className="empty">{t('No activity yet')}</div>}
          </div>
        </div>

        <div className="card">
          <div className="card-pad card-head" style={{ marginBottom: 0 }}><h2>{t('Month by month')}</h2></div>
          <div className="table-wrap" style={{ maxHeight: 420 }}>
            <table>
              <thead><tr><th>{t('Month')}</th><th className="r hide-sm">{t('Events')}</th><th className="r hide-sm">{t('Income')}</th><th className="r hide-sm">{t('Profit')}</th><th className="r">{t('Added to fund')}</th><th className="r">{t('Reinvested')}</th><th className="r">{t('Balance')}</th></tr></thead>
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
              <div><h2>{t('Parts of the fund')}</h2><p>{t('Paid from the {sport} fund, but counted apart', { sport: sport.name })}</p></div>
              {canEdit && <button className="btn btn-sm" onClick={addPart}><IconPlus width="14" />{t('Add a part')}</button>}
            </div>
            <div className="table-wrap">
              {r.parts.length ? (
                <table>
                  <thead><tr><th>{t('Part')}</th><th className="r hide-sm">{t('Movements')}</th><th className="r">{t('Spent')}</th><th className="r hide-sm">{t('Added')}</th>{canEdit && <th />}</tr></thead>
                  <tbody>
                    {r.parts.map((p) => (
                      <tr key={p.id}>
                        <td><strong>{p.name}</strong><div className="row-sub show-sm">{tn(p.count, '{n} movement', '{n} movements')}</div></td>
                        <td className="r hide-sm">{p.count}</td>
                        <td className="r"><strong>{p.spent ? `−${money(p.spent)}` : '—'}</strong></td>
                        <td className="r hide-sm">{p.added ? `+${money(p.added)}` : '—'}</td>
                        {canEdit && (
                          <td className="r actions">
                            <button className="btn btn-sm" onClick={() => setForm({ kind: 'expense', part: p.id })}><span className="hide-sm">{t('Record spending')}</span><span className="show-sm">{t('Spend')}</span></button>
                            <button className="icon-btn" aria-label={t('Remove part')} onClick={() => delPart(p)}><IconTrash /></button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : <div className="empty">{t('No parts. Add one to count a project’s spending apart, e.g. an academy.')}</div>}
            </div>
          </div>
        )}

        <div className="card">
          <div className="card-pad card-head" style={{ marginBottom: 0 }}><div><h2>{t('Reinvestments & fund movements')}</h2><p>{t('Purchases paid from this sport’s fund')}</p></div></div>
          <div className="table-wrap">
            <TxTable rows={r.fundTx} showEvent={false} onEdit={(tx) => setForm({ tx })} onDelete={del}
              empty={t('Nothing reinvested yet. Record a purchase with “Record reinvestment”.')} />
          </div>
        </div>

        <div className="card">
          <div className="card-pad card-head" style={{ marginBottom: 0 }}><h2>{t('Events')}</h2></div>
          <div className="table-wrap" style={{ maxHeight: 480 }}>
            <table>
              <thead><tr><th className="hide-sm">{t('Date')}</th><th>{t('Event')}</th><th className="hide-sm">{t('Status')}</th><th className="r hide-sm">{t('People')}</th><th className="r hide-sm">{t('Income')}</th><th className="r">{t('Profit')}</th><th className="r">{t('To this fund')}</th></tr></thead>
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
  const del = async (tx) => {
    if (!confirmDelete(t('this fund movement'))) return;
    await api.del(`/transactions/${tx.id}`);
    reload();
  };
  const fromPayouts = r.payouts.reduce((a, p) => a + p.amount, 0);
  const v = r.openVouchers;

  return (
    <div>
      <Link to="/sports" className="back-link"><IconChevronLeft width="16" height="16" />{t('Sports')}</Link>
      <div className="page-head">
        <div>
          <h1>{t('General community fund')}</h1>
          <p>{t('Gets the general share of every finalized event (all of the community share for events that aren’t a sport), payouts left to the community and donations.')}
            {' '}{t('It pays for the community’s own spending and for the discounts given at events.')}</p>
        </div>
        {canEdit && (
          <div className="page-actions">
            <button className="btn" onClick={() => setForm({ kind: 'income' })}>{t('Add money')}</button>
            <button className="btn btn-primary" onClick={() => setForm({ kind: 'expense' })}><IconPlus width="16" />{t('Record spending')}</button>
          </div>
        )}
      </div>

      <div className="stack">
        <div className="grid grid-kpi">
          <Kpi label={t('Left to spend')} hero value={money0(fund.balance)} sub={[fund.starting && t('incl. {amount} starting balance', { amount: money0(fund.starting) }),
            fund.pending ? t('{amount} pending from live events', { amount: signedMoney(fund.pending) }) : t('available now'),
            v?.n > v?.pct && tn(v.n - v.pct, '{amount} in {n} unused voucher still to pay', '{amount} in {n} unused vouchers still to pay', { amount: money0(v.value) })].filter(Boolean).join(' · ')} />
          <Kpi label={t('Earned from events')} icon={IconTrend} tone="profit" value={money0(fund.allocated - fromPayouts)} sub={tn(fund.events, 'from {n} finalized event', 'from {n} finalized events')} />
          <Kpi label={t('Donations & payouts left to it')} value={money0(fund.topups + fromPayouts)}
            sub={t('{topups} added directly · {payouts} from payouts', { topups: money0(fund.topups), payouts: money0(fromPayouts) })} />
          <Kpi label={t('Spent')} value={money0(fund.reinvested)} sub={t('{spending} spending · {discounts} event discounts', { spending: money0(fund.reinvested - fund.discounts), discounts: money0(fund.discounts) })} />
        </div>

        <div className="grid grid-2">
          <div className="card card-pad">
            <div className="card-head"><div><h2>{t('Added vs. spent per month')}</h2><p>{t('Last {n} months with activity', { n: recent.length })}</p></div></div>
            {recent.length ? (
              <GroupedBars data={recent} xKey="label" height={250} series={[
                { key: 'added', name: t('Added to fund'), color: c.general },
                { key: 'reinvested', name: t('Spent'), color: c.reinvested },
              ]} extraRows={(d) => [{ name: t('Balance after'), value: money(d.balance) }]} />
            ) : <div className="empty">{t('No activity yet')}</div>}
          </div>
          <div className="card card-pad">
            <div className="card-head"><div><h2>{t('Fund balance over time')}</h2><p>{t('What was left at the end of each month')}</p></div></div>
            {recent.length ? <BalanceLine data={recent} xKey="label" yKey="balance" height={278} name={t('Left to spend')} /> : <div className="empty">{t('No activity yet')}</div>}
          </div>
        </div>

        <div className="card">
          <div className="card-pad card-head" style={{ marginBottom: 0 }}><h2>{t('Month by month')}</h2></div>
          <div className="table-wrap" style={{ maxHeight: 420 }}>
            <table>
              <thead><tr><th>{t('Month')}</th><th className="r hide-sm">{t('Events')}</th><th className="r">{t('From events')}</th><th className="r hide-sm">{t('Donations & payouts')}</th>
                <th className="r">{t('Spent')}</th><th className="r hide-sm">{t('Discounts')}</th><th className="r">{t('Balance')}</th></tr></thead>
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
          <div className="card-pad card-head" style={{ marginBottom: 0 }}><div><h2>{t('Spending & donations')}</h2><p>{t('Money spent from or added straight to the general fund')}</p></div></div>
          <div className="table-wrap">
            <TxTable rows={r.fundTx} showEvent={false} onEdit={(tx) => setForm({ tx })} onDelete={del}
              empty={t('Nothing spent from the general fund yet. Record a purchase with “Record spending”.')} />
          </div>
        </div>

        {r.payouts.length > 0 && (
          <div className="card">
            <div className="card-pad card-head" style={{ marginBottom: 0 }}><div><h2>{t('Payouts left to the community')}</h2><p>{t('What people were owed for a month and gave to the general fund instead')}</p></div></div>
            <div className="table-wrap">
              <table>
                <thead><tr><th>{t('Month')}</th><th className="hide-sm">{t('Recorded')}</th><th className="r hide-sm">{t('People')}</th><th className="r">{t('Amount')}</th></tr></thead>
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
          <div className="card-pad card-head" style={{ marginBottom: 0 }}><div><h2>{t('Events')}</h2><p>{t('Each event’s share for the general fund, and the discounts it paid for them')}</p></div></div>
          <div className="table-wrap" style={{ maxHeight: 480 }}>
            <table>
              <thead><tr><th className="hide-sm">{t('Date')}</th><th>{t('Event')}</th><th className="hide-sm">{t('Sport')}</th><th className="hide-sm">{t('Status')}</th>
                <th className="r hide-sm">{t('Profit')}</th><th className="r">{t('To this fund')}</th><th className="r">{t('Discounts paid')}</th></tr></thead>
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
