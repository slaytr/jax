import { xpForLevel } from '@shared/xp-table.js';

/**
 * Pure logic behind the Goals tab's cards, sections, and progress bars —
 * split out of the old player-goals.js's DOM-building so it's reusable and
 * testable on its own, same "pure logic in lib/, DOM in .vue" convention as
 * the rest of this port.
 */

export const LABEL_COLOURS = ['#0b8fa3', '#cc3346', '#199e70', '#3987e5', '#dd6296', '#d95926', '#c98500', '#8b6fd9'];
export const DEFAULT_LABEL_COLOUR = '#776d5f';

export const startValueOf = (goal: any) => (goal.targetType === 'level' ? goal.startLevel : goal.startXp);

/** A goal's own target, in xp — an `xp`-type goal's targetValue already is
 * xp; a `level`-type goal's targetValue is a level number, resolved
 * through the skill's own curve. Falls back to `currentXp` on an
 * out-of-range level rather than propagating undefined into the
 * arithmetic — reads as "done" for a broken target instead of crashing. */
export function targetXpOf(goal: any, skill: any, currentXp: number): number {
  return (goal.targetType === 'xp' ? goal.targetValue : xpForLevel(skill, goal.targetValue)) ?? currentXp;
}

/** A quest requirement's own starting point, in xp — the *threshold* of
 * `goal.startLevel`, not the exact raw xp captured the moment the
 * requirement was created. See the original player-goals.js doc comment
 * for why: resolving through the level threshold keeps a requirement's
 * percent scoped to its own span instead of being dominated by xp banked
 * long before the requirement existed. */
export function baseXpOf(goal: any, skill: any): number {
  return goal.targetType === 'level' ? xpForLevel(skill, goal.startLevel) : goal.startXp;
}

/** Fraction of the way from `fromXp` to `toXp` that `currentXp` has
 * reached, clamped 0-1 — xp throughout, never level (a level-type goal's
 * own level only moves in big jumps). */
export function xpProgressFraction(fromXp: number, currentXp: number, toXp: number): number {
  const span = toXp - fromXp;
  if (span <= 0) return 1;
  return Math.min(1, Math.max(0, (currentXp - fromXp) / span));
}

export const goalTargetLabel = (goal: any) =>
  goal.targetType === 'level' ? `Level ${goal.targetValue}` : `${goal.targetValue} xp`;

/** Ember (far) -> warn (getting there) -> gain (green, done) — one shared
 * gradient every progress fill reveals more of as a goal gets closer to
 * complete. Only meant for an in-progress fill; a completed one is styled
 * solid green by its own CSS instead. */
export const PROGRESS_GRADIENT = 'linear-gradient(to right, var(--ember), var(--warn) 35%, var(--gain) 70%)';

export interface ProgressFillStyle {
  width: string;
  backgroundImage: string;
  backgroundSize?: string;
  // Vue's :style binding requires an index signature to accept a plain
  // object with CSS custom-property-shaped keys — not used here, just
  // satisfies that type.
  [key: string]: string | undefined;
}

/** `widthFraction` (0-1) is how wide the fill element itself should
 * render; `percentFraction` (defaults to the same value) is the goal's own
 * completion share — the two differ for a two-tone subgoal row whose
 * growth segment renders at a different, absolute-scale width. */
export function progressFillStyle(widthFraction: number, percentFraction = widthFraction): ProgressFillStyle {
  return {
    width: `${(widthFraction * 100).toFixed(1)}%`,
    backgroundImage: PROGRESS_GRADIENT,
    backgroundSize: percentFraction > 0 ? `${(100 / percentFraction).toFixed(1)}% 100%` : undefined,
  };
}

