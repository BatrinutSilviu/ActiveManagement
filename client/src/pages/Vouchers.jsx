import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useAction, useApi, usePermissions, usePersistentState } from '../hooks.js';
import { CURRENCY, date, money, money0, number, today } from '../format.js';
import Modal from '../components/Modal.jsx';
import Kpi from '../components/Kpi.jsx';
import { IconEdit, IconPlus, IconTrash } from '../components/Icons.jsx';
import Select from '../components/Select.jsx';
import NameInput from '../components/NameInput.jsx';
import CardError from '../components/CardError.jsx';
import { t, tn } from '../i18n/index.js';

// English labels; translated at render time.
const STATUS = { open: 'Not used yet', used: 'Used', expired: 'Expired' };
const isPct = (v) => v.percent != null;
/** What a voucher is worth: a fixed value, or a % off (its real cost is entered when it's used). */
export const voucherWorth = (v) => (isPct(v) ? t('{n}% off', { n: number(v.percent) }) : money(v.value));

/** Give a voucher (from an event, or on its own) or edit one. */
export function VoucherForm({ voucher, event, onClose, onSaved }) {
  const { data: people } = useApi('/people');
  const { data: types } = useApi('/event-types');
  const { data: events } = useApi('/events');
  const padel = types?.find((x) => /padel/i.test(x.name));
  const [f, setF] = useState(() => ({
    value: '', percent: '', code: '', expires: '', note: '', event_id: event?.id || '', sport_id: event?.type_id || '', ...(voucher || {}), name: voucher?.person_name || '',
    kind: voucher && !isPct(voucher) ? 'value' : 'percent',
  }));
  const [error, setError] = useState(null);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const sportId = f.sport_id || padel?.id || '';
  const save = async () => {
    try {
      const body = { ...f, person_id: null, sport_id: sportId }; // by name: linked to People on the server when it matches
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
    <Modal title={voucher ? t('Edit voucher') : t('Give a voucher')} onClose={onClose} onSubmit={save}
      footer={<><button type="button" className="btn" onClick={onClose}>{t('Cancel')}</button><button className="btn btn-primary">{t('Save')}</button></>}>
      {error && <div className="error-box">{error}</div>}
      <div className="form-grid">
        <div className="field">{t('Won by')}
          <NameInput people={people} value={f.name} onChange={(name) => setF((x) => ({ ...x, name }))}
            required autoFocus={!voucher} placeholder={t('Winner’s name')} ariaLabel={t('Won by')} />
        </div>
        <div className="field">{t('Worth')}
          <div className="segmented">
            <button type="button" className={f.kind === 'percent' ? 'on' : ''} onClick={() => setF({ ...f, kind: 'percent' })}>{t('Percent off')}</button>
            <button type="button" className={f.kind === 'value' ? 'on' : ''} onClick={() => setF({ ...f, kind: 'value' })}>{t('Fixed value')}</button>
          </div>
        </div>
        {f.kind === 'percent' ? (
          <label className="field">{t('Discount (%)')}
            <input type="number" min="1" max="100" step="any" value={f.percent ?? ''} onChange={set('percent')} placeholder={t('e.g. {n}', { n: 50 })} required />
            <span className="hint">{t('When it’s used, you enter what it actually cost us')}</span>
          </label>
        ) : (
          <label className="field">{t('Value ({currency})', { currency: CURRENCY })}
            <input type="number" min="0" step="0.01" value={f.value} onChange={set('value')} placeholder={t('e.g. {n}', { n: 100 })} required />
            <span className="hint">{t('What we expect to pay when it’s used')}</span>
          </label>
        )}
        {event ? (
          <p className="hint full" style={{ margin: 0 }}>{t('Won at {event} · paid from the {sport} fund when used', { event: event.name, sport: event.type_name })}</p>
        ) : (
          <>
            <label className="field">{t('Won at (optional)')}
              <Select value={f.event_id || ''} onChange={pickEvent}>
                <option value="">— {t('not at an event')} —</option>
                {events?.filter((e) => e.status !== 'cancelled').slice(0, 150).map((e) => <option key={e.id} value={e.id}>{date(e.date)} · {e.name}</option>)}
              </Select>
            </label>
            <label className="field">{t('Paid from the fund of')}
              <Select value={sportId} onChange={set('sport_id')} required>
                <option value="">{t('Choose…')}</option>
                {types?.map((x) => <option key={x.id} value={x.id}>{x.name}{x.is_sport ? '' : ` (${t('general fund')})`}</option>)}
              </Select>
            </label>
          </>
        )}
        <label className="field">{t('Code (optional)')}<input value={f.code || ''} onChange={set('code')} placeholder={t('Printed on the voucher')} /></label>
        <label className="field">{t('Valid until (optional)')}<input type="date" value={f.expires || ''} onChange={set('expires')} /></label>
        <label className="field full">{t('Note')}<input value={f.note || ''} onChange={set('note')} placeholder={t('e.g. 1h court at Padel Arena')} /></label>
      </div>
    </Modal>
  );
}

/** A % voucher is used at a training of its sport: its % of what the person pays there comes from the sport's fund. */
/** Mark a voucher used: what we paid is spent from its sport's fund on that day (shows in Transactions). */
function UseForm({ voucher, onClose, onSaved }) {
  return <UseValueForm voucher={voucher} onClose={onClose} onSaved={onSaved} />;
}

function UseValueForm({ voucher, onClose, onSaved }) {
  const [f, setF] = useState({ date: today(), amount: isPct(voucher) ? '' : String(voucher.value) });
  const [error, setError] = useState(null);
  const save = async () => {
    try { await api.post(`/vouchers/${voucher.id}/use`, f); onSaved(); } catch (e) { setError(e.message); }
  };
  return (
    <Modal title={t('Voucher used')} onClose={onClose} onSubmit={save}
      footer={<><button type="button" className="btn" onClick={onClose}>{t('Cancel')}</button><button className="btn btn-primary">{t('Save')}</button></>}>
      {error && <div className="error-box">{error}</div>}
      <p className="hint" style={{ margin: 0 }}>{isPct(voucher)
          ? t('{name}’s {pct}% voucher', { name: voucher.person_name, pct: number(voucher.percent) })
          : t('{name}’s voucher', { name: voucher.person_name })}{voucher.event_name ? ` ${t('from {event}', { event: voucher.event_name })}` : ''}.
        {isPct(voucher) ? ` ${t('Enter what it actually cost us.')}` : ''}
        {' '}{t('What we paid is recorded as money spent from the {fund} on that day, and shows in Transactions.', { fund: voucher.is_sport ? t('{sport} fund', { sport: voucher.sport_name }) : t('general fund') })}</p>
      <div className="form-grid">
        <label className="field">{t('Used on')}<input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} required /></label>
        <label className="field">{t('We paid ({currency})', { currency: CURRENCY })}<input type="number" min="0" step="0.01" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} required autoFocus={isPct(voucher)} placeholder={t('e.g. {n}', { n: 45 })} /></label>
      </div>
    </Modal>
  );
}

