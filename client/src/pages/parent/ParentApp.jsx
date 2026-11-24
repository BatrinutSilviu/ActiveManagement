// What a parent / tutor sees once signed in (practices): their child's sessions, packages, invoices and receipts and
// the history from before the app, read only. With several children, a tab per child. Nothing else of the app is
// reachable: the server refuses every other request from a parent account (auth.js → checkRole).
import { useState } from 'react';
import { useApi } from '../../hooks.js';
import { useBusiness } from '../../business.js';
import { date, money0 } from '../../format.js';
import { t, tn } from '../../i18n/index.js';
import { IconActivity, IconDownload, IconLogout } from '../../components/Icons.jsx';
import { Password } from '../settings/Accounts.jsx';
import { History, SessionsPdf } from '../practice/Patient.jsx';
import { docLabel, localToday, SessionStatus, timeLabel, VENUES } from '../practice/common.jsx';

export default function ParentApp({ user, onLogout }) {
  const { business: b } = useBusiness();
  const { data: children, error } = useApi('/parent/children');
  const [picked, setPicked] = useState(null);
  const [showPassword, setShowPassword] = useState(false);
  const child = children?.find((c) => c.id === picked) || children?.[0];
  return (
    <div className="parent-shell" style={{ maxWidth: 960, margin: '0 auto', padding: '16px 16px 40px' }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18, flexWrap: 'wrap' }}>
        <span className="brand-mark"><IconActivity width="19" height="19" color="#fff" /></span>
        <strong style={{ fontSize: 17, flex: 1 }}>{b?.name}</strong>
        <span className="muted hide-sm">{user.name}</span>
        <button className="btn btn-sm" onClick={() => setShowPassword(!showPassword)}>{t('Change your password')}</button>
        <button className="icon-btn" onClick={onLogout} aria-label={t('Sign out')} title={t('Sign out')}><IconLogout /></button>
      </header>
      {showPassword && <div style={{ marginBottom: 16 }}><Password /></div>}
      {error && <div className="error-box">{error}</div>}
      {children && !children.length && (
        <div className="card card-pad"><p className="muted" style={{ margin: 0 }}>{t('No child is linked to your account yet. Ask the therapist to add them.')}</p></div>
      )}
      {children?.length > 1 && (
        <div className="segmented" style={{ marginBottom: 14 }}>
          {children.map((c) => <button key={c.id} className={c.id === child.id ? 'on' : ''} onClick={() => setPicked(c.id)}>{c.name}</button>)}
        </div>
      )}
      {child && <Child key={child.id} id={child.id} />}
    </div>
  );
}

function Child({ id }) {
  const { Term } = useBusiness();
  const { data: c, error } = useApi(`/parent/children/${id}`);
  const [pdf, setPdf] = useState(false);
  if (error) return <div className="error-box">{error}</div>;
  if (!c) return null;
  const today = localToday();
  const upcoming = c.sessions.filter((s) => s.status === 'scheduled' && s.date >= today).reverse();
  const past = c.sessions.filter((s) => !(s.status === 'scheduled' && s.date >= today));
  const where = (s) => (s.venue === 'practice' ? [t(VENUES.practice), s.location].filter(Boolean).join(' · ') : t(VENUES.home));
  return (
    <div className="stack">
      <div className="card card-pad">
        <div className="card-head" style={{ marginBottom: 0 }}>
          <div>
            <h2>{c.name}</h2>
            <p>{[c.birth_date && t('Born {date}', { date: date(c.birth_date) }),
              t('{n} done', { n: c.sessions.filter((s) => s.status === 'done').length })].filter(Boolean).join(' · ')}</p>
          </div>
          <button className="btn" onClick={() => setPdf(true)}><IconDownload width="15" />PDF</button>
        </div>
      </div>

      <SessionList title={t('Coming up')} empty={t('Nothing planned.')} list={upcoming} where={where} />
      <SessionList title={t(Term('events'))} empty={t('Nothing yet.')} list={past} where={where} showStatus />

      {c.packages.length > 0 && (
        <div className="card">
          <div className="card-pad card-head" style={{ marginBottom: 0 }}><div><h2>{t('Packages')}</h2></div></div>
          <div className="table-wrap"><table>
            <thead><tr><th>{t('Package')}</th><th className="r">{t('Done')}</th><th className="r hide-sm">{t('Booked')}</th><th className="r">{t('Left')}</th><th className="r">{t('Amount')}</th></tr></thead>
            <tbody>{c.packages.map((p) => (
              <tr key={p.id}>
                <td><strong>{p.name || t('Package')}</strong><div className="row-sub">{date(p.date)} · {tn(p.sessions, '{n} session', '{n} sessions')}</div></td>
                <td className="r">{p.done}</td><td className="r hide-sm">{p.booked}</td><td className="r"><strong>{p.left}</strong></td>
                <td className="r">{money0(p.amount)}{p.paid ? <div className="row-sub pos">{t('Paid')}</div> : null}</td>
              </tr>
            ))}</tbody>
          </table></div>
        </div>
      )}

      {c.invoices.length > 0 && (
        <div className="card">
          <div className="card-pad card-head" style={{ marginBottom: 0 }}><div><h2>{t('Invoices and receipts')}</h2></div></div>
          <div className="table-wrap"><table>
            <tbody>{c.invoices.map((i) => (
              <tr key={i.id}>
                <td><strong>{docLabel(i)}</strong><div className="row-sub">{date(i.date)}</div></td>
                <td className="r">{money0(i.amount)}</td>
                <td className="r">{i.paid ? <span className="badge status-completed">{t('Paid')}</span> : <span className="badge">{t('Not paid')}</span>}</td>
              </tr>
            ))}</tbody>
          </table></div>
        </div>
      )}

      {c.history.length > 0 && <History c={c} reload={() => {}} />}
      {pdf && <SessionsPdf c={c} pdfUrl={`/api/parent/children/${c.id}/sessions.pdf`} onClose={() => setPdf(false)} />}
    </div>
  );
}

function SessionList({ title, empty, list, where, showStatus }) {
  const [all, setAll] = useState(false);
  const shown = all ? list : list.slice(0, 10);
  return (
    <div className="card">
      <div className="card-pad card-head" style={{ marginBottom: 0 }}><div><h2>{title}</h2></div></div>
      {list.length ? (
        <div className="table-wrap"><table>
          <tbody>{shown.map((s) => (
            <tr key={s.id}>
              <td style={{ whiteSpace: 'nowrap' }}><strong>{date(s.date)}</strong><div className="row-sub">{timeLabel(s)}</div></td>
              <td>
                {s.color && <span className="dot" style={{ background: s.color, marginRight: 6, display: 'inline-block', width: 8, height: 8, borderRadius: 4 }} />}
                {s.service || '—'}
                <div className="row-sub">{[s.therapist, where(s)].filter(Boolean).join(' · ')}</div>
              </td>
              {showStatus && <td className="r"><SessionStatus status={s.status} /></td>}
            </tr>
          ))}</tbody>
        </table></div>
      ) : <p className="muted card-pad" style={{ margin: 0 }}>{empty}</p>}
      {list.length > 10 && (
        <div className="card-pad" style={{ paddingTop: 8 }}>
          <button className="link-btn" onClick={() => setAll(!all)}>{all ? t('Show fewer') : t('Show all {n}', { n: list.length })}</button>
        </div>
      )}
    </div>
  );
}
