/**
 * Pure logic behind the Quests tab's Planner section (views/quest-planner.js)
 * — no DOM, so it's unit-testable on its own, same convention as
 * quest-graph.js/quest-goal.js. Three suggestions, all computed off the same
 * per-quest readiness check (questReadiness below):
 *
 *  - **Ready now**: nothing left in the way — every direct quest prerequisite
 *    already completed, every skill requirement already met, enough quest
 *    points banked. Ranked by how many other still-incomplete quests
 *    directly name it as a requirement of their own (computeUnlockCounts) —
 *    a rough "how many doors does this open" signal, so the list leads with
 *    quests that unblock the most further content rather than an arbitrary
 *    order.
 *  - **Almost there**: quest prerequisites and quest points are already
 *    satisfied, but one or more skills aren't — and every one of those gaps
 *    is small (MAX_LEVEL_GAP_PER_SKILL) rather than just the total being
 *    small, since a quest missing one skill by 20 levels isn't "a small
 *    stat requirement away" even if it happens to be the only gap. Ranked by
 *    total levels needed, ascending.
 *  - **Questlines in progress**: any series with at least one but not every
 *    member completed, each paired with whichever remaining member is
 *    closest to actionable (ready now, then smallest skill gap, then
 *    whatever's left — quest-prerequisite-blocked members sort last since
 *    there's nothing this player can do about those yet).
 */

import { requirementsOf } from './quest-graph.js';
import { statusOf, skillLevelsByName } from './quest-status.js';
import { notMetSkillRequirements } from './quest-goal.js';

/** A missing skill requirement only counts as "small" up to this many
 * levels — the threshold behind the whole "Almost there" section. Kept
 * modest and named here (rather than picked ad hoc at the call site) since
 * it's the one number that defines what "a small stat requirement away"
 * actually means. */
export const MAX_LEVEL_GAP_PER_SKILL = 5;

/** How many rows each suggestion list surfaces — a planner nudging toward
 * "do this next", not a second, differently-sorted copy of the full quest
 * list underneath it. */
export const MAX_SUGGESTIONS = 8;
export const MAX_QUESTLINES = 5;

/** How many rows a single "Ready now" quest's own expanded forward chain
 * (subsequentQuests below) surfaces — same "nudge, not the whole graph"
 * reasoning as MAX_SUGGESTIONS, just scoped to one quest's own preview
 * instead of the top-level lists. */
export const MAX_SUBSEQUENT = 12;

const QUEST_POINTS_PSEUDO_SKILL = 'quest points';

/** The "quest points" pseudo-skill (see quest-goal.js's own
 * isTrackableSkillRequirement) is a real, checkable player stat
 * (player.questPoints) even though it isn't a trainable skill — unlike
 * quest-goal.js's goal-drafting use, which excludes it because there's no
 * level-target goal to build against it, the planner just needs to know
 * whether it's satisfied. */
function questPointsNeeded(quest, playerQuestPoints) {
  const req = quest.skillRequirements.find((entry) => entry.skill.toLowerCase() === QUEST_POINTS_PSEUDO_SKILL);
  return req ? Math.max(0, req.level - playerQuestPoints) : 0;
}

/** Every direct requirement of `quest` already completed — not the whole
 * transitive tree, since in-game you can't complete a quest without first
 * completing its own prerequisites, so a direct check is both sufficient
 * and cheaper than re-walking dependencyGraphFor for every candidate. */
function prereqsMet(quest, byName, statusByName) {
  return requirementsOf(quest, byName).every((req) => statusByName.get(req.name) === 'completed');
}

/**
 * One candidate's full readiness picture — the shared computation behind
 * every section below, so "ready now" and "almost there" are just two
 * different filters over the same numbers rather than separately
 * re-deriving them.
 */
function questReadiness(quest, byName, statusByName, skillLevels, playerQuestPoints) {
  const missingSkills = notMetSkillRequirements(quest, skillLevels);
  const totalLevelGap = missingSkills.reduce((sum, req) => sum + (req.level - (skillLevels.get(req.skill) ?? 0)), 0);

  return {
    quest,
    prereqsMet: prereqsMet(quest, byName, statusByName),
    qpNeeded: questPointsNeeded(quest, playerQuestPoints),
    missingSkills,
    totalLevelGap,
  };
}

const isReadyNow = (candidate) => candidate.prereqsMet && candidate.qpNeeded === 0 && candidate.missingSkills.length === 0;

