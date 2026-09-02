---
description: Mirror production Postgres into your local dev database
---

Sync the local Postgres database with production, via `scripts/sync-from-prod.mjs`.

1. Check that `.env.local` exists at the repo root. If it doesn't, stop and
   tell the user to copy `.env.local.example` to `.env.local` first (and
   run `npm run db:up` + `npm run migrate:local` if they haven't set up
   their local database at all yet — see the README's "Local database"
   section).
2. Check `railway whoami` succeeds. If it fails, stop and tell the user to
   run `railway login` in their own terminal first (this needs a real
   browser, so it can't be run non-interactively).
3. Run `npm run sync:prod` and show the user the per-table row counts it
   prints as it loads each table.
4. If it fails partway through, the local database may be left mid-sync
   (the truncate + reload runs inside one transaction, so a failure rolls
   back cleanly — nothing should be left half-loaded, but confirm this by
   checking `npm run migrate:local` output afterward doesn't complain, and
   report what you see either way).

Don't run this against anything but the user's own local database — it
truncates every synced table in whatever `DATABASE_URL` resolves to
(`.env.local`'s), so never invoke `scripts/sync-from-prod.mjs` with a
production `DATABASE_URL` in the environment.
