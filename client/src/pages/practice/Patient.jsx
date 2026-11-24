// One patient: contact details, what to keep in mind, dated notes, their history from before the app (hours or dates), their sessions, packages, invoices and receipts.
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../../api.js';
import { useAction, useApi, usePermissions } from '../../hooks.js';
import { useBusiness } from '../../business.js';
import { date, money0, number } from '../../format.js';
import { t, tn } from '../../i18n/index.js';
import Modal, { confirmDelete } from '../../components/Modal.jsx';
import Select from '../../components/Select.jsx';
import { IconCheck, IconChevronLeft, IconDownload, IconEdit, IconPlus, IconTrash } from '../../components/Icons.jsx';
import InvoiceForm from './InvoiceForm.jsx';
import { PackageForm, PatientForm } from './PatientForms.jsx';
import SessionForm from './SessionForm.jsx';
import { Billing, docLabel, localToday, mapsUrl, sessionPrice, SessionStatus, timeLabel, VENUES } from './common.jsx';

const age = (birth) => {
  if (!birth) return null;
  const b = new Date(`${birth}T12:00:00`), n = new Date();
  return n.getFullYear() - b.getFullYear() - (n < new Date(n.getFullYear(), b.getMonth(), b.getDate()) ? 1 : 0);
};

export default function PatientPage() {
  const { id } = useParams();
  return <Patient key={id} id={id} />;
}

