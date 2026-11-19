// Settings: the team — founders, and the organisers and members we add — and the saved discounts each is entitled to.
import { useState } from 'react';
import { api } from '../../api.js';
import { useAction, useApi } from '../../hooks.js';
import { discountLabel, money0 } from '../../format.js';
import Modal, { confirmDelete } from '../../components/Modal.jsx';
import { IconEdit, IconTrash } from '../../components/Icons.jsx';
import { rename } from './rename.js';
import { t, tn } from '../../i18n/index.js';

function PersonDiscounts({ person, discounts, onClose, onSaved }) {
  const [ids, setIds] = useState(() => new Set(person.discount_ids));
  const toggle = (id) => setIds((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const save = async () => { await api.put(`/people/${person.id}/discounts`, { discount_ids: [...ids] }); onSaved(); };
  return (
    <Modal title={t('Discounts for {name}', { name: person.name })} onClose={onClose} onSubmit={save}
      footer={<><button type="button" className="btn" onClick={onClose}>{t('Cancel')}</button><button className="btn btn-primary">{t('Save')}</button></>}>
      {discounts.length ? (
        <div className="check-list">
          {discounts.map((d) => (
            <label key={d.id} className="check">
              <input type="checkbox" checked={ids.has(d.id)} onChange={() => toggle(d.id)} />
              <span><b>{d.name}</b> <span className="muted">{discountLabel(d)} · {d.sport_name || t('any sport')}</span></span>
            </label>
          ))}
        </div>
      ) : <p className="muted" style={{ margin: 0 }}>{t('No discounts defined yet — add them in the Discounts card first.')}</p>}
    </Modal>
  );
}

// One list of People: founders, or the organisers and members we add.
function PeopleList({ title, intro, founders, list, discounts, save, run, setEditing }) {
  const [f, setF] = useState({ name: '', is_premium: false });
  return (
    <div className="card card-pad">
      <div className="card-head"><div><h2>{title}</h2><p>{intro}</p></div></div>
      {list.length > 0 && <div className="table-wrap" style={{ maxHeight: 420 }}>
        <table>
          <thead><tr><th style={{ width: '100%' }}>{t('Name')}</th>{!founders && <th>{t('Premium')}</th>}<th className="hide-sm">{t('Discounts')}</th><th className="r hide-sm">{t('Organised')}</th><th className="r hide-sm">{t('Points')}</th><th className="r hide-sm">{t('Holds stock')}</th><th className="r hide-sm">{t('Discounts received')}</th><th /></tr></thead>
          <tbody>
            {list.map((p) => (
              <tr key={p.id} className={p.active ? '' : 'row-off'}>
                <td className="cell-wrap">
                  {p.name}{!founders && p.is_member ? <span className="badge" style={{ marginLeft: 6 }} title={t('Pays only the venue’s part of event prices')}>{t('Member')}</span> : null}
                  <div className="row-sub show-sm">
                    {discounts?.filter((d) => p.discount_ids.includes(d.id)).map((d) => d.name).join(', ')}
                    {p.discount_ids.length ? ' · ' : ''}<button className="link-btn" onClick={() => setEditing(p)}>{p.discount_ids.length ? t('Edit discounts') : t('+ Discount')}</button>
                    {' · '}<button className="link-btn" onClick={() => save(p, { active: !p.active })}>{p.active ? t('Deactivate') : t('Activate')}</button>
                  </div>
                  <div className="row-sub"><button className="link-btn" onClick={() => save(p, { is_founder: !founders })}>{founders ? t('Not a founder') : t('Make founder')}</button></div>
                </td>
                {!founders && <td><input type="checkbox" checked={!!p.is_premium} onChange={(e) => save(p, { is_premium: e.target.checked })} aria-label={t('Premium')} /></td>}
                <td className="cell-wrap hide-sm">
                  <div className="holders">
                    {discounts?.filter((d) => p.discount_ids.includes(d.id)).map((d) => <span key={d.id} className="badge">{d.name}</span>)}
                    <button className="btn btn-sm btn-ghost" onClick={() => setEditing(p)}>{p.discount_ids.length ? t('Edit') : t('+ Add')}</button>
                  </div>
                </td>
                <td className="r hide-sm">{p.events}</td>
                <td className="r hide-sm">{p.points}</td>
                <td className="r hide-sm">{p.stock_value ? money0(p.stock_value) : '—'}</td>
                <td className="r hide-sm">{p.discounts_received ? <span title={tn(p.discounted_events, '{n} event', '{n} events')}>{money0(p.discounts_received)}</span> : '—'}</td>
                <td className="r actions">
                  <button className="btn btn-sm btn-ghost hide-sm" onClick={() => save(p, { active: !p.active })}>{p.active ? t('Deactivate') : t('Activate')}</button>
                  <button className="icon-btn" aria-label={t('Rename')} onClick={() => { const n = rename(p.name); if (n) save(p, { name: n }); }}><IconEdit /></button>
                  <button className="icon-btn" aria-label={t('Delete')} onClick={() => confirmDelete(p.name) && run(() => api.del(`/people/${p.id}`))}><IconTrash /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>}
      {!list.length && <p className="muted" style={{ margin: 0 }}>{t('Nobody yet.')}</p>}
      <form className="filters" style={{ margin: '14px 0 0' }}
        onSubmit={async (e) => { e.preventDefault(); if (await run(() => api.post('/people', { ...f, is_founder: founders }))) setF({ name: '', is_premium: false }); }}>
        <input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder={t('Full name')} required style={{ flex: 1 }} />
        {!founders && <label className="check"><input type="checkbox" checked={f.is_premium} onChange={(e) => setF({ ...f, is_premium: e.target.checked })} />{t('Premium')}</label>}
        <button className="btn">{founders ? t('Add founder') : t('Add organiser')}</button>
      </form>
    </div>
  );
}

export function People() {
  const { data, reload } = useApi('/people');
  const { data: discounts, reload: reloadDiscounts } = useApi('/discounts');
  const [editing, setEditing] = useState(null);
  const [error, run] = useAction(reload);
  const save = (p, patch) => run(() => api.put(`/people/${p.id}`, { ...p, ...patch }));
  const shared = { discounts, save, run, setEditing };
  return (
    <>
      {error && <div className="error-box">{error}</div>}
      <PeopleList {...shared} founders title={t('Founders')} list={data?.filter((p) => p.is_founder) || []}
        intro={t('They share the founders’ part equally, earn organiser points and pay only the venue’s part of an event’s price.')} />
      <PeopleList {...shared} founders={false} title={t('Organisers & members')} list={data?.filter((p) => !p.is_founder) || []}
        intro={t('The people who organise with us (and premium members). They earn organiser points, can hold stock and pay only the venue’s part of an event’s price. Voucher winners, attendees and people given a discount aren’t added here — they’re kept by name on the voucher or event.')} />
      {editing && discounts && (
        <PersonDiscounts person={editing} discounts={discounts} onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); reload(); reloadDiscounts(); }} />
      )}
    </>
  );
}
