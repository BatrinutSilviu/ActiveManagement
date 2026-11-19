// One patient: contact details, what to keep in mind, dated notes, their sessions, packages, invoices and receipts.
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../../api.js';
import { useAction, useApi, usePermissions } from '../../hooks.js';
import { useBusiness } from '../../business.js';
import { date, money0 } from '../../format.js';
import { confirmDelete } from '../../components/Modal.jsx';
import { IconCheck, IconChevronLeft, IconEdit, IconPlus, IconTrash } from '../../components/Icons.jsx';
import InvoiceForm from './InvoiceForm.jsx';
import { PackageForm, PatientForm } from './PatientForms.jsx';
import SessionForm from './SessionForm.jsx';
import { Billing, docLabel, localToday, mapsUrl, sessionPrice, SessionStatus, timeLabel } from './common.jsx';

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
  const [form, setForm] = useState(null); // { kind: 'edit' | 'session' | 'package' | 'invoice', … }
  const [err, run] = useAction(reload);
  const close = () => setForm(null);
  const saved = () => { setForm(null); reload(); };

  if (error) return <div className="error-box">{error}</div>;
  if (!c) return null;
  const del = async () => {
    if (!confirmDelete(`${c.name}, with their notes, ${term('events')} and packages`)) return;
    if (await run(() => api.del(`/clients/${c.id}`))) navigate('/patients');
  };
  const a = age(c.birth_date);

  return (
    <div>
      <Link to="/patients" className="back-link"><IconChevronLeft width="16" height="16" />{Term('people')}</Link>
      <div className="page-head">
        <div>
          <h1>{c.name}{!!c.archived && <> <span className="badge">archived</span></>}</h1>
          <p style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {c.phone && <a href={`tel:${c.phone.replace(/\s+/g, '')}`}>{c.phone}</a>}
            {c.email && <a href={`mailto:${c.email}`}>{c.email}</a>}
            {c.address && <a href={mapsUrl(c.address)} target="_blank" rel="noreferrer">{c.address} ↗</a>}
            {a != null && <span>{a} years old</span>}
            {c.association && <span className="badge">{c.association}</span>}
          </p>
          {(c.tutor_name || c.tutor_phone || c.tutor_email) && (
            <p style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <span>Tutor: {c.tutor_name || '—'}{c.tutor_relation ? ` (${c.tutor_relation})` : ''}</span>
              {c.tutor_phone && <a href={`tel:${c.tutor_phone.replace(/\s+/g, '')}`}>{c.tutor_phone}</a>}
              {c.tutor_email && <a href={`mailto:${c.tutor_email}`}>{c.tutor_email}</a>}
            </p>
          )}
        </div>
        {canEdit && <div className="page-actions">
          <button className="btn btn-primary" onClick={() => setForm({ kind: 'session' })}><IconPlus width="16" />New {term('event')}</button>
          {c.unbilled > 0 && <button className="btn" onClick={() => setForm({ kind: 'invoice', select: 'all' })}>Bill {money0(c.unbilled)}</button>}
          <button className="btn" onClick={() => setForm({ kind: 'edit' })}><IconEdit width="15" />Edit</button>
          <button className="btn btn-danger" onClick={del}><IconTrash width="15" />Delete</button>
        </div>}
      </div>
      {err && <div className="error-box" style={{ marginBottom: 12 }}>{err}</div>}

      <div className="grid grid-3-1" style={{ alignItems: 'start' }}>
        <div className="stack">
          {c.about && (
            <div className="card card-pad">
              <div className="card-head"><h2>About</h2></div>
              <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{c.about}</p>
            </div>
          )}
          <Notes c={c} reload={reload} />
          <Sessions c={c} run={run} onEdit={(s) => setForm({ kind: 'session', session: s })} />
        </div>
        <div className="stack">
          <div className="card card-pad">
            <div className="card-head"><h2>Owes</h2></div>
            <div className="mini-stat"><span className="mini-label">Not billed yet</span><strong>{money0(c.unbilled)}</strong></div>
            <div className="mini-stat" style={{ marginTop: 10 }}><span className="mini-label">Billed, not paid</span><strong className={c.unpaid > 0 ? 'neg' : ''}>{money0(c.unpaid)}</strong></div>
          </div>
          <Packages c={c} canEdit={canEdit} run={run} onNew={() => setForm({ kind: 'package' })} onEdit={(p) => setForm({ kind: 'package', pkg: p })}
            onBill={(p) => setForm({ kind: 'invoice', select: { package_ids: [p.id] } })} />
          <Invoices c={c} canEdit={canEdit} run={run} onNew={() => setForm({ kind: 'invoice' })} onEdit={(i) => setForm({ kind: 'invoice', invoiceId: i.id })} />
        </div>
      </div>

      {form?.kind === 'edit' && <PatientForm patient={c} onClose={close} onSaved={saved} />}
      {form?.kind === 'session' && <SessionForm session={form.session} clientId={c.id} onClose={close} onSaved={saved} />}
      {form?.kind === 'package' && <PackageForm pkg={form.pkg} clientId={c.id} onClose={close} onSaved={saved} />}
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
        placeholder="What was done, how it went, what to do next time…" />
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn btn-primary btn-sm">Save note</button>
        <button type="button" className="btn btn-sm" onClick={() => setF(null)}>Cancel</button>
      </div>
    </form>
  );
  return (
    <div className="card card-pad">
      <div className="card-head">
        <div><h2>Notes</h2><p>Private: only accounts in this app can read them</p></div>
        {canEdit && !f && <button className="btn btn-sm" onClick={() => setF({ date: localToday(), text: '' })}><IconPlus width="14" />Note</button>}
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
                  <button className="icon-btn" aria-label="Edit note" onClick={() => setF(n)}><IconEdit width="15" /></button>
                  <button className="icon-btn" aria-label="Delete note" onClick={() => confirmDelete('this note') && run(() => api.del(`/client-notes/${n.id}`))}><IconTrash width="15" /></button>
                </span>}
              </div>
              <p>{n.text}</p>
            </div>
          )))}
        </div>
      ) : !f && <p className="muted" style={{ margin: 0 }}>No notes yet.</p>}
    </div>
  );
}

