import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useApi, usePersistentState } from '../hooks.js';
import { date, money, money0 } from '../format.js';
import { buildImport, parseDelimited } from '../importer.js';
import { confirmDelete } from '../components/Modal.jsx';
import { IconDownload, IconTrash } from '../components/Icons.jsx';

const DEFAULT_COLS = { date: 'D', income: 'E', event: 'F', expense: 'G', description: 'H' };
const COL_LABELS = { date: 'Date', income: 'Income', event: 'Event', expense: 'Expenses', description: 'Description' };

function History({ refreshKey, onUndone }) {
  const { data, reload } = useApi(`/imports?k=${refreshKey}`);
  if (!data?.length) return null;
  const undo = async (i) => {
    if (!confirmDelete(`import #${i.id} (${i.transactions} transactions, events it created)`)) return;
    await api.del(`/imports/${i.id}`);
    reload();
    onUndone();
  };
  return (
    <div className="card">
      <div className="card-pad card-head" style={{ marginBottom: 0 }}>
        <div><h2>Previous imports</h2><p>Undo removes everything an import added</p></div>
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>#</th><th>Source</th><th>When</th><th>By</th><th className="r">Transactions</th><th className="r">Events created</th><th /></tr></thead>
          <tbody>
            {data.map((i) => (
              <tr key={i.id}>
                <td className="muted">{i.id}</td>
                <td>{i.source}</td>
                <td>{date(i.created_at.slice(0, 10))} <span className="muted">{i.created_at.slice(11, 16)}</span></td>
                <td className="secondary">{i.created_by_name || '—'}</td>
                <td className="r">{i.transactions}</td>
                <td className="r">{i.events}</td>
                <td className="r"><button className="btn btn-sm btn-danger" onClick={() => undo(i)}><IconTrash width="14" />Undo</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function Import() {
  const { data: categories } = useApi('/categories');
  const { data: types } = useApi('/event-types');
  const [mode, setMode] = useState('paste');
  const [text, setText] = useState('');
  const [source, setSource] = useState('');
  const [cols, setCols] = usePersistentState('am-import-cols', DEFAULT_COLS);
  const [fillDates, setFillDates] = usePersistentState('am-import-fill', true);
  const [groupBy, setGroupBy] = usePersistentState('am-import-group', 'name-date');
  const [defaultType, setDefaultType] = useState('');
  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [historyKey, setHistoryKey] = useState(0);

  const grid = useMemo(() => (text.trim() ? parseDelimited(text) : null), [text]);

  useEffect(() => {
    if (!grid || !categories || !types) { setPreview(null); return; }
    const pick = (kind, re) => (categories.find((c) => c.kind === kind && re.test(c.name)) || categories.find((c) => c.kind === kind))?.id;
    setPreview(buildImport(grid, {
      cols, fillDates, groupBy, categories, types,
      defaultTypeId: Number(defaultType) || types[0]?.id,
      defaultIncomeCat: pick('income', /participation/i),
      defaultExpenseCat: pick('expense', /^other/i),
    }));
  }, [grid, cols, fillDates, groupBy, defaultType, categories, types]);

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (/\.xlsx?$/i.test(file.name)) {
      setError('Excel files aren’t supported directly — in Google Sheets use File → Download → CSV, or copy & paste the cells.');
      return;
    }
    setError(null);
    setSource(file.name);
    setText(await file.text());
  };

  const included = preview?.txs.filter((t) => t.include) || [];
  const usedEvents = preview?.events.filter((ev) => included.some((t) => t.event_key === ev.key)) || [];
  const totals = included.reduce((a, t) => ({ ...a, [t.kind]: a[t.kind] + t.amount }), { income: 0, expense: 0 });
  const updateTx = (id, patch) => setPreview((p) => ({ ...p, txs: p.txs.map((t) => (t.id === id ? { ...t, ...patch } : t)) }));
  const updateEvent = (key, patch) => setPreview((p) => ({ ...p, events: p.events.map((e) => (e.key === key ? { ...e, ...patch } : e)) }));

  const runImport = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await api.post('/import', {
        source: source || (mode === 'paste' ? 'Pasted from spreadsheet' : 'CSV file'),
        events: usedEvents.map(({ key, name, date: d, type_id }) => ({ key, name, date: d, type_id })),
        rows: included.map(({ date: d, kind, amount, description, category_id, event_key }) => ({ date: d, kind, amount, description, category_id, event_key })),
      });
      setResult(r);
      setText('');
      setHistoryKey((k) => k + 1);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const catsFor = (kind) => categories?.filter((c) => c.kind === kind) || [];

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Import</h1>
          <p>Bring income and expenses in from your Google Sheet. Nothing is saved until you confirm.</p>
        </div>
      </div>

      <div className="stack">
        {result && (
          <div className="card card-pad notice-success">
            <strong>Import complete.</strong> {result.inserted} transactions added
            {result.skipped ? `, ${result.skipped} skipped as already imported` : ''}; {result.eventsCreated} events created
            {result.eventsMatched ? `, ${result.eventsMatched} matched to existing events` : ''}.{' '}
            <Link to="/">See the dashboard →</Link>
          </div>
        )}
        {error && <div className="error-box">{error}</div>}

        <div className="grid grid-3-1">
          <div className="card card-pad">
            <div className="card-head">
              <div><h2>1. Your spreadsheet</h2><p>Paste the cells, or upload a CSV export</p></div>
              <div className="segmented">
                <button className={mode === 'paste' ? 'on' : ''} onClick={() => setMode('paste')}>Paste</button>
                <button className={mode === 'file' ? 'on' : ''} onClick={() => setMode('file')}>Upload CSV</button>
              </div>
            </div>
            {mode === 'paste' ? (
              <>
                <ol className="steps">
                  <li>Open the sheet and click the top-left corner (or press <kbd>Ctrl</kbd>+<kbd>A</kbd>) so column A is included.</li>
                  <li>Copy with <kbd>Ctrl</kbd>+<kbd>C</kbd>, then paste below with <kbd>Ctrl</kbd>+<kbd>V</kbd>.</li>
                </ol>
                <textarea className="paste-area" value={text} onChange={(e) => { setText(e.target.value); setSource(''); setResult(null); }}
                  placeholder="Paste spreadsheet cells here…" spellCheck={false} />
              </>
            ) : (
              <>
                <ol className="steps">
                  <li>In Google Sheets choose <b>File → Download → Comma-separated values (.csv)</b> for the tab you need.</li>
                  <li>Pick the downloaded file below.</li>
                </ol>
                <label className="dropzone">
                  <IconDownload width="22" />
                  <span>{source || 'Choose a .csv file'}</span>
                  <input type="file" accept=".csv,.tsv,.txt,text/csv,.xlsx,.xls" onChange={onFile} hidden />
                </label>
              </>
            )}
          </div>

          <div className="card card-pad">
            <div className="card-head"><div><h2>2. Columns &amp; options</h2><p>Column letters as in the sheet</p></div></div>
            <div className="col-map">
              {Object.keys(DEFAULT_COLS).map((k) => (
                <label key={k} className="field">{COL_LABELS[k]}
                  <input value={cols[k]} maxLength={2} onChange={(e) => setCols({ ...cols, [k]: e.target.value.toUpperCase().replace(/[^A-Z]/g, '') })} />
                </label>
              ))}
            </div>
            <div className="stack" style={{ gap: 12, marginTop: 14 }}>
              <label className="field">Sport when not recognised
                <select value={defaultType} onChange={(e) => setDefaultType(e.target.value)}>
                  {types?.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
                <span className="hint">The sport is detected from the event name (fotbal, volei, padel, drumeție, hyrox…)</span>
              </label>
              <label className="field">Group rows into events by
                <select value={groupBy} onChange={(e) => setGroupBy(e.target.value)}>
                  <option value="name-date">Same name on the same date</option>
                  <option value="name">Same name (any date)</option>
                </select>
              </label>
              <label className="check">
                <input type="checkbox" checked={fillDates} onChange={(e) => setFillDates(e.target.checked)} />
                Rows without a date use the date from the row above
              </label>
            </div>
          </div>
        </div>

        {preview && (
          <>
            <div className="grid grid-kpi">
              <div className="card kpi"><div className="kpi-label">Transactions</div><div className="kpi-value">{included.length}</div>
                <div className="kpi-sub">{preview.skipped.length} rows skipped</div></div>
              <div className="card kpi"><div className="kpi-label">Income</div><div className="kpi-value">{money0(totals.income)}</div></div>
              <div className="card kpi"><div className="kpi-label">Expenses</div><div className="kpi-value">{money0(totals.expense)}</div></div>
              <div className="card kpi"><div className="kpi-label">Events</div><div className="kpi-value">{usedEvents.length}</div>
                <div className="kpi-sub">existing ones are matched by name + date</div></div>
            </div>

            {usedEvents.length > 0 && (
              <div className="card">
                <div className="card-pad card-head" style={{ marginBottom: 0 }}>
                  <div><h2>3. Events found</h2><p>Check the sport of each event · imported past events are created as finalized</p></div>
                </div>
                <div className="table-wrap" style={{ maxHeight: 360 }}>
                  <table>
                    <thead><tr><th>Date</th><th>Event</th><th className="r">Rows</th><th>Sport</th></tr></thead>
                    <tbody>
                      {usedEvents.map((ev) => (
                        <tr key={ev.key}>
                          <td>{date(ev.date)}</td>
                          <td><strong>{ev.name}</strong></td>
                          <td className="r">{ev.count}</td>
                          <td style={{ width: 200 }}>
                            <select className="select-sm" value={ev.type_id} onChange={(e) => updateEvent(ev.key, { type_id: Number(e.target.value) })}>
                              {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                            </select>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="card">
              <div className="card-pad card-head" style={{ marginBottom: 0 }}>
                <div><h2>{usedEvents.length ? '4' : '3'}. Transactions</h2><p>Untick rows you don’t want; categories were guessed from the descriptions</p></div>
                <button className="btn btn-primary" disabled={busy || !included.length} onClick={runImport}>
                  {busy ? 'Importing…' : `Import ${included.length} transactions`}
                </button>
              </div>
              <div className="table-wrap" style={{ maxHeight: 560 }}>
                <table>
                  <thead><tr><th /><th>Row</th><th>Date</th><th>Event</th><th>Description</th><th>Category</th><th className="r">Amount</th></tr></thead>
                  <tbody>
                    {preview.txs.map((t) => (
                      <tr key={t.id} className={t.include ? '' : 'row-off'}>
                        <td><input type="checkbox" checked={t.include} onChange={(e) => updateTx(t.id, { include: e.target.checked })} aria-label="Include" /></td>
                        <td className="muted">{t.line}</td>
                        <td>{date(t.date)}</td>
                        <td>{t.eventName || <span className="muted">General</span>}</td>
                        <td className="cell-wrap">{t.description || <span className="muted">—</span>}</td>
                        <td style={{ width: 210 }}>
                          <select className="select-sm" value={t.category_id || ''} onChange={(e) => updateTx(t.id, { category_id: Number(e.target.value) })}>
                            {catsFor(t.kind).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                          </select>
                        </td>
                        <td className={`r kind-${t.kind}`}>{t.kind === 'income' ? '+' : '−'}{money(t.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!preview.txs.length && <div className="empty">No rows with a date and an amount were found — check the column letters.</div>}
              </div>
            </div>

            {preview.skipped.length > 0 && (
              <details className="card card-pad">
                <summary><strong>{preview.skipped.length} rows skipped</strong> <span className="muted">— headers, totals or unreadable dates</span></summary>
                <ul className="skipped">
                  {preview.skipped.map((s) => <li key={s.line}>Row {s.line}: {s.reason}</li>)}
                </ul>
              </details>
            )}
          </>
        )}

        <History refreshKey={historyKey} onUndone={() => setResult(null)} />
      </div>
    </div>
  );
}
