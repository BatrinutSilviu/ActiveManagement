/** The error of the last change made in a card's section, shown under its heading. */
export default function CardError({ error }) {
  return error ? <div className="error-box" style={{ margin: '0 22px 12px' }}>{error}</div> : null;
}
