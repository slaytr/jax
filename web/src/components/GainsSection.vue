<script setup lang="ts">
import { ref, watch } from 'vue';

import type { AllGains, GainsPeriod, GainsView } from '@/lib/gains';
import GainsGrid from '@/components/GainsGrid.vue';
import GainsSplitView from '@/components/GainsSplitView.vue';
import MetricLineCharts from '@/components/charts/MetricLineCharts.vue';
import PeriodToggle from '@/components/PeriodToggle.vue';
import ViewToggle from '@/components/ViewToggle.vue';
import { usePrefs } from '@/composables/usePrefs';

const props = defineProps<{ gains: AllGains; players: any[] }>();

const view = defineModel<GainsView>('view', { required: true });
const period = defineModel<GainsPeriod>('period', { required: true });

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
      <PeriodToggle v-model="period" />
    </div>

    <GainsGrid
      v-if="view === 'grid'"
      :levels="gains.levels[period]"
      :xp="gains.xp[period]"
      :quests="gains.quests[period]"
      :hot-levels-slug="gains.hot.levels[period]"
      :hot-xp-slug="gains.hot.xp[period]"
      :hot-quests-slug="gains.hot.quests[period]"
      :selected-player="selectedPlayer"
      @select="selectPlayer"
    />
    <GainsSplitView
      v-else-if="view === 'split'"
      :gains="gains"
      :period="period"
      :hot-levels-slug="gains.hot.levels[period]"
      :hot-xp-slug="gains.hot.xp[period]"
      :hot-quests-slug="gains.hot.quests[period]"
    />
    <MetricLineCharts
      v-else
      :series="gains.series"
      :period="period"
      :signed="true"
      :animate="animateLines"
      :value-labels="{ levels: 'Levels gained', xp: 'XP gained', quests: 'Quest points gained' }"
    />
  </section>
</template>
