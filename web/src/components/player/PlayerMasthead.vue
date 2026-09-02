<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';

import { formatCompact, formatDuration, formatNumber, formatRank, formatShortAge } from '@shared/format.js';
import { nextRunEstimate } from '@shared/compute.js';

/**
 * The player page's own identity block: name and headline figures, inline
 * in one .topbar row — the exact same shape as the group masthead's own
 * (TheMasthead.vue), since TheMasthead.vue renders this INSTEAD of its own
 * .topbar whenever a player is the one currently being viewed (its
 * player-nav row stays put either way, just swapping its own "Stat pages"
 * label for a "Home" link — see TheMasthead.vue's own activePlayer prop).
 * Root is a plain <div>, not <header> — this always nests inside
 * TheMasthead's own <header class="masthead"> now, and HTML doesn't allow
 * a <header> inside another <header>. Ported from player-masthead.js.
 *
 * Unlike the old static page (still true there — see player-masthead.js's
 * own doc comment), the metric strip stays inline here rather than
 * dropping to its own .metrics-row below: now that the activity calendar
 * has moved out entirely (PlayerGains.vue's own bar-chart stack, Stats tab
 * only — see that component's own doc comment), there's nothing left
 * fighting identity for room on this one line, so this can go back to the
 * plain single-row .topbar shape the group masthead uses — which is also
 * what keeps the two mastheads the same height.
 *
 * No refresh button here — the masthead's own REFRESH NOW (in the
 * player-nav row) already refreshes the shared data singleton every view
 * reads from, so a second one here would just be a duplicate control.
 */
const props = defineProps<{
  player: {
    slug: string;
    name: string;
    stale: boolean;
    questPoints: number | null;
    total: { level: number; xp: number; rank: number | null } | null;
  };
  fetchedAt: string | null;
}>();

// Ticks the "next update in" countdown without recomputing the rest of the
// page — same reasoning as TheMasthead.vue's own identical timer.
const now = ref(Date.now());
let timer: ReturnType<typeof setInterval> | undefined;
onMounted(() => {
  timer = setInterval(() => {
    now.value = Date.now();
  }, 60000);
});
onUnmounted(() => clearInterval(timer));

const nextRun = computed(() => nextRunEstimate(props.fetchedAt));
const nextRunLabel = computed(() => {
  void now.value;
  return nextRun.value ? formatDuration(nextRun.value.getTime() - Date.now()) : '—';
});
const nextTitle = computed(() =>
  nextRun.value
    ? `Expected around ${nextRun.value.toUTCString()}, one hour after the last fetch. The update job runs on a best-effort schedule, so it may be later.`
    : undefined,
);
</script>

<template>
  <div class="topbar">
    <div class="identity">
      <h1 class="wordmark-heading wordmark">{{ player.name }}</h1>
      <p v-if="player.stale" class="identity-sub"><span class="warn">cached</span></p>
    </div>

    <div class="metrics">
      <div class="metric metric-level">
        <p class="metric-label">Total level</p>
        <p class="metric-value"><span>{{ formatNumber(player.total?.level ?? 0) }}</span></p>
      </div>
      <div class="metric metric-xp">
        <p class="metric-label">Total xp</p>
        <p class="metric-value"><span>{{ formatCompact(player.total?.xp ?? 0) }}</span></p>
      </div>
      <div class="metric metric-quests">
        <p class="metric-label">Quest points</p>
        <p class="metric-value"><span>{{ Number.isFinite(player.questPoints) ? formatNumber(player.questPoints!) : '—' }}</span></p>
      </div>
      <div class="metric metric-rank">
        <p class="metric-label">Overall rank</p>
        <p class="metric-value"><span>{{ formatRank(player.total?.rank ?? null) }}</span></p>
      </div>
      <div class="metric metric-updated" :title="fetchedAt ? `Fetched ${new Date(fetchedAt).toUTCString()}` : undefined">
        <p class="metric-label">Last updated</p>
        <p class="metric-value"><span>{{ formatShortAge(fetchedAt) }}</span></p>
      </div>
      <div class="metric metric-next" :title="nextTitle">
        <p class="metric-label">Next update in</p>
        <p class="metric-value"><span>{{ nextRunLabel }}</span></p>
      </div>
    </div>
  </div>
</template>
