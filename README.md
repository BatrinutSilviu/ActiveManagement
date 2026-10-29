# Active Management

Financial & logistics admin app for the Active community: events (sport sessions, tournaments, …), their income
and expenses, general overhead costs, and dashboards with profit per event, month and year. Amounts are in RON.

## Stack

- **Backend:** Node.js ≥ 22.13 + Express 5, SQLite via the built-in `node:sqlite` (no native build needed)
- **Frontend:** React 18 + Vite + Recharts
- **Data:** a single file, `data/active.db` (override with `DB_PATH`). Back it up by copying the file.

## Running

```bash
npm install
npm run seed      # optional: demo data + demo admin admin@active.local / active123
npm run dev       # API on :3001, web UI on http://localhost:5173
```

Production (one process serves the API and the built UI):

```bash
npm run build
PORT=3001 npm start          # set COOKIE_SECURE=true when served over HTTPS
```

On a fresh database the first visit asks you to create the first admin. There is no public sign-up: admins
create the other accounts in **Settings → Accounts** and pick a role for each:

- **Viewer** — sees everything (dashboards, events, payouts, stock…), changes nothing.
- **Editor** — manages events, money, stock and settings.
- **Admin** — everything, plus accounts and spreadsheet imports.

Accounts created before roles existed are admins. The server enforces the roles; the UI just hides what you can't use.

## How the numbers are calculated

- **Event profit** = participants × participation fee + other income − organizing costs − benefits offered.
  Expense categories are tagged *organizing* (venue, trainers…) or *benefit* (drinks, food, prizes…);
  products taken from stock always count as benefits, at price × quantity (price frozen when used).
- **Profit split** — default in Settings, overridable per month on the Payouts page:
  - 50% reinvested in the community: ⅓ to the general community fund, ⅔ to the event's sport fund.
  - 20% founders, split equally between people marked as founders.
  - 30% organisers, shared each month in proportion to points: organisers/co-organisers of that month's
    finalized events, plus standalone contributions (partnerships, promo events…).
  - Points come from the points table (Settings → Points table); each event picks an activity from it.
  - Losses are split the same way (they reduce the funds).
- Only **finalized** events count. Events start as *live*; their share shows as "pending" until finalized.
- Transactions not tied to an event are **fund movements**: spending = reinvestment from the general fund
  or a sport fund; income (e.g. donations) is added to that fund directly, without splitting.
- Everything is attributed to the event's date (month). Money is stored as integer bani.
- In the DB, status `planned` = Live and `completed` = Finalized.

## Importing the spreadsheet data

The structured data from the Act!ve sheet lives in `data/import/` and is **not in git** (the repo is public).
Copy it to the server separately, then:

```bash
npm run import:sheet -- data/import/sheet-2026.mjs --check   # compare with the sheet's daily balances only
npm run import:sheet -- data/import/sheet-2026.mjs           # import (needs the first admin account to exist)
```

It creates the founders, any missing sports/categories, the events (past ones finalized, the rest live)
and fund movements as one import that can be undone from the Import page. Running it twice is refused.

## Deploying with Docker + Traefik (management.activetimisoara.ro)

The app ships as a Docker image (`Dockerfile`) and a compose file with Traefik labels (`docker-compose.yml`).
The database lives in the `active-data` Docker volume.

```bash
# 0. DNS: an A record for management.activetimisoara.ro pointing at the server.

# 1. Find your Traefik settings (run on the server)
docker network ls                                  # the network Traefik is attached to, e.g. "traefik" or "proxy"
docker inspect <traefik container> | grep -iE "entrypoints|certresolver|acme"
#    → HTTPS entrypoint name (often "websecure") and certificate resolver name (often "letsencrypt")

# 2. Get the code (one time)
sudo git clone https://github.com/BatrinutSilviu/ActiveManagement.git /opt/active-management
cd /opt/active-management

# 3. If your values differ from the defaults (traefik / websecure / letsencrypt), put them in a .env file:
#    TRAEFIK_NETWORK=proxy
#    TRAEFIK_ENTRYPOINT=websecure
#    TRAEFIK_CERTRESOLVER=letsencrypt

# 4. Build and start
sudo docker compose up -d --build
sudo docker compose ps                               # should become "healthy"
sudo docker compose logs -f                          # Ctrl+C to stop following

# 5. Open https://management.activetimisoara.ro and create the first admin account.

# 6. Import the spreadsheet data (file is not in git — copy it from your computer first)
scp data/import/sheet-2026.mjs you@server:/tmp/      # on your computer
sudo docker exec active-management mkdir -p /data/import
sudo docker cp /tmp/sheet-2026.mjs active-management:/data/import/ && rm /tmp/sheet-2026.mjs
sudo docker exec active-management node --disable-warning=ExperimentalWarning \
  server/scripts/import-sheet.js /data/import/sheet-2026.mjs

# 7. Daily backups to /var/backups/active-management (kept 30 days)
sudo cp deploy/backup-docker.sh /usr/local/bin/active-backup && sudo chmod +x /usr/local/bin/active-backup
echo '30 3 * * * root /usr/local/bin/active-backup' | sudo tee /etc/cron.d/active-backup
```

