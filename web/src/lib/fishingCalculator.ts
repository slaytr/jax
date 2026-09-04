import { FISHING_METHODS } from '@shared/fishing-methods.js';
import { SKILLS } from '@shared/config.js';
import { xpForLevel } from '@shared/xp-table.js';

/** Looked up by slug rather than a hardcoded id, so it can't silently drift
 * from config.js's own RAW_SKILLS list — same reasoning as
 * agilityCalculator.ts's own AGILITY_SKILL. */
export const FISHING_SKILL = SKILLS.find((skill: any) => skill.slug === 'fishing')!;
export const FISHING_SKILL_ID = FISHING_SKILL.id;

export interface FishingOption {
  label: string;
  levelRequirement: number;
  /** fishing-methods.js's own `xpPerHourAt99` — the rate *at level 99*, not
   * a level-independent constant the way an Agility course's xp/hour is
   * (Fishing's own catch chance keeps rising with level even past a
   * method's unlock, per that data file's own doc comment on the formula
   * behind it). Treated as a flat rate here anyway: the chance data's own
   * per-level "low"/"high" parameters aren't stored, only the derived
   * level-99 figure, so there's nothing more precise to compute a lower
   * level's real rate from. This makes every hours/ETA figure below an
   * optimistic upper bound below level 99, same simplification a player
   * comparing methods by their own quoted "xp/hr at 99" already makes. */
  xpPerHour: number;
  /** `null` for the one method with no per-catch shape at all (Fishing
   * frenzy — xp comes from flinging fish between spots, not banking a
   * catch). */
  xpPerCatch: number | null;
  wikiUrl: string;
}

/** Every method with a usable level-99 xp/hour figure — a handful
 * (giant crayfish, fungal algae, enriched fungal algae) have none at all
 * (no published catch-chance data, fishing-methods.js's own doc comment)
 * and are dropped rather than shown with a nonsense rate. */
export function fishingOptions(): FishingOption[] {
  const options: FishingOption[] = [];

  for (const method of FISHING_METHODS as any[]) {
    if (method.xpPerHourAt99 == null) continue;
    options.push({
      label: method.name,
      levelRequirement: method.levelRequirement,
      xpPerHour: method.xpPerHourAt99,
      xpPerCatch: method.xpPerCatch ?? null,
      wikiUrl: method.wikiUrl,
    });
  }

  return options;
}

/** Whole catches of `option` to cover `xpRemaining` on its own — `null` for
 * an option with no per-catch figure of its own (Fishing frenzy). Rounds
 * up: a catch that only partly closes the gap still has to land in full. */
export function catchesNeeded(option: FishingOption, xpRemaining: number): number | null {
  return option.xpPerCatch ? Math.ceil(xpRemaining / option.xpPerCatch) : null;
}

/** The single highest xp/hour option a player at `level` already has
 * access to, or `null` below every method's own level requirement — never
 * happens in practice, Fishing 1 already has shrimp/crayfish/minnow, but a
 * level before any method exists shouldn't crash the calculator either. */
export function bestAt(options: FishingOption[], level: number): FishingOption | null {
  const unlocked = options.filter((option) => option.levelRequirement <= level);
  return unlocked.length > 0 ? unlocked.reduce((fastest, option) => (option.xpPerHour > fastest.xpPerHour ? option : fastest)) : null;
}

/** Every option that unlocks strictly after `fromLevel` and at or before
 * `toLevel`, ordered by level first and, within a level two or more
 * methods happen to share, fastest first — the raw material
 * FishingCalculator.vue groups into one "what to switch to here" choice
 * per level. */
export function unlocksInRange(fromLevel: number, toLevel: number, options: FishingOption[]): FishingOption[] {
  return options
    .filter((option) => option.levelRequirement > fromLevel && option.levelRequirement <= toLevel)
    .sort((a, b) => a.levelRequirement - b.levelRequirement || b.xpPerHour - a.xpPerHour);
}

/** One stretch of the route at a single method — from wherever the
 * previous segment (or the player's own current xp) left off, to either
 * the next method switch or the target itself. */
export interface FishingSegment {
  option: FishingOption;
  fromLevel: number;
  toLevel: number;
  xpInSegment: number;
  hours: number;
  catches: number | null;
}

