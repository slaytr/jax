<script setup lang="ts">
import { computed, onMounted, useTemplateRef } from 'vue';

import { goalTargetLabel } from '@/lib/goals';

/**
 * The "delete this goal?" confirmation a goal card's × opens. Ported from
 * player-goals.js's renderDeleteConfirmDialog. A completed goal shows its
 * outcome figures too, not just the target — deleting one throws away a
 * real record (when it finished, how long it took), not just an
 * in-progress tracker, so it's worth a clearer look before confirming.
 */
const props = defineProps<{ goal: any; skill: { name: string } | null }>();
const emit = defineEmits<{ confirm: []; close: [] }>();

const COMPLETED_DATE = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

const name = computed(() => (props.skill ? props.skill.name : props.goal.questName));
const target = computed(() => (props.skill ? goalTargetLabel(props.goal) : 'Quest completion'));
const summary = computed(() =>
  props.goal.completedAt
    ? `${name.value} — ✓ ${target.value}, completed ${COMPLETED_DATE.format(new Date(props.goal.completedAt))}`
    : `${name.value} — ${target.value}`,
);

const dialogRef = useTemplateRef<HTMLDialogElement>('dialogRef');
onMounted(() => dialogRef.value?.showModal());

function confirm() {
  emit('confirm');
  dialogRef.value?.close();
}
</script>

<template>
  <dialog ref="dialogRef" class="goal-dialog goal-confirm-dialog" @close="emit('close')">
    <div class="goal-form">
      <h3 class="goal-dialog-title">Delete this goal?</h3>
      <p class="goal-dialog-current">{{ summary }}</p>
      <div class="goal-dialog-actions">
        <button type="button" class="goal-btn" @click="dialogRef?.close()">Cancel</button>
        <button type="button" class="goal-btn goal-btn-danger" @click="confirm">Delete</button>
      </div>
    </div>
  </dialog>
</template>
