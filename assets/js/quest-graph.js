/**
 * Pure quest-dependency-graph construction from quest-data/quests.json (see
 * quest-data.js) — no DOM, so it's unit-testable on its own. The Quests
 * tab's dependency map (quest-dependency-graph.js) is the only consumer.
 *
 * Two views over the same underlying requirement graph, both laid out into
 * layers suitable for a left-to-right flow chart (layer 0 is whatever has no
 * requirements *shown*, and each further layer sits strictly to the right
 * of everything it requires). Both take `targetNames` — an *array*, not a
 * single name: one quest selected from the list is just a one-element array,
 * while a questline chip (quest-series-links.js) passes every quest tagged
 * with that `series` at once, so the map can show a whole questline as
 * nodes even though its members don't all sit on one connected chain — a
 * side branch, an alternate path, anything nothing else in the series
 * requires still gets its own node (and its own `isTarget`) rather than
 * being silently dropped for not being anyone's ancestor. Nothing about the
 * layering (layoutNodes) assumes a single root or one connected tree to
 * begin with, so a genuinely disconnected member just renders as its own
 * little island:
 *
 *  - `dependencyGraphFor(quests, targetNames)` walks *every* quest
 *    transitively required to start each of `targetNames` — not just their
 *    own direct `questRequirements`, but theirs too, all the way back to
 *    whichever quests need nothing at all — unioned into one graph. Used
 *    only for the map's own "N prerequisite quests lead to X" summary now —
 *    showing all of a 126-quest chain (Sliske's Endgame, the game's
 *    biggest) at once is too much to take in, so the interactive map itself
 *    is built from `visibleDependencyGraph` instead.
 *  - `visibleDependencyGraph(quests, targetNames, expandedNames)` is just the
 *    currently-expanded portion: every target alone until it's expanded,
 *    then (for every name in `expandedNames`) that quest's own direct
 *    requirements, recursively for whichever of *those* are themselves
 *    expanded. Clicking a node in the map toggles its membership in
 *    `expandedNames` (stats.js) rather than jumping to a whole new chart, so
 *    exploring one branch never costs you the others.
 *
 * `initialExpansionFor(quests, targetNames, isCompleted)` picks a starting
 * `expandedNames` for a newly-made selection: expand every quest down each
 * branch, from every target independently, until (and including) the first
 * one `isCompleted` reports true for — a completed quest's own prerequisites
 * are, in practice, always complete too, so there's nothing useful left to
 * reveal past it. The result is "what do I still need to do", already
 * unfolded, rather than a lone collapsed node a viewer has to click their
 * way down from scratch every time.
 *
 * `ancestorNames(edges, name)` is the odd one out — generic over *any* edge
 * list rather than quest-data specific, since quest-dependency-graph.js
 * calls it on a `visibleDependencyGraph` result's own `edges` to highlight
 * one clicked node's whole branch (everything currently shown that leads
 * into it) without re-deriving anything from quest-data itself.
 */

/** A couple of quests reference a requirement with a disambiguator suffix
 * the required quest's own `name` doesn't actually carry (e.g. "While
 * Guthix Sleeps" requires "Tears of Guthix (quest)", but that quest is just
 * named "Tears of Guthix") — same class of wiki inconsistency matchesTitle
 * in player-quests.js already works around, just in the other direction:
 * that one strips a suffix off a quest's *own* name to match RuneMetrics'
 * un-suffixed titles, this strips it off a *requirement's* name to match
 * quest-data's own list. */
const DISAMBIGUATORS = [' (quest)', ' (miniquest)', ' (saga)'];

/** Resolves a requirement name against `byName`, retrying with a
 * disambiguator suffix stripped (see DISAMBIGUATORS) before giving up —
 * only two names in the current dataset need this, but reporting them as
 * genuinely unresolved (quest-data/README.md's unresolvedQuestRefs — a
 * couple of tutorial areas, a different problem) would be wrong. Falls back
 * to the name as given, which dependencyGraphFor then treats as an
 * external/unresolved leaf, same as a true unresolvedQuestRefs entry. */
function resolveRequirementName(byName, name) {
  if (byName.has(name)) return name;
  for (const suffix of DISAMBIGUATORS) {
    const stripped = name.endsWith(suffix) ? name.slice(0, -suffix.length) : null;
    if (stripped && byName.has(stripped)) return stripped;
  }
  return name;
}

