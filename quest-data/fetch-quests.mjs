/**
 * Pulls RuneScape 3's full quest list — skill requirements and the
 * quest-to-quest prerequisite graph — from the RuneScape Wiki and writes
 * quests.json. Rerun this whenever new quests ship; it always reflects
 * whatever the wiki currently has, not a point-in-time snapshot baked into
 * this file.
 *
 * Three sources, all discovered by reading the wiki's own infobox Lua
 * modules (Module:Infobox_Quest, Module:QuestDetails, Module:Questreq) —
 * there's no documented public API for this site's structured data:
 *
 * - the `infobox_quest` Bucket table (the wiki's Cargo-successor structured
 *   store) — one row per quest/miniquest/subquest, written by
 *   {{Infobox Quest}}, for name/difficulty/members/series/etc.
 * - the `quest` Bucket table, written by {{Quest details}} — its
 *   `requirement_skill` / `requirement_skill_level` fields are pre-parsed
 *   from the `{{Skillreq}}` templates in each quest's Requirements list.
 * - Module:Questreq/data — a hand-maintained Lua table mapping every quest
 *   to the quests it requires. This is the *only* source for the
 *   prerequisite graph: it is not derivable from any infobox field, and is
 *   maintained by wiki editors independent of each quest's own page.
 *
 * Known limitations (see README.md for the full writeup):
 * - An "either/or" requirement (e.g. Warriors' Guild entry: Attack 99 OR
 *   Strength 99) is extracted as two separate skill requirements, ANDed —
 *   the source data has no way to express OR.
 * - A handful of Questreq/data prerequisite names are tutorials, lore
 *   activities, or "wish list" sub-pages with no quest record of their own
 *   (see unresolvedQuestRefs in the output) — they're kept as plain-text
 *   requirement names rather than dropped.
 */

const API = 'https://runescape.wiki/api.php';
const WIKI_MODULE = (title) => `https://runescape.wiki/index.php?title=${encodeURIComponent(title)}&action=raw`;

async function bucketQuery(table, fields) {
  const query = `bucket('${table}').select(${fields.map((f) => `'${f}'`).join(',')}).limit(2000).run()`;
  const url = `${API}?action=bucket&format=json&query=${encodeURIComponent(query)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Bucket query failed (${res.status}): ${table}`);
  const body = await res.json();
  if (body.error) throw new Error(`Bucket query error on ${table}: ${body.error}`);
  return body.bucket ?? [];
}

/** Module:Questreq/data is a plain `["Quest Name"] = {"Req A", "Req B"},`
 * Lua table — every value is a quoted-string array, so a small regex walk
 * reads it without a real Lua parser. */
function parseQuestreqData(luaSource) {
  const entryRe = /\["((?:[^"\\]|\\.)*)"\]\s*=\s*\{([^}]*)\}/gs;
  const stringRe = /"((?:[^"\\]|\\.)*)"/g;
  const out = {};
  let entryMatch;
  while ((entryMatch = entryRe.exec(luaSource))) {
    const values = [];
    let stringMatch;
    while ((stringMatch = stringRe.exec(entryMatch[2]))) values.push(stringMatch[1]);
    out[entryMatch[1]] = values;
  }
  return out;
}

/** `[[Target|Text]]` -> "Text", `[[Target]]` -> "Target" — Misc: requirement
 * strings carry raw wikitext links; this is about as far as unwrapping
 * them needs to go for a planner UI (no need for the actual link target). */
const stripWikiLinks = (text) => text?.replace(/\[\[(?:[^|\]]*\|)?([^\]]*)\]\]/g, '$1') ?? text;

