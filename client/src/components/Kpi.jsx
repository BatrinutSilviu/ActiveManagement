import { pct } from '../format.js';

// A stat tile. `delta` is a fraction vs the previous period; `goodWhenUp` decides its colour.
// `icon` + `tone` (income | expense | profit) add an icon chip; `hero` makes it the accent tile.
export default function Kpi({ label, value, sub, delta, goodWhenUp = true, keyColor, icon: Icon, tone, hero }) {
  let deltaEl = null;
  if (delta != null && Number.isFinite(delta)) {
    const good = delta === 0 ? null : (delta > 0) === goodWhenUp;
    deltaEl = (
      <span className={`delta ${good == null ? '' : good ? 'pos' : 'neg'}`}>
        {delta > 0 ? '↑' : delta < 0 ? '↓' : '•'} {pct(Math.abs(delta))}
      </span>
    );
  }
  return (
    <div className={`card kpi ${hero ? 'hero' : ''}`}>
      <div className="kpi-top">
        <div className="kpi-label">
          {keyColor && <i className="kpi-key" style={{ background: keyColor }} />}
          {label}
        </div>
        {Icon && <span className={`kpi-icon ${tone ? `tone-${tone}` : ''}`}><Icon /></span>}
      </div>
      <div className="kpi-value">{value}</div>
      {(sub || deltaEl) && (
        <div className="kpi-sub">
          {deltaEl}{deltaEl && sub ? ' ' : ''}{sub}
        </div>
      )}
    </div>
  );
}
