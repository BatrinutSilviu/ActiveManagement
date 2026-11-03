import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useApi, usePermissions, usePersistentState } from '../hooks.js';
import { date, money, money0, today } from '../format.js';
import Modal from '../components/Modal.jsx';
import Kpi from '../components/Kpi.jsx';
import { IconEdit, IconPlus, IconTrash } from '../components/Icons.jsx';

const STATUS = { open: 'Not used yet', used: 'Used', expired: 'Expired' };

/** Give a voucher (from an event, or on its own) or edit one. */
export function VoucherForm({ voucher, event, onClose, onSaved }) {
  const { data: people } = useApi('/people');
  const { data: types } = useApi('/event-types');
  const { data: events } = useApi('/events');
  const padel = types?.find((t) => /padel/i.test(t.name));
  const [f, setF] = useState(() => ({
    person_id: '', value: '', code: '', expires: '', note: '', event_id: event?.id || '', sport_id: event?.type_id || '', ...(voucher || {}),
  }));
  const [error, setError] = useState(null);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const sportId = f.sport_id || padel?.id || '';
  const save = async () => {
    try {
      const body = { ...f, sport_id: sportId };
      if (voucher) await api.put(`/vouchers/${voucher.id}`, body);
      else await api.post('/vouchers', body);
      onSaved();
    } catch (e) { setError(e.message); }
  };
  // Picking the event it was won at also picks its sport.
  const pickEvent = (e) => {
    const ev = events?.find((x) => String(x.id) === e.target.value);
    setF({ ...f, event_id: e.target.value, sport_id: ev ? ev.type_id : f.sport_id });
  };
  return (
    <Modal title={voucher ? 'Edit voucher' : 'Give a voucher'} onClose={onClose} onSubmit={save}
      footer={<><button type="button" className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary">Save</button></>}>
      {error && <div className="error-box">{error}</div>}
      <div className="form-grid">
        <label className="field">Won by
          <select value={f.person_id} onChange={set('person_id')} required>
            <option value="">Choose person…</option>
            {people?.filter((p) => p.active || p.id === f.person_id).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        <label className="field">Value (RON)
          <input type="number" min="0" step="0.01" value={f.value} onChange={set('value')} placeholder="e.g. 100" required />
          <span className="hint">What we expect to pay when it’s used</span>
        </label>
        {event ? (
          <p className="hint full" style={{ margin: 0 }}>Won at {event.name} · paid from the {event.type_name} fund when used</p>
        ) : (
          <>
            <label className="field">Won at (optional)
              <select value={f.event_id || ''} onChange={pickEvent}>
                <option value="">— not at an event —</option>
                {events?.filter((e) => e.status !== 'cancelled').slice(0, 150).map((e) => <option key={e.id} value={e.id}>{date(e.date)} · {e.name}</option>)}
              </select>
            </label>
            <label className="field">Paid from the fund of
              <select value={sportId} onChange={set('sport_id')} required>
                <option value="">Choose…</option>
                {types?.map((t) => <option key={t.id} value={t.id}>{t.name}{t.is_sport ? '' : ' (general fund)'}</option>)}
              </select>
            </label>
          </>
        )}
        <label className="field">Code (optional)<input value={f.code || ''} onChange={set('code')} placeholder="Printed on the voucher" /></label>
        <label className="field">Valid until (optional)<input type="date" value={f.expires || ''} onChange={set('expires')} /></label>
        <label className="field full">Note<input value={f.note || ''} onChange={set('note')} placeholder="e.g. 1h court at Padel Arena" /></label>
      </div>
    </Modal>
  );
}

/** Mark a voucher used: what we paid is spent from its sport's fund on that day (shows in Transactions). */
function UseForm({ voucher, onClose, onSaved }) {
  const [f, setF] = useState({ date: today(), amount: String(voucher.value) });
  const [error, setError] = useState(null);
  const save = async () => {
    try { await api.post(`/vouchers/${voucher.id}/use`, f); onSaved(); } catch (e) { setError(e.message); }
  };
  return (
    <Modal title="Voucher used" onClose={onClose} onSubmit={save}
      footer={<><button type="button" className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary">Save</button></>}>
      {error && <div className="error-box">{error}</div>}
      <p className="hint" style={{ margin: 0 }}>{voucher.person_name}’s voucher{voucher.event_name ? ` from ${voucher.event_name}` : ''}.
        What we paid is recorded as money spent from the {voucher.is_sport ? `${voucher.sport_name} fund` : 'general fund'} on that day, and shows in Transactions.</p>
      <div className="form-grid">
        <label className="field">Used on<input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} required /></label>
        <label className="field">We paid (RON)<input type="number" min="0" step="0.01" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} required /></label>
      </div>
    </Modal>
  );
}

/** The vouchers table, used on this page and on an event's page. */
export function VoucherTable({ list, reload, showEvent = true, setForm }) {
  const { canEdit } = usePermissions();
  const [using, setUsing] = useState(null);
  const [error, setError] = useState(null);
  const run = async (fn) => { try { await fn(); setError(null); reload(); } catch (e) { setError(e.message); } };
  return (
    <>
      {error && <div className="error-box" style={{ margin: '0 22px 12px' }}>{error}</div>}
      <div className="table-wrap">
        <table>
          <thead><tr><th>Won by</th>{showEvent && <th className="hide-sm">Won at</th>}<th className="r">Value</th><th>Status</th>{canEdit && <th />}</tr></thead>
          <tbody>
            {list.map((v) => (
              <tr key={v.id}>
                <td className="cell-wrap">
                  {v.person_name}
                  <div className="row-sub">{[v.code, v.note, v.expires && v.status !== 'used' && `valid until ${date(v.expires)}`].filter(Boolean).join(' · ')}</div>
                  {showEvent && <div className="row-sub show-sm">{v.event_name || 'Not at an event'} · {date(v.issued_date)}</div>}
                </td>
                {showEvent && (
                  <td className="cell-wrap hide-sm">
                    {v.event_id ? <Link to={`/events/${v.event_id}`}>{v.event_name}</Link> : <span className="muted">Not at an event</span>}
                    <div className="row-sub">{date(v.issued_date)} · {v.sport_name}{v.is_sport ? ' fund' : ''}</div>
                  </td>
                )}
                <td className="r">{money(v.value)}</td>
                <td>
                  <span className={`badge ${v.status === 'used' ? 'status-completed' : v.status === 'expired' ? 'status-cancelled' : 'status-planned'}`}>{STATUS[v.status]}</span>
                  {v.status === 'used' && <div className="row-sub">{date(v.used_date)}{v.cost != null ? ` · paid ${money(v.cost)}` : ''}</div>}
                </td>
                {canEdit && (
                  <td className="r actions">
                    {v.status !== 'used'
                      ? <button className="btn btn-sm" onClick={() => setUsing(v)}>Used</button>
                      : <button className="btn btn-sm btn-ghost" onClick={() => window.confirm('Mark this voucher as not used? Its cost is removed from the fund.') && run(() => api.del(`/vouchers/${v.id}/use`))}>Undo</button>}
                    <button className="icon-btn" aria-label="Edit voucher" onClick={() => setForm({ voucher: v })}><IconEdit /></button>
                    <button className="icon-btn" aria-label="Delete voucher"
                      onClick={() => window.confirm(`Delete ${v.person_name}’s voucher?${v.status === 'used' ? ' Its cost is removed from the fund too.' : ''}`) && run(() => api.del(`/vouchers/${v.id}`))}><IconTrash /></button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {using && <UseForm voucher={using} onClose={() => setUsing(null)} onSaved={() => { setUsing(null); reload(); }} />}
    </>
  );
}

export default function Vouchers() {
  const { data, reload } = useApi('/vouchers');
  const [show, setShow] = usePersistentState('am-vouchers-show', 'open');
  const [form, setForm] = useState(null);
  const { canEdit } = usePermissions();
  if (!data) return null;
  const open = data.filter((v) => v.status === 'open');
  const used = data.filter((v) => v.status === 'used');
  const expired = data.filter((v) => v.status === 'expired');
  const list = show === 'all' ? data : data.filter((v) => v.status === show);
  const sum = (l, k) => l.reduce((a, v) => a + (v[k] || 0), 0);

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Vouchers</h1>
          <p>Prizes people win at events (e.g. padel court time) and use later. When one is used, what we pay is spent from its sport’s fund that day.</p>
        </div>
        {canEdit && <button className="btn btn-primary" onClick={() => setForm({})}><IconPlus width="16" />Give a voucher</button>}
      </div>
      <div className="stack">
        <div className="grid grid-kpi">
          <Kpi label="Not used yet" hero value={money0(sum(open, 'value'))} sub={`${open.length} voucher${open.length === 1 ? '' : 's'} — the funds will pay these`} />
          <Kpi label="Used" value={money0(sum(used, 'cost'))} sub={`${used.length} voucher${used.length === 1 ? '' : 's'} · paid from the funds`} />
          <Kpi label="Expired" value={expired.length} sub={expired.length ? `${money0(sum(expired, 'value'))} not used in time` : 'none'} />
        </div>
        <div className="segmented" style={{ alignSelf: 'flex-start' }}>
          {[['open', 'Not used'], ['used', 'Used'], ['expired', 'Expired'], ['all', 'All']].map(([k, l]) => (
            <button key={k} className={show === k ? 'on' : ''} onClick={() => setShow(k)}>{l}</button>
          ))}
        </div>
        <div className="card">
          {list.length ? <VoucherTable list={list} reload={reload} setForm={setForm} />
            : <div className="empty">{data.length ? 'No vouchers here.' : 'No vouchers yet. Give one from an event’s page, or with “Give a voucher”.'}</div>}
        </div>
      </div>
      {form && <VoucherForm voucher={form.voucher} onClose={() => setForm(null)} onSaved={() => { setForm(null); reload(); }} />}
    </div>
  );
}
