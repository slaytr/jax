<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue';

/**
 * A number that counts/rolls from its old value to a new one instead of
 * just jumping — Standings' own headline totals, which now hold a stable
 * player reference across a reload (see useGroupData.ts's reconcile) and
 * so only actually re-render when that player's number really changed.
 * Skipped on first mount (nothing to animate from yet) and for anyone with
 * prefers-reduced-motion set — `text` is just set straight to the
 * formatted value either way, so the template never has to branch on it.
 */
const props = withDefaults(
  defineProps<{
    value: number;
    format: (value: number) => string;
    duration?: number;
  }>(),
  { duration: 700 },
);

const reduceMotion =
  typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false;

// The raw number the animation is currently at — not just whatever it last
// settled on — so a value that changes again mid-roll continues smoothly
// from there instead of snapping back to the previously committed number.
const current = ref(props.value);
const text = ref(props.format(props.value));

let frame: number | undefined;

function animateTo(from: number, to: number) {
  if (frame !== undefined) cancelAnimationFrame(frame);

  if (reduceMotion || from === to) {
    current.value = to;
    text.value = props.format(to);
    return;
  }

  const start = performance.now();
  const step = (now: number) => {
    const elapsed = Math.min(1, (now - start) / props.duration);
    const eased = 1 - (1 - elapsed) ** 3;
    const value = from + (to - from) * eased;
    current.value = value;
    text.value = props.format(value);
    frame = elapsed < 1 ? requestAnimationFrame(step) : undefined;
  };
  frame = requestAnimationFrame(step);
}

watch(
  () => props.value,
  (next) => {
    if (!Number.isFinite(next)) return;
    animateTo(current.value, next);
  },
);

onBeforeUnmount(() => {
  if (frame !== undefined) cancelAnimationFrame(frame);
});
</script>

<template>
  <span class="odometer-value">{{ text }}</span>
</template>