/** The vouchers table, used on this page and on an event's page. */
export function VoucherTable({ list, reload, showEvent = true, setForm }) {
  const { canEdit } = usePermissions();
  const [using, setUsing] = useState(null);
  const [error, run] = useAction(reload);
  return (
    <>
      <CardError error={error} />
      <div className="table-wrap">
        <table>
          <thead><tr><th>{t('Won by')}</th>{showEvent && <th className="hide-sm">{t('Won at')}</th>}<th className="r">{t('Value')}</th><th>{t('Status')}</th>{canEdit && <th />}</tr></thead>
          <tbody>
            {list.map((v) => (
              <tr key={v.id}>
                <td className="cell-wrap">
                  {v.person_name}
                  <div className="row-sub">{[v.code, v.note, v.expires && v.status !== 'used' && t('valid until {date}', { date: date(v.expires) })].filter(Boolean).join(' · ')}</div>
                  {showEvent && <div className="row-sub show-sm">{v.event_name || t('Not at an event')} · {date(v.issued_date)}</div>}
                </td>
                {showEvent && (
                  <td className="cell-wrap hide-sm">
                    {v.event_id ? <Link to={`/events/${v.event_id}`}>{v.event_name}</Link> : <span className="muted">{t('Not at an event')}</span>}
                    <div className="row-sub">{date(v.issued_date)} · {v.is_sport ? t('{sport} fund', { sport: v.sport_name }) : v.sport_name}</div>
                  </td>
                )}
                <td className="r">{voucherWorth(v)}</td>
                <td>
                  <span className={`badge ${v.status === 'used' ? 'status-completed' : v.status === 'expired' ? 'status-cancelled' : 'status-planned'}`}>{t(STATUS[v.status])}</span>
                  {v.status === 'used' && <div className="row-sub">{date(v.used_date)}{v.cost != null ? ` · ${t('paid {amount}', { amount: money(v.cost) })}` : ''}
                    {v.used_event_id && <> · {t('at')} <Link to={`/events/${v.used_event_id}`}>{v.used_event_name}</Link></>}</div>}
                </td>
                {canEdit && (
                  <td className="r actions">
                    {v.status !== 'used'
                      ? <button className="btn btn-sm" onClick={() => setUsing(v)}>{t('Used')}</button>
                      : <button className="btn btn-sm btn-ghost" onClick={() => window.confirm(t('Mark this voucher as not used? Its cost is removed from the fund.')) && run(() => api.del(`/vouchers/${v.id}/use`))}>{t('Undo')}</button>}
                    <button className="icon-btn" aria-label={t('Edit voucher')} onClick={() => setForm({ voucher: v })}><IconEdit /></button>
                    <button className="icon-btn" aria-label={t('Delete voucher')}
                      onClick={() => window.confirm(t('Delete {name}’s voucher?', { name: v.person_name }) + (v.status === 'used' ? ` ${t('Its cost is removed from the fund too.')}` : '')) && run(() => api.del(`/vouchers/${v.id}`))}><IconTrash /></button>
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
          <h1>{t('Vouchers')}</h1>
          <p>{t('Prizes people win at events and use later: a fixed value (e.g. padel court time), or a % off. When one is used, what we paid for it is spent from its sport’s fund.')}</p>
        </div>
        {canEdit && <button className="btn btn-primary" onClick={() => setForm({})}><IconPlus width="16" />{t('Give a voucher')}</button>}
      </div>
      <div className="stack">
        <div className="grid grid-kpi">
          <Kpi label={t('Not used yet')} hero value={money0(sum(open, 'value'))} sub={`${tn(open.length, '{n} voucher', '{n} vouchers')} — ${t('the funds will pay these')}${open.some(isPct) ? ` · ${t('{n} % off, valued when used', { n: open.filter(isPct).length })}` : ''}`} />
          <Kpi label={t('Used')} value={money0(sum(used, 'cost'))} sub={`${tn(used.length, '{n} voucher', '{n} vouchers')} · ${t('paid from the funds')}`} />
          <Kpi label={t('Expired')} value={expired.length} sub={expired.length ? (sum(expired, 'value') ? t('{amount} not used in time', { amount: money0(sum(expired, 'value')) }) : t('not used in time')) : t('none')} />
        </div>
        <div className="segmented" style={{ alignSelf: 'flex-start' }}>
          {[['open', 'Not used'], ['used', 'Used'], ['expired', 'Expired'], ['all', 'All']].map(([k, l]) => (
            <button key={k} className={show === k ? 'on' : ''} onClick={() => setShow(k)}>{t(l)}</button>
          ))}
        </div>
        <div className="card">
          {list.length ? <VoucherTable list={list} reload={reload} setForm={setForm} />
            : <div className="empty">{data.length ? t('No vouchers here.') : t('No vouchers yet. Give one from an event’s page, or with “Give a voucher”.')}</div>}
        </div>
      </div>
      {form && <VoucherForm voucher={form.voucher} onClose={() => setForm(null)} onSaved={() => { setForm(null); reload(); }} />}
    </div>
  );
}
