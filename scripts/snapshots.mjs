/**
 * Pure snapshot/history transforms. No IO, no mutation: every function returns
 * new objects so the caller can diff, test, or discard the result freely.
 */

import { SKILL_COUNT } from './hiscores.mjs';

export const HISTORY_VERSION = 1;

/** Compact per-player vector indexed by skill id. */
function vectorOf(result, field) {
  const vector = new Array(SKILL_COUNT).fill(0);
  for (const skill of result.skills) {
    if (skill.id >= 0 && skill.id < SKILL_COUNT) vector[skill.id] = skill[field];
  }
  return vector;
}

/**
 * Quest points per slug, keeping only successful fetches — same convention as
 * `p`/`l`, which keep only successful hiscore fetches. Quest points come from
 * a separate feed (RuneMetrics) that fails independently, so a player can be
 * missing here even when their hiscore fetch above succeeded.
 */
function questVector(questsBySlug = {}) {
  return Object.fromEntries(
    Object.entries(questsBySlug)
      .filter(([, result]) => result?.ok)
      .map(([slug, result]) => [slug, result.questPoints]),
  );
}

/**
 * @param groupRank optional competitive-ladder standing; its rank is stored as
 *   `r` so day-over-day movement can be computed later.
 * @param questsBySlug optional quest-point results (from fetchAllQuestPoints),
 *   stored as `q` so quest points gained over a window can be computed later.
 */
export function toSnapshot(results, epochSeconds, groupRank = null, questsBySlug = {}) {
  const ok = results.filter((result) => result.ok);

  // `p` is xp per skill, `l` is level per skill. Levels are stored rather than
  // derived: RS3's elite skills (Invention especially) use their own xp curve,
  // so reconstructing a level from xp would be wrong for exactly the skills
  // where it matters most.
  const snapshot = {
    t: epochSeconds,
    p: Object.fromEntries(ok.map((result) => [result.slug, vectorOf(result, 'xp')])),
    l: Object.fromEntries(ok.map((result) => [result.slug, vectorOf(result, 'level')])),
  };

  const withRank = Number.isFinite(groupRank?.rank) ? { ...snapshot, r: groupRank.rank } : snapshot;

  const q = questVector(questsBySlug);
  return Object.keys(q).length > 0 ? { ...withRank, q } : withRank;
}

const sameVectors = (a = [], b = []) => a.length === b.length && a.every((value, i) => value === b[i]);

const sameScalars = (a = {}, b = {}) => {
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every((key) => a[key] === b[key]);
};

/** True when nothing in the group moved since the previous snapshot. */
export function isRedundant(snapshot, previous) {
  if (!previous) return false;
  // A ladder move is a change worth recording even when no xp was gained —
  // other groups passing us still shifts our rank.
  if (snapshot.r !== previous.r) return false;

  // A snapshot carrying data the previous one lacks is an upgrade, not a
  // duplicate. Without this, a new field would never be written until somebody
  // happened to gain xp.
  if (snapshot.l && !previous.l) return false;
  if (snapshot.q && !previous.q) return false;

  const slugs = Object.keys(snapshot.p);
  if (slugs.length !== Object.keys(previous.p).length) return false;
  if (!slugs.every((slug) => sameVectors(snapshot.p[slug], previous.p[slug]))) return false;

  // Quest points can change with no xp gained (a quest completed for points
  // alone), so that alone must also force a new entry.
  return sameScalars(snapshot.q, previous.q);
}

const totalsFrom = (skills) => {
  const overall = skills.find((skill) => skill.id === 0);
  return { level: overall?.level ?? 0, xp: overall?.xp ?? 0, rank: overall?.rank ?? null };
};

/**
 * Builds the player list for latest.json. A player whose fetch failed keeps
 * their previous numbers and is flagged stale — a transient Jagex outage must
 * not blank the leaderboard.
 */
export function mergePlayers(roster, results, previousPlayers = [], questsBySlug = {}) {
  const previousBySlug = new Map(previousPlayers.map((player) => [player.slug, player]));
  const resultBySlug = new Map(results.map((result) => [result.slug, result]));

  /**
   * Quest points come from a separate API, so they succeed and fail
   * independently of the hiscore fetch: keep the previous value when the
   * profile is private or the call failed. `completedQuests`/`startedQuests`
   * (the current completed/in-progress title lists) follow the same
   * fallback — they're a live snapshot for display, not something carried
   * in history, so there's nothing to reconcile beyond "keep the last good
   * list".
   */
  const questsFor = (slug, previous) => {
    const quest = questsBySlug[slug];
    if (quest?.ok) {
      return {
        questPoints: quest.questPoints,
        questsComplete: quest.questsComplete,
        completedQuests: quest.completedQuests,
        startedQuests: quest.startedQuests,
        questsStale: false,
      };
    }
    return {
      questPoints: previous?.questPoints ?? null,
      questsComplete: previous?.questsComplete ?? null,
      completedQuests: previous?.completedQuests ?? [],
      startedQuests: previous?.startedQuests ?? [],
      questsStale: true,
    };
  };

  return roster.map((entry) => {
    const result = resultBySlug.get(entry.slug);
    const previous = previousBySlug.get(entry.slug);

    if (result?.ok) {
      return {
        slug: entry.slug,
        name: result.name,
        table: result.table,
        stale: false,
        error: null,
        total: totalsFrom(result.skills),
        ...questsFor(entry.slug, previous),
        skills: result.skills,
        activities: result.activities,
      };
    }

    const error = result?.error ?? 'player was not fetched';
    if (previous) {
      return { ...previous, ...questsFor(entry.slug, previous), stale: true, error };
    }

    return {
      slug: entry.slug,
      name: entry.name,
      table: entry.table ?? 'main',
      stale: true,
      error,
      total: { level: 0, xp: 0, rank: null },
      ...questsFor(entry.slug, null),
      skills: [],
      activities: [],
    };
  });
}
