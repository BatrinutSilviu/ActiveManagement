import { useState } from 'react';
import { api } from '../../api.js';
import { useApi } from '../../hooks.js';
import { CURRENCY, money, number, today } from '../../format.js';
import Modal from '../../components/Modal.jsx';
import Select from '../../components/Select.jsx';
import { t } from '../../i18n/index.js';
import { r2 } from '../../util.js';

/** Selling a product (merch to members): taken from a founder's stock, the money goes into its fund, the seller
 * gets points for the profit. */
export function SellForm({ item, onClose, onSaved }) {
  const { data: rates } = useApi('/settings/points-rates');
  const [f, setF] = useState({ seller_id: item.holdings[0]?.person_id || '', qty: '', unit_price: item.sell_price || '', date: today(), note: '' });
  const [error, setError] = useState(null);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const qty = Number(f.qty) || 0, price = Number(f.unit_price) || 0;
  const profit = r2((price - item.unit_price) * qty);
  const points = rates?.salesStep > 0 && profit > 0 ? r2((profit / rates.salesStep) * rates.salesPoints) : 0;
  const save = async () => {
    try { await api.post('/stock/sales', { ...f, item_id: item.id }); onSaved(); } catch (e) { setError(e.message); }
  };
  return (
    <Modal title={t('Sell {name}', { name: item.name })} onClose={onClose} onSubmit={save}
      footer={<><button type="button" className="btn" onClick={onClose}>{t('Cancel')}</button><button className="btn btn-primary">{t('Save')}</button></>}>
      {error && <div className="error-box">{error}</div>}
      <div className="form-grid">
        <label className="field">{t('Sold by')}
          <Select value={f.seller_id} onChange={set('seller_id')} required>
            {item.holdings.map((h) => <option key={h.person_id} value={h.person_id}>{h.name} ({number(h.qty)})</option>)}
          </Select>
        </label>
        <label className="field">{t('Quantity')} ({item.unit})<input type="number" min="0.01" step="any" value={f.qty} onChange={set('qty')} autoFocus required /></label>
        <label className="field">{t('Price each ({currency})', { currency: CURRENCY })}<input type="number" min="0" step="0.01" value={f.unit_price} onChange={set('unit_price')} required /></label>
        <label className="field">{t('Date')}<input type="date" value={f.date} onChange={set('date')} required /></label>
        <label className="field full">{t('Note')}<input value={f.note} onChange={set('note')} placeholder={t('e.g. who bought it')} /></label>
      </div>
      {!item.unit_price && <div className="error-box">{t('This product has no cost (price per unit): the whole price counts as profit. Set its cost first if it has one.')}</div>}
      <p className="hint" style={{ margin: 0 }}>
        {t('{revenue} into the fund · cost {cost} each · profit {profit} · {points} points for the seller', {
          revenue: money(price * qty), cost: money(item.unit_price), profit: money(profit), points: number(points) })}
      </p>
    </Modal>
  );
}
