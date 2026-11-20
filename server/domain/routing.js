// Driving distances for the kilometre log: an address is found on the map with OpenStreetMap's geocoder (Nominatim),
// and the road distance between points comes from OSRM. Both are free public services: the geocoder allows one
// request a second, so every address found is kept (table `geocodes`) and asked for only once. Only addresses are
// sent, never who lives there. GEOCODER_URL and ROUTER_URL point them elsewhere (e.g. a server of one's own).
import { db } from '../db/connection.js';
import { log } from '../log.js';
import { httpError } from '../http.js';

const GEOCODER = process.env.GEOCODER_URL || 'https://nominatim.openstreetmap.org';
const ROUTER = process.env.ROUTER_URL || 'https://router.project-osrm.org';
const AGENT = 'practice-admin/1.0 (self-hosted kilometre log)';

const key = (address) => address.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[\s,]+/g, ' ').trim();

/**
 * What to ask the geocoder, best first. Romanian addresses carry block, staircase, floor and flat ("bl. A3, sc. B,
 * ap. 4"), which the map doesn't know and which make it find nothing; "nr. 12" is better as just "12". Then, if the
 * number isn't on the map, the street; last, the town alone (approximate).
 */
export function variants(address) {
  const parts = address.split(',').map((p) => p.trim()).filter(Boolean)
    .filter((p) => !/^(bl|bloc|sc|scara|et|etaj|ap|apart|apartament|cam|interfon)\b\.?/i.test(p))
    .map((p) => p.replace(/\b(bl|bloc|sc|scara|et|etaj|ap|apartament)\.?\s*[\w-]+/gi, '')
      .replace(/\bnr\.?\s*/gi, '').replace(/^str\.\s*/i, 'Strada ').replace(/^(b-dul|bd\.?|bdul\.?)\s*/i, 'Bulevardul ')
      .replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  const out = [parts.join(', ')];
  const noNumber = parts.map((p, i) => (i === 0 ? p.replace(/\s+\d+\w?$/, '') : p)).filter((p) => !/^\d+\w?$/.test(p));
  out.push(noNumber.join(', '));
  if (parts.length > 1) out.push({ approx: parts.slice(1).filter((p) => !/^\d+\w?$/.test(p)).join(', ') });
  out.push(address);
  const seen = new Set();
  return out.map((v) => (typeof v === 'string' ? { q: v } : { q: v.approx, approx: true }))
    .filter((v) => v.q && !seen.has(v.q) && seen.add(v.q));
}

// One request a second to the public geocoder, whoever asks.
let queue = Promise.resolve();
const slot = () => { const mine = queue.then(() => new Promise((r) => setTimeout(r, 1100))); queue = mine; return mine; };

async function search(q) {
  await slot();
  const url = `${GEOCODER}/search?${new URLSearchParams({ q, format: 'jsonv2', limit: '1', countrycodes: 'ro' })}`;
  const res = await fetch(url, { headers: { 'User-Agent': AGENT, 'Accept-Language': 'ro,en' }, signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`geocoder ${res.status}`);
  const [hit] = await res.json();
  return hit ? { lat: Number(hit.lat), lng: Number(hit.lon), found: hit.display_name } : null;
}

/** Where an address is: { lat, lng, found (the map's name for it), approx (only the town was found) }, or null. */
export async function geocode(address) {
  const k = key(address);
  const cached = db.prepare('SELECT lat, lng, found, approx FROM geocodes WHERE key = ?').get(k);
  if (cached) return { ...cached, approx: !!cached.approx };
  for (const v of variants(address)) {
    const hit = await search(v.q);
    if (hit) {
      db.prepare('INSERT OR REPLACE INTO geocodes (key, lat, lng, found, approx) VALUES (?, ?, ?, ?, ?)')
        .run(k, hit.lat, hit.lng, hit.found, v.approx ? 1 : 0);
      return { ...hit, approx: !!v.approx };
    }
  }
  return null;
}

/** Driving distance of each leg between consecutive points, in km. */
async function legs(points) {
  const coords = points.map((p) => `${p.lng.toFixed(6)},${p.lat.toFixed(6)}`).join(';');
  const res = await fetch(`${ROUTER}/route/v1/driving/${coords}?overview=false`, { headers: { 'User-Agent': AGENT }, signal: AbortSignal.timeout(20000) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.code !== 'Ok') throw new Error(`router ${res.status} ${data.code || ''}`);
  return data.routes[0].legs.map((l) => Math.round(l.distance / 100) / 10);
}

/**
 * The road distance through `addresses` in order. Returns { km, legs: [km…], points: [{ address, found, approx }] };
 * an address the map can't find is refused, saying which.
 */
export async function drive(addresses) {
  const points = [];
  try {
    for (const address of addresses) {
      const p = await geocode(address);
      if (!p) throw Object.assign(httpError(400, 'Couldn’t find “{address}” on the map: write it with the street, number and town'), { vars: { address } });
      points.push({ address, ...p });
    }
    const km = points.length > 1 ? await legs(points) : [];
    return { km: Math.round(km.reduce((a, b) => a + b, 0) * 10) / 10, legs: km, points: points.map(({ address, found, approx }) => ({ address, found, approx })) };
  } catch (e) {
    if (e.status) throw e;
    log('warn', 'Kilometre log: the map service failed', { error: e.message });
    throw httpError(422, 'The map service didn’t answer: try again in a minute'); // not 5xx: the message is shown as it is
  }
}
