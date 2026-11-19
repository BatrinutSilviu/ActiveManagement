// Record an invoice or receipt: its number and date, who it's for, which sessions or packages it covers, the amount,
// and whether it's paid. Only recorded here — nothing is sent anywhere.
import { useEffect, useState } from 'react';
import { api } from '../../api.js';
import { useApi } from '../../hooks.js';
import { useBusiness } from '../../business.js';
import { CURRENCY, date, money0 } from '../../format.js';
import Modal from '../../components/Modal.jsx';
import Select from '../../components/Select.jsx';
import { PAYMENT_METHODS } from '../../components/TxForm.jsx';
import { t } from '../../i18n/index.js';
import { KIND_LABELS, localToday, timeLabel } from './common.jsx';

const r2 = (v) => Math.round(v * 100) / 100;

/**
 * `invoiceId`: edit that one. Otherwise a new one, for `clientId`, with `select` = { appointment_ids, package_ids }
 * ticked (all of the patient's unbilled items when `select` is 'all').
 */
export default function InvoiceForm({ invoiceId, clientId, select, onClose, onSaved }) {
  const { term, Term } = useBusiness();
  const { data: existing } = useApi(invoiceId ? `/invoices/${invoiceId}` : null);
  const { data: clients } = useApi('/clients');
  const [f, setF] = useState(invoiceId ? null : {
    kind: 'invoice', number: '', date: localToday(), client_id: clientId || '', amount: '', description: '',
    paid: true, paid_date: localToday(), payment_method: 'Cash', appointment_ids: [], package_ids: [],
  });
  const [amountTyped, setAmountTyped] = useState(!!invoiceId);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const { data: billable } = useApi(f?.client_id ? `/clients/${f.client_id}/billable${invoiceId ? `?invoice_id=${invoiceId}` : ''}` : null);

  useEffect(() => { if (existing && !f) setF({ ...existing, paid: !!existing.paid, paid_date: existing.paid_date || localToday() }); }, [existing, f]);
  // A new one gets the number after the last one of its kind.
  useEffect(() => {
    if (invoiceId || !f) return;
    api.get(`/invoices/next-number?kind=${f.kind}`).then(({ number }) => setF((x) => ({ ...x, number }))).catch(() => {});
  }, [f?.kind]); // eslint-disable-line react-hooks/exhaustive-deps
  // Ticks what it was opened for, once the patient's billable items are known.
  useEffect(() => {
    if (!billable || invoiceId || !select) return;
    const pick = select === 'all'
      ? { appointment_ids: billable.appointments.map((a) => a.id), package_ids: billable.packages.map((p) => p.id) }
      : { appointment_ids: select.appointment_ids || [], package_ids: select.package_ids || [] };
    setF((x) => ({ ...x, ...pick }));
  }, [billable]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!f) return null;
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const items = billable ? [
    ...billable.packages.map((p) => ({ key: `p${p.id}`, list: 'package_ids', id: p.id, label: t('{name} (package, {date})', { name: p.name, date: date(p.date) }), amount: p.price })),
    ...billable.appointments.map((a) => ({ key: `a${a.id}`, list: 'appointment_ids', id: a.id,
      label: `${date(a.date)}${a.start_time ? ` ${timeLabel(a)}` : ''}${a.type_name ? ` · ${a.type_name}` : ''}`, amount: a.price })),
  ] : [];
  const ticked = (it) => f[it.list].includes(it.id);
  const itemsTotal = r2(items.filter(ticked).reduce((s, it) => s + it.amount, 0));
  const amount = amountTyped ? f.amount : (itemsTotal || f.amount);
  const toggle = (it) => setF({ ...f, [it.list]: ticked(it) ? f[it.list].filter((x) => x !== it.id) : [...f[it.list], it.id] });

  const save = async () => {
    setSaving(true);
    try {
      const body = { ...f, amount };
      if (invoiceId) await api.put(`/invoices/${invoiceId}`, body); else await api.post('/invoices', body);
      onSaved();
    } catch (e) { setError(e.message); setSaving(false); }
  };

  return (
    <Modal title={invoiceId ? t(`Edit ${KIND_LABELS[f.kind].toLowerCase()}`) : t('New invoice or receipt')} onClose={onClose} onSubmit={save}
      footer={<>
        <button type="button" className="btn" onClick={onClose}>{t('Cancel')}</button>
        <button className="btn btn-primary" disabled={saving}>{t('Save')}</button>
      </>}>
      {error && <div className="error-box">{error}</div>}
      <div className="segmented" role="radiogroup" aria-label={t('Kind')}>
        {Object.entries(KIND_LABELS).map(([k, label]) => (
          <button type="button" key={k} className={f.kind === k ? 'on' : ''} role="radio" aria-checked={f.kind === k}
            onClick={() => setF({ ...f, kind: k })}>{t(label)}</button>
        ))}
      </div>
      <div className="form-grid">
        <label className="field">{t('Number')}<input value={f.number || ''} onChange={set('number')} placeholder={t('e.g. KA-0001')} /></label>
        <label className="field">{t('Date')}<input type="date" value={f.date} onChange={set('date')} required /></label>
        <label className="field full">{t(Term('person'))}
          <Select value={f.client_id ? String(f.client_id) : ''} onChange={(e) => setF({ ...f, client_id: e.target.value, appointment_ids: [], package_ids: [] })}>
            <option value="">{t('— none —')}</option>
            {clients?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </label>
        {f.client_id && (
          <div className="field full">
            <span>{t('What it covers')}</span>
            {items.length ? (
              <div className="check-list" style={{ gap: 8, marginTop: 4 }}>
                {items.map((it) => (
                  <label key={it.key} className="check">
                    <input type="checkbox" checked={ticked(it)} onChange={() => toggle(it)} />
                    <span style={{ flex: 1 }}>{it.label}</span><strong>{money0(it.amount)}</strong>
                  </label>
                ))}
              </div>
            ) : <span className="hint">{t(`Nothing to bill for this ${term('person')}: ${term('events')} done outside a package and packages show up here.`)}</span>}
          </div>
        )}
        <label className="field">{t('Amount ({currency})', { currency: CURRENCY })}
          <input type="number" min="0.01" step="0.01" value={amount} required
            onChange={(e) => { setAmountTyped(true); setF({ ...f, amount: e.target.value }); }} />
          {amountTyped && itemsTotal > 0 && Number(amount) !== itemsTotal
            && <span className="hint">{t('The ticked items come to {amount}', { amount: money0(itemsTotal) })} · <button type="button" className="link-btn" onClick={() => setAmountTyped(false)}>{t('use that')}</button></span>}
        </label>
        <label className="field">{t('Description')}<input value={f.description || ''} onChange={set('description')} placeholder={t('optional')} /></label>
        <label className="field full check-field">
          <input type="checkbox" checked={f.paid} onChange={(e) => setF({ ...f, paid: e.target.checked })} />
          <span>{t('Paid')} <span className="hint">{t('— its money counts on the day it was paid')}</span></span>
        </label>
        {f.paid && <>
          <label className="field">{t('Paid on')}<input type="date" value={f.paid_date || ''} onChange={set('paid_date')} required /></label>
          <label className="field">{t('Payment method')}
            <Select value={f.payment_method || ''} onChange={set('payment_method')}>
              {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{t(m)}</option>)}
            </Select>
          </label>
        </>}
      </div>
    </Modal>
  );
}
