<script setup lang="ts">
import { nextTick, ref, watch } from 'vue';

/**
 * A sliding-indicator segmented control — the same anatomy as the site's
 * other Day/Week/Month-style toggles (PeriodToggle.vue), generalised over
 * an arbitrary `tabs` list so the player page's own Stats/Quests/Goals
 * switcher doesn't duplicate it a third time. Ported from tabs.js,
 * including its two-rAF slide trick.
 */
// `label`, not `ariaLabel` — a template's `aria-label="..."` attribute
// doesn't reliably type-check against a camelCase `ariaLabel` prop under
// vue-tsc (same fix ViewToggle.vue already needed), so this sets
// `:aria-label="label"` internally instead.
const props = defineProps<{ tabs: Array<[string, string]>; label: string }>();
const active = defineModel<string>({ required: true });

const indexOf = (value: string) => props.tabs.findIndex(([v]) => v === value);
const indicatorIndex = ref(indexOf(active.value));

watch(active, async (value, previous) => {
  if (previous == null) return;
  await nextTick();
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      indicatorIndex.value = indexOf(value);
    });
  });
});
</script>

<template>
  <div class="tabs" :class="{ 'tabs-2up': tabs.length === 2 }" role="tablist" :aria-label="props.label">
    <span class="tabs-indicator" aria-hidden="true" :style="{ transform: `translateX(${indicatorIndex * 100}%)` }" />
    <button
      v-for="[value, label] in tabs"
      :key="value"
      type="button"
      class="tab"
      :class="{ 'is-active': active === value }"
      role="tab"
      :aria-selected="active === value"
      @click="active = value"
    >
      {{ label }}
    </button>
  </div>
</template>
