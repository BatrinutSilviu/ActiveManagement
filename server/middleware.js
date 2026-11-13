// Express middleware shared by the whole app: request ids and logging, the API's 404, and the error handler.
import { randomUUID } from 'node:crypto';
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
