<script setup lang="ts">
import { computed, ref } from 'vue';

import { statusOf } from '@shared/quest-status.js';

/**
 * One quick-link chip per questline, sitting above the quest list/
 * dependency map so a viewer chasing a specific story arc (Mahjarrat
 * Mysteries, Elf, Myreque, ...) can jump straight to it instead of
 * searching or scrolling for each member individually. Ported from
 * views/quest-series-links.js's renderQuestSeriesLinks.
 *
 * A chip reads "<series> <completed>/<total>" — this player's own progress
 * through the series, not the final quest's own position.
 *
 * "Hide completed" (statsState's own questlinesHideCompleted, same
 * persisted-preference treatment as questlinesCollapsed) trims chips whose
 * completed count already equals total — the count badge above the row
 * keeps counting every questline regardless, since that's "how many exist,"
 * not "how many are offered right now."
 *
 * Pin mode (the pin-icon checkbox beside "Hide completed") repurposes a
 * chip click while it's on: instead of selecting that series for the
 * dependency map, it toggles the series into/out of `pinned` (owned by
 * statsState/QuestsTab.vue, since it's worth remembering across a reload —
 * there's no curated "which questlines matter" data to sort by otherwise,
 * so this just lets a viewer say so themselves). Pinned chips sort to the
 * front, most-recently-pinned first, ahead of the plain alphabetical order
 * everything else keeps. `pinMode` itself is deliberately local, unpersisted
 * state — a viewer turns it on, rearranges a few chips, and it's back off
 * next visit rather than silently changing what a plain click does.
 */

// A handful of series where the wiki's own seriesPosition picks a quest
// that doesn't actually read as the story's own conclusion — see the
// original views/quest-series-links.js for the full reasoning.
const SERIES_FINAL_QUEST_OVERRIDES: Record<string, string> = {
  'Fort Forinthry': 'Ode of the Devourer',
};

const props = defineProps<{
  quests: any[] | null;
  player: any;
  selectedSeriesName: string | null;
  collapsed: boolean;
  hideCompleted: boolean;
  pinned: string[];
}>();

const emit = defineEmits<{ toggleCollapsed: []; toggleHideCompleted: []; togglePin: [name: string]; selectSeries: [name: string] }>();

const pinMode = ref(false);

const series = computed(() => {
  if (!props.quests) return [];
  const bySeries = new Map<string, any[]>();
  for (const quest of props.quests) {
    if (!quest.series) continue;
    if (!bySeries.has(quest.series)) bySeries.set(quest.series, []);
    bySeries.get(quest.series)!.push(quest);
  }
  if (bySeries.size === 0) return [];

  const completedSet = new Set(props.player.completedQuests ?? []);
  const startedSet = new Set(props.player.startedQuests ?? []);
  const pinRank = new Map(props.pinned.map((name, index) => [name, index]));

  return [...bySeries.entries()]
    .map(([name, members]) => {
      const overrideName = SERIES_FINAL_QUEST_OVERRIDES[name];
      const override = overrideName ? members.find((member) => member.name === overrideName) : undefined;
      return {
        name,
        total: members.length,
        completed: members.filter((member) => statusOf(member, completedSet, startedSet) === 'completed').length,
        final: override ?? members.reduce((latest, member) => (member.seriesPosition > latest.seriesPosition ? member : latest)),
        pinRank: pinRank.get(name) ?? null,
      };
    })
    .sort((a, b) => {
      if (a.pinRank !== null && b.pinRank !== null) return a.pinRank - b.pinRank;
      if (a.pinRank !== null) return -1;
      if (b.pinRank !== null) return 1;
      return a.name.localeCompare(b.name);
    });
});

function onChipClick(name: string) {
  if (pinMode.value) emit('togglePin', name);
  else emit('selectSeries', name);
}

// The count badge always reads off `series` itself (every questline this
// player has), not this — "Hide completed" trims what's offered to click,
// it isn't a different measure of how many questlines exist.
const visibleSeries = computed(() => (props.hideCompleted ? series.value.filter((s) => s.completed !== s.total) : series.value));
</script>

<template>
  <section v-if="series.length > 0" class="lb quest-series-card" :class="{ 'is-collapsed': collapsed }">
    <div class="lb-head">
      <button type="button" class="quest-series-toggle" :aria-expanded="collapsed ? 'false' : 'true'" @click="emit('toggleCollapsed')">
        <span class="quest-series-chevron" aria-hidden="true" />
        <h2>Questlines</h2>
        <span class="quest-series-count">{{ series.length }}</span>
      </button>
      <div class="quest-series-controls">
        <label class="quest-series-hide-completed">
          <input type="checkbox" :checked="hideCompleted" @change="emit('toggleHideCompleted')" />
          <span>Hide completed</span>
        </label>
        <label class="quest-series-hide-completed quest-series-pin-mode" :class="{ 'is-active': pinMode }" title="Pin questlines to the front of this row">
          <input type="checkbox" v-model="pinMode" />
          <svg class="pin-mode-icon" viewBox="0 0 18 18" aria-hidden="true" focusable="false">
            <path d="M9 2 L13 6 L10.2 8.8 L11 13 L9 15 L7 13 L7.8 8.8 L5 6 Z" />
            <line x1="9" y1="15" x2="9" y2="17.5" class="pin-mode-icon-line" />
          </svg>
          <span class="visually-hidden">Pin questlines</span>
        </label>
      </div>
    </div>
    <div v-if="!collapsed && pinMode" class="quest-series-pin-hint">Click a questline to pin it to the front.</div>
    <div v-if="!collapsed && visibleSeries.length > 0" class="quest-series-links">
      <button
        v-for="s in visibleSeries"
        :key="s.name"
        type="button"
        :class="`quest-series-link${s.name === selectedSeriesName ? ' is-selected' : ''}${s.completed === s.total ? ' is-done' : ''}${s.pinRank !== null ? ' is-pinned' : ''}`"
        :title="pinMode ? `${s.pinRank !== null ? 'Unpin' : 'Pin'} ${s.name}` : `Show every quest in the ${s.name} series (ends with ${s.final.name})`"
        @click="onChipClick(s.name)"
      >
        <svg v-if="s.pinRank !== null" class="quest-series-link-pin" viewBox="0 0 18 18" aria-hidden="true" focusable="false">
          <path d="M9 2 L13 6 L10.2 8.8 L11 13 L9 15 L7 13 L7.8 8.8 L5 6 Z" />
        </svg>
        {{ s.name }} {{ s.completed }}/{{ s.total }}
      </button>
    </div>
    <p v-else-if="!collapsed" class="quest-series-empty">Every questline is completed.</p>
  </section>
</template>
