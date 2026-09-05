<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';

import { initialExpansionFor } from '@shared/quest-graph.js';
import { statusOf } from '@shared/quest-status.js';
import { useQuests } from '@/composables/useQuests';
import { useGoals } from '@/composables/useGoals';
import type { StatsPageState } from '@/composables/useStatsPageState';
import type { GraphSelection } from '@/lib/questGraphLayout';
import QuestSeriesLinks from '@/components/player/quests/QuestSeriesLinks.vue';
import QuestList from '@/components/player/quests/QuestList.vue';
import QuestDependencyGraph from '@/components/player/quests/QuestDependencyGraph.vue';
import QuestPlanner from '@/components/player/quests/QuestPlanner.vue';
import QuestGoalDialog from '@/components/player/quests/QuestGoalDialog.vue';

/**
 * The Quests tab's own orchestration: lazily loads quest-data (only once
 * this tab is open — see useQuests.ts), and ties the questline chip row,
 * the list + dependency map, and the planner together. Ported from
 * stats.js's own Quests-tab slice.
 *
 * Search/sort/status/skill-requirement filters and the questlines-
 * collapsed toggle are persisted (statsState, same as the Goals tab's own
 * label filter). Which quest/questline is selected/expanded/highlighted
 * isn't persisted to localStorage, but does survive a reload: `statsState`
 * also carries questSlug/seriesName/highlightedNodeSlug, which
 * useStatsPageState.ts round-trips through `?quest=`/`?series=`/`?node=` in
 * the address bar — same param names/semantics the old page's own
 * readLinkParams/applyQuestLinkParams/syncUrlToState (stats.js) used. This
 * component just reads/writes those three fields (see the two watchers
 * below); it doesn't touch the URL itself — see useStatsPageState.ts's own
 * doc comment for why that's centralized there instead of here.
 *
 * Deliberately never cleared on unmount: PlayerView.vue tears this whole
 * component down on switching to Stats/Tasks/Goals (v-else-if), but
 * statsState itself is owned one level up and outlives that, so the three
 * fields just sit there unread until a later switch back to Quests mounts
 * a fresh instance of this component and its own read-side watcher below
 * picks them right back up — the same selection reopens rather than
 * starting over. useStatsPageState.ts's own watcher already drops
 * `?quest=`/`?series=`/`?node=` from the URL the moment `tab` itself
 * changes away (gated on `value.tab`, not on these fields being null), so
 * the address bar stays honest about the *visible* tab regardless of what
 * this component is quietly holding onto for its own next mount.
 * Fullscreen is the one thing that genuinely resets: it's a viewport mode,
 * not a place in the map, so a fresh load has no business reopening it.
 *
 * TEMP: no ownership gate on "track as a goal" — Discord auth is disabled
 * for now (see useGoals.ts's own doc comment).
 */
const props = defineProps<{ player: any; statsState: StatsPageState }>();

const canEdit = true;

const { quests, status, error, ensureLoaded } = useQuests();
onMounted(ensureLoaded);

const { goals, reload, create } = useGoals(props.player.slug);
onMounted(reload);

const existingQuestGoalNames = computed(() => new Set(goals.value.filter((goal) => goal.kind === 'quest').map((goal) => goal.questName)));

// Which quest the dependency map is anchored on (a list row), or which
// questline instead (a quest-series-links chip) — mutually exclusive.
// Seeded from the URL below once quest-data loads, then kept in sync with
// it afterward (also below) — not itself persisted anywhere.
const selectedQuestSlug = ref<string | null>(null);
const selectedSeriesName = ref<string | null>(null);
const expandedQuestNames = ref<Set<string>>(new Set());
const highlightedQuestName = ref<string | null>(null);
const questGraphFullscreen = ref(false);
const questGoalDraftQuest = ref<any | null>(null);

const selectedQuest = computed(() => quests.value?.find((quest) => quest.slug === selectedQuestSlug.value) ?? null);
const selection = computed<GraphSelection | null>(() => {
  if (selectedSeriesName.value) return { kind: 'series', seriesName: selectedSeriesName.value };
  if (selectedQuest.value) return { kind: 'quest', quest: selectedQuest.value };
  return null;
});

/** Every branch from every name in `targetNames`, expanded until (and
 * including) the first quest this player's already completed — what they
 * still have left to do, already unfolded, rather than a lone collapsed
 * node they'd have to click their way down from scratch every time. */
function expandForTargets(targetNames: string[]): Set<string> {
  if (!quests.value) return new Set();
  const byName = new Map(quests.value.map((quest) => [quest.name, quest]));
  const completedSet = new Set(props.player.completedQuests ?? []);
  const startedSet = new Set(props.player.startedQuests ?? []);
  const isCompleted = (name: string) => {
    const match = byName.get(name);
    return match ? statusOf(match, completedSet, startedSet) === 'completed' : false;
  };
  return initialExpansionFor(quests.value, targetNames, isCompleted);
}

function onSelectQuest(quest: any) {
  const reselecting = selectedQuestSlug.value === quest.slug;
  selectedQuestSlug.value = reselecting ? null : quest.slug;
  selectedSeriesName.value = null;
  expandedQuestNames.value = reselecting ? new Set() : expandForTargets([quest.name]);
  highlightedQuestName.value = null;
}

function onSelectSeries(seriesName: string) {
  const reselecting = selectedSeriesName.value === seriesName;
  selectedSeriesName.value = reselecting ? null : seriesName;
  selectedQuestSlug.value = null;
  const memberNames = reselecting || !quests.value ? [] : quests.value.filter((quest) => quest.series === seriesName).map((quest) => quest.name);
  expandedQuestNames.value = reselecting ? new Set() : expandForTargets(memberNames);
  highlightedQuestName.value = null;
}