function Patient({ id }) {
  const navigate = useNavigate();
  const { canEdit } = usePermissions();
  const { term, Term } = useBusiness();
  const { data: c, error, reload } = useApi(`/clients/${id}`);
  const [form, setForm] = useState(null); // { kind: 'edit' | 'session' | 'package' | 'invoice' | 'pdf', … }
  const [err, run] = useAction(reload);
  const close = () => setForm(null);
  const saved = () => { setForm(null); reload(); };

  if (error) return <div className="error-box">{error}</div>;
  if (!c) return null;
  const del = async () => {
    if (!confirmDelete(t(`{name}, with their notes, ${term('events')} and packages`, { name: c.name }))) return;
    if (await run(() => api.del(`/clients/${c.id}`))) navigate('/patients');
  };
  const a = age(c.birth_date);

  return (
    <div>
      <Link to="/patients" className="back-link"><IconChevronLeft width="16" height="16" />{t(Term('people'))}</Link>
      <div className="page-head">
        <div>
          <h1>{c.name}{!!c.archived && <> <span className="badge">{t('archived')}</span></>}</h1>
          <p style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {c.phone && <a href={`tel:${c.phone.replace(/\s+/g, '')}`}>{c.phone}</a>}
            {c.email && <a href={`mailto:${c.email}`}>{c.email}</a>}
            {c.address && <a href={mapsUrl(c.address)} target="_blank" rel="noreferrer">{c.address} ↗</a>}
            {a != null && <span>{tn(a, '{n} year old', '{n} years old')}</span>}
            {c.entity && <span className="badge">{c.entity}</span>}
            {c.conditions?.map((x) => <span key={x} className="badge">{x}</span>)}
            {(c.contract_number || c.contract_date) && <span>{t('Contract')} {c.contract_number && `nr. ${c.contract_number}`}{c.contract_date && ` ${t('from {date}', { date: date(c.contract_date) })}`}</span>}
            {c.association && <span className="badge">{c.association}</span>}
          </p>
          {c.diagnoses?.length > 0 && <p><strong>{t(c.diagnoses.length > 1 ? 'Diagnoses' : 'Diagnosis')}:</strong> {c.diagnoses.join('; ')}</p>}
          {(c.tutor_name || c.tutor_phone || c.tutor_email) && (
            <p style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <span>{t('Tutor')}: {c.tutor_name || '—'}{c.tutor_relation ? ` (${c.tutor_relation})` : ''}</span>
              {c.tutor_phone && <a href={`tel:${c.tutor_phone.replace(/\s+/g, '')}`}>{c.tutor_phone}</a>}
              {c.tutor_email && <a href={`mailto:${c.tutor_email}`}>{c.tutor_email}</a>}
            </p>
          )}
        </div>
        {canEdit && <div className="page-actions">
          <button className="btn btn-primary" onClick={() => setForm({ kind: 'session' })}><IconPlus width="16" />{t(`New ${term('event')}`)}</button>
          {c.unbilled > 0 && <button className="btn" onClick={() => setForm({ kind: 'invoice', select: 'all' })}>{t('Bill {amount}', { amount: money0(c.unbilled) })}</button>}
          <button className="btn" onClick={() => setForm({ kind: 'pdf' })}><IconDownload width="15" />PDF</button>
          <button className="btn" onClick={() => setForm({ kind: 'edit' })}><IconEdit width="15" />{t('Edit')}</button>
          <button className="btn btn-danger" onClick={del}><IconTrash width="15" />{t('Delete')}</button>
        </div>}
      </div>
      {err && <div className="error-box" style={{ marginBottom: 12 }}>{err}</div>}

      <div className="grid grid-3-1" style={{ alignItems: 'start' }}>
        <div className="stack">
          {c.other_therapies?.length > 0 && (
            <div className="card card-pad">
              <div className="card-head"><h2>{t('Other therapies')}</h2></div>
              <div className="stack" style={{ gap: 0 }}>
                {c.other_therapies.map((r, i) => (
                  <div key={i} className="side-item">
                    <div className="row-title">{r.therapy}</div>
                    <div className="row-sub">{[r.therapist, r.place, r.frequency].filter(Boolean).join(' · ')}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {c.about && (
            <div className="card card-pad">
              <div className="card-head"><h2>{t('About')}</h2></div>
              <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{c.about}</p>
            </div>
          )}
          <Notes c={c} reload={reload} />
          <History c={c} reload={reload} />
          <Sessions c={c} run={run} onEdit={(s) => setForm({ kind: 'session', session: s })} />
        </div>
        <div className="stack">
          <div className="card card-pad">
            <div className="card-head"><h2>{t('Owes')}</h2></div>
            <div className="mini-stat"><span className="mini-label">{t('Not billed yet')}</span><strong>{money0(c.unbilled)}</strong></div>
            <div className="mini-stat" style={{ marginTop: 10 }}><span className="mini-label">{t('Billed, not paid')}</span><strong className={c.unpaid > 0 ? 'neg' : ''}>{money0(c.unpaid)}</strong></div>
          </div>
          <Packages c={c} canEdit={canEdit} run={run} onNew={() => setForm({ kind: 'package' })} onEdit={(p) => setForm({ kind: 'package', pkg: p })}
            onBill={(p) => setForm({ kind: 'invoice', select: { package_ids: [p.id] } })} />
          <Invoices c={c} canEdit={canEdit} run={run} onNew={() => setForm({ kind: 'invoice' })} onEdit={(i) => setForm({ kind: 'invoice', invoiceId: i.id })} />
        </div>
      </div>

      {form?.kind === 'edit' && <PatientForm patient={c} onClose={close} onSaved={saved} />}
      {form?.kind === 'session' && <SessionForm session={form.session} clientId={c.id} onClose={close} onSaved={saved} />}
      {form?.kind === 'package' && <PackageForm pkg={form.pkg} clientId={c.id} travelFee={c.travel_fee} onClose={close} onSaved={saved} />}
      {form?.kind === 'pdf' && <SessionsPdf c={c} onClose={close} />}
      {form?.kind === 'invoice' && <InvoiceForm invoiceId={form.invoiceId} clientId={c.id} select={form.select} onClose={close} onSaved={saved} />}
    </div>
  );
}

/** Dated notes, newest first: what was done, how it went, what to do next time. */
function Notes({ c, reload }) {
  const { canEdit } = usePermissions();
  const [f, setF] = useState(null); // { id?, date, text }
  const [err, run] = useAction(reload);
  const save = async (e) => {
    e.preventDefault();
    if (await run(() => (f.id ? api.put(`/client-notes/${f.id}`, f) : api.post(`/clients/${c.id}/notes`, f)))) setF(null);
  };
  const editor = (
    <form onSubmit={save} className="stack" style={{ gap: 8 }}>
      <input type="date" value={f?.date || ''} onChange={(e) => setF({ ...f, date: e.target.value })} required style={{ width: 'auto' }} />
      <textarea value={f?.text || ''} onChange={(e) => setF({ ...f, text: e.target.value })} rows={4} required autoFocus
        placeholder={t('What was done, how it went, what to do next time…')} />
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn btn-primary btn-sm">{t('Save note')}</button>
        <button type="button" className="btn btn-sm" onClick={() => setF(null)}>{t('Cancel')}</button>
      </div>
    </form>
  );
  return (
    <div className="card card-pad">
      <div className="card-head">
        <div><h2>{t('Notes')}</h2><p>{t('Private: only accounts in this app can read them')}</p></div>
        {canEdit && !f && <button className="btn btn-sm" onClick={() => setF({ date: localToday(), text: '' })}><IconPlus width="14" />{t('Note')}</button>}
      </div>
      {err && <div className="error-box" style={{ marginBottom: 10 }}>{err}</div>}
      {f && !f.id && <div style={{ marginBottom: 14 }}>{editor}</div>}
      {c.notes.length ? (
        <div className="note-list">
          {c.notes.map((n) => (f?.id === n.id ? <div key={n.id}>{editor}</div> : (
            <div key={n.id} className="note">
              <div className="note-head">
                <strong>{date(n.date)}</strong>
                {canEdit && <span className="note-actions">
                  <button className="icon-btn" aria-label={t('Edit note')} onClick={() => setF(n)}><IconEdit width="15" /></button>
                  <button className="icon-btn" aria-label={t('Delete note')} onClick={() => confirmDelete(t('this note')) && run(() => api.del(`/client-notes/${n.id}`))}><IconTrash width="15" /></button>
                </span>}
              </div>
              <p>{n.text}</p>
            </div>
          )))}
        </div>
      ) : !f && <p className="muted" style={{ margin: 0 }}>{t('No notes yet.')}</p>}
    </div>
  );
}

/** What was done with them before the app: each service once, with either the hours done or the days it was done on. */
export function History({ c, reload }) {
  const { canEdit } = usePermissions();
  const { term } = useBusiness();
  const { data: types } = useApi(canEdit ? '/event-types' : null);
  // { id?, kind: 'hours' | 'dates', service_id, hours, dates: [{ date, minutes }], day, mins } — day / mins: the date being added.
  const [f, setF] = useState(null);
  const [err, run] = useAction(reload);
  const usual = (serviceId) => types?.find((ty) => String(ty.id) === String(serviceId))?.duration || '';
  const withDay = (x) => (x.day && !x.dates.some((d) => d.date === x.day)
    ? { ...x, dates: [...x.dates, { date: x.day, minutes: x.mins === '' ? null : Number(x.mins) }].sort((p, q) => p.date.localeCompare(q.date)), day: '' }
    : x);
  const save = async (e) => {
    e.preventDefault();
    const body = f.kind === 'dates' ? withDay(f) : f; // a day typed in but not added yet still counts
    if (await run(() => (f.id ? api.put(`/client-history/${f.id}`, body) : api.post(`/clients/${c.id}/history`, body)))) setF(null);
  };
  // A day's minutes: the ones entered for it, else the service's usual duration (an estimate).
  const dayMinutes = (h, d) => d.minutes || h.duration || 0;
  const minutes = (h) => (h.kind === 'dates' ? h.dates.reduce((a, d) => a + dayMinutes(h, d), 0) : h.hours * 60);
  const estimated = (h) => h.kind === 'dates' && h.dates.some((d) => !d.minutes && h.duration);
  const total = c.history.reduce((a, h) => a + minutes(h), 0) / 60;
  const sessions = c.history.filter((h) => h.kind === 'dates').reduce((a, h) => a + h.dates.length, 0);
  const hoursLabel = (min) => number(Math.round(min / 60 * 100) / 100);
  const editor = f && (
    <form onSubmit={save} style={{ display: 'grid', gap: 8, padding: '6px 0' }}>
      <div className="segmented" style={{ justifySelf: 'start' }}>
        <button type="button" className={f.kind === 'hours' ? 'on' : ''} onClick={() => setF({ ...f, kind: 'hours' })}>{t('Hours spent')}</button>
        <button type="button" className={f.kind === 'dates' ? 'on' : ''} onClick={() => setF({ ...f, kind: 'dates' })}>{t('Dates done')}</button>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <Select value={f.service_id ? String(f.service_id) : ''} required style={{ flex: '1 1 160px' }}
          // The usual duration of the service fills the duration of the next date (when it hasn't been typed).
          onChange={(e) => setF({ ...f, service_id: e.target.value, mins: f.mins === '' || f.mins === usual(f.service_id) ? usual(e.target.value) : f.mins })}>
          <option value="">{t('— choose —')}</option>
          {/* Each service once: the ones already in the history (other than this entry's) aren't offered. */}
          {types?.filter((ty) => !c.history.some((h) => h.service_id === ty.id && h.id !== f.id))
            .map((ty) => <option key={ty.id} value={ty.id}>{ty.name}</option>)}
        </Select>
        {f.kind === 'hours' && (
          <input type="number" min="0.25" step="0.25" inputMode="decimal" value={f.hours ?? ''} onChange={(e) => setF({ ...f, hours: e.target.value })}
            required placeholder={t('Hours')} aria-label={t('Hours')} style={{ width: 100 }} />
        )}
      </div>
      {f.kind === 'dates' && (
        <>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            <input type="date" value={f.day} onChange={(e) => setF({ ...f, day: e.target.value })} aria-label={t('Date')} style={{ width: 170 }}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); setF(withDay(f)); } }} />
            <input type="number" min="1" max="1440" step="5" inputMode="numeric" value={f.mins} onChange={(e) => setF({ ...f, mins: e.target.value })}
              placeholder="—" aria-label={t('Duration (minutes)')} style={{ width: 80 }}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); setF(withDay(f)); } }} />
            <span className="muted">min</span>
            <button type="button" className="btn btn-sm" onClick={() => setF(withDay(f))} disabled={!f.day}><IconPlus width="14" />{t('Add')}</button>
          </div>
          {f.dates.length ? (
            <div style={{ display: 'grid', gap: 4 }}>
              {f.dates.map((d, i) => (
                <div key={d.date} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span style={{ width: 110 }}>{date(d.date)}</span>
                  <input type="number" min="1" max="1440" step="5" inputMode="numeric" value={d.minutes ?? ''} style={{ width: 80 }}
                    placeholder={usual(f.service_id) ? String(usual(f.service_id)) : '—'} aria-label={t('Duration on {date} (minutes)', { date: date(d.date) })}
                    onChange={(e) => setF({ ...f, dates: f.dates.map((x, j) => (j === i ? { ...x, minutes: e.target.value === '' ? null : Number(e.target.value) } : x)) })} />
                  <span className="muted">min</span>
                  <button type="button" className="icon-btn" aria-label={t('Remove {date}', { date: date(d.date) })}
                    onClick={() => setF({ ...f, dates: f.dates.filter((x) => x.date !== d.date) })}><IconTrash width="14" /></button>
                </div>
              ))}
            </div>
          ) : <span className="hint">{t('Pick each day it was done on, with how long it took, and press Add.')}</span>}
        </>
      )}
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn btn-primary btn-sm">{t('Save')}</button>
        <button type="button" className="btn btn-sm" onClick={() => setF(null)}>{t('Cancel')}</button>
      </div>
    </form>
  );
  const anyEstimate = c.history.some(estimated);
  const summary = [total > 0 && t(anyEstimate ? '≈ {h} h in all' : '{h} h in all', { h: number(Math.round(total * 100) / 100) }),
    sessions > 0 && tn(sessions, '{n} dated session', '{n} dated sessions')].filter(Boolean).join(' · ');
  return (
    <div className="card card-pad">
      <div className="card-head">
        <div><h2>{t('Before the app')}</h2><p>{c.history.length ? summary : t('Hours done before using this app')}</p></div>
        {canEdit && !f && <button className="btn btn-sm" onClick={() => setF({ kind: 'hours', service_id: '', hours: '', dates: [], day: '', mins: '' })}><IconPlus width="14" />{t('Entry')}</button>}
      </div>
      {err && <div className="error-box" style={{ marginBottom: 10 }}>{err}</div>}
      {f && !f.id && editor}
      {c.history.length ? c.history.map((h) => (f?.id === h.id ? <div key={h.id}>{editor}</div> : (
        <div key={h.id} className="side-item" style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            {h.service_name || <span className="muted">{t(`No ${term('sport')}`)}</span>}
            {h.kind === 'dates' && <div className="muted" style={{ fontSize: 12.5 }}>
              {h.dates.map((d) => `${date(d.date)}${d.minutes ? ` (${d.minutes} min)` : ''}`).join(', ')}</div>}
          </div>
          <strong style={{ whiteSpace: 'nowrap' }}>{h.kind === 'dates'
            ? <>{tn(h.dates.length, '{n} session', '{n} sessions')}{minutes(h) ? <span className="muted" style={{ fontWeight: 400 }}> · {estimated(h) ? '≈ ' : ''}{hoursLabel(minutes(h))} h</span> : null}</>
            : `${number(h.hours)} h`}</strong>
          {canEdit && <span className="note-actions">
            <button className="icon-btn" aria-label={t('Edit')}
              onClick={() => setF({ ...h, hours: h.hours ?? '', day: '', mins: h.duration || '' })}><IconEdit width="15" /></button>
            <button className="icon-btn" aria-label={t('Delete')} onClick={() => confirmDelete(t('this entry')) && run(() => api.del(`/client-history/${h.id}`))}><IconTrash width="15" /></button>
          </span>}
        </div>
      ))) : !f && <p className="muted" style={{ margin: 0 }}>{t('Nothing entered.')}</p>}
    </div>
  );
}

