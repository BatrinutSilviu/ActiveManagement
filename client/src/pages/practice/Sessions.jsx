// The schedule, as a day (a timetable), a week (day by day), a month (a calendar) or a list of the coming days: who,
// when, where and how each session is paid.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, qs } from '../../api.js';
import { useAction, useApi, usePermissions, usePersistentState } from '../../hooks.js';
import { useBusiness } from '../../business.js';
import { IconCheck, IconChevronLeft, IconPlus, IconRoute } from '../../components/Icons.jsx';
import { dateLocale, t, tn } from '../../i18n/index.js';
import SessionForm from './SessionForm.jsx';
import TripForm from './TripForm.jsx';
import { addDays, Billing, dayMonth, iso, localToday, mapsUrl, sessionPrice, SessionStatus, timeLabel, VENUES, weekday, weekStart } from './common.jsx';

// The views of the schedule, and how far each one reaches from the date it's on.
const VIEWS = [['day', 'Day'], ['week', 'Week'], ['month', 'Month'], ['list', 'List']];
const LIST_DAYS = 30;
const monthStart = (d) => `${d.slice(0, 7)}-01`;
const addMonths = (d, n) => { const x = new Date(`${monthStart(d)}T12:00:00`); x.setMonth(x.getMonth() + n); return iso(x); };
function range(view, at) {
  if (view === 'day') return [at, at];
  if (view === 'week') return [weekStart(at), addDays(weekStart(at), 6)];
  if (view === 'month') {
    const first = monthStart(at), last = addDays(addMonths(at, 1), -1);
    return [weekStart(first), addDays(weekStart(last), 6)]; // whole weeks around the month
  }
  return [at, addDays(at, LIST_DAYS - 1)];
}
const step = (view, at, dir) => (view === 'day' ? addDays(at, dir) : view === 'week' ? addDays(at, 7 * dir)
  : view === 'month' ? addMonths(at, dir) : addDays(at, LIST_DAYS * dir));
const monthLabel = (d) => { const s = new Date(`${d}T12:00:00`).toLocaleDateString(dateLocale(), { month: 'long', year: 'numeric' }); return s[0].toUpperCase() + s.slice(1); };

