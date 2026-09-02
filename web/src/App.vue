<script setup lang="ts">
import { computed, watch } from 'vue';
import { RouterView, useRoute } from 'vue-router';

import { groupSummary, groupTrend, computeRankDelta } from '@shared/compute.js';
import AppShell from '@/components/AppShell.vue';
import TheMasthead from '@/components/TheMasthead.vue';
import { useGroupData } from '@/composables/useGroupData';

/**
 * Owns the shell + masthead directly (rather than each view doing it, as
 * HomeView used to) so both stay mounted across a route change — that's
 * what makes navigating into a player's page feel like a transition
 * instead of a new page: the masthead never remounts, only the routed
 * content below it does. See TheMasthead.vue's player-nav (now real
 * RouterLinks) and the .panel-swap transition below.
 */
const { data, error, loading, reload } = useGroupData();
const route = useRoute();

const summary = computed(() => (data.value ? groupSummary(data.value.players) : null));
const trend = computed(() => (data.value ? groupTrend(data.value.snapshots) : null));
const rankDelta = computed(() => (data.value ? computeRankDelta(data.value.snapshots) : null));
const staleCount = computed(() => data.value?.players.filter((player: any) => player.stale).length ?? 0);

// Whenever a player's own page is routed to, TheMasthead swaps its group
// .topbar for that player's own identity block instead — see its own
// activePlayer prop doc comment.
const activePlayer = computed(() =>
  route.name === 'player' ? (data.value?.players.find((player: any) => player.slug === route.params.slug) ?? null) : null,
);

// The old static site's own browser-check hook — kept so anything (an e2e
// test) that still waits on it works. A shell-level concern now, not any
// one view's, since every view shares this same loading gate.
watch([loading, error], ([isLoading]) => {
  if (!isLoading) document.body.dataset.ready = 'true';
});
</script>

<template>
  <AppShell>
    <template v-if="data" #masthead>
      <TheMasthead
        :group-name="data.group.name"
        :players="data.players"
        :summary="summary!"
        :trend="trend"
        :fetched-at="data.fetchedAt"
        :stale-count="staleCount"
        :group-rank="data.groupRank"
        :rank-delta="rankDelta"
        :active-player="activePlayer"
        @refreshed="reload"
      />
    </template>

    <p v-if="loading" class="loading">Reading the ledger…</p>

    <div v-else-if="error" class="empty empty-error">
      <p class="empty-title">Could not load hiscore data</p>
      <p class="empty-body">{{ error }}</p>
    </div>

    <!-- Keyed on the route's own path, not just the matched component, so
         switching from one player to another still retriggers the
         transition even though PlayerView is the same component instance
         both times. route.path, not route.fullPath — the Stats/Quests/Goals
         tab strip (and quest/goal deep links) all ride in the query string
         alone (useStatsPageState.ts), so keying on the full path would
         remount PlayerView, tab switcher included, on every in-page tab
         click instead of only on an actual page change. mode="out-in" is a
         real rotate-out-then-in, not a crossfade — see .panel-swap in
         styles.css. -->
    <RouterView v-else v-slot="{ Component, route }">
      <Transition name="panel-swap" mode="out-in">
        <component :is="Component" :key="route.path" />
      </Transition>
    </RouterView>
  </AppShell>
</template>
