<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';

import { dependencyGraphFor, visibleDependencyGraph } from '@shared/quest-graph.js';
import { skillLevelsByName } from '@shared/quest-status.js';
import { SKILLS, iconFor, WIKI_ICON } from '@shared/config.js';
import { questWikiUrl } from '@shared/quest-goal.js';
import { STATUS_MARKER } from '@/lib/quests';
import { usePrefs } from '@/composables/usePrefs';
import { useQuestGuides } from '@/composables/useQuestGuides';
import QuestQuickGuide from '@/components/player/quests/QuestQuickGuide.vue';
import {
  canCreateQuestGoal,
  edgePath,
  expandButtonTitle,
  graphCaptionText,
  highlightSetFor,
  isExpandable,
  layoutOf,
  nodeHeight,
  nodeStatus,
  nodeTitle,
  NODE_WIDTH,
  targetNamesFor,
  visibleSkillRequirements,
  type GraphSelection,
} from '@/lib/questGraphLayout';

/**
 * The Quests tab's second column: a left-to-right flow chart of whichever
 * quest (or whole questline) is currently selected beside it, built up by
 * expanding one quest at a time. Ported from views/quest-dependency-graph.js.
 *
 * Two separate click targets share each node: the small "+"/"–" button
 * (toggleExpand) reveals or hides that quest's own direct requirements; the
 * rest of the node (highlightNode) selects it for highlighting instead —
 * every node feeding into it stays at full opacity while everything else
 * dims. The two are fully independent state, both owned by the parent
 * (QuestsTab.vue). Every node also carries a wiki-quick-guide link (the same
 * questWikiUrl/WIKI_ICON pairing a goal card's own link uses — GoalCard.vue),
 * stopped from bubbling into either of those so opening the guide never
 * expands or highlights the node underneath it.
 *
 * Fullscreen uses a real `<Teleport to="body">` rather than the old
 * hand-rolled body-level portal (views/quest-dependency-graph.js's
 * ensureFullscreenPortal/clearFullscreenPortal) — Vue already solves the
 * "escape #panel's own transformed containing block" problem a portal was
 * built for.
 *
 * Map/guide is a second view alongside the same selection — same "list vs
 * graph" shape as the Goals tab's own toggle (GoalsList.vue), including
 * persisting the choice the same way (usePrefs). Only a single quest has a
 * guide to show (QuestQuickGuide.vue), so `guideQuest` below prefers
 * whichever node is currently highlighted in the map (clicking a node's
 * own name — the same highlightNode emit that dims the rest of the graph)
 * over the plain selection: that's what lets clicking around a whole
 * questline's map pick out one member's guide, not just whatever single
 * quest the map happened to be anchored on. useQuestGuides.ts's own
 * quest-guides.json is only ever requested once a viewer actually switches
 * to this view — not just from opening the Quests tab, same lazy-load
 * reasoning as useQuests.ts's own quest list fetch. Which quest's guide
 * was last shown persists too (lastGuideQuestSlug/prefs.lastQuestGuideSlug),
 * independent of QuestsTab.vue's own URL-param round-trip for the plain
 * selection — a fresh load with no `?quest=`/`?node=` of its own still
 * reopens on it.
 */
const props = defineProps<{
  quests: any[] | null;
  player: any;
  selection: GraphSelection | null;
  expandedNames: Set<string>;
  highlightedName: string | null;
  existingQuestGoalNames: Set<string>;
  canEdit: boolean;
  isFullscreen: boolean;
}>();

const emit = defineEmits<{
  toggleExpand: [quest: any];
  highlightNode: [name: string];
  createQuestGoal: [quest: any];
  toggleFullscreen: [];
}>();

const SKILL_BY_NAME = new Map(SKILLS.map((skill: any) => [skill.name, skill]));

const { prefs, savePref } = usePrefs();
const view = ref<'map' | 'guide'>(prefs.questGraphView === 'guide' ? 'guide' : 'map');
watch(view, (value) => savePref({ questGraphView: value }));

const { guides, status: guidesStatus, ensureLoaded: ensureGuidesLoaded } = useQuestGuides();
watch(
  view,
  (value) => {
    if (value === 'guide') ensureGuidesLoaded();
  },
  { immediate: true },
);
/** Seeded from prefs (usePrefs, same "remember it even across a fresh
 * visit with no URL params at all" reasoning as Standings.vue's own
 * standingsSelectedPlayer) — not itself reactive to a later savePref call,
 * so `guideQuest` below never reads `prefs.lastQuestGuideSlug` directly;
 * this ref plus the watcher underneath it are what keep it live. */
