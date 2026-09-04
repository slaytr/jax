---
description: Apply any pending database migrations directly to production
---

Manually apply whatever's in `api/migrations/*.sql` that hasn't been
recorded in production's own `schema_migrations` table yet — the same
one-off fix used to unblock production after `002_latest_activity.sql`
shipped without ever being applied (see `api/migrate.mjs`'s own doc
comment for why this normally isn't needed any more: `api/server.mjs` and
`api/jobs/update-job.mjs` both call `runMigrations()` at their own boot
now, before doing anything schema-dependent). Reach for this command when
you want a migration applied *before* the next deploy — otherwise a
regular push to `feat/postgres-api` already covers it.

1. Check `railway whoami` succeeds. If it fails, stop and tell the user to
   run `railway login` in their own terminal first (needs a real browser,
   can't run non-interactively).
2. Run `railway status` and confirm it shows `Service: web` in the
   `production` environment. If it shows something else (a different
   service, or a non-production environment), stop and tell the user what
   it's actually linked to instead — don't run this against whatever
   that happens to be.
3. Run `railway ssh --service web -- node api/migrate.mjs` and show the
   user its output verbatim (which migration(s) it applied, or "No
   pending migrations." if there was nothing to do).
4. If it fails, report the error as-is rather than retrying — don't chase
   it down a rabbit hole (e.g. re-running repeatedly, or trying to work
   around an auth failure by broadening scope/tokens on your own).

This runs `node api/migrate.mjs` inside the live `web` service's own
container (`railway ssh`, not a plain `railway run` — that only forwards
env vars locally, it doesn't reach `DATABASE_URL`'s
`postgres.railway.internal`, Railway's private-network hostname).
`api/migrate.mjs` is safe to run any number of times: it tracks what's
already applied and only ever runs what's new, each inside its own
transaction.