function Sessions({ c, run, onEdit }) {
  const { canEdit } = usePermissions();
  const { term, Term } = useBusiness();
  const status = (a, s) => run(() => api.put(`/appointments/${a.id}/status`, { status: s }));
  return (
    <div className="card">
      <div className="card-pad card-head" style={{ marginBottom: 0 }}><div><h2>{t(Term('events'))}</h2><p>{t('{n} done', { n: c.appointments.filter((a) => a.status === 'done').length })}</p></div></div>
      <div className="table-wrap">
        {c.appointments.length ? (
          <table>
            <thead><tr><th>{t('Date')}</th><th className="hide-sm">{t(Term('sport'))}</th><th>{t('Status')}</th><th className="r">{t('Price')}</th><th className="hide-sm" />{canEdit && <th />}</tr></thead>
            <tbody>
              {c.appointments.map((a) => (
                <tr key={a.id}>
                  <td>{date(a.date)}<div className="row-sub">{timeLabel(a)}</div>
                    <div className="row-sub show-sm">{[a.type_name, a.location || t(VENUES[a.venue] || VENUES.home)].filter(Boolean).join(' · ')}</div></td>
                  <td className="hide-sm">{a.type_name || <span className="muted">—</span>}{a.therapist && <span className="muted"> · {a.therapist}</span>}<div className="row-sub">{t(VENUES[a.venue] || VENUES.home)}{a.location && ` · ${a.location}`}{a.place && <> · <a href={mapsUrl(a.place)} target="_blank" rel="noreferrer">{a.place} ↗</a></>}</div>{a.note && <div className="row-sub cell-wrap">{a.note}</div>}</td>
                  <td><SessionStatus status={a.status} />{a.cancel_reason && <div className="row-sub cell-wrap">{a.cancel_reason}</div>}</td>
                  <td className="r">{sessionPrice(a)}</td>
                  <td className="hide-sm"><Billing a={a} /></td>
                  {canEdit && <td className="r actions">
                    {a.status === 'scheduled' && a.date <= localToday() && <button className="icon-btn" title={t('Mark done')} aria-label={t('Mark done')} onClick={() => status(a, 'done')}><IconCheck /></button>}
                    <button className="icon-btn" aria-label={t('Edit')} onClick={() => onEdit(a)}><IconEdit /></button>
                  </td>}
                </tr>
              ))}
            </tbody>
          </table>
        ) : <div className="empty">{t(`No ${term('events')} yet.`)}</div>}
      </div>
    </div>
  );
}