/**
 * Builds a route from an explicit, already level-ordered sequence of
 * switches — same shape as agilityCalculator.ts's own buildRoute, just
 * against FishingOption/catchesNeeded instead of AgilityOption/lapsNeeded.
 * See that one's own doc comment for the full reasoning (explicit switches
 * rather than a re-optimised route, clamped to targetXp, a trailing
 * zero-xp segment dropped unless it's the only one).
 */
export function buildRoute(
  currentLevel: number,
  currentXp: number,
  targetLevel: number,
  targetXp: number,
  startOption: FishingOption,
  switches: FishingOption[],
): FishingSegment[] {
  const segments: FishingSegment[] = [];
  let current = startOption;
  let fromLevel = currentLevel;
  let fromXp = currentXp;

  for (const point of [...switches, null]) {
    const toLevel = point ? point.levelRequirement : targetLevel;
    const rawToXp = point ? (xpForLevel(FISHING_SKILL, toLevel) ?? targetXp) : targetXp;
    const toXp = Math.min(rawToXp, targetXp);
    const xpInSegment = Math.max(0, toXp - fromXp);
    segments.push({ option: current, fromLevel, toLevel, xpInSegment, hours: xpInSegment / current.xpPerHour, catches: catchesNeeded(current, xpInSegment) });

    if (toXp >= targetXp || !point) break;
    current = point;
    fromLevel = toLevel;
    fromXp = toXp;
  }

  const meaningful = segments.filter((segment) => segment.xpInSegment > 0);
  return meaningful.length > 0 ? meaningful : segments.slice(0, 1);
}

/** The switches buildRoute needs to reproduce the fully-automatic route —
 * every level, among everything unlocking there, where the fastest option
 * actually beats whatever was fastest before it. Same shape as
 * agilityCalculator.ts's own optimalSwitches. */
export function optimalSwitches(currentLevel: number, targetLevel: number, options: FishingOption[]): FishingOption[] {
  const initial = bestAt(options, currentLevel);
  if (!initial) return [];

  const levels = [...new Set(unlocksInRange(currentLevel, targetLevel, options).map((option) => option.levelRequirement))];
  const switches: FishingOption[] = [];
  let runningBest = initial;
  for (const level of levels) {
    const candidate = bestAt(options, level)!;
    if (candidate.xpPerHour > runningBest.xpPerHour) {
      switches.push(candidate);
      runningBest = candidate;
    }
  }
  return switches;
}

export interface FishingPlan {
  xpRemaining: number;
  segments: FishingSegment[];
  hoursRemaining: number;
}

/** The fully-automatic plan — bestAt for a starting method, optimalSwitches
 * for the route, buildRoute to actually walk it. Same composition as
 * agilityCalculator.ts's own planAgility. */
export function planFishing(currentLevel: number, currentXp: number, targetLevel: number, targetXp: number, options: FishingOption[]): FishingPlan {
  const xpRemaining = Math.max(0, targetXp - currentXp);

  const initial = bestAt(options, currentLevel);
  if (!initial) return { xpRemaining, segments: [], hoursRemaining: 0 };

  const segments = buildRoute(currentLevel, currentXp, targetLevel, targetXp, initial, optimalSwitches(currentLevel, targetLevel, options));
  return { xpRemaining, segments, hoursRemaining: segments.reduce((sum, segment) => sum + segment.hours, 0) };
}

/**
 * Re-derives which of `startOption`/`switches` is actually active *now*,
 * for a saved route (GoalGraphCalculatorNode.vue) whose player may have
 * kept levelling since it was saved — same reasoning and shape as
 * agilityCalculator.ts's own liveRoute.
 */
export function liveRoute(
  currentLevel: number,
  currentXp: number,
  targetLevel: number,
  targetXp: number,
  startOption: FishingOption,
  switches: FishingOption[],
): FishingSegment[] {
  let effectiveStart = startOption;
  for (const option of switches) {
    if (option.levelRequirement <= currentLevel) effectiveStart = option;
  }
  const stillAhead = switches.filter((option) => option.levelRequirement > currentLevel);
  return buildRoute(currentLevel, currentXp, targetLevel, targetXp, effectiveStart, stillAhead);
}

// "4h"/"45m"-style hour formatting is identical to Agility's own — reused
// rather than duplicated, since it has nothing skill-specific in it.
export { formatHours } from './agilityCalculator';
