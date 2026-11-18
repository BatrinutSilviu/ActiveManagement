// Invoices and receipts issued (recorded only — nothing is sent anywhere), with a tick for paid.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, qs } from '../../api.js';
import { useAction, useApi, usePermissions, usePersistentState } from '../../hooks.js';
import { useBusiness } from '../../business.js';
import { date, money0 } from '../../format.js';
import Kpi from '../../components/Kpi.jsx';
import { confirmDelete } from '../../components/Modal.jsx';
import Select from '../../components/Select.jsx';
import { IconEdit, IconPlus, IconTrash } from '../../components/Icons.jsx';
import InvoiceForm from './InvoiceForm.jsx';
import { docLabel, KIND_LABELS, localToday } from './common.jsx';

export default function Invoices() {
  const { canEdit } = usePermissions();
  const { term, Term } = useBusiness();
  const [filters, setFilters] = usePersistentState('am-invoice-filters', { year: localToday().slice(0, 4), paid: '', kind: '' });
  const set = (k) => (e) => setFilters({ ...filters, [k]: e.target.value });
  const { data, loading, reload } = useApi(`/invoices${qs(filters)}`);
  const [form, setForm] = useState(null); // { invoiceId? }
  const [err, run] = useAction(reload);
  const list = data || [];
  const sum = (rows) => rows.reduce((s, i) => s + i.amount, 0);
  const unpaid = list.filter((i) => !i.paid);
  const years = Array.from({ length: 5 }, (_, i) => String(Number(localToday().slice(0, 4)) - i));
  const tick = (i, paid) => run(() => api.put(`/invoices/${i.id}/paid`, { paid, paid_date: localToday() }));
  const del = (i) => confirmDelete(`${docLabel(i).toLowerCase()} (its ${term('events')} and packages become “not billed” again)`)
    && run(() => api.del(`/invoices/${i.id}`));

  return (
    <div className={loading ? 'loading' : ''}>
      <div className="page-head">
        <div><h1>Invoices &amp; receipts</h1><p>What you issued, and whether it’s paid. Ticking “paid” adds the money on the day it was paid.</p></div>
        {canEdit && <button className="btn btn-primary" onClick={() => setForm({})}><IconPlus width="16" />New invoice or receipt</button>}
      </div>
      <div className="filters">
        <Select value={filters.year} onChange={set('year')} aria-label="Year">
          <option value="">All years</option>
          {years.map((y) => <option key={y}>{y}</option>)}
        </Select>
        <Select value={filters.paid} onChange={set('paid')} aria-label="Paid">
          <option value="">Paid and not paid</option>
          <option value="0">Not paid</option>
          <option value="1">Paid</option>
        </Select>
        <Select value={filters.kind} onChange={set('kind')} aria-label="Kind">
          <option value="">Invoices and receipts</option>
          {Object.entries(KIND_LABELS).map(([k, l]) => <option key={k} value={k}>{l}s</option>)}
        </Select>
      </div>
      <div className="grid grid-kpi" style={{ marginBottom: 16 }}>
        <Kpi label="Issued" value={money0(sum(list))} sub={`${list.length} documents`} />
        <Kpi label="Paid" value={money0(sum(list) - sum(unpaid))} />
        <Kpi label="Not paid yet" value={<span className={unpaid.length ? 'neg' : ''}>{money0(sum(unpaid))}</span>} sub={`${unpaid.length} documents`} />
      </div>
      {err && <div className="error-box" style={{ marginBottom: 12 }}>{err}</div>}
      <div className="card table-wrap">
        {list.length ? (
          <table>
            <thead><tr>
              <th style={{ width: 1 }}>Paid</th><th>Document</th><th className="hide-sm">{Term('person')}</th><th className="hide-sm">Covers</th>
              <th className="r">Amount</th>{canEdit && <th />}
            </tr></thead>
            <tbody>
              {list.map((i) => (
                <tr key={i.id}>
                  <td><input type="checkbox" checked={!!i.paid} disabled={!canEdit} onChange={(e) => tick(i, e.target.checked)}
                    aria-label={`${docLabel(i)} paid`} title={i.paid ? `Paid on ${date(i.paid_date)}` : 'Not paid yet'} /></td>
                  <td>
                    <div className="row-title">{docLabel(i)}</div>
                    <div className="row-sub">{date(i.date)}{i.paid ? ` · paid ${date(i.paid_date)}${i.payment_method ? `, ${i.payment_method.toLowerCase()}` : ''}` : ''}</div>
                    <div className="row-sub show-sm">{i.client_name}</div>
                  </td>
                  <td className="hide-sm">{i.client_id ? <Link to={`/patients/${i.client_id}`}>{i.client_name}</Link> : <span className="muted">—</span>}</td>
                  <td className="hide-sm cell-wrap secondary">
                    {[i.sessions ? `${i.sessions} ${i.sessions === 1 ? term('event') : term('events')}` : null, i.package_names, i.description].filter(Boolean).join(' · ') || '—'}
                  </td>
                  <td className={`r ${i.paid ? '' : 'neg'}`}>{money0(i.amount)}</td>
                  {canEdit && <td className="r actions">
                    <button className="icon-btn" aria-label="Edit" onClick={() => setForm({ invoiceId: i.id })}><IconEdit /></button>
                    <button className="icon-btn" aria-label="Delete" onClick={() => del(i)}><IconTrash /></button>
                  </td>}
                </tr>
              ))}
            </tbody>
          </table>
        ) : <div className="empty">{loading ? 'Loading…' : 'None match these filters.'}</div>}
      </div>
      {form && <InvoiceForm invoiceId={form.invoiceId} onClose={() => setForm(null)} onSaved={() => { setForm(null); reload(); }} />}
    </div>
  );
}
