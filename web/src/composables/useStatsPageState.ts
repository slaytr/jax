import { reactive, watch } from 'vue';
import { useRoute, useRouter, type LocationQueryRaw } from 'vue-router';

import { loadStatsState, saveStatsState } from '@shared/stats-state.js';

export const PAGE_TABS: Array<[string, string]> = [
  ['stats', 'Stats'],
  ['quests', 'Quests'],
  ['tasks', 'Tasks'],
  ['goals', 'Goals'],
];

const oneOf = (options: Array<[string, string]>, value: unknown, fallback: string) =>
  options.some(([option]) => option === value) ? (value as string) : fallback;

export interface StatsPageState {
  tab: string;
  questSearch: string;
  questSort: string;
  questStatus: string;
  questSkillReq: string;
  questlinesCollapsed: boolean;
  questlinesHideCompleted: boolean;
  goalLabelFilter: string;
  collapsedGoalGroups: string[];
  focusGoalId: string | null;
  taskSearch: string;
  // Which region/tier the Tasks tab is showing — like questSlug/seriesName
  // below, round-tripped through `?region=`/`?tier=` (not localStorage
  // alone) so a link to one specific tier's task list actually reopens it.
  taskRegionSlug: string | null;
  taskTier: string | null;
  // Which quest/questline the Quests tab's dependency map is anchored on,
  // and which node in it is highlighted — QuestsTab.vue's own doing (reads
  // these once to seed its selection, writes back on every change, clears
  // them on unmount). Deliberately *not* persisted to localStorage: unlike
  // every field above, a quest pick isn't a cross-page reading preference,
  // it's specific to whichever player's page is open. It still survives a
  // reload, via `?quest=`/`?series=`/`?node=` below instead.
  questSlug: string | null;
  seriesName: string | null;
  highlightedNodeSlug: string | null;
}

const queryString = (value: unknown): string | null => (typeof value === 'string' ? value : null);

/**
 * The player page's own persisted UI state — ported from stats.js's
 * loadStatsState/saveStatsState/syncUrlToState. One shared localStorage key
 * across every player page (a *reading* preference, not tied to any one
 * player's data) for most fields, plus `?tab=`/`?quest=`/`?series=`/`?node=`
 * query params — same names/semantics as the old page's own
 * readLinkParams/syncUrlToState — that seed the very first render and stay
 * in sync with it afterward, so a URL (or a plain refresh) is enough to
 * reopen exactly what was on screen, quest/questline selection included.
 *
 * Unlike the legacy page's own history.replaceState call at the top of
 * every render(), this uses router.replace — same "never piles up back
 * button entries" effect, just through Vue Router's own history API. And
 * unlike that page's own single syncUrlToState (a whole-page render loop
 * with one obvious place to hang it), this is the one spot every field that
 * can affect the URL flows through — deliberately, so there's exactly one
 * place computing it instead of two watchers racing to each write their own
 * partial view of it (an earlier version of the quest/series/node sync
 * lived in QuestsTab.vue itself and hit exactly that race against this
 * watcher's own tab sync).
 */
export function useStatsPageState() {
  const route = useRoute();
  const router = useRouter();
  const persisted = loadStatsState();

  const state = reactive<StatsPageState>({
    tab: oneOf(PAGE_TABS, route.query.tab ?? persisted.tab, 'stats'),
    questSearch: typeof persisted.questSearch === 'string' ? persisted.questSearch : '',
    questSort: typeof persisted.questSort === 'string' ? persisted.questSort : 'name',
    questStatus: typeof persisted.questStatus === 'string' ? persisted.questStatus : 'all',
    questSkillReq: typeof persisted.questSkillReq === 'string' ? persisted.questSkillReq : 'all',
    questlinesCollapsed: persisted.questlinesCollapsed === true,
    questlinesHideCompleted: persisted.questlinesHideCompleted === true,
    goalLabelFilter: typeof persisted.goalLabelFilter === 'string' ? persisted.goalLabelFilter : '',
    collapsedGoalGroups: Array.isArray(persisted.collapsedGoalGroups) ? persisted.collapsedGoalGroups : [],
    focusGoalId: typeof persisted.focusGoalId === 'string' ? persisted.focusGoalId : null,
    taskSearch: typeof persisted.taskSearch === 'string' ? persisted.taskSearch : '',
    taskRegionSlug: queryString(route.query.region),
    taskTier: queryString(route.query.tier),
    questSlug: queryString(route.query.quest),
    seriesName: queryString(route.query.series),
    highlightedNodeSlug: queryString(route.query.node),
  });

  watch(
    state,
    (value) => {
      const { questSlug, seriesName, highlightedNodeSlug, taskRegionSlug, taskTier, ...persistable } = value;
      saveStatsState(persistable);

      // quest/series/node only ever apply while actually on the Quests tab
      // — gating on `value.tab` here (not "are they null") means leaving
      // the tab drops them from the URL immediately, before QuestsTab.vue's
      // own unmount even gets a chance to clear them back to null itself.
      const query: LocationQueryRaw = { ...route.query, tab: value.tab };
      delete query.quest;
      delete query.series;
      delete query.node;
      delete query.region;
      delete query.tier;
      if (value.tab === 'quests') {
        if (value.questSlug) query.quest = value.questSlug;
        else if (value.seriesName) query.series = value.seriesName;
        if ((value.questSlug || value.seriesName) && value.highlightedNodeSlug) query.node = value.highlightedNodeSlug;
      } else if (value.tab === 'tasks') {
        if (value.taskRegionSlug) query.region = value.taskRegionSlug;
        if (value.taskRegionSlug && value.taskTier) query.tier = value.taskTier;
      }

      const currentKeys = Object.keys(route.query);
      const nextKeys = Object.keys(query);
      const unchanged = nextKeys.length === currentKeys.length && nextKeys.every((key) => query[key] === route.query[key]);
      if (!unchanged) router.replace({ query });
    },
    { deep: true },
  );

  return state;
}
