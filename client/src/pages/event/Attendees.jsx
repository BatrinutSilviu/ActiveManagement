import { useState } from 'react';
import { api } from '../../api.js';
import { useAction, useApi, useCanRun } from '../../hooks.js';
import { money } from '../../format.js';
import CardError from '../../components/CardError.jsx';
import { IconTrash } from '../../components/Icons.jsx';
import NameInput from '../../components/NameInput.jsx';
import Select from '../../components/Select.jsx';
import { fold } from '../../util.js';
import { t, tn } from '../../i18n/index.js';

/** Optional list of who came, with ticks for who has paid the advance (when the event has one) and who has paid in full. */
export default function Attendees({ e, reload }) {
  const { data: people } = useApi('/people');
  const [name, setName] = useState('');
  const [error, run] = useAction(reload);
  const canEdit = useCanRun(e);

  const listed = new Set(e.attendees.map((a) => fold(a.name)));
  const owes = (a) => a.own_price; // their price, less their member price or discount (from the server)
  const advance = e.advance_fee || 0;
  // What's still to come from someone: nothing once paid in full, the rest once the advance is in.
  const left = (a) => (a.paid ? 0 : a.advance_paid ? Math.max(owes(a) - advance, 0) : owes(a));
  // Those who dropped out are listed apart (see below); the counts are of those still coming.
  const coming = e.attendees.filter((a) => !a.dropped);
  const dropped = e.attendees.filter((a) => a.dropped);
  const paid = coming.filter((a) => a.paid);
  const advanced = coming.filter((a) => a.paid || a.advance_paid);
  const toCollect = coming.reduce((s, a) => s + left(a), 0);
  const setDropped = (a, dropped) => run(() => api.put(`/event-attendees/${a.id}`, { dropped }));
  // Signed up in the other app: it decides who is coming (they drop out by leaving its list), not this page.
  const fromApp = (a) => !!(a.synced && e.source);
  const undecided = dropped.filter((a) => a.dropped === 'undecided').length;
  const tick = (a, k, label) => (
    <input type="checkbox" checked={!!a[k]} disabled={!canEdit} aria-label={label}
      onChange={(ev) => run(() => api.put(`/event-attendees/${a.id}`, { [k]: ev.target.checked }))} />
  );

  const add = async (ev) => {
    ev.preventDefault();
    if (await run(() => api.post(`/events/${e.id}/attendees`, { name }))) setName('');
  };

  return (
    <div className="card">
      <div className="card-pad card-head" style={{ marginBottom: 0 }}>
        <div>
          <h2>{t('Attendees')}</h2>
          <p>{coming.length
            ? `${advance ? `${t('{paid} of {n} paid the advance', { paid: advanced.length, n: coming.length })} · ` : ''}${t('{paid} of {n} paid', { paid: paid.length, n: coming.length })}${toCollect > 0 ? ` · ${t('{amount} still to collect', { amount: money(toCollect) })}` : ''}`
            : t(advance ? 'Optional — list who came and tick who has paid the advance and who has paid in full' : 'Optional — list who came and tick who has paid')}</p>
        </div>
      </div>
      <CardError error={error} />
      {coming.length > 0 && (
        <div className="table-wrap">
          <table>
            <thead><tr>
              {advance > 0 && <th style={{ width: 70 }} title={t('Advance: {amount}', { amount: money(advance) })}>{t('Advance')}</th>}
              <th style={{ width: 70 }}>{t(advance ? 'Paid in full' : 'Paid')}</th>
              <th>{t('Person')}</th><th className="r">{t('Pays')}</th><th className="r hide-sm">{t('Left to pay')}</th>{canEdit && <th />}
            </tr></thead>
            <tbody>
              {coming.map((a) => (
                <tr key={a.id}>
                  {advance > 0 && <td>{tick(a, 'advance_paid', t('{name} paid the advance', { name: a.name }))}</td>}
                  <td>{tick(a, 'paid', t('{name} paid', { name: a.name }))}</td>
                  <td>{a.name}{a.is_member ? <span className="badge hide-sm" style={{ marginLeft: 6 }}>{t('Member')}</span> : null}
                    {a.synced && e.source ? <span className="badge hide-sm" style={{ marginLeft: 6 }} title={t('Signed up in the {app} app: kept in step with its list', { app: e.source })}>{e.source}</span> : null}</td>
                  <td className={`r ${a.paid ? 'secondary' : ''}`}>{money(owes(a))}</td>
                  <td className={`r hide-sm ${left(a) ? '' : 'secondary'}`}>{money(left(a))}</td>
                  {canEdit && <td className="r actions">
                    {(a.paid || a.advance_paid) && !fromApp(a) ? <button className="link-btn" style={{ marginRight: 8 }} onClick={() => setDropped(a, 'undecided')}
                      title={t('They paid but won’t come: decide whether we keep what they paid or refund it')}>{t('Dropped out')}</button> : null}
                    <button className="icon-btn" aria-label={t('Remove')} onClick={() => run(() => api.del(`/event-attendees/${a.id}`))}><IconTrash /></button>
                  </td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {dropped.length > 0 && (
        <>
          <div className="card-pad" style={{ paddingBottom: 0 }}>
            <h3 style={{ margin: 0 }}>{t('Dropped out')}</h3>
            <p className={`hint ${undecided ? 'neg' : ''}`} style={{ margin: '4px 0 0' }}>{undecided
              ? tn(undecided, '{n} person paid and dropped out — keep what they paid or refund it?', '{n} people paid and dropped out — keep what they paid or refund it?')
              : t('What we kept counts as income from fees')}</p>
          </div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>{t('Person')}</th><th className="r">{t('Had paid')}</th><th>{t('What we did')}</th>{canEdit && <th />}</tr></thead>
              <tbody>
                {dropped.map((a) => (
                  <tr key={a.id}>
                    <td>{a.name}{a.synced && e.source ? <span className="badge hide-sm" style={{ marginLeft: 6 }}>{e.source}</span> : null}</td>
                    <td className="r">{money(a.paid_in)} <span className="muted hide-sm">{t(a.paid ? 'in full' : 'advance')}</span></td>
                    <td>
                      <Select className="select-sm" value={a.dropped} disabled={!canEdit} onChange={(ev) => setDropped(a, ev.target.value)}>
                        <option value="undecided">{t('Not decided yet')}</option>
                        <option value="kept">{t('Kept it')}</option>
                        <option value="refunded">{t('Refunded it')}</option>
                      </Select>
                    </td>
                    {canEdit && <td className="r actions">
                      {!fromApp(a) && <button className="link-btn" style={{ marginRight: 8 }} onClick={() => setDropped(a, null)}>{t('Coming after all')}</button>}
                      <button className="icon-btn" aria-label={t('Remove')} onClick={() => run(() => api.del(`/event-attendees/${a.id}`))}><IconTrash /></button>
                    </td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      {e.source && e.attendees.some((a) => a.synced) && (
        <p className="hint" style={{ padding: '10px 22px 0', margin: 0 }}>
          {t(advance
            ? 'The list follows the {app} app’s sign-ups (advance ticked = confirmed there); names added here stay.'
            : 'The list follows the {app} app’s sign-ups (ticked = confirmed there); names added here stay.', { app: e.source })}
        </p>
      )}
      {coming.length > 0 && coming.length !== e.participants && (
        <p className="hint" style={{ padding: '10px 22px 0', margin: 0 }}>
          {t('The list has {n} people but the event counts {count} participants — the money uses the count (Edit to change it).', { n: coming.length, count: e.participants })}
        </p>
      )}
      {canEdit && <form className="inline-form" onSubmit={add}>
        <div style={{ flex: '1 1 200px' }}>
          <NameInput people={people} value={name} onChange={setName} exclude={(p) => listed.has(fold(p.name))}
            className="select-sm" placeholder={t('Name')} required ariaLabel={t('Attendee name')} />
        </div>
        <button className="btn btn-sm">{t('Add')}</button>
      </form>}
    </div>
  );
}
