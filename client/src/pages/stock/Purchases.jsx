import { api } from '../../api.js';
import { useApi, usePermissions } from '../../hooks.js';
import { date, money, number } from '../../format.js';
import { IconTrash } from '../../components/Icons.jsx';
import { PURCHASE_KINDS } from './PurchaseFields.jsx';
import { t } from '../../i18n/index.js';

/** Every purchase, newest first, with the points it earned. */
export function Purchases({ run }) {
  const { data, reload } = useApi('/stock/purchases');
  const { canEdit } = usePermissions();
  if (!data) return null;
  const togglePaid = (l) => run(() => api.put(`/stock/purchases/${l.id}/paid-before`, { paid_before: !l.paid_before })).then(reload);
  const del = (l) => window.confirm(t('Delete this purchase? {qty} {unit} of {item} are taken back from {holder} and {person} loses its {points} points.', { qty: l.qty, unit: l.unit, item: l.item_name, holder: l.holder_name || t('the holder'), person: l.person_name, points: number(l.points) }))
    && run(() => api.del(`/stock/purchases/${l.id}`)).then(reload);
  return (
    <div className="card table-wrap">
      {data.length ? (
        <table>
          <thead><tr><th>{t('Date')}</th><th>{t('Product')}</th><th className="hide-sm">{t('Kind')}</th><th>{t('Bought by')}</th><th className="r">{t('Amount paid')}</th><th className="r">{t('Points')}</th>{canEdit && <th />}</tr></thead>
          <tbody>
            {data.map((l) => (
              <tr key={l.id}>
                <td>{date(l.date)}</td>
                <td className="cell-wrap">{l.item_name}<div className="row-sub">{number(l.qty)} {l.unit}{l.holder_name && l.holder_id !== l.person_id ? ` · ${t('kept by {name}', { name: l.holder_name })}` : ''}<span className="show-sm"> · {t(PURCHASE_KINDS[l.kind])}</span></div></td>
                <td className="secondary hide-sm">{t(PURCHASE_KINDS[l.kind])}</td>
                <td>{l.person_name}</td>
                <td className="r">{money(l.amount)}
                  {l.amount > 0 && <div className="row-sub">{l.paid_before ? t('paid earlier, not from the fund') : t('from the fund')}
                    {canEdit && <> · <button className="link-btn" onClick={() => togglePaid(l)}>{l.paid_before ? t('take from the fund') : t('was paid earlier')}</button></>}</div>}
                </td>
                <td className="r"><strong>{number(l.points)}</strong></td>
                {canEdit && <td className="r actions"><button className="icon-btn" aria-label={t('Delete purchase')} onClick={() => del(l)}><IconTrash /></button></td>}
              </tr>
            ))}
          </tbody>
        </table>
      ) : <div className="empty">{t('No purchases yet. When you add stock, tick “Bought now” to record who bought it.')}</div>}
    </div>
  );
}
