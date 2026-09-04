<script setup lang="ts">
import { computed } from 'vue';
import { Handle, Position } from '@vue-flow/core';

import { iconFor, QUEST_POINTS_ICON } from '@shared/config.js';
import { statusOf } from '@shared/quest-status.js';
import { formatCompact, formatNumber } from '@shared/format.js';
import { skillGoalProgress } from '@/lib/goals';
import { tooltipContent, vTooltip } from '@/lib/tooltipDirective';
import { AGILITY_SKILL_ID } from '@/lib/agilityCalculator';
import { FISHING_SKILL_ID } from '@/lib/fishingCalculator';

/**
 * One Vue Flow node in the Goals graph (GoalsGraph.vue) — the same circular
 * icon-in-a-progress-ring design the hand-rolled version used, just now
 * rendered through Vue Flow's own node system so it's draggable and
 * connectable for free. Two `<Handle>`s, both deliberately tiny and
 * centred on the ring rather than the old fixed left/right dots — the
 * drawn edge (GoalGraphEdge.vue) never reads a handle's own position
 * anyway, it always computes its own floating ring-intersection point, so
 * where these actually sit only matters for Vue Flow's own connection
 * bookkeeping, not for anything a viewer sees:
 *
 * - The *target* one is never drawn at all, and has `connectable-start=
 *   "false"` so it can only ever be a connection's landing point, never
 *   where a drag starts. GoalsGraph.vue's own `:connection-radius` gives it
 *   a generous catch radius, so a drag lands on this node from anywhere
 *   reasonably close over its ring rather than needing to hit this literal
 *   point.
 * - The *source* one IS `isHovered`'s own visible connector chip, top
 *   -right of the ring — dragging from it is how a viewer actually starts
 *   a new connection. Shown only while this node (or one it's about to
 *   hand off to — GoalsGraph.vue's own 5s linger) is the one in focus.
 *
 * The calculator shortcut (top-left, `isCalculatorSupported` gated) shares
 * that exact same isHovered-driven show/hide, just a plain clickable icon
 * instead of a Handle — there's nothing to drag it into, one click is the
 * whole interaction. `data.onQuickCalculator` is GoalsGraph.vue's own
 * pre-bound callback (same "callback in node.data" pattern as a sticky
 * note's onRemove/onUpdate), not a Handle-driven Vue Flow connection —
 * `.stop` on both pointerdown and click keeps it from also starting a node
 * drag or toggling this node's own focus panel.
 */
const props = defineProps<{
  id: string;
  data: {
    goal: any;
    isRoot: boolean;
    player: any;
    bySkillId: Map<number, any>;
    focusedId: string | null;
    onQuickCalculator?: () => void;
  };
  isHovered: boolean;
}>();

const goal = computed(() => props.data.goal);
const isQuest = computed(() => goal.value.kind === 'quest');
const skill = computed(() => props.data.bySkillId.get(goal.value.skillId));

/** Only a skill goal, and only for a skill whose calculator actually
 * exists yet (Agility/Fishing so far — CalculatorPanel.vue's own doc
 * comment) — the hover shortcut below is pointless chrome on every other
 * node. */
const isCalculatorSupported = computed(() => !isQuest.value && (goal.value.skillId === AGILITY_SKILL_ID || goal.value.skillId === FISHING_SKILL_ID));

const completedQuestSet = computed(() => new Set(props.data.player.completedQuests ?? []));
const startedQuestSet = computed(() => new Set(props.data.player.startedQuests ?? []));

function questStatus(): 'completed' | 'in-progress' | 'not-started' {
  if (goal.value.completedAt) return 'completed';
  return statusOf({ name: goal.value.questName }, completedQuestSet.value, startedQuestSet.value);
}

const RING_COLOUR_BY_STATUS = { completed: 'var(--gain)', 'in-progress': 'var(--ember)', 'not-started': 'var(--hairline-strong)' };

function skillProgress() {
  return skillGoalProgress(goal.value, skill.value, props.data.player, !props.data.isRoot);
}

