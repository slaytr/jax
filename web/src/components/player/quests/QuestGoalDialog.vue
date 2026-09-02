<script setup lang="ts">
import { computed, onMounted, ref, useTemplateRef } from 'vue';

import { SKILLS, iconFor } from '@shared/config.js';
import { buildQuestGoalDrafts, notMetSkillRequirements, skillValuesByName, treeSkillRequirements } from '@shared/quest-goal.js';
import { sameRequirements } from '@/lib/quests';

/**
 * The "track this quest as a goal?" confirmation the dependency map's own
 * per-node "add goal" button opens (not-started quests only). Ported from
 * player-goals.js's renderQuestGoalDialog.
 *
 * Every draft this creates shares one `group` (the quest's own name), so
 * accepting always adds exactly one new section to the Goals tab, never
 * merges into an existing one.
 *
 * `quests` (the full quest-data list) only feeds the optional "include
 * this quest's whole prerequisite tree" checkbox — off by default,
 * hidden entirely when the tree wouldn't add anything beyond the quest's
 * own requirements.
 */
const props = defineProps<{ quest: any; player: any; quests: any[] | null }>();
const emit = defineEmits<{ confirm: [drafts: any[]]; close: [] }>();

const skillValues = computed(() => skillValuesByName(props.player));
const skillLevels = computed(() => new Map([...skillValues.value].map(([name, value]) => [name, value.level])));
const ownNotMet = computed(() => notMetSkillRequirements(props.quest, skillLevels.value));
const treeNotMet = computed(() => (props.quests ? treeSkillRequirements(props.quest, props.quests, skillLevels.value) : ownNotMet.value));
const treeAddsSomething = computed(() => !sameRequirements(ownNotMet.value, treeNotMet.value));

const includeTree = ref(false);
const currentRequirements = computed(() => (includeTree.value ? treeNotMet.value : ownNotMet.value));

const summaryText = computed(() =>
  currentRequirements.value.length === 0
    ? 'Adds one goal, tracking the quest itself.'
    : `Adds ${currentRequirements.value.length + 1} goals: the quest itself, plus a skill goal for each requirement below.`,
);

const SKILL_BY_NAME = new Map(SKILLS.map((skill: any) => [skill.name, skill]));

const dialogRef = useTemplateRef<HTMLDialogElement>('dialogRef');
onMounted(() => dialogRef.value?.showModal());

function submit() {
  emit('confirm', buildQuestGoalDrafts(props.quest, skillLevels.value, skillValues.value, { requirements: currentRequirements.value }));
  dialogRef.value?.close();
}
</script>

<template>
  <dialog ref="dialogRef" class="goal-dialog goal-confirm-dialog" @close="emit('close')">
    <div class="goal-form">
      <h3 class="goal-dialog-title">Track "{{ quest.name }}" as a goal?</h3>
      <p class="goal-dialog-current">{{ summaryText }}</p>

      <label v-if="treeAddsSomething" class="quest-goal-dialog-tree-toggle">
        <input type="checkbox" v-model="includeTree" />
        <span>Include this quest's whole prerequisite tree</span>
      </label>

      <ul v-if="currentRequirements.length > 0" class="quest-goal-dialog-reqs">
        <li v-for="req in currentRequirements" :key="req.skill" class="quest-goal-dialog-req">
          <img v-if="SKILL_BY_NAME.get(req.skill)" :src="iconFor(SKILL_BY_NAME.get(req.skill))" alt="" width="14" height="14" decoding="async" />
          <span>{{ req.skill }} {{ req.level }}</span>
        </li>
      </ul>

      <div class="goal-dialog-actions">
        <button type="button" class="goal-btn" @click="dialogRef?.close()">Cancel</button>
        <button type="button" class="goal-btn goal-btn-primary" @click="submit">Add goals</button>
      </div>
    </div>
  </dialog>
</template>
