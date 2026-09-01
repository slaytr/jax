/**
 * Pure DB-rows -> client-shape transforms. No IO here at all — every
 * function takes plain objects/arrays (whatever routes/read.mjs got back
 * from `pool.query`) and returns exactly the JSON shape the front end
 * already expects from data/latest.json, a data/history/YYYY-MM/DD.json
 * shard, or quest-data/quests.json. Keeping this pure is what lets
 * test/projections.test.mjs assert byte-for-byte equivalence with fixture
 * rows and no database at all — see the plan's "round-trip gate".
 *
 * One coercion every function here has to do that the source JSON files
 * never needed: node-postgres returns BIGINT (and bigint[] elements) as
 * strings, not numbers, to avoid silently losing precision on values past
 * 2^53. RS3 xp figures never get remotely close to that ceiling, so a plain
 * Number() is safe and is applied at the boundary here rather than pushed
 * out to every caller.
 */

import { SKILL_COUNT } from '../scripts/hiscores.mjs';
import { HISTORY_VERSION } from '../scripts/snapshots.mjs';

const toNumber = (value) => (value === null || value === undefined ? value : Number(value));

/**
 * `group_state` row -> latest.json's `groupRank`, or null if the ladder has
 * never resolved (a fresh install with no successful scrape yet). `groupRank
 * .name` isn't its own column — group-rank.mjs's scraper only ever matches
 * on the *configured* group name (never trusting the server's own
 * highlight flag), so it's always identical to `groups.name` and is passed
 * in from there rather than duplicated in group_state.
 */
export function projectGroupRank(row, groupName) {
  if (!row) return null;
  return {
    rank: row.rank,
    name: groupName,
    totalLevel: row.total_level,
    totalXp: toNumber(row.total_xp),
    size: row.size,
    founder: row.founder,
    id: row.external_id,
    competitive: row.competitive,
    totalGroups: row.total_groups,
    rivals: row.rivals ?? [],
    sourceUrl: row.source_url,
    stale: row.stale,
    error: row.error,
    checkedAt: row.checked_at instanceof Date ? row.checked_at.toISOString() : row.checked_at,
  };
}

/**
 * One `player_state` row (already joined with `players` for name/table, and
 * with `completedQuests`/`startedQuests` arrays attached by the caller from
 * `player_quest_status`) -> one entry of latest.json's `players` array.
 */
export function projectPlayerState(row) {
  return {
    slug: row.slug,
    name: row.name,
    table: row.hiscore_table,
    stale: row.stale,
    error: row.error,
    total: {
      level: row.total_level,
      xp: toNumber(row.total_xp),
      rank: row.total_rank,
    },
    questPoints: row.quest_points,
    questsComplete: row.quests_complete,
    completedQuests: row.completedQuests ?? [],
    startedQuests: row.startedQuests ?? [],
    questsStale: row.quests_stale,
    skills: row.skills ?? [],
    activities: row.activities ?? [],
  };
}

/**
 * Combines the group/roster/state rows into exactly data/latest.json's
 * shape. `players` must already be in roster order (ORDER BY position) —
 * this function doesn't re-sort, same as mergePlayers() never re-sorting
 * the roster it was handed.
 */
export function projectLatest({ fetchedAt, trackingSince, group, groupRankRow, players }) {
  return {
    version: HISTORY_VERSION,
    fetchedAt,
    trackingSince,
    group: {
      name: group.name,
      tagline: group.tagline,
      hiscoresUrl: group.hiscores_url,
    },
    groupRank: projectGroupRank(groupRankRow, group.name),
    players: players.map(projectPlayerState),
  };
}

/** A dense 30-wide xp or level vector may come back from Postgres with
 * bigint elements as strings (xp) or already-numeric elements (levels) —
 * normalise either to a plain number array, and pad short/missing vectors
 * with zeros the same way scripts/snapshots.mjs's vectorOf() does. */
function toVector(value) {
  const vector = new Array(SKILL_COUNT).fill(0);
  if (Array.isArray(value)) {
    for (let i = 0; i < Math.min(value.length, SKILL_COUNT); i += 1) {
      vector[i] = toNumber(value[i]) ?? 0;
    }
  }
  return vector;
}

const epochSecondsOf = (takenAt) => Math.floor((takenAt instanceof Date ? takenAt.getTime() : Date.parse(takenAt)) / 1000);

/**
 * Flat rows — one per (snapshot, player) pair, in any order, each carrying
 * `taken_at`, `group_rank`, `player_slug`, `xp`, `levels`, `quest_points` —
 * grouped back into the `{t,p,l,r,q}` shard shape the client's
 * loadRecentHistory() already flattens 33 files into, sorted ascending by
 * `t` same as data.js does after fetching them.
 */
