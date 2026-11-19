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
import { t, tn } from '../../i18n/index.js';
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
  const del = (i) => confirmDelete(t(`{doc} (its ${term('events')} and packages become “not billed” again)`, { doc: docLabel(i)[0].toLowerCase() + docLabel(i).slice(1) }))
    && run(() => api.del(`/invoices/${i.id}`));

  return (
    <div className={loading ? 'loading' : ''}>
      <div className="page-head">
        <div><h1>{t('Invoices & receipts')}</h1><p>{t('What you issued, and whether it’s paid. Ticking “paid” adds the money on the day it was paid.')}</p></div>
        {canEdit && <button className="btn btn-primary" onClick={() => setForm({})}><IconPlus width="16" />{t('New invoice or receipt')}</button>}
      </div>
      <div className="filters">
        <Select value={filters.year} onChange={set('year')} aria-label={t('Year')}>
          <option value="">{t('All years')}</option>
          {years.map((y) => <option key={y}>{y}</option>)}
        </Select>
        <Select value={filters.paid} onChange={set('paid')} aria-label={t('Paid')}>
          <option value="">{t('Paid and not paid')}</option>
          <option value="0">{t('Not paid')}</option>
          <option value="1">{t('Paid')}</option>
        </Select>
        <Select value={filters.kind} onChange={set('kind')} aria-label={t('Kind')}>
          <option value="">{t('Invoices and receipts')}</option>
          {Object.entries(KIND_LABELS).map(([k, l]) => <option key={k} value={k}>{t(`${l}s`)}</option>)}
        </Select>
      </div>
      <div className="grid grid-kpi" style={{ marginBottom: 16 }}>
        <Kpi label={t('Issued')} value={money0(sum(list))} sub={tn(list.length, '{n} document', '{n} documents')} />
        <Kpi label={t('Paid')} value={money0(sum(list) - sum(unpaid))} />
        <Kpi label={t('Not paid yet')} value={<span className={unpaid.length ? 'neg' : ''}>{money0(sum(unpaid))}</span>} sub={tn(unpaid.length, '{n} document', '{n} documents')} />
      </div>
      {err && <div className="error-box" style={{ marginBottom: 12 }}>{err}</div>}
      <div className="card table-wrap">
        {list.length ? (
          <table>
            <thead><tr>
              <th style={{ width: 1 }}>{t('Paid')}</th><th>{t('Document')}</th><th className="hide-sm">{t(Term('person'))}</th><th className="hide-sm">{t('Covers')}</th>
              <th className="r">{t('Amount')}</th>{canEdit && <th />}
            </tr></thead>
            <tbody>
              {list.map((i) => (
                <tr key={i.id}>
                  <td><input type="checkbox" checked={!!i.paid} disabled={!canEdit} onChange={(e) => tick(i, e.target.checked)}
                    aria-label={t('{doc} paid', { doc: docLabel(i) })} title={i.paid ? t('Paid on {date}', { date: date(i.paid_date) }) : t('Not paid yet')} /></td>
                  <td>
                    <div className="row-title">{docLabel(i)}</div>
                    <div className="row-sub">{date(i.date)}{i.paid ? ` · ${t('paid {date}', { date: date(i.paid_date) })}${i.payment_method ? `, ${t(i.payment_method).toLowerCase()}` : ''}` : ''}</div>
                    <div className="row-sub show-sm">{i.client_name}</div>
                  </td>
                  <td className="hide-sm">{i.client_id ? <Link to={`/patients/${i.client_id}`}>{i.client_name}</Link> : <span className="muted">—</span>}</td>
                  <td className="hide-sm cell-wrap secondary">
                    {[i.sessions ? tn(i.sessions, `{n} ${term('event')}`, `{n} ${term('events')}`) : null, i.package_names, i.description].filter(Boolean).join(' · ') || '—'}
                  </td>
                  <td className={`r ${i.paid ? '' : 'neg'}`}>{money0(i.amount)}</td>
                  {canEdit && <td className="r actions">
                    <button className="icon-btn" aria-label={t('Edit')} onClick={() => setForm({ invoiceId: i.id })}><IconEdit /></button>
                    <button className="icon-btn" aria-label={t('Delete')} onClick={() => del(i)}><IconTrash /></button>
                  </td>}
                </tr>
              ))}
            </tbody>
          </table>
        ) : <div className="empty">{loading ? t('Loading…') : t('None match these filters.')}</div>}
      </div>
      {form && <InvoiceForm invoiceId={form.invoiceId} onClose={() => setForm(null)} onSaved={() => { setForm(null); reload(); }} />}
    </div>
  );
}
