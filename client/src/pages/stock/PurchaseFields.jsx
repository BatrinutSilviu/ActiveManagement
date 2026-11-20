import { useApi } from '../../hooks.js';
import { CURRENCY, number, today } from '../../format.js';
import Select from '../../components/Select.jsx';
import { t } from '../../i18n/index.js';

// English labels; translate at render time with t().
export const PURCHASE_KINDS = { items: 'Usual items / prizes', merch: 'Partnership merchandise' };
// how: where the stock came from, chosen every time (nothing ticked to start with, so a move isn't recorded as bought):
// 'bought' (spent from a fund, points to the buyer), 'moved' (from another founder), 'had' (ours already, no cost).
export const blankPurchase = () => ({ how: null, person_id: '', kind: 'items', amount: '', date: today(), paid_before: false });
export const HOW = { bought: 'Bought now', moved: 'From another founder', had: 'We already had it (no cost)' };

/** Turns the purchase fields into what the API expects (or nothing when it wasn't bought). */
export const purchaseBody = (p, holder, qty, price) => (p.how === 'bought'
  ? { purchase: { kind: p.kind, person_id: p.person_id || holder, date: p.date, paid_before: p.paid_before, amount: p.amount === '' ? (Number(qty) || 0) * (Number(price) || 0) : p.amount } }
  : {});

/** Where the stock came from (ways: the keys of HOW offered), and when bought: who bought it, what kind of purchase,
 * what they paid — it earns them points. */
export function PurchaseFields({ p, setP, people, holder, qty, price, ways = ['bought', 'had'] }) {
  const { data: rates } = useApi('/settings/points-rates');
  const set = (k) => (e) => setP({ ...p, [k]: e.target.value });
  const auto = (Number(qty) || 0) * (Number(price) || 0);
  const amount = p.amount === '' ? auto : Number(p.amount) || 0;
  const [step, pts] = rates ? (p.kind === 'merch' ? [rates.merchStep, rates.merchPoints] : [rates.itemsStep, rates.itemsPoints]) : [0, 0];
  const points = step > 0 ? Math.round((amount / step) * pts * 100) / 100 : 0;
  return (
    <>
      <div className="field full">{t('Where does it come from?')}
        <div className="segmented how-choice" role="radiogroup" aria-label={t('Where does it come from?')}>
          {ways.map((k) => (
            <button type="button" key={k} role="radio" aria-checked={p.how === k} className={p.how === k ? 'on' : ''}
              onClick={() => setP({ ...p, how: k })}>{t(HOW[k])}</button>
          ))}
        </div>
        <span className="hint">{p.how === 'bought' ? t('Spent from the fund of its category (a sport’s category → that sport’s fund, otherwise the general fund); the buyer gets points.')
          : p.how === 'moved' ? t('Passed on between founders: no money, no points.')
          : p.how === 'had' ? t('Already ours, or given to us: no money, no points.') : t('Choose one: only “Bought now” spends money.')}</span>
      </div>
      {p.how === 'bought' && (
        <>
          <label className="field">{t('Bought by')}
            <Select value={p.person_id || holder || ''} onChange={set('person_id')} required>
              <option value="">{t('Choose person…')}</option>
              {people.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </Select>
          </label>
          <label className="field">{t('Kind of purchase')}
            <Select value={p.kind} onChange={set('kind')}>
              {Object.entries(PURCHASE_KINDS).map(([k, l]) => <option key={k} value={k}>{t(l)}</option>)}
            </Select>
          </label>
          <label className="field">{t('Paid ({currency})', { currency: CURRENCY })}
            <input type="number" min="0" step="0.01" value={p.amount} onChange={set('amount')} placeholder={String(auto)} />
            <span className="hint">{p.amount === '' ? t('Quantity × price; type the real amount if different') : ' '}</span>
          </label>
          <label className="field">{t('Date')}<input type="date" value={p.date} onChange={set('date')} required /></label>
          <label className="field full check-field">
            <input type="checkbox" checked={!!p.paid_before} onChange={(e) => setP({ ...p, paid_before: e.target.checked })} />
            {t('Paid earlier, already counted in the budget: don’t take it out of the fund again')}
          </label>
          <p className="hint full" style={{ margin: 0 }}>{t('{n} points', { n: number(points) })}{rates && step > 0 ? ` (${t('{pts} per {step} {currency} for {kind}', { pts: number(pts), step: number(step), currency: CURRENCY, kind: t(PURCHASE_KINDS[p.kind]).toLowerCase() })})` : ''}</p>
        </>
      )}
    </>
  );
}
