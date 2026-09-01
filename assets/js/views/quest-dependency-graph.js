import { el, svgEl, replaceChildren } from '../dom.js';
import { dependencyGraphFor, visibleDependencyGraph, ancestorNames } from '../quest-graph.js';
import { statusOf, STATUS_MARKER, skillLevelsByName } from './player-quests.js';
import { SKILLS, iconFor } from '../config.js';

const SKILL_BY_NAME = new Map(SKILLS.map((skill) => [skill.name, skill]));

/**
 * The fullscreen overlay's own home — a singleton appended directly to
 * `document.body` on first use (same "module-level element, created once"
 * shape as tooltip.js's own tip div), *outside* #panel's subtree entirely.
 * That's not incidental: #panel carries a page-load entrance animation
 * (styles.css's `body[data-ready] #panel { animation: rise … }`) which,
 * for as long as it's applying a real (non-`none`) transform, establishes a
 * *new containing block* for any `position: fixed` descendant — the CSS
 * spec's own rule, not a bug in this codebase, but one that would otherwise
 * pin the fullscreen card to #panel's own box instead of the viewport,
 * which is exactly what "full screen" is supposed to escape. Rendering the
 * overlay into a portal that's a sibling of #panel (a plain, untransformed
 * body-level div) sidesteps the whole issue rather than depending on that
 * animation's own timing.
 */
let fullscreenPortal = null;

function ensureFullscreenPortal() {
  if (!fullscreenPortal) {
    fullscreenPortal = el('div', { class: 'quest-graph-fullscreen-portal' });
    document.body.append(fullscreenPortal);
  }
  return fullscreenPortal;
}

/**
 * Empties the fullscreen portal — a no-op if nothing's ever been rendered
 * into it yet. Called unconditionally at the very top of stats.js's own
 * render(), before it even knows which tab is active: a portal left over
 * from a previous fullscreen render must never linger once that state is no
 * longer current, including on a render pass that doesn't call
 * renderQuestDependencyGraph at all (switching away from the Quests tab
 * entirely, say) — that function only gets a chance to *re-fill* it, within
 * the same render pass, if the map is still selected and still fullscreen.
 */
export function clearFullscreenPortal() {
  if (fullscreenPortal) replaceChildren(fullscreenPortal);
}

/**
 * The Quests tab's second column: a left-to-right flow chart of whichever
 * quest (or whole questline — see `selection` below) is currently selected
 * beside it, built up by expanding one quest at a time rather than dumping
 * its entire transitive chain at once (quest-graph.js's
 * `visibleDependencyGraph` does the actual traversal/layout — this file
 * only turns that into positioned nodes and connecting curves). Layer 0
 * (nothing shown above it yet) sits on the left; every selected quest is
 * always a rightmost-or-later node (`isTarget`), since every other visible
 * node is one of its ancestors — for a single quest that's exactly one
 * node; for a questline it's every member at once, which need not all sit
 * on one connected chain (a side quest nothing else in the series requires
 * still gets its own node, off to the side, rather than being dropped).
 *
 * A quest starts alone, collapsed, the moment it's selected. Two separate
 * click targets share each node, deliberately not one:
 *  - The small "+"/"–" button (`onToggleExpand`) reveals or hides that
 *    quest's own direct requirements as new nodes to its left, and grows or
 *    shrinks the node itself to show/hide its skill requirements inline.
 *    Only present on a node with something to reveal — quest-to-quest
 *    requirements, skill requirements, or both; a node with neither, or no
 *    matching quest record at all (`quest: null` — quest-graph.js's
 *    unresolved-reference leaves), has nothing behind it to expand.
 *  - The rest of the node (`onHighlightNode`) selects it for highlighting
 *    instead — every node feeding into it (quest-graph.js's `ancestorNames`,
 *    walked over whatever's currently visible) stays at full opacity while
 *    everything else in the chart dims, so tracing one branch through a
 *    tangle of crossing edges doesn't require expanding or collapsing
 *    anything. Clicking the same node again clears the highlight.
 * Expanding/collapsing never replaces the chart wholesale (exploring one
 * branch never costs you whatever else you'd already expanded elsewhere),
 * and highlighting never touches what's expanded either — the two are
 * fully independent state.
 *
 * Nodes are plain `<div>`s carrying position/size/border styling, each
 * holding the two real `<button>`s described above side by side (site
 * convention: a click target is a button, not a div with a handler — and
 * two buttons can't nest, hence the wrapping div rather than making the
 * whole node one big button the way earlier versions of this file did).
 * They sit over one absolutely positioned `<svg>` carrying just the
 * connecting curves — not everything drawn in SVG (a `<foreignObject>` per
 * node would work too, but plain buttons get normal CSS
 * text-overflow/ellipsis and native focus handling for free). The svg
 * layer has `pointer-events: none` so it never steals a click meant for a
 * button underneath it.
 */