function Packages({ c, canEdit, run, onNew, onEdit, onBill }) {
  const { term } = useBusiness();
  return (
    <div className="card card-pad">
      <div className="card-head"><h2>{t('Packages')}</h2>{canEdit && <button className="btn btn-sm" onClick={onNew}><IconPlus width="14" />{t('Package')}</button>}</div>
      {c.packages.length ? c.packages.map((p) => (
        <div key={p.id} className="side-item">
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
            <strong>{p.name}</strong><span>{money0(p.amount)}</span>
          </div>
          {/* Two bars: the sessions done (those done before it was entered included), and the places taken (done + booked). */}
          <div className="progress" style={{ margin: '6px 0 4px' }}><div style={{ width: `${Math.min(1, (p.before + p.used) / p.sessions) * 100}%`, background: 'var(--income)' }} /></div>
          <div className="progress" style={{ margin: '0 0 6px' }}><div style={{ width: `${Math.min(1, (p.before + p.used + p.booked) / p.sessions) * 100}%`, background: 'var(--series)' }} /></div>
          <div className="legend" style={{ gap: 12, marginBottom: 4 }}>
            <span><i style={{ background: 'var(--income)' }} />{t('Sessions done')} {p.before + p.used}/{p.sessions}</span>
            <span><i style={{ background: 'var(--series)' }} />{t('Done + booked')} {p.before + p.used + p.booked}/{p.sessions}</span>
          </div>
          <div className="row-sub">{p.before > 0 && `${t('{n} done before', { n: p.before })} · `}{t(`{used} done · {booked} booked · {left} left of {total} ${term('events')}`, { used: p.used, booked: p.booked, left: p.left, total: p.sessions })}
            {p.expires ? ` · ${t('until {date}', { date: date(p.expires) })}` : ''}</div>
          {p.travel_total > 0 && <div className="row-sub">{t('{price} + travel {fee} × {n} = {travel}', { price: money0(p.price), fee: money0(p.travel_fee), n: p.sessions, travel: money0(p.travel_total) })}</div>}
          {(p.items?.length > 1 || p.items?.[0]?.service_id) && <div className="package-parts">{p.items.map((it, i) => (
            <span key={i} className={it.left ? '' : 'muted'}>{it.service_name || t('Any service')}: {t('{left} of {total} left', { left: it.left, total: it.sessions })}</span>
          ))}</div>}
          <div className="row-sub" style={{ display: 'flex', gap: 10, marginTop: 4 }}>
            {p.invoice_id ? <span>{docLabel(p)} · {p.invoice_paid ? t('paid') : t('not paid')}</span>
              : p.amount > 0 && <span className="badge badge-warn">{t('Not billed')}</span>}
            {canEdit && <>
              {!p.invoice_id && p.amount > 0 && <button className="link-btn" onClick={() => onBill(p)}>{t('Bill')}</button>}
              <button className="link-btn" onClick={() => onEdit(p)}>{t('Edit')}</button>
              <button className="link-btn" onClick={() => confirmDelete(t('package “{name}”', { name: p.name })) && run(() => api.del(`/packages/${p.id}`))}>{t('Delete')}</button>
            </>}
          </div>
        </div>
      )) : <p className="muted" style={{ margin: 0 }}>{t('No packages.')}</p>}
    </div>
  );
}