Updating later: automatic — see "Automatic deployment" below. Manually: `git pull && docker compose up -d --build`.

## Automatic deployment (GitHub Actions)

Every push to `main` runs `.github/workflows/deploy.yml`: build check, then SSH to the server, which runs
`/root/deploy-activemanagement.sh` (a copy is in `deploy/server-deploy.sh`). That script backs up the database
(last 10 kept in `/data/backups` inside the container), pulls, rebuilds, and fails the run if the app isn't healthy.

One-time setup:
1. Create a key for GitHub: `ssh-keygen -t ed25519 -N "" -C github-actions-deploy-activemanagement -f ~/.ssh/github_actions_activemanagement`
2. On the server, append to `/root/.ssh/authorized_keys` (one line, with the contents of the `.pub` file):
   `command="/root/deploy-activemanagement.sh",no-port-forwarding,no-X11-forwarding,no-agent-forwarding,no-pty ssh-ed25519 AAAA… github-actions-deploy-activemanagement`
3. In GitHub → repo → Settings → Secrets and variables → Actions, add `VPS_HOST`, `VPS_USER` (root) and
   `VPS_SSH_KEY` (the private key file's full contents).

## Deploying without Docker (Ubuntu/Debian VPS + Nginx)

Files in `deploy/`: systemd unit, Nginx site, daily backup script, update script. Replace
`admin.example.com` with your domain and point its DNS A record at the server first.

```bash
# 1. Node 22 (needs ≥ 22.13 for the built-in SQLite), Nginx, Certbot, git
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs nginx certbot python3-certbot-nginx git

# 2. App user, code and data folder
sudo useradd --system --create-home --shell /bin/bash active
sudo mkdir -p /opt/active-management /var/lib/active-management
sudo chown active:active /opt/active-management /var/lib/active-management
sudo -u active git clone https://github.com/BatrinutSilviu/ActiveManagement.git /opt/active-management
cd /opt/active-management && sudo -u active npm ci && sudo -u active npm run build

# 3. Service
sudo cp deploy/active-management.service /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now active-management
systemctl status active-management        # should be "active (running)"

# 4. Nginx + HTTPS
sudo cp deploy/nginx-active-management.conf /etc/nginx/sites-available/active-management
sudo nano /etc/nginx/sites-available/active-management      # set server_name
sudo ln -s /etc/nginx/sites-available/active-management /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d admin.example.com

# 5. Open https://admin.example.com and create the first admin account, then import the data
scp data/import/sheet-2026.mjs you@server:/tmp/                 # from your computer
sudo -u active mkdir -p /opt/active-management/data/import
sudo install -o active -m 600 /tmp/sheet-2026.mjs /opt/active-management/data/import/ && rm /tmp/sheet-2026.mjs
cd /opt/active-management && sudo -u active DB_PATH=/var/lib/active-management/active.db npm run import:sheet -- data/import/sheet-2026.mjs

# 6. Daily backups (kept 30 days in /var/lib/active-management/backups)
sudo cp deploy/backup.sh /usr/local/bin/active-backup && sudo chmod +x /usr/local/bin/active-backup
echo '30 3 * * * active /usr/local/bin/active-backup' | sudo tee /etc/cron.d/active-backup
```

Updating later: `sudo -u active /opt/active-management/deploy/update.sh` (give `active` sudo rights for
`systemctl restart active-management`, or run the restart yourself).
Logs: `journalctl -u active-management -f`.
