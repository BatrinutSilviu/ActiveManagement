import { useState } from 'react';
import { api } from '../api.js';
import { IconActivity } from '../components/Icons.jsx';

export default function Login({ needsSetup, onDone }) {
  const [f, setF] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState(null);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    try {
      await api.post(needsSetup ? '/auth/setup' : '/auth/login', f);
      onDone();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="auth-page">
      <div className="card auth-card">
        <form onSubmit={submit}>
          <div className="brand">
            <span className="brand-mark"><IconActivity width="19" height="19" color="#fff" /></span>Active
          </div>
          <div>
            <h1>{needsSetup ? 'Welcome to Active' : 'Sign in'}</h1>
            <p className="secondary" style={{ margin: '6px 0 0' }}>
              {needsSetup ? 'Create the first admin account to get started.' : 'Active community admin area.'}
            </p>
          </div>
          {error && <div className="error-box">{error}</div>}
          {needsSetup && <label className="field">Name<input value={f.name} onChange={set('name')} required autoFocus /></label>}
          <label className="field">Email<input type="email" value={f.email} onChange={set('email')} required autoFocus={!needsSetup} /></label>
          <label className="field">Password
            <input type="password" value={f.password} onChange={set('password')} required minLength={needsSetup ? 8 : undefined} />
          </label>
          <button className="btn btn-primary">{needsSetup ? 'Create admin account' : 'Sign in'}</button>
        </form>
      </div>
    </div>
  );
}
