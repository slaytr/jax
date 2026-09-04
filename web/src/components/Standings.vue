<script setup lang="ts">
import { computed, ref, watch } from 'vue';

import { questStandings, standings } from '@shared/compute.js';
import { formatCompact, formatNumber, formatRank } from '@shared/format.js';
import { MAX_QUEST_POINTS, MAX_TOTAL_LEVEL, QUEST_POINTS_ICON, TOTAL_LEVEL_ICON } from '@shared/config.js';
import type { AllGains, GainsPeriod, GainsView } from '@/lib/gains';
import { tooltipContent, vTooltip } from '@/lib/tooltipDirective';
import MetricLineCharts from '@/components/charts/MetricLineCharts.vue';
import ViewToggle from '@/components/ViewToggle.vue';
import { usePrefs } from '@/composables/usePrefs';

const props = defineProps<{ players: any[]; gains: AllGains; period: GainsPeriod }>();
const view = defineModel<GainsView>('view', { required: true });

const PERIOD_LABEL: Record<GainsPeriod, string> = { day: 'today', week: 'this week', month: 'this month' };

// The line view draws in only when it's newly appearing (switching from
// the grid), not on every re-render — same reasoning as GainsSection's own
// animateLines, but simpler here since Standings' line view has no
// Day/Week/Month tabs of its own (fixed to month — see the template below).
const animateLines = ref(false);
let previousView: GainsView | null = null;
watch(
  view,
  (next) => {
    animateLines.value = next === 'line' && previousView !== 'line';
    previousView = next;
  },
  { immediate: true },
);

const { prefs, savePref } = usePrefs();
const selectedPlayer = ref<string | null>(
  prefs.standingsSelectedPlayer && props.players.some((p) => p.slug === prefs.standingsSelectedPlayer)
    ? prefs.standingsSelectedPlayer
    : null,
);
function selectPlayer(slug: string) {
  selectedPlayer.value = selectedPlayer.value === slug ? null : slug;
  savePref({ standingsSelectedPlayer: selectedPlayer.value });
}

const gainsBySlug = (rows: any[], key: string) => Object.fromEntries(rows.map((row) => [row.player.slug, row[key]]));

const levelGains = computed(() => gainsBySlug(props.gains.levels[props.period].rows, 'total'));
const xpGains = computed(() => gainsBySlug(props.gains.xp[props.period].rows, 'total'));
const questGains = computed(() => gainsBySlug(props.gains.quests[props.period].rows, 'gained'));
const periodLabel = computed(() => PERIOD_LABEL[props.period]);

const levelRows = computed(() => standings(props.players, 'level'));
const xpRows = computed(() => standings(props.players, 'xp'));
const questRows = computed(() => questStandings(props.players));
const maxXp = computed(() => Math.max(...props.players.map((player) => player.total?.xp ?? 0), 0));

function levelTooltip(row: any) {
  const gained = levelGains.value[row.player.slug] ?? 0;
  return () =>
    tooltipContent(
      row.player.name,
      [
        ['Total level', formatNumber(row.player.total?.level)],
        ['Total experience', `${formatNumber(row.player.total?.xp)} xp`],
        ['Overall rank', formatRank(row.player.total?.rank)],
        [`Levels gained ${periodLabel.value}`, gained > 0 ? `+${formatNumber(gained)}` : 'none'],
      ],
      row.player.colour,
    );
}

function xpTooltip(row: any) {
  const gained = xpGains.value[row.player.slug] ?? 0;
  return () =>
    tooltipContent(
      row.player.name,
      [
        ['Total experience', `${formatNumber(row.player.total?.xp)} xp`],
        ['Overall rank', formatRank(row.player.total?.rank)],
        [`XP gained ${periodLabel.value}`, gained > 0 ? `+${formatNumber(gained)} xp` : 'none'],
      ],
      row.player.colour,
    );
}

function questTooltip(row: any) {
  const player = row.player;
  const known = Number.isFinite(player.questPoints);
  const gained = questGains.value[player.slug] ?? 0;
  return () =>
    tooltipContent(
      player.name,
      [
        ['Quest points', known ? formatNumber(player.questPoints) : 'unavailable'],
        ['Quests complete', Number.isFinite(player.questsComplete) ? formatNumber(player.questsComplete) : '—'],
        ['Source', player.questsStale ? 'cached — RuneMetrics unavailable' : 'RuneMetrics'],
        [`Quest points gained ${periodLabel.value}`, gained > 0 ? `+${formatNumber(gained)}` : 'none'],
      ],
      player.colour,
    );
}
</script>

