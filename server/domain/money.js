// Money is stored as integer bani; the API speaks RON with 2 decimals.
import { httpError } from '../http.js';

// Anything that isn't a finite amount (text, "1e400"…) is refused here, so no NaN / Infinity / non-integer
// reaches a money column (SQLite would store NULL or a REAL there).
export const toBani = (v) => {
  const b = Math.round(Number(v || 0) * 100);
  if (!Number.isSafeInteger(b)) throw httpError(400, `Invalid amount: ${String(v).slice(0, 30)}`);
  return b;
};
export const toRon = (v) => Math.round(Number(v || 0)) / 100;

/** Rounds RON to 2 decimals. */
export const r2 = (v) => Math.round(v * 100) / 100;

/** The rounded sum of `of(x)` over a list (adding in list order, like a plain reduce). */
export const sumBy = (list, of) => r2(list.reduce((a, x) => a + of(x), 0));
