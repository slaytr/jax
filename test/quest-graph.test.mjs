import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { dependencyGraphFor, visibleDependencyGraph, initialExpansionFor, ancestorNames } from '../assets/js/quest-graph.js';

const quest = (name, questRequirements = [], fullCompletionRequirements = []) => ({
  name,
  questRequirements: questRequirements.map((req) => ({ quest: req, relation: 'required' })),
  fullCompletionRequirements: fullCompletionRequirements.map((req) => ({ quest: req, relation: 'required' })),
});

const nodeNamesByLayer = (graph) => {
  const byLayer = [];
  for (const node of graph.nodes) {
    (byLayer[node.layer] ??= []).push(node.name);
  }
  return byLayer.map((names) => names.sort());
};

describe('dependencyGraphFor', () => {
  it('returns null for a quest name with no matching record', () => {
    assert.equal(dependencyGraphFor([quest('Cook\'s Assistant')], 'Not A Real Quest'), null);
  });

  it('is a single node with no edges for a quest with no requirements', () => {
    const quests = [quest("Cook's Assistant")];
    const graph = dependencyGraphFor(quests, "Cook's Assistant");

    assert.equal(graph.nodes.length, 1);
    assert.equal(graph.nodes[0].isTarget, true);
    assert.deepEqual(graph.edges, []);
    assert.equal(graph.layerCount, 1);
    assert.equal(graph.maxLayerWidth, 1);
  });

  it('layers a diamond so both middle quests sit strictly between the shared root and the target', () => {
    // A requires B and C; B and C both require D.
    const quests = [quest('D'), quest('B', ['D']), quest('C', ['D']), quest('A', ['B', 'C'])];
    const graph = dependencyGraphFor(quests, 'A');

    assert.equal(graph.nodes.length, 4, 'D is only counted once despite being required twice');
    assert.equal(graph.layerCount, 3);
    assert.deepEqual(nodeNamesByLayer(graph), [['D'], ['B', 'C'], ['A']]);

    const target = graph.nodes.find((node) => node.name === 'A');
    assert.equal(target.isTarget, true);
    assert.equal(graph.nodes.find((node) => node.name !== 'A').isTarget, false);

    const edgeSet = new Set(graph.edges.map((edge) => `${edge.from}->${edge.to}`));
    assert.deepEqual(edgeSet, new Set(['D->B', 'D->C', 'B->A', 'C->A']));
  });

  it('resolves a requirement carrying a disambiguator suffix the real quest name lacks', () => {
    // Mirrors a real quest-data quirk: "While Guthix Sleeps" requires "Tears
    // of Guthix (quest)", but that quest's own name is just "Tears of
    // Guthix" — the "(quest)" suffix should still resolve to it rather than
    // falling back to an external/unresolved leaf.
    const quests = [quest('Tears of Guthix'), quest('While Guthix Sleeps', ['Tears of Guthix (quest)'])];
    const graph = dependencyGraphFor(quests, 'While Guthix Sleeps');

    assert.equal(graph.nodes.length, 2, 'the suffixed name resolves to the same node, not a second one');
    const resolved = graph.nodes.find((node) => node.name === 'Tears of Guthix');
    assert.ok(resolved, 'the real quest name is what the node carries');
    assert.equal(resolved.quest.name, 'Tears of Guthix');
    assert.deepEqual(
      graph.edges.map((edge) => `${edge.from}->${edge.to}`),
      ['Tears of Guthix->While Guthix Sleeps'],
    );
  });

  it('gives an unresolved requirement (no matching quest) a leaf node instead of throwing', () => {
    const quests = [quest('Miniquest', ['Some Tutorial Area'])];
    const graph = dependencyGraphFor(quests, 'Miniquest');

    const leaf = graph.nodes.find((node) => node.name === 'Some Tutorial Area');
    assert.ok(leaf, 'the unresolved name still gets a node');
    assert.equal(leaf.quest, null);
    assert.equal(leaf.layer, 0);
    assert.equal(graph.edges.length, 1);
  });

  it('walks requirements transitively, arbitrarily deep', () => {
    // A chain E <- D <- C <- B <- A: A's full ancestry is D, C, B, E.
    const quests = [quest('E'), quest('D', ['E']), quest('C', ['D']), quest('B', ['C']), quest('A', ['B'])];
    const graph = dependencyGraphFor(quests, 'A');

    assert.equal(graph.nodes.length, 5);
    assert.equal(graph.layerCount, 5);
    assert.deepEqual(
      graph.nodes.slice().sort((a, b) => a.layer - b.layer).map((node) => node.name),
      ['E', 'D', 'C', 'B', 'A'],
    );
  });

  it('also follows fullCompletionRequirements, deduplicated against questRequirements', () => {
    // A's full_completion bar additionally needs C, which is also a plain
    // questRequirement of A — should not produce two C nodes or two edges.
    const quests = [quest('C'), quest('B', ['C']), quest('A', ['B', 'C'], ['C'])];
    const graph = dependencyGraphFor(quests, 'A');

    assert.equal(graph.nodes.filter((node) => node.name === 'C').length, 1);
    assert.equal(graph.edges.filter((edge) => edge.from === 'C' && edge.to === 'A').length, 1);
  });

  it('only ever visits a shared requirement once, however many dependents share it', () => {
    const quests = [quest('Root'), quest('X', ['Root']), quest('Y', ['Root']), quest('Z', ['Root']), quest('Top', ['X', 'Y', 'Z'])];
    const graph = dependencyGraphFor(quests, 'Top');

    assert.equal(graph.nodes.filter((node) => node.name === 'Root').length, 1);
    assert.equal(graph.edges.filter((edge) => edge.from === 'Root').length, 3);
  });
});

