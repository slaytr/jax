<script setup lang="ts">
import { computed } from 'vue';

import { useTheme } from '@/composables/useTheme';

const LABEL = { dark: ['☾', 'Dark'], light: ['☀', 'Light'] } as const;

const { theme, toggle } = useTheme();
const glyph = computed(() => LABEL[theme.value][0]);
const label = computed(() => LABEL[theme.value][1]);
const targetTheme = computed(() => (theme.value === 'dark' ? 'light' : 'dark'));
</script>

<template>
  <button
    class="theme-toggle"
    type="button"
    :aria-label="`Switch to ${targetTheme} theme`"
    :title="`Switch to ${targetTheme} theme`"
    @click="toggle"
  >
    <span aria-hidden="true">{{ glyph }}</span>
    <span>{{ label }}</span>
  </button>
</template>
