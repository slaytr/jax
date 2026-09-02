import { SKILLS } from './config.js';
import { statusOf } from './quest-status.js';

/**
 * A skill goal is complete once the player's *live* skill value (data.js's
 * skillById) reaches its target — checked against level or xp depending on
 * how it was set. A quest goal (`kind: 'quest'`, see quest-goal.js) is
 * complete once its `questName` matches an entry in the player's own
 * RuneMetrics completed list (statusOf, quest-status.js — the exact same
 * title-matching the Quests tab's own list and the dependency map use, so a
 * goal and the map agree on when a quest counts as done).
 *
 * Either way this only runs when someone actually loads the page, not
 * continuously in the background (there's no server here to watch for it),
 * so `completedAt` really means "first noticed complete on a visit", not
 * the exact in-game moment — close enough for a personal tracker, but worth
 * knowing if a duration ever looks a little longer than expected.
 */
function checkCompletion(goal, player) {
  if (goal.completedAt) return goal;

  if (goal.kind === 'quest') {
    const completedSet = new Set(player.completedQuests ?? []);
    const startedSet = new Set(player.startedQuests ?? []);
    if (statusOf({ name: goal.questName }, completedSet, startedSet) !== 'completed') return goal;
    return { ...goal, completedAt: new Date().toISOString() };
  }

  const value = player.skillById?.[goal.skillId];
  if (!value) return goal;

  const reached = goal.targetType === 'level' ? value.level >= goal.targetValue : value.xp >= goal.targetValue;
  if (!reached) return goal;

  return { ...goal, completedAt: new Date().toISOString(), completedLevel: value.level, completedXp: value.xp };
}

/** A `kind: 'skill'` goal whose `skillId` doesn't resolve to any current
 * SKILLS entry can't be rendered (a card builder needs the real skill for
 * its name and icon) — dropped here rather than crashing every future
 * render. The only way to reach this today is a quest-goal draft built
 * before quest-goal.js's notMetSkillRequirements started excluding the
 * "quest points" pseudo-skill requirement; kept as a general safety net
 * rather than a one-off migration, since any other future cause of a
 * dangling skillId should self-heal the same way instead of needing its
 * own cleanup pass. */
const isRenderable = (goal) => goal.kind === 'quest' || SKILLS.some((skill) => skill.id === goal.skillId);

/**
 * Re-checks every goal against the player's current skills, and drops any
 * that can no longer be rendered at all (isRenderable). Returns a new array
 * (goals that didn't change are the same object, so a caller can still tell
 * *which* changed if it ever needs to) plus whether anything actually
 * changed — either a completion or a drop — the caller only needs to
 * persist when it did.
 *
 * `justCompleted` is every goal that transitioned to complete on *this* call
 * specifically — checkCompletion always returns the identical object
 * unchanged for a goal that isn't newly completing (already complete, or
 * still short of its target), so `updated !== goal` inside the map below can
 * only mean one thing. This is the "first noticed complete on a visit" this
 * file's own checkCompletion doc comment describes — the caller uses it to
 * decide what the Goals tab's completion celebration has to show, once, the
 * next time that tab is actually open.
 */
export function refreshGoals(goals, player) {
  let changed = false;
  const justCompleted = [];
  const renderable = goals.filter(isRenderable);
  if (renderable.length !== goals.length) changed = true;

  const next = renderable.map((goal) => {
    const updated = checkCompletion(goal, player);
    if (updated !== goal) {
      changed = true;
      justCompleted.push(updated);
    }
    return updated;
  });
  return { goals: next, changed, justCompleted };
}