describe('visibleDependencyGraph', () => {
  // A requires B and C; B requires D. D and C have no requirements of
  // their own. Used across most of these to exercise expansion depth.
  const quests = [quest('D'), quest('C'), quest('B', ['D']), quest('A', ['B', 'C'])];

  it('returns null for a quest name with no matching record', () => {
    assert.equal(visibleDependencyGraph([quest('X')], 'Not A Real Quest', new Set()), null);
  });

  it('shows only the target, with no edges, when nothing is expanded', () => {
    const graph = visibleDependencyGraph(quests, 'A', new Set());

    assert.equal(graph.nodes.length, 1);
    assert.equal(graph.nodes[0].name, 'A');
    assert.equal(graph.nodes[0].isTarget, true);
    assert.equal(graph.nodes[0].isExpanded, false);
    assert.deepEqual(graph.edges, []);
  });

  it('flags hasRequirements independently of expansion state', () => {
    const collapsed = visibleDependencyGraph(quests, 'A', new Set());
    const target = collapsed.nodes.find((node) => node.name === 'A');
    assert.equal(target.hasRequirements, true, 'A has requirements even though none are shown yet');

    const expanded = visibleDependencyGraph(quests, 'A', new Set(['A']));
    const leaf = expanded.nodes.find((node) => node.name === 'C');
    assert.equal(leaf.hasRequirements, false, 'C genuinely has none, once revealed');
  });

  it('reveals one more level for each name added to expandedNames', () => {
    const oneLevel = visibleDependencyGraph(quests, 'A', new Set(['A']));
    assert.deepEqual(
      oneLevel.nodes.map((node) => node.name).sort(),
      ['A', 'B', 'C'],
      'expanding A reveals its direct requirements, not B\'s',
    );

    const twoLevels = visibleDependencyGraph(quests, 'A', new Set(['A', 'B']));
    assert.deepEqual(twoLevels.nodes.map((node) => node.name).sort(), ['A', 'B', 'C', 'D']);
    assert.equal(twoLevels.nodes.find((node) => node.name === 'B').isExpanded, true);
    assert.equal(twoLevels.nodes.find((node) => node.name === 'C').isExpanded, false);
  });

  it('ignores an expanded name that is unreachable from the current target', () => {
    // Stale expansion state from a previously-viewed, unrelated quest chain
    // should never leak stray nodes into this one.
    const graph = visibleDependencyGraph(quests, 'A', new Set(['A', 'Some Other Quest']));
    assert.deepEqual(graph.nodes.map((node) => node.name).sort(), ['A', 'B', 'C']);
  });

  it('layers only over what is currently visible, not the quest\'s true full depth', () => {
    // Before B is expanded, D sits behind it and isn't shown at all — B
    // itself must read as layer 0 (nothing shown above it yet), not as
    // though D's own layer were already known.
    const oneLevel = visibleDependencyGraph(quests, 'A', new Set(['A']));
    assert.equal(oneLevel.nodes.find((node) => node.name === 'B').layer, 0);
    assert.equal(oneLevel.layerCount, 2);

    const twoLevels = visibleDependencyGraph(quests, 'A', new Set(['A', 'B']));
    assert.equal(twoLevels.nodes.find((node) => node.name === 'D').layer, 0);
    assert.equal(twoLevels.nodes.find((node) => node.name === 'B').layer, 1);
    assert.equal(twoLevels.layerCount, 3);
  });
});

