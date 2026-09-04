import { AGILITY_COURSES } from '@shared/agility-courses.js';
import { SKILLS } from '@shared/config.js';
import { xpForLevel } from '@shared/xp-table.js';

/** Looked up by slug rather than a hardcoded id, so it can't silently drift
 * from config.js's own RAW_SKILLS list. */
export const AGILITY_SKILL = SKILLS.find((skill: any) => skill.slug === 'agility')!;
export const AGILITY_SKILL_ID = AGILITY_SKILL.id;

export interface AgilityOption {
  /** The course's own name, or `"<course> — <variant>"` for one of several
   * routes/brackets through the same course (Hefin's level brackets,
   * Dorgesh-Kaan's routes, Anachronia's sections, Werewolf Skullball's pass
   * timing) — see agility-courses.js's own `variants` doc comment. */
  label: string;
  levelRequirement: number;
  xpPerHour: number;
  /** `null` for the handful of options with no single "one lap, one xp
   * total" shape — Brimhaven's ticket mechanic — see agility-courses.js's
   * own doc comment. Every course with `variants` gives each one its own
   * figure; nothing here needs to know which shape it started as. */
  xpPerLap: number | null;
  wikiUrl: string;
}

/** Every selectable training option across every course — a plain course
 * becomes one option, a course with `variants` becomes one option per
 * variant (each inheriting the course's own levelRequirement/wikiUrl unless
 * it names its own) — flattened once so ranking/filtering elsewhere doesn't
 * need to know which shape a given course happens to be. Options with no
 * usable xp/hour figure (shouldn't exist in the current data, but a course
 * missing one shouldn't crash the calculator) are dropped. */
export function agilityOptions(): AgilityOption[] {
  const options: AgilityOption[] = [];

  for (const course of AGILITY_COURSES as any[]) {
    if (course.variants) {
      for (const variant of course.variants as any[]) {
        const xpPerHour = variant.xpPerHour ?? course.xpPerHour;
        if (!xpPerHour) continue;
        options.push({
          label: `${course.name} — ${variant.label}`,
          levelRequirement: variant.levelRequirement ?? course.levelRequirement,
          xpPerHour,
          xpPerLap: variant.xpPerLap ?? course.xpPerLap ?? null,
          wikiUrl: course.wikiUrl,
        });
      }
    } else if (course.xpPerHour) {
      options.push({
        label: course.name,
        levelRequirement: course.levelRequirement,
        xpPerHour: course.xpPerHour,
        xpPerLap: course.xpPerLap ?? null,
        wikiUrl: course.wikiUrl,
      });
    }
  }

  return options;
}

/** Whole laps of `option` to cover `xpRemaining` on its own — `null` for an
 * option with no per-lap figure of its own (xpPerLap null, Brimhaven's
 * ticket mechanic). Rounds up: a lap that only partly closes the gap still
 * has to be run in full. */
export function lapsNeeded(option: AgilityOption, xpRemaining: number): number | null {
  return option.xpPerLap ? Math.ceil(xpRemaining / option.xpPerLap) : null;
}

/** The single highest xp/hour option a player at `level` already has
 * access to, or `null` below every course's own level requirement — never
 * happens in practice, Agility 1 already has two courses, but a level
 * before any course exists shouldn't crash the calculator either. */
export function bestAt(options: AgilityOption[], level: number): AgilityOption | null {
  const unlocked = options.filter((option) => option.levelRequirement <= level);
  return unlocked.length > 0 ? unlocked.reduce((fastest, option) => (option.xpPerHour > fastest.xpPerHour ? option : fastest)) : null;
}

/** Every option that unlocks strictly after `fromLevel` and at or before
 * `toLevel`, ordered by level first and, within a level two or more
 * courses happen to share (Werewolf and Bandos both unlock at 60), fastest
 * first — the raw material AgilityCalculator.vue groups into one "what to
 * switch to here" choice per level. */
export function unlocksInRange(fromLevel: number, toLevel: number, options: AgilityOption[]): AgilityOption[] {
  return options
    .filter((option) => option.levelRequirement > fromLevel && option.levelRequirement <= toLevel)
    .sort((a, b) => a.levelRequirement - b.levelRequirement || b.xpPerHour - a.xpPerHour);
}

/** One stretch of the route at a single course — from wherever the
 * previous segment (or the player's own current xp) left off, to either
 * the next course switch or the target itself. */
export interface AgilitySegment {
  option: AgilityOption;
  fromLevel: number;
  toLevel: number;
  xpInSegment: number;
  hours: number;
  laps: number | null;
}

