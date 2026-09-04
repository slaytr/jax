<script setup lang="ts">
import { computed, onUnmounted, ref, useTemplateRef } from 'vue';
import {
  VueFlow,
  useVueFlow,
  MarkerType,
  type Node,
  type Edge,
  type NodeDragEvent,
  type NodeMouseEvent,
  type Connection,
  type EdgeChange,
} from '@vue-flow/core';
import { Background } from '@vue-flow/background';
import { Controls } from '@vue-flow/controls';

import { itemsFor, type GoalSection } from '@/lib/goals';
import { layoutGoalGraph } from '@/lib/goalGraphLayout';
import { useGoalGraphPositions } from '@/composables/useGoalGraphPositions';
import { useGoalGraphConnections } from '@/composables/useGoalGraphConnections';
import { useGoalGraphNotes } from '@/composables/useGoalGraphNotes';
import { useGoalGraphCalculatorNodes } from '@/composables/useGoalGraphCalculatorNodes';
import GoalGraphNode from '@/components/player/goals/GoalGraphNode.vue';
import GoalGraphEdge from '@/components/player/goals/GoalGraphEdge.vue';
import GoalGraphNote from '@/components/player/goals/GoalGraphNote.vue';
import GoalGraphCalculatorNode from '@/components/player/goals/GoalGraphCalculatorNode.vue';
import CalculatorPanel from '@/components/player/CalculatorPanel.vue';
import { AGILITY_SKILL_ID } from '@/lib/agilityCalculator';
import { FISHING_SKILL_ID } from '@/lib/fishingCalculator';

/**
 * The Goals tab's graph view (GoalsList.vue's own List/Graph toggle) — every
 * goal as a circular node (GoalGraphNode.vue), a quest goal's own nested
 * skill goals drawn as prerequisite nodes feeding into it. Built on Vue Flow
 * rather than the original hand-rolled div+SVG canvas: dragging a node
 * around and having its edges follow is exactly what Vue Flow already
 * solves, and it's the right foundation for what this was headed toward
 * next — tags, highlights, comments — all of which need a real canvas
 * (pan/zoom, connection handles, selection) underneath them rather than
 * more one-off layout math bolted onto the old static version. Sticky
 * notes (useGoalGraphNotes.ts, GoalGraphNote.vue) are the first of those:
 * free-floating text boxes a viewer drops via the fixed note toggle below,
 * not tied to any one goal — everything else here is goal-shaped, these
 * are the one kind of node that isn't.
 *
 * layoutGoalGraph still runs — it's what places a node the *first* time it
 * appears (a fresh goal, or one nobody's dragged yet); useGoalGraphPositions
 * overrides that with wherever a viewer last dragged it to, persisted per
 * player. Two kinds of edges exist: dependency edges (a quest's own skill
 * requirements) are read-only — not selectable/deletable, can't be dragged
 * from either end; and user-drawn ones (useGoalGraphConnections), started by
 * dragging a node's own hover connector chip (GoalGraphNode.vue) to anywhere
 * near another node, normally selectable/deletable. Both render through
 * GoalGraphEdge.vue's own custom "goalFloating" type, not a stock
 * smoothstep/bezier one — a floating edge leaves each node from whichever
 * point on its ring is actually closest to the other end, recomputed live as
 * a node moves, rather than always the same fixed side regardless of where a
 * viewer's dragged things to.
 */
const props = defineProps<{
  sections: GoalSection[];
  bySkillId: Map<number, any>;
  player: any;
  focusedId: string | null;
}>();

const emit = defineEmits<{ focus: [id: string] }>();

const positions = useGoalGraphPositions(props.player.slug);
const customConnections = useGoalGraphConnections(props.player.slug);
const notesStore = useGoalGraphNotes(props.player.slug);
const calculatorNodesStore = useGoalGraphCalculatorNodes(props.player.slug);

const items = computed(() => props.sections.flatMap(itemsFor));
const layout = computed(() => layoutGoalGraph(items.value));

