import { useState } from 'react';
import Modal from './Modal.jsx';
import { api } from '../api.js';
import { useApi } from '../hooks.js';
import { CURRENCY, today } from '../format.js';
import Select from './Select.jsx';
import { useBusiness } from '../business.js';
import { t } from '../i18n/index.js';

export const PAYMENT_METHODS = ['Cash', 'Card', 'Bank transfer', 'Other'];
const GROUP_LABELS = { organizing: 'Organizing costs', benefit: 'Benefits offered' };

// Add / edit an income or expense. Pass `eventId` to lock it to an event, or `fund`
// ('general' | sport id) to record money spent from / added to a fund.
export default function TxForm({ tx, eventId, eventDate, fund, part, defaultKind = 'income', onClose, onSaved }) {
  // Without community events (e.g. a practice) there are no events or funds to choose: just money in and out.
  const { on } = useBusiness();
  const simple = !on('events');
  const { data: categories } = useApi('/categories');
  const { data: events } = useApi(eventId || fund != null || simple ? null : '/events');
  const { data: sports } = useApi(eventId || simple ? null : '/event-types');
  const { data: parts } = useApi(eventId || simple ? null : '/fund-parts');
  const [f, setF] = useState(() => ({
    kind: defaultKind, amount: '', category_id: '', date: eventDate || today(), description: '',
    payment_method: 'Bank transfer', event_id: eventId || '',
    fund_sport_id: fund && fund !== 'general' ? fund : '', fund_part_id: part || '', ...(tx || {}),
  }));
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const cats = categories?.filter((c) => c.kind === f.kind) || [];
  const isFund = !f.event_id && !simple;
  const groups = f.kind === 'expense' && !isFund && !simple ? ['organizing', 'benefit'] : [null];
  const fundParts = isFund && f.fund_sport_id ? (parts || []).filter((p) => String(p.sport_id) === String(f.fund_sport_id)) : [];
  const fundName = sports?.find((s) => String(s.id) === String(f.fund_sport_id))?.name;

  const save = async () => {
    setSaving(true);
    try {
      const body = { ...f, category_id: f.category_id || cats[0]?.id };
      if (tx) await api.put(`/transactions/${tx.id}`, body);
      else await api.post('/transactions', body);
      onSaved();
    } catch (e) {
      setError(e.message);
      setSaving(false);
    }
  };

  const title = t(tx ? 'Edit transaction' : simple ? (f.kind === 'expense' ? 'Add a cost' : 'Add income')
    : isFund ? (f.kind === 'expense' ? 'Record reinvestment' : 'Add money to a fund')
    : f.kind === 'income' ? 'Add income' : 'Add cost');

  return (
    <Modal title={title} onClose={onClose} onSubmit={save}
      footer={<>
        <button type="button" className="btn" onClick={onClose}>{t('Cancel')}</button>
        <button className="btn btn-primary" disabled={saving}>{t('Save')}</button>
      </>}>
      {error && <div className="error-box">{error}</div>}
      <div className="segmented" role="radiogroup" aria-label={t('Kind')}>
        {['expense', 'income'].map((k) => (
          <button type="button" key={k} className={f.kind === k ? 'on' : ''} role="radio" aria-checked={f.kind === k}
            onClick={() => setF({ ...f, kind: k, category_id: '' })}>
            {t(k === 'income' ? (isFund ? 'Money in (donation…)' : 'Income') : (isFund ? 'Money spent' : 'Cost'))}
          </button>
        ))}
      </div>
      <div className="form-grid">
        <label className="field">{t('Amount')} ({CURRENCY})
          <input type="number" min="0.01" step="0.01" value={f.amount} onChange={set('amount')} autoFocus required />
        </label>
        <label className="field">{t('Category')}
          <Select value={f.category_id || cats[0]?.id || ''} onChange={set('category_id')}>
            {groups.map((g) => {
              const opts = cats.filter((c) => !g || (c.cost_group || 'organizing') === g)
                .map((c) => <option key={c.id} value={c.id}>{c.name}</option>);
              return g ? <optgroup key={g} label={t(GROUP_LABELS[g])}>{opts}</optgroup> : opts;
            })}
          </Select>
        </label>
        <label className="field">{t('Date')}
          <input type="date" value={f.date} onChange={set('date')} required />
        </label>
        <label className="field">{t('Payment method')}
          <Select value={f.payment_method || ''} onChange={set('payment_method')}>
            {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{t(m)}</option>)}
          </Select>
        </label>
        {!eventId && fund == null && !simple && (
          <label className="field full">{t('Event')}
            <Select value={f.event_id || ''} onChange={set('event_id')}>
              <option value="">— {t('Not an event: money from / to a fund')} —</option>
              {events?.map((e) => <option key={e.id} value={e.id}>{e.date} · {e.name}</option>)}
            </Select>
          </label>
        )}
        {isFund && (
          <label className="field full">{t('Fund')}
            <Select value={f.fund_sport_id || ''} onChange={(e) => setF({ ...f, fund_sport_id: e.target.value, fund_part_id: '' })}>
              <option value="">{t('General community fund')}</option>
              {sports?.filter((s) => s.is_sport || String(s.id) === String(f.fund_sport_id)).map((s) => <option key={s.id} value={s.id}>{t('{name} reinvestment fund', { name: s.name })}</option>)}
            </Select>
            <span className="hint">{t(f.kind === 'expense' ? 'Spending is subtracted from this fund (a reinvestment).' : 'Added straight to this fund, not split.')}</span>
          </label>
        )}
        {fundParts.length > 0 && (
          <label className="field full">{t('Part of the fund')}
            <Select value={f.fund_part_id || ''} onChange={set('fund_part_id')}>
              <option value="">{t('The {name} fund in general', { name: fundName })}</option>
              {fundParts.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
            <span className="hint">{t('Still paid from the {name} fund, but counted apart on its page.', { name: fundName })}</span>
          </label>
        )}
        <label className="field full">{t('Description')}
          <input value={f.description || ''} onChange={set('description')} placeholder={t(simple ? 'e.g. Fuel, massage oil' : isFund ? 'e.g. 4 new padel rackets' : 'e.g. Court rental 2h')} />
        </label>
      </div>
    </Modal>
  );
}
