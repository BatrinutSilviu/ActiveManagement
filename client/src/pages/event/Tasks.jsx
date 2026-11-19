import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api.js';
import { useAction, useApi, usePermissions } from '../../hooks.js';
import { number, pctLabel, signedMoney } from '../../format.js';
import { TASK_LABELS, TASKS } from '../../points.js';
import CardError from '../../components/CardError.jsx';
import { IconTrash } from '../../components/Icons.jsx';
import Select from '../../components/Select.jsx';
import { t, tn } from '../../i18n/index.js';

/** The event's points, shared between its tasks; people on a task share its points equally. */
export default function Tasks({ e, reload }) {
  const { data: people, reload: reloadPeople } = useApi('/people');
  const [error, run] = useAction(reload);
  const [byHand, setByHand] = useState(false);
  const [editTask, setEditTask] = useState(null);
  const { canEdit } = usePermissions();
  const label = (k) => t(TASK_LABELS[k]);
  const byTask = (k) => e.tasks.filter((l) => l.task === k);
  const needed = TASKS.filter((k) => !e.skippedTasks.includes(k));
  const unassigned = needed.filter((k) => !byTask(k).length);
  const skip = (k) => window.confirm(byTask(k).length
    ? t('{task} wasn’t needed for this event? The people on it are removed and its points go to the other tasks.', { task: label(k) })
    : t('{task} wasn’t needed for this event? Its points go to the other tasks.', { task: label(k) }))
    && run(() => api.post(`/events/${e.id}/tasks/${k}/skip`));
  const freePoints = e.tasks.filter((l) => l.free).reduce((a, l) => a + l.points, 0);
  const fund = e.is_sport ? t('{sport} fund', { sport: e.type_name }) : t('general fund');
  const setPoints = (v) => run(() => api.put(`/events/${e.id}/points`, { points: v })).then(() => setByHand(false));
  const auto = e.points_auto;
  const taskPoints = e.taskPoints || {};
  const setTaskPoints = (k, v) => run(() => api.put(`/events/${e.id}/task-points/${k}`, { points: v })).then(() => setEditTask(null));
  // Put someone on a task; "new" first creates the person (an organiser who isn't in People yet).
  const addToTask = (k, value, typed = '') => run(async () => {
    let id = value;
    if (value === 'new') {
      const name = typed || window.prompt(t('Name of the new person for {task}', { task: label(k) }));
      if (!name?.trim()) return;
      ({ id } = await api.post('/people', { name }));
      reloadPeople();
    }
    await api.post(`/events/${e.id}/tasks`, { task: k, person_id: id });
  });

  return (
    <div className="card">
      <div className="card-pad card-head" style={{ marginBottom: 0 }}>
        <div><h2>{t('Tasks & points')}</h2>
          <p>{t('Each task gets its share of the event’s points, or points set by hand; people on the same task share them. Done for free, or with nobody on it: the points’ money goes to the {fund}.', { fund })}</p></div>
      </div>
      <CardError error={error} />
      <div className="card-pad task-total" style={{ paddingTop: 0 }}>
        <span>{t('Event points')}</span>
        {canEdit && (byHand || e.points_manual)
          ? <input key={e.points} className="select-sm num-input" type="number" min="0" step="0.5" defaultValue={e.points} aria-label={t('Event points')}
            autoFocus={byHand} onBlur={(ev) => ev.target.value !== '' && Number(ev.target.value) !== e.points && setPoints(ev.target.value)} />
          : <strong>{number(e.points)}</strong>}
        {e.points_manual
          ? <span className="badge">{t('Set by hand')}</span>
          : e.points_real
            ? <><span className="badge status-completed" title={t('Calculated on the 1st of the next month, from the month’s profit')}>{t('Real')}</span>
              <span className="muted">{t('{time} time + {people} participants + {money} share of the month’s profit + {impact} impact (estimate was {estimate})', { time: number(e.points_real.time), people: number(e.points_real.people ?? 0), money: number(e.points_real.money), impact: number(e.points_real.impact ?? 0), estimate: number(e.points_estimate) })} · <Link to="/payouts">{t('month review')}</Link></span></>
            : <><span className="badge" title={t('Final on the 1st of the next month: the profit points follow the whole month’s profit')}>{t('Estimate')}</span>
              <span className="muted">{t('{n} time', { n: number(auto.time) })} ({e.activity_name || t('no kind of event chosen')})
              {' '}+ {t('{n} for {count} participants', { n: number(auto.people), count: number(e.counted_participants || 0) })}{e.counted_participants > 0 && auto.peopleScale < 1 ? ` (${t('{pct}% — profit per person is low', { pct: Math.round(auto.peopleScale * 100) })})` : ''}
              {' '}+ {t('{n} for {profit} profit', { n: number(auto.money), profit: signedMoney(e.profit) })}
              {' '}+ {t('{n} impact', { n: number(auto.impact) })}{auto.factor !== 1 ? ` · ${e.type_name} × ${number(auto.factor)}` : ''}</span></>}
        {canEdit && (e.points_manual
          ? <button className="btn btn-sm" onClick={() => setPoints(null)}>{t('Use automatic ({n})', { n: number(auto.total) })}</button>
          : !byHand && <button className="btn btn-sm" onClick={() => setByHand(true)}>{t('Set by hand')}</button>)}
        {!e.points_manual && !e.activity_id && <span className="hint">{t('Choose the kind of event in Edit event')}</span>}
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>{t('Task')}</th><th className="r">{t('Points')}</th><th>{t('Done by')}</th></tr></thead>
          <tbody>
            {needed.map((k) => {
              const lines = byTask(k);
              const share = e.taskShares[k] || 0;
              const taken = new Set(lines.map((l) => l.person_id));
              return (
                <tr key={k}>
                  <td className="cell-wrap">
                    <div className="task-title">
                      {label(k)}
                      {canEdit && needed.length > 1 && (
                        <button className="icon-btn" aria-label={t('{task} wasn’t needed', { task: label(k) })} title={t('Not needed for this event — its points go to the other tasks')}
                          onClick={() => skip(k)}><IconTrash width="14" /></button>
                      )}
                    </div>
                    <div className="row-sub">{pctLabel(share)}{e.skippedTasks.length && share !== e.usualTaskShares[k] ? ` (${t('usually {pct}', { pct: pctLabel(e.usualTaskShares[k]) })})` : ''}</div>
                  </td>
                  <td className="r">
                    {canEdit && (editTask === k || taskPoints[k] !== undefined)
                      ? <input key={taskPoints[k] ?? 'auto'} className="select-sm num-input" type="number" min="0" step="0.5" aria-label={t('{task} points', { task: label(k) })}
                        defaultValue={taskPoints[k] ?? Math.round(e.points * share) / 100} autoFocus={editTask === k}
                        onBlur={(ev) => (ev.target.value === '' || Number(ev.target.value) === taskPoints[k] ? setEditTask(null) : setTaskPoints(k, ev.target.value))} />
                      : <strong>{number(taskPoints[k] ?? Math.round(e.points * share) / 100)}</strong>}
                    <div className="row-sub">
                      {taskPoints[k] !== undefined
                        ? <><span className="badge">{t('By hand')}</span>{canEdit && <> <button className="link-btn" onClick={() => setTaskPoints(k, null)}
                          title={t('Back to {pct} of the event’s points', { pct: pctLabel(share) })}>{t('auto ({n})', { n: number(Math.round(e.points * share) / 100) })}</button></>}</>
                        : canEdit && editTask !== k && <button className="link-btn" onClick={() => setEditTask(k)}>{t('set by hand')}</button>}
                    </div>
                  </td>
                  <td className="cell-wrap">
                    <div className="task-people">
                      {lines.map((l) => (
                        <span key={l.id} className={`task-chip ${l.free ? 'free' : ''}`}>
                          {l.person_name} <span className="muted">{number(l.points)}</span>
                          {l.free ? <span className="badge status-completed">{t('free')}</span> : null}
                          {canEdit && <>
                            <button className="link-btn" onClick={() => run(() => api.put(`/event-tasks/${l.id}`, { free: !l.free }))}
                              title={l.free ? t('They get the points') : t('Done for free — the money goes to the {fund}', { fund })}>{t(l.free ? 'paid' : 'free')}</button>
                            <button className="icon-btn" aria-label={t('Remove {name}', { name: l.person_name })}
                              title={lines.length === 1 ? t('Remove {name} — with nobody on {task}, its points’ money goes to the {fund}', { name: l.person_name, task: label(k), fund }) : t('Remove {name} — the others on {task} share its points', { name: l.person_name, task: label(k) })}
                              onClick={() => (lines.length > 1 || window.confirm(t('Remove {name} from {task}? Nobody else is on it, so its {n} points’ money goes to the {fund}.', { name: l.person_name, task: label(k), n: number(l.points), fund })))
                                && run(() => api.del(`/event-tasks/${l.id}`))}><IconTrash width="14" /></button>
                          </>}
                        </span>
                      ))}
                      {!lines.length && <span className="muted">{t('Nobody — points to the {fund}', { fund })}</span>}
                      {canEdit && (
                        <Select className="select-sm" value="" aria-label={t('Add someone to {task}', { task: label(k) })}
                          onChange={(ev) => ev.target.value && addToTask(k, ev.target.value)}
                          onCreate={(name) => addToTask(k, 'new', name)} createLabel={t('New person')}>
                          <option value="">{t('Add…')}</option>
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
          <span className="muted">{t('Not needed for this event:')}</span>
          {e.skippedTasks.map((k) => (
            <span key={k} className="task-chip">
              {label(k)}
              {canEdit && <button className="link-btn" onClick={() => run(() => api.del(`/events/${e.id}/tasks/${k}/skip`))}>{t('Add back')}</button>}
            </span>
          ))}
        </div>
      )}
      {(unassigned.length > 0 || freePoints > 0) && (
        <p className="hint" style={{ padding: '12px 22px 16px', margin: 0 }}>
          {freePoints > 0 && <>{t('{n} points done for free go to the {fund}.', { n: number(Math.round(freePoints * 100) / 100), fund })} </>}
          {unassigned.length > 0 && tn(unassigned.length, '{tasks}: nobody on it, so its points’ money goes to the {fund}.', '{tasks}: nobody on them, so their points’ money goes to the {fund}.', { tasks: unassigned.map(label).join(', '), fund })}
        </p>
      )}
    </div>
  );
}
