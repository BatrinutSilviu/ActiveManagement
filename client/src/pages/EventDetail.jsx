import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useApi, useCanRun, usePermissions } from '../hooks.js';
import { useBusiness } from '../business.js';
import { date, money0 } from '../format.js';
import EventForm from '../components/EventForm.jsx';
import TxForm from '../components/TxForm.jsx';
import TxTable from '../components/TxTable.jsx';
import { confirmDelete } from '../components/Modal.jsx';
import { IconCheck, IconCopy, IconEdit, IconPlus, IconTrash, IconChevronLeft } from '../components/Icons.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import Attendees from './event/Attendees.jsx';
import Discounts from './event/Discounts.jsx';
import Impact from './event/Impact.jsx';
import { EventVouchers, OurPrizes, PartnerPrizes } from './event/Prizes.jsx';
import Statement from './event/Statement.jsx';
import StockUsage from './event/StockUsage.jsx';
import Tasks from './event/Tasks.jsx';
import { t } from '../i18n/index.js';

// A fresh page per event: going from one event to another (e.g. to a copy just made) doesn't carry over any state.
export default function EventDetailPage() {
  const { id } = useParams();
  return <EventDetail key={id} />;
}

function EventDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: e, error, reload: reloadEvent } = useApi(`/events/${id}`);
  const { data: txs, reload: reloadTx } = useApi(`/transactions?event_id=${id}`);
  const { data: monthSplit } = useApi(e ? `/splits/${e.date.slice(0, 7)}` : null); // the event's month may have its own targets
  const split = monthSplit?.split;
  const [editing, setEditing] = useState(false);
  const [copying, setCopying] = useState(false);
  const [txForm, setTxForm] = useState(null); // { kind } | { tx }
  const { canEdit } = usePermissions();
  const canRun = useCanRun(e); // organizers run their own events too, until they're finalized
  const { on, Term } = useBusiness();

  if (error) return <div className="error-box">{error}</div>;
  if (!e || !txs || !split) return null;

  const reload = () => { reloadEvent(); reloadTx(); };
  const del = async () => {
    if (!confirmDelete(t('“{name}” with its costs (used stock goes back to its holders)', { name: e.name }))) return;
    await api.del(`/events/${e.id}`);
    navigate('/events');
  };
  const setStatus = async (status) => { await api.put(`/events/${e.id}/status`, { status }); reload(); };
  const delTx = async (tx) => {
    if (!confirmDelete(t('this transaction'))) return;
    await api.del(`/transactions/${tx.id}`);
    reload();
  };

  return (
    <div>
      <Link to="/events" className="back-link"><IconChevronLeft width="16" height="16" />{t(Term('events'))}</Link>
      <div className="page-head">
        <div>
          <h1>{e.name}</h1>
          <p style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <span className="badge">{e.type_name}</span>
            {e.activity_name && <span className="badge">{e.activity_name}</span>}
            {!!e.training && <span className="badge badge-training">{t('Training')}</span>}
            {e.source && (e.external_url
              ? <a className="badge" href={e.external_url} target="_blank" rel="noreferrer" title={t('Created from the {app} app; changes there update it here', { app: e.source })}>{t('From the {app} app', { app: e.source })} ↗</a>
              : <span className="badge" title={t('Created from the {app} app; changes there update it here', { app: e.source })}>{t('From the {app} app', { app: e.source })}</span>)}
            <StatusBadge status={e.status} />
            <span>{date(e.date)}{e.end_date ? ` – ${date(e.end_date)}` : ''}</span>
            {e.start_time && <span>· {e.start_time}{e.end_time ? `–${e.end_time}` : ''}</span>}
            {e.location && <span>· {e.location}</span>}
            <span>· {t('{n} people × {fee}', { n: e.participants, fee: money0(e.participation_fee) })}{e.venue_mode === 'fixed' ? (e.venue_total > 0 ? ` · ${t('venue {amount} fixed', { amount: money0(e.venue_total) })}` : '') : e.venue_fee > 0 ? ` (${t('{amount} to the venue', { amount: money0(e.venue_fee) })})` : ''}</span>
          </p>
        </div>
        {(canEdit || canRun) && <div className="page-actions">
          {canEdit && e.status === 'planned' && <button className="btn btn-primary" onClick={() => setStatus('completed')}><IconCheck width="16" />{t('Finalize event')}</button>}
          {canEdit && e.status === 'completed' && <button className="btn" onClick={() => setStatus('planned')}>{t('Reopen as live')}</button>}
          {canRun && <button className="btn" onClick={() => setEditing(true)}><IconEdit width="15" />{t('Edit')}</button>}
          <button className="btn" onClick={() => setCopying(true)}><IconCopy width="15" />{t('Duplicate')}</button>
          {canEdit && <button className="btn btn-danger" onClick={del}><IconTrash width="15" />{t('Delete')}</button>}
        </div>}
      </div>

      <div className="grid grid-3-1" style={{ alignItems: 'start' }}>
        <div className="stack">
          <div className="card">
            <div className="card-pad card-head" style={{ marginBottom: 0 }}>
              <div><h2>{t('Costs & extra income')}</h2><p>{t('Categories decide whether a cost is organizing or a benefit')}</p></div>
              {canRun && (
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-sm" onClick={() => setTxForm({ kind: 'expense' })}><IconPlus width="14" />{t('Cost')}</button>
                  <button className="btn btn-sm" onClick={() => setTxForm({ kind: 'income' })}><IconPlus width="14" />{t('Income')}</button>
                </div>
              )}
            </div>
            <div className="table-wrap">
              <TxTable rows={txs} showEvent={false} showGroup compact editable={canRun} onEdit={(tx) => setTxForm({ tx })} onDelete={delTx}
                empty={t('No costs recorded yet. Fee income comes from people × fee.')} />
            </div>
          </div>
          <Attendees e={e} reload={reload} />
          <Discounts e={e} reload={reload} />
          {on('stock') && <StockUsage e={e} reload={reload} />}
          {on('payouts') && <Impact e={e} reload={reload} />}
          {on('payouts') && <Tasks e={e} reload={reload} />}
          {on('vouchers') && <EventVouchers e={e} />}
          <OurPrizes e={e} />
          {on('partners') && <PartnerPrizes e={e} />}
        </div>
        <div className="stack">
          <Statement e={e} split={split} />
          {e.budget > 0 && (
            <div className="card card-pad">
              <div className="card-head"><h2>{t('Budget')}</h2><span className="muted">{money0(e.budget)}</span></div>
              <div className="progress"><div style={{ width: `${Math.min(e.expenses / e.budget, 1) * 100}%`, background: e.expenses > e.budget ? 'var(--profit-neg)' : 'var(--series)' }} /></div>
              <p className="secondary" style={{ margin: '8px 0 0' }}>{t('{amount} spent · {pct}% of budget', { amount: money0(e.expenses), pct: Math.round((e.expenses / e.budget) * 100) })}</p>
            </div>
          )}
          {e.notes && (
            <div className="card card-pad">
              <div className="card-head"><h2>{t('Notes')}</h2></div>
              <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{e.notes}</p>
            </div>
          )}
        </div>
      </div>

      {editing && <EventForm event={e} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); reload(); }} />}
      {copying && <EventForm copyOf={e} copyCosts={txs.filter((x) => !x.fund_sport_id && !x.fund_part_id).length}
        onClose={() => setCopying(false)} onSaved={(newId) => { setCopying(false); navigate(`/events/${newId}`); }} />}
      {txForm && (
        <TxForm tx={txForm.tx} defaultKind={txForm.kind} eventId={e.id} eventDate={e.date}
          onClose={() => setTxForm(null)} onSaved={() => { setTxForm(null); reload(); }} />
      )}
    </div>
  );
}
