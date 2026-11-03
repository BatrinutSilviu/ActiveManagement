import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useApi, useChartColors, usePermissions } from '../hooks.js';
import { date, money, money0, number, signedMoney, signedMoney2 } from '../format.js';
import EventForm from '../components/EventForm.jsx';
import TxForm from '../components/TxForm.jsx';
import TxTable from '../components/TxTable.jsx';
import { confirmDelete } from '../components/Modal.jsx';
import { IconCheck, IconEdit, IconPlus, IconTrash, IconChevronLeft } from '../components/Icons.jsx';
import { StatusBadge } from './Events.jsx';
import { pctLabel } from './Dashboard.jsx';
import { TASK_LABELS, TASKS } from '../points.js';

/** The per-event statement the founders asked for: income, costs, profit and how it is split. */
function Statement({ e, split }) {
  const c = useChartColors();
  const s = e.split;
  const parts = [
    { key: 'founders', label: 'Founders', color: c.founders, value: s.founders },
    ...(e.is_sport ? [{ key: 'sport', label: `${e.type_name} fund`, color: c.sportfund, value: s.sport }] : []),
    { key: 'general', label: 'General fund', color: c.general, value: s.general },
  ];
  const community = 100 - split.foundersStandard - split.foundersPoints;
  const otherBenefits = Math.round((e.benefits - e.covered_fees) * 100) / 100;
  return (
    <div className="card card-pad">
      <div className="card-head">
        <div><h2>Event statement</h2><p>{e.status === 'completed' ? 'Finalized — included in the funds' : 'Live — added to the funds when finalized'}</p></div>
      </div>
      <dl className="statement">
        <dt>Income from fees <span className="muted">{e.counted_participants} × {money(e.participation_fee)}{e.free_skip_count > 0 ? ` · ${e.free_skip_count} free not counted` : ''}</span></dt><dd>{money(e.fee_gross)}</dd>
        {e.member_discounts > 0 && <><dt>Member prices <span className="muted">{e.member_count} members paid only {money(e.venue_fee)}</span></dt><dd className="neg">−{money(e.member_discounts)}</dd></>}
        {e.discounts > 0 && <><dt>Discounts <span className="muted">{e.discount_count} people paid less</span></dt><dd className="neg">−{money(e.discounts)}</dd></>}
        {e.other_income > 0 && <><dt>Other income <span className="muted">sponsors, etc.</span></dt><dd>{money(e.other_income)}</dd></>}
        <dt>Organizing costs <span className="muted">{e.venue_cost > 0 ? `venue ${e.venue_mode === 'fixed' ? `${money(e.venue_cost)} fixed` : `${e.counted_participants} × ${money(e.venue_fee)}`}${e.organizing > e.venue_cost ? ' + other costs' : ''}` : 'venues, trainers…'}</span></dt><dd className={e.organizing ? 'neg' : ''}>{e.organizing ? '−' : ''}{money(e.organizing)}</dd>
        {otherBenefits > 0 || !e.covered_fees ? <><dt>Benefits offered <span className="muted">{e.stock_cost > 0 ? `incl. ${money(e.stock_cost)} stock used` : 'water, fruit, balls…'}</span></dt><dd className={otherBenefits ? 'neg' : ''}>{otherBenefits ? '−' : ''}{money(otherBenefits)}</dd></> : null}
        {e.covered_fees > 0 && <><dt>Fees we paid <span className="muted">{e.covered_count} {e.covered_count === 1 ? 'person' : 'people'} free, paid by us</span></dt><dd className="neg">−{money(e.covered_fees)}</dd></>}
        <dt className="total">Total profit</dt><dd className={`total ${e.profit < 0 ? 'neg' : ''}`}>{signedMoney2(e.profit)}</dd>
      </dl>
      <div className="split-bar" style={{ margin: '18px 0 14px' }} role="img" aria-label="Profit split">
        {e.profit > 0 && parts.map((p) => <div key={p.key} style={{ width: `${(p.value / e.profit) * 100}%`, background: p.color }} />)}
      </div>
      <dl className="statement">
        <dt><i className="swatch" style={{ background: c.founders }} />Founders & organisers {pctLabel(split.foundersStandard + split.foundersPoints)}
          <span className="muted">{money0(s.standard)} founders · {money0(s.points)} organisers by points{s.freeTasks ? ` · ${money0(s.freeTasks)} of tasks done for free moved to the ${s.freeTo === 'sport' ? `${e.type_name} fund` : 'general fund'}` : ''}</span></dt>
        <dd>{money(s.founders)}</dd>
        <dt><i className="swatch" style={{ background: c.general }} />General community fund <span className="muted">{e.is_sport ? `${pctLabel(split.generalShare)} of the ${pctLabel(community)}` : `all of the ${pctLabel(community)} — ${e.type_name} isn’t a sport, so no sport fund`}</span></dt>
        <dd>{money(s.general)}</dd>
        {!!e.is_sport && <><dt><i className="swatch" style={{ background: c.sportfund }} />{e.type_name} reinvestment fund <span className="muted">{pctLabel(100 - split.generalShare)} of the {pctLabel(community)}</span></dt>
        <dd>{money(s.sport)}</dd></>}
      </dl>
    </div>
  );
}

