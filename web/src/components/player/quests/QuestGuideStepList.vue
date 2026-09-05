<script setup lang="ts">
import type { QuestGuideStep } from '@/lib/questGuide';

/**
 * One level of a quick-guide section's own step tree (QuestQuickGuide.vue)
 * — quest-guides.json nests a step's own `substeps` arbitrarily deep (up to
 * 3 levels deep in the current data), so this renders itself recursively
 * rather than QuestQuickGuide.vue hand-unrolling a fixed number of levels.
 * Vue resolves the self-reference by this file's own name automatically
 * (script setup SFCs need no explicit `name` for that).
 *
 * Each step's own bullet is a real checkbox (useQuestGuideCompletion.ts,
 * owned by QuestQuickGuide.vue and threaded down as plain
 * isCompleted/onToggle functions rather than this component instantiating
 * its own copy — every recursive level needs to read/write the exact same
 * store). `path` is this level's own position in the tree so far (empty at
 * the section's own top level); `stepId` appends this step's own index to
 * build the id useQuestGuideCompletion.ts actually persists against.
 *
 * `step.notation` (questGuide.ts's own splitNotation) is which chat
 * option(s) to click, already split off `step.text` — rendered as its own
 * chip rather than left as trailing plain text, so it reads as "here's the
 * dialogue pick" at a glance instead of blending into the instruction
 * itself.
 */
const props = defineProps<{
  steps: QuestGuideStep[];
  questName: string;
  path?: number[];
  isCompleted: (id: string) => boolean;
  onToggle: (id: string) => void;
}>();

function stepId(index: number): string {
  return `${props.questName}::${[...(props.path ?? []), index].join('.')}`;
}
</script>

<template>
  <ul class="quest-guide-step-list">
    <li v-for="(step, i) in steps" :key="i" class="quest-guide-step">
      <label class="quest-guide-step-row">
        <input type="checkbox" class="quest-guide-step-checkbox" :checked="isCompleted(stepId(i))" @change="onToggle(stepId(i))" />
        <span class="quest-guide-step-text" :class="{ 'is-done': isCompleted(stepId(i)) }">
          {{ step.text }}
          <span v-if="step.notation" class="quest-guide-step-notation" title="Chat option(s) to select">{{ step.notation }}</span>
        </span>
      </label>
      <ul v-if="step.notes.length > 0" class="quest-guide-step-notes">
        <li v-for="(note, j) in step.notes" :key="j">{{ note }}</li>
      </ul>
      <QuestGuideStepList
        v-if="step.substeps.length > 0"
        :steps="step.substeps"
        :quest-name="questName"
        :path="[...(path ?? []), i]"
        :is-completed="isCompleted"
        :on-toggle="onToggle"
      />
    </li>
  </ul>
</template>