function Invoices({ c, canEdit, run, onNew, onEdit }) {
  const tick = (i, paid) => run(() => api.put(`/invoices/${i.id}/paid`, { paid, paid_date: localToday() }));
  return (
    <div className="card card-pad">
      <div className="card-head"><h2>{t('Invoices & receipts')}</h2>{canEdit && <button className="btn btn-sm" onClick={onNew}><IconPlus width="14" />{t('New')}</button>}</div>
      {c.invoices.length ? c.invoices.map((i) => (
        <div key={i.id} className="side-item" style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <label className="check" title={i.paid ? t('Paid on {date}', { date: date(i.paid_date) }) : t('Not paid yet')}>
            <input type="checkbox" checked={!!i.paid} disabled={!canEdit} onChange={(e) => tick(i, e.target.checked)} aria-label={t('Paid')} />
          </label>
          <div style={{ flex: 1, minWidth: 0 }}>
            {canEdit ? <button className="link-btn" style={{ fontSize: 'inherit' }} onClick={() => onEdit(i)}>{docLabel(i)}</button> : docLabel(i)}
            <div className="row-sub">{date(i.date)} · {i.paid ? t('paid {date}', { date: date(i.paid_date) }) : t('not paid')}</div>
          </div>
          <strong className={i.paid ? '' : 'neg'}>{money0(i.amount)}</strong>
        </div>
      )) : <p className="muted" style={{ margin: 0 }}>{t('None yet.')}</p>}
    </div>
  );
}

