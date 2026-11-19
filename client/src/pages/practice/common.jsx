// Shared bits of the practice pages (patients, sessions, packages, invoices and receipts).
import { money0 } from '../../format.js';
import { dateLocale, t } from '../../i18n/index.js';

export const SESSION_STATUS = { scheduled: 'Scheduled', done: 'Done', cancelled: 'Cancelled' };
const STATUS_CLASS = { scheduled: 'status-planned', done: 'status-completed', cancelled: 'status-cancelled' };

export function SessionStatus({ status }) {
  return <span className={`badge ${STATUS_CLASS[status]}`}><span className="dot" />{t(SESSION_STATUS[status])}</span>;
}

export const KIND_LABELS = { invoice: 'Invoice', receipt: 'Receipt' };

/** "Invoice KA-0012" / "Receipt" */
export const docLabel = (i) => `${t(KIND_LABELS[i.kind || i.invoice_kind])}${(i.number ?? i.invoice_number) ? ` ${i.number ?? i.invoice_number}` : ''}`;

/** A date as YYYY-MM-DD in the browser's time zone (format.today() is UTC). */
export const iso = (d) => d.toLocaleDateString('sv-SE');
export const localToday = () => iso(new Date());
export const addDays = (s, n) => { const d = new Date(`${s}T12:00:00`); d.setDate(d.getDate() + n); return iso(d); };
/** The Monday of the week `s` is in. */
export const weekStart = (s) => { const d = new Date(`${s}T12:00:00`); return addDays(s, -((d.getDay() + 6) % 7)); };
export const weekday = (s, style = 'long') => new Date(`${s}T12:00:00`).toLocaleDateString(dateLocale(), { weekday: style });
export const dayMonth = (s) => new Date(`${s}T12:00:00`).toLocaleDateString(dateLocale(), { day: 'numeric', month: 'short' });

export const timeLabel = (a) => (a.start_time ? `${a.start_time}${a.end_time ? `–${a.end_time}` : ''}` : '');

/** What a session costs: its own price, or "package" when it's paid with one. */
export const sessionPrice = (a) => (a.package_id ? <span className="muted">{a.package_name || t('package')}</span> : money0(a.price));

/** Where its money stands: on an invoice (paid or not), not billed yet, or nothing to bill. */
export function Billing({ a }) {
  if (a.invoice_id) return <span className={`badge ${a.invoice_paid ? 'status-completed' : ''}`}>{docLabel(a)} · {a.invoice_paid ? t('paid') : t('not paid')}</span>;
  if (a.status === 'done' && !a.package_id && a.price > 0) return <span className="badge badge-warn">{t('Not billed')}</span>;
  return null;
}

/** A link that opens the patient's address in maps. */
export const mapsUrl = (address) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;

/** Where a session happens (appointments.venue). */
export const VENUES = { home: "At the patient's home", practice: 'At the practice' };
