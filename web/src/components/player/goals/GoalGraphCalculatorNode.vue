<script setup lang="ts">
import { computed } from 'vue';
import { Handle, Position } from '@vue-flow/core';

import { WIKI_ICON } from '@shared/config.js';
import { formatNumber } from '@shared/format.js';
import { levelForXp, xpForLevel } from '@shared/xp-table.js';
import { AGILITY_SKILL, agilityOptions, formatHours, liveRoute, type AgilityOption } from '@/lib/agilityCalculator';
import { progressFillStyle, xpProgressFraction } from '@/lib/goals';
import type { GoalGraphCalculatorNode } from '@/composables/useGoalGraphCalculatorNodes';

/**
 * One saved calculator route on the goal graph canvas (GoalsGraph.vue) —
 * dropped by AgilityCalculator.vue's own "+" button, a snapshot of *which*
 * courses to train on and *what* the target is, not of the numbers
 * themselves: `data.player` is the same live player object every goal node
 * already reads from, so `value`/`route`/`totalHours` below all recompute
 * on every render exactly like a goal's own progress bar does — this node
 * catches up on its own as the player actually gains Agility xp, rather
 * than freezing at whatever the numbers happened to be the moment it was
 * saved. agilityCalculator.ts's own `liveRoute` (not the plain
 * `buildRoute` the interactive calculator uses) is what makes that
 * correct even once the player's levelled past one of the saved switches.
 *
 * Read-only by design — this is "what I saved", not a second interactive
 * calculator instance; reopen AgilityCalculator.vue itself to build a
 * different route. Dragging (repositioning) is Vue Flow's own built-in
 * node drag, same as a goal node; the delete button carries `nodrag` so
 * clicking it doesn't also start one.
 *
 * The one `<Handle>` is purely structural and never drawn (`connectable:
 * false` on the node itself, GoalsGraph.vue's own calculatorGraphNodes) —
 * left in place as a real anchor point, in case a future edge back to
 * whichever goal this route serves is worth drawing again.
 */
const props = defineProps<{
  data: {
    node: GoalGraphCalculatorNode;
    player: { skillById?: Record<number, { level: number; xp: number }> };
    onRemove: () => void;
  };
}>();

const options = agilityOptions();

const value = computed(() => props.data.player.skillById?.[AGILITY_SKILL.id] ?? { level: 1, xp: 0 });

const targetLevel = computed(() => {
  const node = props.data.node;
  return node.targetType === 'level' ? node.targetValue : levelForXp(AGILITY_SKILL, node.targetValue);
});
const targetXp = computed(() => {
  const node = props.data.node;
  return node.targetType === 'xp' ? node.targetValue : (xpForLevel(AGILITY_SKILL, node.targetValue) ?? value.value.xp);
});

const startOption = computed<AgilityOption | undefined>(() => options.find((option) => option.label === props.data.node.startOptionLabel));
const switches = computed<AgilityOption[]>(() =>
  props.data.node.switchLabels.map((label) => options.find((option) => option.label === label)).filter((option): option is AgilityOption => !!option),
);

const route = computed(() =>
  startOption.value ? liveRoute(value.value.level, value.value.xp, targetLevel.value, targetXp.value, startOption.value, switches.value) : [],
);
const totalHours = computed(() => route.value.reduce((sum, segment) => sum + segment.hours, 0));

/** From this node's own frozen startXp (useGoalGraphCalculatorNodes.ts's
 * own doc comment on why that one field is a real snapshot) to the live
 * current xp, against the target — same xpProgressFraction every other
 * skill goal's own progress bar already uses. */
const progressFraction = computed(() => xpProgressFraction(props.data.node.startXp, value.value.xp, targetXp.value));

function formatLaps(count: number | null): string | null {
  return count === null ? null : `${formatNumber(count)} lap${count === 1 ? '' : 's'}`;
}
</script>

<template>
  <div class="goal-graph-calculator-node">
    <Handle type="target" :position="Position.Left" class="goal-graph-calculator-node-handle" />
    <div class="goal-graph-calculator-node-header">
      <span class="goal-graph-calculator-node-title">Agility calculator</span>
      <button type="button" class="goal-graph-calculator-node-delete nodrag" aria-label="Delete this calculator" @click="data.onRemove()">×</button>
    </div>

    <!-- The three values this node exists to surface: current, target, and
         (per course, below) laps required — everything else here (course
         names, wiki links, xp/hr, the ETA) is still shown, just visually
         secondary to these. The progress bar reads off the same
         current/target pair as the two big numbers above it, just as a
         fill rather than digits — startXp (frozen at save time) to
         current to target, xpProgressFraction. -->
    <div class="goal-graph-calculator-node-levels">
      <div class="goal-graph-calculator-node-level">
        <span class="goal-graph-calculator-node-level-tag">Current</span>
        <span class="goal-graph-calculator-node-level-value">Lv {{ formatNumber(value.level) }}</span>
        <span class="goal-graph-calculator-node-level-sub">{{ formatNumber(value.xp) }} xp</span>
      </div>
      <span class="goal-graph-calculator-node-level-arrow">→</span>
      <div class="goal-graph-calculator-node-level">
        <span class="goal-graph-calculator-node-level-tag">Target</span>
        <span class="goal-graph-calculator-node-level-value">Lv {{ formatNumber(targetLevel) }}</span>
        <span class="goal-graph-calculator-node-level-sub">{{ formatNumber(targetXp) }} xp</span>
      </div>
    </div>
    <div class="goal-graph-calculator-node-progress">
      <div class="goal-graph-calculator-node-track" role="presentation">
        <span class="goal-graph-calculator-node-fill" :style="progressFillStyle(progressFraction)" />
      </div>
      <span class="goal-graph-calculator-node-eta">Est. {{ formatHours(totalHours) }}</span>
    </div>

    <div v-for="segment in route" :key="`${segment.option.label}-${segment.fromLevel}`" class="goal-graph-calculator-node-step">
      <div class="goal-graph-calculator-node-step-name">
        <span>{{ segment.option.label }}</span>
        <a :href="segment.option.wikiUrl" target="_blank" rel="noopener" title="View on the wiki" class="calculator-route-wiki nodrag">
          <img :src="WIKI_ICON" alt="" width="12" height="12" decoding="async" />
        </a>
      </div>
      <div class="goal-graph-calculator-node-step-body">
        <div v-if="formatLaps(segment.laps)" class="goal-graph-calculator-node-laps">
          <span class="goal-graph-calculator-node-laps-value">{{ formatNumber(segment.laps!) }}</span>
          <span class="goal-graph-calculator-node-laps-tag">lap{{ segment.laps === 1 ? '' : 's' }} required</span>
        </div>
        <p class="goal-graph-calculator-node-step-stats">{{ formatNumber(segment.option.xpPerHour) }} xp/hr</p>
      </div>
    </div>
  </div>
</template>