/**
 * The requirement edges leading into `quest` — questRequirements plus
 * fullCompletionRequirements (a stricter, rarer bar a handful of other
 * quests' own `full_completion` requirements point at — see
 * quest-data/README.md), deduplicated by the required quest's name since a
 * few quests list the same one in both lists. Order doesn't matter here;
 * dependencyGraphFor only ever consumes this as a set.
 */
function requirementsOf(quest, byName) {
  const relationByName = new Map();
  for (const req of [...(quest.questRequirements ?? []), ...(quest.fullCompletionRequirements ?? [])]) {
    const name = resolveRequirementName(byName, req.quest);
    if (!relationByName.has(name)) relationByName.set(name, req.relation);
  }
  return [...relationByName.entries()].map(([name, relation]) => ({ name, relation }));
}

/**
 * Nudges each layer's left-to-right order to keep an edge's two ends close
 * together — a simplified Sugiyama barycenter sweep: repeatedly reorder
 * every layer by the average position of whichever neighbours it already
 * has an edge to in the layer above, then the layer below, so a handful of
 * passes pull related quests toward each other. Not attempting anything
 * close to optimal crossing minimisation (a general DAG-drawing library's
 * job) — just visibly less tangled than leaving every layer in whatever
 * order the traversal first found its members, which is all this is
 * correcting for. `layers` is mutated in place.
 */
function orderLayers(layers, edges) {
  const successors = new Map();
  const predecessors = new Map();
  for (const { from, to } of edges) {
    if (!successors.has(from)) successors.set(from, []);
    successors.get(from).push(to);
    if (!predecessors.has(to)) predecessors.set(to, []);
    predecessors.get(to).push(from);
  }

  const positionOf = new Map();
  const reindex = () => {
    positionOf.clear();
    for (const names of layers) names.forEach((name, i) => positionOf.set(name, i));
  };
  reindex();

  const barycenterOf = (name, neighboursByName) => {
    const neighbours = neighboursByName.get(name);
    if (!neighbours || neighbours.length === 0) return null;
    return neighbours.reduce((sum, neighbour) => sum + (positionOf.get(neighbour) ?? 0), 0) / neighbours.length;
  };

  const SWEEPS = 4;
  for (let pass = 0; pass < SWEEPS; pass += 1) {
    const goingDown = pass % 2 === 0;
    const neighboursByName = goingDown ? predecessors : successors;
    const layerIndexes = goingDown ? layers.map((_, i) => i) : layers.map((_, i) => i).reverse();

    for (const layerIndex of layerIndexes) {
      const scored = layers[layerIndex].map((name) => ({ name, score: barycenterOf(name, neighboursByName) }));
      // A node with no positioned neighbour yet (every root on the very
      // first downward pass, every leaf on the first upward one) keeps its
      // current relative order rather than collapsing to the front — it'll
      // pick up real neighbours to sort by on a later pass.
      const positioned = scored.filter((entry) => entry.score !== null).sort((a, b) => a.score - b.score);
      const unpositioned = scored.filter((entry) => entry.score === null);
      layers[layerIndex] = [...positioned, ...unpositioned].map((entry) => entry.name);
      reindex();
    }
  }
}

/**
 * Layer (longest path from a source with no incoming edge in this set) plus
 * a barycenter-ordered position within that layer — shared by
 * dependencyGraphFor and visibleDependencyGraph, which differ only in which
 * nodes/edges they hand it. Layer is computed purely from `edges`, not from
 * a quest's own full requirement list, so a node with real prerequisites
 * that just aren't part of this particular edge set (visibleDependencyGraph,
 * before it's expanded) still lands at layer 0 — correct for "nothing
 * shown above it *yet*", which is what a renderer needs either way. Doesn't
 * assume a single connected tree: a node that's neither reachable from nor
 * reaches any other still gets a layer (0, having no incoming edges) and
 * renders as its own little island — deliberate, not a gap in the algorithm,
 * since `targetSet` (a `Set`, for `.has` rather than `Array.includes`) can
 * now name more than one root (dependencyGraphForTargets and friends below).
 */
