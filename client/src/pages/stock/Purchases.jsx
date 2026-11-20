import { useState } from 'react';
import { api } from '../../api.js';
import { useApi, usePermissions } from '../../hooks.js';
import { date, money, number } from '../../format.js';
import { IconTrash } from '../../components/Icons.jsx';
import Modal from '../../components/Modal.jsx';
import Select from '../../components/Select.jsx';
import { PURCHASE_KINDS } from './PurchaseFields.jsx';
import { t } from '../../i18n/index.js';

/** Every purchase, newest first, with the points it earned. */
export function Purchases({ run, founders = [], onChanged }) {
  const { data, reload } = useApi('/stock/purchases');
  const { canEdit } = usePermissions();
  const [notBought, setNotBought] = useState(null); // the purchase being corrected
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
                {canEdit && <td className="r actions">
                  <button className="link-btn" onClick={() => setNotBought(l)} title={t('It was passed on by another founder, or we already had it')}>{t('Not bought')}</button>
                  <button className="icon-btn" aria-label={t('Delete purchase')} onClick={() => del(l)}><IconTrash /></button></td>}
              </tr>
            ))}
          </tbody>
        </table>
      ) : <div className="empty">{t('No purchases yet. When you add stock, choose “Bought now” to record who bought it.')}</div>}
      {notBought && <NotBought l={notBought} founders={founders} onClose={() => setNotBought(null)}
        onSaved={() => { setNotBought(null); reload(); onChanged?.(); }} />}
    </div>
  );
}

/** A purchase that wasn't one: its money and points go; the holder keeps the stock, taken from whoever passed it on. */
function NotBought({ l, founders, onClose, onSaved }) {
  const [from, setFrom] = useState('');
  const [error, setError] = useState(null);
  const save = async () => {
    try { await api.post(`/stock/purchases/${l.id}/not-bought`, { from: from === 'none' ? null : Number(from) }); onSaved(); } catch (e) { setError(e.message); }
  };
  return (
    <Modal title={t('Not bought')} onClose={onClose} onSubmit={save}
      footer={<><button type="button" className="btn" onClick={onClose}>{t('Cancel')}</button><button className="btn btn-primary">{t('Save')}</button></>}>
      {error && <div className="error-box">{error}</div>}
      <p style={{ margin: 0 }}>{t('{qty} {unit} {item}, kept by {holder}: the {amount} expense and {person}’s {points} points are removed; {holder} keeps the {qty} {unit}.', {
        qty: number(l.qty), unit: l.unit, item: l.item_name, holder: l.holder_name || t('the holder'), amount: money(l.amount), person: l.person_name, points: number(l.points) })}</p>
      <label className="field">{t('Where did it come from?')}
        <Select value={from} onChange={(e) => setFrom(e.target.value)} required>
          <option value="">{t('Choose…')}</option>
          {founders.filter((p) => p.id !== l.holder_id).map((p) => <option key={p.id} value={p.id}>{t('From {name} (taken off their count)', { name: p.name })}</option>)}
          <option value="none">{t('We already had it / the counts are already right')}</option>
        </Select>
      </label>
    </Modal>
  );
}
