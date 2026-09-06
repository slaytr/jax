<script setup lang="ts">
import { computed, ref, watch } from 'vue';

import { computeAllGains, latestUtcDay, MAX_DAY_OFFSET, type AllGains, type GainsPeriod, type GainsView } from '@/lib/gains';
import GainsGrid from '@/components/GainsGrid.vue';
import GainsSplitView from '@/components/GainsSplitView.vue';
import MetricLineCharts from '@/components/charts/MetricLineCharts.vue';
import PeriodToggle from '@/components/PeriodToggle.vue';
import ViewToggle from '@/components/ViewToggle.vue';
import { usePrefs } from '@/composables/usePrefs';

const props = defineProps<{ gains: AllGains; players: any[]; snapshots: any[] }>();

const view = defineModel<GainsView>('view', { required: true });
const period = defineModel<GainsPeriod>('period', { required: true });

/**
 * The Day period's own day picker — M T W T F S S, oldest to newest,
 * ending on whatever day counts as "today" (the most recent snapshot's own
 * UTC day, same anchor CALENDAR_DAY itself resolves to) so it reads the
 * same "last 7 days" shape regardless of which weekday today happens to
 * be. `dayOffset` 0 is today; picking any other button re-derives every
 * Day-period figure as of that specific past day instead (dayGains below)
 * — Week/Month, and every other section reading the same `gainsPeriod`
 * (Standings.vue), are untouched by it.
 */
const dayOffset = ref(0);
const dayButtons = computed(() => {
  const today = latestUtcDay(props.snapshots);
  if (today == null) return [];
  const WEEKDAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
  const buttons = [];
  for (let offset = MAX_DAY_OFFSET; offset >= 0; offset -= 1) {
    const dayStart = today - offset * 86400;
    buttons.push({ offset, label: WEEKDAY_LETTERS[new Date(dayStart * 1000).getUTCDay()] });
  }
  return buttons;
});

const dayGains = computed(() => (dayOffset.value > 0 ? computeAllGains(props.snapshots, props.players, dayOffset.value) : props.gains));

const { prefs, savePref } = usePrefs();
const selectedPlayer = ref<string | null>(
  prefs.gainsSelectedPlayer && props.players.some((p) => p.slug === prefs.gainsSelectedPlayer) ? prefs.gainsSelectedPlayer : null,
);
function selectPlayer(slug: string) {
  selectedPlayer.value = selectedPlayer.value === slug ? null : slug;
  savePref({ gainsSelectedPlayer: selectedPlayer.value });
}

// The line view's lines draw in from left to right only when it's newly
// appearing — switching in from the grid, or the period changing while
// already showing lines — not on every re-render (a player selection in
// the grid shouldn't replay it). Mirrors the old leaderboards.js's own
// previousView/previousPeriod tracking.
const animateLines = ref(false);
let previousView: GainsView | null = null;
let previousPeriod: GainsPeriod | null = null;
watch(
  [view, period],
  ([nextView, nextPeriod]) => {
    animateLines.value = nextView === 'line' && (previousView !== 'line' || previousPeriod !== nextPeriod);
    previousView = nextView;
    previousPeriod = nextPeriod;
  },
  { immediate: true },
);
</script>

<template>
  <section class="lb">
    <div class="lb-head">
      <div class="lb-title">
        <h2>
          <svg class="lb-icon" viewBox="0 0 18 18" aria-hidden="true" focusable="false">
            <polyline points="1,13 6,8 10,11 17,3" class="graph-line" />
            <polyline points="1,16.5 17,16.5" class="graph-axis" />
          </svg>
          <span>Gains</span>
        </h2>
        <ViewToggle v-model="view" label="Gains view" :show-split="true" />
      </div>
      <div v-if="period === 'day'" class="gains-day-picker" role="tablist" aria-label="Which day">
        <button
          v-for="day in dayButtons"
          :key="day.offset"
          type="button"
          class="gains-view-toggle"
          role="tab"
          :aria-selected="dayOffset === day.offset"
          :title="day.offset === 0 ? 'Today' : `${day.offset} day${day.offset === 1 ? '' : 's'} ago`"
          :class="{ 'is-active': dayOffset === day.offset }"
          @click="dayOffset = day.offset"
        >
          {{ day.label }}
        </button>
      </div>
      <PeriodToggle v-model="period" />
    </div>

    <GainsGrid
      v-if="view === 'grid'"
      :levels="dayGains.levels[period]"
      :xp="dayGains.xp[period]"
      :quests="dayGains.quests[period]"
      :hot-levels-slug="dayGains.hot.levels[period]"
      :hot-xp-slug="dayGains.hot.xp[period]"
      :hot-quests-slug="dayGains.hot.quests[period]"
      :selected-player="selectedPlayer"
      @select="selectPlayer"
    />
    <GainsSplitView
      v-else-if="view === 'split'"
      :gains="dayGains"
      :period="period"
      :hot-levels-slug="dayGains.hot.levels[period]"
      :hot-xp-slug="dayGains.hot.xp[period]"
      :hot-quests-slug="dayGains.hot.quests[period]"
    />
    <MetricLineCharts
      v-else
      :series="dayGains.series"
      :period="period"
      :signed="true"
      :animate="animateLines"
      :value-labels="{ levels: 'Levels gained', xp: 'XP gained', quests: 'Quest points gained' }"
    />
  </section>
</template>
