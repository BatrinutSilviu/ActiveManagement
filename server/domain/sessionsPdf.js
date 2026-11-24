// A patient's sessions done between two dates, and their history from before the app, as a PDF (patient page → PDF). Written with the DejaVu font bundled in
// server/assets/fonts (free licence), which has the Romanian letters the PDF's built-in fonts lack (ș, ț, ă…).
import PDFDocument from 'pdfkit';
import { fileURLToPath } from 'node:url';

const font = (f) => fileURLToPath(new URL(`../assets/fonts/${f}`, import.meta.url));
const REGULAR = font('DejaVuSans.ttf'), BOLD = font('DejaVuSans-Bold.ttf');

const WORDS = {
  en: {
    title: 'Sessions done', patient: 'Patient', period: 'Period', date: 'Date', time: 'Time', service: 'Service',
    therapist: 'Therapist', place: 'Place', duration: 'Duration', home: 'Home', practice: 'Practice',
    total: 'Total', sessions: (n) => `${n} ${n === 1 ? 'session' : 'sessions'}`, none: 'No sessions done in this period.',
    noTime: (n) => `${n} without a duration, not counted in the hours`, made: 'Made on', page: (i, n) => `Page ${i} of ${n}`,
    history: 'Before the app', inHours: 'no dates',
  },
  ro: {
    title: 'Ședințe efectuate', patient: 'Pacient', period: 'Perioada', date: 'Data', time: 'Ora', service: 'Serviciu',
    therapist: 'Terapeut', place: 'Loc', duration: 'Durata', home: 'Acasă', practice: 'Cabinet',
    total: 'Total', sessions: (n) => `${n} ${n === 1 ? 'ședință' : 'ședințe'}`, none: 'Nicio ședință efectuată în această perioadă.',
    noTime: (n) => `${n} fără durată, necontorizate în ore`, made: 'Generat la', page: (i, n) => `Pagina ${i} din ${n}`,
    history: 'Înainte de aplicație', inHours: 'fără date',
  },
};

const minutesOf = (hm) => { const [h, m] = hm.split(':').map(Number); return h * 60 + m; };
/** Same rule as Statistics: end − start, else the service's duration. */
export const sessionMinutes = (a) => (a.start_time && a.end_time ? minutesOf(a.end_time) - minutesOf(a.start_time) : a.type_duration || null);
const hours = (min) => { const h = Math.floor(min / 60), m = min % 60; return h && m ? `${h} h ${m} min` : h ? `${h} h` : `${m} min`; };

/** Writes the PDF to `out` (a response). sessions: loadAppointments rows, oldest first; history: the patient's
 *  entries from before the app ({ kind: 'hours', service_name, hours } or { kind: 'dates', service_name, dates: [{ date, minutes }],
 *  duration }), shown in the same table, before the sessions. */
