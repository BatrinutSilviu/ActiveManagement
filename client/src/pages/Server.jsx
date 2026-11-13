import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { useApi, useChartColors, usePersistentState } from '../hooks.js';
import { Legend } from '../components/Charts.jsx';

// The server's health and what each app uses (server/routes/server.js), from snapshots taken
// every 5 minutes on the server. Admins only.

// Fixed order, so an app keeps its colour whatever else is running.
const APPS = [
  { key: 'padel', name: 'Padel' },
  { key: 'hikes', name: 'Hikes & events' },
  { key: 'management', name: 'Management' },
  { key: 'padelacademy', name: 'Padel Academy' },
  { key: 'proxy', name: 'Proxy (Traefik)' },
  { key: 'other', name: 'Other' },
];
const RANGES = [['1d', '24 hours'], ['7d', '7 days'], ['30d', '30 days']];

const bytes = (b) => {
  if (b == null) return '—';
  if (b < 1024 ** 2) return `${Math.round(b / 1024)} KB`;
  if (b < 1024 ** 3) return `${Math.round(b / 1024 ** 2)} MB`;
  return `${(b / 1024 ** 3).toFixed(1)} GB`;
};
const pctText = (v) => (v == null ? '—' : `${v < 10 ? v.toFixed(1) : Math.round(v)}%`);
const ago = (iso) => {
  if (!iso) return 'never';
  const h = (Date.now() - Date.parse(iso)) / 3_600_000;
  return h < 1 ? `${Math.max(1, Math.round(h * 60))} min ago` : h < 48 ? `${Math.round(h)} h ago` : `${Math.round(h / 24)} days ago`;
};
const uptime = (s) => (s > 86400 ? `${Math.floor(s / 86400)} days` : `${Math.floor(s / 3600)} h`);

const axis = (c) => ({ tick: { fill: c.muted, fontSize: 12 }, axisLine: false, tickLine: false });

function timeLabel(t, range) {
  const d = new Date(t);
  return range === '1d'
    ? d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}
function tipLabel(t, range) {
  const d = new Date(t);
  return d.toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
    + (range === '1d' ? '' : ' (period start)');
}

function Tip({ active, payload, label, range, rows }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="tip">
      <div className="tip-title">{tipLabel(label, range)}</div>
      {rows(payload[0].payload).map((r) => (
        <div className="tip-row" key={r.name}><span>{r.color && <i style={{ background: r.color }} />}{r.name}</span><b>{r.value}</b></div>
      ))}
    </div>
  );
}

function Health({ containers }) {
  const bad = containers.filter((c) => c.state !== 'running' || c.health === 'unhealthy');
  const starting = containers.some((c) => c.health === 'health: starting');
  if (bad.length) return <span className="badge server-bad"><span className="dot" />⚠ {bad.map((c) => c.state !== 'running' ? 'stopped' : 'unhealthy')[0]}</span>;
  if (starting) return <span className="badge"><span className="dot" style={{ background: 'var(--warning)' }} />starting</span>;
  return <span className="badge status-completed"><span className="dot" />✓ running</span>;
}

