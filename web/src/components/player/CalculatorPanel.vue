<script setup lang="ts">
import { computed, ref } from 'vue';

import { SKILL_GRID, iconFor } from '@shared/config.js';
import { AGILITY_SKILL_ID } from '@/lib/agilityCalculator';
import { FISHING_SKILL_ID } from '@/lib/fishingCalculator';
import AgilityCalculator from '@/components/player/AgilityCalculator.vue';
import FishingCalculator from '@/components/player/FishingCalculator.vue';

/**
 * The XP calculator's own skill picker — same 3×10 skill-grid shape as
 * SkillGrid.vue (SKILL_GRID/iconFor), but a separate, simpler component:
 * this one has no levels, progress bars, or today's-gains to show, just an
 * icon per skill to pick a calculator by. Anchored next to whichever toggle
 * button opened it (GoalsGraph.vue, for now — the only place this exists
 * yet).
 *
 * Agility and Fishing are the two skills with a real calculator behind them
 * so far (agility-courses.js/fishing-methods.js) — every other cell renders
 * disabled rather than pretending to be clickable. Picking one swaps the
 * grid for that skill's own calculator component in place; a back arrow
 * returns to the grid.
 *
 * `initialSkillId` seeds `openSkillId` at mount instead of always starting
 * on the picker grid — GoalGraphNode.vue's own hover shortcut sets it (via
 * GoalsGraph.vue) to jump straight to whichever skill's own goal it was
 * clicked from, rather than making a viewer pick it again after already
 * picking the goal it's for. Since this whole component only exists while
 * `calculatorOpen` is true (GoalsGraph.vue's own `v-if`), a fresh mount is
 * exactly when a "where to start" prop like this needs to apply — there's
 * no later point it'd need to keep reacting to it changing.
 */
const props = defineProps<{
  player: { skillById?: Record<number, { level: number; xp: number }> };
  agilityGoal: any | null;
  fishingGoal: any | null;
  initialSkillId?: number | null;
}>();

const emit = defineEmits<{
  save: [
    route: {
      skillId: number;
      targetType: 'level' | 'xp';
      targetValue: number;
      startOptionLabel: string;
      switchLabels: string[];
      startLevel: number;
      startXp: number;
    },
  ];
}>();

/** Every skill id with a real calculator behind it — grows by one entry
 * each time another skill's own data/calculator ships; nothing else here
 * needs to change to pick it up beyond adding its own branch in the
 * template below. */
const SUPPORTED_SKILL_IDS: number[] = [AGILITY_SKILL_ID, FISHING_SKILL_ID];

const cells: any[] = SKILL_GRID.flat().filter((skill: any) => skill !== null);

const openSkillId = ref<number | null>(props.initialSkillId ?? null);
const openSkillName = computed(() => cells.find((skill) => skill.id === openSkillId.value)?.name ?? '');

function open(skill: any) {
  if (!SUPPORTED_SKILL_IDS.includes(skill.id)) return;
  openSkillId.value = skill.id;
}
</script>

<template>
  <div class="calculator-panel" :class="{ 'is-detail': openSkillId !== null }">
    <div v-if="openSkillId === null">
      <p class="calculator-panel-title">XP Calculator</p>
      <div class="calculator-panel-grid">
        <button
          v-for="skill in cells"
          :key="skill.id"
          type="button"
          class="calculator-panel-cell"
          :class="{ 'is-disabled': !SUPPORTED_SKILL_IDS.includes(skill.id) }"
          :disabled="!SUPPORTED_SKILL_IDS.includes(skill.id)"
          :title="SUPPORTED_SKILL_IDS.includes(skill.id) ? skill.name : `${skill.name} — coming soon`"
          @click="open(skill)"
        >
          <img :src="iconFor(skill)" alt="" width="18" height="18" decoding="async" />
          <span class="visually-hidden">{{ skill.name }}</span>
        </button>
      </div>
    </div>
    <div v-else>
      <div class="calculator-panel-detail-head">
        <button type="button" class="calculator-panel-back" title="Back to skills" @click="openSkillId = null">
          <svg viewBox="0 0 18 18" aria-hidden="true" focusable="false"><path d="M11 3.5 5.5 9l5.5 5.5" /></svg>
        </button>
        <p class="calculator-panel-title">{{ openSkillName }}</p>
      </div>
      <AgilityCalculator v-if="openSkillId === AGILITY_SKILL_ID" :player="player" :existing-goal="agilityGoal" @save="(route) => emit('save', route)" />
      <FishingCalculator v-else-if="openSkillId === FISHING_SKILL_ID" :player="player" :existing-goal="fishingGoal" @save="(route) => emit('save', route)" />
    </div>
  </div>
</template>
