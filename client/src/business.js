// The business this copy of the app is for (Settings → Business): name, colour, currency, which parts of the app
// it uses (features) and what things are called (terms: "event" or "session", "sport" or "service"…).
import { createContext, useContext } from 'react';
import { setMoneyFormat } from './format.js';
import { setLanguage } from './i18n/index.js';

export const BusinessContext = createContext(null);

/** { business, on(feature), term(word), Term(word) } — Term capitalises: Term('events') -> "Sessions". */
export function useBusiness() {
  const business = useContext(BusinessContext);
  const on = (f) => !!business?.features?.[f];
  const term = (w) => business?.terms?.[w] ?? w;
  const Term = (w) => { const t = term(w); return t[0].toUpperCase() + t.slice(1); };
  return { business, on, term, Term };
}

const DEFAULT_COLOR = '#2a78d6';

/** Applies the business to the page: money format, tab title and (when it isn't the default) the accent colour. */
export function applyBusiness(b) {
  if (!b) return;
  setLanguage(b.language);
  setMoneyFormat(b.currency, b.locale);
  document.title = `${b.name} · Management`;
  const root = document.documentElement.style;
  const custom = b.color && b.color.toLowerCase() !== DEFAULT_COLOR;
  for (const [k, v] of Object.entries({ '--accent': b.color, '--accent-2': b.color, '--accent-soft': `${b.color}1f`, '--brand': b.color }))
    if (custom) root.setProperty(k, v); else root.removeProperty(k);
}
