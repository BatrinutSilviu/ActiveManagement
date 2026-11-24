// Settings: app accounts (admins only) and changing one's own password.
import { useState } from 'react';
import { api } from '../../api.js';
import { ROLE_LABELS, useAction, useApi } from '../../hooks.js';
import { date } from '../../format.js';
import { confirmDelete } from '../../components/Modal.jsx';
import { IconTrash } from '../../components/Icons.jsx';
import Select from '../../components/Select.jsx';
import { t } from '../../i18n/index.js';
import { useBusiness } from '../../business.js';

const ROLE_HELP = {
  viewer: 'can see everything, change nothing',
  editor: 'manages events, money, stock and settings',
  admin: 'everything, plus accounts and imports',
  parent: 'sees only their child’s page',
  organizer: 'runs only their own events (and creates new ones)',
};

/** Who an organizer is (a person in People): they see and run the events that person has a task on. */
function PersonSelect({ value, onChange, people, ...props }) {
  return (
    <Select className="select-sm" value={value ? String(value) : ''} searchable onChange={(e) => onChange(e.target.value)} {...props}>
      <option value="">{t('Who are they?')}</option>
      {people?.filter((p) => p.active || String(p.id) === String(value)).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
    </Select>
  );
}

/** The children a parent account can see: patients, added from a list and removed with ×. */
function ChildrenPicker({ value, onChange, patients }) {
  const picked = new Set(value.map((c) => c.id));
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
      {value.map((c) => (
        <span key={c.id} className="badge" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>{c.name}
          <button type="button" className="icon-btn" style={{ width: 18, height: 18 }} aria-label={t('Remove {name}', { name: c.name })}
            onClick={() => onChange(value.filter((x) => x.id !== c.id))}>×</button>
        </span>
      ))}
      <Select className="select-sm" value="" searchable style={{ minWidth: 160 }} aria-label={t('Add a child')}
        onChange={(e) => { const p = patients?.find((x) => String(x.id) === e.target.value); if (p) onChange([...value, { id: p.id, name: p.name }]); }}>
        <option value="">{t('+ child…')}</option>
        {patients?.filter((p) => !picked.has(p.id)).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </Select>
    </div>
  );
}

// Parent accounts only where there are patients (a practice); organizer accounts only where there are events.
const roles = ({ practice, events }) => Object.entries(ROLE_LABELS)
  .filter(([k]) => (k !== 'parent' || practice) && (k !== 'organizer' || events));

function RoleSelect({ value, onChange, parts, ...props }) {
  return (
    <Select className="select-sm" value={value} onChange={(e) => onChange(e.target.value)} {...props}>
      {roles(parts).map(([k, label]) => <option key={k} value={k}>{t(label)}</option>)}
    </Select>
  );
}

export function Accounts({ user }) {
  const { data, reload } = useApi('/users');
  const { on } = useBusiness();
  const practice = on('practice');
  const parts = { practice, events: on('events') };
  const { data: patients } = useApi(practice ? '/clients' : null);
  const { data: people } = useApi(parts.events ? '/people' : null);
  const [error, run] = useAction(reload);
  const blank = { name: '', email: '', password: '', role: 'viewer', children: [], person_id: '' };
  const [f, setF] = useState(blank);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <div className="card card-pad">
      <div className="card-head">
        <div>
          <h2>{t('Accounts')}</h2>
          <p>{t('Who can sign in.')} {roles(parts).map(([k]) => `${t(ROLE_LABELS[k])}: ${t(ROLE_HELP[k])}`).join(' · ')}.</p>
        </div>
      </div>
      {error && <div className="error-box" style={{ marginBottom: 10 }}>{error}</div>}
      <div className="table-wrap">
        <table>
          <tbody>
            {data?.map((u) => (
              <tr key={u.id}>
                <td>
                  <strong>{u.name}</strong>{u.id === user.id && <span className="muted"> ({t('you')})</span>}
                  <div className="row-sub show-sm">{u.email}</div>
                  {u.role === 'parent' && (
                    <div style={{ marginTop: 6 }}>
                      <ChildrenPicker value={u.children} patients={patients}
                        onChange={(list) => run(() => api.put(`/users/${u.id}/children`, { children: list.map((c) => c.id) }))} />
                      {!u.children.length && <div className="row-sub neg">{t('No child picked: this account sees nothing')}</div>}
                    </div>
                  )}
                  {u.role === 'organizer' && (
                    <div style={{ marginTop: 6 }}>
                      <PersonSelect value={u.person_id} people={people} style={{ maxWidth: 240 }} aria-label={t('Who {name} is', { name: u.name })}
                        onChange={(person_id) => person_id && run(() => api.put(`/users/${u.id}/person`, { person_id }))} />
                      {!u.person_id && <div className="row-sub neg">{t('Not linked to a person: this account sees no event')}</div>}
                    </div>
                  )}
                </td>
                <td className="secondary hide-sm">{u.email}</td>
                <td>
                  {u.id === user.id ? <span className="badge">{t(ROLE_LABELS[u.role])}</span>
                    : <RoleSelect value={u.role} parts={parts} style={{ width: 120 }} aria-label={t('Role of {name}', { name: u.name })}
                        onChange={(role) => run(() => api.put(`/users/${u.id}/role`, { role }))} />}
                </td>
                <td className="muted hide-sm">{t('since {date}', { date: date(u.created_at.slice(0, 10)) })}</td>
                <td className="r actions">
                  {u.id !== user.id && (
                    <button className="icon-btn" aria-label={t('Remove')} onClick={() => confirmDelete(t('account {name}', { name: u.name })) && run(() => api.del(`/users/${u.id}`))}><IconTrash /></button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <form className="form-grid" style={{ marginTop: 14 }}
        onSubmit={async (e) => { e.preventDefault(); if (await run(() => api.post('/users', { ...f, children: f.children.map((c) => c.id) }))) setF(blank); }}>
        <label className="field">{t('Name')}<input value={f.name} onChange={set('name')} required /></label>
        <label className="field">{t('Email')}<input type="email" value={f.email} onChange={set('email')} required /></label>
        <label className="field">{t('Initial password')}<input type="text" value={f.password} onChange={set('password')} minLength={8} required /></label>
        <label className="field">{t('Role')}
          <Select value={f.role} onChange={set('role')}>
            {roles(parts).map(([k, label]) => <option key={k} value={k}>{t(label)} — {t(ROLE_HELP[k])}</option>)}
          </Select>
        </label>
        {f.role === 'organizer' && (
          <label className="field">{t('Who they are')} <span className="hint">— {t('from People: they get the events this person has a task on')}</span>
            <PersonSelect value={f.person_id} people={people} onChange={(person_id) => setF({ ...f, person_id })} required />
          </label>
        )}
        {f.role === 'parent' && (
          <div className="field full">{t('Their child (or children)')}
            <ChildrenPicker value={f.children} patients={patients} onChange={(children) => setF({ ...f, children })} />
          </div>
        )}
        <div><button className="btn">{t('Add account')}</button></div>
      </form>
    </div>
  );
}

export function Password() {
  const [f, setF] = useState({ current: '', password: '' });
  const [msg, setMsg] = useState(null);
  return (
    <div className="card card-pad">
      <div className="card-head"><h2>{t('Change your password')}</h2></div>
      {msg && <div className={msg.ok ? 'pos' : 'error-box'} style={{ marginBottom: 10 }}>{msg.text}</div>}
      <form className="form-grid" onSubmit={async (e) => {
        e.preventDefault();
        try { await api.put('/users/me/password', f); setMsg({ ok: true, text: t('Password updated.') }); setF({ current: '', password: '' }); }
        catch (err) { setMsg({ ok: false, text: err.message }); }
      }}>
        <label className="field">{t('Current password')}<input type="password" value={f.current} onChange={(e) => setF({ ...f, current: e.target.value })} required /></label>
        <label className="field">{t('New password')}<input type="password" value={f.password} minLength={8} onChange={(e) => setF({ ...f, password: e.target.value })} required /></label>
        <div><button className="btn">{t('Update password')}</button></div>
      </form>
    </div>
  );
}
