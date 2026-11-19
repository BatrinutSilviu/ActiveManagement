import { STATUS_LABELS } from './EventForm.jsx';
import { t } from '../i18n/index.js';

/** An event's status (Live / Finalized / Cancelled) as a coloured badge. */
export default function StatusBadge({ status }) {
  return <span className={`badge status-${status}`}><span className="dot" />{t(STATUS_LABELS[status])}</span>;
}
