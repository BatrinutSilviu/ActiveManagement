#!/usr/bin/env bash
# Daily consistent backup of the SQLite database, keeping the last 30 days.
# Install: sudo cp deploy/backup.sh /usr/local/bin/active-backup && sudo chmod +x /usr/local/bin/active-backup
#          echo '30 3 * * * active /usr/local/bin/active-backup' | sudo tee /etc/cron.d/active-backup
set -euo pipefail
DB=${DB_PATH:-/var/lib/active-management/active.db}
DIR=${BACKUP_DIR:-/var/lib/active-management/backups}
mkdir -p "$DIR"
OUT="$DIR/active-$(date +%F).db"
rm -f "$OUT"
node -e "new (require('node:sqlite').DatabaseSync)(process.argv[1]).exec(\"VACUUM INTO '\" + process.argv[2] + \"'\")" "$DB" "$OUT" 2>/dev/null
find "$DIR" -name 'active-*.db' -mtime +30 -delete
echo "Backup written to $OUT"
