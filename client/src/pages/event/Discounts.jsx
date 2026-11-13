import { useState } from 'react';
import { api } from '../../api.js';
import { useAction, useApi, usePermissions } from '../../hooks.js';
import { discountLabel, money } from '../../format.js';
import CardError from '../../components/CardError.jsx';
import { IconTrash } from '../../components/Icons.jsx';
import Select from '../../components/Select.jsx';

// Free entry: 'skip' = doesn't pay and isn't counted (as if not signed up), 'paid' = we pay their fee.
const FREE_LABELS = { skip: 'Free — not counted', paid: 'Free — we pay' };
const isFree = (d) => !!d.free;
const discountName = (d) => (d.member ? (d.note === 'No community part' ? d.note : 'Member price') : FREE_LABELS[d.free] || d.discount_name || 'One-off');
const discountWorth = (d, fee) => (d.kind === 'percent' ? (fee * d.value) / 100 : Math.min(d.value, fee));

/** People who paid less (or nothing) at this event, with the discount they got. */
export default function Discounts({ e, reload }) {
  const { data: people, reload: reloadPeople } = useApi('/people');
  const { data: discounts } = useApi('/discounts');
  const [f, setF] = useState({ person_id: '', discount_id: '', amount: '' });
  const [error, run, setError] = useAction(reload);
  const { canEdit } = usePermissions();

  const taken = new Set(e.discountList.map((d) => d.person_id));
  const organisers = new Set(e.tasks.map((l) => l.person_id));
  const person = people?.find((p) => String(p.id) === String(f.person_id));
  const applies = (d) => !d.sport_id || d.sport_id === e.type_id;
  // The person's own discounts that apply to this sport, best first; then every other saved discount.
  const own = (discounts || []).filter((d) => person?.discount_ids.includes(d.id) && applies(d))
    .sort((a, b) => discountWorth(b, e.participation_fee) - discountWorth(a, e.participation_fee));
  const others = (discounts || []).filter((d) => !own.includes(d) && applies(d));
  const chosen = discounts?.find((d) => String(d.id) === String(f.discount_id));
  // Members pay only the venue's part of the price (with a fixed venue: the member price set on the event).
  const memberPrice = e.venue_fee > 0;
  const memberOff = Math.max(e.participation_fee - e.venue_fee, 0);
  const preview = f.discount_id === 'member' || f.discount_id === 'waive' ? memberOff : f.discount_id.startsWith('free-') ? e.participation_fee
    : f.discount_id === 'custom' ? Number(f.amount) || 0 : chosen ? discountWorth(chosen, e.participation_fee) : 0;

  const pickPerson = async (value, typed = '') => {
    if (value === 'new') {
      const name = typed || window.prompt('Name of the new person');
      if (!name?.trim()) return;
      try {
        const { id } = await api.post('/people', { name });
        await reloadPeople();
        setF({ person_id: String(id), discount_id: 'custom', amount: '' });
      } catch (err) { setError(err.message); }
      return;
    }
    const p = people.find((x) => String(x.id) === value);
    if (p?.is_founder) return setF({ person_id: value, discount_id: 'free-skip', amount: '' });
    if (p?.is_member && memberPrice) return setF({ person_id: value, discount_id: 'member', amount: '' });
    const best = (discounts || []).filter((d) => p?.discount_ids.includes(d.id) && applies(d))
      .sort((a, b) => discountWorth(b, e.participation_fee) - discountWorth(a, e.participation_fee))[0];
    setF({ person_id: value, discount_id: best ? String(best.id) : 'custom', amount: '' });
  };
  const add = async (ev) => {
    ev.preventDefault();
    const body = f.discount_id === 'member' ? { person_id: f.person_id, member: true }
      : f.discount_id === 'waive' ? { person_id: f.person_id, waive: true }
      : f.discount_id.startsWith('free-') ? { person_id: f.person_id, free: f.discount_id.slice(5) }
      : f.discount_id === 'custom' ? { person_id: f.person_id, amount: f.amount } : { person_id: f.person_id, discount_id: f.discount_id };
    if (await run(() => api.post(`/events/${e.id}/discounts`, body))) setF({ person_id: '', discount_id: '', amount: '' });
  };

  return (
    <div className="card">
      <div className="card-pad card-head" style={{ marginBottom: 0 }}>
        <div>
          <h2>Members &amp; discounts</h2>
          <p>{e.discountList.length} of {e.participants} people paid less · price {money(e.participation_fee)}
            {memberPrice ? ` · members pay ${money(e.venue_fee)}` : ''}. Member prices and community parts let off are money we don’t get; discounts and fees we pay are paid by the general fund, not this event.</p>
        </div>
        {e.member_discounts > 0 && <span className="neg" title="Member prices and community parts let off: money we don’t get">−{money(e.member_discounts)}</span>}
      </div>
      <CardError error={error} />
      {e.discountList.length > 0 && (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Person</th><th className="hide-sm">Discount</th><th className="r hide-sm">Paid</th><th className="r">Amount off</th>{canEdit && <th />}</tr></thead>
            <tbody>
              {e.discountList.map((d) => (
                <tr key={d.id}>
                  <td>{d.person_name}<div className="row-sub show-sm">{discountName(d)} · paid {money(Math.max(e.participation_fee - d.amount, 0))}</div></td>
                  <td className="secondary hide-sm">{d.member || isFree(d) ? discountName(d) : <>{discountName(d)} <span className="muted">{discountLabel(d)}</span></>}</td>
                  <td className="r hide-sm">{money(Math.max(e.participation_fee - d.amount, 0))}</td>
                  <td className="r kind-expense">−{money(d.amount)}</td>
                  {canEdit && <td className="r actions"><button className="icon-btn" aria-label="Remove" onClick={() => run(() => api.del(`/event-discounts/${d.id}`))}><IconTrash /></button></td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {canEdit && <form className="inline-form" onSubmit={add}>
        <Select className="select-sm" value={f.person_id} onChange={(ev) => pickPerson(ev.target.value)} required
          onCreate={(name) => pickPerson('new', name)} createLabel="New person">
          <option value="">Person…</option>
          {people?.filter((p) => p.active && !taken.has(p.id)).map((p) => (
            <option key={p.id} value={p.id}>{p.name}{p.is_founder ? ' · founder' : organisers.has(p.id) ? ' · organiser' : p.is_member && memberPrice ? ' · member' : p.discount_ids.length ? ' ★' : ''}</option>
          ))}
        </Select>
        <Select className="select-sm" value={f.discount_id} onChange={(ev) => setF({ ...f, discount_id: ev.target.value })} disabled={!person} required>
          <option value="" disabled={!!person}>Discount…</option>
          <option value="free-skip">Free — doesn’t pay, not counted (no cost to us)</option>
          <option value="free-paid">Free — we pay their fee (counts as a cost)</option>
          {memberPrice && person?.is_member && <option value="member">Member price (pays {money(e.venue_fee)})</option>}
          {memberPrice && person && !person.is_member && memberOff > 0 && (
            <option value="waive">No community part — pays only the venue ({money(e.venue_fee)}, −{money(memberOff)})</option>
          )}
          {own.length > 0 && (
            <optgroup label={`${person.name}’s discounts`}>
              {own.map((d) => <option key={d.id} value={d.id}>{d.name} ({discountLabel(d)})</option>)}
            </optgroup>
          )}
          {others.length > 0 && (
            <optgroup label="Other discounts">
              {others.map((d) => <option key={d.id} value={d.id}>{d.name} ({discountLabel(d)})</option>)}
            </optgroup>
          )}
          <option value="custom">One-off amount…</option>
        </Select>
        {f.discount_id === 'custom' && (
          <input className="select-sm num-input" type="number" min="0.01" step="0.01" placeholder="RON" value={f.amount}
            onChange={(ev) => setF({ ...f, amount: ev.target.value })} required aria-label="Discount amount" />
        )}
        <button className="btn btn-sm" disabled={!person}>Add{preview ? ` · −${money(preview)}` : ''}</button>
      </form>}
      {canEdit && e.participation_fee > 0 && !memberPrice && <p className="hint" style={{ padding: '0 22px 16px', margin: 0 }}>Set the venue’s part of the price (Edit) to give members their price.</p>}
      {canEdit && !e.participation_fee && <p className="hint" style={{ padding: '0 22px 16px', margin: 0 }}>This event has no participation fee, so discounts are worth 0.</p>}
    </div>
  );
}
