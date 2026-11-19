import { useState } from 'react';
import { api } from '../../api.js';
import { useAction, useApi, usePermissions } from '../../hooks.js';
import { money } from '../../format.js';
import CardError from '../../components/CardError.jsx';
import { IconTrash } from '../../components/Icons.jsx';
import NameInput from '../../components/NameInput.jsx';
import { fold } from '../../util.js';
import { t } from '../../i18n/index.js';

/** Optional list of who came, with a tick for who has paid. */
export default function Attendees({ e, reload }) {
  const { data: people } = useApi('/people');
  const [name, setName] = useState('');
  const [error, run] = useAction(reload);
  const { canEdit } = usePermissions();

  const listed = new Set(e.attendees.map((a) => fold(a.name)));
  const discountOf = new Map(e.discountList.map((d) => [fold(d.person_name), d.amount]));
  const owes = (a) => Math.max(e.participation_fee - (discountOf.get(fold(a.name)) || 0), 0);
  const paid = e.attendees.filter((a) => a.paid);
  const toCollect = e.attendees.filter((a) => !a.paid).reduce((s, a) => s + owes(a), 0);

  const add = async (ev) => {
    ev.preventDefault();
    if (await run(() => api.post(`/events/${e.id}/attendees`, { name }))) setName('');
  };

  return (
    <div className="card">
      <div className="card-pad card-head" style={{ marginBottom: 0 }}>
        <div>
          <h2>{t('Attendees')}</h2>
          <p>{e.attendees.length
            ? `${t('{paid} of {n} paid', { paid: paid.length, n: e.attendees.length })}${toCollect > 0 ? ` · ${t('{amount} still to collect', { amount: money(toCollect) })}` : ''}`
            : t('Optional — list who came and tick who has paid')}</p>
        </div>
      </div>
      <CardError error={error} />
      {e.attendees.length > 0 && (
        <div className="table-wrap">
          <table>
            <thead><tr><th style={{ width: 44 }}>{t('Paid')}</th><th>{t('Person')}</th><th className="r">{t('Pays')}</th>{canEdit && <th />}</tr></thead>
            <tbody>
              {e.attendees.map((a) => (
                <tr key={a.id}>
                  <td>
                    <input type="checkbox" checked={!!a.paid} disabled={!canEdit} aria-label={t('{name} paid', { name: a.name })}
                      onChange={(ev) => run(() => api.put(`/event-attendees/${a.id}`, { paid: ev.target.checked }))} />
                  </td>
                  <td>{a.name}{a.is_member ? <span className="badge hide-sm" style={{ marginLeft: 6 }}>{t('Member')}</span> : null}</td>
                  <td className={`r ${a.paid ? 'secondary' : ''}`}>{money(owes(a))}</td>
                  {canEdit && <td className="r actions"><button className="icon-btn" aria-label={t('Remove')} onClick={() => run(() => api.del(`/event-attendees/${a.id}`))}><IconTrash /></button></td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {e.attendees.length > 0 && e.attendees.length !== e.participants && (
        <p className="hint" style={{ padding: '10px 22px 0', margin: 0 }}>
          {t('The list has {n} people but the event counts {count} participants — the money uses the count (Edit to change it).', { n: e.attendees.length, count: e.participants })}
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
