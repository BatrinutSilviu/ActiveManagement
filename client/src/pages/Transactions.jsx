import { useState } from 'react';
import { api, qs } from '../api.js';
import { useApi, usePermissions, usePersistentState } from '../hooks.js';
import { money0, MONTHS_LONG, signedMoney } from '../format.js';
import TxForm from '../components/TxForm.jsx';
import TxTable from '../components/TxTable.jsx';
import Kpi from '../components/Kpi.jsx';
import { confirmDelete } from '../components/Modal.jsx';
import { IconDownload, IconPlus } from '../components/Icons.jsx';

export default function Transactions() {
  const { canEdit } = usePermissions();
  const [filters, setFilters] = usePersistentState('am-tx-filters',
    { year: String(new Date().getFullYear()), month: '', kind: '', event_id: '', category: '', q: '' });
  const set = (k) => (e) => setFilters({ ...filters, [k]: e.target.value });
  const { data: rows, loading, reload } = useApi(`/transactions${qs(filters)}`);
  const { data: years } = useApi('/stats/years');
  const { data: categories } = useApi('/categories');
  const [form, setForm] = useState(null);

  const list = rows || [];
  const income = list.filter((t) => t.kind === 'income').reduce((s, t) => s + t.amount, 0);
  const expenses = list.filter((t) => t.kind === 'expense').reduce((s, t) => s + t.amount, 0);

  const del = async (t) => {
    if (!confirmDelete('this transaction')) return;
    await api.del(`/transactions/${t.id}`);
    reload();
  };

  return (
    <div className={loading ? 'loading' : ''}>
      <div className="page-head">
        <div>
          <h1>Transactions</h1>
          <p>Every cost and income line: event costs, plus reinvestments and donations moving money out of or into a fund.</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <a className="btn" href={`/api/export/transactions.csv${qs({ year: filters.year })}`}><IconDownload width="15" />Export CSV</a>
          {canEdit && <button className="btn btn-primary" onClick={() => setForm({ kind: 'expense' })}><IconPlus width="16" />Add transaction</button>}
        </div>
      </div>

      <div className="filters">
        <input type="search" placeholder="Search description or event…" value={filters.q} onChange={set('q')} />
        <select value={filters.year} onChange={set('year')} aria-label="Year">
          <option value="">All years</option>
          {years?.map((y) => <option key={y}>{y}</option>)}
        </select>
        <select value={filters.month} onChange={set('month')} aria-label="Month">
          <option value="">All months</option>
          {MONTHS_LONG.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
        </select>
        <select value={filters.kind} onChange={set('kind')} aria-label="Kind">
          <option value="">Income & expenses</option>
          <option value="income">Income only</option>
          <option value="expense">Expenses only</option>
        </select>
        <select value={filters.event_id} onChange={set('event_id')} aria-label="Scope">
          <option value="">Events & funds</option>
          <option value="general">Fund movements only</option>
        </select>
        <select value={filters.category} onChange={set('category')} aria-label="Category">
          <option value="">All categories</option>
          {categories?.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.kind})</option>)}
        </select>
      </div>

      <div className="grid grid-kpi" style={{ marginBottom: 16 }}>
        <Kpi label="Income (filtered)" value={money0(income)} />
        <Kpi label="Expenses (filtered)" value={money0(expenses)} />
        <Kpi label="Net" value={<span className={income - expenses < 0 ? 'neg' : ''}>{signedMoney(income - expenses)}</span>}
          sub={`${list.length} transactions`} />
      </div>
      <p className="muted" style={{ marginTop: -6 }}>Filtered by each transaction’s own date. Participation fees (people × fee) live on the events, not here.</p>

      <div className="card table-wrap">
        <TxTable rows={list} onEdit={(t) => setForm({ tx: t })} onDelete={del}
          empty={loading ? 'Loading…' : 'No transactions match these filters.'} />
      </div>

      {form && <TxForm tx={form.tx} defaultKind={form.kind} onClose={() => setForm(null)} onSaved={() => { setForm(null); reload(); }} />}
    </div>
  );
}