/** Downloads the sessions done with them between two dates, as a PDF (pdfUrl: where from, for the parent's page). */
export function SessionsPdf({ c, onClose, pdfUrl = `/api/clients/${c.id}/sessions.pdf` }) {
  const { term } = useBusiness();
  const today = localToday();
  const [f, setF] = useState({ from: `${today.slice(0, 7)}-01`, to: today, history: c.history.length > 0 });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const download = async () => {
    setBusy(true); setErr(null);
    try {
      const res = await fetch(`${pdfUrl}?from=${f.from}&to=${f.to}&history=${f.history ? 1 : 0}`, { credentials: 'same-origin' });
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(t(d.error) || t('Request failed ({status})', { status: res.status })); }
      const name = /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') || '')?.[1] || 'sessions.pdf';
      const url = URL.createObjectURL(await res.blob());
      const a = Object.assign(document.createElement('a'), { href: url, download: name });
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      onClose();
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <Modal title={t(`PDF of the ${term('events')} done`)} onClose={onClose} onSubmit={download}
      footer={<>
        <button type="button" className="btn" onClick={onClose}>{t('Cancel')}</button>
        <button className="btn btn-primary" disabled={busy}><IconDownload width="15" />{t('Download')}</button>
      </>}>
      {err && <div className="error-box" style={{ marginBottom: 12 }}>{err}</div>}
      <div className="form-grid">
        <label className="field">{t('From')}
          <input type="date" value={f.from} max={f.to || undefined} onChange={(e) => setF({ ...f, from: e.target.value })} required /></label>
        <label className="field">{t('To')}
          <input type="date" value={f.to} min={f.from || undefined} onChange={(e) => setF({ ...f, to: e.target.value })} required /></label>
        {c.history.length > 0 && (
          <label className="check full"><input type="checkbox" checked={f.history} onChange={(e) => setF({ ...f, history: e.target.checked })} />
            {t('Include the history from before the app')}</label>
        )}
      </div>
    </Modal>
  );
}
