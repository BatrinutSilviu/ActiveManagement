import { useState } from 'react';
import { api } from '../../api.js';
import { money, monthName, number } from '../../format.js';
import Modal from '../../components/Modal.jsx';
import Select from '../../components/Select.jsx';
import { t } from '../../i18n/index.js';

/**
 * Give someone money or a benefit (a racket, a free entry…) against their month. Its value in lei comes off
 * what they're owed and off their points, at the month's money per point.
 */
export function AwardForm({ month, r, onClose, onSaved }) {
  const [f, setF] = useState(() => ({
    person_id: '', kind: 'money', description: '', amount: '',
    date: month === new Date().toISOString().slice(0, 7) ? new Date().toISOString().slice(0, 10) : `${month}-01`,
  }));
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const p = r.people.find((x) => String(x.id) === String(f.person_id));
  const value = Number(f.amount) || 0;
  const points = r.perPoint > 0 ? Math.round((value / r.perPoint) * 100) / 100 : null;
  const save = async () => {
    if (saving) return;
    setSaving(true);
    try { await api.post(`/payouts/${month}/awards`, { ...f, person_id: Number(f.person_id), amount: value }); onSaved(); } catch (e) { setError(e.message); setSaving(false); }
  };
  return (
    <Modal title={`${t('Give an award')} · ${monthName(month)}`} onClose={onClose} onSubmit={save}
      footer={<><button type="button" className="btn" onClick={onClose}>{t('Cancel')}</button><button className="btn btn-primary" disabled={saving}>{t('Give award')}</button></>}>
      {error && <div className="error-box">{error}</div>}
      <p className="hint" style={{ margin: 0 }}>{t('Its value comes off what the person is owed for {month} and off their points{perPoint}. Cash leaves the account like a payout; a benefit’s value goes to the general fund, which pays for it.', {
        month: monthName(month), perPoint: r.perPoint > 0 ? ` (${t('{amount} a point this month', { amount: money(r.perPoint) })})` : '' })}</p>
      <div className="form-grid">
        <label className="field">{t('Person')}
          <Select value={f.person_id} onChange={set('person_id')} required>
            <option value="">{t('Choose…')}</option>
            {r.people.map((x) => <option key={x.id} value={x.id}>{x.name} · {t('{n} pts', { n: number(x.netPoints) })}</option>)}
          </Select>
        </label>
        <div className="field">{t('Type')}
          <div className="segmented" role="radiogroup" aria-label={t('Award type')}>
            {[['money', 'Money'], ['benefit', 'Benefit']].map(([k, label]) => (
              <button key={k} type="button" role="radio" aria-checked={f.kind === k} className={f.kind === k ? 'on' : ''}
                onClick={() => setF({ ...f, kind: k })}>{t(label)}</button>
            ))}
          </div>
        </div>
        <label className="field full">{t('What it is')}
          <input value={f.description} onChange={set('description')} maxLength={200} required
            placeholder={f.kind === 'money' ? t('e.g. Bonus for the summer tournament') : t('e.g. Padel racket, free entry to the camp')} />
        </label>
        <label className="field">{t('Worth (lei)')}
          <input type="number" min="0.01" step="0.01" value={f.amount} onChange={set('amount')} required />
          {value > 0 && (
            <span className={`hint ${p && value > p.owed + 0.005 ? 'neg' : ''}`}>
              {points != null ? t('{n} points', { n: number(points) }) : t('No points this month to take it from')}
              {p ? ` · ${t('{name} is owed {amount}', { name: p.name, amount: money(p.owed) })}${value > p.owed + 0.005 ? ` — ${t('more than that')}` : ''}` : ''}
            </span>
          )}
        </label>
        <label className="field">{t('Date')}<input type="date" value={f.date} onChange={set('date')} required /></label>
      </div>
    </Modal>
  );
}
