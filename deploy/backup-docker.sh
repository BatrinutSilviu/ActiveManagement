#!/usr/bin/env bash
# Daily consistent backup of the SQLite database from the Docker container, kept 30 days on the host.
# Install: sudo cp deploy/backup-docker.sh /usr/local/bin/active-backup && sudo chmod +x /usr/local/bin/active-backup
#          echo '30 3 * * * root /usr/local/bin/active-backup' | sudo tee /etc/cron.d/active-backup
set -euo pipefail
CONTAINER=${CONTAINER:-active-management}
DIR=${BACKUP_DIR:-/var/backups/active-management}
NAME="active-$(date +%F).db"
mkdir -p "$DIR"
docker exec "$CONTAINER" sh -c "rm -f /data/$NAME && node -e \"new (require('node:sqlite').DatabaseSync)('/data/active.db').exec(\\\"VACUUM INTO '/data/$NAME'\\\")\"" 2>/dev/null
docker cp "$CONTAINER:/data/$NAME" "$DIR/$NAME"
docker exec "$CONTAINER" rm -f "/data/$NAME"
find "$DIR" -name 'active-*.db' -mtime +30 -delete
echo "Backup written to $DIR/$NAME"
