import { Link } from 'react-router-dom';
import { date, money } from '../format.js';
import { usePermissions } from '../hooks.js';
import { IconArrowDown, IconArrowUp, IconEdit, IconTrash } from './Icons.jsx';

const GROUP_LABELS = { organizing: 'Organizing', benefit: 'Benefit' };

// Where a transaction belongs: its event, or the fund it moved money in/out of.
function Where({ t }) {
  if (t.event_id) return <Link to={`/events/${t.event_id}`}>{t.event_name}</Link>;
  return <span className="badge">{t.fund_name ? `${t.fund_name} fund` : 'General fund'}</span>;
}

// On phones (`hide-sm` / `show-sm`) only category, amount and actions stay as columns;
// the date and description move under the category.
export default function TxTable({ rows, showEvent = true, showGroup = false, compact = false, onEdit, onDelete, empty = 'No transactions yet.' }) {
  const { canEdit } = usePermissions();
  if (!rows.length) return <div className="empty">{empty}</div>;
  return (
    <table>
      <thead>
        <tr>
          <th className="hide-sm">Date</th><th>Category</th>{showGroup && <th className="hide-sm">Type</th>}<th className="hide-sm">Description</th>
          {showEvent && <th className="hide-sm">Event / fund</th>}
          {!compact && <th className="hide-sm">Method</th>}<th className="r">Amount</th>{!compact && <th className="hide-sm">Added by</th>}{canEdit && <th />}
        </tr>
      </thead>
      <tbody>
        {rows.map((t) => (
          <tr key={t.id}>
            <td className="hide-sm">{date(t.date)}</td>
            <td>
              <span className={`kind-pill ${t.kind}`}>{t.kind === 'income' ? <IconArrowUp /> : <IconArrowDown />}</span>{t.category_name || <span className="muted">Uncategorised</span>}
              <div className="row-sub show-sm cell-wrap">{date(t.date)}{t.description ? ` · ${t.description}` : ''}{showEvent && <> · <Where t={t} /></>}</div>
            </td>
            {showGroup && <td className="secondary hide-sm">{t.kind === 'expense' ? GROUP_LABELS[t.cost_group || 'organizing'] : 'Income'}</td>}
            <td className="cell-wrap hide-sm">{t.description || <span className="muted">—</span>}</td>
            {showEvent && <td className="hide-sm"><Where t={t} /></td>}
            {!compact && <td className="secondary hide-sm">{t.payment_method || '—'}</td>}
            <td className={`r kind-${t.kind}`}>{t.kind === 'income' ? '+' : '−'}{money(t.amount)}</td>
            {!compact && <td className="muted hide-sm">{t.created_by_name || '—'}</td>}
            {canEdit && (
              <td className="r actions">
                <button className="icon-btn" onClick={() => onEdit(t)} aria-label="Edit"><IconEdit /></button>
                <button className="icon-btn" onClick={() => onDelete(t)} aria-label="Delete"><IconTrash /></button>
              </td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
