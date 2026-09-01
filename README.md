# Jax — Competitive Group Ironman hiscores

A scoreboard for the **Jax** RuneScape 3 group ironman team, backed by
Postgres and served by a small Fastify API (see "How the data is produced"
below). Sign in with Discord to claim a roster player and set goals for it,
shared with everyone who visits the page.

One page, no tabs:

- a **metric bar** — group rank (with day-over-day movement), total level,
  total xp, skills at 99, last update, and a countdown to the next one;
- **account standings** — total level, total xp and quest points, each ranked
  highest-first with a share-of-cap progress bar;
- **gains** — levels, xp and quest points gained over a selected Day / Week /
  Month, as either a ranked grid or grouped bar charts (toggle beside the
  title — the choice, and any selected player, is remembered per browser);
- the **skill matrix**: all 29 skills, plus a totals row.

A gain also rides as a green `+N` chip beside the matching figure in Account
Standings and the matrix, for whichever period Gains is currently showing.
On a phone every grid band puts all five players on one line and the matrix
drops to icons-only columns (see Layout notes).

## Why the fetching happens server-side

The RS3 hiscore feed sends **no `Access-Control-Allow-Origin` header**, so a
page can't call it directly from the browser — the request is blocked before
it leaves. The competitive group ladder is worse: it has no JSON API at all,
only a server-rendered Next.js page that has to be scraped.

So all fetching happens **server-side** — an hourly Railway cron service
(`api/jobs/update-job.mjs`) runs the same `scripts/update.mjs` fetch logic
the original GitHub Actions version did, and writes the result into
Postgres instead of committing JSON. A Fastify API (`api/server.mjs`) then
serves both the static site and `GET /api/latest`/`GET /api/history` from
that database, all from one origin — no proxy, no CORS, and (unlike a purely
static site) a "Refresh now" button that can trigger the same fetch on
demand instead of waiting for the next cron tick.

This also buys the thing a live fetch could never give you: **history**.
Gains are computed by diffing snapshots, which only works because they're
stored — every cycle's reading lands in `snapshots`/`player_snapshots`
alongside the current `player_state`.

```
Railway cron (hourly, or a                      Railway web service
"Refresh now"/"Refresh me" click)                (api/server.mjs)
┌───────────────────────────┐    ┌──────────┐    ┌───────────────────┐
│ api/jobs/update-job.mjs    │───▶│ Postgres │◀───│ /api/latest        │◀── assets/js/data.js
│  · hiscore feed ×5         │    │          │    │ /api/history        │
│  · group ladder page       │    │          │    │ /api/quests         │
│  · quest points ×5         │    └──────────┘    │ + the static site   │
└───────────────────────────┘                     └───────────────────┘
```

## Setup

1. **Provision Postgres** and run the schema: `DATABASE_URL=... npm run migrate`.
2. **Load the roster and quest data**:
   ```bash
   DATABASE_URL=... npm run update:db                     # first hiscore fetch, straight into Postgres
   DATABASE_URL=... node quest-data/fetch-quests.mjs --to-db
   ```
   (`npm run backfill` instead if you're migrating from an old checkout
   that still has `data/latest.json`/`data/history/**`/`quest-data/quests.json`
   committed — it loads all three at once, roster included.)
3. **Deploy two Railway services** against the same repo — see
   [`railway.toml`](railway.toml)'s own header comment for exact Start
   Commands and env vars: a **web service** (`node api/server.mjs`) and a
   **cron service** (`node api/jobs/update-job.mjs`, hourly).
4. **Register a Discord OAuth2 app** (Discord Developer Portal → New
   Application → OAuth2) for `DISCORD_CLIENT_ID`/`DISCORD_CLIENT_SECRET`,
   with a redirect URL of `https://<your-domain>/auth/discord/callback`
   matching `DISCORD_REDIRECT_URI`.

Gains stay empty until the cron (or a manual refresh) has run **twice** —
one snapshot cannot be diffed.

## Editing the roster

Everything about the group lives in [`data/players.json`](data/players.json)
— still a plain committed file; only the *hourly hiscore readings* moved to
Postgres, not the roster itself:

```json
{
  "group": {
    "name": "Jax",
    "tagline": "Competitive Group Ironman",
    "hiscoresUrl": "https://rs.runescape.com/hiscores/group-ironman/competitive/2?name=Jax"
  },
  "players": [{ "slug": "jelly-tax", "name": "Jelly Tax", "table": "main" }]
}
```

- `name` must be the exact in-game display name.
- `slug` is the stable key used in history (and, now, in a claimed player's
  `players.discord_id` row) — **do not change it** after tracking starts or
  that player's history/claim is orphaned.
- `table` is `main`, `ironman`, or `hardcore`. All five Jax accounts are on
  `main` — they return 404 on the solo ironman tables, since group ironman
  accounts are not listed there.

