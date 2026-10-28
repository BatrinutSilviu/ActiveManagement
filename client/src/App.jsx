import { useCallback, useEffect, useState } from 'react';
import { NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { api } from './api.js';
import { IconActivity, IconBox, IconCalendar, IconCoins, IconDashboard, IconLogout, IconMenu, IconReport, IconSettings, IconTrophy, IconUpload, IconWallet } from './components/Icons.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Events from './pages/Events.jsx';
import EventDetail from './pages/EventDetail.jsx';
import Transactions from './pages/Transactions.jsx';
import Monthly from './pages/Monthly.jsx';
import Payouts from './pages/Payouts.jsx';
import { SportDetail, SportsList } from './pages/Sports.jsx';
import Stock from './pages/Stock.jsx';
import Settings from './pages/Settings.jsx';
import Import from './pages/Import.jsx';

const NAV = [
  { to: '/', label: 'Dashboard', icon: IconDashboard, end: true },
  { to: '/events', label: 'Events', icon: IconCalendar },
  { to: '/payouts', label: 'Payouts', icon: IconCoins },
  { to: '/monthly', label: 'Monthly', icon: IconReport },
  { to: '/sports', label: 'Sports', icon: IconTrophy },
  { to: '/stock', label: 'Stock', icon: IconBox },
  { to: '/transactions', label: 'Transactions', icon: IconWallet },
  { to: '/import', label: 'Import', icon: IconUpload },
  { to: '/settings', label: 'Settings', icon: IconSettings },
];

const initials = (name) => name.split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();

function ThemeToggle() {
  const [theme, setTheme] = useState(() => document.documentElement.dataset.theme || 'system');
  const change = (t) => {
    setTheme(t);
    try {
      if (t === 'system') { delete document.documentElement.dataset.theme; localStorage.removeItem('am-theme'); }
      else { document.documentElement.dataset.theme = t; localStorage.setItem('am-theme', t); }
    } catch { /* storage unavailable */ }
    window.dispatchEvent(new Event('am:theme'));
  };
  return (
    <div className="segmented" aria-label="Theme">
      {['light', 'system', 'dark'].map((t) => (
        <button key={t} className={theme === t ? 'on' : ''} onClick={() => change(t)}>{t[0].toUpperCase() + t.slice(1)}</button>
      ))}
    </div>
  );
}

export default function App() {
  const [auth, setAuth] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();

  const refresh = useCallback(() => api.get('/auth/me').then(setAuth).catch(() => setAuth({ user: null })), []);
  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => {
    const out = () => setAuth((a) => ({ ...a, user: null }));
    window.addEventListener('am:signed-out', out);
    return () => window.removeEventListener('am:signed-out', out);
  }, []);
  useEffect(() => setMenuOpen(false), [location.pathname]);

  if (!auth) return null;
  if (!auth.user) return <Login needsSetup={auth.needsSetup} onDone={refresh} />;

  const logout = async () => { await api.post('/auth/logout'); refresh(); };

  return (
    <div className="shell">
      <div className="mobile-bar">
        <button className="icon-btn" onClick={() => setMenuOpen(!menuOpen)} aria-label="Menu"><IconMenu /></button>
        Active Management
      </div>
      <aside className={`sidebar ${menuOpen ? 'open' : ''}`}>
        <div className="brand">
          <span className="brand-mark"><IconActivity width="19" height="19" color="#fff" /></span>
          <div>Active<small>Community admin</small></div>
        </div>
        <div className="nav-section">Overview</div>
        {NAV.slice(0, 5).map(({ to, label, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end} className="nav-link"><Icon />{label}</NavLink>
        ))}
        <div className="nav-section">Manage</div>
        {NAV.slice(5).map(({ to, label, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end} className="nav-link"><Icon />{label}</NavLink>
        ))}
        <div className="sidebar-foot">
          <ThemeToggle />
          <div className="user-chip">
            <span className="avatar">{initials(auth.user.name)}</span>
            <div className="who">
              <div>{auth.user.name}</div>
              <span>{auth.user.email}</span>
            </div>
            <button className="icon-btn" onClick={logout} aria-label="Sign out" title="Sign out"><IconLogout /></button>
          </div>
        </div>
      </aside>
      <main className="main">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/events" element={<Events />} />
          <Route path="/events/:id" element={<EventDetail />} />
          <Route path="/transactions" element={<Transactions />} />
          <Route path="/payouts" element={<Payouts />} />
          <Route path="/monthly" element={<Monthly />} />
          <Route path="/sports" element={<SportsList />} />
          <Route path="/sports/:id" element={<SportDetail />} />
          <Route path="/stock" element={<Stock />} />
          <Route path="/import" element={<Import />} />
          <Route path="/settings" element={<Settings user={auth.user} />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </main>
    </div>
  );
}
