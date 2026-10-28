// Turns a pasted / uploaded spreadsheet into events + transactions ready for /api/import.

/** Parse CSV / TSV text into a 2-D array. Detects the delimiter, honours quotes. */
export function parseDelimited(text) {
  text = text.replace(/^﻿/, '');
  const first = text.split(/\r?\n/, 1)[0] || '';
  const count = (ch) => first.split(ch).length - 1;
  const delim = count('\t') ? '\t' : count(';') > count(',') ? ';' : ',';

  const rows = [];
  let row = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"' && cell === '') quoted = true;
    else if (ch === delim) { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += ch;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

export const colIndex = (letter) =>
  [...String(letter).trim().toUpperCase()].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;

const MONTHS = {
  jan: 1, ian: 1, feb: 2, mar: 3, apr: 4, may: 5, mai: 5, jun: 6, iun: 6, jul: 7, iul: 7, aug: 8, sep: 9,
  oct: 10, nov: 11, dec: 12,
};
const pad = (n) => String(n).padStart(2, '0');
const valid = (y, m, d) => {
  if (y < 100) y += 2000;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d ? `${y}-${pad(m)}-${pad(d)}` : null;
};

/** Accepts 15.03.2025, 15/03/2025, 2025-03-15, 15 mar 2025, 15-Mar-25 and Excel serial numbers. */
export function parseDate(raw) {
  const s = String(raw ?? '').trim().toLowerCase();
  if (!s) return null;
  let m;
  if ((m = s.match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})/))) return valid(+m[1], +m[2], +m[3]);
  if ((m = s.match(/^(\d{1,2})[-./](\d{1,2})[-./](\d{2,4})$/))) return valid(+m[3], +m[2], +m[1]);
  if ((m = s.match(/^(\d{1,2})[\s-]*([a-zăâî]{3})[a-zăâî]*\.?[\s-]*(\d{2,4})$/)) && MONTHS[m[2]]) return valid(+m[3], MONTHS[m[2]], +m[1]);
  if (/^\d{5}$/.test(s) && +s > 30000 && +s < 70000) {
    const d = new Date(Date.UTC(1899, 11, 30) + +s * 864e5);
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  }
  return null;
}

/** "1.234,56 lei", "1,234.56", "150 RON", "-75" -> positive number, or null. */
export function parseAmount(raw) {
  let s = String(raw ?? '').replace(/[^\d.,-]/g, '');
  if (!/\d/.test(s)) return null;
  s = s.replace(/-/g, '');
  const lastDot = s.lastIndexOf('.'), lastComma = s.lastIndexOf(',');
  if (lastDot >= 0 && lastComma >= 0) {
    const dec = lastDot > lastComma ? '.' : ',';
    s = s.split(dec === '.' ? ',' : '.').join('').replace(',', '.');
  } else if (lastComma >= 0 || lastDot >= 0) {
    const sep = lastComma >= 0 ? ',' : '.';
    const parts = s.split(sep);
    // 1.500 / 12,000 / 1.250.000 are thousands; 12,5 / 99.90 are decimals
    s = parts.length > 2 || parts.at(-1).length === 3 ? parts.join('') : parts.join('.');
  }
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
}

const RULES = {
  expense: [
    [/sal[aă]|teren|chirie|rent|venue|hall|field|baz[aă]/i, ['venue']],
    [/arbit|referee/i, ['referee']],
    [/premi|trofe|medal|cup[aă] |diplom|prize|troph/i, ['prize']],
    [/ap[aă]\b|mânc|manc|pizza|food|drink|snack|cafea|catering|b[aă]utur/i, ['food']],
    [/transport|benzin|motorin|fuel|taxi|uber|bolt/i, ['transport']],
    [/echipament|ming|tricou|plas[aă]|con[uU]ri|equipment|ball|bib|jersey/i, ['equipment']],
    [/asigur|insurance/i, ['insurance']],
    [/reclam|facebook|instagram|ads|promo|marketing|afi[sș]|print|banner/i, ['marketing']],
    [/medic|ambulan|first aid|prim ajutor/i, ['medical']],
  ],
  income: [
    [/sponsor/i, ['sponsor']],
    [/dona|redirec|2%|3[.,]5%/i, ['donat']],
    [/[iî]nscri|registr|tax[aă] de/i, ['registration']],
    [/merch|tricou|vânz|vanz/i, ['merch']],
  ],
};

