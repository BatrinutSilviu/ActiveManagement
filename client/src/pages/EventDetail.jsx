import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useApi, useChartColors, usePermissions } from '../hooks.js';
import { date, money, money0, number, signedMoney } from '../format.js';
import EventForm, { DEFAULT_POINTS } from '../components/EventForm.jsx';
import TxForm from '../components/TxForm.jsx';
import TxTable from '../components/TxTable.jsx';
import { confirmDelete } from '../components/Modal.jsx';
import { IconCheck, IconEdit, IconPlus, IconTrash } from '../components/Icons.jsx';
import { StatusBadge } from './Events.jsx';
import { pctLabel } from './Dashboard.jsx';

/** The per-event statement the founders asked for: income, costs, profit and how it is split. */
function Statement({ e, split }) {
  const c = useChartColors();
  const s = e.split;
  const parts = [
    { key: 'founders', label: 'Founders', color: c.founders, value: s.founders },
    { key: 'sport', label: `${e.type_name} fund`, color: c.sportfund, value: s.sport },
    { key: 'general', label: 'General fund', color: c.general, value: s.general },
  ];
  const community = 100 - split.foundersStandard - split.foundersPoints;
  return (
    <div className="card card-pad">
      <div className="card-head">
        <div><h2>Event statement</h2><p>{e.status === 'completed' ? 'Finalized — included in the funds' : 'Live — added to the funds when finalized'}</p></div>
      </div>
      <dl className="statement">
        <dt>Income from fees <span className="muted">{e.participants} × {money(e.participation_fee)}</span></dt><dd>{money(e.fee_gross)}</dd>
        {e.member_discounts > 0 && <><dt>Member prices <span className="muted">{e.member_count} members paid only {money(e.venue_fee)}</span></dt><dd className="neg">−{money(e.member_discounts)}</dd></>}
        {e.discounts > 0 && <><dt>Discounts <span className="muted">{e.discount_count} people paid less</span></dt><dd className="neg">−{money(e.discounts)}</dd></>}
        {e.other_income > 0 && <><dt>Other income <span className="muted">sponsors, etc.</span></dt><dd>{money(e.other_income)}</dd></>}
        <dt>Organizing costs <span className="muted">{e.venue_cost > 0 ? `venue ${e.participants} × ${money(e.venue_fee)}${e.organizing > e.venue_cost ? ' + other costs' : ''}` : 'venues, trainers…'}</span></dt><dd className={e.organizing ? 'neg' : ''}>{e.organizing ? '−' : ''}{money(e.organizing)}</dd>
        <dt>Benefits offered <span className="muted">water, fruit, balls…</span></dt><dd className={e.benefits ? 'neg' : ''}>{e.benefits ? '−' : ''}{money(e.benefits)}</dd>
        <dt className="total">Total profit</dt><dd className={`total ${e.profit < 0 ? 'neg' : ''}`}>{signedMoney(e.profit)}</dd>
      </dl>
      <div className="split-bar" style={{ margin: '18px 0 14px' }} role="img" aria-label="Profit split">
        {e.profit > 0 && parts.map((p) => <div key={p.key} style={{ width: `${(p.value / e.profit) * 100}%`, background: p.color }} />)}
      </div>
      <dl className="statement">
        <dt><i className="swatch" style={{ background: c.founders }} />Founders & organisers {pctLabel(split.foundersStandard + split.foundersPoints)}
          <span className="muted">{money0(s.standard)} founders · {money0(s.points)} organisers by points</span></dt>
        <dd>{money(s.founders)}</dd>
        <dt><i className="swatch" style={{ background: c.general }} />General community fund <span className="muted">{pctLabel(split.generalShare)} of the {pctLabel(community)}</span></dt>
        <dd>{money(s.general)}</dd>
        <dt><i className="swatch" style={{ background: c.sportfund }} />{e.type_name} reinvestment fund <span className="muted">{pctLabel(100 - split.generalShare)} of the {pctLabel(community)}</span></dt>
        <dd>{money(s.sport)}</dd>
      </dl>
    </div>
  );
}

