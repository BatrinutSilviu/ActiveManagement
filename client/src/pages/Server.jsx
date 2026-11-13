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
// Every public site, in the order the overview shows them.
const SITES = [
  { key: 'padel', name: 'Padel', url: 'https://padel.activetimisoara.ro' },
  { key: 'hikes', name: 'Hikes & events', url: 'https://hikes.activetimisoara.ro' },
  { key: 'management', name: 'Management', url: 'https://management.activetimisoara.ro' },
  { key: 'website', name: 'Website', url: 'https://activetimisoara.ro' },
  { key: 'padelacademy', name: 'Padel Academy', url: 'https://padelacademy.activetimisoara.ro' },
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

  const { latest, storage, points, apps, host, sites = {} } = data;
  const nowSites = Object.fromEntries((latest.sites ?? []).map((x) => [x.app, x]));
  const rangeLabel = RANGES.find((r) => r[0] === range)[1];
  const color = Object.fromEntries(APPS.map((a, i) => [a.key, c.apps[i]]));
  const present = APPS.filter((a) => apps[a.key] || latest.apps[a.key]);
  const memUsed = latest.mem.total - latest.mem.available;
  const diskUsed = latest.disk.total - latest.disk.free;
  const chart = points.map((p) => ({
    t: p.t, cpu: p.cpu, cpuMax: p.cpuMax, mem: p.mem, disk: p.disk,
    ...Object.fromEntries(present.flatMap((a) => [[`mem_${a.key}`, p.apps[a.key]?.mem ?? 0], [`net_${a.key}`, p.traffic[a.key] ?? 0]])),
  }));
  const tick = (t) => timeLabel(t, range);
  const bucket = data.bucketMin >= 60 ? `${data.bucketMin / 60} hours` : `${data.bucketMin} minutes`;

  const storageByApp = {};  // per app, for the Apps table
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
        <div className="card table-wrap">
          <div className="card-pad card-head" style={{ marginBottom: 0 }}>
            <div><h2>All apps</h2><p>Each site is checked from the server every 5 minutes, as a visitor would open it. Errors are the ones the app logged.</p></div>
          </div>
          <table>
            <thead><tr><th>Site</th><th>Now</th><th className="num">Response</th><th className="num">Up · {rangeLabel}</th><th className="num">Response avg · slowest</th><th className="num">Errors · {rangeLabel}</th></tr></thead>
            <tbody>
              {SITES.map((site) => {
                const now = nowSites[site.key];
                const st = sites[site.key];
                const up = now && now.status >= 200 && now.status < 400;
                return (
                  <tr key={site.key}>
                    <td><a className="row-title" href={site.url} target="_blank" rel="noreferrer">{site.name}</a>
                      {st?.lastDown && <div className="row-sub">last down {ago(st.lastDown)}</div>}</td>
                    <td>{!now ? '—' : up
                      ? <span className="badge status-completed"><span className="dot" />✓ up</span>
                      : <span className="badge server-bad"><span className="dot" />⚠ down ({now.status || 'no answer'})</span>}</td>
                    <td className="num">{now?.ms != null ? `${now.ms} ms` : '—'}</td>
                    <td className="num">{st?.uptime != null ? `${(st.uptime * 100).toFixed(st.uptime === 1 ? 0 : 2)}%` : '—'}</td>
                    <td className="num">{st?.msAvg != null ? `${st.msAvg} · ${st.msMax} ms` : '—'}</td>
                    <td className="num">{site.key in (latest.errors ?? {}) ? (st?.errors ?? 0) : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="grid grid-kpi">
          <div className="card kpi"><div className="kpi-label">CPU now · {latest.cores} cores</div>
            <div className="kpi-value">{pctText(latest.cpu)}</div><div className="kpi-sub">average {pctText(host.cpuAvg)}, peak {pctText(host.cpuMax)} in {rangeLabel}</div></div>
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
            <div className="card-head"><div><h2>Disk used over time</h2><p>Highest per {bucket} · the disk holds {bytes(latest.disk.total)}</p></div></div>
            <div className="chart" style={{ height: 220 }}>
              <ResponsiveContainer>
                <LineChart data={chart} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke={c.grid} />
                  <XAxis dataKey="t" tickFormatter={tick} {...axis(c)} minTickGap={24} />
                  <YAxis tickFormatter={bytes} {...axis(c)} width={64} domain={[0, (max) => Math.max(max * 1.2, 1)]} />
                  <Tooltip cursor={{ stroke: c.axis }} content={<Tip range={range} rows={(d) => [
                    { name: 'Used', value: `${bytes(d.disk)} (${((100 * d.disk) / latest.disk.total).toFixed(1)}%)`, color: c.apps[0] },
                  ]} />} />
                  <Line dataKey="disk" stroke={c.apps[0]} strokeWidth={2} dot={false} activeDot={{ r: 4, stroke: c.surface, strokeWidth: 2 }} connectNulls />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <p className="muted" style={{ fontSize: 12.5, marginTop: 10 }}>{growthText(data.diskGrowthPerDay, latest.disk.free, rangeLabel)}</p>
          </div>
        </div>

        <StorageCard storage={storage} disk={latest.disk} colors={c} />
      </div>
    </div>
  );
}

// "+120 MB a day in 7 days → full in about 9 months", or why there's no estimate.
function growthText(perDay, free, rangeLabel) {
  if (perDay == null) return 'The fill rate shows once there is a day of measurements.';
  const per = `${perDay >= 0 ? '+' : '−'}${bytes(Math.abs(perDay))} a day over the last ${rangeLabel}`;
  if (perDay <= 1024 ** 2) return `${per}: not filling up.`;
  const daysLeft = free / perDay;
  const when = daysLeft > 730 ? 'more than 2 years' : daysLeft > 60 ? `about ${Math.round(daysLeft / 30)} months` : `about ${Math.round(daysLeft)} days`;
  return `${per}. At that rate the disk is full in ${when}. Deploys and the Sunday cleanup make this move around.`;
}

// What fills the disk, grouped, as a share of the whole disk; the rest of the used space is the
// system (Ubuntu, Docker itself, other programs).
const STORAGE_GROUPS = [
  { key: 'docker', name: 'Docker images & build cache', kinds: ['images & build cache'] },
  { key: 'database', name: 'Databases', kinds: ['database'] },
  { key: 'files', name: 'Uploads & files', kinds: ['uploads', 'files', 'certificates'] },
  { key: 'backups', name: 'Backups', kinds: ['backups'] },
  { key: 'logs', name: 'Logs', kinds: ['logs'] },
  { key: 'system', name: 'System, app code & other', kinds: ['code'] },
];
const APP_NAMES = { all: 'All apps', docker: 'Docker' };
const pct = (part, whole) => {
  const p = (100 * part) / whole;
  return part > 0 && p < 0.01 ? '<0.01%' : `${p.toFixed(p < 1 ? 2 : 1)}%`;
};

function StorageCard({ storage, disk, colors }) {
  if (!storage) {
    return <div className="card card-pad"><h2>Storage</h2><p className="muted">Not measured yet (once an hour).</p></div>;
  }
  const used = disk.total - disk.free;
  const groups = STORAGE_GROUPS.map((g, i) => {
    const items = g.kinds ? storage.storage.filter((x) => g.kinds.includes(x.kind) && x.bytes > 0) : [];
    return { ...g, color: colors.apps[i], items, bytes: items.reduce((a, x) => a + x.bytes, 0) };
  });
  // Whatever isn't measured above is the system itself (Ubuntu, programs) — added to the last group.
  const system = groups.find((g) => g.key === 'system');
  const rest = Math.max(0, used - groups.reduce((a, g) => a + g.bytes, 0));
  system.bytes += rest;
  if (rest > 0) system.items = [...system.items, { app: 'all', kind: 'system', name: 'system & programs', bytes: rest }];
  const segments = [...groups, { key: 'free', name: 'Free', color: colors.grid, bytes: disk.free }];
  const label = (x) => x.app === 'all'
    ? x.name.replace('/var/log/active-apps', 'archived app logs')
    : `${APP_NAMES[x.app] ?? APPS.find((a) => a.key === x.app)?.name ?? x.app} · ${x.kind}`;

  return (
    <div className="card card-pad">
      <div className="card-head">
        <div><h2>Storage</h2><p>Share of the whole disk ({bytes(disk.total)}) · measured hourly, last at {new Date(storage.at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</p></div>
        <div className="kpi-value" style={{ fontSize: 20 }}>{pct(used, disk.total)} used</div>
      </div>

      <div className="storage-bar" role="img" aria-label={segments.map((g) => `${g.name} ${pct(g.bytes, disk.total)}`).join(', ')}>
        {segments.filter((g) => g.bytes > 0).map((g) => (
          <span key={g.key} title={`${g.name}: ${bytes(g.bytes)} (${pct(g.bytes, disk.total)})`}
            style={{ flexGrow: g.bytes, background: g.color, minWidth: g.bytes / disk.total > 0.0005 ? 3 : 0 }} />
        ))}
      </div>

      <div className="table-wrap">
      <table className="compact-table storage-table">
        <thead><tr><th>What</th><th className="num">Size</th><th className="num">Of the disk</th><th className="num">Of used</th></tr></thead>
        <tbody>
          {segments.map((g) => (
            <StorageGroupRows key={g.key} group={g} total={disk.total} used={used} label={label} />
          ))}
        </tbody>
      </table>
      </div>
      <p className="muted" style={{ fontSize: 12.5, marginTop: 10 }}>
        Docker images and build cache are cleaned on Sundays. Backups: kept 30 days here and copied, encrypted, to Backblaze every night.
      </p>
    </div>
  );
}

function StorageGroupRows({ group, total, used, label }) {
  return (
    <>
      <tr className="storage-group">
        <td><span className="row-title"><i className="kpi-key" style={{ background: group.color, height: 10, width: 10 }} />{group.name}</span></td>
        <td className="num">{bytes(group.bytes)}</td>
        <td className="num">{pct(group.bytes, total)}</td>
        <td className="num">{group.key === 'free' ? '—' : pct(group.bytes, used)}</td>
      </tr>
      {group.items?.length > 1 && group.items.sort((a, b) => b.bytes - a.bytes).map((x) => (
        <tr key={x.name} className="storage-item">
          <td className="muted">{label(x)}</td>
          <td className="num muted">{bytes(x.bytes)}</td>
          <td className="num muted">{pct(x.bytes, total)}</td>
          <td className="num muted">{pct(x.bytes, used)}</td>
        </tr>
      ))}
    </>
  );
}
