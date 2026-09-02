<script setup lang="ts">
import { computed, ref } from 'vue';

import { CALENDAR_DAY, buildMatrix, buildTotalsRow, computeLevelGains, leaderCounts, TOTAL_MEASURE } from '@shared/compute.js';
import { formatNumber, formatRank } from '@shared/format.js';
import { iconFor, TOTAL_LEVEL_ICON } from '@shared/config.js';
import { xpForLevel } from '@shared/xp-table.js';
import { tooltipContent, vTooltip } from '@/lib/tooltipDirective';

const props = defineProps<{ players: any[]; snapshots: any[] }>();

const sortedBy = ref<string | null>(null);
const invertLeaders = ref(false);

/** Melooms alone gets the five-star consolation badge on a shutout —
 * everyone else's zero still reads as "★ 0". */
const CONSOLATION_STARS_SLUG = 'melooms';

// compute.js is plain JS — `any` here is deliberate: computeLevelGains'
// return shape (bySlug is a dynamically-keyed lookup object) has nothing
// for TS to infer a static shape from.
const levelGains = computed<any>(() => computeLevelGains(props.snapshots, props.players, CALENDAR_DAY as any));
const gainFor = (slug: string, skillId: number) => levelGains.value.bySlug[slug]?.bySkill?.[skillId] ?? 0;
const totalLevelGainFor = (slug: string) => levelGains.value.bySlug[slug]?.total ?? 0;

const skillRows = computed(() => buildMatrix(props.players, 'level', invertLeaders.value));
const totalsData = computed(() => buildTotalsRow(props.players, invertLeaders.value));
const leads = computed(() => leaderCounts([...skillRows.value, totalsData.value]));

function sortRowsFor(rows: any[], slug: string) {
  const cellFor = (row: any) => row.cells.find((cell: any) => cell.player.slug === slug);
  const direction = invertLeaders.value ? -1 : 1;
  return [...rows].sort((a, b) => {
    const left = cellFor(a);
    const right = cellFor(b);
    if (!left || !right) return 0;
    return (
      Number(right.isLeader) - Number(left.isLeader) ||
      direction * (right.level - left.level) ||
      direction * (right.xp - left.xp)
    );
  });
}

const orderedRows = computed(() => (sortedBy.value ? sortRowsFor(skillRows.value, sortedBy.value) : skillRows.value));

function toggleSort(slug: string) {
  sortedBy.value = sortedBy.value === slug ? null : slug;
}

/** One star + count, or five stars for the CONSOLATION_STARS_SLUG shutout. */
function leadsStars(slug: string, count: number) {
  return count === 0 && slug === CONSOLATION_STARS_SLUG ? 5 : 1;
}
const leadsGold = (count: number) => count > 0;

function cellTooltip(cell: any, skill: any, levelsGained: number) {
  return () => {
    const isRealSkill = Number.isInteger(skill.id);
    const nextLevelXp = isRealSkill ? xpForLevel(skill, cell.level + 1) : undefined;
    const rows = [
      ['Level', `${formatNumber(cell.level)} / ${skill.max}`],
      ['Levels today', levelsGained > 0 ? `+${levelsGained}` : 'none'],
      ['Experience', `${formatNumber(cell.xp)} xp`],
      isRealSkill
        ? ['Next level', nextLevelXp === undefined ? 'maxed' : `${formatNumber(Math.max(0, nextLevelXp - cell.xp))} xp to go`]
        : null,
      ['Rank', formatRank(cell.rank)],
    ].filter(Boolean) as [string, string][];
    return tooltipContent(`${cell.player.name} · ${skill.name}`, rows, cell.player.colour);
  };
}
</script>

