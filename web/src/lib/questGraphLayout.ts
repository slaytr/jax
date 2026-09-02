import { ancestorNames } from '@shared/quest-graph.js';
import { statusOf } from '@shared/quest-status.js';

/**
 * Pure layout math behind the Quests tab's dependency map — ported out of
 * the old views/quest-dependency-graph.js's DOM-building so it's reusable
 * and testable on its own, same "pure logic in lib/, DOM in .vue"
 * convention as barChartGeometry.ts/lineChartGeometry.ts.
 *
 * Nodes are plain positioned boxes; the connecting curves ride in one
 * absolutely-positioned `<svg>` behind them (QuestDependencyGraph.vue).
 * Layer 0 (nothing shown above it yet) sits on the left; every selected
 * quest is always a rightmost-or-later node.
 */

export const NODE_WIDTH = 168;
export const NODE_HEIGHT = 32; // collapsed, or expanded with no skill requirements to show
export const NODE_HEADER_HEIGHT = 22; // name row height, once a skills block sits beneath it
export const SKILL_ROW_HEIGHT = 18;
export const SKILL_CHIPS_PER_ROW = 4;
export const NODE_VERTICAL_PADDING = 6; // breathing room around an expanded node's header+skills stack
export const COLUMN_GAP = 64; // horizontal room between layers, for the connecting curve
export const ROW_GAP = 10; // vertical gap between nodes sharing a layer
export const CANVAS_PADDING = 16;
export const COLUMN_WIDTH = NODE_WIDTH + COLUMN_GAP;

/** A node's own skill requirements once expanded — [] both when collapsed
 * (nothing to show yet) and for a quest with genuinely none. */
export function visibleSkillRequirements(node: any): any[] {
  return node.isExpanded ? (node.quest?.skillRequirements ?? []) : [];
}

/** An expanded node with skill requirements grows to fit them, wrapped
 * SKILL_CHIPS_PER_ROW to a row — deterministic from the count alone, so
 * layout never needs to measure real rendered text. */
export function nodeHeight(node: any): number {
  const skills = visibleSkillRequirements(node);
  if (skills.length === 0) return NODE_HEIGHT;
  const rows = Math.ceil(skills.length / SKILL_CHIPS_PER_ROW);
  return NODE_HEADER_HEIGHT + rows * SKILL_ROW_HEIGHT + NODE_VERTICAL_PADDING;
}

export interface GraphLayout {
  positionByName: Map<string, { x: number; y: number }>;
  heightByName: Map<string, number>;
  width: number;
  height: number;
}

/** Every node's pixel position and own height, keyed by name — each layer
 * is stacked by its own members' actual heights, then centred as a whole
 * against whichever layer currently stands tallest, for a symmetric tree
 * rather than everything hugging the top. */
export function layoutOf(graph: { nodes: any[]; layerCount: number }): GraphLayout {
  const byLayer: any[][] = [];
  for (const node of graph.nodes) {
    if (!byLayer[node.layer]) byLayer[node.layer] = [];
    byLayer[node.layer][node.order] = node;
  }

  const layerHeights = byLayer.map((nodes) => nodes.reduce((sum, node) => sum + nodeHeight(node), 0) + (nodes.length - 1) * ROW_GAP);
  const maxLayerHeight = Math.max(...layerHeights);

  const positionByName = new Map<string, { x: number; y: number }>();
  const heightByName = new Map<string, number>();
  byLayer.forEach((nodes, layer) => {
    let y = CANVAS_PADDING + (maxLayerHeight - layerHeights[layer]) / 2;
    for (const node of nodes) {
      const height = nodeHeight(node);
      positionByName.set(node.name, { x: CANVAS_PADDING + layer * COLUMN_WIDTH, y });
      heightByName.set(node.name, height);
      y += height + ROW_GAP;
    }
  });

  return {
    positionByName,
    heightByName,
    width: CANVAS_PADDING * 2 + graph.layerCount * COLUMN_WIDTH - COLUMN_GAP,
    height: CANVAS_PADDING * 2 + maxLayerHeight,
  };
}

/** completed/in-progress/not-started plus `external` for a requirement name
 * with no matching quest record. */
export function nodeStatus(node: any, completedSet: Set<string>, startedSet: Set<string>): string {
  if (!node.quest) return 'external';
  return statusOf(node.quest, completedSet, startedSet);
}

/** A quest's own skill requirements are independent of `hasRequirements`
 * (that one only counts quest-to-quest prerequisites) — a node can be
 * clickable purely because it has skill requirements to reveal even when
 * it needs no other quest at all. */