describe('initialExpansionFor', () => {
  const none = () => false;

  it('returns an empty set for a quest name with no matching record', () => {
    assert.deepEqual(initialExpansionFor([quest('X')], 'Not A Real Quest', none), new Set());
  });

  it('always expands the target itself, regardless of completion', () => {
    const quests = [quest('A')];
    assert.deepEqual(initialExpansionFor(quests, 'A', () => true), new Set(['A']));
  });

  it('expands every quest along a chain when nothing is completed, root leaf included', () => {
    // E <- D <- C <- B <- A
    const quests = [quest('E'), quest('D', ['E']), quest('C', ['D']), quest('B', ['C']), quest('A', ['B'])];
    // E has nothing of its own to expand into, but the walk still reaches
    // and processes it (harmlessly — visibleDependencyGraph just finds no
    // further requirements there), so it lands in the set the same as
    // anything else the walk didn't stop short of.
    assert.deepEqual(initialExpansionFor(quests, 'A', none), new Set(['A', 'B', 'C', 'D', 'E']));
  });

  it('stops expanding a branch at the first completed quest, but keeps it in the set up to there', () => {
    // E <- D <- C <- B <- A, with C completed.
    const quests = [quest('E'), quest('D', ['E']), quest('C', ['D']), quest('B', ['C']), quest('A', ['B'])];
    const isCompleted = (name) => name === 'C';

    const expanded = initialExpansionFor(quests, 'A', isCompleted);
    assert.deepEqual(expanded, new Set(['A', 'B']), 'B is expanded (revealing C), but C itself is not');
  });

  it('handles each branch independently — one completed branch does not affect a sibling', () => {
    // A requires X and Y; X requires XX; Y requires YY. X is completed.
    const quests = [quest('XX'), quest('YY'), quest('X', ['XX']), quest('Y', ['YY']), quest('A', ['X', 'Y'])];
    const isCompleted = (name) => name === 'X';

    const expanded = initialExpansionFor(quests, 'A', isCompleted);
    // X (completed) is never processed at all — its own requirement XX is
    // never even discovered. Y (not completed) keeps unfolding, reaching
    // YY too.
    assert.deepEqual(expanded, new Set(['A', 'Y', 'YY']));
  });

  it('never expands past an unresolved requirement (no matching quest record)', () => {
    const quests = [quest('Miniquest', ['Some Tutorial Area'])];
    assert.deepEqual(initialExpansionFor(quests, 'Miniquest', none), new Set(['Miniquest']));
  });

  it('only ever expands a shared prerequisite once, however many branches reach it', () => {
    const quests = [quest('Root'), quest('X', ['Root']), quest('Y', ['Root']), quest('Top', ['X', 'Y'])];
    const expanded = initialExpansionFor(quests, 'Top', none);
    assert.deepEqual(expanded, new Set(['Top', 'X', 'Y', 'Root']));
  });
});

describe('ancestorNames', () => {
  const edge = (from, to) => ({ from, to });

  it('is just the node itself when there are no edges into it', () => {
    assert.deepEqual(ancestorNames([], 'A'), new Set(['A']));
    assert.deepEqual(ancestorNames([edge('A', 'B')], 'A'), new Set(['A']), 'A has no incoming edges of its own');
  });

  it('walks backward through a chain', () => {
    const edges = [edge('D', 'C'), edge('C', 'B'), edge('B', 'A')];
    assert.deepEqual(ancestorNames(edges, 'A'), new Set(['A', 'B', 'C', 'D']));
    assert.deepEqual(ancestorNames(edges, 'C'), new Set(['C', 'D']), 'stops at C — B and A are downstream, not ancestors');
  });

  it('includes every branch feeding into a node, not just one', () => {
    const edges = [edge('Root', 'X'), edge('Root', 'Y'), edge('X', 'Top'), edge('Y', 'Top')];
    assert.deepEqual(ancestorNames(edges, 'Top'), new Set(['Top', 'X', 'Y', 'Root']));
  });

  it('only ever visits a shared ancestor once', () => {
    const edges = [edge('Root', 'X'), edge('Root', 'Y'), edge('X', 'Top'), edge('Y', 'Top')];
    const ancestors = ancestorNames(edges, 'Top');
    assert.equal([...ancestors].filter((name) => name === 'Root').length, 1);
  });

  it('ignores edges unrelated to the traced node', () => {
    const edges = [edge('B', 'A'), edge('D', 'C')];
    assert.deepEqual(ancestorNames(edges, 'A'), new Set(['A', 'B']));
  });
});
