<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';

import { frameToRects, type Palette } from '@/lib/pixelArt';
import type { SpriteStep } from '@/lib/skillSprites';

/**
 * Plays a list of pixel-art steps as an SVG, one rect per colour run. Each
 * step holds for its own `ms`; a step flagged `beat` emits `beat` the moment
 * it's shown, which is what the card hooks the XP pop to. Honours
 * prefers-reduced-motion by holding on the beat frame instead of looping.
 */
const props = defineProps<{
  steps: SpriteStep[];
  palette: Palette;
  width: number;
  height: number;
  /** CSS pixels per sprite pixel. */
  scale?: number;
}>();
const emit = defineEmits<{ beat: [] }>();

const index = ref(0);
let timer: ReturnType<typeof setTimeout> | undefined;

const rects = computed(() => frameToRects(props.steps[index.value].frame, props.palette));
const scale = computed(() => props.scale ?? 6);

const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

function show(next: number) {
  index.value = next;
  if (props.steps[next].beat) emit('beat');
  timer = setTimeout(() => show((next + 1) % props.steps.length), props.steps[next].ms);
}

onMounted(() => {
  if (reducedMotion()) {
    index.value = Math.max(0, props.steps.findIndex((step) => step.beat));
    return;
  }
  show(0);
});
onBeforeUnmount(() => clearTimeout(timer));
</script>

<template>
  <svg
    class="pixel-sprite"
    :viewBox="`0 0 ${width} ${height}`"
    :width="width * scale"
    :height="height * scale"
    shape-rendering="crispEdges"
    role="img"
    aria-hidden="true"
  >
    <rect v-for="(r, i) in rects" :key="i" :x="r.x" :y="r.y" :width="r.w" height="1" :fill="r.fill" />
  </svg>
</template>

<style scoped>
.pixel-sprite {
  display: block;
  max-width: 100%;
  height: auto;
  margin: 0 auto;
}
</style>
