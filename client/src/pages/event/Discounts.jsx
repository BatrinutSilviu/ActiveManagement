import { useState } from 'react';
import { api } from '../../api.js';
import { useAction, useApi, usePermissions } from '../../hooks.js';
import { CURRENCY, discountLabel, money } from '../../format.js';
import CardError from '../../components/CardError.jsx';
import { IconTrash } from '../../components/Icons.jsx';
import Select from '../../components/Select.jsx';
import NameInput from '../../components/NameInput.jsx';
import { fold } from '../../util.js';
import { t } from '../../i18n/index.js';

// Free entry: 'skip' = doesn't pay and isn't counted (as if not signed up), 'paid' = we pay their venue
// part (the general fund pays it) and their community part is let off.
const FREE_LABELS = { skip: 'Free — not counted', paid: 'Free — we pay' }; // English; translated where shown
const isFree = (d) => !!d.free;
const discountName = (d) => (d.member ? t(d.note === 'No community part' ? d.note : 'Member price') : t(FREE_LABELS[d.free]) || d.discount_name || t('One-off'));
const discountWorth = (d, fee) => (d.kind === 'percent' ? (fee * d.value) / 100 : Math.min(d.value, fee));

/** People who paid less (or nothing) at this event, with the discount they got. */
export default function Discounts({ e, reload }) {
  const { data: people } = useApi('/people');
  const { data: discounts } = useApi('/discounts');
  const [f, setF] = useState({ name: '', discount_id: '', amount: '' });
  const [error, run] = useAction(reload);
  const { canEdit } = usePermissions();

  const taken = new Set(e.discountList.map((d) => fold(d.person_name)));
  // Anyone can be named; when the name is someone from People, their own discounts and member price apply.
  const person = f.name.trim() ? people?.find((p) => fold(p.name) === fold(f.name.trim())) : null;
  const named = !!f.name.trim();
  const applies = (d) => !d.sport_id || d.sport_id === e.type_id;
  // The person's own discounts that apply to this sport, best first; then every other saved discount.
  const own = (discounts || []).filter((d) => person?.discount_ids.includes(d.id) && applies(d))
    .sort((a, b) => discountWorth(b, e.participation_fee) - discountWorth(a, e.participation_fee));
  const others = (discounts || []).filter((d) => !own.includes(d) && applies(d));
  const chosen = discounts?.find((d) => String(d.id) === String(f.discount_id));
  // Members pay only the venue's part of the price (with a fixed venue: the member price set on the event).
  const memberPrice = e.venue_fee > 0;
  const memberOff = Math.max(e.participation_fee - e.venue_fee, 0);
  // Free, we pay: the general fund pays only their venue part (same rule as finance.js VENUE_PART).
  const venuePart = Math.min(e.participation_fee, e.price_parts ? Math.max(e.participation_fee - e.community_fee, 0) : e.venue_fee);
  const preview = f.discount_id === 'member' || f.discount_id === 'waive' ? memberOff : f.discount_id.startsWith('free-') ? e.participation_fee
    : f.discount_id === 'custom' ? Number(f.amount) || 0 : chosen ? discountWorth(chosen, e.participation_fee) : 0;

  // Typing a name: when it becomes someone from People, their usual discount is picked for them.
  const setName = (name) => {
    const p = name.trim() ? people?.find((x) => fold(x.name) === fold(name.trim())) : null;
    if (!p) return setF((x) => ({ ...x, name, discount_id: x.discount_id === 'member' || !x.discount_id ? (name.trim() ? 'custom' : '') : x.discount_id }));
    if (p.is_founder) return setF({ name, discount_id: 'free-skip', amount: '' });
    if (p.is_member && memberPrice) return setF({ name, discount_id: 'member', amount: '' });
    const best = (discounts || []).filter((d) => p.discount_ids.includes(d.id) && applies(d))
      .sort((a, b) => discountWorth(b, e.participation_fee) - discountWorth(a, e.participation_fee))[0];
    setF({ name, discount_id: best ? String(best.id) : 'custom', amount: '' });
  };
  const add = async (ev) => {
    ev.preventDefault();
    const who = { name: f.name };
    const body = f.discount_id === 'member' ? { ...who, member: true }
      : f.discount_id === 'waive' ? { ...who, waive: true }
      : f.discount_id.startsWith('free-') ? { ...who, free: f.discount_id.slice(5) }
      : f.discount_id === 'custom' ? { ...who, amount: f.amount } : { ...who, discount_id: f.discount_id };
    if (await run(() => api.post(`/events/${e.id}/discounts`, body))) setF({ name: '', discount_id: '', amount: '' });
  };

  return (
    <div className="card">
      <div className="card-pad card-head" style={{ marginBottom: 0 }}>
        <div>
          <h2>{t('Members & discounts')}</h2>
          <p>{t('{n} of {count} people paid less · price {price}', { n: e.discountList.length, count: e.participants, price: money(e.participation_fee) })}
            {memberPrice ? ` · ${t('members pay {amount}', { amount: money(e.venue_fee) })}` : ''}. {t('Member prices and community parts let off are money we don’t get; discounts and the venue part of free people we pay for are paid by the general fund, not this event.')}</p>
        </div>
        {e.member_discounts + (e.covered_waived || 0) > 0 && <span className="neg" title={t('Member prices and community parts let off: money we don’t get')}>−{money(e.member_discounts + (e.covered_waived || 0))}</span>}
      </div>
      <CardError error={error} />
      {e.discountList.length > 0 && (
        <div className="table-wrap">
          <table>
            <thead><tr><th>{t('Person')}</th><th className="hide-sm">{t('Discount')}</th><th className="r hide-sm">{t('Paid')}</th><th className="r">{t('Amount off')}</th>{canEdit && <th />}</tr></thead>
            <tbody>
              {e.discountList.map((d) => (
                <tr key={d.id}>
                  <td>{d.person_name}<div className="row-sub show-sm">{discountName(d)} · {t('paid {amount}', { amount: money(Math.max(e.participation_fee - d.amount, 0)) })}</div></td>
                  <td className="secondary hide-sm">{d.member || isFree(d) ? discountName(d) : <>{discountName(d)} <span className="muted">{discountLabel(d)}</span></>}</td>
                  <td className="r hide-sm">{money(Math.max(e.participation_fee - d.amount, 0))}</td>
                  <td className="r kind-expense">−{money(d.amount)}</td>
                  {canEdit && <td className="r actions"><button className="icon-btn" aria-label={t('Remove')} onClick={() => run(() => api.del(`/event-discounts/${d.id}`))}><IconTrash /></button></td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {canEdit && <form className="inline-form" onSubmit={add}>
        <div style={{ flex: '1 1 180px' }}>
          <NameInput people={people} value={f.name} onChange={setName} exclude={(p) => taken.has(fold(p.name))}
            className="select-sm" placeholder={t('Name')} required ariaLabel={t('Who pays less')} />
        </div>
        <Select className="select-sm" value={f.discount_id} onChange={(ev) => setF({ ...f, discount_id: ev.target.value })} disabled={!named} required>
          <option value="" disabled={named}>{t('Discount…')}</option>
          <option value="free-skip">{t('Free — doesn’t pay, not counted (no cost to us)')}</option>
          <option value="free-paid">{venuePart > 0 ? t('Free — we pay only their venue part ({amount}, a cost); the community part is let off', { amount: money(venuePart) }) : t('Free — we pay only their venue part (nothing: no venue part); the community part is let off')}</option>
          {memberPrice && person?.is_member && <option value="member">{t('Member price (pays {amount})', { amount: money(e.venue_fee) })}</option>}
          {memberPrice && named && !person?.is_member && memberOff > 0 && (
            <option value="waive">{t('No community part — pays only the venue ({amount}, −{off})', { amount: money(e.venue_fee), off: money(memberOff) })}</option>
          )}
          {own.length > 0 && (
            <optgroup label={t('{name}’s discounts', { name: person.name })}>
              {own.map((d) => <option key={d.id} value={d.id}>{d.name} ({discountLabel(d)})</option>)}
            </optgroup>
          )}
          {others.length > 0 && (
            <optgroup label={t('Other discounts')}>
              {others.map((d) => <option key={d.id} value={d.id}>{d.name} ({discountLabel(d)})</option>)}
            </optgroup>
          )}
          <option value="custom">{t('One-off amount…')}</option>
        </Select>
        {f.discount_id === 'custom' && (
          <input className="select-sm num-input" type="number" min="0.01" step="0.01" placeholder={CURRENCY} value={f.amount}
            onChange={(ev) => setF({ ...f, amount: ev.target.value })} required aria-label={t('Discount amount')} />
        )}
        <button className="btn btn-sm" disabled={!named}>{t('Add')}{preview ? ` · −${money(preview)}` : ''}</button>
      </form>}
      {canEdit && e.participation_fee > 0 && !memberPrice && <p className="hint" style={{ padding: '0 22px 16px', margin: 0 }}>{t('Set the venue’s part of the price (Edit) to give members their price.')}</p>}
      {canEdit && !e.participation_fee && <p className="hint" style={{ padding: '0 22px 16px', margin: 0 }}>{t('This event has no participation fee, so discounts are worth 0.')}</p>}
    </div>
  );
}
