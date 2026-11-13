import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api.js';
import { useAction, useApi, usePermissions } from '../../hooks.js';
import { number, pctLabel, signedMoney } from '../../format.js';
import { TASK_LABELS, TASKS } from '../../points.js';
import CardError from '../../components/CardError.jsx';
import { IconTrash } from '../../components/Icons.jsx';
import Select from '../../components/Select.jsx';

/** The event's points, shared between its tasks; people on a task share its points equally. */
export default function Tasks({ e, reload }) {
  const { data: people, reload: reloadPeople } = useApi('/people');
  const [error, run] = useAction(reload);
  const [byHand, setByHand] = useState(false);
  const [editTask, setEditTask] = useState(null);
  const { canEdit } = usePermissions();
  const byTask = (t) => e.tasks.filter((l) => l.task === t);
  const needed = TASKS.filter((t) => !e.skippedTasks.includes(t));
  const unassigned = needed.filter((t) => !byTask(t).length);
  const skip = (t) => window.confirm(`${TASK_LABELS[t]} wasn’t needed for this event? ${byTask(t).length ? 'The people on it are removed and its' : 'Its'} points go to the other tasks.`)
    && run(() => api.post(`/events/${e.id}/tasks/${t}/skip`));
  const freePoints = e.tasks.filter((l) => l.free).reduce((a, l) => a + l.points, 0);
  const fund = e.is_sport ? `${e.type_name} fund` : 'general fund';
  const setPoints = (v) => run(() => api.put(`/events/${e.id}/points`, { points: v })).then(() => setByHand(false));
  const auto = e.points_auto;
  const taskPoints = e.taskPoints || {};
  const setTaskPoints = (t, v) => run(() => api.put(`/events/${e.id}/task-points/${t}`, { points: v })).then(() => setEditTask(null));
  // Put someone on a task; "new" first creates the person (an organiser who isn't in People yet).
  const addToTask = (t, value, typed = '') => run(async () => {
    let id = value;
    if (value === 'new') {
      const name = typed || window.prompt(`Name of the new person for ${TASK_LABELS[t]}`);
      if (!name?.trim()) return;
      ({ id } = await api.post('/people', { name }));
      reloadPeople();
    }
    await api.post(`/events/${e.id}/tasks`, { task: t, person_id: id });
  });

  return (
    <div className="card">
      <div className="card-pad card-head" style={{ marginBottom: 0 }}>
        <div><h2>Tasks & points</h2>
          <p>Each task gets its share of the event’s points, or points set by hand; people on the same task share them. Done for free, or with nobody on it: the points’ money goes to the {fund}.</p></div>
      </div>
      <CardError error={error} />
      <div className="card-pad task-total" style={{ paddingTop: 0 }}>
        <span>Event points</span>
        {canEdit && (byHand || e.points_manual)
          ? <input key={e.points} className="select-sm num-input" type="number" min="0" step="0.5" defaultValue={e.points} aria-label="Event points"
            autoFocus={byHand} onBlur={(ev) => ev.target.value !== '' && Number(ev.target.value) !== e.points && setPoints(ev.target.value)} />
          : <strong>{number(e.points)}</strong>}
        {e.points_manual
          ? <span className="badge">Set by hand</span>
          : e.points_real
            ? <><span className="badge status-completed" title="Calculated on the 1st of the next month, from the month's profit">Real</span>
              <span className="muted">{number(e.points_real.time)} time + {number(e.points_real.people ?? 0)} participants + {number(e.points_real.money)} share of the month’s profit
                {' '}+ {number(e.points_real.impact ?? 0)} impact (estimate was {number(e.points_estimate)}) · <Link to="/payouts">month review</Link></span></>
            : <><span className="badge" title="Final on the 1st of the next month: the profit points follow the whole month's profit">Estimate</span>
              <span className="muted">{number(auto.time)} time ({e.activity_name || 'no kind of event chosen'})
              {' '}+ {number(auto.people)} for {number(e.counted_participants || 0)} participants{e.counted_participants > 0 && auto.peopleScale < 1 ? ` (${Math.round(auto.peopleScale * 100)}% — profit per person is low)` : ''}
              {' '}+ {number(auto.money)} for {signedMoney(e.profit)} profit
              {' '}+ {number(auto.impact)} impact{auto.factor !== 1 ? ` · ${e.type_name} × ${number(auto.factor)}` : ''}</span></>}
        {canEdit && (e.points_manual
          ? <button className="btn btn-sm" onClick={() => setPoints(null)}>Use automatic ({number(auto.total)})</button>
          : !byHand && <button className="btn btn-sm" onClick={() => setByHand(true)}>Set by hand</button>)}
        {!e.points_manual && !e.activity_id && <span className="hint">Choose the kind of event in Edit event</span>}
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Task</th><th className="r">Points</th><th>Done by</th></tr></thead>
          <tbody>
            {needed.map((t) => {
              const lines = byTask(t);
              const share = e.taskShares[t] || 0;
              const taken = new Set(lines.map((l) => l.person_id));
              return (
                <tr key={t}>
                  <td className="cell-wrap">
                    <div className="task-title">
                      {TASK_LABELS[t]}
                      {canEdit && needed.length > 1 && (
                        <button className="icon-btn" aria-label={`${TASK_LABELS[t]} wasn’t needed`} title="Not needed for this event — its points go to the other tasks"
                          onClick={() => skip(t)}><IconTrash width="14" /></button>
                      )}
                    </div>
                    <div className="row-sub">{pctLabel(share)}{e.skippedTasks.length && share !== e.usualTaskShares[t] ? ` (usually ${pctLabel(e.usualTaskShares[t])})` : ''}</div>
                  </td>
                  <td className="r">
                    {canEdit && (editTask === t || taskPoints[t] !== undefined)
                      ? <input key={taskPoints[t] ?? 'auto'} className="select-sm num-input" type="number" min="0" step="0.5" aria-label={`${TASK_LABELS[t]} points`}
                        defaultValue={taskPoints[t] ?? Math.round(e.points * share) / 100} autoFocus={editTask === t}
                        onBlur={(ev) => (ev.target.value === '' || Number(ev.target.value) === taskPoints[t] ? setEditTask(null) : setTaskPoints(t, ev.target.value))} />
                      : <strong>{number(taskPoints[t] ?? Math.round(e.points * share) / 100)}</strong>}
                    <div className="row-sub">
                      {taskPoints[t] !== undefined
                        ? <><span className="badge">By hand</span>{canEdit && <> <button className="link-btn" onClick={() => setTaskPoints(t, null)}
                          title={`Back to ${pctLabel(share)} of the event's points`}>auto ({number(Math.round(e.points * share) / 100)})</button></>}</>
                        : canEdit && editTask !== t && <button className="link-btn" onClick={() => setEditTask(t)}>set by hand</button>}
                    </div>
                  </td>
                  <td className="cell-wrap">
                    <div className="task-people">
                      {lines.map((l) => (
                        <span key={l.id} className={`task-chip ${l.free ? 'free' : ''}`}>
                          {l.person_name} <span className="muted">{number(l.points)}</span>
                          {l.free ? <span className="badge status-completed">free</span> : null}
                          {canEdit && <>
                            <button className="link-btn" onClick={() => run(() => api.put(`/event-tasks/${l.id}`, { free: !l.free }))}
                              title={l.free ? 'They get the points' : `Done for free — the money goes to the ${fund}`}>{l.free ? 'paid' : 'free'}</button>
                            <button className="icon-btn" aria-label={`Remove ${l.person_name}`}
                              title={lines.length === 1 ? `Remove ${l.person_name} — with nobody on ${TASK_LABELS[t]}, its points’ money goes to the ${fund}` : `Remove ${l.person_name} — the others on ${TASK_LABELS[t]} share its points`}
                              onClick={() => (lines.length > 1 || window.confirm(`Remove ${l.person_name} from ${TASK_LABELS[t]}? Nobody else is on it, so its ${number(l.points)} points’ money goes to the ${fund}.`))
                                && run(() => api.del(`/event-tasks/${l.id}`))}><IconTrash width="14" /></button>
                          </>}
                        </span>
                      ))}
                      {!lines.length && <span className="muted">Nobody — points to the {fund}</span>}
                      {canEdit && (
                        <Select className="select-sm" value="" aria-label={`Add someone to ${TASK_LABELS[t]}`}
                          onChange={(ev) => ev.target.value && addToTask(t, ev.target.value)}
                          onCreate={(name) => addToTask(t, 'new', name)} createLabel="New person">
                          <option value="">Add…</option>
                          {people?.filter((p) => p.active && !taken.has(p.id)).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </Select>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {e.skippedTasks.length > 0 && (
        <div className="skipped-tasks">
          <span className="muted">Not needed for this event:</span>
          {e.skippedTasks.map((t) => (
            <span key={t} className="task-chip">
              {TASK_LABELS[t]}
              {canEdit && <button className="link-btn" onClick={() => run(() => api.del(`/events/${e.id}/tasks/${t}/skip`))}>Add back</button>}
            </span>
          ))}
        </div>
      )}
      {(unassigned.length > 0 || freePoints > 0) && (
        <p className="hint" style={{ padding: '12px 22px 16px', margin: 0 }}>
          {freePoints > 0 && <>{number(Math.round(freePoints * 100) / 100)} points done for free go to the {fund}. </>}
          {unassigned.length > 0 && <>{unassigned.map((t) => TASK_LABELS[t]).join(', ')}: nobody on {unassigned.length > 1 ? 'them, so their' : 'it, so its'} points’ money goes to the {fund}.</>}
        </p>
      )}
    </div>
  );
}
