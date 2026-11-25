---
name: vps
description: Run commands on the production VPS over SSH for the management app (Active and the Kidokinetiq copy) — look at app or deploy logs, check containers, disk space, query the live SQLite database, restart the app. Use when something has to be checked or done on the live server (a failed deploy, an error only production shows, a data fix in production, changing a live business setting).
---

# Working on the ActiveManagement VPS

The server is reached through the SSH alias **`active-vps`**, defined in the user's own `~/.ssh/config`
(host, user and key live there only: this repo is public, so never write the server's address, user
names, keys or any `.env` values into the repo, a commit or a skill file).

If `ssh active-vps` fails with "Could not resolve hostname active-vps", the alias isn't set up on this
machine: ask the user for the server address and which key to use, and add to `~/.ssh/config`:

```
Host active-vps
  HostName <server IP or hostname>
  User root
  IdentityFile ~/.ssh/<personal key>
  IdentitiesOnly yes
```

Don't use the GitHub Actions deploy key: it's restricted to running the deploy script and nothing else.

## Running commands

Always non-interactive, one command per call, with a timeout:

```bash
ssh -o BatchMode=yes -o ConnectTimeout=10 active-vps '<command>'
```

No interactive programs (`vim`, `top`, `docker exec -it`): use `cat`, `tail`, `docker exec` without `-it`.

Two copies of this app run on the server, from the same code:

| Copy | Folder | Container | Site |
|---|---|---|---|
| Active | `/root/Projects/ActiveManagement` | `active-management` | management.activetimisoara.ro |
| Kidokinetiq | `/root/Projects/kidokinetiq` | `kidokinetiq` | admin.kidokinetiq.ro |

Each has its own SQLite database at `/data/active.db` inside its container (a Docker volume) and its own
`.env`. Always say which copy you mean, and touch only the one the task is about.

**The same server runs the user's other apps** (padel, hikes, dani-padel) and a shared Traefik. Only
touch these two containers, their files and databases; never restart Traefik, Docker itself or the
server, and never run `docker system prune` or anything server-wide without asking.

### How the deploy works on the server

`/root/deploy-activemanagement.sh` runs `/root/deploy-app.sh` (= `deploy/server-deploy.sh`) for Active,
then Kidokinetiq. For each: a lock (two deploys wait for each other), a checked database backup into
`/data/backups/pre-deploy-*.db` (a failed backup stops the deploy), `git pull --ff-only`,
`docker compose up -d --build`, then up to 90 s for the container to become healthy (its last logs are
printed if not). So a failed deploy is one of: the backup, the pull (a change made by hand on the
server), the build, or the start — check in that order.

Useful read-only commands:

| What | Command |
|---|---|
| Containers and health | `docker ps --filter name=active-management --filter name=kidokinetiq` |
| App logs (recent) | `docker logs --tail 200 active-management` (or `kidokinetiq`) |
| What's deployed | `cd /root/Projects/ActiveManagement && git log --oneline -5 && git status -sb` |
| Last manual deploy's output | `tail -50 /root/deploy-activemanagement-last.log` |
| Disk space | `df -h / && docker system df` |
| A database query (read-only) | `docker exec -w /app active-management node --disable-warning=ExperimentalWarning -e 'const {DatabaseSync}=require("node:sqlite");console.table(new DatabaseSync("/data/active.db",{readOnly:true}).prepare("SELECT …").all())'` |

Changing a live business setting: run `readBusiness`/`setBusiness` inside the container
(`docker exec -w /app <container> node …`), then `docker restart <container>` (the app caches it). Warn
the user that a Settings → Business page left open saves its old copy over the change.

## Ask the user before anything that changes the server

Reading (logs, `ps`, `SELECT`, `git log`, `df`) is fine without asking. Running the deploy script after a
failed GitHub deploy is also allowed (see the `deploy` skill). Ask first, saying exactly what will
happen, before:

- restarting, stopping or rebuilding containers
- any database write (`UPDATE`, `DELETE`, `INSERT`, `ALTER`) — and take a backup first with the
  server's backup tool: `/usr/local/bin/active-backup pre-deploy management` (or `kidokinetiq`); it
  lands in `/var/backups/active/pre-deploy/<app>/`. **Never run `active-backup` without arguments**:
  that's the nightly backup, and rerunning it rewrites today's files after they were uploaded off-site,
  which breaks the off-site copy.
- editing files on the server (`.env`, compose files, the deploy scripts), `git` changes there
- deleting anything, `docker system prune`, installing or upgrading packages

Never, even if asked casually (confirm twice, explaining the consequence): `docker compose down -v`,
`docker volume rm`, deleting `/data/active.db` or the volumes `activemanagement_active-data` /
`kidokinetiq_active-data` — that's the production data.

## Privacy

- Don't print `.env` or secrets into the conversation. To check a variable is set, use
  `grep -c '^NAME=' .env` or show only the name, not the value.
- Production data is real people's data (members, and Kidokinetiq's patients — health data): query only
  the columns needed, and don't copy personal data into commits, files in the repo or messages outside
  this conversation.