function layoutNodes(nodeNames, edges, byName, targetSet) {
  const incomingByNode = new Map();
  for (const edge of edges) {
    if (!incomingByNode.has(edge.to)) incomingByNode.set(edge.to, []);
    incomingByNode.get(edge.to).push(edge.from);
  }

  const layerCache = new Map();
  function layerOf(name) {
    if (layerCache.has(name)) return layerCache.get(name);
    const incoming = incomingByNode.get(name) ?? [];
    const layer = incoming.length === 0 ? 0 : 1 + Math.max(...incoming.map(layerOf));
    layerCache.set(name, layer);
    return layer;
  }
  for (const name of nodeNames) layerOf(name);

  const layers = [];
  for (const name of nodeNames) {
    const layer = layerCache.get(name);
    if (!layers[layer]) layers[layer] = [];
    layers[layer].push(name);
  }
  orderLayers(layers, edges);

  const nodes = layers.flatMap((names, layer) =>
    names.map((name, order) => ({ name, quest: byName.get(name) ?? null, layer, order, isTarget: targetSet.has(name) })),
  );

  return {
    nodes,
    layerCount: layers.length,
    maxLayerWidth: Math.max(...layers.map((names) => names.length)),
  };
}

/**
 * @param quests the full quest-data/quests.json list (quest-data.js).
 * @param targetNames the quests whose prerequisite chains to build, unioned
 *   into one graph — matched against `quest.name` exactly, same convention
 *   questRequirements itself uses (see quest-data/README.md). A single quest
 *   selection is just a one-element array; a questline selection (every
 *   member of one `quest.series`, quest-dependency-graph.js) is the whole
 *   series at once — each name becomes its own node regardless of whether
 *   any other requires it, so a series member with no bearing on the rest
 *   of the story still shows up rather than being silently dropped for not
 *   being anyone's ancestor.
 * @returns null when *none* of `targetNames` match a real quest (a lone bad
 *   name among otherwise-valid ones is simply skipped, not fatal), otherwise
 *   `{ nodes, edges, layerCount, maxLayerWidth }`:
 *    - `nodes`: `{ name, quest, layer, order, isTarget }[]`, one per quest in
 *      the union (every valid `targetNames` entry included). `quest` is the
 *      full quest-data record, or null for a requirement name with no
 *      matching quest — see quest-data/README.md's `unresolvedQuestRefs` (a
 *      couple of tutorial areas gate a handful of miniquests); these are
 *      dead-end leaves, never a source of further edges.
 *    - `edges`: `{ from, to, relation }[]`, both ends node `name`s.
 *    - `layerCount`/`maxLayerWidth`: the tallest/widest a renderer needs to
 *      lay out, so it doesn't have to re-derive them from `nodes`.
 */
export function dependencyGraphFor(quests, targetNames) {
  const byName = new Map(quests.map((quest) => [quest.name, quest]));
  const validTargets = targetNames.filter((name) => byName.has(name));
  if (validTargets.length === 0) return null;

  // Every quest reachable by walking requirements backward from any target,
  // every target included regardless of whether it's reachable from any
  // other. Visit order doesn't matter for correctness — only membership
  // does — so a plain LIFO worklist is enough.
  const nodeNames = new Set(validTargets);
  const worklist = [...validTargets];
  while (worklist.length > 0) {
    const quest = byName.get(worklist.pop());
    if (!quest) continue; // an unresolved ref — a dead end, nothing further to walk
    for (const req of requirementsOf(quest, byName)) {
      if (!nodeNames.has(req.name)) {
        nodeNames.add(req.name);
        worklist.push(req.name);
      }
    }
  }

  const edges = [];
  for (const name of nodeNames) {
    const quest = byName.get(name);
    if (!quest) continue;
    for (const req of requirementsOf(quest, byName)) edges.push({ from: req.name, to: name, relation: req.relation });
  }

  const { nodes, layerCount, maxLayerWidth } = layoutNodes(nodeNames, edges, byName, new Set(validTargets));
  return { nodes, edges, layerCount, maxLayerWidth };
}

/**
 * @param quests the full quest-data/quests.json list (quest-data.js).
 * @param targetNames the quests anchoring the map — matched against
 *   `quest.name` exactly, same as dependencyGraphFor (including the
 *   one-quest-is-a-one-element-array, questline-is-every-member reasoning
 *   there).
 * @param expandedNames a `Set` of quest names whose own direct requirements
 *   should be revealed (quest-dependency-graph.js toggles a node's own
 *   membership in this set on click). Every target is included automatically
 *   only as a node, never auto-expanded — it starts alone, same as any
 *   other quest, until something expands it.
 * @returns null when *none* of `targetNames` match a real quest, otherwise
 *   the same shape as dependencyGraphFor's, with two additions per node:
 *    - `isExpanded`: whether this node's own name is in `expandedNames`.
 *    - `hasRequirements`: whether this quest has *any* requirement at all,
 *      independent of expansion — lets a renderer tell "genuinely no
 *      prerequisites" apart from "collapsed, but there's more behind it".
 *      Always false for an unresolved requirement (`quest: null`).
 */
