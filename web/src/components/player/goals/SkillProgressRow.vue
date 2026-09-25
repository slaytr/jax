<script setup lang="ts">
import { computed } from 'vue';

import { formatNumber } from '@shared/format.js';
import { iconFor } from '@shared/config.js';
import { levelForXp, xpForLevel } from '@shared/xp-table.js';
import { progressEdgeColor, progressFillStyle } from '@/lib/goals';
import { tooltipContent, vTooltip } from '@/lib/tooltipDirective';
import { useTheme } from '@/composables/useTheme';

/**
 * icon, name, start value, progress bar, goal level, current level,
 * percent — the single-line anatomy every skill goal renders as, whether
 * it's nested under a quest, standing on its own, or shown in the focus
 * panel. A content-only component (no wrapping row element) — the caller
 * supplies that (a card's own `<li>`, a nested `<li class="goal-subgoal-row">`,
 * or the focus panel's `<div>`), same shape as the legacy view's own
 * skillProgressRowContent, which returned a bare array of children for the
 * same reason.
 *
 * `showLabel` drops the icon+name — see its own doc comment on the prop.
 */
const props = withDefaults(
  defineProps<{
    goal: any;
    skill: { name: string };
    startValue: number;
    currentValue: number;
    targetValue: number;
    fraction: number;
    // The same xp figures the fraction/fill were themselves computed from
    // (skillGoalProgress, lib/goals.ts) — kept separate from
    // startValue/currentValue/targetValue since those are in *level* terms
    // for a level-type goal, where the progress bar's own hover tooltip
    // (below) always wants xp regardless of the goal's own target type.
    currentXp: number;
    targetXp: number;
    baseXp: number;
    canEdit: boolean;
    // Off only for the focus panel's own standalone-skill-goal row
    // (GoalFocusPanel.vue) — its header already names the one skill this
    // row is for, so repeating the icon+name right underneath is pure
    // duplication there. Every other caller (a quest's own list of *distinct*
    // skill requirements) still wants this on, hence the default.
    showLabel?: boolean;
  }>(),
  { showLabel: true },
);

const emit = defineEmits<{ delete: [] }>();

const complete = computed(() => Boolean(props.goal.completedAt));
const percent = computed(() => Math.round((complete.value ? 1 : props.fraction) * 100));

/** The current-level and percent figures (both inside .goal-subgoal-current-
 * box) are coloured to match whatever the progress bar itself shows at its
 * own filled edge (progressEdgeColor, lib/goals.ts) — reading --ember/--warn/
 * --gain off :root isn't reactive on its own, so `theme.value` is
 * referenced here purely to force a recompute on toggle. Left unset once
 * complete: CSS's own `.is-complete .goal-subgoal-current`/`-percent` rules
 * already turn them solid --gain then, same as the bar itself. */
const { theme } = useTheme();
const currentColor = computed(() => {
  void theme.value;
  return complete.value ? undefined : progressEdgeColor(props.fraction);
});

/** Gained scoped the same way the fill itself is (baseXp — a requirement's
 * own startLevel threshold, or the goal's own startXp) rather than the
 * player's whole xp total, so it reads as "how much of *this bar*" rather
 * than double-counting xp banked before the goal even existed. */
/** Every level threshold strictly between this row's own base and target
 * xp, as a 0-1 fraction of that span — empty the moment a goal doesn't
 * actually cross a level-up (a same-level xp goal, or start/target one
 * level apart), so a plain bar isn't marked up with a tick sitting right
 * on top of one of its own two ends. Always relative to the bar's full
 * base->target span, not the current fill, so a level already passed
 * still shows once the goal's done, same as the track itself staying put
 * past 100%. */
const breakpoints = computed(() => {
  if (props.targetXp <= props.baseXp) return [];
  const span = props.targetXp - props.baseXp;
  const startLevel = levelForXp(props.skill, props.baseXp);
  const endLevel = levelForXp(props.skill, props.targetXp);
  const marks: number[] = [];
  for (let level = startLevel + 1; level <= endLevel; level += 1) {
    const xp = xpForLevel(props.skill, level);
    if (xp === undefined || xp <= props.baseXp || xp >= props.targetXp) continue;
    marks.push((xp - props.baseXp) / span);
  }
  return marks;
});

function trackTooltip() {
  const xpGained = Math.max(0, props.currentXp - props.baseXp);
  const xpRemaining = Math.max(0, props.targetXp - props.currentXp);
  // Same "xp to go" framing as SkillGrid.vue's own cell tooltip — the
  // player's next *skill* level-up, which isn't necessarily this goal's
  // own target (a goal several levels out still counts down to the very
  // next one first). undefined past the skill's own max level (99/120).
  const nextLevelXp = xpForLevel(props.skill, levelForXp(props.skill, props.currentXp) + 1);
  const nextLevel = nextLevelXp === undefined ? 'maxed' : `${formatNumber(Math.max(0, nextLevelXp - props.currentXp))} xp to go`;
  return () =>
    tooltipContent(props.skill.name, [
      ['Gained', `${formatNumber(xpGained)} xp`],
      ['Remaining', `${formatNumber(xpRemaining)} xp`],
      ['Next level', nextLevel],
    ]);
}
</script>

<template>
  <template v-if="showLabel">
    <img class="goal-subgoal-icon" :src="iconFor(skill)" alt="" width="16" height="16" decoding="async" />
    <span class="goal-subgoal-name">{{ skill.name }}</span>
  </template>
  <span class="goal-subgoal-start">{{ formatNumber(startValue) }}</span>
  <div class="goal-subgoal-track" role="presentation" v-tooltip="trackTooltip()">
    <span class="goal-subgoal-fill" :style="complete ? { width: '100%' } : progressFillStyle(fraction)" />
    <template v-if="!complete">
      <span
        v-for="(bp, i) in breakpoints"
        :key="i"
        class="goal-subgoal-breakpoint"
        :style="{ left: `${(bp * 100).toFixed(2)}%` }"
      />
    </template>
  </div>
  <span class="goal-subgoal-target">{{ formatNumber(targetValue) }}</span>
  <span class="goal-subgoal-current-box">
    <span class="goal-subgoal-current" :style="currentColor ? { color: currentColor } : undefined">{{ formatNumber(currentValue) }}</span>
    <span class="goal-subgoal-percent" :style="currentColor ? { color: currentColor } : undefined">{{ percent }}%</span>
  </span>
  <button v-if="canEdit" type="button" class="goal-card-delete" aria-label="Delete this goal" @click="emit('delete')">×</button>
</template>