const ringStyle = computed(() => {
  if (isQuest.value) return { '--pct': 1, '--ring-colour': RING_COLOUR_BY_STATUS[questStatus()] };
  const pct = goal.value.completedAt ? 1 : skillProgress().fraction;
  return { '--pct': pct, '--ring-colour': 'var(--gain)' };
});

const icon = computed(() => (isQuest.value ? QUEST_POINTS_ICON : iconFor(skill.value)));

/** Under a quest node, its name; under a skill node, xp remaining to the
 * goal rather than the skill's own name — the ring's icon already says
 * which skill this is, so the label is more useful telling you how far
 * off it still is. */
const label = computed(() => {
  if (isQuest.value) return goal.value.questName;
  if (goal.value.completedAt) return 'Complete';
  const progress = skillProgress();
  const remaining = Math.max(0, progress.targetXp - progress.currentXp);
  return formatNumber(remaining);
});
const isFocused = computed(() => goal.value.id === props.data.focusedId);

function tooltip() {
  if (isQuest.value) {
    const status = questStatus();
    const statusLabel = status === 'in-progress' ? 'In progress' : status === 'completed' ? 'Completed' : 'Not started';
    return tooltipContent(goal.value.questName, [['Status', statusLabel]]);
  }

  const progress = skillProgress();
  const isLevel = goal.value.targetType === 'level';
  const currentLabel = isLevel ? formatNumber(progress.currentValue) : formatCompact(progress.currentValue);
  const targetLabel = isLevel ? formatNumber(goal.value.targetValue) : `${formatCompact(goal.value.targetValue)} xp`;
  const percent = Math.round((goal.value.completedAt ? 1 : progress.fraction) * 100);
  return tooltipContent(skill.value?.name ?? 'Skill', [
    ['Progress', `${currentLabel} / ${targetLabel}`],
    ['Complete', `${percent}%`],
  ]);
}
</script>

<template>
  <!-- No click handler here — GoalsGraph.vue listens for Vue Flow's own
       @node-click on <VueFlow> itself, so a genuine drag (Vue Flow already
       tells the two apart) never also fires a focus toggle. -->
  <button
    type="button"
    class="goal-graph-node"
    :class="{ 'is-quest': isQuest, 'is-complete': goal.completedAt, 'is-focused': isFocused }"
    v-tooltip="() => tooltip()"
  >
    <span class="goal-graph-node-ring" :style="ringStyle">
      <span class="goal-graph-node-icon-wrap">
        <img :src="icon" alt="" width="24" height="24" decoding="async" />
      </span>
      <Handle type="target" :position="Position.Left" class="goal-graph-node-target-anchor" :connectable-start="false" />
      <Handle
        type="source"
        :position="Position.Right"
        class="goal-graph-node-connector"
        :class="{ 'is-visible': isHovered }"
        :connectable-end="false"
        title="Drag to another node to link them"
      >
        <svg class="goal-graph-node-connector-icon" viewBox="0 0 18 18" focusable="false">
          <line x1="4" y1="14" x2="14" y2="4" />
          <polyline points="8,4 14,4 14,10" />
        </svg>
      </Handle>
      <span
        v-if="isCalculatorSupported"
        class="goal-graph-node-calculator-shortcut nodrag"
        :class="{ 'is-visible': isHovered }"
        role="button"
        tabindex="0"
        title="Open the Agility calculator for this goal"
        @pointerdown.stop
        @click.stop="data.onQuickCalculator?.()"
        @keydown.enter.stop="data.onQuickCalculator?.()"
      >
        <svg class="goal-graph-node-calculator-shortcut-icon" viewBox="0 0 18 18" focusable="false">
          <rect x="3" y="1.5" width="12" height="15" rx="1.5" />
          <rect x="5" y="3.5" width="8" height="3" rx="0.5" />
          <circle cx="5.75" cy="10" r="0.9" />
          <circle cx="9" cy="10" r="0.9" />
          <circle cx="12.25" cy="10" r="0.9" />
          <circle cx="5.75" cy="13" r="0.9" />
          <circle cx="9" cy="13" r="0.9" />
          <circle cx="12.25" cy="13" r="0.9" />
        </svg>
      </span>
    </span>
    <span class="goal-graph-node-label">{{ label }}</span>
  </button>
</template>
