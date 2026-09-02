<script setup lang="ts">
import { computed, onMounted, ref, useTemplateRef } from 'vue';

import { formatNumber } from '@shared/format.js';
import { levelForXp, xpForLevel } from '@shared/xp-table.js';
import { recentLabelNames } from '@/lib/goals';
import GoalLabelPicker from '@/components/player/goals/GoalLabelPicker.vue';

/**
 * The "set a goal" dialog a skill-grid click opens on the Goals tab. A
 * real <dialog> — native focus trap, Escape to dismiss, and a backdrop for
 * free. Ported from player-goals.js's renderGoalDialog. A maxed skill
 * (already at its level cap) starts on the XP radio with the Level one
 * disabled — there's no next level left to set a goal against.
 */
const props = defineProps<{
  skill: { id: number; name: string; max: number };
  player: { skillById?: Record<number, { level: number; xp: number }> };
  goals: any[];
  labels: Array<{ name: string; colour: string }>;
}>();

const emit = defineEmits<{
  create: [draft: any];
  close: [];
  createLabel: [name: string, colour: string];
  deleteLabel: [name: string];
}>();

const value = computed(() => props.player.skillById?.[props.skill.id] ?? { level: 1, xp: 0 });
const maxed = computed(() => value.value.level >= props.skill.max);
const nextLevel = computed(() => Math.min(value.value.level + 1, props.skill.max));

const targetType = ref<'level' | 'xp'>(maxed.value ? 'xp' : 'level');
const levelInput = ref(maxed.value ? props.skill.max : nextLevel.value);
const xpInput = ref(xpForLevel(props.skill, nextLevel.value) ?? value.value.xp + 100000);
const errorText = ref<string | null>(null);
const selectedLabels = ref<string[]>([]);

function onLevelInput() {
  const level = Math.trunc(levelInput.value);
  if (!Number.isFinite(level) || level < 1) return;
  const xp = xpForLevel(props.skill, Math.min(level, props.skill.max));
  if (xp !== undefined) xpInput.value = xp;
}

function onXpInput() {
  const xp = Number(xpInput.value);
  if (!Number.isFinite(xp) || xp < 0) return;
  levelInput.value = levelForXp(props.skill, xp);
}

const dialogRef = useTemplateRef<HTMLDialogElement>('dialogRef');
onMounted(() => dialogRef.value?.showModal());

function submit() {
  const useXp = targetType.value === 'xp';
  const raw = useXp ? xpInput.value : levelInput.value;
  const min = useXp ? value.value.xp + 1 : value.value.level + 1;

  if (!Number.isFinite(raw) || raw < min) {
    errorText.value = useXp ? `Enter an xp target above ${formatNumber(value.value.xp)}.` : `Enter a level above ${formatNumber(value.value.level)}.`;
    return;
  }

  emit('create', {
    id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    kind: 'skill',
    skillId: props.skill.id,
    targetType: useXp ? 'xp' : 'level',
    targetValue: Math.trunc(raw),
    // Not settable from this dialog for now — the group concept (and
    // GoalsList's own section-per-group display) stays fully wired up for
    // whatever existing/future goal actually carries one, there's just no
    // UI to assign one from here yet.
    group: null,
    labels: selectedLabels.value,
    startLevel: value.value.level,
    startXp: value.value.xp,
    startedAt: new Date().toISOString(),
    completedAt: null,
    completedLevel: null,
    completedXp: null,
  });
  dialogRef.value?.close();
}
</script>

<template>
  <dialog ref="dialogRef" class="goal-dialog" @close="emit('close')">
    <form class="goal-form" @submit.prevent="submit">
      <h3 class="goal-dialog-title">New {{ skill.name }} goal</h3>
      <p class="goal-dialog-current">Currently level {{ formatNumber(value.level) }} ({{ formatNumber(value.xp) }} xp)</p>

      <label class="goal-target-choice">
        <input type="radio" name="goal-target-type" value="level" v-model="targetType" :disabled="maxed" />
        <span>Level</span>
        <input type="number" :min="value.level + 1" :max="skill.max" step="1" v-model.number="levelInput" :disabled="targetType !== 'level'" @input="onLevelInput" />
      </label>
      <label class="goal-target-choice">
        <input type="radio" name="goal-target-type" value="xp" v-model="targetType" />
        <span>XP</span>
        <input type="number" :min="value.xp + 1" step="1" v-model.number="xpInput" :disabled="targetType !== 'xp'" @input="onXpInput" />
      </label>

      <div class="goal-text-field goal-text-field-labels">
        <span>Labels</span>
        <GoalLabelPicker v-model="selectedLabels" :initial-labels="labels" :recent-names="recentLabelNames(goals)" @create-label="(n, c) => emit('createLabel', n, c)" @delete-label="(n) => emit('deleteLabel', n)" />
      </div>

      <p v-if="errorText" class="goal-dialog-error">{{ errorText }}</p>

      <div class="goal-dialog-actions">
        <button type="button" class="goal-btn" @click="dialogRef?.close()">Cancel</button>
        <button type="submit" class="goal-btn goal-btn-primary">Add goal</button>
      </div>
    </form>
  </dialog>
</template>