const isAlmostThere = (candidate, skillLevels) =>
  candidate.prereqsMet &&
  candidate.qpNeeded === 0 &&
  candidate.missingSkills.length > 0 &&
  candidate.missingSkills.every((req) => req.level - (skillLevels.get(req.skill) ?? 0) <= MAX_LEVEL_GAP_PER_SKILL);

/** How many still-incomplete quests directly name each quest as one of
 * their own requirements — computed once for every quest in the dataset
 * (not just candidates), since a completed quest can still be the thing
 * that unlocked several others; what's excluded is counting *toward*
 * already-completed quests, which nobody still needs to unlock. */
function computeUnlockCounts(quests, byName, statusByName) {
  const counts = new Map();
  for (const quest of quests) {
    if (statusByName.get(quest.name) === 'completed') continue;
    for (const req of requirementsOf(quest, byName)) {
      counts.set(req.name, (counts.get(req.name) ?? 0) + 1);
    }
  }
  return counts;
}

/** Every series with partial (not zero, not complete) progress, each with
 * whichever remaining member is closest to actionable right now. `readiness`
 * is a `Map<quest name, candidate>` — every non-completed quest's own
 * questReadiness result, reused rather than recomputed per series. */
function computeQuestlines(quests, statusByName, readiness) {
  const bySeries = new Map();
  for (const quest of quests) {
    if (!quest.series) continue;
    if (!bySeries.has(quest.series)) bySeries.set(quest.series, []);
    bySeries.get(quest.series).push(quest);
  }

  // A remaining member's own rank for "what to do next": ready now first,
  // then blocked only on skills (closer skill gap first), then
  // quest-prerequisite-blocked last — there's nothing a stat/quest-planner
  // can suggest toward one of those yet. seriesPosition is the final
  // tiebreak, so a genuine tie still resolves to the story's own order.
  const nextRank = (candidate) => {
    if (isReadyNow(candidate)) return 0;
    if (candidate.prereqsMet) return 1;
    return 2;
  };

  const questlines = [];
  for (const [series, members] of bySeries) {
    const completedCount = members.filter((member) => statusByName.get(member.name) === 'completed').length;
    if (completedCount === 0 || completedCount === members.length) continue;

    const remaining = members
      .map((member) => readiness.get(member.name))
      .filter(Boolean)
      .sort((a, b) => nextRank(a) - nextRank(b) || a.totalLevelGap - b.totalLevelGap || a.quest.seriesPosition - b.quest.seriesPosition);

    questlines.push({ series, completedCount, total: members.length, next: remaining[0] ?? null });
  }

  return questlines.sort(
    (a, b) => a.total - a.completedCount - (b.total - b.completedCount) || b.completedCount / b.total - a.completedCount / a.total,
  );
}

/**
 * @param quests the full quest-data/quests.json list (quest-data.js).
 * @param player a decorated player (data.js) — `completedQuests`/
 *   `startedQuests` (RuneMetrics), `skillById`, and `questPoints` are read.
 * @returns `{ readyNow, almostThere, questlines }`:
 *    - `readyNow`/`almostThere`: `{ quest, missingSkills, totalLevelGap }[]`,
 *      already ranked and capped to MAX_SUGGESTIONS — missingSkills is
 *      always `[]` for readyNow (kept for a uniform shape either way).
 *    - `questlines`: `{ series, completedCount, total, next }[]`, capped to
 *      MAX_QUESTLINES — `next` is one of the same candidate shapes above (or
 *      `null` on the never-really-possible case of a partial series with no
 *      readiness data for any remaining member), the series' own best next
 *      move.
 */
