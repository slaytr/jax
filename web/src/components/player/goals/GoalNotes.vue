<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';

import { useGoalNote } from '@/composables/useGoalNote';

/**
 * A viewer's own free-text note, sat above the skill-goals column in the
 * Goals tab's list view (GoalsList.vue) — its own left-hand `goals-column`,
 * not the quest one alongside it. A separate component just so useGoalNote
 * has its own dedicated home rather than living inline in GoalsList.vue.
 */
const props = defineProps<{ player: any }>();

const { text: note, height: noteHeight } = useGoalNote(props.player.slug);

/** Tracks the textarea's own drag-resize handle (CSS `resize: vertical`) so
 * the chosen height survives a reload — ResizeObserver is the only signal
 * for that gesture, since it fires no dedicated event of its own.
 * `offsetHeight` (not contentRect, which excludes padding/border) is used so
 * the stored value matches the border-box `height` style applied back below. */
const noteTextarea = ref<HTMLTextAreaElement | null>(null);
let noteResizeObserver: ResizeObserver | null = null;

onMounted(() => {
  if (!noteTextarea.value) return;
  noteResizeObserver = new ResizeObserver(() => {
    if (noteTextarea.value) noteHeight.value = `${noteTextarea.value.offsetHeight}px`;
  });
  noteResizeObserver.observe(noteTextarea.value);
});

onBeforeUnmount(() => noteResizeObserver?.disconnect());
</script>

<template>
  <textarea
    ref="noteTextarea"
    v-model="note"
    class="goal-notes-input"
    aria-label="Notes"
    placeholder="Jot something down — saved automatically in this browser."
    rows="3"
    spellcheck="false"
    :style="noteHeight ? { height: noteHeight } : undefined"
  />
</template>