export function writeSessionsPdf(out, { business, client, from, to, sessions, history = [] }) {
  const w = WORDS[business?.language] || WORDS.en;
  const locale = business?.locale || 'ro-RO';
  const day = (s) => new Date(`${s}T12:00:00Z`).toLocaleDateString(locale, { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' });
  const doc = new PDFDocument({ size: 'A4', margin: 40, bufferPages: true, info: { Title: `${w.title} — ${client.name}` } });
  doc.registerFont('r', REGULAR).registerFont('b', BOLD);
  doc.pipe(out);

  const left = doc.page.margins.left, width = doc.page.width - left - doc.page.margins.right;
  if (business?.name) doc.font('b').fontSize(10).fillColor('#666').text(business.name);
  doc.moveDown(0.3).font('b').fontSize(18).fillColor('#000').text(w.title);
  doc.moveDown(0.4).fontSize(10);
  doc.font('b').text(`${w.patient}: `, { continued: true }).font('r').text(client.name);
  doc.font('b').text(`${w.period}: `, { continued: true }).font('r').text(`${day(from)} – ${day(to)}`);
  doc.moveDown(1);

  // Columns: date, time, service, therapist, place, duration.
  const cols = [
    { key: 'date', w: 64 }, { key: 'time', w: 66 }, { key: 'service', w: 120 }, { key: 'therapist', w: 100 },
    { key: 'place', w: 0 }, { key: 'duration', w: 80, right: true },
  ];
  cols[4].w = width - cols.reduce((a, c) => a + c.w, 0);
  const pad = 4;
  const row = (cells, { bold = false, fill = null } = {}) => {
    doc.font(bold ? 'b' : 'r').fontSize(9);
    const h = Math.max(...cells.map((t, i) => doc.heightOfString(t || '', { width: cols[i].w - 2 * pad }))) + 2 * pad;
    if (doc.y + h > doc.page.height - doc.page.margins.bottom - 20) { doc.addPage(); if (!fill) header(); doc.font(bold ? 'b' : 'r').fontSize(9); }
    const y = doc.y;
    if (fill) doc.rect(left, y, width, h).fill(fill).fillColor('#000');
    let x = left;
    cells.forEach((t, i) => {
      doc.text(t || '', x + pad, y + pad, { width: cols[i].w - 2 * pad, align: cols[i].right ? 'right' : 'left' });
      x += cols[i].w;
    });
    doc.moveTo(left, y + h).lineTo(left + width, y + h).lineWidth(0.5).strokeColor('#ccc').stroke();
    doc.x = left; doc.y = y + h;
  };
  const header = () => row(cols.map((c) => w[c.key]), { bold: true, fill: '#eee' });

  // One table: the history from before the app first (hours entries, then each dated day, by date), then the
  // sessions done in the period. A history day's duration is the one entered for it, else the service's usual one.
  const where = (a) => (a.venue === 'practice' ? [w.practice, a.location].filter(Boolean).join(' · ')
    // At home: their address only when the session was somewhere else than the one on their page.
    : [w.home, a.address && a.address !== client.address ? a.address : null].filter(Boolean).join(' · '));
  const rows = [
    ...history.filter((h) => h.kind !== 'dates').map((h) => ({ date: '—', time: '', service: h.service_name, place: `${w.history} · ${w.inHours}`, min: Math.round(h.hours * 60), count: 0 })),
    ...history.filter((h) => h.kind === 'dates').flatMap((h) => h.dates.map((d) => ({
      sort: d.date, date: day(d.date), service: h.service_name, place: w.history, min: d.minutes || h.duration || null, count: 1,
    }))).sort((x, y) => x.sort.localeCompare(y.sort)),
    ...sessions.map((a) => ({
      date: day(a.date), time: [a.start_time, a.end_time].filter(Boolean).join('–'), service: a.type_name, therapist: a.therapist,
      place: where(a), min: sessionMinutes(a), count: 1,
    })),
  ];
  if (!rows.length) {
    doc.font('r').fontSize(10).text(w.none);
  } else {
    header();
    let total = 0, noTime = 0, count = 0;
    for (const r of rows) {
      if (r.min > 0) total += r.min; else noTime += 1;
      count += r.count;
      row([r.date, r.time, r.service, r.therapist, r.place, r.min > 0 ? hours(r.min) : '—']);
    }
    row([w.total, '', w.sessions(count), '', '', hours(total)], { bold: true });
    if (noTime) doc.moveDown(0.5).font('r').fontSize(8).fillColor('#666').text(w.noTime(noTime), left).fillColor('#000');
  }

  // Footer on every page: when it was made, and the page number.
  const made = `${w.made} ${new Date().toLocaleString(locale, { timeZone: 'Europe/Bucharest', dateStyle: 'short', timeStyle: 'short' })}`;
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(range.start + i);
    const y = doc.page.height - doc.page.margins.bottom - 10;
    const bottom = doc.page.margins.bottom; doc.page.margins.bottom = 0; // writing in the margin mustn't add a page
    doc.font('r').fontSize(7).fillColor('#888');
    doc.text(made, left, y, { width, lineBreak: false });
    doc.text(w.page(i + 1, range.count), left, y, { width, align: 'right', lineBreak: false });
    doc.page.margins.bottom = bottom;
  }
  doc.end();
}
