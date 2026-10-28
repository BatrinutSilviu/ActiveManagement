import { Link } from 'react-router-dom';
import { date, money } from '../format.js';
import { IconArrowDown, IconArrowUp, IconEdit, IconTrash } from './Icons.jsx';

const GROUP_LABELS = { organizing: 'Organizing', benefit: 'Benefit' };

// Where a transaction belongs: its event, or the fund it moved money in/out of.
function Where({ t }) {
  if (t.event_id) return <Link to={`/events/${t.event_id}`}>{t.event_name}</Link>;
  return <span className="badge">{t.fund_name ? `${t.fund_name} fund` : 'General fund'}</span>;
}

export default function TxTable({ rows, showEvent = true, showGroup = false, compact = false, onEdit, onDelete, empty = 'No transactions yet.' }) {
  if (!rows.length) return <div className="empty">{empty}</div>;
  return (
    <table>
      <thead>
        <tr>
          <th>Date</th><th>Category</th>{showGroup && <th>Type</th>}<th>Description</th>{showEvent && <th>Event / fund</th>}
          {!compact && <th>Method</th>}<th className="r">Amount</th>{!compact && <th>Added by</th>}<th />
        </tr>
      </thead>
      <tbody>
        {rows.map((t) => (
          <tr key={t.id}>
            <td>{date(t.date)}</td>
            <td><span className={`kind-pill ${t.kind}`}>{t.kind === 'income' ? <IconArrowUp /> : <IconArrowDown />}</span>{t.category_name || <span className="muted">Uncategorised</span>}</td>
            {showGroup && <td className="secondary">{t.kind === 'expense' ? GROUP_LABELS[t.cost_group || 'organizing'] : 'Income'}</td>}
            <td className="cell-wrap">{t.description || <span className="muted">—</span>}</td>
            {showEvent && <td><Where t={t} /></td>}
            {!compact && <td className="secondary">{t.payment_method || '—'}</td>}
            <td className={`r kind-${t.kind}`}>{t.kind === 'income' ? '+' : '−'}{money(t.amount)}</td>
            {!compact && <td className="muted">{t.created_by_name || '—'}</td>}
            <td className="r">
              <button className="icon-btn" onClick={() => onEdit(t)} aria-label="Edit"><IconEdit /></button>
              <button className="icon-btn" onClick={() => onDelete(t)} aria-label="Delete"><IconTrash /></button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
