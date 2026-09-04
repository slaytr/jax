import { SKILLS } from '@shared/config.js';
import { matchesTitle } from '@shared/quest-status.js';

export interface AreaTaskRequirement {
  text: string;
  /** True only when the wiki itself marked this one as a quest requirement
   * rather than a skill one (its own `achievement-req-quest` HTML class
   * for a task's own requirement, a bare `[[Quest Name]]` wikilink for a
   * tier's) — see area-tasks.js's own doc comment. */
  quest: boolean;
}

/** One "level skill" side of an either/or skill requirement (`alternatives`
 * below) — its own boostable flag, since one side of an either/or can be
 * boostable while the other isn't. */
export interface AlternativeSkill {
  skill: (typeof SKILLS)[number];
  level: number;
  boostable: boolean;
}

/**
 * `skill`/`level` are set only when `text` turned out to be a plain
 * "level skill" requirement (optionally wrapped in "One of: " / trailing
 * " or", from an alternative-requirements group the wiki lists one line
 * per option — the alternative itself isn't tracked, just enough to still
 * recognise the skill underneath, and optionally carrying "(boostable)" —
 * see `boostable` below); both stay `null` for everything else, including
 * an either/or requirement (`alternatives` below covers that case
 * instead) and anything neither shape matches (a quest name, "500 music",
 * "100 combat level"). `quest` is area-tasks.js's own flag, carried
 * straight through. `text` always holds the original string, so a caller
 * never needs it kept alongside separately (e.g. for a tooltip on the
 * compact icon+level rendering).
 */
export interface ParsedRequirement {
  skill: (typeof SKILLS)[number] | null;
  level: number | null;
  /** Set only for a genuine "N SkillA or M SkillB" requirement (one skill
   * OR another, either one satisfies it) — as opposed to the same-word
   * "or" that just joins one line of an *alternative-requirements group*
   * the wiki lists across several separate `<li>`s (parsed as ordinary
   * single-skill requirements instead, one per line, same as always).
   * Always exactly 2 entries; `skill`/`level` above stay `null` alongside
   * this. */
  alternatives: AlternativeSkill[] | null;
  /** Set only for a "N Combat" / "N combat level" requirement — combat
   * level isn't a trainable skill (no entry in SKILLS, so `skill` above
   * can't hold it), and this app has no combat-level formula to check it
   * against anyway, so requirementStatus always reads this as 'unknown'
   * (neutral) rather than guessing green or red. TasksTab.vue's own
   * COMBAT_ICON renders it as a proper icon+level chip regardless. */
  combatLevel: number | null;
  quest: boolean;
  /** The wiki's own "this level can be reached with a boost, not just
   * trained levels" annotation. Doesn't change how `requirementStatus`
   * checks it below (this app has no notion of a player's *boosted*
   * level, only their trained one — checking the plain trained level is
   * already the more lenient reading, since a player who could boost to
   * it obviously could also just train to it) — purely a rendering hint
   * so TasksTab.vue can show "(b)" next to the level rather than dropping
   * the annotation on the floor. Meaningless (always false) when
   * `alternatives` is set — see AlternativeSkill's own `boostable` for
   * that case instead. */
  boostable: boolean;
  text: string;
}

const SKILL_TOKEN = /(\d+)\s+([A-Za-z]+)(\s+\(boostable\))?/;

function findSkill(name: string) {
  return SKILLS.find((candidate) => candidate.name.toLowerCase() === name.toLowerCase());
}

