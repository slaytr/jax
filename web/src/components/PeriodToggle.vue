<script setup lang="ts">
import { nextTick, ref, watch } from 'vue';

import type { GainsPeriod } from '@/lib/gains';

/**
 * Day/Week/Month — the active tab's highlight is a separate sliding block
 * rather than a background painted on each button, so switching periods
 * animates as a slide instead of an instant recolour. Ported from the old
 * leaderboards.js's periodToggle, including its two-rAF trick: the browser
 * needs to actually paint the "from" position before changing the
 * transform again will transition rather than collapse into one style
 * recalculation.
 */
const period = defineModel<GainsPeriod>({ required: true });

const PERIODS: Array<[GainsPeriod, string]> = [
  ['day', 'Day'],
  ['week', 'Week'],
  ['month', 'Month'],
];
const periodIndex = (value: GainsPeriod) => PERIODS.findIndex(([v]) => v === value);

const indicatorIndex = ref(periodIndex(period.value));

watch(period, async (value, previous) => {
  if (previous == null) return;
  // Two rAFs: the first lets the browser commit whatever's already
  // rendered, the second's write is what actually gets to transition.
  await nextTick();
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      indicatorIndex.value = periodIndex(value);
    });
  });
});
</script>

<template>
  <div class="tabs" role="tablist" aria-label="Gains period">
    <span class="tabs-indicator" aria-hidden="true" :style="{ transform: `translateX(${indicatorIndex * 100}%)` }" />
    <button
      v-for="[value, label] in PERIODS"
      :key="value"
      type="button"
      class="tab"
      :class="{ 'is-active': period === value }"
      role="tab"
      :aria-selected="period === value"
      @click="period = value"
    >
      {{ label }}
    </button>
  </div>
</template>
