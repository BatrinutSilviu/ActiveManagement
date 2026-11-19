import { useApi } from '../../hooks.js';
import { date, money, money0, monthName } from '../../format.js';

/** Every payment recorded (founders' bonuses and organisers' shares), newest first. Paid money leaves the budget. */
export function PayoutHistory({ version, onOpen }) {
  const { data: h } = useApi(`/payouts/history?v=${version}`);
  if (!h) return null;
  return (
    <div className="card">
      <div className="card-pad card-head" style={{ marginBottom: 0 }}>
        <div><h2>Payouts history</h2>
          <p>Everything paid to founders and organisers, which is taken out of the budget · {money(h.paid)} paid in total{h.toFund >= 0.01 ? ` · ${money(h.toFund)} left to the community fund` : ''}{h.awarded >= 0.01 ? ` · ${money(h.awarded)} in awards` : ''}</p></div>
      </div>
      <div className="table-wrap">
        {h.payments.length ? (
          <table>
            <thead><tr><th>Paid on</th><th>For</th><th className="hide-sm">Who</th><th className="r">Total</th></tr></thead>
            <tbody>
              {h.payments.map((g) => (
                <tr key={g.key}>
                  <td>{date(g.paidAt)}</td>
                  <td>
                    <button className="link-btn" onClick={() => onOpen(g.month)}>{monthName(g.month)}</button>
                    {g.toFund && <span className="badge" style={{ marginLeft: 6 }}>to community fund</span>}
                    {g.award && <span className="badge" style={{ marginLeft: 6 }}>{g.award.kind === 'money' ? 'award' : 'benefit'}: {g.award.description}</span>}
                    <div className="row-sub show-sm">{g.people.map((p) => `${p.name} ${money0(p.amount)}`).join(' · ')}</div>
                  </td>
                  <td className="secondary hide-sm cell-wrap">{g.people.map((p) => `${p.name} ${money(p.amount)}`).join(' · ')}</td>
                  <td className="r"><strong>{money(g.total)}</strong></td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <div className="empty">No payouts recorded yet. Use “Mark as paid” on a month once it’s paid.</div>}
      </div>
    </div>
  );
}