/** Guess a category id from free text; falls back to `fallbackId`. */
export function guessCategory(text, kind, categories, fallbackId) {
  for (const [re, needles] of RULES[kind]) {
    if (!re.test(text || '')) continue;
    const hit = categories.find((c) => c.kind === kind && needles.some((n) => c.name.toLowerCase().includes(n)));
    if (hit) return hit.id;
  }
  return fallbackId;
}

// Recognise the sport from an event name, in Romanian or English.
const SPORT_WORDS = [
  [/tenis\s*(de\s*)?picior|foot\s*tennis|footvolley|futnet/i, 'foot tennis'],
  [/fotbal|football|soccer|minifotbal/i, 'football'],
  [/volei|volley/i, 'volleyball'],
  [/baschet|basket/i, 'basketball'],
  [/handbal|handball/i, 'handball'],
  [/padel/i, 'padel'],
  [/alerg|running|\brun\b|maraton|semimaraton|cros/i, 'running'],
  [/drume[tț]|hik|trek|munte|tur[aă]\b/i, 'hiking'],
  [/biciclet|bike|biking|cycling|ciclism|mtb/i, 'biking'],
  [/hyrox/i, 'hyrox'],
  [/tenis|tennis/i, 'tennis'],
];

export function guessEventType(name, types, fallbackId) {
  for (const [re, sport] of SPORT_WORDS) {
    if (!re.test(name)) continue;
    const t = types.find((x) => x.name.toLowerCase() === sport);
    if (t) return t.id;
  }
  return fallbackId;
}

/**
 * Build the import preview.
 * opts: { cols: {date,income,event,expense,description}, fillDates, groupBy: 'name-date'|'name',
 *         categories, types, defaultTypeId, defaultIncomeCat, defaultExpenseCat }
 */
export function buildImport(grid, opts) {
  const ix = Object.fromEntries(Object.entries(opts.cols).map(([k, v]) => [k, colIndex(v)]));
  const cell = (row, k) => String(row[ix[k]] ?? '').trim();
  const lines = [], skipped = [];
  let lastDate = null;

  grid.forEach((row, i) => {
    const line = i + 1;
    if (!row.some((c) => String(c).trim())) return;
    const income = parseAmount(cell(row, 'income'));
    const expense = parseAmount(cell(row, 'expense'));
    const rawDate = cell(row, 'date');
    let date = parseDate(rawDate);
    if (row.some((c) => /^\s*total/i.test(c))) { skipped.push({ line, reason: 'Totals row' }); return; }
    if (!income && !expense) {
      if (date) lastDate = date;
      else if (i < 5 || rawDate) skipped.push({ line, reason: rawDate ? 'Header or no amounts' : 'Header / empty row' });
      return;
    }
    if (!date && !rawDate && opts.fillDates && lastDate) date = lastDate;
    if (!date) { skipped.push({ line, reason: `Unreadable date “${rawDate || '(empty)'}”` }); return; }
    lastDate = date;
    const eventName = cell(row, 'event');
    const desc = cell(row, 'description');
    if (income) lines.push({ line, date, kind: 'income', amount: income, eventName, description: !expense && !eventName ? desc : '' });
    if (expense) lines.push({ line, date, kind: 'expense', amount: expense, eventName, description: desc });
  });

  // Group into events.
  const events = new Map();
  for (const l of lines) {
    if (!l.eventName) continue;
    const key = opts.groupBy === 'name' ? l.eventName.toLowerCase() : `${l.eventName.toLowerCase()}|${l.date}`;
    const e = events.get(key);
    if (e) { if (l.date < e.date) e.date = l.date; e.count++; }
    else events.set(key, { key, name: l.eventName, date: l.date, count: 1,
      type_id: guessEventType(l.eventName, opts.types, opts.defaultTypeId) });
    l.event_key = key;
  }

  const txs = lines.map((l, i) => ({
    id: i,
    include: true,
    ...l,
    category_id: guessCategory(`${l.description} ${l.eventName}`, l.kind, opts.categories,
      l.kind === 'income' ? opts.defaultIncomeCat : opts.defaultExpenseCat),
  }));
  return { txs, events: [...events.values()].sort((a, b) => a.date.localeCompare(b.date)), skipped };
}
