// Small helpers with no better home.

/** Rounds to 2 decimals (RON amounts, percentages). */
export const r2 = (v) => Math.round(v * 100) / 100;

/** Lower case without diacritics, for matching what someone types (ă → a, ș → s…). */
export const fold = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
