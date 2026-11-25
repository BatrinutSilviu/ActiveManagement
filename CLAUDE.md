# ActiveManagement

Management app for the Active community (people, events, money, points). The same code also runs as
separate copies for other businesses (Kidokinetiq: a physical-therapy practice). See README.md.

## Push automatically

When a change is finished (and committed after the two passes below), push it and watch the deploy
with the `deploy` skill, without asking: the user wants every finished change live.

## Before every commit: clean up, then review

Every commit Claude makes in this repo goes through two passes over the uncommitted changes first,
in this order, without asking:

1. `/simplify`: reuse existing helpers, remove duplication and dead code, make it efficient (no
   extra queries or re-renders). It applies its own fixes.
2. `/code-review high --fix`: finds bugs (wrong logic, missing role/auth checks on API routes,
   behaviour that leaks between business types, money and points calculations, broken edge cases)
   and applies the fixes.

Then commit. In the final message, list what the two passes changed or found (one line each, plain
words). If a finding needs the user's decision, ask instead of guessing. Skip both only for commits
with no code (an empty redeploy commit, docs or skill files only).

## Skills

- `/deploy`: push to main and watch the deploy (Active + Kidokinetiq).
- `/vps`: work on the production server over SSH.