export default function Server() {
  const c = useChartColors();
  const [range, setRange] = usePersistentState('am-server-range', '1d');
  const { data, error, loading } = useApi(`/server?range=${range}`);

  if (error) return <div className="card card-pad">Couldn't load the server's status: {error}</div>;
  if (!data) return null;
  if (!data.available) {
    return <div className="card card-pad empty">No snapshots yet: the server's metrics job (active-metrics) hasn't written any, or its folder isn't mounted.</div>;
  }

  const { latest, storage, points, apps, host } = data;
  const color = Object.fromEntries(APPS.map((a, i) => [a.key, c.apps[i]]));
  const present = APPS.filter((a) => apps[a.key] || latest.apps[a.key]);
  const memUsed = latest.mem.total - latest.mem.available;
  const diskUsed = latest.disk.total - latest.disk.free;
  const chart = points.map((p) => ({
    t: p.t, cpu: p.cpu, cpuMax: p.cpuMax, mem: p.mem,
    ...Object.fromEntries(present.flatMap((a) => [[`mem_${a.key}`, p.apps[a.key]?.mem ?? 0], [`net_${a.key}`, p.traffic[a.key] ?? 0]])),
  }));
  const tick = (t) => timeLabel(t, range);
  const bucket = data.bucketMin >= 60 ? `${data.bucketMin / 60} hours` : `${data.bucketMin} minutes`;

  const storageByApp = {};
  for (const s of storage?.storage ?? []) {
    const row = (storageByApp[s.app] ??= { total: 0, parts: [] });
    row.total += s.bytes ?? 0;
    row.parts.push(s);
  }
  const backups = storage?.backups ?? {};
  const backupOld = (iso, hours) => !iso || Date.now() - Date.parse(iso) > hours * 3_600_000;

  return (
    <div className={loading ? 'loading' : ''}>
      <div className="page-head">
        <div>
          <h1>Server</h1>
          <p>Health and usage of the server and every app on it. Measured every 5 minutes; last at {new Date(latest.at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}.
            {' '}A weekly summary is emailed on Mondays, and alerts as soon as something breaks.</p>
        </div>
        <div className="segmented" role="tablist" aria-label="Period">
          {RANGES.map(([k, label]) => <button key={k} role="tab" aria-selected={range === k} className={range === k ? 'on' : ''} onClick={() => setRange(k)}>{label}</button>)}
        </div>
      </div>

      <div className="stack">
        <div className="grid grid-kpi">
          <div className="card kpi"><div className="kpi-label">CPU now · {latest.cores} cores</div>
            <div className="kpi-value">{pctText(latest.cpu)}</div><div className="kpi-sub">average {pctText(host.cpuAvg)}, peak {pctText(host.cpuMax)} in {RANGES.find((r) => r[0] === range)[1]}</div></div>
          <div className="card kpi"><div className="kpi-label">Memory used</div>
            <div className="kpi-value">{bytes(memUsed)}</div><div className="kpi-sub">of {bytes(latest.mem.total)} · peak {bytes(host.memPeak)}</div></div>
          <div className="card kpi"><div className="kpi-label">Disk used</div>
            <div className="kpi-value">{Math.round((100 * diskUsed) / latest.disk.total)}%</div><div className="kpi-sub">{bytes(diskUsed)} of {bytes(latest.disk.total)}</div></div>
          <div className="card kpi"><div className="kpi-label">Internet traffic</div>
            <div className="kpi-value">{bytes(host.traffic.in + host.traffic.out)}</div><div className="kpi-sub">{bytes(host.traffic.out)} sent · {bytes(host.traffic.in)} received</div></div>
          <div className="card kpi"><div className="kpi-label">Backups</div>
            <div className="kpi-value" style={{ fontSize: 20 }}>
              {['padel', 'hikes', 'management'].some((a) => backupOld(backups[a], 26)) || backupOld(backups.offsite, 26)
                ? <span className="badge server-bad"><span className="dot" />⚠ overdue</span>
                : <span className="badge status-completed"><span className="dot" />✓ up to date</span>}
            </div>
            <div className="kpi-sub">local {ago(backups.padel)} · off-site {ago(backups.offsite)}</div></div>
          <div className="card kpi"><div className="kpi-label">Server up for</div>
            <div className="kpi-value">{uptime(latest.uptime)}</div><div className="kpi-sub">load {latest.load.map((l) => l.toFixed(2)).join(' · ')}</div></div>
        </div>

        <div className="card table-wrap">
          <div className="card-pad card-head" style={{ marginBottom: 0 }}>
            <div><h2>Apps</h2><p>CPU is % of one core (the server has {latest.cores}); traffic counts what the app sent and received in the period.</p></div>
          </div>
          <table>
            <thead><tr><th>App</th><th>Status</th><th className="num">CPU now</th><th className="num">Memory now</th><th className="num">Memory avg · peak</th><th className="num">Traffic</th><th className="num">Storage</th></tr></thead>
            <tbody>
              {present.map((a) => {
                const now = latest.apps[a.key];
                const t = apps[a.key];
                return (
                  <tr key={a.key}>
                    <td><span className="row-title"><i className="kpi-key" style={{ background: color[a.key], height: 10, width: 10 }} />{a.name}</span>
                      <div className="row-sub" style={{ whiteSpace: 'normal', maxWidth: 320 }}>{now?.containers.map((x) => x.name).join(', ')}</div></td>
                    <td>{now ? <Health containers={now.containers} /> : '—'}</td>
                    <td className="num">{pctText(now?.cpu)}</td>
                    <td className="num">{bytes(now?.mem)}</td>
                    <td className="num">{bytes(t?.memAvg)} · {bytes(t?.memPeak)}</td>
                    <td className="num">{bytes(t?.traffic)}</td>
                    <td className="num">{bytes(storageByApp[a.key]?.total)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="grid grid-2">
          <div className="card card-pad">
            <div className="card-head"><div><h2>Server CPU</h2><p>Average per {bucket}{range === '1d' ? '' : ', with the peak in the tooltip'}</p></div></div>
            <div className="chart" style={{ height: 220 }}>
              <ResponsiveContainer>
                <LineChart data={chart} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke={c.grid} />
                  <XAxis dataKey="t" tickFormatter={tick} {...axis(c)} minTickGap={24} />
                  <YAxis tickFormatter={(v) => `${v}%`} {...axis(c)} width={44} domain={[0, (max) => Math.max(10, Math.ceil(max / 10) * 10)]} />
                  <Tooltip cursor={{ stroke: c.axis }} content={<Tip range={range} rows={(d) => [
                    { name: 'Average', value: pctText(d.cpu), color: c.apps[0] },
                    ...(range === '1d' ? [] : [{ name: 'Peak', value: pctText(d.cpuMax) }]),
                  ]} />} />
                  <Line dataKey="cpu" stroke={c.apps[0]} strokeWidth={2} dot={false} activeDot={{ r: 4, stroke: c.surface, strokeWidth: 2 }} connectNulls />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="card card-pad">
            <div className="card-head"><div><h2>Memory by app</h2><p>Stacked; the server has {bytes(latest.mem.total)}</p></div></div>
            <Legend items={present.map((a) => ({ name: a.name, color: color[a.key] }))} />
            <div className="chart" style={{ height: 220, marginTop: 10 }}>
              <ResponsiveContainer>
                <AreaChart data={chart} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke={c.grid} />
                  <XAxis dataKey="t" tickFormatter={tick} {...axis(c)} minTickGap={24} />
                  <YAxis tickFormatter={bytes} {...axis(c)} width={64} />
                  <Tooltip cursor={{ stroke: c.axis }} content={<Tip range={range} rows={(d) => [
                    ...present.map((a) => ({ name: a.name, value: bytes(d[`mem_${a.key}`]), color: color[a.key] })).reverse(),
                    { name: 'Whole server', value: bytes(d.mem) },
                  ]} />} />
                  {present.map((a) => (
                    <Area key={a.key} dataKey={`mem_${a.key}`} stackId="m" stroke={c.surface} strokeWidth={1}
                      fill={color[a.key]} fillOpacity={0.85} isAnimationActive={false} />
                  ))}
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        <div className="grid grid-2">
          <div className="card card-pad">
            <div className="card-head"><div><h2>Traffic by app</h2><p>Sent + received per {bucket}</p></div></div>
            <Legend items={present.map((a) => ({ name: a.name, color: color[a.key] }))} />
            <div className="chart" style={{ height: 220, marginTop: 10 }}>
              <ResponsiveContainer>
                <BarChart data={chart} margin={{ top: 6, right: 8, left: 0, bottom: 0 }} barCategoryGap="12%">
                  <CartesianGrid vertical={false} stroke={c.grid} />
                  <XAxis dataKey="t" tickFormatter={tick} {...axis(c)} minTickGap={24} />
                  <YAxis tickFormatter={bytes} {...axis(c)} width={64} />
                  <Tooltip cursor={{ fill: c.grid, opacity: 0.5 }} content={<Tip range={range} rows={(d) => present
                    .map((a) => ({ name: a.name, value: bytes(d[`net_${a.key}`]), color: color[a.key] })).reverse()} />} />
                  {present.map((a, i) => (
                    <Bar key={a.key} dataKey={`net_${a.key}`} stackId="n" fill={color[a.key]} stroke={c.surface} strokeWidth={1}
                      radius={i === present.length - 1 ? [3, 3, 0, 0] : 0} isAnimationActive={false} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="card card-pad">
            <div className="card-head"><div><h2>Storage</h2><p>Measured hourly{storage ? `, last at ${new Date(storage.at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}` : ''}</p></div></div>
            {storage ? (
              <table className="compact-table">
                <tbody>
                  {Object.entries(storageByApp).sort((a, b) => b[1].total - a[1].total).flatMap(([app, row]) => row.parts
                    .filter((p) => p.bytes > 0)
                    .map((p) => (
                      <tr key={p.name}>
                        <td>{APPS.find((a) => a.key === app)?.name ?? (app === 'all' ? 'All apps' : app === 'docker' ? 'Docker' : app)}</td>
                        <td className="muted">{app === 'all' ? `${p.kind} · ${p.name.replace('/var/log/active-apps', 'archived')}` : p.kind}</td>
                        <td className="num" style={{ textAlign: 'right' }}>{bytes(p.bytes)}</td>
                      </tr>
                    )))}
                </tbody>
              </table>
            ) : <p className="muted">Not measured yet (once an hour).</p>}
            <p className="muted" style={{ fontSize: 12.5, marginTop: 10 }}>
              Docker images and build cache are cleaned on Sundays. Backups: kept 30 days here and copied, encrypted, to Backblaze every night.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
