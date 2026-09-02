<script setup lang="ts">
import { computed, watch } from 'vue';

import { computeAllGains } from '@/lib/gains';
import HighlightsRow from '@/components/HighlightsRow.vue';
import GainsSection from '@/components/GainsSection.vue';
import Standings from '@/components/Standings.vue';
import SkillMatrix from '@/components/SkillMatrix.vue';
import { useGainsViewState } from '@/composables/useGainsViewState';
import { useGroupData } from '@/composables/useGroupData';

// Same singleton App.vue already fetched for the masthead — this just
// attaches to the existing refs, no second request (see useGroupData.ts).
// App.vue only mounts this view once loading/error are past, so `data` is
// guaranteed non-null here.
const { data } = useGroupData();
const { gainsView, gainsPeriod, standingsView } = useGainsViewState();

const gains = computed(() => (data.value ? computeAllGains(data.value.snapshots, data.value.players) : null));

watch(
  data,
  (value) => {
    if (value) document.title = `${value.group.name} · Group Ironman hiscores`;
  },
  { immediate: true },
);
</script>

<template>
  <!-- A single root element (not a <template> fragment of siblings) —
       App.vue wraps whichever route is showing in <Transition>, which
       requires exactly one root vnode per side; a multi-root fragment here
       silently renders nothing once wrapped in a real Transition (Vue only
       warns about it in dev builds, so it's easy to miss). -->
  <div v-if="data" class="home-view">
    <HighlightsRow :gains="gains!" :snapshots="data.snapshots" :players="data.players" />
    <GainsSection :gains="gains!" :players="data.players" v-model:view="gainsView" v-model:period="gainsPeriod" />
    <Standings :players="data.players" :gains="gains!" :period="gainsPeriod" v-model:view="standingsView" />
    <SkillMatrix :players="data.players" :snapshots="data.snapshots" />
  </div>
</template>
