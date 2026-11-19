import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useApi, usePermissions, usePersistentState } from '../hooks.js';
import { CURRENCY, date, money, money0, number, today } from '../format.js';
import Modal from '../components/Modal.jsx';
import Kpi from '../components/Kpi.jsx';
import { IconEdit, IconPlus, IconTrash } from '../components/Icons.jsx';
import Select from '../components/Select.jsx';
import PersonPicker from '../components/PersonPicker.jsx';
import { t, tn } from '../i18n/index.js';

// Partners and the prizes they give at our events. A record only: none of it counts in any budget.
// English; show it with t(NOT_COUNTED).
export const NOT_COUNTED = 'Given by the partner — not counted in any profit, fund or payout';

/** Record a prize a partner gave (from an event, or on its own) or edit one. */
export function PrizeForm({ prize, event, onClose, onSaved }) {
  const { data: partners } = useApi('/partners');
  const { data: people } = useApi('/people');
  const { data: events } = useApi(event ? null : '/events');
  const [f, setF] = useState(() => ({
    partner_id: '', partner_name: '', prize: '', qty: 1, winner_name: '', event_id: event?.id || '',
    date: event?.date || today(), note: '', ...(prize || {}), value: prize?.value ?? '', person_id: prize?.person_id || '',
    // A winner who isn't in People is typed by name.
    winnerMode: prize?.winner_name && !prize?.person_id ? 'name' : 'person',
  }));
  const [error, setError] = useState(null);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const newPartner = f.partner_id === 'new';
  const save = async () => {
    try {
      const { winnerMode, ...rest } = f;
      const body = { ...rest, partner_id: newPartner ? '' : f.partner_id, partner_name: newPartner ? f.partner_name : '',
        person_id: winnerMode === 'person' ? f.person_id : '', winner_name: winnerMode === 'name' ? f.winner_name : '' };
      if (prize) await api.put(`/partner-prizes/${prize.id}`, body);
      else await api.post('/partner-prizes', body);
      onSaved();
    } catch (e) { setError(e.message); }
  };
  const pickEvent = (e) => {
    const ev = events?.find((x) => String(x.id) === e.target.value);
    setF({ ...f, event_id: e.target.value, date: ev ? ev.date : f.date });
  };
  const sportId = event?.type_id ?? events?.find((x) => String(x.id) === String(f.event_id))?.type_id;
  // This sport's partners first, then the others.
  const list = (partners || []).filter((p) => p.active || p.id === prize?.partner_id)
    .sort((a, b) => (b.sport_id === sportId) - (a.sport_id === sportId) || a.name.localeCompare(b.name));
  return (
    <Modal title={prize ? t('Edit partner prize') : t('Partner prize')} onClose={onClose} onSubmit={save}
      footer={<><button type="button" className="btn" onClick={onClose}>{t('Cancel')}</button><button className="btn btn-primary">{t('Save')}</button></>}>
      {error && <div className="error-box">{error}</div>}
      <div className="form-grid">
        <label className="field">{t('Partner')}
          <Select value={f.partner_id} onChange={set('partner_id')} required>
            <option value="">{t('Choose partner…')}</option>
            {list.map((p) => <option key={p.id} value={p.id}>{p.name}{p.sport_name ? ` · ${p.sport_name}` : ''}</option>)}
            <option value="new">+ {t('New partner…')}</option>
          </Select>
        </label>
        {newPartner ? (
          <label className="field">{t('New partner’s name')}
            <input value={f.partner_name} onChange={set('partner_name')} placeholder={t('e.g. Padel Arena')} required autoFocus />
          </label>
        ) : <div className="hide-sm" />}
        <label className="field full">{t('Prize')}
          <input value={f.prize} onChange={set('prize')} placeholder={t('e.g. Rackets, 1h court voucher, sports bag')} required />
        </label>
        <label className="field">{t('How many')}
          <input type="number" min="1" step="1" value={f.qty} onChange={set('qty')} />
        </label>
        <label className="field">{t('Estimated value ({currency}, optional)', { currency: CURRENCY })}
          <input type="number" min="0" step="0.01" value={f.value} onChange={set('value')} placeholder={t('All of it together')} />
          <span className="hint">{t('Only for the record — not counted anywhere')}</span>
        </label>
        {event ? (
          <p className="hint full" style={{ margin: 0 }}>{t('Given at {event}', { event: event.name })} · {date(event.date)}</p>
        ) : (
          <>
            <label className="field">{t('Given at (optional)')}
              <Select value={f.event_id || ''} onChange={pickEvent}>
                <option value="">— {t('not at an event')} —</option>
                {events?.filter((e) => e.status !== 'cancelled').slice(0, 150).map((e) => <option key={e.id} value={e.id}>{date(e.date)} · {e.name}</option>)}
              </Select>
            </label>
            <label className="field">{t('Date')}<input type="date" value={f.date} onChange={set('date')} required /></label>
          </>
        )}
        <div className="field">{t('Won by (optional)')}
          <div className="segmented">
            <button type="button" className={f.winnerMode === 'person' ? 'on' : ''} onClick={() => setF({ ...f, winnerMode: 'person' })}>{t('From People')}</button>
            <button type="button" className={f.winnerMode === 'name' ? 'on' : ''} onClick={() => setF({ ...f, winnerMode: 'name' })}>{t('Type a name')}</button>
          </div>
        </div>
        {f.winnerMode === 'person' ? (
          <div className="field">{t('Winner')}
            <PersonPicker people={people} value={f.person_id} onChange={(id) => setF((x) => ({ ...x, person_id: id }))}
              allowCreate={false} placeholder={t('Type a name from People')} />
          </div>
        ) : (
          <label className="field">{t('Winner’s name')}
            <input value={f.winner_name || ''} onChange={set('winner_name')} placeholder={t('e.g. Andrei & Mihai')} />
          </label>
        )}
        <label className="field full">{t('Note')}<input value={f.note || ''} onChange={set('note')} placeholder={t('e.g. 1st place, men’s Silver')} /></label>
      </div>
    </Modal>
  );
}