function Sessions({ c, run, onEdit }) {
  const { canEdit } = usePermissions();
  const { term, Term } = useBusiness();
  const status = (a, s) => run(() => api.put(`/appointments/${a.id}/status`, { status: s }));
  return (
    <div className="card">
      <div className="card-pad card-head" style={{ marginBottom: 0 }}><div><h2>{Term('events')}</h2><p>{c.appointments.filter((a) => a.status === 'done').length} done</p></div></div>
      <div className="table-wrap">
        {c.appointments.length ? (
          <table>
            <thead><tr><th>Date</th><th className="hide-sm">{Term('sport')}</th><th>Status</th><th className="r">Price</th><th className="hide-sm" />{canEdit && <th />}</tr></thead>
            <tbody>
              {c.appointments.map((a) => (
                <tr key={a.id}>
                  <td>{date(a.date)}<div className="row-sub">{timeLabel(a)}</div></td>
                  <td className="hide-sm">{a.type_name || <span className="muted">—</span>}{a.note && <div className="row-sub cell-wrap">{a.note}</div>}</td>
                  <td><SessionStatus status={a.status} /></td>
                  <td className="r">{sessionPrice(a)}</td>
                  <td className="hide-sm"><Billing a={a} /></td>
                  {canEdit && <td className="r actions">
                    {a.status === 'scheduled' && a.date <= localToday() && <button className="icon-btn" title="Mark done" aria-label="Mark done" onClick={() => status(a, 'done')}><IconCheck /></button>}
                    <button className="icon-btn" aria-label="Edit" onClick={() => onEdit(a)}><IconEdit /></button>
                  </td>}
                </tr>
              ))}
            </tbody>
          </table>
        ) : <div className="empty">No {term('events')} yet.</div>}
      </div>
    </div>
  );
}

function Packages({ c, canEdit, run, onNew, onEdit, onBill }) {
  const { term } = useBusiness();
  return (
    <div className="card card-pad">
      <div className="card-head"><h2>Packages</h2>{canEdit && <button className="btn btn-sm" onClick={onNew}><IconPlus width="14" />Package</button>}</div>
      {c.packages.length ? c.packages.map((p) => (
        <div key={p.id} className="side-item">
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
            <strong>{p.name}</strong><span>{money0(p.price)}</span>
          </div>
          <div className="progress" style={{ margin: '6px 0' }}><div style={{ width: `${Math.min(1, (p.used + p.booked) / p.sessions) * 100}%`, background: 'var(--series)' }} /></div>
          <div className="row-sub">{p.used} done · {p.booked} booked · {p.left} left of {p.sessions} {term('events')}
            {p.expires ? ` · until ${date(p.expires)}` : ''}</div>
          <div className="row-sub" style={{ display: 'flex', gap: 10, marginTop: 4 }}>
            {p.invoice_id ? <span>{docLabel(p)}{p.invoice_paid ? ' · paid' : ' · not paid'}</span>
              : p.price > 0 && <span className="badge badge-warn">Not billed</span>}
            {canEdit && <>
              {!p.invoice_id && p.price > 0 && <button className="link-btn" onClick={() => onBill(p)}>Bill</button>}
              <button className="link-btn" onClick={() => onEdit(p)}>Edit</button>
              <button className="link-btn" onClick={() => confirmDelete(`package “${p.name}”`) && run(() => api.del(`/packages/${p.id}`))}>Delete</button>
            </>}
          </div>
        </div>
      )) : <p className="muted" style={{ margin: 0 }}>No packages.</p>}
    </div>
  );
}

function Invoices({ c, canEdit, run, onNew, onEdit }) {
  const tick = (i, paid) => run(() => api.put(`/invoices/${i.id}/paid`, { paid, paid_date: localToday() }));
  return (
    <div className="card card-pad">
      <div className="card-head"><h2>Invoices &amp; receipts</h2>{canEdit && <button className="btn btn-sm" onClick={onNew}><IconPlus width="14" />New</button>}</div>
      {c.invoices.length ? c.invoices.map((i) => (
        <div key={i.id} className="side-item" style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <label className="check" title={i.paid ? `Paid on ${date(i.paid_date)}` : 'Not paid yet'}>
            <input type="checkbox" checked={!!i.paid} disabled={!canEdit} onChange={(e) => tick(i, e.target.checked)} aria-label="Paid" />
          </label>
          <div style={{ flex: 1, minWidth: 0 }}>
            {canEdit ? <button className="link-btn" style={{ fontSize: 'inherit' }} onClick={() => onEdit(i)}>{docLabel(i)}</button> : docLabel(i)}
            <div className="row-sub">{date(i.date)}{i.paid ? ` · paid ${date(i.paid_date)}` : ' · not paid'}</div>
          </div>
          <strong className={i.paid ? '' : 'neg'}>{money0(i.amount)}</strong>
        </div>
      )) : <p className="muted" style={{ margin: 0 }}>None yet.</p>}
    </div>
  );
}