export default function Sessions() {
  const { canEdit } = usePermissions();
  const { term, Term, on } = useBusiness();
  const today = localToday();
  const [trip, setTrip] = useState(null); // the day whose km are open
  const [view, setView] = usePersistentState('am-sessions-view', 'week');
  const [at, setAt] = useState(today);
  const [hideCancelled, setHideCancelled] = usePersistentState('am-sessions-hide-cancelled', true);
  const [start, end] = range(view, at);
  const { data, loading, reload } = useApi(`/appointments${qs({ from: start, to: end })}`);
  const [form, setForm] = useState(null); // { session } | { date }
  const [err, run] = useAction(reload);
  const list = (data || []).filter((a) => !hideCancelled || a.status !== 'cancelled');
  const inView = view === 'month' ? list.filter((a) => a.date.slice(0, 7) === at.slice(0, 7)) : list;
  const done = inView.filter((a) => a.status === 'done').length;
  const label = view === 'day' ? `${weekday(at)} ${dayMonth(at)}` : view === 'month' ? monthLabel(at) : `${dayMonth(start)} – ${dayMonth(end)}`;
  const isNow = start <= today && today <= end && (view !== 'month' || at.slice(0, 7) === today.slice(0, 7));
  const open = (a) => canEdit && setForm({ session: a });
  const markDone = (a) => run(() => api.put(`/appointments/${a.id}/status`, { status: 'done' }));
  const newOn = (d) => canEdit && setForm({ date: d });
  const nowLabel = { day: 'Today', week: 'This week', month: 'This month', list: 'From today' }[view];

  return (
    <div className={loading ? 'loading' : ''}>
      <div className="page-head">
        <div><h1>{t(Term('events'))}</h1>
          <p>{label} · {tn(inView.filter((a) => a.status !== 'cancelled').length, `{n} ${term('event')}`, `{n} ${term('events')}`)}{done ? `, ${t('{n} done', { n: done })}` : ''}</p></div>
        {canEdit && <button className="btn btn-primary" onClick={() => setForm({ date: isNow ? today : start })}><IconPlus width="16" />{t(`New ${term('event')}`)}</button>}
      </div>
      <div className="filters">
        <div className="segmented" role="tablist" aria-label={t('View')}>
          {VIEWS.map(([k, name]) => <button key={k} role="tab" aria-selected={view === k} className={view === k ? 'on' : ''} onClick={() => setView(k)}>{t(name)}</button>)}
        </div>
        <div className="segmented">
          <button onClick={() => setAt(step(view, at, -1))} aria-label={t('Previous')}><IconChevronLeft width="15" /></button>
          <button className={isNow ? 'on' : ''} onClick={() => setAt(today)}>{t(nowLabel)}</button>
          <button onClick={() => setAt(step(view, at, 1))} aria-label={t('Next')}><IconChevronLeft width="15" style={{ transform: 'rotate(180deg)' }} /></button>
        </div>
        <input type="date" value={at} onChange={(e) => e.target.value && setAt(e.target.value)} aria-label={t('Go to date')} style={{ width: 'auto' }} />
        {view === 'day' && on('trips') && canEdit && <button className="btn" onClick={() => setTrip(at)}><IconRoute width="15" />{t('Km this day')}</button>}
        <label className="check"><input type="checkbox" checked={hideCancelled} onChange={(e) => setHideCancelled(e.target.checked)} />{t('Hide cancelled')}</label>
      </div>
      {err && <div className="error-box" style={{ marginBottom: 12 }}>{err}</div>}
      {view === 'day' && <DayGrid date={at} items={list} canEdit={canEdit} onOpen={open} onDone={markDone} onNew={newOn} />}
      {view === 'week' && (
        <div className="week">
          {Array.from({ length: 7 }, (_, i) => addDays(start, i)).map((d) => {
            const items = list.filter((a) => a.date === d);
            return (
              <section key={d} className={`week-day card ${d === today ? 'today' : ''}`}>
                <header>
                  <button className="link-btn day-link" onClick={() => { setAt(d); setView('day'); }}><strong>{weekday(d)}</strong><span>{dayMonth(d)}</span></button>
                  {canEdit && <button className="icon-btn" aria-label={t(`New ${term('event')} on {date}`, { date: dayMonth(d) })} onClick={() => newOn(d)}><IconPlus width="15" /></button>}
                </header>
                {items.length ? items.map((a) => <SessionCard key={a.id} a={a} canEdit={canEdit} onOpen={() => open(a)} onDone={() => markDone(a)} />)
                  : <p className="muted week-empty">—</p>}
              </section>
            );
          })}
        </div>
      )}
      {view === 'month' && <MonthGrid at={at} start={start} end={end} items={list} onPick={(d) => { setAt(d); setView('day'); }} />}
      {view === 'list' && (
        <div className="stack">
          {[...new Set(list.map((a) => a.date))].map((d) => (
            <section key={d} className={`card card-pad agenda-day ${d === today ? 'today' : ''}`}>
              <div className="card-head" style={{ marginBottom: 10 }}>
                <button className="link-btn day-link" onClick={() => { setAt(d); setView('day'); }}><strong>{weekday(d)}</strong> <span>{dayMonth(d)}</span></button>
              </div>
              <div className="stack" style={{ gap: 8 }}>
                {list.filter((a) => a.date === d).map((a) => <SessionCard key={a.id} a={a} canEdit={canEdit} onOpen={() => open(a)} onDone={() => markDone(a)} />)}
              </div>
            </section>
          ))}
          {!list.length && <div className="card empty">{t(`No ${term('events')} in these {n} days.`, { n: LIST_DAYS })}</div>}
        </div>
      )}
      {trip && <TripForm date={trip} onClose={() => setTrip(null)} />}
      {form && <SessionForm session={form.session} date={form.date} onClose={() => setForm(null)} onSaved={() => { setForm(null); reload(); }} />}
    </div>
  );
}

const HOUR_PX = 72;
const minutes = (hm) => { const [h, m] = hm.split(':').map(Number); return h * 60 + m; };

/** One day as a timetable: each session at its time, as tall as it lasts (its end, else its service's duration, else 50
 * minutes), side by side when they overlap. */