/** The player's own active goal for a given skill, if they've set one — a
 * calculator's own default target (AgilityCalculator.vue/
 * FishingCalculator.vue), so it doesn't ask a viewer to re-enter a number
 * they've already committed to elsewhere. A quest's own nested skill
 * requirement counts too, same as a standalone one; only completed goals
 * are skipped, since a finished one isn't a meaningful "where am I headed"
 * default any more. */
function activeSkillGoal(skillId: number) {
  return items.value.flatMap((item) => [item.quest, ...item.children]).find((goal) => goal.kind === 'skill' && goal.skillId === skillId && !goal.completedAt) ?? null;
}
const agilityGoal = computed(() => activeSkillGoal(AGILITY_SKILL_ID));
const fishingGoal = computed(() => activeSkillGoal(FISHING_SKILL_ID));

const goalNodes = computed<Node[]>(() =>
  layout.value.nodes.map((node) => ({
    id: node.id,
    type: 'goal',
    position: positions.get(node.id) ?? { x: node.x, y: node.y },
    connectable: true,
    data: {
      goal: node.goal,
      isRoot: node.isRoot,
      player: props.player,
      bySkillId: props.bySkillId,
      focusedId: props.focusedId,
      onQuickCalculator: () => openCalculatorFor(node.goal),
    },
  })),
);

/** `selectable: false` — a note isn't a goal (or ever gets an id that
 * matches one, since useGoalGraphNotes.ts's own ids come from the same
 * randomUUID pool), so it has no business joining the focus/select system
 * onNodeClick below drives. `onUpdate`/`onRemove`/`onSetDefaultColour` are
 * that one note's own useGoalGraphNotes.ts calls (the last one's the same
 * function for every note — it isn't really "this note's own", but it's
 * cheap to hand every note the same reference, and simpler than threading
 * it to GoalGraphNote.vue any other way), pre-bound here rather than in
 * GoalGraphNote.vue itself — see that component's own doc comment.
 *
 * `zIndex` is undefined for a 'front' note — the same as every goal node
 * and edge already gets, so ties on the implicit 0 and paints in array
 * order (notes last, i.e. on top) exactly like before this field existed.
 * A 'back' note gets a zIndex low enough to sit under both: Vue Flow gives
 * every edge without its own explicit zIndex the *max* of its two
 * endpoints' own (edge.d.ts/node.d.ts), so as long as this is more
 * negative than any goal node ever sets (none do), it sits behind edges
 * too, not just the nodes they connect. */
const noteNodes = computed<Node[]>(() =>
  notesStore.notes.map((note) => ({
    id: note.id,
    type: 'note',
    position: note.position,
    selectable: false,
    connectable: false,
    zIndex: note.layer === 'back' ? -10 : undefined,
    data: {
      note,
      onUpdate: (patch: Parameters<typeof notesStore.update>[1]) => notesStore.update(note.id, patch),
      onRemove: () => notesStore.remove(note.id),
      onSetDefaultColour: notesStore.setDefaultColour,
    },
  })),
);

/** Same `selectable: false`/`connectable: false` reasoning as noteNodes
 * above — a saved calculator route isn't a goal either, and shouldn't be
 * draggable-into as a connection endpoint. `onRemove` is that one node's
 * own useGoalGraphCalculatorNodes.ts `remove` call; `player` is passed
 * straight through so GoalGraphCalculatorNode.vue's own hours/laps stay
 * live off the exact same data every goal node's progress already reads
 * from. */
const calculatorGraphNodes = computed<Node[]>(() =>
  calculatorNodesStore.calculatorNodes.map((node) => ({
    id: node.id,
    type: 'calculator',
    position: node.position,
    selectable: false,
    connectable: false,
    data: {
      node,
      player: props.player,
      onRemove: () => calculatorNodesStore.remove(node.id),
    },
  })),
);

const nodes = computed<Node[]>(() => [...goalNodes.value, ...noteNodes.value, ...calculatorGraphNodes.value]);