/** Every distinct non-empty value of `field` across `goals`, alphabetised. */
export function distinctValues(goals: any[], field: string): string[] {
  return [...new Set(goals.map((goal) => goal[field]).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

/** Active ones first (creation order), completed ones shuffled to the
 * bottom (most recently finished first). */
export function orderByStatus(goals: any[]): any[] {
  const active = goals.filter((goal) => !goal.completedAt);
  const completed = goals.filter((goal) => goal.completedAt).sort((a, b) => Date.parse(b.completedAt) - Date.parse(a.completedAt));
  return [...active, ...completed];
}

export interface GoalSection {
  title: string | null;
  goals: any[];
}

/** Splits `goals` into one section per group, alphabetised, plus a final
 * catch-all for goals with no group — titled "Skills" only when there's at
 * least one *named* group to distinguish it from. */
export function goalSections(goals: any[]): GoalSection[] {
  const groupNames = distinctValues(goals, 'group');
  const sections: GoalSection[] = groupNames.map((name) => ({ title: name, goals: goals.filter((goal) => goal.group === name) }));

  const ungrouped = goals.filter((goal) => !goal.group);
  if (ungrouped.length > 0) sections.push({ title: groupNames.length > 0 ? 'Skills' : null, goals: ungrouped });

  return sections;
}

export const sectionIsComplete = (section: GoalSection) => section.goals.length > 0 && section.goals.every((goal) => goal.completedAt);

const latestCompletion = (section: GoalSection) => Math.max(...section.goals.map((goal) => Date.parse(goal.completedAt)));

/** Fully-done sections drop below every section that still has something
 * active in it; completed sections themselves sort most-recently-finished
 * first. */
export function orderSectionsByStatus(sections: GoalSection[]): GoalSection[] {
  const active = sections.filter((section) => !sectionIsComplete(section));
  const completed = sections.filter(sectionIsComplete).sort((a, b) => latestCompletion(b) - latestCompletion(a));
  return [...active, ...completed];
}

/** Every distinct label name actually used by at least one of `goals`,
 * alphabetised — the filter dropdown reads off this, not the full label
 * registry, so it only ever offers something that actually narrows the
 * list. */
export function distinctLabelNames(goals: any[]): string[] {
  return [...new Set(goals.flatMap((goal) => goal.labels ?? []))].sort((a, b) => a.localeCompare(b));
}

/** Distinct label names in most-recently-used order — the most recently
 * *started* goal's own labels first, skipping names already seen. */
export function recentLabelNames(goals: any[]): string[] {
  const byRecency = [...goals].sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt));
  return [...new Set(byRecency.flatMap((goal) => goal.labels ?? []))];
}

export interface SkillGoalProgress {
  currentValue: number;
  currentXp: number;
  targetXp: number;
  fraction: number;
}

/** Every number a skill goal's own progress readout needs. `requirementScoped`
 * picks which of two spans the fraction is measured across: true scopes it
 * to just this requirement's own startLevel->targetLevel threshold (a quest
 * requirement); false measures since the goal's own startXp instead (a
 * personal milestone). */
export function skillGoalProgress(goal: any, skill: any, player: any, requirementScoped: boolean): SkillGoalProgress {
  const value = player.skillById?.[goal.skillId];
  const currentValue = goal.targetType === 'level' ? (value?.level ?? goal.startLevel) : (value?.xp ?? goal.startXp);
  const currentXp = value?.xp ?? goal.startXp;
  const targetXp = targetXpOf(goal, skill, currentXp);
  const baseXp = requirementScoped ? baseXpOf(goal, skill) : goal.startXp;
  const fraction = xpProgressFraction(baseXp, currentXp, targetXp);
  return { currentValue, currentXp, targetXp, fraction };
}

export interface CompletedSkillStats {
  startedMs: number;
  completedMs: number;
  levelsGained: number;
  xpGained: number;
  ratePerDay: number;
}

/** `ratePerDay` floors its elapsed time at one hour — a goal completed
 * within minutes of being set would otherwise divide by a near-zero span
 * and report an absurd rate rather than just a fast one. */
export function completedSkillStats(goal: any): CompletedSkillStats {
  const startedMs = Date.parse(goal.startedAt);
  const completedMs = Date.parse(goal.completedAt);
  const levelsGained = (goal.completedLevel ?? goal.startLevel) - goal.startLevel;
  const xpGained = (goal.completedXp ?? goal.startXp) - goal.startXp;
  const days = Math.max((completedMs - startedMs) / 86400000, 1 / 24);
  return { startedMs, completedMs, levelsGained, xpGained, ratePerDay: xpGained / days };
}
