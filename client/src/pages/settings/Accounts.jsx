// Settings: app accounts (admins only) and changing one's own password.
import { useState } from 'react';
import { api } from '../../api.js';
import { ROLE_LABELS, useAction, useApi } from '../../hooks.js';
import { date } from '../../format.js';
import { confirmDelete } from '../../components/Modal.jsx';
import { IconTrash } from '../../components/Icons.jsx';
import Select from '../../components/Select.jsx';

const ROLE_HELP = {
  viewer: 'can see everything, change nothing',
  editor: 'manages events, money, stock and settings',
  admin: 'everything, plus accounts and imports',
};

function RoleSelect({ value, onChange, ...props }) {
  return (
    <Select className="select-sm" value={value} onChange={(e) => onChange(e.target.value)} {...props}>
      {Object.entries(ROLE_LABELS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
    </Select>
  );
}

export function Accounts({ user }) {
  const { data, reload } = useApi('/users');
  const [error, run] = useAction(reload);
  const blank = { name: '', email: '', password: '', role: 'viewer' };
  const [f, setF] = useState(blank);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <div className="card card-pad">
      <div className="card-head">
        <div>
          <h2>Accounts</h2>
          <p>Who can sign in. {Object.entries(ROLE_HELP).map(([k, v]) => `${ROLE_LABELS[k]}: ${v}`).join(' · ')}.</p>
        </div>
      </div>
      {error && <div className="error-box" style={{ marginBottom: 10 }}>{error}</div>}
      <div className="table-wrap">
        <table>
          <tbody>
            {data?.map((u) => (
              <tr key={u.id}>
                <td>
                  <strong>{u.name}</strong>{u.id === user.id && <span className="muted"> (you)</span>}
                  <div className="row-sub show-sm">{u.email}</div>
                </td>
                <td className="secondary hide-sm">{u.email}</td>
                <td>
                  {u.id === user.id ? <span className="badge">{ROLE_LABELS[u.role]}</span>
                    : <RoleSelect value={u.role} style={{ width: 120 }} aria-label={`Role of ${u.name}`}
                        onChange={(role) => run(() => api.put(`/users/${u.id}/role`, { role }))} />}
                </td>
                <td className="muted hide-sm">since {date(u.created_at.slice(0, 10))}</td>
                <td className="r actions">
                  {u.id !== user.id && (
                    <button className="icon-btn" aria-label="Remove" onClick={() => confirmDelete(`account ${u.name}`) && run(() => api.del(`/users/${u.id}`))}><IconTrash /></button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <form className="form-grid" style={{ marginTop: 14 }}
        onSubmit={async (e) => { e.preventDefault(); if (await run(() => api.post('/users', f))) setF(blank); }}>
        <label className="field">Name<input value={f.name} onChange={set('name')} required /></label>
        <label className="field">Email<input type="email" value={f.email} onChange={set('email')} required /></label>
        <label className="field">Initial password<input type="text" value={f.password} onChange={set('password')} minLength={8} required /></label>
        <label className="field">Role
          <Select value={f.role} onChange={set('role')}>
            {Object.entries(ROLE_LABELS).map(([k, label]) => <option key={k} value={k}>{label} — {ROLE_HELP[k]}</option>)}
          </Select>
        </label>
        <div><button className="btn">Add account</button></div>
      </form>
    </div>
  );
}

export function Password() {
  const [f, setF] = useState({ current: '', password: '' });
  const [msg, setMsg] = useState(null);
  return (
    <div className="card card-pad">
      <div className="card-head"><h2>Change your password</h2></div>
      {msg && <div className={msg.ok ? 'pos' : 'error-box'} style={{ marginBottom: 10 }}>{msg.text}</div>}
      <form className="form-grid" onSubmit={async (e) => {
        e.preventDefault();
        try { await api.put('/users/me/password', f); setMsg({ ok: true, text: 'Password updated.' }); setF({ current: '', password: '' }); }
        catch (err) { setMsg({ ok: false, text: err.message }); }
      }}>
        <label className="field">Current password<input type="password" value={f.current} onChange={(e) => setF({ ...f, current: e.target.value })} required /></label>
        <label className="field">New password<input type="password" value={f.password} minLength={8} onChange={(e) => setF({ ...f, password: e.target.value })} required /></label>
        <div><button className="btn">Update password</button></div>
      </form>
    </div>
  );
}