const edges = computed<Edge[]>(() => {
  const byId = new Map(layout.value.nodes.map((node) => [node.id, node]));
  const dependencyEdges: Edge[] = layout.value.edges.map((edge) => ({
    id: `${edge.from}->${edge.to}`,
    source: edge.from,
    target: edge.to,
    type: 'goalFloating',
    selectable: false,
    deletable: false,
    focusable: false,
    class: byId.get(edge.from)?.goal.completedAt ? 'is-complete' : undefined,
    markerEnd: MarkerType.ArrowClosed,
  }));
  const drawnEdges: Edge[] = customConnections.connections.map((connection) => ({
    id: connection.id,
    source: connection.source,
    target: connection.target,
    type: 'goalFloating',
    selectable: true,
    deletable: true,
    focusable: true,
    class: 'is-custom',
    markerEnd: MarkerType.ArrowClosed,
    data: { onRemove: () => customConnections.remove(connection.id) },
  }));
  return [...dependencyEdges, ...drawnEdges];
});

const { onNodeDragStop, onNodeClick, onNodeMouseEnter, onNodeMouseLeave, onConnect, onEdgesChange, fitView, screenToFlowCoordinate } =
  useVueFlow();

/** Drops every dragged-to position (useGoalGraphPositions.ts's own `clear`)
 * and re-fits the viewport — a full "start over" for the graph, not just a
 * re-centre, since a plain fitView alone would still leave nodes wherever
 * they'd been dragged to, just all visible at once. */
function recenter() {
  positions.clear();
  fitView({ duration: 300 });
}

/** Whether the XP calculator's own skill-picker (CalculatorPanel.vue) is
 * showing — toggled by the fixed calculator icon below, anchored beside it.
 * Local, unpersisted: same "just a view state, not a place in the graph"
 * reasoning as questGraphFullscreen elsewhere, not something worth carrying
 * across a reload. */
const calculatorOpen = ref(false);

/** Which goal GoalGraphNode.vue's own hover shortcut was clicked on, if
 * that's how the panel got opened — CalculatorPanel.vue's own
 * `initialSkillId` prop (jump straight to that goal's own skill) and
 * whichever of `agilityGoal`/`fishingGoal` matches its `skillId` both key
 * off this instead of the generic activeSkillGoal lookup above when it's
 * set, so the panel opens scoped to the *specific* goal a viewer clicked
 * on, not just whichever goal for that skill happens to be active.
 * Cleared whenever the main toggle button opens the panel instead, so a
 * later, ordinary open doesn't keep inheriting a stale one. */
const quickCalculatorGoal = ref<any | null>(null);

function toggleCalculator() {
  quickCalculatorGoal.value = null;
  calculatorOpen.value = !calculatorOpen.value;
}

/** GoalGraphNode.vue's own hover shortcut (top-left, `isCalculatorSupported`
 * gated to skills with a real calculator only) — opens the calculator
 * panel straight to that skill's own calculator component, prefilled with
 * *this* goal's own target, rather than instantly creating a node the way
 * an earlier version of this did: a viewer gets to see and adjust the
 * route (or just confirm the optimal one) before anything's actually
 * saved to the canvas. */
function openCalculatorFor(goal: any) {
  if (goal.kind !== 'skill' || (goal.skillId !== AGILITY_SKILL_ID && goal.skillId !== FISHING_SKILL_ID)) return;
  quickCalculatorGoal.value = goal;
  calculatorOpen.value = true;
}

/** Drops a new sticky note (useGoalGraphNotes.ts) roughly centred in
 * whatever's currently visible — screenToFlowCoordinate converts the
 * .goal-graph-flow container's own on-screen centre into a graph
 * coordinate, so a note lands somewhere a viewer can actually see it
 * regardless of how far they've panned/zoomed, rather than always at a
 * fixed graph position that might be well off-screen by then. */
