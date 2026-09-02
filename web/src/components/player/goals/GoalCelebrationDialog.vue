<script setup lang="ts">
import { computed, onMounted, useTemplateRef } from 'vue';

import { iconFor, QUEST_POINTS_ICON, SKILLS } from '@shared/config.js';
import { goalTargetLabel } from '@/lib/goals';

/**
 * The Goals tab's own "you did it" popup — shown once, the first time the
 * tab is actually open after a refresh notices one or more goals cross
 * their target. Every goal that completed together shows in one dialog
 * rather than one popup per goal. Ported from player-goals.js's
 * renderGoalCelebrationDialog.
 */
const props = defineProps<{ goals: any[] }>();
const emit = defineEmits<{ close: [] }>();

const bySkillId = new Map(SKILLS.map((skill: any) => [skill.id, skill]));
const heading = computed(() => (props.goals.length === 1 ? 'Goal complete!' : `${props.goals.length} goals complete!`));

const dialogRef = useTemplateRef<HTMLDialogElement>('dialogRef');
onMounted(() => dialogRef.value?.showModal());
</script>

<template>
  <dialog ref="dialogRef" class="goal-dialog goal-celebration-dialog" @close="emit('close')">
    <div class="goal-form">
      <h3 class="goal-dialog-title goal-celebration-title">
        <span class="goal-celebration-star" aria-hidden="true">★</span>
        <span>{{ heading }}</span>
      </h3>
      <ul class="goal-celebration-list">
        <li v-for="goal in goals" :key="goal.id" class="goal-celebration-row">
          <img
            class="goal-celebration-icon"
            :src="goal.kind === 'quest' ? QUEST_POINTS_ICON : iconFor(bySkillId.get(goal.skillId))"
            alt=""
            width="20"
            height="20"
            decoding="async"
          />
          <span class="goal-celebration-name">{{ goal.kind === 'quest' ? goal.questName : bySkillId.get(goal.skillId)?.name }}</span>
          <span class="goal-celebration-target">{{ goal.kind === 'quest' ? '✓ Completed' : `✓ ${goalTargetLabel(goal)}` }}</span>
        </li>
      </ul>
      <div class="goal-dialog-actions">
        <button type="button" class="goal-btn goal-btn-success" @click="dialogRef?.close()">Nice!</button>
      </div>
    </div>
  </dialog>
</template>
