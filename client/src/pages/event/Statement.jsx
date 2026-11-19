import { useChartColors } from '../../hooks.js';
import { money, money0, pctLabel, signedMoney2 } from '../../format.js';
import { t, tn } from '../../i18n/index.js';

/** The per-event statement the founders asked for: income, costs, profit and how it is split. */
export default function Statement({ e, split }) {
  const c = useChartColors();
  const s = e.split;
  const parts = [
    { key: 'founders', label: t('Founders'), color: c.founders, value: s.founders },
    ...(e.is_sport ? [{ key: 'sport', label: t('{sport} fund', { sport: e.type_name }), color: c.sportfund, value: s.sport }] : []),
    { key: 'general', label: t('General fund'), color: c.general, value: s.general },
  ];
  const community = 100 - split.foundersStandard - split.foundersPoints;
  return (
    <div className="card card-pad">
      <div className="card-head">
        <div><h2>{t('Event statement')}</h2><p>{t(e.status === 'completed' ? 'Finalized — included in the funds' : 'Live — added to the funds when finalized')}</p></div>
      </div>
      <dl className="statement">
        <dt>{t('Income from fees')} <span className="muted">{e.price_parts && e.venue_mode === 'fixed'
          ? t('venue {venue} + {n} × {fee} community', { venue: money(e.counted_participants === e.participants ? e.venue_total : Math.round(e.venue_total * e.counted_participants / e.participants * 100) / 100), n: e.counted_participants, fee: money(e.community_fee) })
          : `${e.counted_participants} × ${money(e.participation_fee)}`}{e.free_skip_count > 0 ? ` · ${t('{n} free not counted', { n: e.free_skip_count })}` : ''}</span></dt><dd>{money(e.fee_gross)}</dd>
        {e.member_discounts > 0 && <><dt>{t('Member prices')} <span className="muted">{t('{n} paid only the venue’s {amount}', { n: e.member_count, amount: money(e.venue_fee) })}</span></dt><dd className="neg">−{money(e.member_discounts)}</dd></>}
        {e.covered_waived > 0 && <><dt>{t('Community part let off')} <span className="muted">{t('{n} free, we pay only the venue’s part', { n: e.covered_count })}</span></dt><dd className="neg">−{money(e.covered_waived)}</dd></>}
        {e.other_income > 0 && <><dt>{t('Other income')} <span className="muted">{t('sponsors, etc.')}</span></dt><dd>{money(e.other_income)}</dd></>}
        <dt>{t('Organizing costs')} <span className="muted">{e.venue_cost > 0 ? `${e.venue_mode === 'fixed' ? t('venue {amount} fixed', { amount: money(e.venue_cost) }) : t('venue {n} × {fee}', { n: e.counted_participants, fee: money(e.venue_fee) })}${e.organizing > e.venue_cost ? ` + ${t('other costs')}` : ''}` : t('venues, trainers…')}</span></dt><dd className={e.organizing ? 'neg' : ''}>{e.organizing ? '−' : ''}{money(e.organizing)}</dd>
        <dt>{t('Benefits offered')} <span className="muted">{e.stock_cost > 0 ? t('incl. {amount} stock used', { amount: money(e.stock_cost) }) : t('water, fruit, balls…')}</span></dt><dd className={e.benefits ? 'neg' : ''}>{e.benefits ? '−' : ''}{money(e.benefits)}</dd>
        <dt className="total">{t('Total profit')}</dt><dd className={`total ${e.profit < 0 ? 'neg' : ''}`}>{signedMoney2(e.profit)}</dd>
      </dl>
      {e.fund_paid > 0 && (
        <p className="hint" style={{ margin: '10px 0 0' }}>
          {t(e.status === 'completed' ? 'Paid by the general community fund, not this event:' : 'Paid by the general community fund when finalized, not this event:')} <b>{money(e.fund_paid)}</b>
          {' '}({[e.discounts > 0 && tn(e.discount_count, '{amount} discounts for {n} person', '{amount} discounts for {n} people', { amount: money(e.discounts) }),
            e.covered_fees > 0 && tn(e.covered_count, '{amount} venue part of {n} free person', '{amount} venue part of {n} free people', { amount: money(e.covered_fees) })].filter(Boolean).join(' · ')}).
          {' '}{t('The fees above count that as paid.')}
        </p>
      )}
      <div className="split-bar" style={{ margin: '18px 0 14px' }} role="img" aria-label={t('Profit split')}>
        {e.profit > 0 && parts.map((p) => <div key={p.key} style={{ width: `${(p.value / e.profit) * 100}%`, background: p.color }} />)}
      </div>
      <dl className="statement">
        <dt><i className="swatch" style={{ background: c.founders }} />{t('Founders & organisers')} {pctLabel(split.foundersStandard + split.foundersPoints)}
          <span className="muted">{t('{founders} founders · {organisers} organisers by points', { founders: money0(s.standard), organisers: money0(s.points) })}{s.freeTasks ? ` · ${t('{amount} of tasks done for free or with nobody on them moved to the {fund}', { amount: money0(s.freeTasks), fund: s.freeTo === 'sport' ? t('{sport} fund', { sport: e.type_name }) : t('general fund') })}` : ''}</span></dt>
        <dd>{money(s.founders)}</dd>
        <dt><i className="swatch" style={{ background: c.general }} />{t('General community fund')} <span className="muted">{e.is_sport ? t('{share} of the {pct}', { share: pctLabel(split.generalShare), pct: pctLabel(community) }) : t('all of the {pct} — {sport} isn’t a sport, so no sport fund', { pct: pctLabel(community), sport: e.type_name })}</span></dt>
        <dd>{money(s.general)}</dd>
        {!!e.is_sport && <><dt><i className="swatch" style={{ background: c.sportfund }} />{t('{sport} reinvestment fund', { sport: e.type_name })} <span className="muted">{t('{share} of the {pct}', { share: pctLabel(100 - split.generalShare), pct: pctLabel(community) })}</span></dt>
        <dd>{money(s.sport)}</dd></>}
      </dl>
    </div>
  );
}
