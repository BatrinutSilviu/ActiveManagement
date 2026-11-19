import { t } from '../../i18n/index.js';

/** Asks for a new name; null when cancelled or unchanged. */
export function rename(current) {
  const name = window.prompt(t('New name'), current);
  return name && name.trim() !== current ? name.trim() : null;
}
