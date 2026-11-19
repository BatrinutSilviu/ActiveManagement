// The app's language (Settings → Business → Language). The code is written in English; t() looks the English text
// up in the chosen language's dictionary and falls back to the English when there's no entry.
//
//   t('Save')                                    -> "Salvează"
//   t('{n} sessions left', { n: 3 })             -> "3 ședințe rămase"     ({name} fills in what changes)
//   t(`New ${term('person')}`)                    -> "Pacient nou"          (compose in English, then translate)
//
// Dictionaries: i18n/ro/*.js, one file per part of the app, merged in i18n/ro/index.js. Error messages from the
// server go through t() too (api.js), so their exact English text can be a key as well.
import ro from './ro/index.js';

const DICTS = { ro };
export const LANGUAGES = { en: 'English', ro: 'Română' };

let lang = 'en';
let dict = null;
const listeners = new Set();

export function setLanguage(l) {
  lang = DICTS[l] ? l : 'en';
  dict = DICTS[lang] || null;
  document.documentElement.lang = lang;
  for (const f of listeners) f(lang);
}
export const language = () => lang;
export const onLanguage = (f) => { listeners.add(f); return () => listeners.delete(f); };
/** For dates and times: "ro-RO" or "en-GB". */
export const dateLocale = () => (lang === 'ro' ? 'ro-RO' : 'en-GB');

export function t(s, vars) {
  if (s == null) return s;
  let out = dict?.[s] ?? s;
  if (vars) out = out.replace(/\{(\w+)\}/g, (m, k) => (vars[k] ?? m));
  return out;
}

/** "1 session" / "3 sessions": the English singular and plural, each a key of its own. */
export const tn = (n, one, many, vars) => t(n === 1 ? one : many, { n, ...vars });