<template>
  <section class="lb">
    <div class="lb-head">
      <div class="lb-title">
        <h2>
          <img class="lb-icon" :src="TOTAL_LEVEL_ICON" alt="" width="18" height="18" decoding="async" />
          <span>Account standings</span>
        </h2>
        <ViewToggle v-model="view" label="Standings view" />
      </div>
    </div>

    <MetricLineCharts
      v-if="view === 'line'"
      :series="gains.totalsSeries"
      period="month"
      :signed="false"
      :animate="animateLines"
      :value-labels="{ levels: 'Total level', xp: 'Total XP', quests: 'Quest points' }"
    />
    <div v-else class="lb-stack">
      <div class="lb-band">
        <div class="lb-band-head"><p class="lb-band-label">Total levels</p></div>
        <div class="lb-row">
          <button
            v-for="row in levelRows"
            :key="row.player.slug"
            type="button"
            class="lb-entry"
            :class="{ 'is-selected': row.player.slug === selectedPlayer }"
            :style="{ '--accent': row.player.colour }"
            v-tooltip="levelTooltip(row)"
            @click="selectPlayer(row.player.slug)"
          >
            <span class="visually-hidden">{{ row.place }} place —</span>
            <span class="lb-name">
              <span class="swatch" :style="{ '--swatch': row.player.colour }" aria-hidden="true" />
              <span>{{ row.player.name }}</span>
            </span>
            <span class="lb-value">
              <span>{{ formatNumber(row.player.total?.level ?? 0) }}</span>
              <span v-if="(levelGains[row.player.slug] ?? 0) > 0" class="chip-up lb-gain">
                <span>+{{ formatNumber(levelGains[row.player.slug]) }}</span>
                <span class="visually-hidden">levels gained {{ periodLabel }}</span>
              </span>
            </span>
            <span class="lb-bar" role="presentation">
              <span
                class="lb-bar-fill"
                :style="{ width: `${Math.min(100, ((row.player.total?.level ?? 0) / MAX_TOTAL_LEVEL) * 100).toFixed(1)}%` }"
              />
            </span>
          </button>
        </div>
      </div>

      <div class="lb-band">
        <div class="lb-band-head"><p class="lb-band-label">Total XP</p></div>
        <div class="lb-row">
          <button
            v-for="row in xpRows"
            :key="row.player.slug"
            type="button"
            class="lb-entry"
            :class="{ 'is-selected': row.player.slug === selectedPlayer }"
            :style="{ '--accent': row.player.colour }"
            v-tooltip="xpTooltip(row)"
            @click="selectPlayer(row.player.slug)"
          >
            <span class="visually-hidden">{{ row.place }} place —</span>
            <span class="lb-name">
              <span class="swatch" :style="{ '--swatch': row.player.colour }" aria-hidden="true" />
              <span>{{ row.player.name }}</span>
            </span>
            <span class="lb-value">
              <span>{{ formatCompact(row.player.total?.xp ?? 0) }}</span>
              <span v-if="(xpGains[row.player.slug] ?? 0) > 0" class="chip-up lb-gain">
                <span>+{{ formatCompact(xpGains[row.player.slug]) }}</span>
                <span class="visually-hidden">xp gained {{ periodLabel }}</span>
              </span>
            </span>
            <span class="lb-bar" role="presentation">
              <span
                class="lb-bar-fill"
                :style="{ width: `${Math.min(100, (maxXp > 0 ? (row.player.total?.xp ?? 0) / maxXp : 0) * 100).toFixed(1)}%` }"
              />
            </span>
          </button>
        </div>
      </div>

      <div class="lb-band">
        <div class="lb-band-head"><p class="lb-band-label">Quest points</p></div>
        <div class="lb-row">
          <button
            v-for="row in questRows"
            :key="row.player.slug"
            type="button"
            class="lb-entry"
            :class="{ 'is-selected': row.player.slug === selectedPlayer }"
            :style="{ '--accent': row.player.colour }"
            v-tooltip="questTooltip(row)"
            @click="selectPlayer(row.player.slug)"
          >
            <span class="visually-hidden">{{ row.place }} place —</span>
            <span class="lb-name">
              <span class="swatch" :style="{ '--swatch': row.player.colour }" aria-hidden="true" />
              <span>{{ row.player.name }}</span>
            </span>
            <span class="lb-value">
              <span>{{ Number.isFinite(row.player.questPoints) ? formatNumber(row.player.questPoints) : '—' }}</span>
              <span class="lb-value-icon">
                <img :src="QUEST_POINTS_ICON" alt="" width="15" height="15" decoding="async" />
                <span class="visually-hidden">quest points</span>
              </span>
              <span v-if="(questGains[row.player.slug] ?? 0) > 0" class="chip-up lb-gain">
                <span>+{{ formatNumber(questGains[row.player.slug]) }}</span>
                <span class="visually-hidden">quest points gained {{ periodLabel }}</span>
              </span>
              <span v-if="!Number.isFinite(row.player.questPoints)" class="lb-sub">unavailable</span>
            </span>
            <span class="lb-bar" role="presentation">
              <span
                class="lb-bar-fill"
                :style="{ width: `${Math.min(100, (Number.isFinite(row.player.questPoints) ? row.player.questPoints / MAX_QUEST_POINTS : 0) * 100).toFixed(1)}%` }"
              />
            </span>
          </button>
        </div>
      </div>
    </div>
  </section>
</template>
