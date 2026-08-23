# Jax — Competitive Group Ironman hiscores

A static scoreboard for the **Jax** RuneScape 3 group ironman team, hosted on GitHub Pages.

One page, no tabs:

- a **metric bar** — group rank (with day-over-day movement), total level, total
  xp, skills at 99, last update;
- **experience gained**, as three adjacent bands — day, week, month — each
  independently ranked highest-first;
- the **skill matrix**: all 29 skills, plus quest points and totals as rows.

Levels gained since yesterday appear as a green `+N` beside the level itself.
On a phone every band puts all five players on one line and the matrix drops to
icons-only columns (see Layout notes).

## Why there is a build step at all

The RS3 hiscore feed sends **no `Access-Control-Allow-Origin` header**, so a page
served from `github.io` cannot call it from the browser — the request is blocked
before it leaves. The competitive group ladder is worse: it has no JSON API at
all, only a server-rendered Next.js page.

So all fetching happens **server-side in GitHub Actions**, which commits the
results as plain JSON. The site then reads its own static files from its own
origin, with no proxy and no CORS involved.

This also buys the thing a live fetch could never give you: **history**. Gains
are computed by diffing snapshots, which only works because they are stored.

```
GitHub Actions (hourly)            repo                          GitHub Pages
┌──────────────────────┐    ┌──────────────────────────┐    ┌────────────────────┐
│ scripts/update.mjs   │───▶│ data/latest.json         │◀───│ assets/js/app.js   │
│  · hiscore feed ×5   │    │ data/history/YYYY-MM/     │    │  (fetch + render)  │
│  · group ladder page │    │   DD.json (one per day)  │    └────────────────────┘
└──────────────────────┘    └──────────────────────────┘
```

## Setup

1. **Enable Pages** — Settings → Pages → Source: *Deploy from a branch*, branch
   `main`, folder `/ (root)`. The site is then at `https://slaytr.github.io/jax/`.
2. **Allow Actions to commit** — Settings → Actions → General → Workflow
   permissions → *Read and write permissions*. Without this the update job
   cannot push its snapshot.
3. **Run the job once** — Actions → *Update hiscores* → *Run workflow*. It also
   runs automatically every hour, on the hour.

Gains stay empty until the job has run **twice** — one snapshot cannot be diffed.

## Editing the roster

Everything about the group lives in [`data/players.json`](data/players.json):

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
- `slug` is the stable key used in history; **do not change it** after tracking
  starts or that player's history is orphaned.
- `table` is `main`, `ironman`, or `hardcore`. All five Jax accounts are on
  `main` — they return 404 on the solo ironman tables, since group ironman
  accounts are not listed there.

Commit the change and the update workflow re-runs automatically.

## Local development

```bash
npm run update   # fetch live data into data/
npm run serve    # preview at http://localhost:4173
npm test         # unit tests, no dependencies
```

The project has **no dependencies and no build step** — plain ES modules, served
exactly as committed.

## How the data is produced

| File | Purpose |
|---|---|
| `scripts/hiscores.mjs` | RS3 hiscore feed client — retries, timeouts, validation |
| `scripts/group-rank.mjs` | Parses the competitive ladder out of the page's RSC payload |
| `scripts/quests.mjs` | Quest points, summed from the RuneMetrics quest list |
| `scripts/snapshots.mjs` | Pure snapshot transforms (build a snapshot, redundancy check, merge) |
| `scripts/history-store.mjs` | Reads/writes the sharded `data/history/YYYY-MM/DD.json` files |
| `scripts/update.mjs` | Orchestrates a run and writes `data/` |
| `scripts/fetch-icons.mjs` | One-off: downloads skill icons into `assets/icons/` |

Three deliberate robustness choices:

- **A failed player fetch never blanks the board.** The previous reading is
  carried forward and flagged `stale`, and the run aborts rather than writing if
  *every* fetch fails.
- **Each source fails independently.** Hiscores, the group ladder and quest
  points are three separate services; any one going down leaves the other two
  fresh and only its own column marked stale.
- **History is sharded by day and deduplicated.** Each UTC day gets its own
  file (`data/history/YYYY-MM/DD.json`), grouped into month folders, so an
  hourly run only ever writes and commits the one file that changed instead of
  rewriting the group's whole tracking history. Identical consecutive readings
  are skipped rather than stored — though a ladder move counts as a change,
  since other groups passing us shifts our rank without us gaining xp. The page
  itself only ever loads the last ~33 days of shards, since no gain window
  looks back further than a month.

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
shown with an arrow and a screen-reader label, never by colour alone. Both the
rank badge and the `+N` level chips appear once two snapshots at least a day
apart carry the relevant field — the first run after a schema change writes it
even when nothing else moved, so the upgrade is never stuck behind a quiet day.

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

## Layout notes

The matrix is not its own scroll container — it flows with the page, so the
reader scrolls normally and the header pins to the top of the viewport. That is
deliberate and slightly fragile: giving `.matrix-scroll` *any* `overflow` value
other than `visible` turns it back into a scroll container, which displaces the
sticky header instead of pinning it.

Because there is no sideways scroll, the table must always fit. Below 860px the
compact rules drop the skill names (kept in the accessibility tree, clipped
rather than removed, since the icons are decorative) and trim each column to
name, total level and rows-led, so all five players fit on a phone.

## Design notes

Players are colour-coded **crimson, blue, green, purple, pink**, assigned
left-to-right down the total-level standings, and that colour follows the player
everywhere else on the page.

The exact hues are not hand-picked — they were tuned with a colour-blindness
validator against the page surface `#0c0a09` until every adjacent-pair gate
passed (worst adjacent normal-vision ΔE 18.4). One limit is worth knowing: across
*all* pairs, blue↔purple measures ΔE 12.5 normal / 5.5 deutan. Five hues
containing both a blue and a purple cannot clear the all-pairs floor — that is a
property of the method, not an oversight. It is acceptable only because colour
is never the sole identifier: every player's name sits beside their colour in
every view. Re-run the validator before changing any value.

Because the assignment follows **rank rather than identity**, two players
swapping total-level places swaps their colours. That is intentional; to pin a
colour per account instead, key `decorate()` in `assets/js/data.js` off `slug`
order rather than level.

---

Not affiliated with Jagex. RuneScape is a trademark of Jagex Ltd.