<template>
  <section class="matrix-section">
    <div class="matrix-head">
      <div class="matrix-title">
        <h2>Skill Leaderboard{{ invertLeaders ? ' (Inverse)' : '' }}</h2>
        <button
          type="button"
          class="matrix-invert"
          :class="{ 'is-active': invertLeaders }"
          :aria-pressed="invertLeaders"
          :title="
            invertLeaders
              ? 'Showing the lowest level per skill — click to show the highest'
              : 'Showing the highest level per skill — click to show the lowest'
          "
          @click="invertLeaders = !invertLeaders"
        >
          <span aria-hidden="true">{{ invertLeaders ? '▼' : '▲' }}</span>
          <span class="visually-hidden">{{ invertLeaders ? 'Showing lowest' : 'Showing highest' }}</span>
        </button>
      </div>
      <p class="matrix-note">
        <template v-if="sortedBy">
          Sorted by {{ players.find((p) => p.slug === sortedBy)?.name }} — click the column again to reset.
        </template>
        <template v-else>
          Click a player column to sort by their {{ invertLeaders ? 'weakest' : 'best' }} skills. Hover a cell for
          experience and rank.
        </template>
      </p>
    </div>

    <div class="matrix-scroll">
      <table class="matrix">
        <caption class="visually-hidden">
          Every RuneScape 3 skill level by player, plus totals. The {{ invertLeaders ? 'account behind' : 'group leader' }} is
          marked in each row.
        </caption>
        <thead>
          <tr>
            <th class="corner" scope="col"><span>Skill</span></th>
            <th
              v-for="player in players"
              :key="player.slug"
              class="player-head"
              :class="{ 'is-sorted': sortedBy === player.slug }"
              scope="col"
              :style="{ '--accent': player.colour }"
              :aria-sort="sortedBy === player.slug ? 'descending' : 'none'"
            >
              <button
                type="button"
                class="player-sort"
                :title="sortedBy === player.slug ? 'Clear sorting' : `Sort by ${player.name}'s ${invertLeaders ? 'weakest' : 'best'} skills`"
                @click="toggleSort(player.slug)"
              >
                <span class="player-name">
                  <span class="swatch" :style="{ '--swatch': player.colour }" aria-hidden="true" />
                  <span class="player-name-text">{{ player.name }}</span>
                </span>
                <span class="player-leads" :class="{ 'has-leads': leadsGold(leads[player.slug] ?? 0) }">
                  <span v-for="n in leadsStars(player.slug, leads[player.slug] ?? 0)" :key="n" class="player-leads-star" aria-hidden="true">★</span>
                  <span aria-hidden="true">{{ formatNumber(leads[player.slug] ?? 0) }}</span>
                  <span class="visually-hidden">{{ invertLeaders ? 'Trails' : 'Leads' }} {{ formatNumber(leads[player.slug] ?? 0) }} rows</span>
                </span>
              </button>
              <span v-if="player.stale" class="visually-hidden">(cached data)</span>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in orderedRows" :key="row.skill.id">
            <th scope="row" class="skill-head">
              <img class="skill-icon" :src="iconFor(row.skill)" alt="" width="18" height="18" loading="lazy" decoding="async" />
              <span class="skill-name">{{ row.skill.name }}</span>
            </th>
            <td
              v-for="cell in row.cells"
              :key="cell.player.slug"
              :class="`cell${cell.isLeader ? ' is-leader' : ''}${cell.xp === 0 ? ' is-empty' : ''}`"
              :style="{ '--accent': cell.player.colour }"
              tabindex="0"
              v-tooltip="cellTooltip(cell, row.skill, gainFor(cell.player.slug, row.skill.id))"
            >
              <span class="cell-figures">
                <span class="cell-level">
                  <span class="cell-primary">{{ formatNumber(cell.level) }}</span>
                  <span v-if="cell.isLeader" class="cell-star" aria-hidden="true">★</span>
                </span>
                <span v-if="gainFor(cell.player.slug, row.skill.id) > 0" class="chip-up cell-gain">
                  <span>+{{ gainFor(cell.player.slug, row.skill.id) }}</span>
                  <span class="visually-hidden"> levels gained today</span>
                </span>
              </span>
              <span class="cell-rule" role="presentation">
                <span class="cell-rule-fill" :style="{ width: `${(cell.share * 100).toFixed(1)}%` }" />
              </span>
              <span v-if="cell.isLeader" class="visually-hidden"> — group leader</span>
            </td>
          </tr>
          <tr class="row-total">
            <th scope="row" class="skill-head">
              <img class="skill-icon" :src="TOTAL_LEVEL_ICON" alt="" width="18" height="18" decoding="async" />
              <span class="skill-name">Total</span>
            </th>
            <td
              v-for="cell in totalsData.cells"
              :key="cell.player.slug"
              :class="`cell${cell.isLeader ? ' is-leader' : ''}${cell.xp === 0 ? ' is-empty' : ''}`"
              :style="{ '--accent': cell.player.colour }"
              tabindex="0"
              v-tooltip="cellTooltip(cell, TOTAL_MEASURE, totalLevelGainFor(cell.player.slug))"
            >
              <span class="cell-figures">
                <span class="cell-level">
                  <span class="cell-primary">{{ formatNumber(cell.level) }}</span>
                  <span v-if="cell.isLeader" class="cell-star" aria-hidden="true">★</span>
                </span>
                <span v-if="totalLevelGainFor(cell.player.slug) > 0" class="chip-up cell-gain">
                  <span>+{{ totalLevelGainFor(cell.player.slug) }}</span>
                  <span class="visually-hidden"> levels gained today</span>
                </span>
              </span>
              <span class="cell-rule" role="presentation">
                <span class="cell-rule-fill" :style="{ width: `${(cell.share * 100).toFixed(1)}%` }" />
              </span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>
