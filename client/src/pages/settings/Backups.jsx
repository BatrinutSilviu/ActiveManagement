import { useState } from 'react';
import { api } from '../../api.js';
import { useAction, useApi } from '../../hooks.js';

const KIND_LABELS = { auto: 'Automatic', manual: 'Made by hand', 'pre-deploy': 'Before an update' };
const fileSize = (b) => (b > 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.round(b / 1e3)} KB`);
const when = (iso) => new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

/** Admins: the automatic backups, a "back up now" button and downloads (to keep a copy off the server). */
export function Backups() {
  const { data, reload } = useApi('/backups');
  const [error, run] = useAction(reload);
  const [all, setAll] = useState(false);
  if (!data) return null;
  const list = all ? data.backups : data.backups.slice(0, 8);
  return (
    <div className="card">
      <div className="card-pad card-head" style={{ marginBottom: 0 }}>
        <div><h2>Backups</h2>
          <p>The database is backed up automatically every {data.everyDays} days (the last {data.keep} are kept), and before every update.
            {' '}Download one now and then to keep a copy off the server.</p></div>
        <button className="btn btn-sm" onClick={() => run(() => api.post('/backups'))}>Back up now</button>
      </div>
      {error && <div className="error-box" style={{ margin: '0 22px 12px' }}>{error}</div>}
      <p className="hint" style={{ padding: '0 22px', margin: '0 0 12px' }}>
        {data.last ? `Last backup ${when(data.last)}` : 'No backup yet — the first one is made a minute after the app starts.'}
        {data.nextDue ? ` · next automatic one around ${when(data.nextDue)}` : ''}
      </p>
      {data.backups.length > 0 && (
        <div className="table-wrap">
          <table>
            <thead><tr><th>When</th><th className="hide-sm">Kind</th><th className="r">Size</th><th /></tr></thead>
            <tbody>
              {list.map((b) => (
                <tr key={b.name}>
                  <td>{when(b.at)}<div className="row-sub show-sm">{KIND_LABELS[b.kind]}</div></td>
                  <td className="secondary hide-sm">{KIND_LABELS[b.kind]}</td>
                  <td className="r secondary">{fileSize(b.size)}</td>
                  <td className="r"><a className="btn btn-sm btn-ghost" href={`/api/backups/${encodeURIComponent(b.name)}/download`}>Download</a></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {data.backups.length > 8 && (
        <div className="card-pad" style={{ paddingTop: 10 }}>
          <button className="btn btn-sm btn-ghost" onClick={() => setAll(!all)}>{all ? 'Show fewer' : `Show all ${data.backups.length}`}</button>
        </div>
      )}
    </div>
  );
}
