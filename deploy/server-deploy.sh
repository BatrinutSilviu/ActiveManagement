#!/bin/bash
# Server-side deploy for Active Management, run by GitHub Actions over SSH.
# Installed on the server as /root/deploy-activemanagement.sh; the GitHub key in
# ~/.ssh/authorized_keys may run only this script (command="..." restriction).
set -euo pipefail
APP_DIR=/root/Projects/ActiveManagement
CONTAINER=active-management
cd "$APP_DIR"

# One deploy at a time: a second push waits for the first to finish.
exec 9>/tmp/deploy-activemanagement.lock
flock 9

echo "==> Backing up the database"
# A consistent copy (VACUUM INTO works while the app runs), checked before it's trusted. Errors are shown,
# not hidden: a deploy without a good backup stops here.
BACKUP_JS='const { DatabaseSync } = require("node:sqlite");
const [src, out] = process.argv.slice(1);
new DatabaseSync(src).prepare("VACUUM INTO ?").run(out);
const check = new DatabaseSync(out).prepare("PRAGMA quick_check").get();
if (Object.values(check)[0] !== "ok") { console.error("The backup failed its integrity check:", check); process.exit(1); }'
if docker ps --format '{{.Names}}' | grep -qx "$CONTAINER"; then
  NAME="pre-deploy-$(date +%Y%m%d-%H%M%S).db"
  docker exec "$CONTAINER" mkdir -p /data/backups
  docker exec "$CONTAINER" node --disable-warning=ExperimentalWarning -e "$BACKUP_JS" /data/active.db "/data/backups/$NAME"
  docker exec "$CONTAINER" sh -c 'ls -1t /data/backups/pre-deploy-*.db | tail -n +11 | xargs -r rm -f'   # keep the last 10
  echo "    /data/backups/$NAME"
fi

echo "==> Updating code"
git pull --ff-only
git log --oneline -1

echo "==> Building and restarting"
docker compose up -d --build

echo "==> Waiting for the app to be healthy"
for i in $(seq 1 30); do
  status=$(docker inspect --format '{{.State.Health.Status}}' "$CONTAINER" 2>/dev/null || echo missing)
  [ "$status" = healthy ] && { echo "    healthy"; docker image prune -f >/dev/null; echo "==> Deployed"; exit 0; }
  sleep 3
done
echo "!! The app did not become healthy — recent logs:" >&2
docker logs --tail 40 "$CONTAINER" >&2
exit 1
