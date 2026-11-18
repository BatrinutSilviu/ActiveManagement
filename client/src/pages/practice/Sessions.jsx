// The schedule: a week of sessions, day by day, with who, when, where and how it's paid.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, qs } from '../../api.js';
import { useAction, useApi, usePermissions, usePersistentState } from '../../hooks.js';
import { useBusiness } from '../../business.js';
import { IconCheck, IconChevronLeft, IconPlus } from '../../components/Icons.jsx';
import SessionForm from './SessionForm.jsx';
import { addDays, Billing, dayMonth, localToday, mapsUrl, sessionPrice, SessionStatus, timeLabel, weekday, weekStart } from './common.jsx';

export default function Sessions() {
  const { canEdit } = usePermissions();
  const { term, Term } = useBusiness();
  const today = localToday();
  const [start, setStart] = useState(() => weekStart(today));
  const [hideCancelled, setHideCancelled] = usePersistentState('am-sessions-hide-cancelled', true);
  const end = addDays(start, 6);
  const { data, loading, reload } = useApi(`/appointments${qs({ from: start, to: end })}`);
  const [form, setForm] = useState(null); // { session } | { date }
  const [err, run] = useAction(reload);
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const list = (data || []).filter((a) => !hideCancelled || a.status !== 'cancelled');
  const done = list.filter((a) => a.status === 'done').length;

  return (
    <div className={loading ? 'loading' : ''}>
      <div className="page-head">
        <div><h1>{Term('events')}</h1>
          <p>{dayMonth(start)} – {dayMonth(end)} · {list.filter((a) => a.status !== 'cancelled').length} {term('events')}{done ? `, ${done} done` : ''}</p></div>
        {canEdit && <button className="btn btn-primary" onClick={() => setForm({ date: today >= start && today <= end ? today : start })}><IconPlus width="16" />New {term('event')}</button>}
      </div>
      <div className="filters">
        <div className="segmented">
          <button onClick={() => setStart(addDays(start, -7))} aria-label="Previous week"><IconChevronLeft width="15" /></button>
          <button className={start === weekStart(today) ? 'on' : ''} onClick={() => setStart(weekStart(today))}>This week</button>
          <button onClick={() => setStart(addDays(start, 7))} aria-label="Next week"><IconChevronLeft width="15" style={{ transform: 'rotate(180deg)' }} /></button>
        </div>
        <input type="date" value={start} onChange={(e) => e.target.value && setStart(weekStart(e.target.value))} aria-label="Go to week" style={{ width: 'auto' }} />
        <label className="check"><input type="checkbox" checked={hideCancelled} onChange={(e) => setHideCancelled(e.target.checked)} />Hide cancelled</label>
      </div>
      {err && <div className="error-box" style={{ marginBottom: 12 }}>{err}</div>}
      <div className="week">
        {days.map((d) => {
          const items = list.filter((a) => a.date === d);
          return (
            <section key={d} className={`week-day card ${d === today ? 'today' : ''}`}>
              <header>
                <span><strong>{weekday(d)}</strong><span>{dayMonth(d)}</span></span>
                {canEdit && <button className="icon-btn" aria-label={`New ${term('event')} on ${dayMonth(d)}`} onClick={() => setForm({ date: d })}><IconPlus width="15" /></button>}
              </header>
              {items.length ? items.map((a) => (
                <SessionCard key={a.id} a={a} canEdit={canEdit} onOpen={() => canEdit && setForm({ session: a })}
                  onDone={() => run(() => api.put(`/appointments/${a.id}/status`, { status: 'done' }))} />
              )) : <p className="muted week-empty">—</p>}
            </section>
          );
        })}
      </div>
      {form && <SessionForm session={form.session} date={form.date} onClose={() => setForm(null)} onSaved={() => { setForm(null); reload(); }} />}
    </div>
  );
}

export function SessionCard({ a, canEdit, onOpen, onDone, showDate }) {
  return (
    <div className={`session-card status-${a.status}`} onClick={onOpen} role={canEdit ? 'button' : undefined}>
      <div className="session-top">
        <strong>{showDate ? `${dayMonth(a.date)} ` : ''}{timeLabel(a) || 'No time set'}</strong>
        {a.status !== 'scheduled' ? <SessionStatus status={a.status} />
          : canEdit && a.date <= localToday() && <button className="btn btn-sm" onClick={(e) => { e.stopPropagation(); onDone(); }}><IconCheck width="13" />Done</button>}
      </div>
      <Link to={`/patients/${a.client_id}`} onClick={(e) => e.stopPropagation()} className="session-who">{a.client_name}</Link>
      <div className="row-sub">{[a.type_name, a.place].filter(Boolean).join(' · ')}
        {a.place && <> <a href={mapsUrl(a.place)} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>map ↗</a></>}</div>
      <div className="session-foot"><span>{sessionPrice(a)}</span><Billing a={a} /></div>
    </div>
  );
}
