// Small helpers shared by the routes: errors that become a JSON response with their status (see the error
// handler in middleware.js), and checks of what a request sent.

/** An error the user sees as it is: `status` is the HTTP status, `message` the text shown in the app. */
export const httpError = (status, message) => Object.assign(new Error(message), { status });

/** Refuses the request (400, with `msg`) unless `cond` holds. */
export const need = (cond, msg) => { if (!cond) throw httpError(400, msg); };

export const isDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
export const isMonth = (s) => /^\d{4}-\d{2}$/.test(s || '');
export const idParam = (req) => Number(req.params.id);

/** Today as YYYY-MM-DD (UTC, like the dates the database writes). */
export const today = () => new Date().toISOString().slice(0, 10);
