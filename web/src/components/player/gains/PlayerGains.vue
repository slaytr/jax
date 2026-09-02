<script setup lang="ts">
import { computed, reactive, ref } from 'vue';

import { computeActivityBadges, computeDailyBreakdown } from '@shared/compute.js';
import { formatCompact, formatNumber } from '@shared/format.js';
import BarChart from '@/components/player/gains/BarChart.vue';
import ComparisonChart from '@/components/player/gains/ComparisonChart.vue';
import PageTabs from '@/components/player/PageTabs.vue';
import ActivityCalendar from '@/components/player/ActivityCalendar.vue';

/**
 * This player's Gains section: three bar charts — Levels, XP and Quest
 * points gained per day — rather than a Day/Week/Month grid of totals;
 * which days actually built this player's progress is the story here, not
 * just each period's end figure. Ported from player-gains.js.
 *
 * The activity calendar rides under the bar-chart stack (the narrower
 * right-hand column, below whichever two metrics aren't currently the big
 * active chart) — Stats-tab-only now, rather than a fixture above every
 * page tab (PlayerView.vue used to render it there). .activity-cal's own
 * align-self: center (assets/css/styles.css — set for its old spot beside
 * identity in a *row* flex parent) still applies here since .bar-chart-stack
 * is a *column* flex parent instead: align-self always targets the cross
 * axis, which is horizontal either way, so the calendar centers under the
 * stack for free with no extra CSS.
 */
const props = defineProps<{
  player: { slug: string; colour: string };
  players: Array<{ slug: string; name: string; colour: string }>;
  snapshots: any[];
  selectedSkill: { id: number; name: string } | null;
}>();

const WINDOWS: Array<[string, string]> = [
  ['week', 'Week'],
  ['month', 'Month'],
];
const daysFor = (windowValue: string) => (windowValue === 'week' ? 7 : 30);

// Same 720px breakpoint the mobile CSS stacks the three charts at — read
// fresh wherever it's used (not memoised) since it changes what markup
// renders, not just its styling, and nothing here watches resize live —
// a phone loading this page fresh always renders at its own width on the
// first pass anyway, same as the legacy view's own isMobileViewport.
const isMobileViewport = () => globalThis.matchMedia?.('(max-width: 720px)').matches ?? false;

const gainsWindow = ref<'week' | 'month'>('week');
const activeMetric = ref<'level' | 'xp' | 'quests'>('xp');
const hiddenSlugs = reactive(new Set<string>());
const emphasizedSlugs = reactive(new Set<string>());

function toggleHidden(slug: string) {
  if (hiddenSlugs.has(slug)) hiddenSlugs.delete(slug);
  else hiddenSlugs.add(slug);
}
function toggleEmphasis(slug: string) {
  if (emphasizedSlugs.has(slug)) emphasizedSlugs.delete(slug);
  else emphasizedSlugs.add(slug);
}

const METRICS: Array<['level' | 'xp' | 'quests', string, (n: number) => string, string]> = [
  ['level', 'Levels gained', formatNumber, ''],
  ['xp', 'XP gained', formatCompact, ' xp'],
  ['quests', 'Quest points gained', formatNumber, ''],
];

/** Quest points have no per-skill breakdown (RuneMetrics reports one group
 * total, not a value per skill), so a skill filter never applies to that
 * metric. */
function skillIdFor(metric: string) {
  return metric !== 'quests' && props.selectedSkill ? props.selectedSkill.id : 0;
}
function skillLabel(baseLabel: string, metric: string) {
  return metric !== 'quests' && props.selectedSkill ? `${props.selectedSkill.name} ${baseLabel}` : baseLabel;
}

function buildCard(metric: 'level' | 'xp' | 'quests', baseLabel: string, totalFormat: (n: number) => string, unit: string, isActive: boolean) {
  const label = skillLabel(baseLabel, metric);
  const entries = computeDailyBreakdown(props.snapshots, props.player.slug, metric, daysFor(gainsWindow.value), skillIdFor(metric));
  const total = entries.reduce((sum: number, entry: any) => sum + (entry.gained ?? 0), 0);
  const hasData = entries.some((entry: any) => entry.gained !== null);
  const showAxis = isActive || isMobileViewport();
  return { metric, label, unit, totalFormat, entries, total, hasData, showAxis, isActive };
}

const activeCard = computed(() => {
  const active = METRICS.find(([metric]) => metric === activeMetric.value) ?? METRICS[1];
  return buildCard(active[0], active[1], active[2], active[3], true);
});
const stackedCards = computed(() =>
  METRICS.filter(([metric]) => metric !== activeMetric.value).map(([metric, label, totalFormat, unit]) =>
    buildCard(metric, label, totalFormat, unit, false),
  ),
);

