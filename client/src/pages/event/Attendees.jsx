import { useState } from 'react';
import { api } from '../../api.js';
import { useAction, useApi, usePermissions } from '../../hooks.js';
import { money } from '../../format.js';
import CardError from '../../components/CardError.jsx';
import { IconTrash } from '../../components/Icons.jsx';

/** Optional list of who came, with a tick for who has paid. */
export default function Attendees({ e, reload }) {
  const { data: people, reload: reloadPeople } = useApi('/people');
  const [name, setName] = useState('');
  const [error, run] = useAction(reload);
  const { canEdit } = usePermissions();

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
      <CardError error={error} />
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
