// The app: an Express server for the API (every route under /api, in routes/) and the built frontend.
import { db } from './db.js'; // first: opens the database and brings its schema up to date
import express from 'express';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { errorFields, log } from './log.js';
import { startBackupSchedule } from './backup.js';
import { checkRole, requireAuth } from './auth.js';
import { startPointsSchedule } from './finance.js';
import { apiNotFound, errorHandler, requestLog } from './middleware.js';
import { router as health } from './routes/health.js';
import { router as auth } from './routes/auth.js';
import { router as integrations } from './routes/integrations.js';
import { router as users } from './routes/users.js';
import { router as settings } from './routes/settings.js';
import { router as sports } from './routes/sports.js';
import { router as categories } from './routes/categories.js';
import { router as people } from './routes/people.js';
import { router as discounts } from './routes/discounts.js';
import { router as stock } from './routes/stock.js';
import { router as equipment } from './routes/equipment.js';
import { router as events } from './routes/events.js';
import { router as eventTasks } from './routes/eventTasks.js';
import { router as eventAttendees } from './routes/eventAttendees.js';
import { router as eventStock } from './routes/eventStock.js';
import { router as transactions } from './routes/transactions.js';
import { router as activities } from './routes/activities.js';
import { router as funds } from './routes/funds.js';
import { router as payouts } from './routes/payouts.js';
import { router as stats } from './routes/stats.js';
import { router as imports } from './routes/imports.js';
import { router as vouchers } from './routes/vouchers.js';
import { router as partners } from './routes/partners.js';
import { router as backups } from './routes/backups.js';
import { router as exportRoutes } from './routes/export.js';

const app = express();
// Trust the reverse proxy in front (Nginx on loopback, or Traefik on the private Docker network).
app.set('trust proxy', ['loopback', 'uniquelocal']);
app.use(requestLog);
app.use(express.json({ limit: '10mb' }));

// The route modules use full paths (e.g. '/events/:id'), so the role check below sees the same paths it always did.
const api = express.Router();
app.use('/api', api);

// Open to anyone: the health check, signing in, and the other apps' pushes (which bring their own token).
api.use(health, auth, integrations);

// Everything else needs a signed-in account, with a role allowed to do it.
api.use(requireAuth, checkRole);
api.use(users, settings, sports, categories, people, discounts, stock, equipment, events, eventTasks, eventAttendees, eventStock,
  transactions, activities, funds, payouts, stats, imports, vouchers, partners, backups, exportRoutes);
api.use(apiNotFound);

const dist = resolve(dirname(fileURLToPath(import.meta.url)), '../client/dist');
if (existsSync(dist)) {
  app.use(express.static(dist));
  app.get('/{*splat}', (req, res) => res.sendFile(resolve(dist, 'index.html')));
}

// Last, so it also catches errors from the static files.
app.use(errorHandler);

const port = Number(process.env.PORT || 3001);
const host = process.env.HOST || '0.0.0.0'; // use 127.0.0.1 behind a reverse proxy
const server = app.listen(port, host, () => log('info', `Active Management on http://${host}:${port}`, { db: process.env.DB_PATH || 'data/active.db' }));
startBackupSchedule();
startPointsSchedule();

// Docker sends SIGTERM on every redeploy: stop taking requests, let the ones under way finish, then close the
// database (which checkpoints the WAL into the main file) before exiting — instead of being killed after 10 s.
let stopping = false;
function shutdown(signal, code = 0) {
  if (stopping) return;
  stopping = true;
  log('info', 'Shutting down', { signal });
  const done = () => {
    try { db.close(); } catch (e) { log('error', 'Closing the database failed', errorFields(e)); }
    process.exit(code);
  };
  server.close(done);
  server.closeIdleConnections();
  setTimeout(() => { server.closeAllConnections(); done(); }, 5000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
// Never die without a word. A thrown error nobody caught leaves the process in an unknown state: log it and
// exit (Docker restarts the app); the database is fine, since every write is in a transaction.
process.on('uncaughtException', (e) => { log('error', 'Uncaught exception', errorFields(e)); shutdown('uncaughtException', 1); });
process.on('unhandledRejection', (e) => log('error', 'Unhandled promise rejection', errorFields(e)));
