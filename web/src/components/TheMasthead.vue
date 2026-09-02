<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { RouterLink } from 'vue-router';

import { formatCompact, formatDuration, formatNumber, formatRelativeTime, formatShortAge } from '@shared/format.js';
import { nextRunEstimate } from '@shared/compute.js';
import RefreshButton from '@/components/RefreshButton.vue';
import PlayerMasthead from '@/components/player/PlayerMasthead.vue';

const emit = defineEmits<{ refreshed: [] }>();

const props = defineProps<{
  groupName: string;
  players: Array<{ slug: string; name: string; colour: string }>;
  summary: { totalLevel: number; totalXp: number; maxedSkills: number };
  trend: Array<{ x: number; y: number }> | null;
  fetchedAt: string | null;
  staleCount: number;
  groupRank: { rank: number } | null;
  rankDelta: { delta: number; from: string } | null;
  // Set only when a player's own page is the one currently routed to —
  // swaps the group .topbar below for that player's own identity block
  // (PlayerMasthead) instead, so a player page doesn't stack the group's
  // headline figures on top of that player's own. The player-nav row below
  // stays put either way (it now always leads with a "Home" link — there's
  // no other way back once the group .topbar's own wordmark link is
  // replaced by the player's name). Null on the home page.
  activePlayer: {
    slug: string;
    name: string;
    stale: boolean;
    questPoints: number | null;
    total: { level: number; xp: number; rank: number | null } | null;
  } | null;
}>();

// Ticks the "last updated" / "next update in" figures without recomputing
// the rest of the page — same reasoning as the old app.js's own separate
// paintMasthead().
const now = ref(Date.now());
let timer: ReturnType<typeof setInterval> | undefined;
onMounted(() => {
  timer = setInterval(() => {
    now.value = Date.now();
  }, 60000);
});
onUnmounted(() => clearInterval(timer));

const rankValue = computed(() =>
  props.groupRank && Number.isFinite(props.groupRank.rank) ? formatNumber(props.groupRank.rank) : '—',
);
const nextRun = computed(() => nextRunEstimate(props.fetchedAt));
const nextRunLabel = computed(() => {
  void now.value;
  return nextRun.value ? formatDuration(nextRun.value.getTime() - Date.now()) : '—';
});
const fetchedTitle = computed(() => (props.fetchedAt ? `Fetched ${new Date(props.fetchedAt).toUTCString()}` : undefined));
const nextTitle = computed(() =>
  nextRun.value
    ? `Expected around ${nextRun.value.toUTCString()}, one hour after the last fetch. The update job runs on a best-effort schedule, so it may be later.`
    : undefined,
);

const rankClimbed = computed(() => (props.rankDelta ? props.rankDelta.delta > 0 : false));
const rankDeltaLabel = computed(() =>
  props.rankDelta
    ? ` places ${rankClimbed.value ? 'up' : 'down'} since ${formatRelativeTime(props.rankDelta.from)}`
    : '',
);

const sparklinePoints = computed(() => {
  if (!props.trend) return null;
  const width = 132;
  const height = 26;
  const pad = 2;
  const toX = (x: number) => pad + x * (width - pad * 2);
  const toY = (y: number) => height - pad - y * (height - pad * 2);
  const line = props.trend.map((point) => `${toX(point.x).toFixed(1)},${toY(point.y).toFixed(1)}`).join(' ');
  const last = props.trend[props.trend.length - 1];
  return {
    width,
    height,
    line,
    area: `${toX(0)},${height - pad} ${line} ${toX(1)},${height - pad}`,
    headX: toX(last.x),
    headY: toY(last.y),
  };
});
</script>

<template>
  <header class="masthead">
    <PlayerMasthead v-if="activePlayer" :player="activePlayer" :fetched-at="fetchedAt" />

    <div v-else class="topbar">
      <div class="identity">
        <h1 class="wordmark-heading"><RouterLink to="/" class="wordmark">{{ groupName }}</RouterLink></h1>

        <!-- Shown only where the metric strip has no room for the rank column. -->
        <span class="identity-rank">
          <span class="identity-rank-label">Rank</span>
          <span class="identity-rank-value">{{ rankValue }}</span>
          <span v-if="rankDelta && rankDelta.delta !== 0" class="delta" :class="rankClimbed ? 'is-better' : 'is-worse'">
            <span aria-hidden="true">{{ rankClimbed ? '▼' : '▲' }}</span>
            <span>{{ formatNumber(Math.abs(rankDelta.delta)) }}</span>
            <span class="visually-hidden">{{ rankDeltaLabel }}</span>
          </span>
        </span>

        <!-- No permanent tagline line — only shown at all when there's
             actually something to flag (a stale reading). -->
        <p v-if="staleCount > 0" class="identity-sub"><span class="warn">{{ staleCount }} cached</span></p>
      </div>

      <div class="metrics">
        <div class="metric metric-rank">
          <p class="metric-label">Group rank</p>
          <p class="metric-value"><span>{{ rankValue }}</span></p>
        </div>
        <div class="metric metric-level">
          <p class="metric-label">Total level</p>
          <p class="metric-value"><span>{{ formatNumber(summary.totalLevel) }}</span></p>
        </div>
        <div class="metric metric-xp">
          <p class="metric-label">Total xp</p>
          <p class="metric-value">
            <span>{{ formatCompact(summary.totalXp) }}</span>
            <svg
              v-if="sparklinePoints"
              class="sparkline"
              :viewBox="`0 0 ${sparklinePoints.width} ${sparklinePoints.height}`"
              role="img"
              :aria-label="`Group experience trend across ${trend?.length ?? 0} snapshots`"
            >
              <polygon :points="sparklinePoints.area" class="sparkline-area" />
              <polyline :points="sparklinePoints.line" class="sparkline-line" />
              <circle :cx="sparklinePoints.headX" :cy="sparklinePoints.headY" r="2.5" class="sparkline-head" />
            </svg>
          </p>
        </div>
        <div class="metric metric-skills">
          <p class="metric-label">99s</p>
          <p class="metric-value"><span>{{ formatNumber(summary.maxedSkills) }}</span></p>
        </div>
        <div class="metric metric-updated" :title="fetchedTitle">
          <p class="metric-label">Last updated</p>
          <p class="metric-value"><span>{{ formatShortAge(fetchedAt) }}</span></p>
        </div>
        <div class="metric metric-next" :title="nextTitle">
          <p class="metric-label">Next update in</p>
          <p class="metric-value"><span>{{ nextRunLabel }}</span></p>
        </div>
      </div>
    </div>

    <nav class="player-nav" aria-label="This group's pages">
      <RouterLink class="player-nav-item" style="--accent: var(--medal-gold)" to="/">
        <span class="swatch" style="--swatch: var(--medal-gold)" aria-hidden="true" />
        <span>Home</span>
      </RouterLink>
      <RouterLink
        v-for="player in players"
        :key="player.slug"
        class="player-nav-item"
        :style="{ '--accent': player.colour }"
        :to="{ name: 'player', params: { slug: player.slug } }"
      >
        <span class="swatch" :style="{ '--swatch': player.colour }" aria-hidden="true" />
        <span>{{ player.name }}</span>
      </RouterLink>
      <span style="margin-left: auto; display: inline-flex; align-items: center; gap: 0.6rem">
        <RefreshButton scope="group" @refreshed="emit('refreshed')" />
        <!-- auth-widget hidden until Discord OAuth is wired up for this
             build — see session.js/useSession.ts, unused here for now. -->
      </span>
    </nav>
  </header>
</template>
