<script setup lang="ts">
import { computed } from 'vue';

import { skillLevelsByName, statusOf } from '@shared/quest-status.js';
import { questWikiUrl } from '@shared/quest-goal.js';
import { WIKI_ICON } from '@shared/config.js';
import { filterAndSortQuests, questProgressCount, SKILL_OPTIONS, SORT_OPTIONS, STATUS_MARKER, STATUS_OPTIONS } from '@/lib/quests';

/**
 * The Skills grid's replacement on the Quests tab — same footprint as
 * Skills, plus a compact filter/sort toolbar above the list. Ported from
 * views/player-quests.js's renderPlayerQuestList. Reused a second time on
 * the Goals tab (PlayerView.vue, titled "Set Quest Goals" there) as a quick way
 * to pick a quest to track — same list/filters, just a different `mode` for
 * what a row click means and says.
 *
 * A quest counts as complete/in-progress when its name matches (see
 * matchesTitle, quest-status.js) an entry in the player's own
 * completedQuests/startedQuests (RuneMetrics), and as skill-req-met when
 * every entry in its skillRequirements is at or below the player's own
 * current level for that skill — both live comparisons, not something a
 * viewer can override.
 *
 * The "Completed X/Y" line under the list always reflects every quest, not
 * just whatever the search/filters currently show — it's a progress
 * figure, not a result count.
 */
const props = withDefaults(
  defineProps<{
    player: any;
    quests: any[] | null;
    status: 'idle' | 'loading' | 'ready' | 'error';
    error: string | null;
    search: string;
    sort: string;
    statusFilter: string;
    skillReq: string;
    selectedQuestSlug: string | null;
    title?: string;
    // 'browse' (Quests tab): a row anchors the dependency map on it.
    // 'pick-goal' (Goals tab): a row opens the "track this as a goal?"
    // confirmation instead — only the row's own title tooltip differs;
    // `selectQuest` fires the same either way, the caller decides what it
    // means.
    mode?: 'browse' | 'pick-goal';
  }>(),
  { title: 'Quests', mode: 'browse' },
);

const emit = defineEmits<{
  'update:search': [value: string];
  'update:sort': [value: string];
  'update:statusFilter': [value: string];
  'update:skillReq': [value: string];
  selectQuest: [quest: any];
}>();

const skillLevels = computed(() => skillLevelsByName(props.player));

function rowTitle(quest: any) {
  return props.mode === 'pick-goal' ? `Track "${quest.name}" as a goal` : `Show ${quest.name}'s dependency chain`;
}
const completedSet = computed(() => new Set(props.player.completedQuests ?? []));
const startedSet = computed(() => new Set(props.player.startedQuests ?? []));

const filteredQuests = computed(() => {
  if (!props.quests) return [];
  return filterAndSortQuests(props.quests, props.player, { search: props.search, sort: props.sort, status: props.statusFilter, skillReq: props.skillReq }, skillLevels.value);
});

const completedCount = computed(() => (props.quests ? questProgressCount(props.player, props.quests) : 0));

function rowStatus(quest: any) {
  return statusOf(quest, completedSet.value, startedSet.value);
}
</script>

<template>
  <section class="lb quest-list-card">
    <div class="lb-head"><div class="lb-title"><h2>{{ title }}</h2></div></div>

    <div class="quest-filters">
      <label class="quest-filter">
        <span class="visually-hidden">Search quests by name</span>
        <input type="search" class="quest-search-input" placeholder="Search quests…" :value="search" @input="emit('update:search', ($event.target as HTMLInputElement).value)" />
      </label>
      <label class="quest-filter">
        <span class="visually-hidden">Sort quests by</span>
        <select class="quest-filter-select" :value="sort" @change="emit('update:sort', ($event.target as HTMLSelectElement).value)">
          <option v-for="[value, label] in SORT_OPTIONS" :key="value" :value="value">{{ label }}</option>
        </select>
      </label>
      <label class="quest-filter">
        <span class="visually-hidden">Filter by completion status</span>
        <select class="quest-filter-select" :value="statusFilter" @change="emit('update:statusFilter', ($event.target as HTMLSelectElement).value)">
          <option v-for="[value, label] in STATUS_OPTIONS" :key="value" :value="value">{{ label }}</option>
        </select>
      </label>
      <label class="quest-filter">
        <span class="visually-hidden">Filter by skill requirement</span>
        <select class="quest-filter-select" :value="skillReq" @change="emit('update:skillReq', ($event.target as HTMLSelectElement).value)">
          <option v-for="[value, label] in SKILL_OPTIONS" :key="value" :value="value">{{ label }}</option>
        </select>
      </label>
    </div>

    <p v-if="status !== 'ready'" class="chart-empty">{{ status === 'error' ? error : 'Loading quests…' }}</p>
    <p v-else-if="filteredQuests.length === 0" class="chart-empty quest-list-empty">No quests match these filters.</p>
    <ul v-else class="quest-list">
      <li v-for="quest in filteredQuests" :key="quest.slug" :class="`quest-list-item is-${rowStatus(quest)}${quest.slug === selectedQuestSlug ? ' is-selected' : ''}`">
        <span v-if="rowStatus(quest) === 'completed'" class="quest-list-check" aria-hidden="true">{{ STATUS_MARKER.completed }}</span>
        <a
          v-else
          class="quest-list-check goal-card-wiki-link quest-list-wiki-link"
          :href="questWikiUrl(quest.name)"
          target="_blank"
          rel="noopener noreferrer"
          :aria-label="`Open ${quest.name} quick guide on the wiki`"
          title="Quick guide (wiki)"
        >
          <img :src="WIKI_ICON" alt="" width="10" height="10" decoding="async" />
        </a>
        <button type="button" class="quest-list-name" :title="rowTitle(quest)" @click="emit('selectQuest', quest)">{{ quest.name }}</button>
      </li>
    </ul>

    <p v-if="status === 'ready'" class="quest-progress">Completed {{ completedCount }}/{{ quests!.length }}</p>
  </section>
</template>
