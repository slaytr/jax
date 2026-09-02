<script setup lang="ts">
import { computed, nextTick, useTemplateRef, watch } from 'vue';

import { formatRelativeTime, formatUtcMidnight } from '@shared/format.js';
import { tooltipContent, vTooltip } from '@/lib/tooltipDirective';
import { declutterLabels, HEIGHT, PLOT_RIGHT, PAD_LEFT_AXIS, toX, toY, WIDTH, yAxisTicks } from '@/lib/lineChartGeometry';

/**
 * One player's line: a polyline through every point (skipped when there's
 * only one — nothing to connect), a day-mark dot at each UTC-midnight the
 * player has data for, and a head dot on the latest point. Ported from the
 * old gains-line.js, including its draw-in choreography — a line reveals
 * left-to-right (stroke-dasharray/dashoffset) and every dot fades in only
 * once the line has finished drawing, so nothing appears ahead of where
 * the line has actually reached. `animate` is true only when this chart is
 * newly appearing (a fresh period/view), not on every re-render.
 */

const props = defineProps<{
  rows: Array<{
    player: { slug: string; name: string; colour: string };
    points: Array<{ t: number; value: number; x: number; y: number }>;
    dayMarks: Array<{ t: number; value: number; x: number; y: number }>;
  }>;
  formatValue: (value: number) => string;
  valueLabel: string;
  signed: boolean;
  animate: boolean;
}>();

const LINE_DRAW_MS = 900;

const svgRoot = useTemplateRef<SVGSVGElement>('svgRoot');

const allValues = computed(() => props.rows.flatMap((row) => row.points.map((point) => point.value)));
const ticks = computed(() => yAxisTicks(Math.min(...allValues.value), Math.max(...allValues.value)));

const lines = computed(() =>
  props.rows
    .filter((row) => row.points.length > 0)
    .map((row) => ({
      player: row.player,
      row,
      path: row.points.length > 1 ? row.points.map((point) => `${toX(point.x)},${toY(point.y)}`).join(' ') : null,
      head: row.points[row.points.length - 1],
    })),
);

const labels = computed(() =>
  declutterLabels(
    lines.value.map((line) => ({
      player: line.player,
      value: line.head.value,
      y: toY(line.head.y),
    })),
  ),
);

function tooltipFor(row: (typeof props.rows)[number], point: { t: number; value: number }, isDayMark: boolean) {
  return () =>
    tooltipContent(
      row.player.name,
      [
        [props.valueLabel, props.formatValue(point.value)],
        isDayMark ? ['Day', formatUtcMidnight(point.t)] : ['When', formatRelativeTime(new Date(point.t * 1000).toISOString())],
      ],
      row.player.colour,
    );
}

// --- draw-in animation, ported from gains-line.js's revealOnAttach/fadeInAfterDraw ---
// Queried fresh off the DOM each time rather than tracked via per-element
// refs — simpler than threading a ref through a v-for of v-fors, and this
// only ever runs right after (re)render, so the query always sees the
// current elements.
function revealOnAttach(path: SVGGeometryElement) {
  requestAnimationFrame(() => {
    const length = path.getTotalLength();
    path.style.transition = 'none';
    path.style.strokeDasharray = `${length}`;
    path.style.strokeDashoffset = `${length}`;
    path.getBoundingClientRect();
    path.style.transition = `stroke-dashoffset ${LINE_DRAW_MS}ms var(--ease)`;
    path.style.strokeDashoffset = '0';
  });
}

function fadeInAfterDraw(nodes: NodeListOf<Element>) {
  setTimeout(() => {
    for (const node of nodes) (node as SVGElement).style.removeProperty('opacity');
  }, LINE_DRAW_MS);
}

function runEntryAnimation() {
  if (!props.animate || !svgRoot.value) return;
  for (const path of svgRoot.value.querySelectorAll<SVGGeometryElement>('.line-chart-path')) revealOnAttach(path);
  fadeInAfterDraw(svgRoot.value.querySelectorAll('.line-chart-point'));
}

watch(
  () => props.rows,
  async () => {
    await nextTick();
    runEntryAnimation();
  },
  { immediate: true },
);
</script>

<template>
  <svg
    ref="svgRoot"
    :viewBox="`0 0 ${WIDTH} ${HEIGHT}`"
    class="line-chart-svg"
    role="img"
    :aria-label="`${valueLabel} over time, one line per player`"
  >
    <template v-for="tick in ticks" :key="tick.value">
      <line :x1="PAD_LEFT_AXIS" :x2="PLOT_RIGHT" :y1="tick.y" :y2="tick.y" class="line-chart-gridline" />
      <text :x="PAD_LEFT_AXIS - 4" :y="tick.y" class="line-chart-axis-label" text-anchor="end">
        {{ formatValue(tick.value) }}
      </text>
    </template>

    <template v-for="line in lines" :key="line.player.slug">
      <polyline
        v-if="line.path"
        :points="line.path"
        class="line-chart-path"
        :style="{ '--accent': line.player.colour }"
      />
      <circle
        v-for="mark in line.row.dayMarks"
        :key="mark.t"
        :cx="toX(mark.x)"
        :cy="toY(mark.y)"
        r="1.4"
        class="line-chart-point is-day-mark"
        :style="{ '--accent': line.player.colour, opacity: animate ? 0 : undefined }"
        tabindex="0"
        v-tooltip="tooltipFor(line.row, mark, true)"
      />
      <circle
        v-if="line.head"
        :cx="toX(line.head.x)"
        :cy="toY(line.head.y)"
        :r="line.path ? 3 : 3.6"
        class="line-chart-point"
        :style="{ '--accent': line.player.colour, opacity: animate ? 0 : undefined }"
        tabindex="0"
        v-tooltip="tooltipFor(line.row, line.head, false)"
      />
    </template>

    <text
      v-for="label in labels"
      :key="label.player.slug"
      :x="WIDTH - 3"
      :y="label.y"
      class="line-chart-label"
      :style="{ '--accent': label.player.colour }"
    >
      {{ signed ? '+' : '' }}{{ formatValue(label.value) }}
    </text>
  </svg>
</template>