function DayGrid({ date, items, canEdit, onOpen, onDone, onNew }) {
  const { term } = useBusiness();
  const day = items.filter((a) => a.date === date);
  const timed = day.filter((a) => a.start_time).map((a) => {
    const from = minutes(a.start_time);
    return { a, from, to: Math.max(from + 20, a.end_time ? minutes(a.end_time) : from + (a.type_duration || 50)) };
  }).sort((x, y) => x.from - y.from);
  // Lanes: a session goes in the first lane free at its start; a group of overlapping ones shares the width.
  const lanes = [];
  let group = [], groupEnd = -1;
  const close = () => { const n = Math.max(...group.map((g) => g.lane)) + 1; for (const g of group) g.lanes = n; group = []; };
  for (const x of timed) {
    if (x.from >= groupEnd && group.length) { close(); lanes.length = 0; }
    let lane = lanes.findIndex((end) => end <= x.from);
    if (lane < 0) { lane = lanes.length; lanes.push(0); }
    lanes[lane] = x.to; x.lane = lane; group.push(x); groupEnd = Math.max(groupEnd, x.to);
  }
  if (group.length) close();
  const first = Math.min(8, ...timed.map((x) => Math.floor(x.from / 60)));
  const last = Math.max(20, ...timed.map((x) => Math.ceil(x.to / 60)));
  const hours = Array.from({ length: last - first }, (_, i) => first + i);
  const untimed = day.filter((a) => !a.start_time);
  const now = new Date();
  const nowMin = date === localToday() ? now.getHours() * 60 + now.getMinutes() : null;
  return (
    <div className="card card-pad">
      {untimed.length > 0 && (
        <div className="stack" style={{ gap: 8, marginBottom: 14 }}>
          <div className="kpi-label">{t('No time set')}</div>
          {untimed.map((a) => <SessionCard key={a.id} a={a} canEdit={canEdit} onOpen={() => onOpen(a)} onDone={() => onDone(a)} />)}
        </div>
      )}
      <div className="day-grid" style={{ height: hours.length * HOUR_PX }}>
        {hours.map((h, i) => (
          <div key={h} className="day-hour" style={{ top: i * HOUR_PX, height: HOUR_PX }}
            onClick={() => onNew(date)} role={canEdit ? 'button' : undefined} aria-label={canEdit ? t(`New ${term('event')} on {date}`, { date: dayMonth(date) }) : undefined}>
            <span>{String(h).padStart(2, '0')}:00</span>
          </div>
        ))}
        {nowMin != null && nowMin >= first * 60 && nowMin <= last * 60 && <div className="day-now" style={{ top: ((nowMin - first * 60) / 60) * HOUR_PX }} />}
        {timed.map(({ a, from, to, lane, lanes: n }) => (
          <button key={a.id} type="button" className={`day-block status-${a.status}`} onClick={() => onOpen(a)}
            style={{ top: ((from - first * 60) / 60) * HOUR_PX, height: Math.max(26, ((to - from) / 60) * HOUR_PX - 2),
              left: `calc(52px + (100% - 52px) * ${lane / n})`, width: `calc((100% - 52px) / ${n} - 4px)`, '--svc': a.type_color || 'var(--accent)' }}>
            <span className="day-line"><strong>{timeLabel(a)}</strong> <span className="day-who">{a.client_name}</span></span>
            <span className="day-what">{[a.type_name, a.venue === 'practice' ? a.location || t(VENUES.practice) : null].filter(Boolean).join(' · ')}</span>
            {a.status !== 'scheduled' && <span className="day-status"><SessionStatus status={a.status} /></span>}
          </button>
        ))}
      </div>
    </div>
  );
}

/** A month as a calendar: each day with its sessions (dots on a phone); a day opens in the day view. */
function MonthGrid({ at, start, end, items, onPick }) {
  const today = localToday();
  const days = [];
  for (let d = start; d <= end; d = addDays(d, 1)) days.push(d);
  return (
    <div className="card month">
      <div className="month-head">{days.slice(0, 7).map((d) => <span key={d}>{weekday(d, 'short')}</span>)}</div>
      <div className="month-grid">
        {days.map((d) => {
          const mine = items.filter((a) => a.date === d).sort((x, y) => (x.start_time || '').localeCompare(y.start_time || ''));
          return (
            <button key={d} type="button" onClick={() => onPick(d)}
              className={`month-day${d.slice(0, 7) !== at.slice(0, 7) ? ' other' : ''}${d === today ? ' today' : ''}`}>
              <span className="month-num">{Number(d.slice(8))}</span>
              <span className="month-items">
                {mine.slice(0, 3).map((a) => (
                  <span key={a.id} className={`month-item status-${a.status}`} style={{ '--svc': a.type_color || 'var(--accent)' }}>
                    {a.start_time && <b>{a.start_time}</b>} {a.client_name}
                  </span>
                ))}
                {mine.length > 3 && <span className="month-more">+{mine.length - 3}</span>}
              </span>
              {mine.length > 0 && <span className="month-dots">{mine.slice(0, 4).map((a) => <i key={a.id} style={{ background: a.type_color || 'var(--accent)' }} />)}{mine.length > 4 ? '+' : ''}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function SessionCard({ a, canEdit, onOpen, onDone, showDate }) {
  return (
    <div className={`session-card status-${a.status}${a.type_color ? ' has-color' : ''}`} onClick={onOpen} role={canEdit ? 'button' : undefined}
      style={a.type_color ? { '--svc': a.type_color } : undefined}>
      <div className="session-top">
        <strong>{showDate ? `${dayMonth(a.date)} ` : ''}{timeLabel(a) || t('No time set')}</strong>
        {a.status !== 'scheduled' ? <SessionStatus status={a.status} />
          : canEdit && a.date <= localToday() && <button className="btn btn-sm" onClick={(e) => { e.stopPropagation(); onDone(); }}><IconCheck width="13" />{t('Done')}</button>}
      </div>
      <Link to={`/patients/${a.client_id}`} onClick={(e) => e.stopPropagation()} className="session-who">{a.client_name}</Link>
      <div className="row-sub">{[a.type_name, a.venue === 'practice' ? a.location || t(VENUES.practice) : null, a.place].filter(Boolean).join(' · ')}
        {a.place && <> <a href={mapsUrl(a.place)} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>{t('map')} ↗</a></>}</div>
      {a.status === 'cancelled' && a.cancel_reason && <div className="row-sub">{a.cancel_reason}</div>}
      <div className="session-foot"><span>{sessionPrice(a)}</span><Billing a={a} /></div>
    </div>
  );
}