export function computeQuestPlan(quests, player) {
  const byName = new Map(quests.map((quest) => [quest.name, quest]));
  const completedSet = new Set(player.completedQuests ?? []);
  const startedSet = new Set(player.startedQuests ?? []);
  const statusByName = new Map(quests.map((quest) => [quest.name, statusOf(quest, completedSet, startedSet)]));
  const skillLevels = skillLevelsByName(player);
  const playerQuestPoints = player.questPoints ?? 0;

  const incomplete = quests.filter((quest) => statusByName.get(quest.name) !== 'completed');
  const readiness = new Map(
    incomplete.map((quest) => [quest.name, questReadiness(quest, byName, statusByName, skillLevels, playerQuestPoints)]),
  );
  const unlockCounts = computeUnlockCounts(quests, byName, statusByName);

  const readyNow = incomplete
    .map((quest) => readiness.get(quest.name))
    .filter(isReadyNow)
    .sort((a, b) => (unlockCounts.get(b.quest.name) ?? 0) - (unlockCounts.get(a.quest.name) ?? 0) || a.quest.name.localeCompare(b.quest.name))
    .slice(0, MAX_SUGGESTIONS)
    .map((candidate) => ({ ...candidate, unlocks: unlockCounts.get(candidate.quest.name) ?? 0 }));

  const almostThere = incomplete
    .map((quest) => readiness.get(quest.name))
    .filter((candidate) => isAlmostThere(candidate, skillLevels))
    .sort((a, b) => a.totalLevelGap - b.totalLevelGap || a.quest.name.localeCompare(b.quest.name))
    .slice(0, MAX_SUGGESTIONS);

  const questlines = computeQuestlines(quests, statusByName, readiness).slice(0, MAX_QUESTLINES);

  return { readyNow, almostThere, questlines };
}

/**
 * The ordered chain of not-yet-completed quests that would become doable,
 * one after another, once `quest` itself is done — the "Ready now" row's
 * own expandable "what comes after this" preview. Not just every quest that
 * names `quest` as a requirement somewhere in its history (that's most of
 * the graph for an early quest): each entry is only appended once every one
 * of *its own* requirements is already satisfied — already completed,
 * `quest` itself, or an earlier entry already added to this very chain — so
 * the result is a genuine valid completion order a player could actually
 * follow, not just "eventually needs quest" regardless of what else still
 * stands in the way. Capped at MAX_SUBSEQUENT; a quest with a long tail
 * behind it (e.g. an early Dragon Slayer) still only shows the nearest
 * handful.
 *
 * @param quest the completed-in-this-scenario quest to look forward from.
 * @param quests the full quest-data/quests.json list.
 * @param player a decorated player — see computeQuestPlan.
 * @returns quest-data records (not the `{ quest, ... }` candidate shape
 *   used elsewhere in this file) in the order they'd become doable —
 *   `.series` is read directly off each for the caller's own "which
 *   questline" display.
 */
export function subsequentQuests(quest, quests, player) {
  const byName = new Map(quests.map((q) => [q.name, q]));
  const completedSet = new Set(player.completedQuests ?? []);
  const startedSet = new Set(player.startedQuests ?? []);
  const statusByName = new Map(quests.map((q) => [q.name, statusOf(q, completedSet, startedSet)]));

  // Every not-yet-completed quest reachable by walking requirements forward
  // from `quest` — the pool the pass below draws its ordered chain from.
  const requiredBy = new Map();
  for (const candidate of quests) {
    for (const req of requirementsOf(candidate, byName)) {
      if (!requiredBy.has(req.name)) requiredBy.set(req.name, []);
      requiredBy.get(req.name).push(candidate.name);
    }
  }

  const descendants = new Set();
  const worklist = [quest.name];
  while (worklist.length > 0) {
    const name = worklist.pop();
    for (const childName of requiredBy.get(name) ?? []) {
      if (statusByName.get(childName) === 'completed') continue;
      if (!descendants.has(childName)) {
        descendants.add(childName);
        worklist.push(childName);
      }
    }
  }

  const satisfied = new Set(quests.filter((q) => statusByName.get(q.name) === 'completed').map((q) => q.name));
  satisfied.add(quest.name);

  // A repeated pass over whatever's left (Kahn's-algorithm style) rather
  // than a single sweep — an entry two steps behind `quest` isn't ready on
  // the first pass (its own direct requirement, one step behind `quest`,
  // hasn't been added to `satisfied` yet), so it has to wait for a later
  // pass once that requirement lands.
  const remaining = new Set(descendants);
  const chain = [];
  let progressed = true;
  while (progressed && remaining.size > 0 && chain.length < MAX_SUBSEQUENT) {
    progressed = false;
    for (const name of remaining) {
      const candidate = byName.get(name);
      const ready = candidate && requirementsOf(candidate, byName).every((req) => satisfied.has(req.name));
      if (!ready) continue;

      chain.push(candidate);
      satisfied.add(name);
      remaining.delete(name);
      progressed = true;
      if (chain.length >= MAX_SUBSEQUENT) break;
    }
  }

  return chain;
}
