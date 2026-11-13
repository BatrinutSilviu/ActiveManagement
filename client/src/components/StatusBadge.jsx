import { STATUS_LABELS } from './EventForm.jsx';

/** An event's status (Live / Finalized / Cancelled) as a coloured badge. */
export default function StatusBadge({ status }) {
  return <span className={`badge status-${status}`}><span className="dot" />{STATUS_LABELS[status]}</span>;
}
