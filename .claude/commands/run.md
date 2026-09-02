---
description: Boot the local database (if needed) and run the app against it
---

Get the app running locally end to end — local Postgres up, migrated, app
serving at http://localhost:4173 — starting from whatever state things are
already in, not assuming any of it is set up yet.

1. **`.env.local`** — if it doesn't exist at the repo root, copy it from
   `.env.local.example` (a trivial, reversible file copy — no need to ask
   first).
2. **Local Postgres** — check if it's already reachable: run
   `npm run migrate:local`. If that succeeds (including "No pending
   migrations" — already up to date), skip to step 3.
   If it fails with a connection error:
   - Run `npm run db:up` (`docker compose up -d`).
   - If that itself fails (Docker not installed, or the daemon isn't
     running — check for exactly this), stop and tell the user plainly:
     either start Docker Desktop, or point `.env.local`'s `DATABASE_URL`
     at a different local Postgres they already have running (the README's
     "Local database" section covers both). Don't try to silently install
     or start Docker yourself.
   - Otherwise, retry `npm run migrate:local` a few times a couple of
     seconds apart — a freshly-started Postgres container takes a moment
     before it accepts connections, so an immediate first failure here
     isn't itself a problem.
3. **Check port 4173 isn't already occupied** before starting anything
   new — `curl http://localhost:4173/healthz`:
   - `{"ok":true}` — the app's already running. Don't start a second
     instance (a stray or forgotten one from an earlier session can
     silently squat the port and answer with something that looks like a
     failure otherwise — a bare 404, say — which is *not* the same thing
     as this app actually being broken). Skip straight to step 5 and
     report that it was already up.
   - Anything else that connects (a 404, a different app, a hung
     connection) — something else already has the port. Stop and tell the
     user what's there (Windows: `netstat -ano | grep :4173` for the PID)
     rather than guessing whether it's safe to kill.
   - Connection refused — the port's free; continue.
4. **Start the app** — run `npm run server:local` in the background (it
   doesn't exit on its own).
5. **Verify it's actually serving**, not just that the process launched:
   - `curl http://localhost:4173/healthz` — expect `{"ok":true}`.
   - `curl http://localhost:4173/api/latest` — a 503 "Not initialized yet"
     here is expected on a freshly migrated, never-synced database, not a
     failure; say so, and mention `/sync` as the way to pull in real data
     if the user wants that.
6. Report the URL, that it's running in the background, and how to stop it
   (find the process on port 4173 and stop it — Windows:
   `netstat -ano | grep :4173` then stop that PID).

Don't reach for `npm run server` (no `:local`) here — that one expects
`DATABASE_URL` already in the environment and isn't wired to
`.env.local`; `server:local` is the one that actually targets the local
database this command sets up.