const discountLabel = (d) => (d.kind === 'percent' ? `−${number(d.value)}%` : `−${money(d.value)}`);
// Free entry: 'skip' = doesn't pay and isn't counted (as if not signed up), 'paid' = we pay their fee.
const FREE_LABELS = { skip: 'Free — not counted', paid: 'Free — we pay' };
const isFree = (d) => !!d.free;
const discountName = (d) => (d.member ? 'Member price' : FREE_LABELS[d.free] || d.discount_name || 'One-off');
const discountWorth = (d, fee) => (d.kind === 'percent' ? (fee * d.value) / 100 : Math.min(d.value, fee));

/** People who paid less (or nothing) at this event, with the discount they got. */
function Discounts({ e, reload }) {
  const { data: people, reload: reloadPeople } = useApi('/people');
  const { data: discounts } = useApi('/discounts');
  const [f, setF] = useState({ person_id: '', discount_id: '', amount: '' });
  const [error, setError] = useState(null);
  const { canEdit } = usePermissions();
  const run = async (fn) => { try { await fn(); setError(null); reload(); return true; } catch (err) { setError(err.message); return false; } };

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
  const preview = f.discount_id === 'member' ? memberOff : f.discount_id.startsWith('free-') ? e.participation_fee
    : f.discount_id === 'custom' ? Number(f.amount) || 0 : chosen ? discountWorth(chosen, e.participation_fee) : 0;

  const pickPerson = async (value) => {
    if (value === 'new') {
      const name = window.prompt('Name of the new person');
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
            {memberPrice ? ` · members pay ${money(e.venue_fee)}` : ''}</p>
        </div>
        {e.discounts + e.member_discounts > 0 && <span className="neg">−{money(e.discounts + e.member_discounts)}</span>}
      </div>
      {error && <div className="error-box" style={{ margin: '0 22px 12px' }}>{error}</div>}
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
        <select className="select-sm" value={f.person_id} onChange={(ev) => pickPerson(ev.target.value)} required>
          <option value="">Person…</option>
          {people?.filter((p) => p.active && !taken.has(p.id)).map((p) => (
            <option key={p.id} value={p.id}>{p.name}{p.is_founder ? ' · founder' : organisers.has(p.id) ? ' · organiser' : p.is_member && memberPrice ? ' · member' : p.discount_ids.length ? ' ★' : ''}</option>
          ))}
          <option value="new">+ New person…</option>
        </select>
        <select className="select-sm" value={f.discount_id} onChange={(ev) => setF({ ...f, discount_id: ev.target.value })} disabled={!person} required>
          <option value="" disabled={!!person}>Discount…</option>
          <option value="free-skip">Free — doesn’t pay, not counted (no cost to us)</option>
          <option value="free-paid">Free — we pay their fee (counts as a cost)</option>
          {memberPrice && person?.is_member && <option value="member">Member price (pays {money(e.venue_fee)})</option>}
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
        </select>
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

/** Optional list of who came, with a tick for who has paid. */
function Attendees({ e, reload }) {
  const { data: people, reload: reloadPeople } = useApi('/people');
  const [name, setName] = useState('');
  const [error, setError] = useState(null);
  const { canEdit } = usePermissions();
  const run = async (fn) => { try { await fn(); setError(null); reload(); return true; } catch (err) { setError(err.message); return false; } };

  const listed = new Set(e.attendees.map((a) => a.person_id));
  const discountOf = new Map(e.discountList.map((d) => [d.person_id, d.amount]));
  const owes = (a) => Math.max(e.participation_fee - (discountOf.get(a.person_id) || 0), 0);
  const paid = e.attendees.filter((a) => a.paid);
  const toCollect = e.attendees.filter((a) => !a.paid).reduce((s, a) => s + owes(a), 0);

  const add = async (ev) => {
    ev.preventDefault();
    const p = people?.find((x) => x.name.toLowerCase() === name.trim().toLowerCase());
    if (await run(() => api.post(`/events/${e.id}/attendees`, p ? { person_id: p.id } : { name }))) {
      setName('');
      if (!p) reloadPeople();
    }
  };

  return (
    <div className="card">
      <div className="card-pad card-head" style={{ marginBottom: 0 }}>
        <div>
          <h2>Attendees</h2>
          <p>{e.attendees.length
            ? `${paid.length} of ${e.attendees.length} paid${toCollect > 0 ? ` · ${money(toCollect)} still to collect` : ''}`
            : 'Optional — list who came and tick who has paid'}</p>
        </div>
      </div>
      {error && <div className="error-box" style={{ margin: '0 22px 12px' }}>{error}</div>}
      {e.attendees.length > 0 && (
        <div className="table-wrap">
          <table>
            <thead><tr><th style={{ width: 44 }}>Paid</th><th>Person</th><th className="r">Pays</th>{canEdit && <th />}</tr></thead>
            <tbody>
              {e.attendees.map((a) => (
                <tr key={a.id}>
                  <td>
                    <input type="checkbox" checked={!!a.paid} disabled={!canEdit} aria-label={`${a.name} paid`}
                      onChange={(ev) => run(() => api.put(`/event-attendees/${a.id}`, { paid: ev.target.checked }))} />
                  </td>
                  <td>{a.name}{a.is_member ? <span className="badge hide-sm" style={{ marginLeft: 6 }}>Member</span> : null}</td>
                  <td className={`r ${a.paid ? 'secondary' : ''}`}>{money(owes(a))}</td>
                  {canEdit && <td className="r actions"><button className="icon-btn" aria-label="Remove" onClick={() => run(() => api.del(`/event-attendees/${a.id}`))}><IconTrash /></button></td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {e.attendees.length > 0 && e.attendees.length !== e.participants && (
        <p className="hint" style={{ padding: '10px 22px 0', margin: 0 }}>
          The list has {e.attendees.length} people but the event counts {e.participants} participants — the money uses the count (Edit to change it).
        </p>
      )}
      {canEdit && <form className="inline-form" onSubmit={add}>
        <input className="select-sm" style={{ flex: '1 1 200px' }} list={`attendee-names-${e.id}`} placeholder="Name (existing or new person)"
          value={name} onChange={(ev) => setName(ev.target.value)} required aria-label="Attendee name" />
        <datalist id={`attendee-names-${e.id}`}>
          {people?.filter((p) => p.active && !listed.has(p.id)).map((p) => <option key={p.id} value={p.name} />)}
        </datalist>
        <button className="btn btn-sm">Add</button>
      </form>}
    </div>
  );
}

/** The event's points, shared between its tasks; people on a task share its points equally. */
function Tasks({ e, reload }) {
  const { data: people } = useApi('/people');
  const [error, setError] = useState(null);
  const [byHand, setByHand] = useState(false);
  const { canEdit } = usePermissions();
  const run = async (fn) => { try { await fn(); setError(null); reload(); } catch (err) { setError(err.message); } };
  const byTask = (t) => e.tasks.filter((l) => l.task === t);
  const unassigned = TASKS.filter((t) => !byTask(t).length);
  const freePoints = e.tasks.filter((l) => l.free).reduce((a, l) => a + l.points, 0);
  const fund = e.is_sport ? `${e.type_name} fund` : 'general fund';
  const setPoints = (v) => run(() => api.put(`/events/${e.id}/points`, { points: v })).then(() => setByHand(false));
  const auto = e.points_auto;
  const hours = e.hours_before + e.hours_during + e.hours_after;

  return (
    <div className="card">
      <div className="card-pad card-head" style={{ marginBottom: 0 }}>
        <div><h2>Tasks & points</h2>
          <p>Each task gets its share of the event’s points; people on the same task share them. Done for free: the points’ money goes to the {fund}.</p></div>
      </div>
      {error && <div className="error-box" style={{ margin: '0 22px 12px' }}>{error}</div>}
      <div className="card-pad task-total" style={{ paddingTop: 0 }}>
        <span>Event points</span>
        {canEdit && (byHand || e.points_manual)
          ? <input key={e.points} className="select-sm num-input" type="number" min="0" step="0.5" defaultValue={e.points} aria-label="Event points"
            autoFocus={byHand} onBlur={(ev) => ev.target.value !== '' && Number(ev.target.value) !== e.points && setPoints(ev.target.value)} />
          : <strong>{number(e.points)}</strong>}
        {e.points_manual
          ? <span className="badge">Set by hand</span>
          : <span className="muted">{number(auto.time)} for {number(hours)}h ({number(e.hours_before)} before · {number(e.hours_during)} during · {number(e.hours_after)} after)
            {' '}+ {number(auto.money)} for {signedMoney(e.profit)} profit{auto.factor !== 1 ? ` · ${e.type_name} × ${number(auto.factor)}` : ''}</span>}
        {canEdit && (e.points_manual
          ? <button className="btn btn-sm" onClick={() => setPoints(null)}>Use automatic ({number(auto.total)})</button>
          : !byHand && <button className="btn btn-sm" onClick={() => setByHand(true)}>Set by hand</button>)}
        {!e.points_manual && !hours && <span className="hint">Add the hours in Edit event</span>}
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Task</th><th className="r">Points</th><th>Done by</th></tr></thead>
          <tbody>
            {TASKS.map((t) => {
              const lines = byTask(t);
              const share = e.taskShares[t] || 0;
              const taken = new Set(lines.map((l) => l.person_id));
              return (
                <tr key={t}>
                  <td className="cell-wrap">{TASK_LABELS[t]}<div className="row-sub">{pctLabel(share)}</div></td>
                  <td className="r">{number(Math.round(e.points * share) / 100)}</td>
                  <td className="cell-wrap">
                    <div className="task-people">
                      {lines.map((l) => (
                        <span key={l.id} className={`task-chip ${l.free ? 'free' : ''}`}>
                          {l.person_name} <span className="muted">{number(l.points)}</span>
                          {l.free ? <span className="badge status-completed">free</span> : null}
                          {canEdit && <>
                            <button className="link-btn" onClick={() => run(() => api.put(`/event-tasks/${l.id}`, { free: !l.free }))}
                              title={l.free ? 'They get the points' : `Done for free — the money goes to the ${fund}`}>{l.free ? 'paid' : 'free'}</button>
                            <button className="icon-btn" aria-label={`Remove ${l.person_name}`} onClick={() => run(() => api.del(`/event-tasks/${l.id}`))}><IconTrash width="14" /></button>
                          </>}
                        </span>
                      ))}
                      {!lines.length && <span className="muted">Nobody yet</span>}
                      {canEdit && (
                        <select className="select-sm" value="" aria-label={`Add someone to ${TASK_LABELS[t]}`}
                          onChange={(ev) => ev.target.value && run(() => api.post(`/events/${e.id}/tasks`, { task: t, person_id: ev.target.value }))}>
                          <option value="">Add…</option>
                          {people?.filter((p) => p.active && !taken.has(p.id)).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {(unassigned.length > 0 || freePoints > 0) && (
        <p className="hint" style={{ padding: '12px 22px 16px', margin: 0 }}>
          {freePoints > 0 && <>{number(Math.round(freePoints * 100) / 100)} points done for free go to the {fund}. </>}
          {unassigned.length > 0 && <>{unassigned.map((t) => TASK_LABELS[t]).join(', ')}: nobody yet, so {unassigned.length > 1 ? 'those points aren’t' : 'its points aren’t'} counted.</>}
        </p>
      )}
    </div>
  );
}

// What happened to stock after an event: kept (1), partly used (2, quantity unchanged), used up (0).
const afterKey = (k) => (k === 2 ? 'partial' : k ? 'kept' : 'used');
const AFTER_LABELS = { kept: 'Kept — still ours', partial: 'Partly used', used: 'Used up' };
const AFTER_OPTIONS = Object.entries(AFTER_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>);

function StockUsage({ e, reload }) {
  const { data: stock, reload: reloadStock } = useApi('/stock');
  const [f, setF] = useState({ item_id: '', person_id: '', qty: '', kept: 'kept' });
  const [error, setError] = useState(null);
  const { canEdit } = usePermissions();
  const item = stock?.find((i) => String(i.id) === String(f.item_id));
  const holder = item?.holdings.find((h) => String(h.person_id) === String(f.person_id));
  const cost = item && Number(f.qty) > 0 ? item.unit_price * Number(f.qty) : 0;

  const run = async (fn) => {
    try { await fn(); setError(null); reload(); reloadStock(); return true; } catch (err) { setError(err.message); return false; }
  };
  const add = async (ev) => {
    ev.preventDefault();
    if (await run(() => api.post(`/events/${e.id}/stock`, f))) setF({ item_id: '', person_id: '', qty: '', kept: f.kept });
  };

  return (
    <div className="card">
      <div className="card-pad card-head" style={{ marginBottom: 0 }}>
        <div><h2>Products from stock</h2><p>Cost (price × quantity) is charged to the event. Kept and partly used items stay in stock (fix the count on the Stock page if needed); used-up ones come off it.</p></div>
        <span className="muted">{money(e.stock_cost)}</span>
      </div>
      {error && <div className="error-box" style={{ margin: '0 22px 12px' }}>{error}</div>}
      {e.stock.length > 0 && (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Product</th><th className="hide-sm">Taken from</th><th className="r hide-sm">Qty</th><th className="hide-sm">After the event</th><th className="r hide-sm">Price</th><th className="r">Cost</th>{canEdit && <th />}</tr></thead>
            <tbody>
              {e.stock.map((s) => (
                <tr key={s.id}>
                  <td>{s.item_name}<div className="row-sub show-sm">{number(s.qty)} {s.unit} × {money(s.unit_price)} · from {s.person_name || '—'} · {AFTER_LABELS[afterKey(s.kept)].toLowerCase()}</div></td>
                  <td className="secondary hide-sm">{s.person_name || '—'}</td>
                  <td className="r hide-sm">{number(s.qty)} {s.unit}</td>
                  <td className="hide-sm">
                    {canEdit ? (
                      <select className="select-sm" value={afterKey(s.kept)} aria-label={`${s.item_name} after the event`}
                        onChange={(ev) => run(() => api.put(`/event-stock/${s.id}`, { kept: ev.target.value }))}>
                        {AFTER_OPTIONS}
                      </select>
                    ) : AFTER_LABELS[afterKey(s.kept)]}
                  </td>
                  <td className="r hide-sm">{money(s.unit_price)}</td>
                  <td className="r kind-expense">−{money(s.cost)}</td>
                  {canEdit && (
                    <td className="r actions">
                      <button className="icon-btn" aria-label="Remove and return to stock" title="Remove and return to stock"
                        onClick={() => confirmDelete(s.kept ? 'this line' : `this line (${number(s.qty)} ${s.unit} go back to ${s.person_name || 'stock'})`) && run(() => api.del(`/event-stock/${s.id}`))}><IconTrash /></button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {canEdit && <form className="inline-form" onSubmit={add}>
        <select className="select-sm" value={f.item_id} onChange={(ev) => setF({ ...f, item_id: ev.target.value, person_id: '', qty: '' })} required>
          <option value="">Product…</option>
          {stock?.map((i) => <option key={i.id} value={i.id} disabled={!i.qty}>{i.name} · {money(i.unit_price)}/{i.unit} ({number(i.qty)} left)</option>)}
        </select>
        <select className="select-sm" value={f.person_id} onChange={(ev) => setF({ ...f, person_id: ev.target.value })} required disabled={!item}>
          <option value="">From…</option>
          {item?.holdings.filter((h) => h.qty > 0).map((h) => <option key={h.person_id} value={h.person_id}>{h.name} ({number(h.qty)})</option>)}
        </select>
        <input className="select-sm num-input" type="number" min="0.01" step="any" max={holder?.qty} placeholder="Qty" value={f.qty}
          onChange={(ev) => setF({ ...f, qty: ev.target.value })} required aria-label="Quantity" />
        <select className="select-sm" value={f.kept} onChange={(ev) => setF({ ...f, kept: ev.target.value })} aria-label="After the event">
          {AFTER_OPTIONS}
        </select>
        <button className="btn btn-sm" disabled={!item}>Add{cost ? ` · ${money(cost)}` : ''}</button>
      </form>}
      {canEdit && stock && !stock.length && <p className="hint" style={{ padding: '0 22px 16px', margin: 0 }}>No products yet — add them on the <Link to="/stock">Stock</Link> page.</p>}
    </div>
  );
}

export default function EventDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: e, error, reload: reloadEvent } = useApi(`/events/${id}`);
  const { data: txs, reload: reloadTx } = useApi(`/transactions?event_id=${id}`);
  const { data: monthSplit } = useApi(e ? `/splits/${e.date.slice(0, 7)}` : null); // the event's month may have its own targets
  const split = monthSplit?.split;
  const [editing, setEditing] = useState(false);
  const [txForm, setTxForm] = useState(null); // { kind } | { tx }
  const { canEdit } = usePermissions();

  if (error) return <div className="error-box">{error}</div>;
  if (!e || !txs || !split) return null;

  const reload = () => { reloadEvent(); reloadTx(); };
  const del = async () => {
    if (!confirmDelete(`“${e.name}” with its costs (used stock goes back to its holders)`)) return;
    await api.del(`/events/${e.id}`);
    navigate('/events');
  };
  const setStatus = async (status) => { await api.put(`/events/${e.id}/status`, { status }); reload(); };
  const delTx = async (t) => {
    if (!confirmDelete('this transaction')) return;
    await api.del(`/transactions/${t.id}`);
    reload();
  };

  return (
    <div>
      <Link to="/events" className="back-link"><IconChevronLeft width="16" height="16" />Events</Link>
      <div className="page-head">
        <div>
          <h1>{e.name}</h1>
          <p style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <span className="badge">{e.type_name}</span>
            {e.activity_name && <span className="badge">{e.activity_name}</span>}
            <StatusBadge status={e.status} />
            <span>{date(e.date)}{e.end_date ? ` – ${date(e.end_date)}` : ''}</span>
            {e.location && <span>· {e.location}</span>}
            <span>· {e.participants} people × {money0(e.participation_fee)}{e.venue_mode === 'fixed' ? (e.venue_total > 0 ? ` · venue ${money0(e.venue_total)} fixed` : '') : e.venue_fee > 0 ? ` (${money0(e.venue_fee)} to the venue)` : ''}</span>
          </p>
        </div>
        {canEdit && <div className="page-actions">
          {e.status === 'planned' && <button className="btn btn-primary" onClick={() => setStatus('completed')}><IconCheck width="16" />Finalize event</button>}
          {e.status === 'completed' && <button className="btn" onClick={() => setStatus('planned')}>Reopen as live</button>}
          <button className="btn" onClick={() => setEditing(true)}><IconEdit width="15" />Edit</button>
          <button className="btn btn-danger" onClick={del}><IconTrash width="15" />Delete</button>
        </div>}
      </div>

      <div className="grid grid-3-1" style={{ alignItems: 'start' }}>
        <div className="stack">
          <div className="card">
            <div className="card-pad card-head" style={{ marginBottom: 0 }}>
              <div><h2>Costs &amp; extra income</h2><p>Categories decide whether a cost is organizing or a benefit</p></div>
              {canEdit && (
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-sm" onClick={() => setTxForm({ kind: 'expense' })}><IconPlus width="14" />Cost</button>
                  <button className="btn btn-sm" onClick={() => setTxForm({ kind: 'income' })}><IconPlus width="14" />Income</button>
                </div>
              )}
            </div>
            <div className="table-wrap">
              <TxTable rows={txs} showEvent={false} showGroup compact onEdit={(t) => setTxForm({ tx: t })} onDelete={delTx}
                empty="No costs recorded yet. Fee income comes from people × fee." />
            </div>
          </div>
          <Attendees e={e} reload={reload} />
          <Discounts e={e} reload={reload} />
          <StockUsage e={e} reload={reload} />
          <Tasks e={e} reload={reload} />
        </div>
        <div className="stack">
          <Statement e={e} split={split} />
          {e.budget > 0 && (
            <div className="card card-pad">
              <div className="card-head"><h2>Budget</h2><span className="muted">{money0(e.budget)}</span></div>
              <div className="progress"><div style={{ width: `${Math.min(e.expenses / e.budget, 1) * 100}%`, background: e.expenses > e.budget ? 'var(--profit-neg)' : 'var(--series)' }} /></div>
              <p className="secondary" style={{ margin: '8px 0 0' }}>{money0(e.expenses)} spent · {Math.round((e.expenses / e.budget) * 100)}% of budget</p>
            </div>
          )}
          {e.notes && (
            <div className="card card-pad">
              <div className="card-head"><h2>Notes</h2></div>
              <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{e.notes}</p>
            </div>
          )}
        </div>
      </div>

      {editing && <EventForm event={e} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); reload(); }} />}
      {txForm && (
        <TxForm tx={txForm.tx} defaultKind={txForm.kind} eventId={e.id} eventDate={e.date}
          onClose={() => setTxForm(null)} onSaved={() => { setTxForm(null); reload(); }} />
      )}
    </div>
  );
}