export function projectHistory(rows) {
  const bySnapshot = new Map();

  for (const row of rows) {
    const t = epochSecondsOf(row.taken_at);
    if (!bySnapshot.has(t)) {
      bySnapshot.set(t, { t, r: row.group_rank, p: {}, l: {}, q: {} });
    }
    const snapshot = bySnapshot.get(t);
    snapshot.p[row.player_slug] = toVector(row.xp);
    // row.levels is null on a pre-schema-upgrade snapshot (see the column
    // comment in the migration) — leave this slug out of `l` entirely
    // rather than fabricate a zero vector, same "no data" distinction
    // toSnapshot() drew by leaving the whole `l` key off the snapshot.
    if (row.levels) snapshot.l[row.player_slug] = toVector(row.levels);
    if (row.quest_points !== null && row.quest_points !== undefined) {
      snapshot.q[row.player_slug] = row.quest_points;
    }
  }

  return [...bySnapshot.values()]
    .sort((a, b) => a.t - b.t)
    .map(({ t, r, p, l, q }) => {
      const snapshot = { t, p };
      // `l` itself is present-or-absent per snapshot, not per player — see
      // toSnapshot() in scripts/snapshots.mjs. Every player_snapshot row for
      // one snapshot carries the same has-levels-or-not, so checking any one
      // key is equivalent to checking all of them.
      const withLevels = Object.keys(l).length > 0 ? { ...snapshot, l } : snapshot;
      const withRank = Number.isFinite(r) ? { ...withLevels, r } : withLevels;
      return Object.keys(q).length > 0 ? { ...withRank, q } : withRank;
    });
}

/**
 * One `quests` row plus its `quest_skill_requirements` and
 * `quest_prerequisites` rows -> one quest-data/quests.json entry.
 * `questRequirements`/`recommendedQuests` are split back apart the same way
 * they were split going in — see scripts/backfill.mjs's use of the synthetic
 * `'recommended'` relation.
 */
export function projectQuest(row, { skillRequirements = [], prerequisites = [] } = {}) {
  const questRequirements = prerequisites
    .filter((req) => req.relation !== 'recommended')
    .map((req) => ({ quest: req.requires, relation: req.relation }));
  const recommendedQuests = prerequisites.filter((req) => req.relation === 'recommended').map((req) => ({ quest: req.requires }));

  return {
    name: row.name,
    slug: row.slug,
    wikiUrl: row.wiki_url,
    questType: row.quest_type,
    subquestOf: row.subquest_of,
    difficulty: row.difficulty,
    length: row.length,
    members: row.members,
    series: row.series,
    seriesPosition: row.series_position,
    age: row.age,
    startArea: row.start_area,
    combatLevel: row.combat_level,
    releaseDate: row.release_date,
    removalDate: row.removal_date,
    skillRequirements: skillRequirements.map((req) => ({ skill: req.skill, level: req.level })),
    questRequirements,
    recommendedQuests,
    fullCompletionRequirements: row.full_completion_requirements ?? [],
    miscRequirements: row.misc_requirements ?? [],
  };
}

/** Wraps a list of already-`projectQuest`-ed entries in the envelope
 * quest-data.js expects — it only ever checks `Array.isArray(data?.quests)`,
 * so `count` is provided for convenience rather than because it's read. */
export function projectQuests(quests) {
  return { count: quests.length, quests };
}

/**
 * One `goals` row -> exactly the object shape goals-storage.js has always
 * produced client-side, including the field the row doesn't need for its
 * `kind` being left out entirely (a skill goal has no `questName` key, a
 * quest goal has no `skillId`/`targetType`/... keys) — player-goals.js
 * never checks `'questName' in goal`, but matching the shape it already
 * knows how to render keeps this a drop-in replacement.
 */
export function projectGoal(row) {
  const base = {
    id: row.id,
    kind: row.kind,
    group: row.goal_group,
    labels: row.labels ?? [],
    startedAt: toIso(row.started_at),
    completedAt: toIso(row.completed_at),
  };

  if (row.kind === 'quest') {
    return { ...base, questName: row.quest_name };
  }

  return {
    ...base,
    skillId: row.skill_id,
    targetType: row.target_type,
    targetValue: toNumber(row.target_value),
    startLevel: row.start_level,
    startXp: toNumber(row.start_xp),
    completedLevel: row.completed_level,
    completedXp: toNumber(row.completed_xp),
  };
}

function toIso(value) {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : value;
}

/** `goal_labels` row -> the `{name, colour}` shape goal-labels-storage.js
 * has always stored. */
export function projectGoalLabel(row) {
  return { name: row.name, colour: row.colour };
}