const lastGuideQuestSlug = ref<string | null>(prefs.lastQuestGuideSlug ? String(prefs.lastQuestGuideSlug) : null);

/** Which quest the guide view is actually showing — a highlighted node
 * (clicking a node's own name in the map, same highlightNode emit that
 * dims everything else) wins over the plain selection, so clicking around
 * the map updates the guide view right along with it, not just the one
 * quest/questline the map itself is anchored on. Falls back to the anchor
 * selection itself when it's a single quest (not a whole questline) and
 * nothing's highlighted, then to whichever quest's guide was last shown
 * (lastGuideQuestSlug) when neither of those resolves to one either — a
 * fresh page load with no `?quest=`/`?node=` of its own (a plain refresh
 * that happened to land with nothing selected, or opening the tab fresh in
 * a new visit) still reopens on the last guide a viewer was actually
 * looking at, rather than the empty prompt. */
const guideQuest = computed(() => {
  const highlighted = props.highlightedName ? (props.quests?.find((quest) => quest.name === props.highlightedName) ?? null) : null;
  if (highlighted) return highlighted;
  if (props.selection?.kind === 'quest') return props.selection.quest;
  return lastGuideQuestSlug.value ? (props.quests?.find((quest) => quest.slug === lastGuideQuestSlug.value) ?? null) : null;
});
const selectedQuestGuide = computed(() => (guideQuest.value && guides.value ? (guides.value[guideQuest.value.name] ?? null) : null));

watch(guideQuest, (quest) => {
  if (!quest || lastGuideQuestSlug.value === quest.slug) return;
  lastGuideQuestSlug.value = quest.slug;
  savePref({ lastQuestGuideSlug: quest.slug });
});

const targetNames = computed(() => (props.quests && props.selection ? targetNamesFor(props.quests, props.selection) : []));
const totalGraph = computed(() => (props.quests && props.selection ? dependencyGraphFor(props.quests, targetNames.value) : null));
const visibleGraph = computed(() => (props.quests && props.selection ? visibleDependencyGraph(props.quests, targetNames.value, props.expandedNames) : null));
const layout = computed(() => (visibleGraph.value ? layoutOf(visibleGraph.value) : null));

const skillLevels = computed(() => skillLevelsByName(props.player));
const completedSet = computed<Set<string>>(() => new Set(props.player.completedQuests ?? []));
const startedSet = computed<Set<string>>(() => new Set(props.player.startedQuests ?? []));
const highlightSet = computed(() => (visibleGraph.value ? highlightSetFor(visibleGraph.value, props.highlightedName) : null));
const targetCount = computed(() => visibleGraph.value?.nodes.filter((node: any) => node.isTarget).length ?? 0);
const isQuestlineTarget = computed(() => props.selection?.kind === 'series');

const caption = computed(() => (totalGraph.value && props.selection ? graphCaptionText(totalGraph.value, targetNames.value, props.selection) : ''));
const notFoundLabel = computed(() => {
  if (!props.selection) return '';
  return props.selection.kind === 'series' ? `the "${props.selection.seriesName}" questline` : `"${props.selection.quest.name}"`;
});

function statusOfNode(node: any) {
  return nodeStatus(node, completedSet.value, startedSet.value);
}
function nodeClasses(node: any) {
  const status = statusOfNode(node);
  return [
    'quest-graph-node',
    `is-${status}`,
    node.isTarget ? (isQuestlineTarget.value ? 'is-questline-target' : 'is-target') : null,
    node.isExpanded ? 'is-expanded' : null,
    isDimmed(node.name) ? 'is-dimmed' : null,
    node.name === props.highlightedName ? 'is-highlighted' : null,
  ]
    .filter(Boolean)
    .join(' ');
}
function isDimmed(name: string) {
  return highlightSet.value ? !highlightSet.value.has(name) : false;
}
function edgeClasses(edge: any) {
  const dimmed = highlightSet.value ? !(highlightSet.value.has(edge.from) && highlightSet.value.has(edge.to)) : false;
  return `quest-graph-edge${edge.relation !== 'required' ? ' is-partial' : ''}${dimmed ? ' is-dimmed' : ''}`;
}
function skillMet(req: any) {
  return (skillLevels.value.get(req.skill) ?? 0) >= req.level;
}
function offerGoal(node: any) {
  return props.canEdit && canCreateQuestGoal(node, statusOfNode(node), props.existingQuestGoalNames);
}
function position(name: string) {
  return layout.value!.positionByName.get(name)!;
}

