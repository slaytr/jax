<script lang="ts">
export interface HighlightChange {
  key: 'level' | 'xp' | 'quests';
  label: string;
  previous: { name: string; colour: string };
  next: { name: string; colour: string; value: number; formatValue: (value: number) => string; unit: string };
}
</script>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, useTemplateRef } from 'vue';

import HighlightMedalIcon from '@/components/HighlightMedalIcon.vue';

/**
 * Pops up the moment HighlightsRow.vue notices one of the Ranker/Grind
 * King/Quest God crowns has changed hands since the last time this browser
 * looked (see its own weeklyHighlightWinners pref) — one dialog listing
 * every crown that moved, not one popup per badge, same bundling
 * GoalCelebrationDialog.vue uses for "however many goals completed at
 * once". A real <dialog> via showModal(), same chrome as every other
 * dialog in the app (.goal-dialog) — the browser supplies the centred
 * placement and backdrop for free. Unlike those dialogs it needs no
 * explicit dismiss button: it's a passing notification, not something
 * blocking further action, so it closes itself — after 10s, on a click
 * outside its own box, or (native <dialog> behaviour) Escape.
 */
defineProps<{ changes: HighlightChange[] }>();
const emit = defineEmits<{ close: [] }>();

const dialogRef = useTemplateRef<HTMLDialogElement>('dialogRef');
onMounted(() => dialogRef.value?.showModal());

function closeOnBackdropClick(event: MouseEvent) {
  if (event.target === dialogRef.value) dialogRef.value?.close();
}

// Briefly shows the outgoing leader before revealing the new one — a flat
// swap the instant the dialog opens would just read as "here's the
// current state", not "someone just took this over".
const revealed = ref(false);
const revealTimer = setTimeout(() => {
  revealed.value = true;
}, 900);
const autoCloseTimer = setTimeout(() => dialogRef.value?.close(), 10000);
onBeforeUnmount(() => {
  clearTimeout(revealTimer);
  clearTimeout(autoCloseTimer);
});
</script>

<template>
  <dialog ref="dialogRef" class="goal-dialog highlight-change-dialog" @close="emit('close')" @click="closeOnBackdropClick">
    <div class="goal-form highlight-change-form">
      <h3 class="goal-dialog-title">{{ changes.length === 1 ? `${changes[0].label} has changed!` : 'Weekly leaders have changed!' }}</h3>

      <ul class="highlight-change-list">
        <li v-for="change in changes" :key="change.key" class="highlight-change-row">
          <div class="highlight-medal highlight-change-medal" :style="{ '--accent': revealed ? change.next.colour : change.previous.colour }">
            <HighlightMedalIcon :badge-key="change.key" />
          </div>
          <div class="highlight-change-body">
            <p class="highlight-change-label">{{ change.label }}</p>
            <Transition name="highlight-change-swap" mode="out-in">
              <p v-if="!revealed" key="previous" class="highlight-change-player">
                <span class="swatch" :style="{ '--swatch': change.previous.colour }" aria-hidden="true" />
                <span class="highlight-change-name">{{ change.previous.name }}</span>
              </p>
              <p v-else key="next" class="highlight-change-player is-next">
                <span class="swatch" :style="{ '--swatch': change.next.colour }" aria-hidden="true" />
                <span class="highlight-change-name">{{ change.next.name }}</span>
                <span class="highlight-change-value">+{{ change.next.formatValue(change.next.value) }}{{ change.next.unit }}</span>
              </p>
            </Transition>
          </div>
        </li>
      </ul>
    </div>
  </dialog>
</template>
