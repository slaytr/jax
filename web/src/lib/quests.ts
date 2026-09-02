/**
 * Pure logic behind the Quests tab's own list — sort/filter option data and
 * comparators, split out of the old views/player-quests.js's DOM-building so
 * it's reusable and testable on its own, same "pure logic in lib/, DOM in
 * .vue" convention as lib/goals.ts.
 */

import { matchesTitle, meetsSkillRequirements, statusOf } from '@shared/quest-status.js';

/**
 * `length` on a quest is qualitative and sometimes a range ("Short to
 * Medium") — see quest-data/README.md. There's nothing numeric to sort on,
 * so this pins every value the wiki currently uses to an ordinal; a value
 * outside this list (the data changed since) sorts last rather than
 * throwing.
 */
const LENGTH_ORDER = [
  'Very Short',
  'Short',
  'Short to Medium',
  'Medium',
  'Medium to Long',
  'Long',
  'Long to Very Long',
  'Very Long',
  'Very, Very Long',
];

const DIFFICULTY_ORDER = ['Novice', 'Intermediate', 'Experienced', 'Master', 'Grandmaster', 'Special'];

const rankOf = (order: string[], value: string) => {
  const index = order.indexOf(value);
  return index === -1 ? Infinity : index;
};

export const SORTS: Record<string, (a: any, b: any) => number> = {
  name: (a, b) => a.name.localeCompare(b.name),
  length: (a, b) => rankOf(LENGTH_ORDER, a.length) - rankOf(LENGTH_ORDER, b.length) || a.name.localeCompare(b.name),
  difficulty: (a, b) => rankOf(DIFFICULTY_ORDER, a.difficulty) - rankOf(DIFFICULTY_ORDER, b.difficulty) || a.name.localeCompare(b.name),
};

export const SORT_OPTIONS: Array<[string, string]> = [
  ['name', 'Sort: A–Z'],
  ['difficulty', 'Sort: Difficulty'],
  ['length', 'Sort: Length'],
];

export const STATUS_OPTIONS: Array<[string, string]> = [
  ['all', 'All quests'],
  ['completed', 'Completed'],
  ['in-progress', 'In progress'],
  ['not-started', 'Not started'],
];

export const SKILL_OPTIONS: Array<[string, string]> = [
  ['all', 'Any skill level'],
  ['met', 'Meets skill reqs'],
  ['not-met', 'Missing skill reqs'],
];

export const STATUS_MARKER: Record<string, string> = { completed: '✓', 'in-progress': '•', 'not-started': '' };

export interface QuestFilters {
  search: string;
  sort: string;
  status: string;
  skillReq: string;
}

/** Every quest matching the current search/status/skill-requirement
 * filters, sorted per `filters.sort` — the list body's own filter+sort
 * pass, shared so QuestList.vue doesn't have to inline it. */
export function filterAndSortQuests(quests: any[], player: any, filters: QuestFilters, skillLevels: Map<string, number>): any[] {
  const completedSet = new Set(player.completedQuests ?? []);
  const startedSet = new Set(player.startedQuests ?? []);
  const query = filters.search.trim().toLowerCase();

  const filtered = quests.filter((quest) => {
    if (query && !quest.name.toLowerCase().includes(query)) return false;
    if (filters.status !== 'all' && statusOf(quest, completedSet, startedSet) !== filters.status) return false;
    if (filters.skillReq !== 'all' && meetsSkillRequirements(quest, skillLevels) !== (filters.skillReq === 'met')) return false;
    return true;
  });

  return [...filtered].sort(SORTS[filters.sort] ?? SORTS.name);
}

/** Overall progress, independent of the search box and the three filters —
 * "how much of the game has this player done", not "how many of the
 * currently-filtered rows are done". */
export function questProgressCount(player: any, quests: any[]): number {
  const completedSet = new Set(player.completedQuests ?? []);
  return quests.filter((quest) => matchesTitle(quest, completedSet)).length;
}

/** Same {skill, level} shape, same entries — order aside — iff `a` and `b`
 * came from the identical requirement set. Used only to decide whether
 * offering "include the tree" (QuestGoalDialog.vue) would actually change
 * anything: a quest with no prerequisite quests, or whose prerequisites
 * add no skill requirement beyond its own, has nothing for the checkbox to
 * add, so it stays hidden rather than presenting a toggle that does
 * nothing either way. */
export function sameRequirements(a: Array<{ skill: string; level: number }>, b: Array<{ skill: string; level: number }>): boolean {
  if (a.length !== b.length) return false;
  const levelBySkill = new Map(b.map((req) => [req.skill, req.level]));
  return a.every((req) => levelBySkill.get(req.skill) === req.level);
}
