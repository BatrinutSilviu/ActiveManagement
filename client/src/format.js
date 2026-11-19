import { dateLocale, onLanguage } from './i18n/index.js';
// Money and numbers in the business's currency and number format (Settings → Business), set once it's loaded.
/** The currency code, for labels like "Amount (RON)". */
export let CURRENCY = 'RON';
let ron, ron0, num;
export function setMoneyFormat(currency = 'RON', locale = 'ro-RO') {
  CURRENCY = currency;
  ron = new Intl.NumberFormat(locale, { style: 'currency', currency, maximumFractionDigits: 2 });
  ron0 = new Intl.NumberFormat(locale, { style: 'currency', currency, maximumFractionDigits: 0 });
  num = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
}
setMoneyFormat();

export const money = (v) => (v == null ? '—' : ron.format(v));
export const money0 = (v) => (v == null ? '—' : ron0.format(v));
export const signedMoney = (v) => (v == null ? '—' : (v > 0 ? '+' : '') + ron0.format(v));
// Same with bani (2 decimals), for exact totals.
export const signedMoney2 = (v) => (v == null ? '—' : (v > 0 ? '+' : '') + ron.format(v));
export const number = (v) => (v == null ? '—' : num.format(v));
export const pct = (v) => (v == null ? '—' : `${num.format(v * 100)}%`);

// Short axis ticks: 12.500 -> "12,5k"
export const compact = (v) => {
  const a = Math.abs(v);
  if (a >= 1e6) return `${num.format(v / 1e6)}M`;
  if (a >= 1e3) return `${num.format(v / 1e3)}k`;
  return num.format(v);
};

// Month names in the app's language (live bindings: they change when the language does).
const monthNames = (month) => Array.from({ length: 12 }, (_, i) => {
  const s = new Date(2000, i, 1).toLocaleDateString(dateLocale(), { month });
  return (s[0].toUpperCase() + s.slice(1)).replace(/\.$/, '');
});
export let MONTHS = monthNames('short');
export let MONTHS_LONG = monthNames('long');
onLanguage(() => { MONTHS = monthNames('short'); MONTHS_LONG = monthNames('long'); });

export const pctLabel = (v) => `${Math.round(v * 10) / 10}%`;
export const monthName = (ym) => `${MONTHS_LONG[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`;
/** A saved or given discount: "−20%" or "−10,00 RON". */
export const discountLabel = (d) => (d.kind === 'percent' ? `−${number(d.value)}%` : `−${money(d.value)}`);

export const date = (s) => (s ? new Date(`${s}T00:00:00`).toLocaleDateString(dateLocale(), { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
export const today = () => new Date().toISOString().slice(0, 10);

// Change vs. a previous value, as a fraction; null when there's nothing to compare against.
export const change = (cur, prev) => (prev ? (cur - prev) / Math.abs(prev) : null);
