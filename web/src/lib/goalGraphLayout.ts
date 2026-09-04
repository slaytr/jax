import { requirementsOf } from '@shared/quest-graph.js';

import type { GoalItem } from './goals';

/**
 * Pure layout math behind the Goals tab's graph view (GoalsGraph.vue) —
 * every goal as a circular node, a quest goal's own nested skill goals
 * (its skill requirements) drawn as prerequisites feeding into it, same
 * per-quest grouping as the Quests tab's own questGraphLayout.ts, just far
 * simpler: at most two layers (a quest's own children, then the quest
 * itself), never a deeper chain, so this doesn't need that file's generic
 * multi-layer/barycenter machinery.
 *
 * Each group reads top-down — the quest itself on top, its own skill
 * prerequisites in a row underneath, dependency arrows pointing up into it
 * — rather than left-to-right, so it reads like a standard org chart (the
 * goal up top, what it takes below) instead of a flowchart. Groups
 * themselves are laid out left to right across the canvas, one per column,
 * since nothing relates one quest's own tree to the next one's.
 */

export const NODE_DIAMETER = 52;
const LABEL_HEIGHT = 15;
const NODE_ROW_HEIGHT = NODE_DIAMETER + LABEL_HEIGHT;
const CHILD_GAP = 14;
const LEVEL_GAP = 68;
const CLUSTER_GAP = 22;
const CANVAS_PADDING = 16;

export interface GoalGraphNode {
  id: string;
  goal: any;
  isRoot: boolean;
  x: number;
  y: number;
}

export interface GoalGraphEdge {
  from: string;
  to: string;
}

export interface GoalGraphLayout {
  nodes: GoalGraphNode[];
  edges: GoalGraphEdge[];
}

export interface QuestPrereqEdge {
  from: string;
  to: string;
}

export interface VisibleGoalItems {
  items: GoalItem[];
  questPrereqEdges: QuestPrereqEdge[];
}

/**
 * Trims `items` down to what the graph should actually draw, plus the
 * quest-requires-quest edges (distinct from layoutGoalGraph's own
 * skill-requirement edges above) between whichever quest goals survive that
 * trim:
 *
 *  - A completed quest goal is dropped outright — its own node, and (since a
 *    quest's own skill-goal children only exist grouped under it) whatever
 *    children came with it — no matter what, if anything, depends on it.
 *  - An open (not started, or in progress) quest goal is kept only if it
 *    shares a *direct* real-game requirement link (quest-graph.js's own
 *    `requirementsOf`, resolved against the full `quests` catalog) with
 *    *another* open quest goal also tracked here — as the earlier quest in
 *    that link, the later one, or both if it sits in the middle of a
 *    tracked chain. A standalone open quest goal with no such link to
 *    anything else currently tracked is dropped too: on its own, a bare
 *    "not started yet" bubble with no dependency to show carries no more
 *    information here than the List view already gives it, and this view
 *    exists specifically to show the chain.
 *  - Every skill-only item (itemsFor's childless-goal branch, kind !==
 *    'quest') is untouched — this rule is about quest goals specifically.
 *
 * A `quests` of `null` (not loaded yet — GoalsTab.vue's own lazy
 * `useQuests()`) skips all of this and returns `items` unchanged: there's no
 * requirement data yet to judge a quest goal's links by, so showing
 * everything (this feature's own pre-existing behaviour) beats guessing.
 */
export function visibleGoalItems(items: GoalItem[], quests: any[] | null): VisibleGoalItems {
  if (!quests) return { items, questPrereqEdges: [] };

  const byName = new Map(quests.map((quest) => [quest.name, quest]));
  const questItems = items.filter((item) => item.quest.kind === 'quest' && !item.quest.completedAt);
  const nonQuestItems = items.filter((item) => item.quest.kind !== 'quest');
  const itemByQuestName = new Map(questItems.map((item) => [item.quest.questName, item]));

  const questPrereqEdges: QuestPrereqEdge[] = [];
  const connected = new Set<string>();
  for (const dependent of questItems) {
    const quest = byName.get(dependent.quest.questName);
    if (!quest) continue;
    for (const req of requirementsOf(quest, byName)) {
      const required = itemByQuestName.get(req.name);
      if (!required) continue;
      questPrereqEdges.push({ from: required.quest.id, to: dependent.quest.id });
      connected.add(required.quest.id);
      connected.add(dependent.quest.id);
    }
  }

  const visibleQuestItems = questItems.filter((item) => connected.has(item.quest.id));
  return { items: [...nonQuestItems, ...visibleQuestItems], questPrereqEdges };
}

/** One item's own horizontal footprint — as wide as its children's own row
 * (one per column) but never less than a single column, so a childless
 * item still claims one column for its own lone node. */
const clusterWidth = (item: GoalItem) => {
  const columns = Math.max(item.children.length, 1);
  return columns * NODE_DIAMETER + (columns - 1) * CHILD_GAP;
};

/**
 * @param items every goal, already grouped — lib/goals.ts's own itemsFor,
 *   flattened across every section (a caller with several groups just
 *   concatenates them; order here is display order, left to right).
 */
export function layoutGoalGraph(items: GoalItem[]): GoalGraphLayout {
  const nodes: GoalGraphNode[] = [];
  const edges: GoalGraphEdge[] = [];
  let x = CANVAS_PADDING;

  for (const item of items) {
    const width = clusterWidth(item);

    nodes.push({ id: item.quest.id, goal: item.quest, isRoot: true, x: x + (width - NODE_DIAMETER) / 2, y: CANVAS_PADDING });

    item.children.forEach((child, i) => {
      nodes.push({
        id: child.id,
        goal: child,
        isRoot: false,
        x: x + i * (NODE_DIAMETER + CHILD_GAP),
        y: CANVAS_PADDING + NODE_ROW_HEIGHT + LEVEL_GAP,
      });
      edges.push({ from: child.id, to: item.quest.id });
    });

    x += width + CLUSTER_GAP;
  }

  return { nodes, edges };
}
