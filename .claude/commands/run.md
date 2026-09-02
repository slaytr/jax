---
description: Run the app locally against your local Postgres database
---

Launch the app locally (`npm run server:local`, served at
http://localhost:4173) and confirm it's actually working, not just that
the process started.

1. Check that `.env.local` exists at the repo root. If it doesn't, stop
   and tell the user to set up their local database first — copy
   `.env.local.example` to `.env.local`, then `npm run db:up` and
   `npm run migrate:local` (see the README's "Local database" section).
   `/sync` afterward if they want real data instead of an empty schema.
2. Run `npm run migrate:local` — cheap and idempotent (prints "No pending
   migrations" if already current), and doubles as a connectivity check
   before starting the server. If it fails, the local database isn't
   reachable; report that rather than trying to start the server anyway.
3. Start `npm run server:local` in the background (it doesn't exit on its
   own).
4. Confirm it's actually serving, not just that the process launched:
   - `curl http://localhost:4173/healthz` — expect `{"ok":true}`.
   - `curl http://localhost:4173/api/latest` — if the local database has
     no roster/state yet (a fresh migrate with no `/sync` run), this
     responds with a 503 "Not initialized yet" — that's a legitimate,
     expected state, not a failure; say so rather than treating it as
     broken.
5. Report the URL and that it's running in the background, plus how to
   stop it (find the process on port 4173 and stop it — Windows:
   `netstat -ano | grep :4173` then stop that PID).

Don't reach for `npm run server` (no `:local`) here — that one expects
`DATABASE_URL` already in the environment and isn't wired to
`.env.local`; `server:local` is the one that actually targets the local
database this command is about.
