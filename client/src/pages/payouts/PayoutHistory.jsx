import { useApi } from '../../hooks.js';
import { date, money, money0, monthName } from '../../format.js';
import { t } from '../../i18n/index.js';

/** Every payment recorded (founders' bonuses and organisers' shares), newest first. Paid money leaves the budget. */
export function PayoutHistory({ version, onOpen }) {
  const { data: h } = useApi(`/payouts/history?v=${version}`);
  if (!h) return null;
  return (
    <div className="card">
      <div className="card-pad card-head" style={{ marginBottom: 0 }}>
        <div><h2>{t('Payouts history')}</h2>
          <p>{t('Everything paid to founders and organisers, which is taken out of the budget')} · {t('{amount} paid in total', { amount: money(h.paid) })}{h.toFund >= 0.01 ? ` · ${t('{amount} left to the community fund', { amount: money(h.toFund) })}` : ''}{h.awarded >= 0.01 ? ` · ${t('{amount} in awards', { amount: money(h.awarded) })}` : ''}</p></div>
      </div>
      <div className="table-wrap">
        {h.payments.length ? (
          <table>
            <thead><tr><th>{t('Paid on')}</th><th>{t('For')}</th><th className="hide-sm">{t('Who')}</th><th className="r">{t('Total')}</th></tr></thead>
            <tbody>
              {h.payments.map((g) => (
                <tr key={g.key}>
                  <td>{date(g.paidAt)}</td>
                  <td>
                    <button className="link-btn" onClick={() => onOpen(g.month)}>{monthName(g.month)}</button>
                    {g.toFund && <span className="badge" style={{ marginLeft: 6 }}>{t('to community fund')}</span>}
                    {g.award && <span className="badge" style={{ marginLeft: 6 }}>{g.award.kind === 'money' ? t('award') : t('benefit')}: {g.award.description}</span>}
                    <div className="row-sub show-sm">{g.people.map((p) => `${p.name} ${money0(p.amount)}`).join(' · ')}</div>
                  </td>
                  <td className="secondary hide-sm cell-wrap">{g.people.map((p) => `${p.name} ${money(p.amount)}`).join(' · ')}</td>
                  <td className="r"><strong>{money(g.total)}</strong></td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <div className="empty">{t('No payouts recorded yet. Use “Mark paid” on a person’s row once they’re paid.')}</div>}
      </div>
    </div>
  );
}