Commit the change; the roster is re-synced into `players`/`groups` on the
next update cycle (cron tick or refresh), same as any other update.

## Accounts, goals, and on-demand refresh

Sign in with Discord (top right) and claim one unclaimed roster player — one
account per player, first come first served. Everyone can always read every
player's standings and goals with no session at all; claiming only unlocks
*writing* for that one player:

- **Goals** (a player's own Goals tab) — set/delete skill and quest goals for
  the player you claimed. Shared: anyone who visits that page sees the same
  list, not a private per-browser copy.
- **Refresh** — "Refresh me" (your own player, ~1s) or "Refresh now" (the
  whole group, same cost as a cron tick) triggers `scripts/update.mjs`'s
  fetch immediately instead of waiting for the next hourly tick. Concurrent
  presses join the same in-flight run rather than starting a second one
  (`api/routes/refresh.mjs`'s Postgres advisory lock).

## Local development

```bash
DATABASE_URL=postgresql://localhost/jax npm run migrate   # apply api/migrations/*.sql
DATABASE_URL=... npm run update:db   # fetch live hiscore data into Postgres
npm run stats                        # regenerate stats/<slug>/index.html from data/players.json
DATABASE_URL=... npm run server      # serve the site + API at http://localhost:4173
npm test                             # unit tests; set DATABASE_URL too to include the API integration tests
```

`npm run update` (no `:db`) still exists — it fetches into local,
gitignored `data/latest.json`/`data/history/**` files instead of Postgres,
for inspecting a fetch cycle without touching the real database (same idea
as `fetch-quests.mjs` without `--to-db`). `npm run serve` serves the static
files alone with no API behind them, so the page loads but every fetch
404s — useful only for checking that assets/HTML themselves are intact,
not for an actual working preview; use `npm run server` for that.

The project has **no dependencies and no build step** — plain ES modules, served
exactly as committed.

## How the data is produced

| File | Purpose |
|---|---|
| `scripts/hiscores.mjs` | RS3 hiscore feed client — retries, timeouts, validation |
| `scripts/group-rank.mjs` | Parses the competitive ladder out of the page's RSC payload |
| `scripts/quests.mjs` | Quest points, summed from the RuneMetrics quest list |
| `scripts/snapshots.mjs` | Pure snapshot transforms (build a snapshot, redundancy check, merge) |
| `scripts/update.mjs` | `runUpdate()`/`runPlayerUpdate()` — orchestrates one fetch cycle; `main()` is the local file-sink CLI (`npm run update`) |
| `api/jobs/update-job.mjs` | The Postgres sink over the same `runUpdate()` — the cron entry point and what the refresh routes call |
| `api/store/upserts.mjs` | The upsert SQL shared by the backfill script and the ongoing writer |
| `api/routes/refresh.mjs` | `POST /api/refresh` / `POST /api/players/:slug/refresh` — on-demand, advisory-lock-deduped |
| `scripts/history-store.mjs` | Reads/writes the sharded `data/history/YYYY-MM/DD.json` files — still used by `npm run update`'s local (gitignored) file sink |
| `scripts/fetch-icons.mjs` | One-off: downloads skill icons into `assets/icons/` |
| `scripts/build-stats-pages.mjs` | Writes `stats/<slug>/index.html` from `data/players.json` — see [Per-player stats pages](#per-player-stats-pages) |

Three deliberate robustness choices, true of every fetch cycle whether it's
the hourly cron, a manual `POST /api/refresh`, or a local `npm run update`:

- **A failed player fetch never blanks the board.** The previous reading is
  carried forward and flagged `stale`, and the run aborts rather than writing if
  *every* fetch fails.
- **Each source fails independently.** Hiscores, the group ladder and quest
  points are three separate services; any one going down leaves the other two
  fresh and only its own column marked stale.
- **A snapshot is only recorded when something actually changed.** Identical
  consecutive readings are skipped — though a ladder move counts as a change,
  since other groups passing us shifts our rank without us gaining xp
  (`isRedundant`, `scripts/snapshots.mjs`). `GET /api/history` bounds its own
  query to the last ~33 days, since no gain window looks back further than a
  month.

### Quest points come from a different API

The hiscore feed has no quest-points field — its activities list carries
RuneScore and clue counts only. Quest points are summed from completed entries
in the RuneMetrics quest list instead. RuneMetrics honours the in-game privacy
setting, so a player who hides their profile returns `PROFILE_PRIVATE`; that is
a normal outcome, and their previous total is kept rather than reset to zero.

### Rank and level movement

Each snapshot stores the group's ladder rank **and** a per-skill level vector, so
the page can show day-over-day movement in both. Levels are stored rather than
derived from xp: RS3's elite skills (Invention especially) use their own xp
curve, so reconstructing a level would be wrong for exactly the skills where it
matters most.

A lower rank number is better, so a positive rank delta is a climb; direction is
shown with an arrow and a screen-reader label, never by colour alone. The rank
badge compares against a rolling 24 hours ago.

Gains — and the `+N` chips fed by it, in the matrix and Account Standings —
work differently: each period resets at a fixed calendar boundary rather than
rolling. Day resets at UTC midnight, Week at Monday 00:00 UTC, Month on the
1st. A figure can therefore be small right after a boundary even when history
goes back much further; that is the point, not a bug.

Both the rank badge and the Gains figures need two qualifying snapshots to
show anything — the first run after a schema change writes the relevant field
even when nothing else moved, so an upgrade is never stuck behind a quiet day.

### The group rank is scraped, and scrapers break

`group-rank.mjs` reassembles the `self.__next_f.push([1,"…"])` flight chunks that
Next.js embeds in the page, then reads the paginated group list out of the
result. Rank is `pageNumber × pageSize + index + 1` (`pageNumber` is zero-based).

It matches on the **configured group name**, never on the server's `toHighlight`
flag alone — trusting that flag would silently publish a different group's
numbers if the search ever resolved elsewhere. If Jagex changes the page, the
scrape fails, the last good standing is kept and flagged stale, and the rest of
the site is unaffected.

Note the ladder is ordered by **total level**, not experience, so a group ranked
above Jax can hold considerably less XP.

Only the rank itself is shown on the page (in the metric bar). The scraper still
collects the surrounding groups into `latest.json` as `groupRank.rivals`; nothing
renders it today, but it costs no extra request and is there if a rivals view is
ever wanted again.

## Skill icons

`npm run icons` downloads the 29 skill icons plus the quest-points icon from
runescape.wiki into `assets/icons/`. They are **committed**, not hotlinked, so
the page never depends on a third-party host at render time. Re-run it only when
a new skill ships.

The wiki content-negotiates on `Accept`, so the script asks for `image/png`
explicitly — advertising webp returns webp despite the `.png` URL.

Icons are © Jagex Ltd, sourced via runescape.wiki (CC BY-NC-SA).

## The matrix

Cells show the **level only**. Experience and rank are in the hover tooltip
rather than behind a toggle, so there is one less control to operate and the
table stays readable at 30 rows.

Clicking a player's column heading **sorts by that account**: the skills it leads
first, then its own level high to low. Clicking the same column again resets to
skill order. Each account's totals sit in a pinned **Total** row at the foot of
the table rather than crowding the column headings.

## Per-player stats pages

Each roster player also gets their own page at `/stats/<slug>/` — headline
figures, Day/Week/Month gains, an XP-over-time chart, and the skill grid laid
out the way RS3's own skills tab does it (3 columns × 10 rows, `Attack ·
Constitution · Mining` across the top).

These are **generated static files**, not a server-side or client-side
router: `scripts/build-stats-pages.mjs` writes one real
`stats/<slug>/index.html` per player (`npm run stats`), each a near-copy of
`index.html` pointed at `assets/js/stats.js` instead of `app.js`, and
`@fastify/static` (`api/server.mjs`) just serves whatever's on disk under
`stats/`. They're committed like everything else and regenerated whenever
the roster changes; CI fails if `stats/` drifts from `data/players.json`.

## Layout notes

The matrix is not its own scroll container — it flows with the page, so the
reader scrolls normally and the header pins to the top of the viewport. That is
deliberate and slightly fragile: giving `.matrix-scroll` *any* `overflow` value
other than `visible` turns it back into a scroll container, which displaces the
sticky header instead of pinning it.

Because there is no sideways scroll, the table must always fit. Below 860px the
compact rules drop the skill names (kept in the accessibility tree, clipped
rather than removed, since the icons are decorative) and trim each column to
name and rows-led, so all five players fit on a phone.

## Design notes

Players are colour-coded **teal, red, green, blue, pink** (`SERIES_COLOURS` in
`assets/js/config.js`), and that colour follows the player everywhere on the
page — swatches, bars, chart bars, everything.

The exact hues are not hand-picked — they were tuned with a colour-blindness
validator against the page surface `#0c0a09` until every adjacent-pair gate
passed in this declared order (worst adjacent normal-vision ΔE 20.9). One
limit is worth knowing: red↔green sits in the accepted 6–8 CVD floor band
rather than clearing it outright — legal here only because colour is never the
sole identifier: every player's name sits beside their colour in every view.
Re-run the validator before changing any value or reordering.

Colour is **pinned per account** (`PLAYER_COLOURS`, keyed by slug), not
reassigned by rank — a player keeps their colour as standings shift, rather
than two accounts swapping colours when they cross in rank. A slug with no
entry there falls back to cycling `SERIES_COLOURS` by roster position. Update
`PLAYER_COLOURS` alongside `data/players.json` if the roster changes.

---

Not affiliated with Jagex. RuneScape is a trademark of Jagex Ltd.