const discountLabel = (d) => (d.kind === 'percent' ? `−${number(d.value)}%` : `−${money(d.value)}`);
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
  const person = people?.find((p) => String(p.id) === String(f.person_id));
  const applies = (d) => !d.sport_id || d.sport_id === e.type_id;
  // The person's own discounts that apply to this sport, best first; then every other saved discount.
  const own = (discounts || []).filter((d) => person?.discount_ids.includes(d.id) && applies(d))
    .sort((a, b) => discountWorth(b, e.participation_fee) - discountWorth(a, e.participation_fee));
  const others = (discounts || []).filter((d) => !own.includes(d) && applies(d));
  const chosen = discounts?.find((d) => String(d.id) === String(f.discount_id));
  // Members pay only the venue's part of the price.
  const memberPrice = e.venue_fee > 0;
  const memberOff = Math.max(e.participation_fee - e.venue_fee, 0);
  const preview = f.discount_id === 'member' ? memberOff
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
    if (p?.is_member && memberPrice) return setF({ person_id: value, discount_id: 'member', amount: '' });
    const best = (discounts || []).filter((d) => p?.discount_ids.includes(d.id) && applies(d))
      .sort((a, b) => discountWorth(b, e.participation_fee) - discountWorth(a, e.participation_fee))[0];
    setF({ person_id: value, discount_id: best ? String(best.id) : 'custom', amount: '' });
  };
  const add = async (ev) => {
    ev.preventDefault();
    const body = f.discount_id === 'member' ? { person_id: f.person_id, member: true }
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
                  <td>{d.person_name}<div className="row-sub show-sm">{d.member ? 'Member price' : d.discount_name || 'One-off'} · paid {money(Math.max(e.participation_fee - d.amount, 0))}</div></td>
                  <td className="secondary hide-sm">{d.member ? 'Member price' : <>{d.discount_name || 'One-off'} <span className="muted">{discountLabel(d)}</span></>}</td>
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
            <option key={p.id} value={p.id}>{p.name}{p.is_member && memberPrice ? ' · member' : p.discount_ids.length ? ' ★' : ''}</option>
          ))}
          <option value="new">+ New person…</option>
        </select>
        <select className="select-sm" value={f.discount_id} onChange={(ev) => setF({ ...f, discount_id: ev.target.value })} disabled={!person} required>
          <option value="">Discount…</option>
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

