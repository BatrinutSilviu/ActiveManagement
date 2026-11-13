import { useChartColors } from '../../hooks.js';
import { money, money0, pctLabel, signedMoney2 } from '../../format.js';

/** The per-event statement the founders asked for: income, costs, profit and how it is split. */
export default function Statement({ e, split }) {
  const c = useChartColors();
  const s = e.split;
  const parts = [
    { key: 'founders', label: 'Founders', color: c.founders, value: s.founders },
    ...(e.is_sport ? [{ key: 'sport', label: `${e.type_name} fund`, color: c.sportfund, value: s.sport }] : []),
    { key: 'general', label: 'General fund', color: c.general, value: s.general },
  ];
  const community = 100 - split.foundersStandard - split.foundersPoints;
  return (
    <div className="card card-pad">
      <div className="card-head">
        <div><h2>Event statement</h2><p>{e.status === 'completed' ? 'Finalized — included in the funds' : 'Live — added to the funds when finalized'}</p></div>
      </div>
      <dl className="statement">
        <dt>Income from fees <span className="muted">{e.price_parts && e.venue_mode === 'fixed'
          ? `venue ${money(e.counted_participants === e.participants ? e.venue_total : Math.round(e.venue_total * e.counted_participants / e.participants * 100) / 100)} + ${e.counted_participants} × ${money(e.community_fee)} community`
          : `${e.counted_participants} × ${money(e.participation_fee)}`}{e.free_skip_count > 0 ? ` · ${e.free_skip_count} free not counted` : ''}</span></dt><dd>{money(e.fee_gross)}</dd>
        {e.member_discounts > 0 && <><dt>Member prices <span className="muted">{e.member_count} paid only the venue’s {money(e.venue_fee)}</span></dt><dd className="neg">−{money(e.member_discounts)}</dd></>}
        {e.other_income > 0 && <><dt>Other income <span className="muted">sponsors, etc.</span></dt><dd>{money(e.other_income)}</dd></>}
        <dt>Organizing costs <span className="muted">{e.venue_cost > 0 ? `venue ${e.venue_mode === 'fixed' ? `${money(e.venue_cost)} fixed` : `${e.counted_participants} × ${money(e.venue_fee)}`}${e.organizing > e.venue_cost ? ' + other costs' : ''}` : 'venues, trainers…'}</span></dt><dd className={e.organizing ? 'neg' : ''}>{e.organizing ? '−' : ''}{money(e.organizing)}</dd>
        <dt>Benefits offered <span className="muted">{e.stock_cost > 0 ? `incl. ${money(e.stock_cost)} stock used` : 'water, fruit, balls…'}</span></dt><dd className={e.benefits ? 'neg' : ''}>{e.benefits ? '−' : ''}{money(e.benefits)}</dd>
        <dt className="total">Total profit</dt><dd className={`total ${e.profit < 0 ? 'neg' : ''}`}>{signedMoney2(e.profit)}</dd>
      </dl>
      {e.fund_paid > 0 && (
        <p className="hint" style={{ margin: '10px 0 0' }}>
          Paid by the general community fund{e.status === 'completed' ? '' : ' when finalized'}, not this event: <b>{money(e.fund_paid)}</b>
          {' '}({[e.discounts > 0 && `${money(e.discounts)} discounts for ${e.discount_count} ${e.discount_count === 1 ? 'person' : 'people'}`,
            e.covered_fees > 0 && `${money(e.covered_fees)} fees of ${e.covered_count} free ${e.covered_count === 1 ? 'person' : 'people'}`].filter(Boolean).join(' · ')}).
          The fees above count them as paid in full.
        </p>
      )}
      <div className="split-bar" style={{ margin: '18px 0 14px' }} role="img" aria-label="Profit split">
        {e.profit > 0 && parts.map((p) => <div key={p.key} style={{ width: `${(p.value / e.profit) * 100}%`, background: p.color }} />)}
      </div>
      <dl className="statement">
        <dt><i className="swatch" style={{ background: c.founders }} />Founders & organisers {pctLabel(split.foundersStandard + split.foundersPoints)}
          <span className="muted">{money0(s.standard)} founders · {money0(s.points)} organisers by points{s.freeTasks ? ` · ${money0(s.freeTasks)} of tasks done for free or with nobody on them moved to the ${s.freeTo === 'sport' ? `${e.type_name} fund` : 'general fund'}` : ''}</span></dt>
        <dd>{money(s.founders)}</dd>
        <dt><i className="swatch" style={{ background: c.general }} />General community fund <span className="muted">{e.is_sport ? `${pctLabel(split.generalShare)} of the ${pctLabel(community)}` : `all of the ${pctLabel(community)} — ${e.type_name} isn’t a sport, so no sport fund`}</span></dt>
        <dd>{money(s.general)}</dd>
        {!!e.is_sport && <><dt><i className="swatch" style={{ background: c.sportfund }} />{e.type_name} reinvestment fund <span className="muted">{pctLabel(100 - split.generalShare)} of the {pctLabel(community)}</span></dt>
        <dd>{money(s.sport)}</dd></>}
      </dl>
    </div>
  );
}
