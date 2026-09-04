import { reactive } from 'vue';

/**
 * Where a viewer has manually dragged a goal graph node to (GoalsGraph.vue)
 * — keyed by goal id, one shared localStorage key per player so a drag
 * survives a reload. Same TEMP local-storage-only shape as useGoals.ts (no
 * server backing yet — see that file's own doc comment for the reasoning
 * this pairs with); a position with no stored override just falls back to
 * layoutGoalGraph's own computed one.
 *
 * A goal that's since been deleted just leaves an unused, harmless entry
 * here rather than needing active cleanup — the next goal to reuse that id
 * literally never happens (ids are randomUUIDs), so there's no risk of a
 * stale position silently attaching to the wrong goal later.
 */
const key = (slug: string) => `jax:goal-graph-positions:${slug}`;

function readPositions(slug: string): Record<string, { x: number; y: number }> {
  try {
    const raw = localStorage.getItem(key(slug));
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writePositions(slug: string, positions: Record<string, { x: number; y: number }>) {
  try {
    localStorage.setItem(key(slug), JSON.stringify(positions));
  } catch {
    // Storage blocked or full — nothing to do, dragging still works for
    // the rest of this visit, it just won't survive a reload.
  }
}

export function useGoalGraphPositions(slug: string) {
  const positions = reactive<Record<string, { x: number; y: number }>>(readPositions(slug));

  function get(id: string): { x: number; y: number } | undefined {
    return positions[id];
  }

  function set(id: string, position: { x: number; y: number }) {
    positions[id] = position;
    writePositions(slug, positions);
  }

  /** Drops every stored override, so every node falls back to
   * layoutGoalGraph's own computed position again — GoalsGraph.vue's own
   * "Recenter" action, undoing however many nodes a viewer's dragged
   * around this graph. */
  function clear() {
    for (const id of Object.keys(positions)) delete positions[id];
    writePositions(slug, positions);
  }

  return { get, set, clear };
}
