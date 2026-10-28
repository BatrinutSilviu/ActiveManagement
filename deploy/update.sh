#!/usr/bin/env bash
# Pull the latest code, rebuild and restart. Run on the server as the `active` user from /opt/active-management.
set -euo pipefail
cd /opt/active-management
git pull --ff-only
npm ci
npm run build
sudo systemctl restart active-management
echo "Updated to $(git log --oneline -1)"