function onToggleExpand(quest: any) {
  const next = new Set(expandedQuestNames.value);
  if (next.has(quest.name)) next.delete(quest.name);
  else next.add(quest.name);
  expandedQuestNames.value = next;
}

function onHighlightNode(name: string) {
  highlightedQuestName.value = highlightedQuestName.value === name ? null : name;
}

/** Read-side: applies statsState's own questSlug/seriesName/highlightedNodeSlug
 * (in turn seeded from `?quest=`/`?series=`/`?node=` — see
 * useStatsPageState.ts) to the local selection, including `quest` beating
 * `series` if somehow both are present, and an unmatched slug/name being
 * silently ignored rather than left half-applied. Not just a one-time seed
 * on load: useStatsPageState.ts pushes a browser-history entry for every
 * quest/series pick specifically so back/forward can step through them, and
 * a back/forward press only changes the URL — this watcher is what turns
 * that back into the map actually jumping to the quest/series it lands on.
 * Guarded by the equality check below so it only *acts* when statsState
 * disagrees with the current selection — otherwise every pick this
 * component makes itself would immediately loop back through here via the
 * write-side watcher beneath it. */
watch(
  () => [quests.value, props.statsState.questSlug, props.statsState.seriesName, props.statsState.highlightedNodeSlug] as const,
  ([value, questSlug, seriesName, highlightedNodeSlug]) => {
    if (!value) return;

    if (questSlug !== selectedQuestSlug.value || seriesName !== selectedSeriesName.value) {
      const quest = questSlug ? value.find((candidate) => candidate.slug === questSlug) : null;
      if (quest) {
        onSelectQuest(quest);
      } else if (seriesName && value.some((candidate) => candidate.series === seriesName)) {
        onSelectSeries(seriesName);
      } else {
        selectedQuestSlug.value = null;
        selectedSeriesName.value = null;
        expandedQuestNames.value = new Set();
        highlightedQuestName.value = null;
      }
    }

    const currentNodeSlug = highlightedQuestName.value ? (value.find((candidate) => candidate.name === highlightedQuestName.value)?.slug ?? null) : null;
    if (highlightedNodeSlug !== currentNodeSlug) {
      const node = highlightedNodeSlug ? value.find((candidate) => candidate.slug === highlightedNodeSlug) : null;
      highlightedQuestName.value = node ? node.name : null;
    }
  },
  { immediate: true },
);

/** Write-side: keeps statsState's own questSlug/seriesName/highlightedNodeSlug
 * in sync with whatever's currently selected — the counterpart to the
 * watcher above, and useStatsPageState.ts's own watcher is what actually
 * turns this into `?quest=`/`?series=`/`?node=` in the address bar (kept
 * centralized there rather than duplicated here — see its own doc comment
 * for why). */
watch([selectedQuestSlug, selectedSeriesName, highlightedQuestName], () => {
  props.statsState.questSlug = selectedQuestSlug.value;
  props.statsState.seriesName = selectedSeriesName.value;
  const node = highlightedQuestName.value ? (quests.value?.find((quest) => quest.name === highlightedQuestName.value) ?? null) : null;
  props.statsState.highlightedNodeSlug = node ? node.slug : null;
});

function togglePinSeries(name: string) {
  const pinned = props.statsState.questlinesPinned;
  props.statsState.questlinesPinned = pinned.includes(name) ? pinned.filter((entry) => entry !== name) : [name, ...pinned];
}

function handleConfirmQuestGoal(drafts: any[]) {
  create(drafts);
  questGoalDraftQuest.value = null;
}
</script>

<template>
  <QuestSeriesLinks
    :quests="quests"
    :player="player"
    :selected-series-name="selectedSeriesName"
    :collapsed="statsState.questlinesCollapsed"
    :hide-completed="statsState.questlinesHideCompleted"
    :pinned="statsState.questlinesPinned"
    @toggle-collapsed="statsState.questlinesCollapsed = !statsState.questlinesCollapsed"
    @toggle-hide-completed="statsState.questlinesHideCompleted = !statsState.questlinesHideCompleted"
    @toggle-pin="togglePinSeries"
    @select-series="onSelectSeries"
  />

  <div class="player-row">
    <QuestList
      :player="player"
      :quests="quests"
      :status="status"
      :error="error"
      :search="statsState.questSearch"
      :sort="statsState.questSort"
      :status-filter="statsState.questStatus"
      :skill-req="statsState.questSkillReq"
      :selected-quest-slug="selectedQuestSlug"
      @update:search="statsState.questSearch = $event"
      @update:sort="statsState.questSort = $event"
      @update:status-filter="statsState.questStatus = $event"
      @update:skill-req="statsState.questSkillReq = $event"
      @select-quest="onSelectQuest"
    />

    <QuestDependencyGraph
      :quests="quests"
      :player="player"
      :selection="selection"
      :expanded-names="expandedQuestNames"
      :highlighted-name="highlightedQuestName"
      :existing-quest-goal-names="existingQuestGoalNames"
      :can-edit="canEdit"
      :is-fullscreen="questGraphFullscreen"
      @toggle-expand="onToggleExpand"
      @highlight-node="onHighlightNode"
      @create-quest-goal="questGoalDraftQuest = $event"
      @toggle-fullscreen="questGraphFullscreen = !questGraphFullscreen"
    />
  </div>

  <QuestPlanner v-if="quests" :quests="quests" :player="player" @select-quest="onSelectQuest" @select-series="onSelectSeries" />

  <QuestGoalDialog v-if="questGoalDraftQuest" :quest="questGoalDraftQuest" :player="player" :quests="quests" @confirm="handleConfirmQuestGoal" @close="questGoalDraftQuest = null" />
</template>
