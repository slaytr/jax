import { reactive } from 'vue';

export interface GoalGraphConnection {
  id: string;
  source: string;
  target: string;
}

/**
 * User-drawn links between goal graph nodes (GoalsGraph.vue) — dragged from
 * a node's own hover connector chip (GoalGraphNode.vue) to anywhere near
 * another node, alongside (never replacing) the read-only dependency edges
 * a quest's own skill requirements already draw. Same TEMP localStorage
 * -only shape as useGoalGraphPositions.ts, one array per player.
 */
const key = (slug: string) => `jax:goal-graph-connections:${slug}`;

function readConnections(slug: string): GoalGraphConnection[] {
  try {
    const raw = localStorage.getItem(key(slug));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeConnections(slug: string, connections: GoalGraphConnection[]) {
  try {
    localStorage.setItem(key(slug), JSON.stringify(connections));
  } catch {
    // Storage blocked or full — the connection still exists for the rest of
    // this visit, it just won't survive a reload.
  }
}

export function useGoalGraphConnections(slug: string) {
  const connections = reactive<GoalGraphConnection[]>(readConnections(slug));

  /** No-ops on a self-link or one that already exists — GoalsGraph.vue
   * doesn't pre-check either case, this is where that's actually enforced. */
  function add(source: string, target: string) {
    if (source === target) return;
    if (connections.some((connection) => connection.source === source && connection.target === target)) return;
    connections.push({ id: `custom:${source}->${target}`, source, target });
    writeConnections(slug, connections);
  }

  function remove(id: string) {
    const index = connections.findIndex((connection) => connection.id === id);
    if (index === -1) return;
    connections.splice(index, 1);
    writeConnections(slug, connections);
  }

  return { connections, add, remove };
}
