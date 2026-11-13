import { api } from '../../api.js';
import { useApi, usePermissions } from '../../hooks.js';
import { date, money, number } from '../../format.js';
import { IconTrash } from '../../components/Icons.jsx';
import { PURCHASE_KINDS } from './PurchaseFields.jsx';

/** Every purchase, newest first, with the points it earned. */
export function Purchases({ run }) {
  const { data, reload } = useApi('/stock/purchases');
  const { canEdit } = usePermissions();
  if (!data) return null;
  const togglePaid = (l) => run(() => api.put(`/stock/purchases/${l.id}/paid-before`, { paid_before: !l.paid_before })).then(reload);
  const del = (l) => window.confirm(`Delete this purchase? ${l.qty} ${l.unit} of ${l.item_name} are taken back from ${l.holder_name || 'the holder'} and ${l.person_name} loses its ${number(l.points)} points.`)
    && run(() => api.del(`/stock/purchases/${l.id}`)).then(reload);
  return (
    <div className="card table-wrap">
      {data.length ? (
        <table>
          <thead><tr><th>Date</th><th>Product</th><th className="hide-sm">Kind</th><th>Bought by</th><th className="r">Paid</th><th className="r">Points</th>{canEdit && <th />}</tr></thead>
          <tbody>
            {data.map((l) => (
              <tr key={l.id}>
                <td>{date(l.date)}</td>
                <td className="cell-wrap">{l.item_name}<div className="row-sub">{number(l.qty)} {l.unit}{l.holder_name && l.holder_id !== l.person_id ? ` · kept by ${l.holder_name}` : ''}<span className="show-sm"> · {PURCHASE_KINDS[l.kind]}</span></div></td>
                <td className="secondary hide-sm">{PURCHASE_KINDS[l.kind]}</td>
                <td>{l.person_name}</td>
                <td className="r">{money(l.amount)}
                  {l.amount > 0 && <div className="row-sub">{l.paid_before ? 'paid earlier, not from the fund' : 'from the fund'}
                    {canEdit && <> · <button className="link-btn" onClick={() => togglePaid(l)}>{l.paid_before ? 'take from the fund' : 'was paid earlier'}</button></>}</div>}
                </td>
                <td className="r"><strong>{number(l.points)}</strong></td>
                {canEdit && <td className="r actions"><button className="icon-btn" aria-label="Delete purchase" onClick={() => del(l)}><IconTrash /></button></td>}
              </tr>
            ))}
          </tbody>
        </table>
      ) : <div className="empty">No purchases yet. When you add stock, tick “Bought now” to record who bought it.</div>}
    </div>
  );
}
