import { api } from '../../api.js';
import { useApi, usePermissions } from '../../hooks.js';
import { date, money, number } from '../../format.js';
import { IconTrash } from '../../components/Icons.jsx';
import { t } from '../../i18n/index.js';

/** What each product sold for, cost and earned, then every sale, newest first, with the seller's points. */
export function Sales({ run }) {
  const { data, reload } = useApi('/stock/sales');
  const { canEdit } = usePermissions();
  if (!data) return null;
  const del = (l) => window.confirm(t('Delete this sale? {qty} {unit} of {item} go back to {person}, its {revenue} leaves the fund and the {points} points go.', {
    qty: number(l.qty), unit: l.unit, item: l.item_name, person: l.person_name, revenue: money(l.revenue), points: number(l.points) }))
    && run(() => api.del(`/stock/sales/${l.id}`)).then(reload);
  const byItem = [...data.reduce((m, l) => {
    const p = m.get(l.item_id) || { name: l.item_name, unit: l.unit, qty: 0, revenue: 0, profit: 0 };
    p.qty += l.qty; p.revenue += l.revenue; p.profit += l.profit;
    return m.set(l.item_id, p);
  }, new Map()).values()].sort((a, b) => b.profit - a.profit);
  if (!data.length) return <div className="card empty">{t('No sales yet. Use “Sell” on a product to record one: its stock goes down, the money goes into its fund and the seller gets points for the profit.')}</div>;
  return (
    <div className="stack">
      <div className="card table-wrap">
        <table>
          <thead><tr><th>{t('Product')}</th><th className="r">{t('Sold')}</th><th className="r">{t('Revenue')}</th><th className="r">{t('Profit')}</th></tr></thead>
          <tbody>
            {byItem.map((p) => (
              <tr key={p.name}>
                <td>{p.name}</td>
                <td className="r">{number(p.qty)} <span className="muted">{p.unit}</span></td>
                <td className="r">{money(p.revenue)}</td>
                <td className={`r ${p.profit < 0 ? 'neg' : ''}`}><strong>{money(p.profit)}</strong></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="card table-wrap">
        <table>
          <thead><tr><th>{t('Date')}</th><th>{t('Product')}</th><th>{t('Sold by')}</th><th className="r hide-sm">{t('Price each')}</th><th className="r">{t('Revenue')}</th><th className="r">{t('Profit')}</th><th className="r">{t('Points')}</th>{canEdit && <th />}</tr></thead>
          <tbody>
            {data.map((l) => (
              <tr key={l.id}>
                <td>{date(l.date)}</td>
                <td className="cell-wrap">{l.item_name}<div className="row-sub">{number(l.qty)} {l.unit}{l.note ? ` · ${l.note}` : ''}</div></td>
                <td>{l.person_name}</td>
                <td className="r hide-sm">{money(l.unit_price)}<div className="row-sub">{t('cost {cost}', { cost: money(l.unit_cost) })}</div></td>
                <td className="r">{money(l.revenue)}</td>
                <td className={`r ${l.profit < 0 ? 'neg' : ''}`}>{money(l.profit)}</td>
                <td className="r"><strong>{number(l.points)}</strong></td>
                {canEdit && <td className="r actions"><button className="icon-btn" aria-label={t('Delete sale')} onClick={() => del(l)}><IconTrash /></button></td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