function addNote(event: MouseEvent) {
  const bounds = (event.currentTarget as HTMLElement).closest('.goal-graph-flow')!.getBoundingClientRect();
  const centre = screenToFlowCoordinate({ x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 });
  notesStore.add(centre);
}

/** Same "drop it wherever's currently visible" placement as addNote, just
 * driven off a template ref instead of the triggering event's own
 * currentTarget — CalculatorPanel.vue's own "save" reaches here through an
 * emit chain (AgilityCalculator.vue -> CalculatorPanel.vue -> here), not a
 * click GoalsGraph.vue's template handles directly, so there's no DOM
 * event of its own to read a currentTarget off. */
const flowContainer = useTemplateRef<HTMLElement>('flowContainer');

function onSaveCalculatorRoute(route: Parameters<typeof calculatorNodesStore.add>[0]) {
  const bounds = flowContainer.value!.getBoundingClientRect();
  const centre = screenToFlowCoordinate({ x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 });
  calculatorNodesStore.add(route, centre);
}

onNodeDragStop(({ node }: NodeDragEvent) => {
  if (node.type === 'note') notesStore.update(node.id, { position: { x: node.position.x, y: node.position.y } });
  else if (node.type === 'calculator') calculatorNodesStore.updatePosition(node.id, { x: node.position.x, y: node.position.y });
  else positions.set(node.id, { x: node.position.x, y: node.position.y });
});

onNodeClick(({ node }: NodeMouseEvent) => {
  if (node.type === 'note' || node.type === 'calculator') return;
  emit('focus', node.id);
});

/** Every node id that isn't a real goal — a note or a saved calculator
 * route, neither a valid connection endpoint (both already render
 * `connectable: false` above; this is just the defense-in-depth backstop
 * for onConnect below). */
const nonGoalNodeIds = computed(
  () => new Set([...notesStore.notes.map((note) => note.id), ...calculatorNodesStore.calculatorNodes.map((node) => node.id)]),
);

/** A completed drag from a node's own connector chip (GoalGraphNode.vue) —
 * `add` itself is what actually rejects a self-link or a duplicate, so
 * nothing else needs checking here first. */
onConnect(({ source, target }: Connection) => {
  if (nonGoalNodeIds.value.has(source) || nonGoalNodeIds.value.has(target)) return;
  customConnections.add(source, target);
});

/** The only way a user-drawn edge goes away — selecting it and pressing
 * Delete/Backspace, Vue Flow's own default for a selectable+deletable edge,
 * nothing custom wired up for it. Dependency edges never reach here: they're
 * `deletable: false` above, so Vue Flow never emits a 'remove' change for
 * one. */
onEdgesChange((changes: EdgeChange[]) => {
  for (const change of changes) {
    if (change.type === 'remove') customConnections.remove(change.id);
  }
});

/** Which node's connector chip (GoalGraphNode.vue) is showing — the most
 * recently hovered one, kept up for a few seconds after the mouse actually
 * leaves rather than vanishing the instant it does, so moving from a node
 * toward its own chip (or just glancing away briefly) doesn't make it
 * disappear before a viewer's had a chance to use it. Hovering straight
 * into another node cancels that timer and hands the chip over immediately
 * — only a hover ending with nothing else picked up starts the linger. */
const HOVER_LINGER_MS = 5000;
const hoveredNodeId = ref<string | null>(null);
let hoverHideTimer: ReturnType<typeof setTimeout> | null = null;

function clearHoverHideTimer() {
  if (hoverHideTimer === null) return;
  clearTimeout(hoverHideTimer);
  hoverHideTimer = null;
}

onNodeMouseEnter(({ node }: NodeMouseEvent) => {
  clearHoverHideTimer();
  hoveredNodeId.value = node.id;
});

onNodeMouseLeave(({ node }: NodeMouseEvent) => {
  clearHoverHideTimer();
  hoverHideTimer = setTimeout(() => {
    hoverHideTimer = null;
    if (hoveredNodeId.value === node.id) hoveredNodeId.value = null;
  }, HOVER_LINGER_MS);
});

