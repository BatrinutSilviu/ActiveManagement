#!/usr/bin/env bash
# Daily consistent backup of the SQLite database from the Docker container, kept 30 days on the host.
# Install: sudo cp deploy/backup-docker.sh /usr/local/bin/active-backup && sudo chmod +x /usr/local/bin/active-backup
#          echo '30 3 * * * root /usr/local/bin/active-backup' | sudo tee /etc/cron.d/active-backup
set -euo pipefail
CONTAINER=${CONTAINER:-active-management}
DIR=${BACKUP_DIR:-/var/backups/active-management}
NAME="active-$(date +%F).db"
mkdir -p "$DIR"
# A consistent copy (VACUUM INTO works while the app runs), checked before it's trusted. Errors are shown,
# not hidden: a backup that fails makes this script fail with the reason.
BACKUP_JS='const { DatabaseSync } = require("node:sqlite");
const [src, out] = process.argv.slice(1);
new DatabaseSync(src).prepare("VACUUM INTO ?").run(out);
const check = new DatabaseSync(out).prepare("PRAGMA quick_check").get();
if (Object.values(check)[0] !== "ok") { console.error("The backup failed its integrity check:", check); process.exit(1); }'
docker exec "$CONTAINER" rm -f "/data/$NAME"
docker exec "$CONTAINER" node --disable-warning=ExperimentalWarning -e "$BACKUP_JS" /data/active.db "/data/$NAME"
docker cp "$CONTAINER:/data/$NAME" "$DIR/$NAME"
docker exec "$CONTAINER" rm -f "/data/$NAME"
find "$DIR" -name 'active-*.db' -mtime +30 -delete
echo "Backup written to $DIR/$NAME"
