# RuneScape 3 quest data

`quests.json` — every quest, miniquest and subquest currently on the [RuneScape
Wiki](https://runescape.wiki), with its skill requirements and its
quest-to-quest prerequisite graph. Captured for a future quest planner: check
off finished quests and completed skills, see what's unlocked.

Regenerate with:

```
node quest-data/fetch-quests.mjs
```

It always pulls fresh from the wiki — nothing here is hand-maintained, so
rerun it after a new quest release rather than hand-editing `quests.json`.

## Where this comes from

There's no documented public API for this. `fetch-quests.mjs`'s own header
comment explains how each field was found (by reading the wiki's infobox Lua
modules), but the short version:

- **`infobox_quest`** and **`quest`** — Bucket tables (the wiki's
  Cargo-successor structured-data store), written by the `{{Infobox Quest}}`
  and `{{Quest details}}` templates respectively. Queried over the wiki's
  `action=bucket` API.
- **[Module:Questreq/data](https://runescape.wiki/index.php?title=Module:Questreq/data&action=raw)**
  — a hand-maintained Lua table mapping every quest to what it requires. This
  is the *only* source for the prerequisite graph itself; it isn't derivable
  from anything in a quest's own infobox.

## Schema

One object per quest in the `quests` array:

| Field | Type | Notes |
|---|---|---|
| `name` | string | Display name, e.g. `"While Guthix Sleeps"`. |
| `slug` | string | Lowercase-hyphenated, for URLs/keys. |
| `wikiUrl` | string | Source page. |
| `questType` | `"quest"` \| `"miniquest"` \| `"subquest"` | |
| `subquestOf` | string \| null | Parent quest name, for subquests (e.g. every *Recipe for Disaster* subquest). |
| `difficulty` | string \| null | `Novice`/`Intermediate`/`Experienced`/`Master`/`Grandmaster`/`Special`. |
| `length` | string \| null | Qualitative, e.g. `"Medium"` or `"Short to Medium"` — a range, not always a single step. `null` where the wiki has it as `N/A` (mostly miniquests/subquests). The values seen at last fetch, low to high: `Very Short`, `Short`, `Short to Medium`, `Medium`, `Medium to Long`, `Long`, `Long to Very Long`, `Very Long`, `Very, Very Long`. A consumer sorting by this needs its own ordinal map over exactly those strings — there's nothing numeric to sort on directly. |
| `members` | boolean | |
| `series` | string \| null | Quest series name, e.g. `"Mahjarrat Mysteries"`. |
| `seriesPosition` | number \| null | Position within `series`. |
| `age` | number \| null | Lore age (1–6). |
| `startArea` | string \| null | |
| `combatLevel` | string \| null | Recommended combat range, e.g. `"110-119"`. |
| `releaseDate` / `removalDate` | string \| null | As written on the wiki (not parsed into real dates). A non-null `removalDate` on an otherwise-normal quest is usually a seasonal/holiday quest only available part of the year, not gone for good — see Caveats. |
| `skillRequirements` | `{ skill, level }[]` | Hard requirements only — never the quest's separately-listed *recommended* stats. |
| `questRequirements` | `{ quest, relation }[]` | Prerequisite quests. `relation` is `"required"`, `"partial"` (must be started/partway, not finished), or `"full_completion"` (must be *fully* completed — see below). |
| `recommendedQuests` | `{ quest }[]` | Suggested but not required — only populated for quests where the wiki itself calls this out. |
| `fullCompletionRequirements` | `{ quest, relation }[]` | What it takes to count *this* quest as fully completed, when that's a stricter bar than just finishing it (only ~7 quests have one — mostly sagas). Referenced by other quests' `full_completion` requirements. |
| `miscRequirements` | string[] | Non-quest, non-skill conditions in plain text (an item, an unlock, a reputation threshold, etc.) — free text, not structured. |

Top-level: `fetchedAt`, `source`, `count`, and `unresolvedQuestRefs` (requirement
names with no matching quest record — see Caveats).

## Caveats

- **Either/or requirements read as AND.** A few quests phrase a requirement as
  alternatives (e.g. While Guthix Sleeps' Warriors' Guild entry: Attack 99 *or*
  Strength 99). The wiki's own parsed data has no way to express OR, so both
  show up as separate hard requirements. Worth a manual pass once the planner
  exists; there aren't many of these.
- **A couple of prerequisite names aren't quests.** `unresolvedQuestRefs` in
  the output lists requirement names with no matching quest record — currently
  just two tutorial areas (`Anachronia base camp tutorial`,
  `Player-owned farm tutorial`) that gate a couple of miniquests. Kept as
  plain-text requirement names rather than dropped.
- **`(historical)` pages are excluded.** Demon Slayer, Druidic Ritual, Imp
  Catcher, Rune Mysteries, Shield of Arrav, Wolf Whistle and Death Plateau all
  have an archived wiki page documenting their pre-rework design, sharing the
  same in-game name as the current quest. These aren't a distinct completable
  quest, so they're filtered out rather than showing up as name collisions.
- **A non-null `removalDate` doesn't always mean gone for good.** Most are
  seasonal/holiday quests (Christmas, Easter, Hallowe'en events) that return
  every year but are only completable during their window; a handful are
  genuinely old, permanently-cut F2P quests. This field is captured as-is —
  deciding how to treat it is a planner UI question, not a data one.
- **`quest_type` counts (at last fetch):** 306 quest, 56 miniquest, 23
  subquest.