// Escape is the standard way out of any fullscreen-shaped UI; the overlay
// is plain CSS rather than the native Fullscreen API, so nothing closes it
// for free.
function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && props.isFullscreen) emit('toggleFullscreen');
}
onMounted(() => window.addEventListener('keydown', onKeydown));
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown));

// The overlay covers the whole viewport but sits in normal document flow
// underneath — without this, the page itself would still scroll behind it.
watch(
  () => props.isFullscreen,
  (value) => {
    document.body.style.overflow = value ? 'hidden' : '';
  },
);
onBeforeUnmount(() => {
  if (props.isFullscreen) document.body.style.overflow = '';
});

const LEGEND_ITEMS: Array<[string, string]> = [
  ['is-completed', 'Completed'],
  ['is-in-progress', 'In progress'],
  ['is-not-started', 'Not started'],
  ['is-external', 'Not a tracked quest'],
  ['is-target', 'Selected quest'],
  ['is-questline-target', 'Selected questline'],
];
</script>

<template>
  <Teleport to="body" :disabled="!isFullscreen">
    <section class="lb quest-flowchart" :class="{ 'is-fullscreen': isFullscreen }">
      <div class="lb-head">
        <div class="lb-title"><h2>{{ view === 'guide' ? 'Quick guide' : 'Dependency map' }}</h2></div>
        <div class="gains-view-tabs" role="tablist" aria-label="Quest panel display">
          <button type="button" class="gains-view-toggle" :class="{ 'is-active': view === 'map' }" role="tab" :aria-selected="view === 'map'" title="Show the dependency map" @click="view = 'map'">
            <svg class="toggle-icon" viewBox="0 0 18 18" aria-hidden="true" focusable="false">
              <line x1="3.5" y1="9" x2="9" y2="3.5" class="toggle-line" />
              <line x1="3.5" y1="9" x2="9" y2="14.5" class="toggle-line" />
              <line x1="9" y1="3.5" x2="15" y2="9" class="toggle-line" />
              <line x1="9" y1="14.5" x2="15" y2="9" class="toggle-line" />
              <circle cx="3.5" cy="9" r="1.6" />
              <circle cx="9" cy="3.5" r="1.6" />
              <circle cx="9" cy="14.5" r="1.6" />
              <circle cx="15" cy="9" r="1.6" />
            </svg>
            <span class="visually-hidden">Show the dependency map</span>
          </button>
          <button type="button" class="gains-view-toggle" :class="{ 'is-active': view === 'guide' }" role="tab" :aria-selected="view === 'guide'" title="Show the quick guide" @click="view = 'guide'">
            <svg class="toggle-icon" viewBox="0 0 18 18" aria-hidden="true" focusable="false">
              <rect x="1.5" y="2" width="15" height="3.2" rx="1" />
              <rect x="1.5" y="7.4" width="15" height="3.2" rx="1" />
              <rect x="1.5" y="12.8" width="15" height="3.2" rx="1" />
            </svg>
            <span class="visually-hidden">Show the quick guide</span>
          </button>
        </div>
        <button
          type="button"
          class="quest-graph-fullscreen-btn"
          :title="isFullscreen ? 'Exit full screen' : 'Expand to full screen'"
          :aria-pressed="isFullscreen ? 'true' : 'false'"
          @click="emit('toggleFullscreen')"
        >
          {{ isFullscreen ? '✕' : '⛶' }}
        </button>
      </div>

      <!-- Guide view is checked ahead of the map's own `!selection` guard
           below rather than sharing it — guideQuest can resolve (a
           highlighted node, or lastGuideQuestSlug's own remembered quest)
           even when nothing's selected in the list/questlines row at all,
           so gating this behind `selection` would hide a guide that's
           genuinely there to show. -->
      <div v-if="view === 'guide'" class="quest-graph-body">
        <p v-if="!guideQuest" class="chart-empty">Select a single quest — or a node within a questline's map — to see its quick guide.</p>
        <p v-else-if="guidesStatus === 'loading'" class="chart-empty">Loading quick guide…</p>
        <p v-else-if="guidesStatus === 'error'" class="chart-empty">Couldn't load quick guide data.</p>
        <div v-else class="quest-guide-scroll">
          <QuestQuickGuide :quest="guideQuest" :guide="selectedQuestGuide" :player-slug="player.slug" />
        </div>
      </div>

      <p v-else-if="!selection || !quests" class="chart-empty">Click a quest on the left to see its dependency chain.</p>

      <p v-else-if="!totalGraph || !visibleGraph" class="chart-empty">Couldn't find {{ notFoundLabel }} in the quest data.</p>

      <div v-else class="quest-graph-body">
        <p class="quest-graph-caption">{{ caption }}</p>

        <div class="quest-graph-scroll">
          <div class="quest-graph-canvas" :style="{ width: `${layout!.width}px`, height: `${layout!.height}px` }">
            <svg class="quest-graph-edges" :width="layout!.width" :height="layout!.height">
              <defs>
                <marker id="quest-graph-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                  <path d="M 0 0 L 8 4 L 0 8 z" class="quest-graph-arrowhead" />
                </marker>
              </defs>
              <path
                v-for="(edge, i) in visibleGraph.edges"
                :key="i"
                :d="edgePath(edge, layout!.positionByName, layout!.heightByName)?.d"
                :class="edgeClasses(edge)"
                marker-end="url(#quest-graph-arrow)"
              />
            </svg>

            <div
              v-for="node in visibleGraph.nodes"
              :key="node.name"
              :class="nodeClasses(node)"
              :style="{ left: `${position(node.name).x}px`, top: `${position(node.name).y}px`, width: `${NODE_WIDTH}px`, height: `${nodeHeight(node)}px` }"
            >
              <div class="quest-graph-node-header">
                <button
                  v-if="isExpandable(node)"
                  type="button"
                  class="quest-graph-node-expand-btn"
                  :title="expandButtonTitle(node)"
                  @click.stop="emit('toggleExpand', node.quest)"
                >
                  {{ node.isExpanded ? '–' : '+' }}
                </button>
                <span v-else class="quest-graph-node-expand-btn is-empty" aria-hidden="true" />

                <button type="button" class="quest-graph-node-select" :title="nodeTitle(node, statusOfNode(node), targetCount)" @click="emit('highlightNode', node.name)">
                  <span v-if="STATUS_MARKER[statusOfNode(node)]" class="quest-graph-node-check" aria-hidden="true">{{ STATUS_MARKER[statusOfNode(node)] }}</span>
                  <span class="quest-graph-node-name">{{ node.name }}</span>
                </button>

                <a
                  class="goal-card-wiki-link quest-graph-node-wiki-link"
                  :href="questWikiUrl(node.name)"
                  target="_blank"
                  rel="noopener noreferrer"
                  :aria-label="`Open ${node.name} quick guide on the wiki`"
                  title="Quick guide (wiki)"
                  @click.stop
                >
                  <img :src="WIKI_ICON" alt="" width="12" height="12" decoding="async" />
                </a>

                <button v-if="offerGoal(node)" type="button" class="quest-graph-node-goal-btn" title="Track as a goal" @click.stop="emit('createQuestGoal', node.quest)">⚑</button>
              </div>

              <div v-if="visibleSkillRequirements(node).length > 0" class="quest-graph-node-skills">
                <span
                  v-for="req in visibleSkillRequirements(node)"
                  :key="req.skill"
                  :class="`quest-graph-node-skill is-${skillMet(req) ? 'met' : 'not-met'}`"
                  :title="`${req.skill} ${req.level}${skillMet(req) ? '' : ' — not met'}`"
                >
                  <img v-if="SKILL_BY_NAME.get(req.skill)" :src="iconFor(SKILL_BY_NAME.get(req.skill))" alt="" width="12" height="12" decoding="async" />
                  <span>{{ req.level }}</span>
                </span>
              </div>
            </div>
          </div>
        </div>

        <div class="quest-graph-legend">
          <span v-for="[cls, label] in LEGEND_ITEMS" :key="cls" class="quest-graph-legend-item">
            <span :class="`quest-graph-legend-swatch ${cls}`" aria-hidden="true" />
            <span>{{ label }}</span>
          </span>
          <span class="quest-graph-legend-item"><span class="quest-graph-legend-line" aria-hidden="true" /><span>Required</span></span>
          <span class="quest-graph-legend-item"><span class="quest-graph-legend-line is-partial" aria-hidden="true" /><span>Partial / full completion</span></span>
          <span class="quest-graph-legend-item"><span class="quest-graph-legend-expand" aria-hidden="true">+</span><span>Has more — click to expand</span></span>
          <span class="quest-graph-legend-item"><span class="quest-graph-legend-skill is-met" aria-hidden="true">25</span><span>Skill level met</span></span>
          <span class="quest-graph-legend-item"><span class="quest-graph-legend-skill is-not-met" aria-hidden="true">99</span><span>Not met</span></span>
          <span class="quest-graph-legend-item"><span class="quest-graph-legend-highlight" aria-hidden="true" /><span>Highlighted branch</span></span>
          <span class="quest-graph-legend-item"><span class="quest-graph-legend-goal" aria-hidden="true">⚑</span><span>Track as a goal</span></span>
        </div>
      </div>
    </section>
  </Teleport>
</template>
