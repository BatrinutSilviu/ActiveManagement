---
name: deploy
description: Push the current work to main and let the GitHub Actions deploy put it on the VPS (Claude doesn't watch it). Only if the user says it isn't live: check the run, and if the server step failed, run the deploy script on the VPS directly. Use when the user says "push", "deploy", "ship it" or "put it live" in this project.
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
   - If there are uncommitted code changes, first run the passes from CLAUDE.md ("Before every
     commit"): the `simplify` skill, the `code-review` skill with args `high --fix`, then the
     `security-review` skill (skipped for purely visual changes). Let them apply their fixes. A hook
     runs the tests / type check / lint on `git commit` and blocks it if they fail: fix and commit again.
   - Then stage the changes and commit with a message that says what changed for the people using
     the app (the style of `git log`: one long sentence, no prefix), ending with the attribution lines
     from the system reminder.
   - Never commit `.env`, `data/` or other secrets.

2. **Catch up with origin.** If the branch is behind `origin/main`, `git rebase origin/main`. On a
   conflict, read both sides and re-apply the local change on top of the new upstream code; don't drop
   either side.

3. **Push.** `timeout 90 git push`. If it's rejected because origin moved, go back to step 2.

4. **Tell the user it's deploying, and stop.** Say it'll be live on both sites (Active and Kidokinetiq)
   in a few minutes and to reload the page then. Don't watch the GitHub Actions run or poll its API, not even in
   the background: the user asked not to (it was slow, noisy and hit GitHub's rate limit).

## Only if the user says it isn't live (or asks how the deploy went)

Look at the run once (the repo is public, so the API needs no login):

```bash
curl -s "https://api.github.com/repos/BatrinutSilviu/ActiveManagement/actions/runs?head_sha=$(git rev-parse HEAD)" \
  | python3 -c "import sys,json;w=json.load(sys.stdin)['workflow_runs'];print(w[0]['status'],w[0]['conclusion'],w[0]['id'],w[0]['html_url']) if w else print('none')"
```

Which step failed: `curl -s https://api.github.com/repos/BatrinutSilviu/ActiveManagement/actions/runs/<id>/jobs | python3 -c "import sys,json;[print(s['name'],s['conclusion']) for j in json.load(sys.stdin)['jobs'] for s in j['steps']]"`

- Failed at the **build** (npm ci / build / lint): it's in the code. Fix it, commit and push.
- Failed at **"Deploy over SSH"**: the VPS often resets SSH connections from GitHub. The user has
  allowed running the deploy on the server directly (see the `vps` skill for the connection):
  `ssh -o BatchMode=yes active-vps '/root/deploy-activemanagement.sh > /root/deploy-activemanagement-last.log 2>&1; echo exit=$?; tail -30 /root/deploy-activemanagement-last.log'`
  If the connection itself is reset, retry it a few times. If the script fails, read its output: a
  failed backup, `git pull --ff-only` refused (a change made by hand on the server), a build error,
  or a container that never became healthy (its last logs are printed). Report that to the user.

## Don't

- Don't force-push, and never rewrite commits that are already on `origin/main`.
- Don't deploy only one of the two copies by hand unless the user asks: they run the same code.
