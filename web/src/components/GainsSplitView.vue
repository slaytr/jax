<script setup lang="ts">
import { computed, ref } from 'vue';

import { formatCompact, formatNumber } from '@shared/format.js';
import { QUEST_POINTS_ICON } from '@shared/config.js';
import type { AllGains, GainsPeriod } from '@/lib/gains';
import GainsGrid from '@/components/GainsGrid.vue';
import LineChartSvg from '@/components/charts/LineChartSvg.vue';

/**
 * Third Gains view: the grid beside a single chart, rather than a
 * full-width toggle between them. Three charts side by side (as the line
 * view does) would leave each one too narrow to share a column with the
 * grid — so this shows just one metric's chart at a time, and clicking any
 * entry in the grid, whichever band it's in, swaps which metric that is.
 * The clicked band also picks up a faint highlight (activeMetric passed
 * through to GainsGrid) so it's clear which row is currently feeding the
 * chart.
 *
 * Deliberately doesn't highlight the clicked *player's* own cells the way
 * the plain grid view does — considered, dropped: a click here is about
 * picking a metric, not a player, so `selectedPlayer` is always null
 * regardless of which entry was clicked.
 */
const props = defineProps<{
  gains: AllGains;
  period: GainsPeriod;
  hotLevelsSlug?: string | null;
  hotXpSlug?: string | null;
  hotQuestsSlug?: string | null;
}>();

type Metric = 'levels' | 'xp' | 'quests';
const activeMetric = ref<Metric>('xp');

function onGridSelect(_slug: string, metric: Metric) {
  activeMetric.value = metric;
}

const METRIC_FORMAT: Record<Metric, (value: number) => string> = {
  levels: formatNumber,
  xp: formatCompact,
  quests: formatNumber,
};
const METRIC_VALUE_LABEL: Record<Metric, string> = {
  levels: 'Levels gained',
  xp: 'XP gained',
  quests: 'Quest points gained',
};

const activeRows = computed(() => props.gains.series[activeMetric.value][props.period].rows.filter((row: any) => row.points.length > 0));
</script>

<template>
  <div class="gains-split">
    <GainsGrid
      class="gains-split-grid"
      :levels="gains.levels[period]"
      :xp="gains.xp[period]"
      :quests="gains.quests[period]"
      :hot-levels-slug="hotLevelsSlug"
      :hot-xp-slug="hotXpSlug"
      :hot-quests-slug="hotQuestsSlug"
      :selected-player="null"
      :active-metric="activeMetric"
      @select="onGridSelect"
    />

    <section class="chart-card gains-split-chart">
      <p class="chart-card-label">
        <span v-if="activeMetric === 'levels'">Levels</span>
        <span v-else-if="activeMetric === 'xp'">XP</span>
        <img v-else class="lb-band-icon" :src="QUEST_POINTS_ICON" alt="Quest points" width="18" height="18" decoding="async" />
      </p>
      <LineChartSvg
        v-if="activeRows.length"
        :rows="activeRows"
        :format-value="METRIC_FORMAT[activeMetric]"
        :value-label="METRIC_VALUE_LABEL[activeMetric]"
        :signed="true"
        :animate="false"
      />
      <p v-else class="chart-empty">No data yet.</p>
    </section>
  </div>
</template>
