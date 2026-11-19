import { Link } from 'react-router-dom';
import { date, money } from '../format.js';
import { usePermissions } from '../hooks.js';
import { IconArrowDown, IconArrowUp, IconEdit, IconTrash } from './Icons.jsx';
import { t as tr } from '../i18n/index.js';

const GROUP_LABELS = { organizing: 'Organizing', benefit: 'Benefit' };

// Where a transaction belongs: its event, or the fund it moved money in/out of.
function Where({ t }) {
  if (t.event_id) return <Link to={`/events/${t.event_id}`}>{t.event_name}</Link>;
  return <span className="badge">{t.fund_name ? tr('{name} fund', { name: t.fund_name }) : tr('General fund')}{t.part_name ? ` · ${t.part_name}` : ''}</span>;
}

// On phones (`hide-sm` / `show-sm`) only category, amount and actions stay as columns;
// the date and description move under the category.
export default function TxTable({ rows, showEvent = true, showGroup = false, compact = false, onEdit, onDelete, empty }) {
  const { canEdit } = usePermissions();
  if (!rows.length) return <div className="empty">{empty ?? tr('No transactions yet.')}</div>;
  return (
    <table>
      <thead>
        <tr>
          <th className="hide-sm">{tr('Date')}</th><th>{tr('Category')}</th>{showGroup && <th className="hide-sm">{tr('Type')}</th>}<th className="hide-sm">{tr('Description')}</th>
          {showEvent && <th className="hide-sm">{tr('Event / fund')}</th>}
          {!compact && <th className="hide-sm">{tr('Method')}</th>}<th className="r">{tr('Amount')}</th>{!compact && <th className="hide-sm">{tr('Added by')}</th>}{canEdit && <th />}
        </tr>
      </thead>
      <tbody>
        {rows.map((t) => (
          <tr key={t.id}>
            <td className="hide-sm">{date(t.date)}</td>
            <td>
              <span className={`kind-pill ${t.kind}`}>{t.kind === 'income' ? <IconArrowUp /> : <IconArrowDown />}</span>{t.category_name || <span className="muted">{tr('Uncategorised')}</span>}
              <div className="row-sub show-sm cell-wrap">{date(t.date)}{t.description ? ` · ${t.description}` : ''}{showEvent ? <> · <Where t={t} /></> : t.part_name ? ` · ${t.part_name}` : ''}</div>
            </td>
            {showGroup && <td className="secondary hide-sm">{t.kind === 'expense' ? tr(GROUP_LABELS[t.cost_group || 'organizing']) : tr('Income')}</td>}
            <td className="cell-wrap hide-sm">{t.description || <span className="muted">—</span>}
              {!showEvent && t.part_name && <span className="badge" style={{ marginLeft: 6 }}>{t.part_name}</span>}</td>
            {showEvent && <td className="hide-sm"><Where t={t} /></td>}
            {!compact && <td className="secondary hide-sm">{t.payment_method ? tr(t.payment_method) : '—'}</td>}
            <td className={`r kind-${t.kind}`}>{t.kind === 'income' ? '+' : '−'}{money(t.amount)}</td>
            {!compact && <td className="muted hide-sm">{t.created_by_name || '—'}</td>}
            {canEdit && (t.invoice_id ? (
              // The payment of an invoice or receipt: it follows the invoice's paid tick.
              <td className="r actions"><Link to="/invoices" className="link-btn" title={tr('Change it on the invoice')}>{tr('Invoice')}</Link></td>
            ) : (
              <td className="r actions">
                <button className="icon-btn" onClick={() => onEdit(t)} aria-label={tr('Edit')}><IconEdit /></button>
                <button className="icon-btn" onClick={() => onDelete(t)} aria-label={tr('Delete')}><IconTrash /></button>
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
