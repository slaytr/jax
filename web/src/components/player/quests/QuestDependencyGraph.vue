<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, watch } from 'vue';

import { dependencyGraphFor, visibleDependencyGraph } from '@shared/quest-graph.js';
import { skillLevelsByName } from '@shared/quest-status.js';
import { SKILLS, iconFor, WIKI_ICON } from '@shared/config.js';
import { questWikiUrl } from '@shared/quest-goal.js';
import { STATUS_MARKER } from '@/lib/quests';
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
        <div class="lb-title"><h2>Dependency map</h2></div>
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

      <p v-if="!selection || !quests" class="chart-empty">Click a quest on the left to see its dependency chain.</p>
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
