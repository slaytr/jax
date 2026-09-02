<script setup lang="ts">
import { computed } from 'vue';

import { formatNumber } from '@shared/format.js';
import { iconFor } from '@shared/config.js';
import { progressFillStyle } from '@/lib/goals';

/**
 * icon, name, start value, progress bar, percent, then current/target — the
 * single-line anatomy every skill goal renders as, whether it's nested
 * under a quest, standing on its own, or shown in the focus panel. A
 * content-only component (no wrapping row element) — the caller supplies
 * that (a card's own `<li>`, a nested `<li class="goal-subgoal-row">`, or
 * the focus panel's `<div>`), same shape as the legacy view's own
 * skillProgressRowContent, which returned a bare array of children for the
 * same reason.
 */
const props = defineProps<{
  goal: any;
  skill: { name: string };
  startValue: number;
  currentValue: number;
  targetValue: number;
  fraction: number;
  canEdit: boolean;
}>();

const emit = defineEmits<{ delete: [] }>();

const complete = computed(() => Boolean(props.goal.completedAt));
const percent = computed(() => Math.round((complete.value ? 1 : props.fraction) * 100));
</script>

<template>
  <img class="goal-subgoal-icon" :src="iconFor(skill)" alt="" width="16" height="16" decoding="async" />
  <span class="goal-subgoal-name">{{ skill.name }}</span>
  <span class="goal-subgoal-start">{{ formatNumber(startValue) }}</span>
  <div class="goal-subgoal-track" role="presentation">
    <span class="goal-subgoal-fill" :style="complete ? { width: '100%' } : progressFillStyle(fraction)" />
  </div>
  <span class="goal-subgoal-percent">{{ percent }}%</span>
  <span class="goal-subgoal-figures">{{ complete ? `✓ ${formatNumber(targetValue)}` : `${formatNumber(currentValue)} / ${formatNumber(targetValue)}` }}</span>
  <button v-if="canEdit" type="button" class="goal-card-delete" aria-label="Delete this goal" @click="emit('delete')">×</button>
</template>
