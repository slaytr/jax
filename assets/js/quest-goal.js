import { SKILLS } from './config.js';

/**
 * Pure logic behind "turn this quest into a set of goals" — the dependency
 * map's per-node "add goal" button (quest-dependency-graph.js) and the
 * confirmation dialog it opens (player-goals.js's renderQuestGoalDialog)
 * both need the same answers (which requirements aren't met yet, what the
 * resulting goal drafts look like), so they live here once rather than
 * duplicated across a DOM-heavy view file and a UI-heavy one. No DOM, so
 * it's unit-testable on its own.
 */

/** Every one of `quest`'s skill requirements the player's own current level
 * doesn't yet meet. `skillLevels` is a plain `Map<skill name, level>` — the
 * same shape skillLevelsByName (player-quests.js) already builds for the
 * dependency map's own skill-chip colouring, reused here rather than
 * re-derived. */
export function notMetSkillRequirements(quest, skillLevels) {
  return quest.skillRequirements.filter((req) => (skillLevels.get(req.skill) ?? 0) < req.level);
}

/** `Map<skill name, { id, level, xp }>` — everything buildQuestGoalDrafts
 * needs to turn one not-met requirement into a real skill-goal draft (its
 * `skillId`, and its own starting point). Keyed by name, same as quest-data's
 * own skillRequirements, rather than by id like a goal itself ends up —
 * SKILLS is the only place both a name and an id are known for the same
 * skill. */
export function skillValuesByName(player) {
  return new Map(
    SKILLS.map((skill) => [
      skill.name,
      { id: skill.id, level: player.skillById?.[skill.id]?.level ?? 0, xp: player.skillById?.[skill.id]?.xp ?? 0 },
    ]),
  );
}

/**
 * Builds the goal drafts a "track this quest" confirmation creates: the
 * quest itself (`kind: 'quest'`), plus one `kind: 'skill'` goal per
 * requirement `notMetSkillRequirements` reports — never one for a
 * requirement already met, since there's nothing left to track there. Every
 * draft shares `group: quest.name`, so they show, sort, and collapse
 * together as one section in the Goals tab (goalSections, player-goals.js)
 * rather than scattering across the ungrouped list.
 *
 * `idFactory`/`nowIso` default to `crypto.randomUUID`/`new Date().
 * toISOString()` but are overridable so this stays unit-testable without
 * mocking globals — same reasoning as player-goals.js's own `uid()`, just
 * threaded in rather than baked in, since this file has no DOM/browser
 * dependency to piggyback a module-level default off of.
 */
export function buildQuestGoalDrafts(quest, skillLevels, skillValues, { idFactory = defaultId, nowIso = defaultNowIso } = {}) {
  const group = quest.name;
  const startedAt = nowIso();

  const questGoal = {
    id: idFactory(),
    kind: 'quest',
    questName: quest.name,
    group,
    labels: [],
    startedAt,
    completedAt: null,
  };

  const skillGoals = notMetSkillRequirements(quest, skillLevels).map((req) => {
    const value = skillValues.get(req.skill) ?? { id: null, level: 0, xp: 0 };
    return {
      id: idFactory(),
      kind: 'skill',
      skillId: value.id,
      targetType: 'level',
      targetValue: req.level,
      group,
      labels: [],
      startLevel: value.level,
      startXp: value.xp,
      startedAt,
      completedAt: null,
      completedLevel: null,
      completedXp: null,
    };
  });

  return [questGoal, ...skillGoals];
}

function defaultId() {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function defaultNowIso() {
  return new Date().toISOString();
}
