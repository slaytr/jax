<script setup lang="ts">
import { computed } from 'vue';

import { starTotals } from '@shared/compute.js';
import { formatNumber } from '@shared/format.js';
import { tooltipContent, vTooltip } from '@/lib/tooltipDirective';

const props = defineProps<{ players: any[] }>();

/** Display order of the five star kinds: the rarer milestones first (blue =
 * first to 120, green = first to 99), then gold / silver / bronze finishes
 * across the skill rows, Total included (see starTotals in compute.js). A
 * zero is hidden but keeps its slot, so every player's stars line up. */
const STAR_KINDS = [
  { key: 'blue', label: 'First to 120' },
  { key: 'green', label: 'First to 99' },
  { key: 'gold', label: 'Gold' },
  { key: 'silver', label: 'Silver' },
  { key: 'bronze', label: 'Bronze' },
] as const;

type StarKey = (typeof STAR_KINDS)[number]['key'];

const totals = computed<Record<string, Record<StarKey, number>>>(() => starTotals(props.players));

function tooltipFor(player: any, kind: (typeof STAR_KINDS)[number]) {
  return () => tooltipContent(player.name, [[kind.label, formatNumber(totals.value[player.slug][kind.key])]], player.colour);
}
</script>

<template>
  <section class="lb stars-row">
    <div class="lb-head">
      <h2>
        <svg class="lb-icon" viewBox="0 0 18 18" aria-hidden="true" focusable="false">
          <polygon points="9,1 11,6.5 17,7 12.5,10.8 14,17 9,13.5 4,17 5.5,10.8 1,7 7,6.5" />
        </svg>
        <span>Stars</span>
      </h2>
    </div>
    <div class="stars-row-players">
      <div v-for="player in players" :key="player.slug" class="stars-row-player" :style="{ '--accent': player.colour }">
        <p class="stars-row-name">
          <span class="swatch" :style="{ '--swatch': player.colour }" aria-hidden="true" />
          <span class="stars-row-name-text">{{ player.name }}</span>
        </p>
        <p class="stars-line">
          <span
            v-for="kind in STAR_KINDS"
            :key="kind.key"
            class="stars-stat"
            :class="[`stars-stat-${kind.key}`, { 'is-zero': totals[player.slug][kind.key] === 0 }]"
            tabindex="0"
            v-tooltip="tooltipFor(player, kind)"
          >
            <span class="stars-stat-star" aria-hidden="true">★</span>
            <span aria-hidden="true">{{ formatNumber(totals[player.slug][kind.key]) }}</span>
            <span class="visually-hidden">{{ kind.label }} {{ formatNumber(totals[player.slug][kind.key]) }}</span>
          </span>
        </p>
      </div>
    </div>
  </section>
</template>
