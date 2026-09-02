<script setup lang="ts">
import type { GainsView } from '@/lib/gains';

// Named `label`, not `ariaLabel` — a kebab-cased `aria-label="..."` in the
// caller's template doesn't reliably resolve to a camelCase `ariaLabel`
// prop for vue-tsc's template type-checking (it gets treated as a raw
// passthrough attribute instead), so this sidesteps that ambiguity.
const props = defineProps<{ label: string }>();
const view = defineModel<GainsView>({ required: true });

const VIEWS: Array<[GainsView, string]> = [
  ['grid', 'the grid'],
  ['line', 'line charts'],
];
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
      <svg v-else class="toggle-icon" viewBox="0 0 18 18" aria-hidden="true" focusable="false">
        <polyline points="2,14 7,6 11,10 16,3" class="toggle-line" />
        <circle cx="2" cy="14" r="1.3" />
        <circle cx="7" cy="6" r="1.3" />
        <circle cx="11" cy="10" r="1.3" />
        <circle cx="16" cy="3" r="1.3" />
      </svg>
      <span class="visually-hidden">Show {{ label }}</span>
    </button>
  </div>
</template>