function Organizers({ e, reload }) {
  const { data: people } = useApi('/people');
  const { data: activities } = useApi('/activities');
  const act = activities?.find((a) => a.id === e.activity_id);
  const pointsFor = (role) => (act ? (role === 'organizer' ? act.organizer_points : act.co_points) : DEFAULT_POINTS[role]);
  const hasOrganizer = e.people.some((p) => p.role === 'organizer');
  const [f, setF] = useState({ person_id: '', role: 'organizer', points: '' });
  const role = f.role || (hasOrganizer ? 'co-organizer' : 'organizer');
  const points = f.points === '' ? pointsFor(role) : f.points;
  const [error, setError] = useState(null);
  const { canEdit } = usePermissions();
  const run = async (fn) => { try { await fn(); setError(null); reload(); } catch (err) { setError(err.message); } };
  const taken = new Set(e.people.map((p) => p.person_id));
  return (
    <div className="card">
      <div className="card-pad card-head" style={{ marginBottom: 0 }}>
        <div><h2>Organisers</h2><p>{act ? `${act.name}: organiser ${pointsFor('organizer')} pts, co-organiser +${pointsFor('co-organizer')}` : 'Points decide each organiser’s share of the month’s payout'}</p></div>
      </div>
      {error && <div className="error-box" style={{ margin: '0 22px 12px' }}>{error}</div>}
      {e.people.length > 0 && (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Person</th><th>Role</th><th className="r">Points</th>{canEdit && <th />}</tr></thead>
            <tbody>
              {e.people.map((p) => (
                <tr key={p.id}>
                  <td>{p.name}{p.is_founder ? <span className="badge hide-sm" style={{ marginLeft: 6 }}>Founder</span> : null}</td>
                  {canEdit ? (
                    <>
                      <td>
                        <select className="select-sm role-select" value={p.role}
                          onChange={(ev) => run(() => api.put(`/event-people/${p.id}`, { role: ev.target.value, points: p.points }))}>
                          <option value="organizer">Organiser</option>
                          <option value="co-organizer">Co-organiser</option>
                        </select>
                      </td>
                      <td className="r">
                        <input className="select-sm num-input" type="number" min="0" step="0.5" defaultValue={p.points}
                          onBlur={(ev) => Number(ev.target.value) !== p.points && run(() => api.put(`/event-people/${p.id}`, { role: p.role, points: ev.target.value }))} />
                      </td>
                      <td className="r actions"><button className="icon-btn" aria-label="Remove" onClick={() => run(() => api.del(`/event-people/${p.id}`))}><IconTrash /></button></td>
                    </>
                  ) : (
                    <>
                      <td className="secondary">{p.role === 'organizer' ? 'Organiser' : 'Co-organiser'}</td>
                      <td className="r">{number(p.points)}</td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {canEdit && <form className="inline-form" onSubmit={(ev) => { ev.preventDefault(); run(() => api.post(`/events/${e.id}/people`, { person_id: f.person_id, role, points })).then(() => setF({ person_id: '', role: '', points: '' })); }}>
        <select className="select-sm" value={f.person_id} onChange={(ev) => setF({ ...f, person_id: ev.target.value })} required>
          <option value="">Add person…</option>
          {people?.filter((p) => p.active && !taken.has(p.id)).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select className="select-sm" value={role} onChange={(ev) => setF({ ...f, role: ev.target.value, points: '' })}>
          <option value="organizer">Organiser</option>
          <option value="co-organizer">Co-organiser</option>
        </select>
        <input className="select-sm num-input" type="number" min="0" step="0.5" value={points} onChange={(ev) => setF({ ...f, points: ev.target.value })} aria-label="Points" />
        <button className="btn btn-sm">Add</button>
      </form>}
    </div>
  );
}

function StockUsage({ e, reload }) {
  const { data: stock, reload: reloadStock } = useApi('/stock');
  const [f, setF] = useState({ item_id: '', person_id: '', qty: '' });
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
    if (await run(() => api.post(`/events/${e.id}/stock`, f))) setF({ item_id: '', person_id: '', qty: '' });
  };

  return (
    <div className="card">
      <div className="card-pad card-head" style={{ marginBottom: 0 }}>
        <div><h2>Products from stock</h2><p>Cost is price × quantity; the stock goes down automatically</p></div>
        <span className="muted">{money(e.stock_cost)}</span>
      </div>
      {error && <div className="error-box" style={{ margin: '0 22px 12px' }}>{error}</div>}
      {e.stock.length > 0 && (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Product</th><th className="hide-sm">Taken from</th><th className="r hide-sm">Qty</th><th className="r hide-sm">Price</th><th className="r">Cost</th>{canEdit && <th />}</tr></thead>
            <tbody>
              {e.stock.map((s) => (
                <tr key={s.id}>
                  <td>{s.item_name}<div className="row-sub show-sm">{number(s.qty)} {s.unit} × {money(s.unit_price)} · from {s.person_name || '—'}</div></td>
                  <td className="secondary hide-sm">{s.person_name || '—'}</td>
                  <td className="r hide-sm">{number(s.qty)} {s.unit}</td>
                  <td className="r hide-sm">{money(s.unit_price)}</td>
                  <td className="r kind-expense">−{money(s.cost)}</td>
                  {canEdit && (
                    <td className="r actions">
                      <button className="icon-btn" aria-label="Remove and return to stock" title="Remove and return to stock"
                        onClick={() => confirmDelete(`this line (${number(s.qty)} ${s.unit} go back to ${s.person_name || 'stock'})`) && run(() => api.del(`/event-stock/${s.id}`))}><IconTrash /></button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {canEdit && <form className="inline-form" onSubmit={add}>
        <select className="select-sm" value={f.item_id} onChange={(ev) => setF({ item_id: ev.target.value, person_id: '', qty: '' })} required>
          <option value="">Product…</option>
          {stock?.map((i) => <option key={i.id} value={i.id} disabled={!i.qty}>{i.name} · {money(i.unit_price)}/{i.unit} ({number(i.qty)} left)</option>)}
        </select>
        <select className="select-sm" value={f.person_id} onChange={(ev) => setF({ ...f, person_id: ev.target.value })} required disabled={!item}>
          <option value="">From…</option>
          {item?.holdings.filter((h) => h.qty > 0).map((h) => <option key={h.person_id} value={h.person_id}>{h.name} ({number(h.qty)})</option>)}
        </select>
        <input className="select-sm num-input" type="number" min="0.01" step="any" max={holder?.qty} placeholder="Qty" value={f.qty}
          onChange={(ev) => setF({ ...f, qty: ev.target.value })} required aria-label="Quantity" />
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
      <div style={{ marginBottom: 10 }}><Link to="/events">← Events</Link></div>
      <div className="page-head">
        <div>
          <h1>{e.name}</h1>
          <p style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <span className="badge">{e.type_name}</span>
            {e.activity_name && <span className="badge">{e.activity_name}</span>}
            <StatusBadge status={e.status} />
            <span>{date(e.date)}{e.end_date ? ` – ${date(e.end_date)}` : ''}</span>
            {e.location && <span>· {e.location}</span>}
            <span>· {e.participants} people × {money0(e.participation_fee)}{e.venue_fee > 0 ? ` (${money0(e.venue_fee)} to the venue)` : ''}</span>
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
          <Discounts e={e} reload={reload} />
          <StockUsage e={e} reload={reload} />
          <Organizers e={e} reload={reload} />
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