const slugify = (name) =>
  name
    .toLowerCase()
    .replace(/'/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

/** A handful of Questreq/data prerequisite names use different apostrophe
 * conventions or punctuation than the matching infobox_quest page title —
 * confirmed by hand against the live wiki, not guessed. */
const NAME_ALIASES = new Map([['Romeo and Juliet', 'Romeo & Juliet']]);
const resolveName = (name) => NAME_ALIASES.get(name) ?? name;

/**
 * `relation` describes what's needed of the *named* quest, not of the one
 * doing the requiring:
 * - 'required' (no prefix) — must be completed.
 * - 'partial' (`Partial:`) — must be started/partway through, not finished
 *   (used where a quest only needs you to have reached a certain point in
 *   another, e.g. a Recipe for Disaster subquest needing Legends' Quest
 *   partway).
 * - 'full_completion' (`Full:`) — must be *fully* completed, a stricter bar
 *   than 'required' that a few quests distinguish (see
 *   `fullCompletionRequirements` below) — e.g. Crocodile Tears needs
 *   Missing My Mummy's own bonus post-quest content finished, not just the
 *   quest itself.
 */
function splitRequirement(raw) {
  for (const [prefix, relation] of [
    ['Partial:', 'partial'],
    ['Full:', 'full_completion'],
  ]) {
    if (raw.startsWith(prefix)) return { relation, name: resolveName(raw.slice(prefix.length)) };
  }
  return { relation: 'required', name: resolveName(raw) };
}

async function main() {
  const [infoboxRows, skillRows, questreqLua] = await Promise.all([
    bucketQuery('infobox_quest', [
      'id',
      'page_name',
      'name',
      'is_members_only',
      'official_difficulty',
      'official_series',
      'official_nth_in_series',
      'official_age',
      'start_area',
      'quest_type',
      'official_combat',
      'subquest_of',
      'release_date',
      'removal_date',
    ]),
    bucketQuery('quest', ['page_name', 'requirement_skill_level', 'official_length']),
    fetch(WIKI_MODULE('Module:Questreq/data')).then((res) => res.text()),
  ]);

  const questreqData = parseQuestreqData(questreqLua);

  // "<Name> (historical)" pages document a quest's pre-rework design for the
  // wiki's own history section — Demon Slayer, Druidic Ritual, Imp Catcher,
  // Rune Mysteries, Shield of Arrav, Wolf Whistle and Death Plateau all have
  // one. They share `name` with the current, real version of the quest
  // (confirmed via each row's own `removal_date`, which only these — of the
  // "quest" quest_type — carry alongside an identical `name`), so keeping
  // them would just produce duplicate-named ghost entries with no
  // corresponding gameplay. A separately-`removal_date`d but *not*
  // "(historical)" row (a seasonal holiday quest, or an old permanently-cut
  // one) is real, still-relevant content — see `removalDate` — and is kept.
  const rows = infoboxRows.filter((row) => !row.page_name.endsWith('(historical)'));

  const skillReqsByPage = new Map(
    skillRows.map((row) => [
      row.page_name,
      (row.requirement_skill_level ?? []).map((entry) => {
        const [skill, level] = entry.split(':');
        return { skill, level: Number(level) };
      }),
    ]),
  );

  // Qualitative, sometimes a range ("Short to Medium") — see the README's
  // LENGTH_ORDER note for how a planner turns this into a sort order.
  const lengthByPage = new Map(
    skillRows.map((row) => [row.page_name, row.official_length && row.official_length !== 'N/A' ? row.official_length : null]),
  );

  const knownPageNames = new Set(rows.map((row) => row.page_name));
  const unresolvedQuestRefs = new Set();

  function buildRequirements(pageName) {
    const raw = questreqData[pageName] ?? [];
    const questRequirements = [];
    const miscRequirements = [];

    for (const entry of raw) {
      if (entry.startsWith('Misc:')) {
        miscRequirements.push(stripWikiLinks(entry.slice('Misc:'.length)));
        continue;
      }
      const { relation, name } = splitRequirement(entry);
      if (!knownPageNames.has(name)) unresolvedQuestRefs.add(name);
      questRequirements.push({ quest: name, relation });
    }

    // "Follows:<name>" is a separate top-level key: quests recommended (not
    // required) before this one, only ever shown when a quest's own infobox
    // opts in via |follows=Yes — see Module:QuestDetails' followsEventsDisp.
    const recommendedRaw = questreqData[`Follows:${pageName}`] ?? [];
    const recommendedQuests = recommendedRaw
      .filter((entry) => !entry.startsWith('Misc:'))
      .map((entry) => {
        const { name } = splitRequirement(entry);
        if (!knownPageNames.has(name)) unresolvedQuestRefs.add(name);
        return { quest: name };
      });

    // "Full:<name>" as a top-level key is a *different, stricter*
    // requirement list for this same quest: what's needed to count it as
    // fully (not just nominally) completed — see the relation doc above.
    // Only a handful of quests (mostly sagas and a few "return later for
    // more" quests like Missing My Mummy) have one at all.
    const fullRaw = questreqData[`Full:${pageName}`];
    const fullCompletionRequirements = fullRaw
      ? fullRaw
          .filter((entry) => !entry.startsWith('Misc:'))
          .map((entry) => {
            const { relation, name } = splitRequirement(entry);
            if (!knownPageNames.has(name)) unresolvedQuestRefs.add(name);
            return { quest: name, relation };
          })
      : [];

    return { questRequirements, recommendedQuests, fullCompletionRequirements, miscRequirements };
  }

  const quests = rows
    .map((row) => {
      const { questRequirements, recommendedQuests, fullCompletionRequirements, miscRequirements } = buildRequirements(
        row.page_name,
      );
      return {
        name: row.name,
        slug: slugify(row.name),
        wikiUrl: `https://runescape.wiki/w/${encodeURIComponent(row.page_name.replace(/ /g, '_'))}`,
        questType: row.quest_type ?? 'quest',
        subquestOf: row.subquest_of ?? null,
        difficulty: row.official_difficulty ?? null,
        length: lengthByPage.get(row.page_name) ?? null,
        // Bucket serialises this boolean field as present-but-empty for
        // true and absent for false — there is no literal `true` value.
        members: Object.hasOwn(row, 'is_members_only'),
        series: row.official_series && row.official_series !== 'None' ? row.official_series : null,
        seriesPosition: row.official_nth_in_series ? Number(row.official_nth_in_series) : null,
        age: row.official_age ? Number(row.official_age) : null,
        startArea: row.start_area ?? null,
        combatLevel: row.official_combat && row.official_combat !== 'none' ? row.official_combat : null,
        releaseDate: row.release_date ?? null,
        removalDate: row.removal_date ?? null,
        skillRequirements: skillReqsByPage.get(row.page_name) ?? [],
        questRequirements,
        recommendedQuests,
        fullCompletionRequirements,
        miscRequirements,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  const output = {
    fetchedAt: new Date().toISOString(),
    source: 'https://runescape.wiki (Bucket API + Module:Questreq/data)',
    count: quests.length,
    unresolvedQuestRefs: [...unresolvedQuestRefs].sort(),
    quests,
  };

  const { writeFile } = await import('node:fs/promises');
  const { fileURLToPath } = await import('node:url');
  const path = fileURLToPath(new URL('quests.json', import.meta.url));
  await writeFile(path, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
  console.log(`Wrote ${quests.length} quests to ${path}`);
  if (output.unresolvedQuestRefs.length) {
    console.log(`${output.unresolvedQuestRefs.length} requirement names have no matching quest record:`, output.unresolvedQuestRefs);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