const comparisonRows = computed(() =>
  props.players.map((player) => ({
    player,
    entries: computeDailyBreakdown(props.snapshots, player.slug, activeCard.value.metric, daysFor(gainsWindow.value), skillIdFor(activeCard.value.metric)),
  })),
);
const comparisonHasData = computed(() => comparisonRows.value.some((row) => row.entries.some((entry: any) => entry.gained !== null)));
const comparisonLabel = computed(() => activeCard.value.label.replace(/gained$/, 'comparisons'));

const activityBadges = computed(() => computeActivityBadges(props.snapshots, props.player.slug));
</script>

<template>
  <section class="lb">
    <div class="lb-head">
      <div class="lb-title">
        <h2>{{ selectedSkill ? `Gains — ${selectedSkill.name}` : 'Gains' }}</h2>
        <div class="activity-badges">
          <span v-for="badge in activityBadges" :key="badge.key" :class="`activity-badge is-${badge.key}`" :title="badge.hint">{{ badge.label }}</span>
        </div>
      </div>
      <PageTabs v-model="gainsWindow" :tabs="WINDOWS" label="Gains window" />
    </div>

    <div class="bar-chart-layout">
      <div class="chart-card bar-chart-card is-active">
        <div class="bar-chart-header">
          <p class="chart-card-label">{{ activeCard.label }}</p>
          <p class="bar-chart-total">
            <span>+{{ activeCard.totalFormat(activeCard.total) }}</span>
            <span class="bar-chart-total-label">{{ gainsWindow === 'week' ? ' this week' : ' this month' }}</span>
          </p>
        </div>
        <BarChart
          v-if="activeCard.hasData"
          :entries="activeCard.entries"
          :accent="player.colour"
          :show-labels="gainsWindow === 'week'"
          :label="activeCard.label"
          :unit="activeCard.unit"
          :show-axis="activeCard.showAxis"
          :format-value="activeCard.totalFormat"
        />
        <p v-else class="chart-empty">No data yet.</p>
      </div>

      <div class="chart-card player-compare-card">
        <p class="chart-card-label">{{ comparisonLabel }}</p>
        <div class="player-toggle-row">
          <button
            v-for="p in players"
            :key="p.slug"
            type="button"
            class="player-toggle"
            :class="{ 'is-hidden': hiddenSlugs.has(p.slug) }"
            :aria-pressed="hiddenSlugs.has(p.slug) ? 'false' : 'true'"
            @click="toggleHidden(p.slug)"
          >
            <span class="swatch" :style="{ '--swatch': p.colour }" aria-hidden="true" />
            <span>{{ p.name }}</span>
          </button>
        </div>
        <ComparisonChart
          v-if="comparisonHasData"
          :player-rows="comparisonRows"
          :show-labels="gainsWindow === 'week'"
          :label="activeCard.label"
          :unit="activeCard.unit"
          :format-value="activeCard.totalFormat"
          :hidden-slugs="hiddenSlugs"
          :subject-slug="player.slug"
          :emphasized-slugs="emphasizedSlugs"
          @toggle-emphasis="toggleEmphasis"
        />
        <p v-else class="chart-empty">No data yet.</p>
      </div>

      <div class="bar-chart-stack">
        <div v-for="card in stackedCards" :key="card.metric" class="chart-card bar-chart-card">
          <button v-if="!card.showAxis" type="button" class="bar-chart-header bar-chart-activate" @click="activeMetric = card.metric">
            <p class="chart-card-label">{{ card.label }}</p>
            <p class="bar-chart-total">
              <span>+{{ card.totalFormat(card.total) }}</span>
              <span class="bar-chart-total-label">{{ gainsWindow === 'week' ? ' this week' : ' this month' }}</span>
            </p>
            <span class="visually-hidden"> — make {{ card.label }} the main chart</span>
          </button>
          <div v-else class="bar-chart-header">
            <p class="chart-card-label">{{ card.label }}</p>
            <p class="bar-chart-total">
              <span>+{{ card.totalFormat(card.total) }}</span>
              <span class="bar-chart-total-label">{{ gainsWindow === 'week' ? ' this week' : ' this month' }}</span>
            </p>
          </div>
          <BarChart
            v-if="card.hasData"
            :entries="card.entries"
            :accent="player.colour"
            :show-labels="gainsWindow === 'week'"
            :label="card.label"
            :unit="card.unit"
            :show-axis="card.showAxis"
            :format-value="card.totalFormat"
          />
          <p v-else class="chart-empty">No data yet.</p>
        </div>

        <div class="chart-card bar-chart-card">
          <p class="chart-card-label">Player Activity</p>
          <ActivityCalendar :slug="player.slug" :snapshots="snapshots" />
        </div>
      </div>
    </div>
  </section>
</template>
