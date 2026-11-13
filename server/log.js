// One JSON object per line on stdout: Docker keeps the container's output (archived daily on the server and
// deleted after 30 days), so the app never writes log files of its own.
export function log(level, msg, fields = {}) {
  process.stdout.write(`${JSON.stringify({ t: new Date().toISOString(), level, msg, ...fields })}\n`);
}

/** The fields to log for an error: its message and stack. */
export const errorFields = (e) => ({ error: e?.message ?? String(e), stack: e?.stack });
