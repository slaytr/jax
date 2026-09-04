import { reactive } from 'vue';

export interface GoalGraphCalculatorNode {
  id: string;
  /** Which skill's calculator this came from — Agility (AGILITY_SKILL_ID)
   * is the only one with a real calculator behind it so far
   * (CalculatorPanel.vue's own doc comment), but every field below already
   * generalises to whichever skill saves one next. */
  skillId: number;
  targetType: 'level' | 'xp';
  targetValue: number;
  /** The player's own level/xp at the moment this was saved — captured
   * once, purely as GoalGraphCalculatorNode.vue's own progress-bar
   * baseline (0%). Unlike everything else here, this is a real snapshot,
   * deliberately never updated — a progress bar needs a fixed start to
   * measure from, same as a real goal's own startLevel/startXp already
   * work; it's only the *route*'s own hours/laps numbers that stay live. */
  startLevel: number;
  startXp: number;
  /** The chosen route, by label rather than by object — agilityOptions()
   * is re-derived from static course data on every load, so a label is
   * enough to look the same AgilityOption back up; storing the object
   * itself would just be a stale copy the moment agility-courses.js ever
   * changes a figure. */
  startOptionLabel: string;
  /** In level order, same as AgilityCalculator.vue's own `switches` — the
   * one this node started from is `startOptionLabel` above, not repeated
   * here. */
  switchLabels: string[];
  position: { x: number; y: number };
}

/**
 * A saved snapshot of a skill calculator's own route, dropped onto the
 * goal graph canvas (GoalsGraph.vue) via AgilityCalculator.vue's own "+"
 * button — same TEMP localStorage-only shape as useGoalGraphNotes.ts/
 * useGoalGraphConnections.ts, one array per player. The *route* (which
 * courses, in what order) and the *target* are saved; the player's own
 * *current* level/xp is deliberately never captured — GoalGraphCalculatorNode.vue
 * reads that live off `player` every render, via agilityCalculator.ts's
 * own liveRoute, so the node's hours/laps stay correct as the player
 * actually progresses instead of freezing at whatever they were the
 * moment it was saved. `startLevel`/`startXp` are the one exception: a
 * real, frozen snapshot, but only ever used as the progress bar's own
 * fixed baseline, nothing the route math itself reads.
 */
const key = (slug: string) => `jax:goal-graph-calculator-nodes:${slug}`;

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `calc-${Date.now()}-${Math.random().toString(36).slice(2)}`);

function readNodes(slug: string): GoalGraphCalculatorNode[] {
  try {
    const raw = localStorage.getItem(key(slug));
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    // A node saved before startLevel/startXp existed still needs them —
    // its progress bar just starts out reading 0%, same "old data falls
    // back to a harmless default" reasoning every other addition to this
    // app's persisted shapes already uses.
    return parsed.map((node) => ({ startLevel: 0, startXp: 0, ...node }));
  } catch {
    return [];
  }
}

function writeNodes(slug: string, nodes: GoalGraphCalculatorNode[]) {
  try {
    localStorage.setItem(key(slug), JSON.stringify(nodes));
  } catch {
    // Storage blocked or full — the node still exists for the rest of this
    // visit, it just won't survive a reload.
  }
}

export function useGoalGraphCalculatorNodes(slug: string) {
  const calculatorNodes = reactive<GoalGraphCalculatorNode[]>(readNodes(slug));

  function add(route: Omit<GoalGraphCalculatorNode, 'id' | 'position'>, position: { x: number; y: number }): string {
    const node: GoalGraphCalculatorNode = { ...route, id: uid(), position };
    calculatorNodes.push(node);
    writeNodes(slug, calculatorNodes);
    return node.id;
  }

  function updatePosition(id: string, position: { x: number; y: number }) {
    const node = calculatorNodes.find((candidate) => candidate.id === id);
    if (!node) return;
    node.position = position;
    writeNodes(slug, calculatorNodes);
  }

  function remove(id: string) {
    const index = calculatorNodes.findIndex((candidate) => candidate.id === id);
    if (index === -1) return;
    calculatorNodes.splice(index, 1);
    writeNodes(slug, calculatorNodes);
  }

  return { calculatorNodes, add, updatePosition, remove };
}
