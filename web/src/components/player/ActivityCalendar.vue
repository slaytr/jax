<script setup lang="ts">
import { computed, nextTick, onMounted, useTemplateRef, watch } from 'vue';

import { computeActivityCalendar, ACTIVITY_CALENDAR_WEEKS } from '@shared/compute.js';
import { formatNumber } from '@shared/format.js';
import { tooltipContent, vTooltip } from '@/lib/tooltipDirective';

/**
 * The per-player masthead's GitHub-style activity tracker: one small square
 * per day over the last year, shaded by that day's xp gain relative to this
 * player's own best day in the window. Ported from activity-calendar.js —
 * the day/shading math itself is @shared/compute.js's computeActivityCalendar,
 * unchanged.
 */
const props = defineProps<{ slug: string; snapshots: any[] }>();

const MONTH_LABEL = new Intl.DateTimeFormat('en-GB', { month: 'short', timeZone: 'UTC' });
const CELL_DATE = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const MIN_LABEL_GAP = 2;

const days = computed(() => computeActivityCalendar(props.snapshots, props.slug));
const maxGained = computed(() =>
  days.value.reduce((max: number, day: any) => (day.gained !== null && day.gained > max ? day.gained : max), 0),
);

interface Cell {
  key: number;
  day: any;
  fillPct: number;
  isZero: boolean;
}

const cells = computed<Cell[]>(() => {
  const list: Cell[] = [];
  for (let column = 0; column < ACTIVITY_CALENDAR_WEEKS; column += 1) {
    for (let row = 0; row < 7; row += 1) {
      const day = days.value[column * 7 + row] ?? null;
      const gained: number | null = day && day.gained !== null ? day.gained : null;
      const ratio = gained !== null && maxGained.value > 0 ? gained / maxGained.value : 0;
      list.push({
        key: column * 7 + row,
        day,
        fillPct: gained !== null && gained > 0 ? 15 + ratio * 85 : 0,
        isZero: gained === 0,
      });
    }
  }
  return list;
});

// Month initials above the grid, one per column where a new month begins —
// consecutive columns still inside the same month stay blank, same
// skip-if-already-labelled idea GitHub's own calendar uses.
const monthLabels = computed(() => {
  const list: string[] = [];
  let lastMonth: number | null = null;
  let lastLabelColumn = -Infinity;

  for (let column = 0; column < ACTIVITY_CALENDAR_WEEKS; column += 1) {
    const first = days.value[column * 7];
    const month = first ? new Date(first.dayStart * 1000).getUTCMonth() : null;
    const monthChanged = month !== null && month !== lastMonth;
    if (monthChanged) lastMonth = month;

    const showLabel = monthChanged && column - lastLabelColumn >= MIN_LABEL_GAP;
    if (showLabel) lastLabelColumn = column;
    list.push(showLabel ? MONTH_LABEL.format(new Date(first.dayStart * 1000)) : '');
  }
  return list;
});

function cellTooltip(cell: Cell) {
  return () => {
    if (!cell.day) return null;
    if (cell.day.gained === null) {
      return tooltipContent(CELL_DATE.format(new Date(cell.day.dayStart * 1000)), [['XP gained', 'not tracked yet']]);
    }
    return tooltipContent(CELL_DATE.format(new Date(cell.day.dayStart * 1000)), [
      ['XP gained', cell.day.gained > 0 ? formatNumber(cell.day.gained) : 'none'],
    ]);
  };
}

const gridRoot = useTemplateRef<HTMLDivElement>('gridRoot');

// Pre-scrolled to its right edge so a mobile viewer's first look is the
// most recent days, not a year-old Sunday — see .activity-cal's own
// internal-scroll rule in styles.css. Needs the element actually laid out
// first (nextTick), same reasoning as the legacy view's own
// requestAnimationFrame deferral.
function scrollToToday() {
  if (gridRoot.value) gridRoot.value.scrollLeft = gridRoot.value.scrollWidth;
}
onMounted(async () => {
  await nextTick();
  scrollToToday();
});
watch(() => props.slug, async () => {
  await nextTick();
  scrollToToday();
});
</script>

<template>
  <div v-if="days.length" ref="gridRoot" class="activity-cal">
    <div class="activity-cal-months">
      <span v-for="(label, index) in monthLabels" :key="index" class="activity-cal-month">{{ label }}</span>
    </div>
    <div class="activity-cal-grid">
      <div
        v-for="cell in cells"
        :key="cell.key"
        class="activity-cal-cell"
        :class="{
          'is-placeholder': !cell.day,
          'is-untracked': cell.day && cell.day.gained === null,
          'is-zero': cell.isZero,
        }"
        :aria-hidden="!cell.day ? 'true' : undefined"
        :style="cell.day && cell.day.gained !== null ? { '--fill-pct': `${cell.fillPct}%` } : {}"
        v-tooltip="cellTooltip(cell)"
      />
    </div>
  </div>
</template>
