/**
 * A quest's completion status against one player's own RuneMetrics lists —
 * split out from views/player-quests.js so pure logic elsewhere (this file
 * has no DOM dependency, unlike that one) can read a player's quest
 * progress without importing a view module. player-quests.js re-exports
 * `statusOf`/`skillLevelsByName` from here, so every existing call site
 * keeps working unchanged.
 */

import { SKILLS } from './config.js';

/** RuneMetrics titles drop the wiki's own disambiguator suffix for a
 * miniquest/saga/same-named-non-quest-thing quest ("Father and Son" vs
 * quest-data's "Father and Son (miniquest)") — confirmed against every
 * roster member's real completed/started list, where this was the only
 * mismatch. Tried only as a fallback, after the exact name. */
const DISAMBIGUATORS = [' (quest)', ' (miniquest)', ' (saga)'];

export function matchesTitle(quest, titles) {
  if (titles.has(quest.name)) return true;
  return DISAMBIGUATORS.some((suffix) => quest.name.endsWith(suffix) && titles.has(quest.name.slice(0, -suffix.length)));
}

/** A quest counts as complete/in-progress by title match (see matchesTitle)
 * against the player's own RuneMetrics lists (scripts/quests.mjs) —
 * completed checked first, so a title RuneMetrics somehow reports as both
 * reads as completed rather than in-progress. */
export function statusOf(quest, completedSet, startedSet) {
  if (matchesTitle(quest, completedSet)) return 'completed';
  if (matchesTitle(quest, startedSet)) return 'in-progress';
  return 'not-started';
}

/** `quest.skillRequirements` names skills by their in-game name ("Agility"),
 * the same strings SKILLS uses — so a plain name → level map off the
 * player's own skillById (data.js) is all a lookup needs. */
export function skillLevelsByName(player) {
  const levels = new Map();
  for (const skill of SKILLS) {
    const value = player.skillById?.[skill.id];
    if (value) levels.set(skill.name, value.level);
  }
  return levels;
}

export const meetsSkillRequirements = (quest, skillLevels) =>
  quest.skillRequirements.every((req) => (skillLevels.get(req.skill) ?? 0) >= req.level);
