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
2. Turn the text above into one clean changelog line (or a few short ones — see
   step 3). Tidy grammar/punctuation but don't editorialize or add anything the
   user didn't say; if what they gave you is already a clean sentence, use it
   as-is. If they described several distinct changes in one go, keep each as
   its own line rather than mashing them into one run-on sentence.
3. Get the current instant and today's NZT calendar date in one go:
   `node -e "const n=new Date();console.log(n.toISOString());console.log(new Intl.DateTimeFormat('en-CA',{timeZone:'Pacific/Auckland',year:'numeric',month:'2-digit',day:'2-digit'}).format(n))"`
   (the `en-CA` locale is just a trick to get `YYYY-MM-DD` straight out of `Intl`).
   - If `changelog.json`'s first (newest) entry's own `date`, reformatted the
     same way (swap `new Date()` above for `new Date('<that entry's date>')`),
     is the same NZT calendar day as today's, append the new line(s) to that
     entry's own `text` joined with `\n` (`.changelog-text`'s own
     `white-space: pre-line` renders each `\n` as its own line under the one
     date heading — don't create a second entry for the same NZT day, and
     don't touch that entry's own `date` — it stays the timestamp of its
     first line, not the latest one).
   - Otherwise, unshift a brand new `{ date: <the ISO instant from above>, text }`
     entry onto the front of the array.
4. Write the file back with 2-space indentation, matching its existing style,
   and a trailing newline.
5. Show the user the entry as saved (the full `text` of whatever date got
   touched, plus how it'll render — e.g. "5 Sep, 2:32 pm" NZT) and remind them
   it needs `npm run build` (or whatever their normal deploy is) before it
   shows up live — this file is bundled at build time like quest-guides.json,
   not served live from `/assets/`.

Don't rebuild or deploy yourself unless the user asks — just write the file.