onUnmounted(clearHoverHideTimer);
</script>

<template>
  <div v-if="layout.nodes.length === 0 && notesStore.notes.length === 0 && calculatorNodesStore.calculatorNodes.length === 0" class="chart-empty">
    No goals yet.
  </div>
  <div v-else ref="flowContainer" class="goal-graph-flow">
    <VueFlow :nodes="nodes" :edges="edges" fit-view-on-init :min-zoom="0.4" :max-zoom="1.5" :connection-radius="34">
      <template #node-goal="nodeProps">
        <GoalGraphNode :id="nodeProps.id" :data="nodeProps.data" :is-hovered="nodeProps.id === hoveredNodeId" />
      </template>
      <template #node-note="nodeProps">
        <GoalGraphNote :data="nodeProps.data" />
      </template>
      <template #node-calculator="nodeProps">
        <GoalGraphCalculatorNode :data="nodeProps.data" />
      </template>
      <template #edge-goalFloating="edgeProps">
        <GoalGraphEdge v-bind="edgeProps" />
      </template>
      <Background :gap="18" pattern-color="var(--hairline)" />
      <Controls :show-interactive="false" :show-fit-view="false" />
    </VueFlow>
    <button type="button" class="goal-graph-recenter" title="Reset layout" @click="recenter">
      <svg viewBox="0 0 18 18" aria-hidden="true" focusable="false">
        <path d="M2 6.5V3a1 1 0 0 1 1-1h3.5" />
        <path d="M16 6.5V3a1 1 0 0 0-1-1h-3.5" />
        <path d="M2 11.5V15a1 1 0 0 0 1 1h3.5" />
        <path d="M16 11.5V15a1 1 0 0 1-1 1h-3.5" />
        <circle cx="9" cy="9" r="2.2" />
      </svg>
      <span class="visually-hidden">Reset layout</span>
    </button>
    <button
      type="button"
      class="goal-graph-calculator-toggle"
      :class="{ 'is-active': calculatorOpen }"
      title="XP calculator"
      :aria-expanded="calculatorOpen ? 'true' : 'false'"
      @click="toggleCalculator"
    >
      <svg viewBox="0 0 18 18" aria-hidden="true" focusable="false">
        <rect x="3" y="1.5" width="12" height="15" rx="1.5" />
        <rect x="5" y="3.5" width="8" height="3" rx="0.5" />
        <circle cx="5.75" cy="10" r="0.9" />
        <circle cx="9" cy="10" r="0.9" />
        <circle cx="12.25" cy="10" r="0.9" />
        <circle cx="5.75" cy="13" r="0.9" />
        <circle cx="9" cy="13" r="0.9" />
        <circle cx="12.25" cy="13" r="0.9" />
      </svg>
      <span class="visually-hidden">XP calculator</span>
    </button>
    <CalculatorPanel
      v-if="calculatorOpen"
      class="goal-graph-calculator-panel"
      :player="player"
      :agility-goal="quickCalculatorGoal?.skillId === AGILITY_SKILL_ID ? quickCalculatorGoal : agilityGoal"
      :fishing-goal="quickCalculatorGoal?.skillId === FISHING_SKILL_ID ? quickCalculatorGoal : fishingGoal"
      :initial-skill-id="quickCalculatorGoal ? quickCalculatorGoal.skillId : null"
      @save="onSaveCalculatorRoute"
    />
    <button type="button" class="goal-graph-note-toggle" title="Add a note" @click="addNote">
      <svg viewBox="0 0 18 18" aria-hidden="true" focusable="false">
        <path d="M4 2h10a1 1 0 0 1 1 1v9l-4 4H4a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1Z" />
        <path d="M11 16v-3a1 1 0 0 1 1-1h3" />
        <path d="M5.5 6h7M5.5 9h7M5.5 12h4" />
      </svg>
      <span class="visually-hidden">Add a note</span>
    </button>
  </div>
</template>
