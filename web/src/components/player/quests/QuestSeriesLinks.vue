<script setup lang="ts">
import { computed } from 'vue';

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
}>();

const emit = defineEmits<{ toggleCollapsed: []; toggleHideCompleted: []; selectSeries: [name: string] }>();

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

  return [...bySeries.entries()]
    .map(([name, members]) => {
      const overrideName = SERIES_FINAL_QUEST_OVERRIDES[name];
      const override = overrideName ? members.find((member) => member.name === overrideName) : undefined;
      return {
        name,
        total: members.length,
        completed: members.filter((member) => statusOf(member, completedSet, startedSet) === 'completed').length,
        final: override ?? members.reduce((latest, member) => (member.seriesPosition > latest.seriesPosition ? member : latest)),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
});

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
      <label class="quest-series-hide-completed">
        <input type="checkbox" :checked="hideCompleted" @change="emit('toggleHideCompleted')" />
        <span>Hide completed</span>
      </label>
    </div>
    <div v-if="!collapsed && visibleSeries.length > 0" class="quest-series-links">
      <button
        v-for="s in visibleSeries"
        :key="s.name"
        type="button"
        :class="`quest-series-link${s.name === selectedSeriesName ? ' is-selected' : ''}${s.completed === s.total ? ' is-done' : ''}`"
        :title="`Show every quest in the ${s.name} series (ends with ${s.final.name})`"
        @click="emit('selectSeries', s.name)"
      >
        {{ s.name }} {{ s.completed }}/{{ s.total }}
      </button>
    </div>
    <p v-else-if="!collapsed" class="quest-series-empty">Every questline is completed.</p>
  </section>
</template>
