<script setup lang="ts">
import { computed } from 'vue';

import type { GainsView } from '@/lib/gains';

// Named `label`, not `ariaLabel` — a kebab-cased `aria-label="..."` in the
// caller's template doesn't reliably resolve to a camelCase `ariaLabel`
// prop for vue-tsc's template type-checking (it gets treated as a raw
// passthrough attribute instead), so this sidesteps that ambiguity.
//
// `showSplit` opts a caller into the third "grid + one chart" view
// (GainsSplitView.vue) — off by default so Standings.vue, which has no
// split rendering of its own, keeps its plain two-tab toggle.
const props = defineProps<{ label: string; showSplit?: boolean }>();
const view = defineModel<GainsView>({ required: true });

const VIEWS = computed<Array<[GainsView, string]>>(() => [
  ['grid', 'the grid'],
  ['line', 'line charts'],
  ...(props.showSplit ? ([['split', 'the grid and one chart together']] as Array<[GainsView, string]>) : []),
]);
</script>

<template>
  <div class="gains-view-tabs" role="tablist" :aria-label="props.label">
    <button
      v-for="[value, label] in VIEWS"
      :key="value"
      type="button"
      class="gains-view-toggle"
      :class="{ 'is-active': view === value }"
      role="tab"
      :aria-selected="view === value"
      :title="`Show ${label}`"
      @click="view = value"
    >
      <svg v-if="value === 'grid'" class="toggle-icon" viewBox="0 0 18 18" aria-hidden="true" focusable="false">
        <rect x="1.5" y="1.5" width="6.5" height="6.5" rx="1" />
        <rect x="10" y="1.5" width="6.5" height="6.5" rx="1" />
        <rect x="1.5" y="10" width="6.5" height="6.5" rx="1" />
        <rect x="10" y="10" width="6.5" height="6.5" rx="1" />
      </svg>
      <svg v-else-if="value === 'line'" class="toggle-icon" viewBox="0 0 18 18" aria-hidden="true" focusable="false">
        <polyline points="2,14 7,6 11,10 16,3" class="toggle-line" />
        <circle cx="2" cy="14" r="1.3" />
        <circle cx="7" cy="6" r="1.3" />
        <circle cx="11" cy="10" r="1.3" />
        <circle cx="16" cy="3" r="1.3" />
      </svg>
      <svg v-else class="toggle-icon" viewBox="0 0 18 18" aria-hidden="true" focusable="false">
        <rect x="1" y="1.5" width="6" height="6.5" rx="1" />
        <rect x="1" y="10" width="6" height="6.5" rx="1" />
        <line x1="9.5" y1="1" x2="9.5" y2="17" class="toggle-line" />
        <polyline points="11.5,13 14.5,7 17,10" class="toggle-line" />
        <circle cx="17" cy="10" r="1.2" />
      </svg>
      <span class="visually-hidden">Show {{ label }}</span>
    </button>
  </div>
</template>
