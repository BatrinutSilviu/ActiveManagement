import { useState } from 'react';
import { api } from '../api.js';
import { IconActivity } from '../components/Icons.jsx';
import Select from '../components/Select.jsx';

// Signing in; on a new copy of the app, first-run setup: the first admin account and, when the business isn't
// set up yet, which business this is (its type decides the starting data and which parts of the app are on).
export default function Login({ needsSetup, info, onDone }) {
  const business = info?.business;
  const newBusiness = needsSetup && !business;
  const [f, setF] = useState({ name: '', email: '', password: '' });
  const [b, setB] = useState({ type: 'practice', name: '', currency: 'RON' });
  const [error, setError] = useState(null);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const setBiz = (k) => (e) => setB({ ...b, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    try {
      await api.post(needsSetup ? '/auth/setup' : '/auth/login', newBusiness ? { ...f, business: b } : f);
      onDone();
    } catch (err) {
      setError(err.message);
    }
  };

  const name = business?.name || b.name || 'Management';
  return (
    <div className="auth-page">
      <div className="card auth-card">
        <form onSubmit={submit}>
          <div className="brand">
            <span className="brand-mark"><IconActivity width="19" height="19" color="#fff" /></span>{name}
          </div>
          <div>
            <h1>{needsSetup ? `Welcome${business ? ` to ${business.name}` : ''}` : 'Sign in'}</h1>
            <p className="secondary" style={{ margin: '6px 0 0' }}>
              {newBusiness ? 'Set up your business and its first admin account.'
                : needsSetup ? 'Create the first admin account to get started.'
                  : `${business?.name ? `${business.name} ` : ''}admin area.`}
            </p>
          </div>
          {error && <div className="error-box">{error}</div>}
          {newBusiness && <>
            <label className="field">Business name<input value={b.name} onChange={setBiz('name')} required autoFocus placeholder="e.g. Ana Popescu Physiotherapy" /></label>
            <label className="field">Kind of business
              <Select value={b.type} onChange={setBiz('type')}>
                {Object.entries(info.types || {}).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
              </Select>
            </label>
            <label className="field">Currency<input value={b.currency} onChange={setBiz('currency')} required maxLength={3} placeholder="RON" /></label>
          </>}
          {needsSetup && <label className="field">Your name<input value={f.name} onChange={set('name')} required autoFocus={!newBusiness} /></label>}
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
