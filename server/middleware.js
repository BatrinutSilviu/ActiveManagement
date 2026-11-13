// Express middleware shared by the whole app: request ids and logging, security headers, the same-origin
// check, the API's 404, and the error handler.
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { errorFields, log } from './log.js';

// Every request gets an id (sent back as X-Request-Id, and in error responses) and one log line when it's done.
// The health check every 30 s is only logged when it fails.
export function requestLog(req, res, next) {
  req.id = randomUUID().slice(0, 8);
  res.setHeader('X-Request-Id', req.id);
  const start = process.hrtime.bigint();
  res.on('finish', () => {
    const path = req.originalUrl.split('?')[0];
    if (path === '/api/health' && res.statusCode < 400) return;
    log(res.statusCode >= 500 ? 'error' : 'info', 'request', { id: req.id, method: req.method, path, status: res.statusCode,
      ms: Number((process.hrtime.bigint() - start) / 1000n) / 1000, user: req.user?.id });
  });
  next();
}

/** An /api path that no route answered. */
export const apiNotFound = (req, res) => res.status(404).json({ error: 'Not found' });

// Expected errors (4xx with a message for the user) are returned as they are; anything else is logged with its
// stack and the request it came from. (Express knows an error handler by its four parameters.)
export function errorHandler(err, req, res, next) {
  const status = err.status || err.statusCode || 500;
  if (status >= 500) log('error', 'request failed', { id: req.id, method: req.method, path: req.originalUrl.split('?')[0], ...errorFields(err) });
  if (res.headersSent) return next(err);
  res.status(status).json({ error: status < 500 ? err.message : 'Something went wrong', requestId: req.id });
}

// Security headers for every response: no framing (clickjacking), no MIME sniffing, HTTPS only,
// and a Content-Security-Policy limited to this site (the app loads nothing from elsewhere). The page's
// own small inline script (the theme, set before React loads) is allowed by its hash, read from the
// built index.html when the server starts.
function inlineScriptHashes() {
  try {
    const html = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../client/dist/index.html'), 'utf8');
    return [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)]
      .map((m) => `'sha256-${createHash('sha256').update(m[1]).digest('base64')}'`);
  } catch {
    return []; // no build (dev): Vite serves the page itself
  }
}
const CSP = [
  "default-src 'self'", ["script-src 'self'", ...inlineScriptHashes()].join(' '), "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https:", "font-src 'self' data:", "connect-src 'self'", "frame-ancestors 'none'", "base-uri 'self'",
  "form-action 'self'", "object-src 'none'",
].join('; ');
export function securityHeaders(req, res, next) {
  res.set({
    'Content-Security-Policy': CSP,
    'X-Frame-Options': 'DENY',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  });
  next();
}

// Requests that change something must come from this site's own pages (or carry no Origin at all,
// like the other apps' server-to-server pushes, which bring their own token). Stops cross-site
// requests riding on an admin's cookie, on top of the SameSite=Strict cookie.
export function sameOrigin(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const origin = req.headers.origin;
  if (!origin) return next();
  let host;
  try { host = new URL(origin).host; } catch { host = null; }
  if (host && host === req.headers.host) return next();
  res.status(403).json({ error: 'Cross-site request refused' });
}
