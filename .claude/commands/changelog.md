---
description: Add an entry to the site's own changelog (Home page, next to Weekly highlights)
---

Add a changelog entry from what the user typed after the command:

$ARGUMENTS

1. Read `assets/js/changelog.json` — an array of `{ "date": "<ISO instant>", "text": "..." }`
   objects, newest first. `date` is a real UTC instant (when the entry was
   written), not a bare calendar date — HighlightsRow.vue's own `changelogDate`
   formats it in NZT (`Intl`'s `Pacific/Auckland` zone, which handles the
   NZST/NZDT switch on its own) for display in the Home page's "Changelog"
   column (third panel next to Weekly highlights and the Activity feed).
   Nothing else touches this file.
2. Turn the text above into one clean changelog line (or a few short ones if
   they described several distinct changes in one go — keep each as its own
   line rather than mashing them into one run-on sentence, but still all
   under the one new entry from step 3, not one entry per line). Tidy
   grammar/punctuation but don't editorialize or add anything the user
   didn't say; if what they gave you is already a clean sentence, use it
   as-is.
3. Get the current instant: `node -e "console.log(new Date().toISOString())"`.
   Always unshift a brand new `{ date: <that instant>, text }` entry onto the
   front of the array — every command run is its own entry with its own
   timestamp, even if one already exists for today's NZT date. Never append
   to, merge into, or edit an existing entry's `date` or `text`.
4. Write the file back with 2-space indentation, matching its existing style,
   and a trailing newline.
5. Show the user the entry as saved (its `text`, plus how it'll render — e.g.
   "5 Sep, 2:32 pm" NZT) and remind them it needs `npm run build` (or
   whatever their normal deploy is) before it shows up live — this file is
   bundled at build time like quest-guides.json, not served live from
   `/assets/`.

Don't rebuild or deploy yourself unless the user asks — just write the file.