/** Partner prizes table, used on this page and on an event's page. */
export function PrizeTable({ list, reload, showEvent = true, setForm }) {
  const { canEdit } = usePermissions();
  const [error, setError] = useState(null);
  const del = async (p) => {
    if (!window.confirm(t('Delete “{prize}” from {partner}?', { prize: p.prize, partner: p.partner_name }))) return;
    try { await api.del(`/partner-prizes/${p.id}`); setError(null); reload(); } catch (e) { setError(e.message); }
  };
  return (
    <>
      {error && <div className="error-box" style={{ margin: '0 22px 12px' }}>{error}</div>}
      <div className="table-wrap">
        <table>
          <thead><tr><th>{t('Prize')}</th><th className="hide-sm">{t('Partner')}</th>{showEvent && <th className="hide-sm">{t('Given at')}</th>}<th className="hide-sm">{t('Won by')}</th><th className="r">{t('Est. value')}</th>{canEdit && <th />}</tr></thead>
          <tbody>
            {list.map((p) => (
              <tr key={p.id}>
                <td className="cell-wrap">
                  {p.qty > 1 ? `${number(p.qty)} × ` : ''}{p.prize}
                  {p.note && <div className="row-sub">{p.note}</div>}
                  <div className="row-sub show-sm">{[p.partner_name, showEvent && (p.event_name || date(p.date)), p.winner && t('won by {name}', { name: p.winner })].filter(Boolean).join(' · ')}</div>
                </td>
                <td className="hide-sm">{p.partner_name}</td>
                {showEvent && (
                  <td className="cell-wrap hide-sm">
                    {p.event_id ? <Link to={`/events/${p.event_id}`}>{p.event_name}</Link> : <span className="muted">{t('Not at an event')}</span>}
                    <div className="row-sub">{date(p.date)}{p.sport_name ? ` · ${p.sport_name}` : ''}</div>
                  </td>
                )}
                <td className="secondary hide-sm">{p.winner || '—'}</td>
                <td className="r secondary">{p.value == null ? '—' : money(p.value)}</td>
                {canEdit && (
                  <td className="r actions">
                    <button className="icon-btn" aria-label={t('Edit prize')} onClick={() => setForm({ prize: p })}><IconEdit /></button>
                    <button className="icon-btn" aria-label={t('Delete prize')} onClick={() => del(p)}><IconTrash /></button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function PartnerForm({ partner, onClose, onSaved }) {
  const { data: types } = useApi('/event-types');
  const [f, setF] = useState({ name: '', sport_id: '', contact: '', notes: '', active: 1, ...(partner || {}) });
  const [error, setError] = useState(null);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const save = async () => {
    try {
      if (partner) await api.put(`/partners/${partner.id}`, f);
      else await api.post('/partners', f);
      onSaved();
    } catch (e) { setError(e.message); }
  };
  return (
    <Modal title={partner ? t('Edit partner') : t('New partner')} onClose={onClose} onSubmit={save}
      footer={<><button type="button" className="btn" onClick={onClose}>{t('Cancel')}</button><button className="btn btn-primary">{t('Save')}</button></>}>
      {error && <div className="error-box">{error}</div>}
      <div className="form-grid">
        <label className="field">{t('Name')}<input value={f.name} onChange={set('name')} placeholder={t('e.g. Padel Arena')} required autoFocus /></label>
        <label className="field">{t('Sport')}
          <Select value={f.sport_id || ''} onChange={set('sport_id')}>
            <option value="">{t('Any sport')}</option>
            {types?.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </Select>
        </label>
        <label className="field full">{t('Contact (optional)')}<input value={f.contact || ''} onChange={set('contact')} placeholder={t('Person, phone, email')} /></label>
        <label className="field full">{t('Notes')}<textarea value={f.notes || ''} onChange={set('notes')} placeholder={t('What the partnership is about…')} /></label>
        {partner && (
          <label className="field full check-field">
            <input type="checkbox" checked={!!f.active} onChange={(e) => setF({ ...f, active: e.target.checked ? 1 : 0 })} />
            {t('Active partner')} <span className="hint">— {t('inactive ones keep their prizes but aren’t offered for new ones')}</span>
          </label>
        )}
      </div>
    </Modal>
  );
}

export default function Partners() {
  const { data: partners, reload: reloadPartners } = useApi('/partners');
  const { data: prizes, reload: reloadPrizes } = useApi('/partner-prizes');
  const [only, setOnly] = usePersistentState('am-partners-only', '');
  const [prizeForm, setPrizeForm] = useState(null);
  const [partnerForm, setPartnerForm] = useState(null);
  const [error, setError] = useState(null);
  const { canEdit } = usePermissions();
  if (!partners || !prizes) return null;
  const reload = () => { reloadPartners(); reloadPrizes(); };
  const shown = only ? prizes.filter((p) => String(p.partner_id) === String(only)) : prizes;
  const value = prizes.reduce((a, p) => a + (p.value || 0), 0);
  const delPartner = async (p) => {
    if (!window.confirm(t('Delete partner {name}?', { name: p.name }))) return;
    try { await api.del(`/partners/${p.id}`); setError(null); reload(); } catch (e) { setError(e.message); }
  };

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>{t('Partners')}</h1>
          <p>{t('Clubs, shops and sponsors we work with, and the prizes they give at our events. Only a record: partners’ prizes aren’t our money, so they don’t count in any profit, fund or payout.')}</p>
        </div>
        {canEdit && <div className="page-actions">
          <button className="btn" onClick={() => setPartnerForm({})}><IconPlus width="16" />{t('Partner')}</button>
          <button className="btn btn-primary" onClick={() => setPrizeForm({})}><IconPlus width="16" />{t('Partner prize')}</button>
        </div>}
      </div>
      <div className="stack">
        <div className="grid grid-kpi">
          <Kpi label={t('Partners')} hero value={number(partners.filter((p) => p.active).length)} sub={t('{n} gave prizes', { n: partners.filter((p) => p.prizes).length })} />
          <Kpi label={t('Prizes received')} value={number(prizes.reduce((a, p) => a + p.qty, 0))} sub={tn(new Set(prizes.map((p) => p.event_id).filter(Boolean)).size, 'at {n} event', 'at {n} events')} />
          <Kpi label={t('Estimated value')} value={money0(value)} sub={t('for the record — not in any budget')} />
        </div>
        {error && <div className="error-box">{error}</div>}
        <div className="card">
          <div className="card-pad card-head" style={{ marginBottom: 0 }}><div><h2>{t('Partners')}</h2><p>{t('Click a partner to see only their prizes')}</p></div></div>
          {partners.length ? (
            <div className="table-wrap">
              <table>
                <thead><tr><th>{t('Partner')}</th><th className="hide-sm">{t('Sport')}</th><th className="r">{t('Prizes')}</th><th className="r hide-sm">{t('Est. value')}</th><th className="hide-sm">{t('Last prize')}</th>{canEdit && <th />}</tr></thead>
                <tbody>
                  {partners.map((p) => (
                    <tr key={p.id} className={`clickable ${p.active ? '' : 'row-off'}`} onClick={() => setOnly(String(only) === String(p.id) ? '' : String(p.id))}
                      aria-selected={String(only) === String(p.id)}>
                      <td className="cell-wrap">
                        <div className="row-title">{p.name}{String(only) === String(p.id) && <span className="muted"> · {t('shown below')}</span>}</div>
                        <div className="row-sub">{[p.contact, !p.active && t('inactive'), p.notes].filter(Boolean).join(' · ')}</div>
                      </td>
                      <td className="secondary hide-sm">{p.sport_name || t('Any')}</td>
                      <td className="r">{number(p.items)}{p.events ? <div className="row-sub">{tn(p.events, '{n} event', '{n} events')}</div> : null}</td>
                      <td className="r secondary hide-sm">{p.value ? money0(p.value) : '—'}</td>
                      <td className="secondary hide-sm">{p.last_date ? date(p.last_date) : '—'}</td>
                      {canEdit && (
                        <td className="r actions" onClick={(e) => e.stopPropagation()}>
                          <button className="icon-btn" aria-label={t('Edit {name}', { name: p.name })} onClick={() => setPartnerForm({ partner: p })}><IconEdit /></button>
                          <button className="icon-btn" aria-label={t('Delete {name}', { name: p.name })} onClick={() => delPartner(p)}><IconTrash /></button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <div className="empty">{t('No partners yet.')}{canEdit ? ` ${t('Add one, or add it while recording a prize.')}` : ''}</div>}
        </div>
        <div className="card">
          <div className="card-pad card-head" style={{ marginBottom: 0 }}>
            <div><h2>{only ? t('Prizes from {name}', { name: partners.find((p) => String(p.id) === String(only))?.name || '…' }) : t('All partner prizes')}</h2><p>{t(NOT_COUNTED)}</p></div>
            {only && <button className="btn btn-sm" onClick={() => setOnly('')}>{t('Show all')}</button>}
          </div>
          {shown.length ? <PrizeTable list={shown} reload={reload} setForm={setPrizeForm} />
            : <div className="empty">{only ? t('No partner prizes recorded for this partner yet.') : t('No partner prizes recorded yet.')}</div>}
        </div>
      </div>
      {prizeForm && <PrizeForm prize={prizeForm.prize} onClose={() => setPrizeForm(null)} onSaved={() => { setPrizeForm(null); reload(); }} />}
      {partnerForm && <PartnerForm partner={partnerForm.partner} onClose={() => setPartnerForm(null)} onSaved={() => { setPartnerForm(null); reload(); }} />}
    </div>
  );
}