export function visibleDependencyGraph(quests, targetNames, expandedNames) {
  const byName = new Map(quests.map((quest) => [quest.name, quest]));
  const validTargets = targetNames.filter((name) => byName.has(name));
  if (validTargets.length === 0) return null;

  const nodeNames = new Set(validTargets);
  const edges = [];
  const worklist = [...validTargets];
  while (worklist.length > 0) {
    const name = worklist.pop();
    if (!expandedNames.has(name)) continue; // collapsed — its own requirements stay hidden
    const quest = byName.get(name);
    if (!quest) continue;
    for (const req of requirementsOf(quest, byName)) {
      edges.push({ from: req.name, to: name, relation: req.relation });
      if (!nodeNames.has(req.name)) {
        nodeNames.add(req.name);
        worklist.push(req.name);
      }
    }
  }

  const { nodes, layerCount, maxLayerWidth } = layoutNodes(nodeNames, edges, byName, new Set(validTargets));
  const withExpansion = nodes.map((node) => ({
    ...node,
    isExpanded: expandedNames.has(node.name),
    hasRequirements: node.quest ? requirementsOf(node.quest, byName).length > 0 : false,
  }));

  return { nodes: withExpansion, edges, layerCount, maxLayerWidth };
}

/**
 * @param quests the full quest-data/quests.json list (quest-data.js).
 * @param targetNames the quests about to be selected — matched against
 *   `quest.name` exactly, same as dependencyGraphFor/visibleDependencyGraph.
 * @param isCompleted (name) => boolean — whether the player has completed
 *   the named quest. Takes a plain predicate rather than a Set so the
 *   caller's own title-matching quirks (RuneMetrics drops quest-data's
 *   disambiguator suffixes — see matchesTitle, player-quests.js) stay that
 *   caller's concern; this file only ever compares quest-data names to each
 *   other.
 * @returns a `Set` of quest names suitable as `visibleDependencyGraph`'s own
 *   `expandedNames` — empty when none of `targetNames` match a real quest.
 *   Every target is always included (expanded regardless of its own
 *   completion — a viewer picked it to look at, so its own direct
 *   requirements should be visible up front); each further branch, from
 *   every target independently, stops expanding at the first quest
 *   `isCompleted` accepts, which is still included as a node (via the edge
 *   into it) even though its own requirements stay hidden.
 */
export function initialExpansionFor(quests, targetNames, isCompleted) {
  const byName = new Map(quests.map((quest) => [quest.name, quest]));
  const validTargets = targetNames.filter((name) => byName.has(name));
  if (validTargets.length === 0) return new Set();

  const expanded = new Set();
  const worklist = [...validTargets];
  while (worklist.length > 0) {
    const name = worklist.pop();
    if (expanded.has(name)) continue;
    const quest = byName.get(name);
    if (!quest) continue; // an unresolved ref — nothing of its own to expand into

    expanded.add(name);
    for (const req of requirementsOf(quest, byName)) {
      if (!isCompleted(req.name)) worklist.push(req.name);
    }
  }
  return expanded;
}

/**
 * @param edges `{ from, to }[]` — any edge list; in practice a
 *   `visibleDependencyGraph` result's own `edges`, so "ancestor" here means
 *   "currently visible", not a quest's true full prerequisite history.
 * @param name the node to trace back from.
 * @returns a `Set` of names reachable by walking `edges` backward from
 *   `name` (its direct requirements, and theirs, within just this edge
 *   list) — always includes `name` itself, even with no matching edges at
 *   all (a lone node's own "branch" is just itself).
 */
export function ancestorNames(edges, name) {
  const predecessors = new Map();
  for (const edge of edges) {
    if (!predecessors.has(edge.to)) predecessors.set(edge.to, []);
    predecessors.get(edge.to).push(edge.from);
  }

  const ancestors = new Set([name]);
  const worklist = [name];
  while (worklist.length > 0) {
    const current = worklist.pop();
    for (const parent of predecessors.get(current) ?? []) {
      if (!ancestors.has(parent)) {
        ancestors.add(parent);
        worklist.push(parent);
      }
    }
  }
  return ancestors;
}
