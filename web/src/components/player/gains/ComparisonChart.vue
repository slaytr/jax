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
  CLUSTER_GAP,
  HEIGHT,
  niceStep,
  PAD_LEFT_AXIS,
  PAD_X,
  WIDTH,
} from '@/lib/barChartGeometry';

/**
 * Grouped bars: the x-axis is days, one thin bar per group member per day,
 * so a day this player trained hard reads next to how everyone else did
 * that same day. Ported from player-gains.js's comparisonChart(). Every
 * player keeps a fixed sub-slot within each day's cluster (roster order),
 * hidden or not, so toggling a player never shifts anyone else's bar
 * sideways. Scaled to the tallest bar across *every* player (not just the
 * visible ones) so hiding the current leader doesn't rescale everyone
 * else's bars taller.
 */
const props = defineProps<{
  playerRows: Array<{ player: { slug: string; name: string; colour: string }; entries: Array<{ dayStart: number; gained: number | null }> }>;
  showLabels: boolean;
  label: string;
  unit: string;
  formatValue: (value: number) => string;
  hiddenSlugs: Set<string>;
  subjectSlug: string;
  emphasizedSlugs: Set<string>;
}>();

const emit = defineEmits<{ toggleEmphasis: [slug: string] }>();

const dayCount = computed(() => props.playerRows[0]?.entries.length ?? 0);
const plotWidth = computed(() => WIDTH - PAD_LEFT_AXIS - PAD_X);
const daySlot = computed(() => plotWidth.value / dayCount.value);
const barSlot = computed(() => (daySlot.value - BAR_GAP) / props.playerRows.length);
const barWidth = computed(() => Math.max(0.5, barSlot.value - CLUSTER_GAP));
const rawMax = computed(() =>
  Math.max(...props.playerRows.flatMap((row) => row.entries.map((entry) => entry.gained ?? 0)), 1),
);
const step = computed(() => niceStep(rawMax.value, AXIS_TICKS));
const axisMax = computed(() => axisMaxFor(rawMax.value, step.value));
const ticks = computed(() => barAxisTicks(axisMax.value, step.value));

interface Day {
  dayStart: number;
  labelX: number;
  bars: Array<{
    key: string;
    x: number;
    y: number;
    width: number;
    height: number;
    isOther: boolean;
    isEmphasized: boolean;
    slug: string;
    name: string;
    colour: string;
    gained: number;
  }>;
}

const days = computed<Day[]>(() => {
  const list: Day[] = [];
  for (let day = 0; day < dayCount.value; day += 1) {
    const dayStart = props.playerRows[0].entries[day].dayStart;
    const clusterX = PAD_LEFT_AXIS + day * daySlot.value;

    const bars: Day['bars'] = [];
    props.playerRows.forEach((row, p) => {
      if (props.hiddenSlugs.has(row.player.slug)) return;
      const entry = row.entries[day];
      if (entry.gained === null) return;

      bars.push({
        key: row.player.slug,
        x: clusterX + p * barSlot.value,
        y: BASELINE - barHeight(entry.gained, axisMax.value),
        width: barWidth.value,
        height: barHeight(entry.gained, axisMax.value),
        isOther: row.player.slug !== props.subjectSlug,
        isEmphasized: props.emphasizedSlugs.has(row.player.slug),
        slug: row.player.slug,
        name: row.player.name,
        colour: row.player.colour,
        gained: entry.gained,
      });
    });

    list.push({ dayStart, labelX: clusterX + daySlot.value / 2, bars });
  }
  return list;
});

function barTooltip(bar: Day['bars'][number], dayStart: number) {
  return () =>
    tooltipContent(
      bar.name,
      [
        [props.label, bar.gained > 0 ? `+${formatNumber(bar.gained)}${props.unit}` : 'none'],
        ['Day', formatUtcMidnight(dayStart)],
      ],
      bar.colour,
    );
}
</script>

<template>
  <svg
    :viewBox="`0 0 ${WIDTH} ${HEIGHT}`"
    class="bar-chart-svg"
    role="img"
    :aria-label="`${label} per day, one bar per group member, over the last ${dayCount} days`"
  >
    <template v-for="tick in ticks" :key="tick.value">
      <line :x1="PAD_LEFT_AXIS" :x2="WIDTH - PAD_X" :y1="tick.y" :y2="tick.y" class="bar-chart-gridline" />
      <text :x="PAD_LEFT_AXIS - 4" :y="tick.y" class="bar-chart-axis-label" text-anchor="end">
        {{ tick.value === 0 ? '0' : formatValue(tick.value) }}
      </text>
    </template>

    <template v-for="day in days" :key="day.dayStart">
      <text v-if="showLabels" :x="day.labelX" :y="HEIGHT - 4" class="bar-chart-label" text-anchor="middle">
        {{ formatShortDate(day.dayStart) }}
      </text>
      <rect
        v-for="bar in day.bars"
        :key="bar.key"
        :x="bar.x.toFixed(2)"
        :y="bar.y.toFixed(2)"
        :width="bar.width.toFixed(2)"
        :height="bar.height.toFixed(2)"
        rx="1"
        class="bar-chart-bar"
        :class="{ 'is-other-player': bar.isOther, 'is-emphasized': bar.isOther && bar.isEmphasized }"
        :style="{ '--accent': bar.colour }"
        tabindex="0"
        v-tooltip="barTooltip(bar, day.dayStart)"
        @click="emit('toggleEmphasis', bar.slug)"
      />
    </template>
  </svg>
</template>