const NODE_WIDTH = 168;
const NODE_HEIGHT = 32; // collapsed, or expanded with no skill requirements to show
const NODE_HEADER_HEIGHT = 22; // name row height, once a skills block sits beneath it
const SKILL_ROW_HEIGHT = 18;
const SKILL_CHIPS_PER_ROW = 4;
const NODE_VERTICAL_PADDING = 6; // breathing room around an expanded node's header+skills stack
const COLUMN_GAP = 64; // horizontal room between layers, for the connecting curve
const ROW_GAP = 10; // vertical gap between nodes sharing a layer
const CANVAS_PADDING = 16;

const COLUMN_WIDTH = NODE_WIDTH + COLUMN_GAP;

/** A node's own skill requirements once expanded — [] both when collapsed
 * (nothing to show yet) and for a quest with genuinely none, since either
 * way there's nothing to render or size for. */
function visibleSkillRequirements(node) {
  return node.isExpanded ? (node.quest?.skillRequirements ?? []) : [];
}

/** An expanded node with skill requirements grows to fit them, wrapped
 * `SKILL_CHIPS_PER_ROW` to a row — deterministic from the count alone, so
 * layout never needs to measure real rendered text. Every other node (most
 * of them, most of the time) stays the plain collapsed height. */
function nodeHeight(node) {
  const skills = visibleSkillRequirements(node);
  if (skills.length === 0) return NODE_HEIGHT;
  const rows = Math.ceil(skills.length / SKILL_CHIPS_PER_ROW);
  return NODE_HEADER_HEIGHT + rows * SKILL_ROW_HEIGHT + NODE_VERTICAL_PADDING;
}

/** Every node's pixel position and own height, keyed by name — computed
 * once per render and consulted both for placing the node buttons and for
 * drawing edges between them, so the two never disagree. Row height varies
 * per node now (nodeHeight) rather than a flat constant, since an expanded
 * node listing several skill requirements stands taller than a plain
 * collapsed one sharing its layer — each layer is stacked by its own
 * members' actual heights, then centred as a whole against whichever layer
 * currently stands tallest, for a symmetric tree rather than everything
 * hugging the top. */
