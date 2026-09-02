<script setup lang="ts">
import { computed } from 'vue';

import { formatCompact, formatNumber } from '@shared/format.js';
import { QUEST_POINTS_ICON } from '@shared/config.js';
import LineChartSvg from '@/components/charts/LineChartSvg.vue';
import type { GainsPeriod } from '@/lib/gains';

/** One card per metric (Levels, XP, Quest points), all reading from the
 * same shape: `series` is either `gains.series` (relative-to-window-start,
 * signed, for the Gains line view) or `gains.totalsSeries` (raw totals,
 * unsigned, for Account Standings' line view) — see the old gains-line.js's
 * renderGainsLines/renderStandingsLines, both thin wrappers over the same
 * renderLineCards this component replaces. */
const props = defineProps<{
  series: { levels: Record<GainsPeriod, any>; xp: Record<GainsPeriod, any>; quests: Record<GainsPeriod, any> };
  period: GainsPeriod;
  valueLabels: { levels: string; xp: string; quests: string };
  signed: boolean;
  animate: boolean;
}>();

const withData = (rows: any[]) => rows.filter((row: any) => row.points.length > 0);

const levelsRows = computed(() => withData(props.series.levels[props.period].rows));
const xpRows = computed(() => withData(props.series.xp[props.period].rows));
const questsRows = computed(() => withData(props.series.quests[props.period].rows));
</script>

<template>
  <div class="chart-section-group">
    <div class="chart-section">
      <section class="chart-card">
        <p class="chart-card-label"><span>Levels</span></p>
        <LineChartSvg
          v-if="levelsRows.length"
          :rows="levelsRows"
          :format-value="formatNumber"
          :value-label="valueLabels.levels"
          :signed="signed"
          :animate="animate"
        />
        <p v-else class="chart-empty">No data yet.</p>
      </section>

      <section class="chart-card">
        <p class="chart-card-label"><span>XP</span></p>
        <LineChartSvg
          v-if="xpRows.length"
          :rows="xpRows"
          :format-value="formatCompact"
          :value-label="valueLabels.xp"
          :signed="signed"
          :animate="animate"
        />
        <p v-else class="chart-empty">No data yet.</p>
      </section>

      <section class="chart-card">
        <p class="chart-card-label">
          <img class="lb-band-icon" :src="QUEST_POINTS_ICON" alt="Quest points" width="18" height="18" decoding="async" />
        </p>
        <LineChartSvg
          v-if="questsRows.length"
          :rows="questsRows"
          :format-value="formatNumber"
          :value-label="valueLabels.quests"
          :signed="signed"
          :animate="animate"
        />
        <p v-else class="chart-empty">No data yet.</p>
      </section>
    </div>
  </div>
</template>
