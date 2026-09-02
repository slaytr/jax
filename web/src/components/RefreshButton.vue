<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';

import { apiGet, apiPost } from '@shared/api-client.js';
import { onRunFinished } from '@/composables/useRefreshEvents';

/**
 * Click → the server starts a run and a 60s cooldown clock at the same
 * moment (see api/routes/refresh.mjs); this button shows "Refreshing…"
 * while the run is in flight, then "Available in Ns" for whatever's left
 * of that cooldown once it settles. Completion arrives over the shared SSE
 * stream (useRefreshEvents), not a poll — the exact same event reaches
 * every open tab/visitor, not just whichever one clicked, so a page that
 * never touched this button still reloads once someone else's refresh (or
 * a second tab of your own) finishes. A page that only just *loaded*
 * mid-cooldown has no click of its own to seed a countdown from, so it
 * asks the server what's left on mount instead — the cooldown is a real
 * `refresh_runs` timestamp, not local state, so every page agrees on it.
 */
const props = withDefaults(defineProps<{ scope: 'group' | 'player'; slug?: string | null }>(), { slug: null });
const emit = defineEmits<{ refreshed: [] }>();

const COOLDOWN_SECONDS = 60;

const status = ref<'idle' | 'running' | 'error'>('idle');
const errorMessage = ref<string | null>(null);
const cooldownSeconds = ref(0);

let countdownTimer: ReturnType<typeof setInterval> | undefined;
function startCountdown(seconds: number) {
  cooldownSeconds.value = seconds;
  clearInterval(countdownTimer);
  if (seconds <= 0) return;
  countdownTimer = setInterval(() => {
    cooldownSeconds.value = Math.max(0, cooldownSeconds.value - 1);
    if (cooldownSeconds.value === 0) clearInterval(countdownTimer);
  }, 1000);
}

const cooldownPath = computed(() =>
  props.scope === 'player' ? `/players/${props.slug}/refresh/cooldown` : '/refresh/cooldown',
);

async function loadCooldown() {
  try {
    const { retryAfterSeconds } = await apiGet(cooldownPath.value);
    startCountdown(retryAfterSeconds ?? 0);
  } catch {
    // Best-effort — worst case this button just doesn't show a countdown
    // until its own next click's 429 response reveals one.
  }
}

const label = computed(() => {
  if (status.value === 'running') return 'Refreshing…';
  if (cooldownSeconds.value > 0) return `Available in ${cooldownSeconds.value}s`;
  if (status.value === 'error') return 'Retry refresh';
  return 'REFRESH NOW';
});
const disabled = computed(() => status.value === 'running' || cooldownSeconds.value > 0);

let unsubscribe: (() => void) | undefined;
onMounted(() => {
  loadCooldown();
  unsubscribe = onRunFinished((event) => {
    if (event.scope !== props.scope) return;
    if (props.scope === 'player' && event.playerSlug !== props.slug) return;

    if (status.value === 'running') {
      // This tab was the one waiting — its own countdown is already
      // ticking from the moment it clicked (see handleClick).
      status.value = event.status === 'failed' ? 'error' : 'idle';
    } else {
      // Some other tab (or visitor) triggered this run — re-ask the
      // server what's left rather than guessing, since this tab has no
      // click of its own to time the cooldown from.
      loadCooldown();
    }
    emit('refreshed');
  });
});
onUnmounted(() => {
  unsubscribe?.();
  clearInterval(countdownTimer);
});

async function handleClick() {
  status.value = 'running';
  errorMessage.value = null;
  try {
    const path = props.scope === 'player' ? `/players/${props.slug}/refresh` : '/refresh';
    await apiPost(path);
    // The server's own cooldown clock started the instant it inserted the
    // run row, a moment ago — close enough to "now" to count down from
    // here rather than round-tripping to ask.
    startCountdown(COOLDOWN_SECONDS);
  } catch (cause) {
    // Covers a 429 from the server-side cooldown too — api-client.js
    // surfaces that response's own `error` string as this message.
    status.value = 'error';
    errorMessage.value = cause instanceof Error ? cause.message : String(cause);
  }
}
</script>

<template>
  <button class="refresh-button" type="button" :disabled="disabled" :title="errorMessage ?? undefined" @click="handleClick">
    {{ label }}
  </button>
  <span v-if="status === 'error' && errorMessage" class="refresh-error">{{ errorMessage }}</span>
</template>
