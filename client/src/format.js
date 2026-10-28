const ron = new Intl.NumberFormat('ro-RO', { style: 'currency', currency: 'RON', maximumFractionDigits: 2 });
const ron0 = new Intl.NumberFormat('ro-RO', { style: 'currency', currency: 'RON', maximumFractionDigits: 0 });
const num = new Intl.NumberFormat('ro-RO', { maximumFractionDigits: 1 });

export const money = (v) => (v == null ? '—' : ron.format(v));
export const money0 = (v) => (v == null ? '—' : ron0.format(v));
export const signedMoney = (v) => (v == null ? '—' : (v > 0 ? '+' : '') + ron0.format(v));
export const number = (v) => (v == null ? '—' : num.format(v));
export const pct = (v) => (v == null ? '—' : `${num.format(v * 100)}%`);

// Short axis ticks: 12.500 -> "12,5k"
export const compact = (v) => {
  const a = Math.abs(v);
  if (a >= 1e6) return `${num.format(v / 1e6)}M`;
  if (a >= 1e3) return `${num.format(v / 1e3)}k`;
  return num.format(v);
};

export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September',
  'October', 'November', 'December'];

export const date = (s) => (s ? new Date(`${s}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
export const today = () => new Date().toISOString().slice(0, 10);

// Change vs. a previous value, as a fraction; null when there's nothing to compare against.
export const change = (cur, prev) => (prev ? (cur - prev) / Math.abs(prev) : null);
