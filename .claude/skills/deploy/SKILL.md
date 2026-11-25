---
name: deploy
description: Push the current work to main and watch the GitHub Actions deploy to the VPS (Active's management app and the Kidokinetiq copy) until it finishes; if the server step fails, run the deploy script on the VPS directly. Use when the user says "push", "deploy", "ship it" or "put it live" in this project.
---

# Deploy ActiveManagement

Every push to `main` deploys automatically: `.github/workflows/deploy.yml` builds the app, then SSHes
into the VPS and runs `/root/deploy-activemanagement.sh`. That script deploys **both copies** of the app
on the server, one after the other, with `/root/deploy-app.sh` (= `deploy/server-deploy.sh`):

1. Active: `/root/Projects/ActiveManagement`, container `active-management` (management.activetimisoara.ro)
2. Kidokinetiq: `/root/Projects/kidokinetiq`, container `kidokinetiq` (admin.kidokinetiq.ro)

For each copy it backs up the SQLite database (a checked `VACUUM INTO` copy in `/data/backups`, last 10
kept), `git pull --ff-only`, `docker compose up -d --build`, then waits for the container to be healthy.
Schema changes run on their own when the server starts, so there's nothing to run by hand.

Report in plain words (is it live or not, and what to do), not in CI jargon.

## Steps

1. **Commit.** `git fetch -q`, then `git status -sb`.
   - If there are uncommitted code changes, first run the two passes from CLAUDE.md ("Before every
     commit"): the `simplify` skill, then the `code-review` skill with args `high --fix`. Let them
     apply their fixes.
   - Then stage the changes and commit with a message that says what changed for the people using
     the app (the style of `git log`: one long sentence, no prefix), ending with the attribution lines
     from the system reminder.
   - Never commit `.env`, `data/` or other secrets.

2. **Catch up with origin.** If the branch is behind `origin/main`, `git rebase origin/main`. On a
   conflict, read both sides and re-apply the local change on top of the new upstream code; don't drop
   either side.

3. **Push.** `timeout 90 git push`. If it's rejected because origin moved, go back to step 2.

4. **Watch the deploy** in the background (`run_in_background: true`) so the user isn't blocked, and
   tell them it's running. The repo is public, so the API needs no login:

   ```bash
   sleep 20; sha=$(git rev-parse HEAD); for i in $(seq 1 55); do
     r=$(curl -s "https://api.github.com/repos/BatrinutSilviu/ActiveManagement/actions/runs?head_sha=$sha" \
       | python3 -c "import sys,json;w=json.load(sys.stdin)['workflow_runs'];print(w[0]['status'],w[0]['conclusion'],w[0]['id'],w[0]['html_url']) if w else print('none')" 2>/dev/null)
     case "$r" in completed*) echo "$r"; exit 0;; esac; sleep 30
   done; echo "still: $r"
   ```

   To see which step failed (public too):
   `curl -s https://api.github.com/repos/BatrinutSilviu/ActiveManagement/actions/runs/<id>/jobs | python3 -c "import sys,json;[print(s['name'],s['conclusion']) for j in json.load(sys.stdin)['jobs'] for s in j['steps']]"`

5. **Report.**
   - `completed success`: tell the user it's live on both sites and to reload the page they were on.
   - Failed at the **build** (npm ci / build / lint): it's in the code. Fix it, commit, push, watch again.
   - Failed at **"Deploy over SSH"**: the VPS often resets SSH connections from GitHub. The user has
     allowed running the deploy on the server directly (see the `vps` skill for the connection):
     `ssh -o BatchMode=yes active-vps '/root/deploy-activemanagement.sh > /root/deploy-activemanagement-last.log 2>&1; echo exit=$?; tail -30 /root/deploy-activemanagement-last.log'`
     If the connection itself is reset, retry it a few times. If the script fails, read its output: a
     failed backup, `git pull --ff-only` refused (a change made by hand on the server), a build error,
     or a container that never became healthy (its last logs are printed). Report that to the user.

## Don't

- Don't force-push, and never rewrite commits that are already on `origin/main`.
- Don't deploy only one of the two copies by hand unless the user asks: they run the same code.