/**
 * Builds a route from an explicit, already level-ordered sequence of
 * switches — `switches` says exactly which course to move to at each of
 * its own `levelRequirement`s, with no "is this actually faster" check of
 * its own: this is what actually executes whatever route a viewer's chosen
 * for themselves (AgilityCalculator.vue's own per-level dropdowns), a
 * deliberately slower pick included, not just the optimal one
 * (optimalSwitches below).
 *
 * Every switch's own xp threshold is clamped to `targetXp`: it can fall
 * past it when the target level and target xp don't actually agree (they
 * always do from the calculator's own UI, but this stays correct either
 * way) — the route never needs to go further than the xp actually asked
 * for. A trailing switch that lands exactly on the target contributes a
 * zero-xp segment, dropped below unless it's the only one there is.
 */
export function buildRoute(
  currentLevel: number,
  currentXp: number,
  targetLevel: number,
  targetXp: number,
  startOption: AgilityOption,
  switches: AgilityOption[],
): AgilitySegment[] {
  const segments: AgilitySegment[] = [];
  let current = startOption;
  let fromLevel = currentLevel;
  let fromXp = currentXp;

  for (const point of [...switches, null]) {
    const toLevel = point ? point.levelRequirement : targetLevel;
    const rawToXp = point ? (xpForLevel(AGILITY_SKILL, toLevel) ?? targetXp) : targetXp;
    const toXp = Math.min(rawToXp, targetXp);
    const xpInSegment = Math.max(0, toXp - fromXp);
    segments.push({ option: current, fromLevel, toLevel, xpInSegment, hours: xpInSegment / current.xpPerHour, laps: lapsNeeded(current, xpInSegment) });

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
 * actually beats whatever was fastest before it. AgilityCalculator.vue's
 * own default selection for each level's dropdown (and its "reset to
 * recommended" action), not a route on its own — same-level ties never
 * produce two switches, only the one that actually wins. */
export function optimalSwitches(currentLevel: number, targetLevel: number, options: AgilityOption[]): AgilityOption[] {
  const initial = bestAt(options, currentLevel);
  if (!initial) return [];

  const levels = [...new Set(unlocksInRange(currentLevel, targetLevel, options).map((option) => option.levelRequirement))];
  const switches: AgilityOption[] = [];
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

export interface AgilityPlan {
  xpRemaining: number;
  /** The fully-automatic route, in order — segments[0] is what to train on
   * right now. Empty only when there's no course unlocked at the player's
   * own current level at all (never happens in practice). */
  segments: AgilitySegment[];
  hoursRemaining: number;
}

/** The fully-automatic plan — `bestAt` for a starting course,
 * `optimalSwitches` for the route, `buildRoute` to actually walk it. A thin
 * convenience composition of the three, kept for callers (or a "reset to
 * recommended" action) that just want the recommended answer, not control
 * over each leg of it. */
export function planAgility(currentLevel: number, currentXp: number, targetLevel: number, targetXp: number, options: AgilityOption[]): AgilityPlan {
  const xpRemaining = Math.max(0, targetXp - currentXp);

  const initial = bestAt(options, currentLevel);
  if (!initial) return { xpRemaining, segments: [], hoursRemaining: 0 };

  const segments = buildRoute(currentLevel, currentXp, targetLevel, targetXp, initial, optimalSwitches(currentLevel, targetLevel, options));
  return { xpRemaining, segments, hoursRemaining: segments.reduce((sum, segment) => sum + segment.hours, 0) };
}

/**
 * Re-derives which of `startOption`/`switches` is actually active *now*,
 * for a saved route (GoalGraphCalculatorNode.vue) whose player may have
 * kept levelling since it was saved — buildRoute on its own assumes every
 * switch is still ahead of `currentLevel`, which stops being true the
 * moment a viewer levels past one. Walks forward through whichever saved
 * switches the player's already reached (highest levelRequirement wins) to
 * find the course they'd realistically be training on right now, then
 * hands buildRoute only the switches still actually ahead — so a saved
 * node keeps recomputing correctly for as long as it exists, rather than
 * needing to be re-saved every time a switch point gets passed.
 */
export function liveRoute(
  currentLevel: number,
  currentXp: number,
  targetLevel: number,
  targetXp: number,
  startOption: AgilityOption,
  switches: AgilityOption[],
): AgilitySegment[] {
  let effectiveStart = startOption;
  for (const option of switches) {
    if (option.levelRequirement <= currentLevel) effectiveStart = option;
  }
  const stillAhead = switches.filter((option) => option.levelRequirement > currentLevel);
  return buildRoute(currentLevel, currentXp, targetLevel, targetXp, effectiveStart, stillAhead);
}

/** `4h`/`45m`-style, for the calculator's own "time to goal" readout — a
 * bare xp/hour rate divided out is either an oddly-precise fraction of an
 * hour or an unreadably large one, neither of which reads well next to a
 * goal that might be minutes or might be weeks away. */
export function formatHours(hours: number): string {
  if (!Number.isFinite(hours)) return '—';
  if (hours <= 0) return 'Done';
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))}m`;
  if (hours < 10) return `${hours.toFixed(1)}h`;
  return `${Math.round(hours)}h`;
}
