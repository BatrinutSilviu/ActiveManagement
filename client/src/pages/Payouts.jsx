import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useApi, useChartColors, usePermissions } from '../hooks.js';
import { date, money, money0, monthName, number, pctLabel, signedMoney } from '../format.js';
import { confirmDelete } from '../components/Modal.jsx';
import { IconEdit, IconPlus, IconTrash } from '../components/Icons.jsx';
import { TASK_LABELS } from '../points.js';
import { t, tn } from '../i18n/index.js';
import { Targets } from './payouts/Targets.jsx';
import { ContributionForm } from './payouts/ContributionForm.jsx';
import { PayForm } from './payouts/PayForm.jsx';
import { AwardForm } from './payouts/AwardForm.jsx';
import { PointsReview } from './payouts/PointsReview.jsx';
import { PayoutHistory } from './payouts/PayoutHistory.jsx';

const shiftMonth = (ym, d) => {
  const [y, m] = ym.split('-').map(Number);
  const dt = new Date(y, m - 1 + d, 1);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
};

export default function Payouts() {
  const c = useChartColors();
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const { data: r, loading, reload: reloadMonth } = useApi(`/payouts?month=${month}`);
  const [version, setVersion] = useState(0);
  const reload = () => { reloadMonth(); setVersion((v) => v + 1); };
  const [form, setForm] = useState(null);
  const [paying, setPaying] = useState(null); // the person being marked as paid
  const [awarding, setAwarding] = useState(false);
  const { canEdit } = usePermissions();
  if (!r) return null;

  const s = r.split;
  const communityPct = 100 - s.foundersStandard - s.foundersPoints;
  const parts = [
    { key: 'community', label: t('Community {pct}', { pct: pctLabel(communityPct) }), value: r.pools.community, color: c.sportfund },
    { key: 'standard', label: t('Founders {pct}', { pct: pctLabel(s.foundersStandard) }), value: r.pools.standard, color: c.founders },
    { key: 'points', label: t('Organisers {pct}', { pct: pctLabel(s.foundersPoints) }), value: r.pools.points, color: c.general },
  ];
  const pay = r.payout;
  const paidAny = !!pay.paidAt;
  const owing = Math.abs(pay.owed) >= 0.01;
  const restToFund = async () => {
    const owed = r.people.filter((p) => p.owed >= 0.01);
    if (!window.confirm(t('Give the rest to the general community fund instead of paying it?\n\n{list}\n\n{amount} goes to the general fund and {month} counts as settled.', {
      list: owed.map((p) => `${p.name}: ${money(p.owed)}`).join('\n'), amount: money(owed.reduce((a, p) => a + p.owed, 0)), month: monthName(month),
    }))) return;
    await api.post(`/payouts/${month}/to-fund`);
    reload();
  };
  const undoPaid = async (p) => {
    if (!window.confirm(t('Undo the payments recorded to {name} for {month}? They’ll show as unpaid again (awards stay).', { name: p.name, month: monthName(month) }))) return;
    await api.del(`/payouts/${month}?person=${p.id}`);
    reload();
  };
  const delAward = async (a) => {
    if (!confirmDelete(t('the award “{award}” to {name}', { award: a.description, name: a.person_name }))) return;
    await api.del(`/payouts/awards/${a.id}`);
    reload();
  };
  // A column for what was paid / awarded once anything was, for anyone this month.
  const showPaid = paidAny || pay.awarded >= 0.01;
  const delContribution = async (l) => {
    if (!confirmDelete(t('{n} points for {name}', { n: l.points, name: l.person_name }))) return;
    await api.del(`/contributions/${l.id}`);
    reload();
  };

  return (
    <div className={loading ? 'loading' : ''}>
      <div className="page-head">
        <div>
          <h1>{t('Payouts')}</h1>
          <p>{t('This month’s profit, how it’s divided, and what each founder and organiser gets.')}</p>
        </div>
        <div className="month-nav">
          <button className="btn btn-sm" onClick={() => setMonth(shiftMonth(month, -1))} aria-label={t('Previous month')}>‹</button>
          <input type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} aria-label={t('Month')} />
          <button className="btn btn-sm" onClick={() => setMonth(shiftMonth(month, 1))} aria-label={t('Next month')}>›</button>
        </div>
      </div>

      <div className="stack">
        {r.unpaidMonths.some((m) => m.month !== month) && (
          <div className="unpaid-months">
            <span className="muted">{t('Not paid yet:')}</span>
            {r.unpaidMonths.filter((m) => m.month !== month).map((m) => (
              <button key={m.month} className="btn btn-sm" onClick={() => setMonth(m.month)}>
                {monthName(m.month)} · {m.paid ? t('{amount} difference', { amount: signedMoney(m.owed) }) : money0(m.owed)}
              </button>
            ))}
          </div>
        )}
        <div className="grid grid-3-1" style={{ alignItems: 'start' }}>
          <div className="stack">
            <div className="card card-pad">
              <div className="card-head">
                <div><h2>{t('Profit')} · {monthName(month)}</h2><p>{tn(r.events.length, '{n} finalized event', '{n} finalized events')}{r.liveEvents ? ` · ${t('{n} still live (not counted yet)', { n: r.liveEvents })}` : ''}</p></div>
              </div>
              <div className="profit-hero">
                <strong className={r.profit < 0 ? 'neg' : ''}>{signedMoney(r.profit)}</strong>
                {r.liveEvents > 0 && <span className="muted">{t('+ {amount} expected from live events', { amount: signedMoney(r.pending.founders + r.pending.community) })}</span>}
              </div>
              <div className="split-bar" style={{ height: 14 }} role="img" aria-label={t('Profit split')}>
                {r.profit > 0 && parts.map((p) => <div key={p.key} style={{ width: `${(p.value / r.profit) * 100}%`, background: p.color }} />)}
              </div>
              <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', marginTop: 18 }}>
                <div className="mini-stat">
                  <span className="mini-label"><i style={{ background: c.sportfund }} />{t('Reinvest in community')} {pctLabel(communityPct)}</span>
                  <strong>{money0(r.pools.community)}</strong>
                  <span className="muted">{t('{general} general · {sport} sport funds', { general: money0(r.pools.general), sport: money0(r.pools.sport) })}</span>
                </div>
                <div className="mini-stat">
                  <span className="mini-label"><i style={{ background: c.founders }} />{t('Founders')} {pctLabel(s.foundersStandard)}</span>
                  <strong>{money0(r.pools.standard)}</strong>
                  <span className="muted">{r.founders ? `${t('{amount} each', { amount: money(r.pools.standard / r.founders) })} · ${tn(r.founders, '{n} founder', '{n} founders')}` : t('no founders set')}</span>
                </div>
                <div className="mini-stat">
                  <span className="mini-label"><i style={{ background: c.general }} />{t('Organisers')} {pctLabel(s.foundersPoints)}</span>
                  <strong>{money0(r.pools.points)}</strong>
                  <span className="muted">{r.totalPoints ? t('{points} points · {amount} per point', { points: number(r.totalPoints), amount: money(r.pools.points / r.totalPoints) }) : t('no points this month')}</span>
                  {r.pools.freeTasks !== 0 && <span className="muted">{t('{amount} of it to the funds', { amount: money0(r.pools.freeTasks) })} ({[r.freePoints ? t('{n} pts done for free', { n: number(r.freePoints) }) : '', r.nobodyPoints ? t('{n} pts of tasks nobody did', { n: number(r.nobodyPoints) }) : ''].filter(Boolean).join(', ')})</span>}
                </div>
              </div>
            </div>

            <div className="card">
              <div className="card-pad card-head" style={{ marginBottom: 0 }}>
                <div><h2>{t('To pay')} · {monthName(month)}</h2><p>{t('Founders’ equal share + organisers’ share by points, less awards · mark each person paid on their row')}</p></div>
                <div className="payout-status">
                  <strong>{money(pay.due)}</strong>
                  {pay.owed < 0.01 && paidAny && <span className="badge status-completed">{t('All paid')}</span>}
                  {canEdit && pay.owed >= 0.01 && (
                    <button className="btn btn-sm" onClick={restToFund} title={t('Not paid to the founders / organisers: it goes to the general community fund')}>
                      {paidAny ? t('Rest to community fund') : t('All to community fund')}</button>
                  )}
                </div>
              </div>
              {paidAny && owing && (
                <p className="hint" style={{ padding: '0 22px 12px', margin: 0 }}>
                  {t('{paid} was paid{awards} against {due} calculated, so {rest}.', {
                    paid: money(pay.paid), due: money(pay.due),
                    awards: pay.awarded >= 0.01 ? ` ${t('and {amount} given as awards', { amount: money(pay.awarded) })}` : '',
                    rest: pay.owed > 0 ? t('{amount} more is owed', { amount: money(pay.owed) }) : t('{amount} more was paid than calculated', { amount: money(-pay.owed) }),
                  })}
                </p>
              )}
              {pay.toFund >= 0.01 && (
                <p className="hint" style={{ padding: '0 22px 12px', margin: 0 }}>{t('{amount} of it went to the general community fund instead of being paid out.', { amount: money(pay.toFund) })}</p>
              )}
              <div className="table-wrap">
                {r.people.length ? (
                  <table>
                    <thead><tr><th>{t('Person')}</th><th className="r hide-sm">{t('Founder share')}</th><th className="r hide-sm">{t('Points')}</th><th className="r hide-sm">{t('Organiser share')}</th><th className="r">{t('Total')}</th>{showPaid && <th className="r">{t('Paid')}</th>}{canEdit && <th />}</tr></thead>
                    <tbody>
                      {r.people.map((p) => (
                        <tr key={p.id}>
                          <td>
                            <strong>{p.name}</strong>{p.founder && <span className="badge hide-sm" style={{ marginLeft: 6 }}>{t('Founder')}</span>}
                            <div className="row-sub show-sm">{t('{founder} founder · {organiser} organiser ({points}p)', { founder: money0(p.standard), organiser: money0(p.pointsAmount), points: number(p.points) })}
                              {p.freePoints > 0 ? ` · ${t('{n}p free', { n: number(p.freePoints) })}` : ''}{p.pendingPoints > 0 ? ` · ${t('{n}p live', { n: number(p.pendingPoints) })}` : ''}</div>
                          </td>
                          <td className="r hide-sm">{money(p.standard)}</td>
                          <td className="r hide-sm">
                            {number(p.points)}
                            {r.totalPoints > 0 && <span className="muted"> · {Math.round((p.points / r.totalPoints) * 100)}%</span>}
                            {p.awardPoints > 0 && <div className="row-sub">{t('− {n} for awards = {net}', { n: number(p.awardPoints), net: number(p.netPoints) })}</div>}
                            {p.freePoints > 0 && <div className="row-sub">{t('+ {n} done for free', { n: number(p.freePoints) })}</div>}
                            {p.pendingPoints > 0 && <div className="row-sub">{t('+ {n} from live events', { n: number(p.pendingPoints) })}</div>}
                          </td>
                          <td className="r hide-sm">{money(p.pointsAmount)}</td>
                          <td className="r"><strong>{money(p.total)}</strong>
                            {p.awarded >= 0.01 && <div className="row-sub">{t('− {amount} awards', { amount: money(p.awarded) })}</div>}</td>
                          {showPaid && (
                            <td className="r">
                              {money(p.paid)}
                              {p.paidAt && <div className="row-sub">{date(p.paidAt)}</div>}
                              {p.toFund >= 0.01 && <div className="row-sub">{t('incl. {amount} to the fund', { amount: money(p.toFund) })}</div>}
                              {Math.abs(p.owed) >= 0.01 && <div className={`row-sub ${p.owed < 0 ? 'neg' : ''}`}>{signedMoney(p.owed)} {p.owed > 0 ? t('owed') : t('overpaid')}</div>}
                            </td>
                          )}
                          {canEdit && (
                            <td className="r actions" style={{ whiteSpace: 'nowrap' }}>
                              {p.owed >= 0.01 && (
                                <button className="btn btn-sm btn-primary" onClick={() => setPaying(p)}>
                                  {Math.abs(p.paid) >= 0.01 ? t('Pay rest') : t('Mark paid')}</button>
                              )}
                              {Math.abs(p.paid) >= 0.01 && <button className="btn btn-sm" style={{ marginLeft: 6 }} onClick={() => undoPaid(p)}>{t('Undo')}</button>}
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : <div className="empty">{t('Mark founders in Settings → People.')}</div>}
              </div>
              {r.unassignedPoints > 0 && (
                <p className="hint" style={{ padding: '0 22px 16px', margin: 0 }}>{t('Nobody earned points this month, so the organisers’ {amount} isn’t assigned to anyone.', { amount: money0(r.unassignedPoints) })}</p>
              )}
            </div>
          </div>
          <Targets month={month} split={s} onSaved={reload} />
        </div>

        <div className="card">
          <div className="card-pad card-head" style={{ marginBottom: 0 }}>
            <div><h2>{t('Awards')} · {monthName(month)}</h2>
              <p>{t('Money or benefits given to an organiser: the value comes off their payout and their points')}{r.perPoint > 0 ? ` (${t('{amount} a point', { amount: money(r.perPoint) })})` : ''}</p></div>
            {canEdit && r.people.length > 0 && <button className="btn btn-sm" onClick={() => setAwarding(true)}><IconPlus width="14" />{t('Give award')}</button>}
          </div>
          <div className="table-wrap">
            {r.awards.length ? (
              <table>
                <thead><tr><th className="hide-sm">{t('Date')}</th><th>{t('Person')}</th><th>{t('Award')}</th><th className="r hide-sm">{t('Points')}</th><th className="r">{t('Worth')}</th>{canEdit && <th />}</tr></thead>
                <tbody>
                  {r.awards.map((a) => (
                    <tr key={a.id}>
                      <td className="hide-sm">{date(a.date)}</td>
                      <td>{a.person_name}</td>
                      <td className="cell-wrap">{a.description}<span className="badge" style={{ marginLeft: 6 }}>{a.kind === 'money' ? t('money') : t('benefit')}</span>
                        <div className="row-sub show-sm">{date(a.date)}{a.points != null ? ` · ${t('−{n} pts', { n: number(a.points) })}` : ''}</div></td>
                      <td className="r secondary hide-sm">{a.points != null ? `−${number(a.points)}` : '—'}</td>
                      <td className="r"><strong>{money(a.amount)}</strong></td>
                      {canEdit && <td className="r actions"><button className="icon-btn" aria-label={t('Delete')} onClick={() => delAward(a)}><IconTrash /></button></td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <div className="empty">{t('No awards this month.')}</div>}
          </div>
        </div>

        <PointsReview key={month} month={month} onChanged={reload} />

        <div className="card">
          <div className="card-pad card-head" style={{ marginBottom: 0 }}>
            <div><h2>{t('Points earned')} · {monthName(month)}</h2>
              <p>{t('From finalized events’ tasks, stock purchases and contributions outside events')}{r.pendingPoints ? ` · ${t('{n} more points on live events', { n: number(r.pendingPoints) })}` : ''}</p></div>
            {canEdit && <button className="btn btn-sm" onClick={() => setForm({})}><IconPlus width="14" />{t('Add points')}</button>}
          </div>
          <div className="table-wrap">
            {r.ledger.length ? (
              <table>
                <thead><tr><th className="hide-sm">{t('Date')}</th><th>{t('Person')}</th><th>{t('For')}</th><th className="hide-sm">{t('Activity')}</th><th className="hide-sm">{t('Task')}</th><th className="r">{t('Points')}</th>{canEdit && <th />}</tr></thead>
                <tbody>
                  {r.ledger.map((l) => (
                    <tr key={`${l.source}-${l.id}`}>
                      <td className="hide-sm">{date(l.date)}</td>
                      <td>{l.person_name}{l.free ? <span className="badge status-completed" style={{ marginLeft: 6 }}>{t('free')}</span> : null}</td>
                      <td className="cell-wrap">
                        {l.event_id ? <Link to={`/events/${l.event_id}`}>{l.title}</Link> : l.title}
                        <div className="row-sub show-sm">{date(l.date)}{l.activity_name ? ` · ${l.activity_name}` : ''}</div>
                      </td>
                      <td className="secondary hide-sm">{l.activity_name || '—'}</td>
                      <td className="secondary hide-sm">{l.task ? `${TASK_LABELS[l.task]}${l.sharing > 1 ? ` (${t('shared by {n}', { n: l.sharing })})` : ''}` : l.source === 'purchase' ? (l.kind === 'merch' ? t('Bought partnership merchandise') : t('Bought items / prizes')) : l.source === 'sale' ? t('Sold stock (profit)') : t('Contribution')}</td>
                      <td className="r"><strong>{number(l.points)}</strong></td>
                      {canEdit && (
                        <td className="r actions">
                          {l.source === 'contribution' && (
                            <>
                              <button className="icon-btn" aria-label={t('Edit')} onClick={() => setForm({ item: l })}><IconEdit /></button>
                              <button className="icon-btn" aria-label={t('Delete')} onClick={() => delContribution(l)}><IconTrash /></button>
                            </>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <div className="empty">{t('No points yet this month. Add who did each task on the events, or add points for other work.')}</div>}
          </div>
        </div>

        <PayoutHistory version={version} onOpen={(m) => { setMonth(m); window.scrollTo({ top: 0, behavior: 'smooth' }); }} />
      </div>

      {paying && <PayForm month={month} person={paying} onClose={() => setPaying(null)} onSaved={() => { setPaying(null); reload(); }} />}
      {awarding && <AwardForm month={month} r={r} onClose={() => setAwarding(false)} onSaved={() => { setAwarding(false); reload(); }} />}
      {form && <ContributionForm month={month} item={form.item} onClose={() => setForm(null)} onSaved={() => { setForm(null); reload(); }} />}
    </div>
  );
}