export function parseRequirement(requirement: AreaTaskRequirement): ParsedRequirement {
  const eitherOr = requirement.text.match(new RegExp(`^${SKILL_TOKEN.source}\\s+or\\s+${SKILL_TOKEN.source}\\b`, 'i'));
  if (eitherOr) {
    const skillA = findSkill(eitherOr[2]);
    const skillB = findSkill(eitherOr[5]);
    if (skillA && skillB) {
      const alternatives: AlternativeSkill[] = [
        { skill: skillA, level: Number(eitherOr[1]), boostable: Boolean(eitherOr[3]) },
        { skill: skillB, level: Number(eitherOr[4]), boostable: Boolean(eitherOr[6]) },
      ];
      return { skill: null, level: null, alternatives, combatLevel: null, quest: false, boostable: false, text: requirement.text };
    }
  }

  const combatMatch = requirement.text.match(/^(\d+)\s+combat(?:\s+level)?$/i);
  if (combatMatch) {
    return { skill: null, level: null, alternatives: null, combatLevel: Number(combatMatch[1]), quest: false, boostable: false, text: requirement.text };
  }

  const match = requirement.text.match(/^(?:one of:\s*)?(\d+)\s+([A-Za-z]+)(?:\s+\(boostable\))?(?:\s+or)?$/i);
  const skill = match ? findSkill(match[2]) : undefined;
  if (match && skill) {
    return { skill, level: Number(match[1]), alternatives: null, combatLevel: null, quest: false, boostable: /\(boostable\)/i.test(requirement.text), text: requirement.text };
  }
  return { skill: null, level: null, alternatives: null, combatLevel: null, quest: requirement.quest, boostable: false, text: requirement.text };
}

export type RequirementStatus = 'met' | 'unmet' | 'unknown';

/** A parsed requirement's status against one player — 'unknown' for
 * anything parseRequirement couldn't turn into a skill and area-tasks.js
 * didn't flag as a quest either ("500 music", "100 combat level", an
 * alternative-requirements fragment with its own parenthetical caveat
 * parseRequirement's regex doesn't reach): there's nothing to compare it
 * against, so it's neither met nor unmet, just unverifiable here.
 *
 * An either/or requirement (`alternatives`) is 'met' as soon as *either*
 * side's own skill level is — that's the whole point of "or" — and only
 * 'unmet' once neither side is.
 *
 * Quest completion reuses quest-status.js's own matchesTitle (the same
 * RuneMetrics-title-quirks handling the Quests tab relies on) against a
 * requirement's own quest name — stripping a trailing "(partial)" first,
 * since that's area-tasks.js's own annotation for "only part of this quest
 * is actually required", not part of the quest's real title.
 */
export function requirementStatus(parsed: ParsedRequirement, skillLevels: Map<string, number>, completedQuestTitles: Set<string>): RequirementStatus {
  if (parsed.skill) return (skillLevels.get(parsed.skill.name) ?? 0) >= (parsed.level ?? 0) ? 'met' : 'unmet';
  if (parsed.alternatives) {
    const anyMet = parsed.alternatives.some((alt) => (skillLevels.get(alt.skill.name) ?? 0) >= alt.level);
    return anyMet ? 'met' : 'unmet';
  }
  if (parsed.quest) {
    const questName = parsed.text.replace(/\s*\(partial\)\s*$/i, '').trim();
    return matchesTitle({ name: questName }, completedQuestTitles) ? 'met' : 'unmet';
  }
  return 'unknown';
}

/** The tier-requirements box's own summary badge: green once every
 * determinable requirement (skill/quest — 'unknown' ones don't count
 * either way, there's nothing to hold against a player) is met, red if
 * none are met, yellow above an 80% met rate (close enough that what's
 * left is usually a single skill or quest away), orange for anything else
 * in between. Requirements Met also when there's nothing determinable at
 * all (no skill/quest requirements, just "500 music"-style ones) —
 * nothing here actually blocks the player, so met is the honest default
 * rather than an unearned red. */
export function summarizeRequirementStatuses(statuses: RequirementStatus[]): { label: string; level: 'met' | 'most' | 'some' | 'unmet' } {
  const known = statuses.filter((status) => status !== 'unknown');
  const metCount = known.filter((status) => status === 'met').length;
  if (known.length === 0 || metCount === known.length) return { label: 'Requirements Met', level: 'met' };
  if (metCount === 0) return { label: 'No Requirements Met', level: 'unmet' };
  if (metCount / known.length > 0.8) return { label: 'Most Requirements Met', level: 'most' };
  return { label: 'Some Requirements Met', level: 'some' };
}