export const hasSkillRequirements = (node: any) => (node.quest?.skillRequirements ?? []).length > 0;
export const isExpandable = (node: any) => node.hasRequirements || hasSkillRequirements(node);

/** `targetCount` (how many nodes in the whole graph are `isTarget`, not
 * just this one) picks the wording for a target node: "selected" reads
 * fine for the ordinary one-quest case, but a questline selection marks
 * every series member as a target at once, so "selected" for all of them
 * would overstate it. */
export function nodeTitle(node: any, status: string, targetCount: number): string {
  if (!node.quest) return `${node.name} — not tracked as a quest (e.g. a tutorial area)`;
  const statusLabel = status === 'in-progress' ? 'in progress' : status;
  const targetSuffix = node.isTarget ? (targetCount > 1 ? ' — in this questline' : ' — selected') : '';
  return `${node.name} — ${statusLabel}${targetSuffix} — click to highlight its branch`;
}

export const expandButtonTitle = (node: any) => (node.isExpanded ? 'Collapse' : 'Expand');

/** Only a not-started, real (non-external) quest with no goal-group of its
 * own yet gets the "track as a goal" button — a completed or in-progress
 * quest has nothing left worth turning into a fresh tracker, an external
 * leaf isn't a real quest to track at all, and one already tracked would
 * just duplicate that group. */
export const canCreateQuestGoal = (node: any, status: string, existingQuestGoalNames: Set<string>) =>
  node.quest !== null && status === 'not-started' && !existingQuestGoalNames.has(node.name);

/** Everything currently visible that feeds into `highlightedName` — null
 * when nothing's highlighted, or the highlighted node has since scrolled
 * out of the visible graph entirely, in which case nothing should dim
 * rather than everything. */
export function highlightSetFor(graph: { nodes: any[]; edges: any[] }, highlightedName: string | null): Set<string> | null {
  if (!highlightedName || !graph.nodes.some((node) => node.name === highlightedName)) return null;
  return ancestorNames(graph.edges, highlightedName);
}

export interface EdgeGeometry {
  d: string;
}

/** One requirement's connecting curve — a horizontal cubic bezier from the
 * prerequisite's right edge to the dependent's left edge, both vertically
 * centred on their own node. */
export function edgePath(edge: { from: string; to: string }, positionByName: Map<string, { x: number; y: number }>, heightByName: Map<string, number>): EdgeGeometry | null {
  const from = positionByName.get(edge.from);
  const to = positionByName.get(edge.to);
  if (!from || !to) return null;

  const x1 = from.x + NODE_WIDTH;
  const y1 = from.y + heightByName.get(edge.from)! / 2;
  const x2 = to.x;
  const y2 = to.y + heightByName.get(edge.to)! / 2;
  const c = COLUMN_GAP / 2;

  return { d: `M ${x1.toFixed(1)} ${y1.toFixed(1)} C ${(x1 + c).toFixed(1)} ${y1.toFixed(1)}, ${(x2 - c).toFixed(1)} ${y2.toFixed(1)}, ${x2.toFixed(1)} ${y2.toFixed(1)}` };
}

export type GraphSelection = { kind: 'quest'; quest: any } | { kind: 'series'; seriesName: string };

/** The quest names a `selection` resolves to — a one-element array for a
 * single quest, or every quest tagged with that `quest.series` for a
 * questline, in whatever order `quests` itself lists them. */
export function targetNamesFor(quests: any[], selection: GraphSelection): string[] {
  if (selection.kind === 'series') return quests.filter((quest) => quest.series === selection.seriesName).map((quest) => quest.name);
  return [selection.quest.name];
}

/** "N prerequisite quest(s) lead to <name>" for a single quest, or a
 * questline summary for a series selection — either way, the counts come
 * from `totalGraph`'s full transitive walk, independent of whatever's
 * currently expanded. */
export function graphCaptionText(totalGraph: { nodes: any[] }, targetNames: string[], selection: GraphSelection): string {
  const additional = totalGraph.nodes.length - targetNames.length;
  const hint = '"+" expands a quest, click its name to highlight its branch.';

  if (selection.kind === 'series') {
    const memberCount = targetNames.length;
    const membersPart = `${memberCount} quest${memberCount === 1 ? '' : 's'} in the ${selection.seriesName} questline`;
    const additionalPart = additional > 0 ? `, plus ${additional} additional prerequisite quest${additional === 1 ? '' : 's'}` : '';
    return `${membersPart}${additionalPart} — ${hint}`;
  }

  return additional === 0
    ? `No prerequisites — ${selection.quest.name} is a starting point.`
    : `${additional} prerequisite quest${additional === 1 ? '' : 's'} lead to ${selection.quest.name} — ${hint}`;
}
