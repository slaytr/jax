<script setup lang="ts">
import { computed } from 'vue';
import { Handle, Position } from '@vue-flow/core';

import { WIKI_ICON } from '@shared/config.js';
import { formatNumber } from '@shared/format.js';
import { levelForXp, xpForLevel } from '@shared/xp-table.js';
import { AGILITY_SKILL, agilityOptions, formatHours, liveRoute as agilityLiveRoute, type AgilityOption } from '@/lib/agilityCalculator';
import { FISHING_SKILL, fishingOptions, liveRoute as fishingLiveRoute, type FishingOption } from '@/lib/fishingCalculator';
import { progressFillStyle, xpProgressFraction } from '@/lib/goals';
import type { GoalGraphCalculatorNode } from '@/composables/useGoalGraphCalculatorNodes';

/**
 * One saved calculator route on the goal graph canvas (GoalsGraph.vue) —
 * dropped by AgilityCalculator.vue's or FishingCalculator.vue's own "+"
 * button, a snapshot of *which* options to train on and *what* the target
 * is, not of the numbers themselves: `data.player` is the same live player
 * object every goal node already reads from, so `value`/`route`/
 * `totalHours` below all recompute on every render exactly like a goal's
 * own progress bar does — this node catches up on its own as the player
 * actually gains xp, rather than freezing at whatever the numbers happened
 * to be the moment it was saved. Each skill's own `liveRoute` (not the
 * plain `buildRoute` the interactive calculator uses) is what makes that
 * correct even once the player's levelled past one of the saved switches.
 *
 * `data.node.skillId` picks which skill's own data this node reads —
 * AGILITY_SKILL/agilityOptions/agilityLiveRoute or FISHING_SKILL/
 * fishingOptions/fishingLiveRoute, kept as two separate self-contained
 * imports rather than one generic engine (same reasoning as
 * agilityCalculator.ts/fishingCalculator.ts themselves not sharing one) —
 * `skill`/`options`/`route` below are the only three places that
 * distinction actually matters; everything past that reads identically
 * either way.
 *
 * Read-only by design — this is "what I saved", not a second interactive
 * calculator instance; reopen that skill's own calculator to build a
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

const isFishing = computed(() => props.data.node.skillId === FISHING_SKILL.id);
const skill = computed(() => (isFishing.value ? FISHING_SKILL : AGILITY_SKILL));
const options = computed<(AgilityOption | FishingOption)[]>(() => (isFishing.value ? fishingOptions() : agilityOptions()));

const value = computed(() => props.data.player.skillById?.[skill.value.id] ?? { level: 1, xp: 0 });

const targetLevel = computed(() => {
  const node = props.data.node;
  return node.targetType === 'level' ? node.targetValue : levelForXp(skill.value, node.targetValue);
});
const targetXp = computed(() => {
  const node = props.data.node;
  return node.targetType === 'xp' ? node.targetValue : (xpForLevel(skill.value, node.targetValue) ?? value.value.xp);
});

const startOption = computed(() => options.value.find((option) => option.label === props.data.node.startOptionLabel));
const switches = computed(() => props.data.node.switchLabels.map((label) => options.value.find((option) => option.label === label)).filter((option): option is AgilityOption | FishingOption => !!option));

const route = computed(() => {
  if (!startOption.value) return [];
  const liveRoute = isFishing.value ? fishingLiveRoute : agilityLiveRoute;
  return (liveRoute as any)(value.value.level, value.value.xp, targetLevel.value, targetXp.value, startOption.value, switches.value);
});
const totalHours = computed(() => route.value.reduce((sum: number, segment: any) => sum + segment.hours, 0));

/** From this node's own frozen startXp (useGoalGraphCalculatorNodes.ts's
 * own doc comment on why that one field is a real snapshot) to the live
 * current xp, against the target — same xpProgressFraction every other
 * skill goal's own progress bar already uses. */
const progressFraction = computed(() => xpProgressFraction(props.data.node.startXp, value.value.xp, targetXp.value));

/** "laps required"/"catches required" — the count itself is already shown
 * as its own big number (goal-graph-calculator-node-laps-value below), so
 * this is just the unit word, not the count again. A segment with no
 * per-unit figure of its own (Agility's Brimhaven ticket mechanic, Fishing
 * frenzy) reads as no count line at all rather than a bare "—". */
function formatUnit(count: number | null): string | null {
  if (count === null) return null;
  const unit = isFishing.value ? 'catch' : 'lap';
  return `${unit}${count === 1 ? '' : unit === 'catch' ? 'es' : 's'}`;
}
</script>

<template>
  <div class="goal-graph-calculator-node">
    <Handle type="target" :position="Position.Left" class="goal-graph-calculator-node-handle" />
    <div class="goal-graph-calculator-node-header">
      <span class="goal-graph-calculator-node-title">{{ skill.name }} calculator</span>
      <button type="button" class="goal-graph-calculator-node-delete nodrag" aria-label="Delete this calculator" @click="data.onRemove()">×</button>
    </div>

    <!-- The three values this node exists to surface: current, target, and
         (per option, below) laps/catches required — everything else here
         (option names, wiki links, xp/hr, the ETA) is still shown, just
         visually secondary to these. The progress bar reads off the same
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
        <div v-if="formatUnit(segment.laps ?? segment.catches)" class="goal-graph-calculator-node-laps">
          <span class="goal-graph-calculator-node-laps-value">{{ formatNumber(segment.laps ?? segment.catches) }}</span>
          <span class="goal-graph-calculator-node-laps-tag">{{ formatUnit(segment.laps ?? segment.catches) }} required</span>
        </div>
        <p class="goal-graph-calculator-node-step-stats">{{ formatNumber(segment.option.xpPerHour) }} xp/hr</p>
      </div>
    </div>
  </div>
</template>