function layoutOf(graph) {
  const byLayer = [];
  for (const node of graph.nodes) {
    if (!byLayer[node.layer]) byLayer[node.layer] = [];
    byLayer[node.layer][node.order] = node;
  }

  const layerHeights = byLayer.map(
    (nodes) => nodes.reduce((sum, node) => sum + nodeHeight(node), 0) + (nodes.length - 1) * ROW_GAP,
  );
  const maxLayerHeight = Math.max(...layerHeights);

  const positionByName = new Map();
  const heightByName = new Map();
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

/** completed/in-progress/not-started (statusOf, player-quests.js) plus
 * `external` for a requirement name with no matching quest record (a
 * couple of tutorial areas — see quest-data/README.md's
 * unresolvedQuestRefs) — there's no player status for something that isn't
 * actually a trackable quest. */
function nodeStatus(node, completedSet, startedSet) {
  if (!node.quest) return 'external';
  return statusOf(node.quest, completedSet, startedSet);
}

/** A quest's own skill requirements are independent of quest-graph.js's
 * `hasRequirements` (that one only counts quest-to-quest prerequisites) —
 * a node can be clickable purely because it has skill requirements to
 * reveal even when it needs no other quest at all. */
const hasSkillRequirements = (node) => (node.quest?.skillRequirements ?? []).length > 0;
const isExpandable = (node) => node.hasRequirements || hasSkillRequirements(node);

/** `targetCount` (how many nodes in the whole graph are `isTarget`, not just
 * this one) picks the wording for a target node: "selected" reads fine for
 * the ordinary one-quest case, but a questline selection marks *every*
 * series member as a target at once (quest-graph.js's own targetNames), so
 * "selected" for all of them would overstate it — a viewer picked the
 * questline, not each quest individually. */
function nodeTitle(node, status, targetCount) {
  if (!node.quest) return `${node.name} — not tracked as a quest (e.g. a tutorial area)`;
  const statusLabel = status === 'in-progress' ? 'in progress' : status;
  const targetSuffix = node.isTarget ? (targetCount > 1 ? ' — in this questline' : ' — selected') : '';
  return `${node.name} — ${statusLabel}${targetSuffix} — click to highlight its branch`;
}

const expandButtonTitle = (node) => (node.isExpanded ? 'Collapse' : 'Expand');

/** One skill requirement, icon-led (config.js's iconFor, same small-icon
 * treatment as a Gains card's skillGain chip) — falls back to plain text
 * if the name somehow doesn't match a known skill, rather than dropping it
 * or crashing on a missing icon. Coloured green/red by whether the viewed
 * player's own current level (skillLevelsByName, player-quests.js) meets
 * `req.level` — the same at-a-glance met/not-met signal the Quests list's
 * own "Meets skill reqs" filter uses, just per-skill here instead of
 * whole-quest. */
function skillChip(req, skillLevels) {
  const skill = SKILL_BY_NAME.get(req.skill);
  const met = (skillLevels.get(req.skill) ?? 0) >= req.level;
  return el(
    'span',
    { class: `quest-graph-node-skill is-${met ? 'met' : 'not-met'}`, title: `${req.skill} ${req.level}${met ? '' : ' — not met'}` },
    [skill ? el('img', { src: iconFor(skill), alt: '', width: 12, height: 12, decoding: 'async' }) : null, el('span', { text: req.level })],
  );
}

/** Only a not-started, real (non-external) quest with no goal-group of its
 * own yet gets the "track as a goal" button (onCreateQuestGoal) — a
 * completed or in-progress quest has nothing left worth turning into a
 * fresh tracker, an external leaf (quest: null) isn't a real quest to track
 * at all, and one already tracked (existingQuestGoalNames, its own group's
 * name — quest-goal.js) would just duplicate that group rather than add
 * anything new. */
const canCreateQuestGoal = (node, status, existingQuestGoalNames) =>
  node.quest !== null && status === 'not-started' && !existingQuestGoalNames.has(node.name);

/**
 * One node: a plain positioned/sized `<div>` holding two or three
 * independent buttons (see this file's own top doc comment for why the
 * first two are split) — the small "+"/"–" expand toggle, present only when
 * there's something to expand; a button covering the name that selects it
 * for highlighting; and, only on an untracked not-started quest, a small
 * "⚑" button (onCreateQuestGoal) that opens the "track this as a goal"
 * confirmation (player-goals.js's renderQuestGoalDialog, stats.js).
 * `event.stopPropagation` on the expand and goal buttons keeps their clicks
 * from also bubbling up as a highlight pick, since all of these sit inside
 * the same wrapping div.
 */
function graphNode({
  node,
  position,
  height,
  status,
  skillLevels,
  isDimmed,
  isHighlighted,
  targetCount,
  isQuestlineTarget,
  existingQuestGoalNames,
  onToggleExpand,
  onHighlightNode,
  onCreateQuestGoal,
}) {
  const expandable = isExpandable(node);
  const skills = visibleSkillRequirements(node);
  const offerGoal = canCreateQuestGoal(node, status, existingQuestGoalNames);
  const classes = [
    'quest-graph-node',
    `is-${status}`,
    node.isTarget && (isQuestlineTarget ? 'is-questline-target' : 'is-target'),
    node.isExpanded && 'is-expanded',
    isDimmed && 'is-dimmed',
    isHighlighted && 'is-highlighted',
  ]
    .filter(Boolean)
    .join(' ');

  return el(
    'div',
    { class: classes, style: { left: `${position.x}px`, top: `${position.y}px`, width: `${NODE_WIDTH}px`, height: `${height}px` } },
    [
      el('div', { class: 'quest-graph-node-header' }, [
        expandable
          ? el('button', {
              type: 'button',
              class: 'quest-graph-node-expand-btn',
              text: node.isExpanded ? '–' : '+',
              title: expandButtonTitle(node),
              onclick: (event) => {
                event.stopPropagation();
                onToggleExpand(node.quest);
              },
            })
          : el('span', { class: 'quest-graph-node-expand-btn is-empty', 'aria-hidden': 'true' }),
        el(
          'button',
          {
            type: 'button',
            class: 'quest-graph-node-select',
            title: nodeTitle(node, status, targetCount),
            onclick: () => onHighlightNode(node.name),
          },
          [
            STATUS_MARKER[status] ? el('span', { class: 'quest-graph-node-check', 'aria-hidden': 'true', text: STATUS_MARKER[status] }) : null,
            el('span', { class: 'quest-graph-node-name', text: node.name }),
          ],
        ),
        // stats.js passes onCreateQuestGoal as null for a viewer who
        // doesn't own this player — same read-only convention as
        // player-goals.js's deleteButton (onDelete null hides the ×).
        offerGoal && onCreateQuestGoal
          ? el('button', {
              type: 'button',
              class: 'quest-graph-node-goal-btn',
              text: '⚑',
              title: 'Track as a goal',
              onclick: (event) => {
                event.stopPropagation();
                onCreateQuestGoal(node.quest);
              },
            })
          : null,
      ]),
      skills.length > 0 ? el('div', { class: 'quest-graph-node-skills' }, skills.map((req) => skillChip(req, skillLevels))) : null,
    ],
  );
}

/** One requirement's connecting curve — a horizontal cubic bezier from the
 * prerequisite's right edge to the dependent's left edge, both vertically
 * centred on their own node. `relation` (quest-graph.js, straight from
 * quest-data's own questRequirements) styles "partial"/"full_completion" as
 * dashed — a stricter or partial bar than plain completion, worth reading
 * differently at a glance (see the graph's own legend). */
function edgePath(edge, positionByName, heightByName, isDimmed) {
  const from = positionByName.get(edge.from);
  const to = positionByName.get(edge.to);
  if (!from || !to) return null;

  const x1 = from.x + NODE_WIDTH;
  const y1 = from.y + heightByName.get(edge.from) / 2;
  const x2 = to.x;
  const y2 = to.y + heightByName.get(edge.to) / 2;
  const c = COLUMN_GAP / 2;

  return svgEl('path', {
    d: `M ${x1.toFixed(1)} ${y1.toFixed(1)} C ${(x1 + c).toFixed(1)} ${y1.toFixed(1)}, ${(x2 - c).toFixed(1)} ${y2.toFixed(1)}, ${x2.toFixed(1)} ${y2.toFixed(1)}`,
    class: `quest-graph-edge${edge.relation !== 'required' ? ' is-partial' : ''}${isDimmed ? ' is-dimmed' : ''}`,
    'marker-end': 'url(#quest-graph-arrow)',
  });
}

/** Defined once per chart rather than per edge — every edgePath references
 * it by the same #id. */
function arrowMarker() {
  const marker = svgEl('marker', {
    id: 'quest-graph-arrow',
    viewBox: '0 0 8 8',
    refX: 7,
    refY: 4,
    markerWidth: 6,
    markerHeight: 6,
    orient: 'auto-start-reverse',
  });
  marker.append(svgEl('path', { d: 'M 0 0 L 8 4 L 0 8 z', class: 'quest-graph-arrowhead' }));
  return marker;
}

/** Everything currently visible that feeds into `highlightedName` (via
 * ancestorNames, quest-graph.js) — null when nothing's highlighted, or the
 * highlighted node has since scrolled out of the visible graph entirely
 * (its target changed, or an ancestor collapsed over it), in which case
 * nothing should dim rather than everything. */
function highlightSetFor(graph, highlightedName) {
  if (!highlightedName || !graph.nodes.some((node) => node.name === highlightedName)) return null;
  return ancestorNames(graph.edges, highlightedName);
}

function graphCanvas(graph, player, highlightedName, isQuestlineTarget, existingQuestGoalNames, onToggleExpand, onHighlightNode, onCreateQuestGoal) {
  const { positionByName, heightByName, width, height } = layoutOf(graph);
  const completedSet = new Set(player.completedQuests ?? []);
  const startedSet = new Set(player.startedQuests ?? []);
  const skillLevels = skillLevelsByName(player);
  const highlightSet = highlightSetFor(graph, highlightedName);
  const targetCount = graph.nodes.filter((node) => node.isTarget).length;

  const svg = svgEl('svg', { class: 'quest-graph-edges', width, height });
  const defs = svgEl('defs', {});
  defs.append(arrowMarker());
  svg.append(defs);
  for (const edge of graph.edges) {
    const dimmed = highlightSet ? !(highlightSet.has(edge.from) && highlightSet.has(edge.to)) : false;
    const path = edgePath(edge, positionByName, heightByName, dimmed);
    if (path) svg.append(path);
  }

  const nodes = graph.nodes.map((node) =>
    graphNode({
      node,
      position: positionByName.get(node.name),
      height: heightByName.get(node.name),
      status: nodeStatus(node, completedSet, startedSet),
      skillLevels,
      isDimmed: highlightSet ? !highlightSet.has(node.name) : false,
      isHighlighted: node.name === highlightedName,
      targetCount,
      isQuestlineTarget,
      existingQuestGoalNames,
      onToggleExpand,
      onHighlightNode,
      onCreateQuestGoal,
    }),
  );

  return el('div', { class: 'quest-graph-canvas', style: { width: `${width}px`, height: `${height}px` } }, [svg, ...nodes]);
}

/** `N prerequisite quest(s) lead to <name>` for a single quest, or a
 * questline summary when `selection.kind` is 'series' — either way, the
 * counts come from `totalGraph`'s full transitive walk (dependencyGraphFor,
 * every `targetNames` entry unioned), independent of whatever's currently
 * expanded, so the figures (and whether to invite expanding at all) never
 * change as a viewer clicks around.
 *
 * For a series, `additional` (totalGraph's own node count minus the
 * series' own member count) never double-counts a member that also happens
 * to be another member's ancestor — dependencyGraphFor's union already
 * de-duplicates that. Omitted entirely when it's 0 (every member needs
 * nothing outside the series itself), same as the single-quest case
 * reading "No prerequisites" rather than "0 prerequisite quests lead to…"
 * when there's nothing to report. */
function graphCaption(totalGraph, targetNames, selection) {
  const additional = totalGraph.nodes.length - targetNames.length;
  const hint = '"+" expands a quest, click its name to highlight its branch.';

  if (selection.kind === 'series') {
    const memberCount = targetNames.length;
    const membersPart = `${memberCount} quest${memberCount === 1 ? '' : 's'} in the ${selection.seriesName} questline`;
    const additionalPart = additional > 0 ? `, plus ${additional} additional prerequisite quest${additional === 1 ? '' : 's'}` : '';
    return el('p', { class: 'quest-graph-caption', text: `${membersPart}${additionalPart} — ${hint}` });
  }

  const text =
    additional === 0
      ? `No prerequisites — ${selection.quest.name} is a starting point.`
      : `${additional} prerequisite quest${additional === 1 ? '' : 's'} lead to ${selection.quest.name} — ${hint}`;
  return el('p', { class: 'quest-graph-caption', text });
}

const LEGEND_ITEMS = [
  ['is-completed', 'Completed'],
  ['is-in-progress', 'In progress'],
  ['is-not-started', 'Not started'],
  ['is-external', 'Not a tracked quest'],
  ['is-target', 'Selected quest'],
  ['is-questline-target', 'Selected questline'],
];

function graphLegend() {
  return el('div', { class: 'quest-graph-legend' }, [
    ...LEGEND_ITEMS.map(([status, label]) =>
      el('span', { class: 'quest-graph-legend-item' }, [
        el('span', { class: `quest-graph-legend-swatch ${status}`, 'aria-hidden': 'true' }),
        el('span', { text: label }),
      ]),
    ),
    el('span', { class: 'quest-graph-legend-item' }, [
      el('span', { class: 'quest-graph-legend-line', 'aria-hidden': 'true' }),
      el('span', { text: 'Required' }),
    ]),
    el('span', { class: 'quest-graph-legend-item' }, [
      el('span', { class: 'quest-graph-legend-line is-partial', 'aria-hidden': 'true' }),
      el('span', { text: 'Partial / full completion' }),
    ]),
    el('span', { class: 'quest-graph-legend-item' }, [
      el('span', { class: 'quest-graph-legend-expand', 'aria-hidden': 'true', text: '+' }),
      el('span', { text: 'Has more — click to expand' }),
    ]),
    el('span', { class: 'quest-graph-legend-item' }, [
      el('span', { class: 'quest-graph-legend-skill is-met', 'aria-hidden': 'true', text: '25' }),
      el('span', { text: 'Skill level met' }),
    ]),
    el('span', { class: 'quest-graph-legend-item' }, [
      el('span', { class: 'quest-graph-legend-skill is-not-met', 'aria-hidden': 'true', text: '99' }),
      el('span', { text: 'Not met' }),
    ]),
    el('span', { class: 'quest-graph-legend-item' }, [
      el('span', { class: 'quest-graph-legend-highlight', 'aria-hidden': 'true' }),
      el('span', { text: 'Highlighted branch' }),
    ]),
    el('span', { class: 'quest-graph-legend-item' }, [
      el('span', { class: 'quest-graph-legend-goal', 'aria-hidden': 'true', text: '⚑' }),
      el('span', { text: 'Track as a goal' }),
    ]),
  ]);
}

/** The quest names a `selection` resolves to — a one-element array for a
 * single quest, or every quest tagged with that `quest.series` (quest-data's
 * own field) for a questline, in whatever order `quests` itself lists them
 * (dependencyGraphFor/visibleDependencyGraph don't care about order, just
 * membership). Derived here rather than passed in by stats.js: `quests` is
 * already a prop this file receives, so there's no reason to make the
 * caller duplicate the same filter. */
function targetNamesFor(quests, selection) {
  if (selection.kind === 'series') return quests.filter((quest) => quest.series === selection.seriesName).map((quest) => quest.name);
  return [selection.quest.name];
}

/** The card header's own fullscreen toggle — same glyph either way ("⛶", a
 * standard four-corners fullscreen mark) with the title/aria-pressed telling
 * the two states apart, same contextual-label-not-separate-icon convention
 * as .quest-series-toggle's own chevron. Genuinely useful once a big chain
 * (Sliske's Endgame's is ~130 quests across 13 layers) forces
 * .quest-graph-scroll to scroll in both directions at once — expanding the
 * card to the full viewport (styles.css's .quest-flowchart.is-fullscreen)
 * gives it far more room before that scrolling kicks in. */
function fullscreenToggleButton(isFullscreen, onToggleFullscreen) {
  return el('button', {
    type: 'button',
    class: 'quest-graph-fullscreen-btn',
    title: isFullscreen ? 'Exit full screen' : 'Expand to full screen',
    'aria-pressed': isFullscreen ? 'true' : 'false',
    onclick: onToggleFullscreen,
    text: isFullscreen ? '✕' : '⛶',
  });
}

/**
 * @param quests the full quest-data/quests.json list (quest-data.js), or
 *   null while it's still loading/failed — the caller (stats.js) only ever
 *   reaches the Quests tab (and this component) once that's settled, but a
 *   defensive null still renders the empty prompt rather than throwing.
 * @param player the viewed player (data.js) — its completedQuests/
 *   startedQuests colour each node by this player's own progress.
 * @param selection what the list/questline chips currently have picked, or
 *   null before anything has: `{ kind: 'quest', quest }` (a list row) or
 *   `{ kind: 'series', seriesName }` (a questline chip, quest-series-links.js
 *   — every quest sharing that `quest.series` becomes its own node, even
 *   ones that are nobody's ancestor within the series itself; see
 *   quest-graph.js's own multi-target reasoning).
 * @param expandedNames a `Set` of quest names currently expanded within
 *   this chart (stats.js) — passed straight through to
 *   visibleDependencyGraph.
 * @param onToggleExpand (quest) => void — flips one node's own membership
 *   in `expandedNames`, called by clicking a node's own "+"/"–" button.
 * @param highlightedName whichever quest name is currently selected for
 *   highlighting within this chart, or null — everything not in its branch
 *   (ancestorNames, quest-graph.js) dims. Independent of `expandedNames`;
 *   picking a highlight never expands or collapses anything.
 * @param onHighlightNode (name) => void — sets (or, given the
 *   already-highlighted name, clears) `highlightedName`. Called by clicking
 *   anywhere on a node other than its "+"/"–" button.
 * @param existingQuestGoalNames a `Set` of quest names that already anchor a
 *   goal-group (stats.js, derived from the player's own goals) — hides a
 *   not-started node's "track as a goal" button once its quest already has
 *   one, so accepting the prompt twice can't duplicate a group.
 * @param onCreateQuestGoal (quest) => void — opens the "track this as a
 *   goal" confirmation (stats.js), called by clicking a not-started node's
 *   "⚑" button.
 * @param isFullscreen whether the card is currently expanded to fill the
 *   viewport (stats.js's own render state — see questGraphFullscreen's doc
 *   comment there for why this is plain CSS rather than the native
 *   Fullscreen API).
 * @param onToggleFullscreen () => void — flips `isFullscreen`, called by the
 *   header's own toggle button (fullscreenToggleButton above).
 */
export function renderQuestDependencyGraph({
  quests,
  player,
  selection,
  expandedNames,
  onToggleExpand,
  highlightedName,
  onHighlightNode,
  existingQuestGoalNames,
  onCreateQuestGoal,
  isFullscreen,
  onToggleFullscreen,
}) {
  const body = (() => {
    if (!selection || !quests) {
      return el('p', { class: 'chart-empty', text: 'Click a quest on the left to see its dependency chain.' });
    }
    const targetNames = targetNamesFor(quests, selection);
    const totalGraph = dependencyGraphFor(quests, targetNames);
    const visibleGraph = visibleDependencyGraph(quests, targetNames, expandedNames);
    if (!totalGraph || !visibleGraph) {
      const label = selection.kind === 'series' ? `the "${selection.seriesName}" questline` : `"${selection.quest.name}"`;
      return el('p', { class: 'chart-empty', text: `Couldn't find ${label} in the quest data.` });
    }
    return el('div', { class: 'quest-graph-body' }, [
      graphCaption(totalGraph, targetNames, selection),
      el('div', { class: 'quest-graph-scroll' }, [
        graphCanvas(
          visibleGraph,
          player,
          highlightedName,
          selection.kind === 'series',
          existingQuestGoalNames,
          onToggleExpand,
          onHighlightNode,
          onCreateQuestGoal,
        ),
      ]),
      graphLegend(),
    ]);
  })();

  const section = el('section', { class: `lb quest-flowchart${isFullscreen ? ' is-fullscreen' : ''}` }, [
    el('div', { class: 'lb-head' }, [
      el('div', { class: 'lb-title' }, [el('h2', { text: 'Dependency map' })]),
      fullscreenToggleButton(isFullscreen, onToggleFullscreen),
    ]),
    body,
  ]);

  // Fullscreen: rendered into the body-level portal instead of its normal
  // spot in the tree (see ensureFullscreenPortal's own doc comment for why)
  // — null here so .player-row doesn't also place it inline, doubled up.
  if (isFullscreen) {
    replaceChildren(ensureFullscreenPortal(), section);
    return null;
  }
  return section;
}
