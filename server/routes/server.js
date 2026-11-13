// The server's health and each app's usage (admins only), from the snapshots the server's
// ops job (active-metrics, in the padel backend repo's ops/) writes every 5 minutes as JSON
// lines, one file a day, into the folder mounted at METRICS_DIR.
import express from 'express';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { need } from '../http.js';

export const router = express.Router();

const DIR = process.env.METRICS_DIR || '/metrics';
// How far back each range looks, and how much time one chart point covers.
const RANGES = {
  '1d': { days: 1, bucketMin: 15 },
  '7d': { days: 7, bucketMin: 120 },
  '30d': { days: 30, bucketMin: 720 },
};

const readJson = (file) => {
  try { return JSON.parse(readFileSync(join(DIR, file), 'utf8')); } catch { return null; }
};

function snapshots(days) {
  const since = Date.now() - days * 86_400_000;
  const out = [];
  for (let d = days; d >= 0; d--) {
    const file = join(DIR, `${new Date(Date.now() - d * 86_400_000).toISOString().slice(0, 10)}.jsonl`);
    if (!existsSync(file)) continue;
    for (const line of readFileSync(file, 'utf8').split('\n')) {
      if (!line) continue;
      try {
        const s = JSON.parse(line);
        if (Date.parse(s.at) >= since) out.push(s);
      } catch { /* a line cut short by a crash */ }
    }
  }
  return out;
}

// Bytes moved between two running totals; a smaller value means the counter restarted from 0.
const moved = (prev, cur) => (prev == null ? 0 : cur >= prev ? cur - prev : cur);

// Per app: its containers' CPU % (of one core) and memory added up.
function byApp(containers = []) {
  const apps = {};
  for (const c of containers) {
    const a = (apps[c.app] ??= { cpu: 0, mem: 0, containers: [] });
    a.cpu += c.cpu;
    a.mem += c.mem;
    a.containers.push({ name: c.name, state: c.state, health: c.health, cpu: c.cpu, mem: c.mem });
  }
  return apps;
}

export function summarize(snaps, bucketMin) {
  const bucketMs = bucketMin * 60_000;
  const buckets = new Map();
  const totals = {};
  const prevNet = {}; // container -> last running totals
  let prevHost = null;
  const hostTraffic = { in: 0, out: 0 };

  for (const s of snaps) {
    const t = Math.floor(Date.parse(s.at) / bucketMs) * bucketMs;
    let b = buckets.get(t);
    if (!b) buckets.set(t, (b = { t, n: 0, cpu: 0, cpuMax: 0, cpuN: 0, mem: 0, apps: {}, traffic: {} }));
    b.n++;
    if (s.cpu != null) { b.cpu += s.cpu; b.cpuN++; b.cpuMax = Math.max(b.cpuMax, s.cpu); }
    b.mem += s.mem.total - s.mem.available;

    for (const [app, a] of Object.entries(byApp(s.containers))) {
      const ba = (b.apps[app] ??= { cpu: 0, mem: 0 });
      ba.cpu += a.cpu;
      ba.mem += a.mem;
      const tot = (totals[app] ??= { cpuSum: 0, memSum: 0, memPeak: 0, n: 0, traffic: 0 });
      tot.cpuSum += a.cpu; tot.memSum += a.mem; tot.memPeak = Math.max(tot.memPeak, a.mem); tot.n++;
    }
    for (const c of s.containers ?? []) {
      const p = prevNet[c.name];
      const bytes = moved(p?.rx, c.rx) + moved(p?.tx, c.tx);
      prevNet[c.name] = { rx: c.rx, tx: c.tx };
      b.traffic[c.app] = (b.traffic[c.app] ?? 0) + bytes;
      totals[c.app].traffic += bytes;
    }
    if (s.net) {
      hostTraffic.in += moved(prevHost?.rx, s.net.rx);
      hostTraffic.out += moved(prevHost?.tx, s.net.tx);
      prevHost = s.net;
    }
  }

  const points = [...buckets.values()].map((b) => ({
    t: b.t,
    cpu: b.cpuN ? b.cpu / b.cpuN : null,
    cpuMax: b.cpuN ? b.cpuMax : null,
    mem: b.mem / b.n,
    apps: Object.fromEntries(Object.entries(b.apps).map(([k, v]) => [k, { cpu: v.cpu / b.n, mem: v.mem / b.n }])),
    traffic: b.traffic,
  }));
  const apps = Object.fromEntries(Object.entries(totals).map(([k, v]) => [k, {
    cpuAvg: v.cpuSum / v.n, memAvg: v.memSum / v.n, memPeak: v.memPeak, traffic: v.traffic,
  }]));
  const cpus = snaps.map((s) => s.cpu).filter((x) => x != null);
  return {
    points,
    apps,
    host: {
      cpuAvg: cpus.length ? cpus.reduce((a, x) => a + x, 0) / cpus.length : null,
      cpuMax: cpus.length ? Math.max(...cpus) : null,
      memPeak: snaps.length ? Math.max(...snaps.map((s) => s.mem.total - s.mem.available)) : null,
      traffic: hostTraffic,
    },
  };
}

router.get('/server', (req, res) => {
  const range = RANGES[req.query.range ?? '1d'];
  need(range, 'Unknown range');
  const latest = readJson('latest.json');
  if (!latest) return res.json({ available: false });
  res.json({
    available: true,
    latest: { ...latest, apps: byApp(latest.containers) },
    storage: readJson('latest-storage.json'),
    bucketMin: range.bucketMin,
    ...summarize(snapshots(range.days), range.bucketMin),
  });
});
