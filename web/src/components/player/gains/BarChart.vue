<script setup lang="ts">
import { computed } from 'vue';

import { formatShortDate, formatUtcMidnight, formatNumber } from '@shared/format.js';
import { tooltipContent, vTooltip } from '@/lib/tooltipDirective';
import {
  AXIS_TICKS,
  axisMaxFor,
  BAR_GAP,
  barAxisTicks,
  barHeight,
  BASELINE,
  HEIGHT,
  MAX_BAR_WIDTH,
  niceStep,
  PAD_LEFT_AXIS,
  PAD_X,
  WIDTH,
} from '@/lib/barChartGeometry';

/**
 * One bar per day for this one player — Levels/XP/Quest points gained.
 * Ported from player-gains.js's barChart(). A day before the group's own
 * tracking history (`gained: null`) gets no bar at all: an empty slot
 * reads as "no data yet", where a zero-height bar would misread as
 * "gained nothing" on a day that was never actually tracked.
 */
const props = defineProps<{
  entries: Array<{ dayStart: number; gained: number | null }>;
  accent: string;
  showLabels: boolean;
  label: string;
  unit: string;
  showAxis: boolean;
  formatValue: (value: number) => string;
}>();

const padLeft = computed(() => (props.showAxis ? PAD_LEFT_AXIS : PAD_X));
const plotWidth = computed(() => WIDTH - padLeft.value - PAD_X);
const slot = computed(() => plotWidth.value / props.entries.length);
const barWidth = computed(() => Math.min(MAX_BAR_WIDTH, slot.value - BAR_GAP));
const rawMax = computed(() => Math.max(...props.entries.map((entry) => entry.gained ?? 0), 1));
const step = computed(() => (props.showAxis ? niceStep(rawMax.value, AXIS_TICKS) : null));
const maxGained = computed(() => (props.showAxis && step.value ? axisMaxFor(rawMax.value, step.value) : rawMax.value));
const ticks = computed(() => (props.showAxis && step.value ? barAxisTicks(maxGained.value, step.value) : []));

const bars = computed(() =>
  props.entries.map((entry, i) => {
    const slotX = padLeft.value + i * slot.value;
    const dayLabelX = slotX + slot.value / 2;
    if (entry.gained === null) return { dayLabelX, bar: null, dayStart: entry.dayStart };
    const height = barHeight(entry.gained, maxGained.value);
    return {
      dayLabelX,
      dayStart: entry.dayStart,
      bar: {
        x: slotX + (slot.value - barWidth.value) / 2,
        y: BASELINE - height,
        width: barWidth.value,
        height,
        gained: entry.gained,
      },
    };
  }),
);

function barTooltip(gained: number, dayStart: number) {
  return () =>
    tooltipContent(
      formatUtcMidnight(dayStart),
      [[props.label, gained > 0 ? `+${formatNumber(gained)}${props.unit}` : 'none']],
      props.accent,
    );
}
</script>

<template>
  <svg
    :viewBox="`0 0 ${WIDTH} ${HEIGHT}`"
    class="bar-chart-svg"
    role="img"
    :aria-label="`${label} per day over the last ${entries.length} days`"
  >
    <template v-if="showAxis">
      <template v-for="tick in ticks" :key="tick.value">
        <line :x1="padLeft" :x2="WIDTH - PAD_X" :y1="tick.y" :y2="tick.y" class="bar-chart-gridline" />
        <text :x="padLeft - 4" :y="tick.y" class="bar-chart-axis-label" text-anchor="end">
          {{ tick.value === 0 ? '0' : formatValue(tick.value) }}
        </text>
      </template>
    </template>

    <template v-for="entry in bars" :key="entry.dayStart">
      <text v-if="showLabels" :x="entry.dayLabelX" :y="HEIGHT - 4" class="bar-chart-label" text-anchor="middle">
        {{ formatShortDate(entry.dayStart) }}
      </text>
      <rect
        v-if="entry.bar"
        :x="entry.bar.x.toFixed(2)"
        :y="entry.bar.y.toFixed(2)"
        :width="entry.bar.width.toFixed(2)"
        :height="entry.bar.height.toFixed(2)"
        rx="2"
        class="bar-chart-bar"
        :style="{ '--accent': accent }"
        tabindex="0"
        v-tooltip="barTooltip(entry.bar.gained, entry.dayStart)"
      />
    </template>
  </svg>
</template>
