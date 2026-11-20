// The practice's dashboard: this month in money, what's owed, sessions to see to, and the year month by month.
// Income is money received (paid invoices and receipts, and other income); expenses are the costs in Transactions.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, qs } from '../../api.js';
import { useAction, useApi, usePermissions } from '../../hooks.js';
import { useBusiness } from '../../business.js';
import { date, money0, MONTHS, MONTHS_LONG, signedMoney } from '../../format.js';
import Kpi from '../../components/Kpi.jsx';
import Select from '../../components/Select.jsx';
import { IncomeExpenseChart } from '../../components/Charts.jsx';
import { IconArrowDown, IconArrowUp, IconCalendar, IconPlus, IconTrend } from '../../components/Icons.jsx';
import { t, tn } from '../../i18n/index.js';
import InvoiceForm from './InvoiceForm.jsx';
import SessionForm from './SessionForm.jsx';
import { SessionCard } from './Sessions.jsx';
import { docLabel, localToday, VENUES } from './common.jsx';

export default function Overview() {
  const { canEdit } = usePermissions();
  const { term, Term } = useBusiness();
  const today = localToday();
  const [year, setYear] = useState(today.slice(0, 4));
  const { data: o, loading, reload } = useApi(`/practice/overview${qs({ year, today })}`);
  const [form, setForm] = useState(null); // { kind: 'session' | 'invoice', … }
  const [err, run] = useAction(reload);
  if (!o) return null;
  const thisMonth = o.year === today.slice(0, 4) ? o.months[Number(today.slice(5, 7)) - 1] : null;
  const total = (k) => o.months.reduce((s, m) => s + m[k], 0);
  const status = (a, s) => {
    const cancel_reason = s === 'cancelled' ? window.prompt(t('Reason for cancelling (optional):')) : null;
    if (cancel_reason === null && s === 'cancelled') return; // closed the prompt: not cancelled
    run(() => api.put(`/appointments/${a.id}/status`, { status: s, cancel_reason }));
  };
  // Not billed yet, per patient: one "Bill" for all of theirs.
  const owing = new Map();
  for (const x of [...o.unbilled.sessions, ...o.unbilled.packages]) {
    const e = owing.get(x.client_id) || { id: x.client_id, name: x.client_name, amount: 0, n: 0 };
    e.amount += x.amount ?? x.price; e.n++;
    owing.set(x.client_id, e);
  }

  return (
    <div className={loading ? 'loading' : ''}>
      <div className="page-head">
        <div><h1>{t('Dashboard')}</h1><p>{t(`Money received, what’s still owed, and the ${term('events')} to see to.`)}</p></div>
        {canEdit && <button className="btn btn-primary" onClick={() => setForm({ kind: 'session' })}><IconPlus width="16" />{t(`New ${term('event')}`)}</button>}
      </div>
      {err && <div className="error-box" style={{ marginBottom: 12 }}>{err}</div>}
      <div className="stack" style={{ gap: 28 }}>
        {thisMonth && (
          <section className="stack">
            <div className="section-head"><h2>{MONTHS_LONG[thisMonth.month - 1]}</h2></div>
            <div className="grid grid-kpi">
              <Kpi label={t('Received')} value={money0(thisMonth.income)} icon={IconArrowUp} tone="income" sub={t('paid invoices, receipts and other income')} />
              <Kpi label={t('Expenses')} value={money0(thisMonth.expenses)} icon={IconArrowDown} tone="expense" />
              <Kpi label={t('Profit')} hero value={signedMoney(thisMonth.profit)} icon={IconTrend} tone="profit" />
              <Kpi label={t(`${Term('events')} done`)} value={thisMonth.sessions} icon={IconCalendar} />
            </div>
          </section>
        )}

        <div className="grid grid-2" style={{ alignItems: 'start' }}>
          <div className="card card-pad">
            <div className="card-head"><div><h2>{t('Not paid yet')} · {money0(o.unpaid.amount)}</h2><p>{t('Invoices and receipts without the paid tick')}</p></div>
              <Link to="/invoices" className="section-link">{t('All')} →</Link></div>
            {o.unpaid.list.length ? o.unpaid.list.slice(0, 8).map((i) => (
              <div key={i.id} className="side-item" style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <input type="checkbox" checked={false} disabled={!canEdit} aria-label={t('Paid')} title={t('Tick when it’s paid (today)')}
                  onChange={() => run(() => api.put(`/invoices/${i.id}/paid`, { paid: true, paid_date: today }))} />
                <div style={{ flex: 1 }}><Link to={`/patients/${i.client_id}`}>{i.client_name || '—'}</Link>
                  <div className="row-sub">{docLabel(i)} · {date(i.date)}</div></div>
                <strong className="neg">{money0(i.amount)}</strong>
              </div>
            )) : <p className="muted" style={{ margin: 0 }}>{t('Everything billed is paid.')}</p>}
          </div>
          <div className="card card-pad">
            <div className="card-head"><div><h2>{t('Not billed yet')} · {money0(o.unbilled.amount)}</h2><p>{t(`${Term('events')} done outside a package, and packages, with no invoice or receipt`)}</p></div></div>
            {owing.size ? [...owing.values()].map((e) => (
              <div key={e.id} className="side-item" style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <div style={{ flex: 1 }}><Link to={`/patients/${e.id}`}>{e.name}</Link><div className="row-sub">{tn(e.n, '{n} item', '{n} items')}</div></div>
                <strong>{money0(e.amount)}</strong>
                {canEdit && <button className="btn btn-sm" onClick={() => setForm({ kind: 'invoice', clientId: e.id })}>{t('Bill')}</button>}
              </div>
            )) : <p className="muted" style={{ margin: 0 }}>{t('Nothing waiting to be billed.')}</p>}
          </div>
        </div>

        <div className="grid grid-2" style={{ alignItems: 'start' }}>
          <div className="card card-pad">
            <div className="card-head"><div><h2>{t('Next 7 days')}</h2><p>{tn(o.upcoming.length, `{n} ${term('event')} booked`, `{n} ${term('events')} booked`)}</p></div>
              <Link to="/sessions" className="section-link">{t('Schedule')} →</Link></div>
            {o.upcoming.length ? <div className="stack" style={{ gap: 8 }}>{o.upcoming.map((a) => (
              <SessionCard key={a.id} a={a} canEdit={canEdit} showDate onOpen={() => canEdit && setForm({ kind: 'session', session: a })} onDone={() => status(a, 'done')} />
            ))}</div> : <p className="muted" style={{ margin: 0 }}>{t('Nothing booked.')}</p>}
          </div>
          <div className="stack">
            {o.toConfirm.length > 0 && (
              <div className="card card-pad">
                <div className="card-head"><div><h2>{t('Did these happen?')}</h2><p>{t(`Past ${term('events')} still marked scheduled: mark them done or cancelled`)}</p></div></div>
                {o.toConfirm.map((a) => (
                  <div key={a.id} className="side-item" style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: 160 }}><Link to={`/patients/${a.client_id}`}>{a.client_name}</Link>
                      <div className="row-sub">{date(a.date)}{a.start_time ? ` · ${a.start_time}` : ''}{a.type_name ? ` · ${a.type_name}` : ''}{a.venue === 'practice' ? ` · ${a.location || t(VENUES.practice)}` : ''}</div></div>
                    {canEdit && <>
                      <button className="btn btn-sm" onClick={() => status(a, 'done')}>{t('Done')}</button>
                      <button className="btn btn-sm" onClick={() => status(a, 'cancelled')}>{t('Cancelled')}</button>
                    </>}
                  </div>
                ))}
              </div>
            )}
            {o.lowPackages.length > 0 && (
              <div className="card card-pad">
                <div className="card-head"><div><h2>{t('Packages nearly used up')}</h2><p>{t('Time to offer a new one')}</p></div></div>
                {o.lowPackages.map((p) => (
                  <div key={p.id} className="side-item" style={{ display: 'flex', gap: 10 }}>
                    <div style={{ flex: 1 }}><Link to={`/patients/${p.client_id}`}>{p.client_name}</Link><div className="row-sub">{p.name}</div></div>
                    <span className="secondary">{t('{left} left to book · {n} not done', { left: p.left, n: p.sessions - p.used })}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <section className="stack">
          <div className="section-head row">
            <div><h2>{t('{year} month by month', { year: o.year })}</h2>
              <p>{t(`Received {income} · expenses {expenses} · profit {profit} · {n} ${term('events')} done`, { income: money0(total('income')), expenses: money0(total('expenses')), profit: signedMoney(total('profit')), n: total('sessions') })}</p></div>
            <div style={{ width: 130 }}>
              <Select value={o.year} onChange={(e) => setYear(e.target.value)} aria-label={t('Year')}>
                {o.years.map((y) => <option key={y}>{y}</option>)}
              </Select>
            </div>
          </div>
          <div className="card card-pad">
            <IncomeExpenseChart data={o.months} xKey="month" xFormat={(m) => MONTHS[m - 1]} />
          </div>
          <div className="card table-wrap">
            <table>
              <thead><tr><th>{t('Month')}</th><th className="r">{t(Term('events'))}</th><th className="r">{t('Received')}</th><th className="r">{t('Expenses')}</th><th className="r">{t('Profit')}</th></tr></thead>
              <tbody>
                {o.months.filter((m) => m.income || m.expenses || m.sessions).map((m) => (
                  <tr key={m.month}>
                    <td>{MONTHS_LONG[m.month - 1]}</td><td className="r">{m.sessions}</td><td className="r">{money0(m.income)}</td>
                    <td className="r">{money0(m.expenses)}</td><td className={`r ${m.profit < 0 ? 'neg' : 'pos'}`}>{signedMoney(m.profit)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!o.months.some((m) => m.income || m.expenses || m.sessions) && <div className="empty">{t('Nothing in {year} yet.', { year: o.year })}</div>}
          </div>
        </section>
      </div>
      {form?.kind === 'session' && <SessionForm session={form.session} onClose={() => setForm(null)} onSaved={() => { setForm(null); reload(); }} />}
      {form?.kind === 'invoice' && <InvoiceForm clientId={form.clientId} select="all" onClose={() => setForm(null)} onSaved={() => { setForm(null); reload(); }} />}
    </div>
  );
}
