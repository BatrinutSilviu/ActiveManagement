import { useCallback, useEffect, useState } from 'react';
import { NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { api } from './api.js';
import { money0 } from './format.js';
import { ROLE_LABELS, UserContext, useApi } from './hooks.js';
import { applyBusiness, BusinessContext } from './business.js';
import { t } from './i18n/index.js';
import { IconActivity, IconBox, IconCalendar, IconCoins, IconDashboard, IconGift, IconLogout, IconMenu, IconReceipt, IconReport, IconRoute, IconSettings, IconTicket, IconTrophy, IconUpload, IconUsers, IconWallet } from './components/Icons.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Events from './pages/Events.jsx';
import EventDetail from './pages/EventDetail.jsx';
import Transactions from './pages/Transactions.jsx';
import Monthly from './pages/Monthly.jsx';
import Payouts from './pages/Payouts.jsx';
import { GeneralFundDetail, SportDetail, SportsList } from './pages/Sports.jsx';
import Stock from './pages/Stock.jsx';
import Vouchers from './pages/Vouchers.jsx';
import Partners from './pages/Partners.jsx';
import Settings from './pages/Settings.jsx';
import Server from './pages/Server.jsx';
import Import from './pages/Import.jsx';
import PracticeOverview from './pages/practice/Overview.jsx';
import PracticeSessions from './pages/practice/Sessions.jsx';
import Patients from './pages/practice/Patients.jsx';
import Patient from './pages/practice/Patient.jsx';
import Invoices from './pages/practice/Invoices.jsx';
import Trips from './pages/practice/Trips.jsx';
import Statistics from './pages/practice/Statistics.jsx';
import ParentApp from './pages/parent/ParentApp.jsx';

// `term`: the label is what the business calls it (Events / Sessions…); `feature`: shown only when that part is on.
// `overview`: in the top group of the menu.
const NAV = [
  { to: '/', label: 'Dashboard', icon: IconDashboard, end: true, overview: true },
  { to: '/events', term: 'events', icon: IconCalendar, feature: 'events', overview: true },
  { to: '/sessions', term: 'events', icon: IconCalendar, feature: 'practice', overview: true },
  { to: '/patients', term: 'people', icon: IconUsers, feature: 'practice', overview: true },
  { to: '/invoices', label: 'Invoices', icon: IconReceipt, feature: 'practice', overview: true },
  { to: '/statistics', label: 'Statistics', icon: IconReport, feature: 'practice', overview: true },
  { to: '/trips', label: 'Kilometres', icon: IconRoute, feature: 'trips', overview: true },
  { to: '/payouts', label: 'Payouts', icon: IconCoins, feature: 'payouts', overview: true },
  { to: '/monthly', label: 'Monthly', icon: IconReport, feature: 'events', overview: true },
  { to: '/sports', term: 'sports', icon: IconTrophy, feature: 'funds', overview: true },
  { to: '/stock', label: 'Stock', icon: IconBox, feature: 'stock' },
  { to: '/vouchers', label: 'Vouchers', icon: IconTicket, feature: 'vouchers' },
  { to: '/partners', label: 'Partners', icon: IconGift, feature: 'partners' },
  { to: '/transactions', label: 'Transactions', icon: IconWallet },
  { to: '/import', label: 'Import', icon: IconUpload, adminOnly: true, feature: 'import' },
  { to: '/server', label: 'Server', icon: IconActivity, adminOnly: true, feature: 'server' },
  { to: '/settings', label: 'Settings', icon: IconSettings },
];

/** Always-visible money in the account (refreshed on every page change). */
function AccountBalance({ path }) {
  const { data, reload } = useApi('/funds');
  useEffect(() => { reload(); }, [path]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!data) return null;
  return (
    <NavLink to="/" className="side-balance" title={t('Money in the account — see the Dashboard for what it is')}>
      <span>{t('In the account')}</span>
      <strong>{money0(data.cash.balance)}</strong>
    </NavLink>
  );
}

const initials = (name) => name.split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();

function ThemeToggle() {
  const [theme, setTheme] = useState(() => document.documentElement.dataset.theme || 'system');
  const change = (th) => {
    setTheme(th);
    try {
      if (th === 'system') { delete document.documentElement.dataset.theme; localStorage.removeItem('am-theme'); }
      else { document.documentElement.dataset.theme = th; localStorage.setItem('am-theme', th); }
    } catch { /* storage unavailable */ }
    window.dispatchEvent(new Event('am:theme'));
  };
  return (
    <div className="segmented" aria-label={t('Theme')}>
      {['light', 'system', 'dark'].map((th) => (
        <button key={th} className={theme === th ? 'on' : ''} onClick={() => change(th)}>{t(th[0].toUpperCase() + th.slice(1))}</button>
      ))}
    </div>
  );
}

export default function App() {
  const [auth, setAuth] = useState(null);
  const [info, setInfo] = useState(null); // { business, types, features } from /business
  const loadBusiness = useCallback(() => api.get('/business').then((d) => { applyBusiness(d.business); setInfo(d); }), []);
  useEffect(() => {
    loadBusiness().catch(() => setInfo({ business: null }));
    window.addEventListener('am:business', loadBusiness);
    return () => window.removeEventListener('am:business', loadBusiness);
  }, [loadBusiness]);
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

  if (!auth || !info) return null;
  if (!auth.user) return <Login needsSetup={auth.needsSetup} info={info} onDone={() => { refresh(); loadBusiness(); }} />;

  const b = info.business;
  const on = (f) => !f || !!b?.features?.[f];
  const logout = async () => { await api.post('/auth/logout'); refresh(); };
  const isAdmin = auth.user.role === 'admin';
  // A parent / tutor sees only their child's page, nothing else of the app.
  if (auth.user.role === 'parent') {
    return (
      <BusinessContext.Provider value={b}>
        <UserContext.Provider value={auth.user}><ParentApp user={auth.user} onLogout={logout} /></UserContext.Provider>
      </BusinessContext.Provider>
    );
  }
  // An organizer sees only their own events (and Settings, for their password).
  const isOrganizer = auth.user.role === 'organizer';
  const nav = NAV.filter((n) => (!n.adminOnly || isAdmin) && on(n.feature) && (!isOrganizer || ['/events', '/settings'].includes(n.to)))
    .map((n) => ({ ...n, label: t(n.label || (b?.terms?.[n.term] ?? n.term).replace(/^./, (c) => c.toUpperCase())) }));

  return (
    <BusinessContext.Provider value={b}>
    <UserContext.Provider value={auth.user}>
    <div className="shell">
      <div className="mobile-bar">
        <button className="icon-btn" onClick={() => setMenuOpen(!menuOpen)} aria-label={t('Menu')}><IconMenu /></button>
        {t('{name} Management', { name: b?.name ?? '' })}
      </div>
      {menuOpen && <div className="sidebar-backdrop" onClick={() => setMenuOpen(false)} />}
      <aside className={`sidebar ${menuOpen ? 'open' : ''}`}>
        <div className="brand">
          <span className="brand-mark"><IconActivity width="19" height="19" color="#fff" /></span>
          <div>{b?.name}{b?.tagline && <small>{b.tagline}</small>}</div>
        </div>
        {!isOrganizer && <AccountBalance path={location.pathname} />}
        <div className="nav-section">{t('Overview')}</div>
        {nav.filter((n) => n.overview).map(({ to, label, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end} className="nav-link"><Icon />{label}</NavLink>
        ))}
        <div className="nav-section">{t('Manage')}</div>
        {nav.filter((n) => !n.overview).map(({ to, label, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end} className="nav-link"><Icon />{label}</NavLink>
        ))}
        <div className="sidebar-foot">
          <ThemeToggle />
          <div className="user-chip">
            <span className="avatar">{initials(auth.user.name)}</span>
            <div className="who">
              <div>{auth.user.name}</div>
              <span>{t(ROLE_LABELS[auth.user.role])} · {auth.user.email}</span>
            </div>
            <button className="icon-btn" onClick={logout} aria-label={t('Sign out')} title={t('Sign out')}><IconLogout /></button>
          </div>
        </div>
      </aside>
      <main className="main">
        {isOrganizer ? <Routes>
          <Route path="/events" element={<Events />} />
          <Route path="/events/:id" element={<EventDetail />} />
          <Route path="/settings" element={<Settings user={auth.user} />} />
          <Route path="*" element={<Navigate to="/events" />} />
        </Routes> : <Routes>
          <Route path="/" element={on('practice') && !on('events') ? <PracticeOverview /> : <Dashboard />} />
          {on('events') && <Route path="/events" element={<Events />} />}
          {on('events') && <Route path="/events/:id" element={<EventDetail />} />}
          {on('practice') && <Route path="/sessions" element={<PracticeSessions />} />}
          {on('practice') && <Route path="/patients" element={<Patients />} />}
          {on('practice') && <Route path="/patients/:id" element={<Patient />} />}
          {on('practice') && <Route path="/invoices" element={<Invoices />} />}
          {on('trips') && <Route path="/trips" element={<Trips />} />}
          {on('practice') && <Route path="/statistics" element={<Statistics />} />}
          <Route path="/transactions" element={<Transactions />} />
          {on('payouts') && <Route path="/payouts" element={<Payouts />} />}
          {on('events') && <Route path="/monthly" element={<Monthly />} />}
          {on('funds') && <Route path="/sports" element={<SportsList />} />}
          {on('funds') && <Route path="/sports/general" element={<GeneralFundDetail />} />}
          {on('funds') && <Route path="/sports/:id" element={<SportDetail />} />}
          {on('stock') && <Route path="/stock" element={<Stock />} />}
          {on('vouchers') && <Route path="/vouchers" element={<Vouchers />} />}
          {on('partners') && <Route path="/partners" element={<Partners />} />}
          {isAdmin && on('import') && <Route path="/import" element={<Import />} />}
          {isAdmin && on('server') && <Route path="/server" element={<Server />} />}
          <Route path="/settings" element={<Settings user={auth.user} />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>}
      </main>
    </div>
    </UserContext.Provider>
    </BusinessContext.Provider>
  );
}
