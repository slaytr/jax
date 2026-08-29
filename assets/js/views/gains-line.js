import { svgEl, el, swatch } from '../dom.js';
import { formatCompact, formatNumber, formatRelativeTime, formatUtcMidnight } from '../format.js';
import { bindTooltip, tooltipContent } from '../tooltip.js';
import { questPointsIcon } from './gains-shared.js';

/**
 * Line-chart view shared by the Gains section and Account Standings — one
 * card per metric (Levels, XP, Quest points), each plotting every player's
 * value at every snapshot in the selected period as its own coloured line,
 * so progress over time reads at a glance. Day/week/month share the exact
 * same shape from computeGainsSeries: a "day" window commonly has only one
 * or two snapshots in range and draws as a lone dot per player, while
 * week/month carry as many points as there are snapshots in range (data
 * updates hourly), not one point per day.
 *
 * The Gains section plots each player's *gain* since the window's start
 * (computeGainsSeries' `relative` option — every line starts at 0), while
 * Account Standings plots raw totals over time, matching what the rest of
 * that section shows. Both call the same `lineCard`/`lineChart` plumbing
 * below; only the series data and value labels differ.
 *
 * Besides the line itself, each player gets a hoverable day-mark dot at every
 * UTC-midnight boundary they have data for — a fixed once-a-day rhythm laid
 * over the irregular snapshot cadence, so "where was everyone as of
 * yesterday" reads without having to hunt along the line for it.
 *
 * Each line also carries one text label, at its head (latest) point only —
 * its current value, coloured to match the line, so reading it doesn't
 * require a hover. Labelling every day mark too was considered and rejected:
 * with up to five players and thirty marks apiece on a Month chart, that many
 * labels would overlap into noise. The plot area (`PLOT_WIDTH`) is narrower
 * than the chart itself, reserving a strip on the right for these labels to
 * sit in without overlapping the lines.
 *
 * The label carries a value but no name — the player/colour legend drawn once
 * beneath all three cards is what ties a coloured line back to a name,
 * instead of every card (or every label) repeating the same five names.
 *
 * The viewBox's 3:1 aspect ratio is mirrored by the CSS `aspect-ratio` on
 * `.line-chart-svg`, so the default (uniform) SVG scaling always fills the
 * box exactly — no letterboxing, and every dot stays circular rather than
 * stretching into an ellipse.
 */

const WIDTH = 300;
const HEIGHT = 100;
const PAD_X = 3;
const PAD_Y = 8;
const LABEL_WIDTH = 48;
const PLOT_WIDTH = WIDTH - PAD_X * 2 - LABEL_WIDTH;

const toX = (x) => (PAD_X + x * PLOT_WIDTH).toFixed(2);
const toY = (y) => (HEIGHT - PAD_Y - y * (HEIGHT - PAD_Y * 2)).toFixed(2);

const legendItem = (player) =>
  el('span', { class: 'line-chart-legend-item' }, [swatch(player.colour), el('span', { class: 'chart-name-text', text: player.name })]);

/** Every player with a line in at least one of the three cards, deduped by
 * slug and ordered by first appearance (Levels, then XP, then Quest points)
 * — in practice this is the whole roster, since a player missing from one
 * metric (e.g. quests, when RuneMetrics has no data for them) almost always
 * still has Levels/XP points. */
function legendPlayers(cardRows) {
  const seen = new Map();
  for (const rows of cardRows) {
    for (const row of rows) {
      if (!seen.has(row.player.slug)) seen.set(row.player.slug, row.player);
    }
  }
  return [...seen.values()];
}

/** A day-mark dot: smaller and dimmer than the head dot at rest (see
 * `.is-day-mark` in styles.css) so it reads as a secondary reference point,
 * not a second "current value" — but grows to match on hover/focus, same as
 * the head dot, so it's just as easy to land on and read. */
function dayMarkPoint(row, mark, formatValue, valueLabel, accent) {
  const point = svgEl('circle', {
    cx: toX(mark.x),
    cy: toY(mark.y),
    r: 1.4,
    class: 'line-chart-point is-day-mark',
    style: accent,
    tabindex: '0',
  });

  bindTooltip(point, () =>
    tooltipContent(
      row.player.name,
      [
        [valueLabel, formatValue(mark.value)],
        ['Day', formatUtcMidnight(mark.t)],
      ],
      row.player.colour,
    ),
  );

  return point;
}

const LABEL_MIN_GAP = 9;
const LABEL_Y_MIN = PAD_Y;
const LABEL_Y_MAX = HEIGHT - PAD_Y;

/**
 * Nudges label y-positions apart just enough that adjacent ones don't
 * overlap, leaving labels that already have room untouched. Several players
 * finishing a period on the same or a near-identical value is common (ties,
 * or everyone at 0 gained), so without this their labels would print on top
 * of each other. Classic two-pass declutter: push down top-to-bottom to open
 * up gaps, then pull up bottom-to-top to close whatever excess gap that first
 * pass left at the low end — order (who's above whom) is preserved
 * throughout, only spacing changes.
 */
function declutterLabels(entries) {
  const sorted = [...entries].sort((a, b) => a.y - b.y);

  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].y - sorted[i - 1].y < LABEL_MIN_GAP) sorted[i].y = sorted[i - 1].y + LABEL_MIN_GAP;
  }
  for (let i = sorted.length - 2; i >= 0; i--) {
    if (sorted[i + 1].y - sorted[i].y < LABEL_MIN_GAP) sorted[i].y = sorted[i + 1].y - LABEL_MIN_GAP;
  }

  clampToBounds(sorted);

  return sorted;
}

/**
 * Keeps every label within the chart's own vertical bounds, even when a
 * cluster of ties (e.g. several players all at 0) pushed the spacing pass
 * above past the top or bottom edge — otherwise a bottom-clustered label
 * would spill past the card into whatever sits below it. If the whole stack
 * is taller than the room available, it's compressed evenly (labels ending
 * up closer than `LABEL_MIN_GAP`) rather than left to overflow; otherwise
 * it's simply shifted back into bounds as a whole, which is enough since it
 * already fits.
 */
function clampToBounds(sorted) {
  if (!sorted.length) return;

  const span = sorted[sorted.length - 1].y - sorted[0].y;
  const available = LABEL_Y_MAX - LABEL_Y_MIN;

  if (span > available) {
    const scale = available / span;
    const base = sorted[0].y;
    for (const entry of sorted) entry.y = LABEL_Y_MIN + (entry.y - base) * scale;
  } else if (sorted[0].y < LABEL_Y_MIN) {
    const shift = LABEL_Y_MIN - sorted[0].y;
    for (const entry of sorted) entry.y += shift;
  } else if (sorted[sorted.length - 1].y > LABEL_Y_MAX) {
    const shift = sorted[sorted.length - 1].y - LABEL_Y_MAX;
    for (const entry of sorted) entry.y -= shift;
  }
}

/** The head dot's text label: its current value (colour ties it back to a
 * player via the shared legend below), sat in the label strip reserved to
 * the right of the plot area (see `PLOT_WIDTH`). Right-anchored at a fixed
 * `WIDTH - PAD_X`, the same inset the plot area itself keeps on the left, so
 * every label's outer edge lines up regardless of how many digits it has —
 * rather than left-anchored right after the point, which left a
 * value-dependent gap to the card's edge. `signed` prefixes the value with
 * "+" for a gains-since-baseline series (Gains' line view); Standings'
 * raw-totals series leaves it off, matching how that value reads everywhere
 * else on the page. */
function headLabel(entry, formatValue, signed) {
  const node = svgEl('text', { x: WIDTH - PAD_X, y: entry.y.toFixed(2), class: 'line-chart-label', style: entry.accent });
  node.textContent = `${signed ? '+' : ''}${formatValue(entry.head.value)}`;
  return node;
}

/**
 * One player's line: a polyline through every point (skipped entirely when
 * there's only one — a lone point has nothing to connect to), a day-mark dot
 * at each UTC-midnight the player has data for, and a head dot on the latest
 * point — dot and marker share one hover/focus tooltip treatment. The head's
 * text label is drawn separately by the caller, once every row's label
 * position has been decluttered (see `declutterLabels`).
 */
function playerLine(row, formatValue, valueLabel) {
  const { points } = row;
  const nodes = [];
  const accent = `--accent:${row.player.colour}`;

  if (points.length > 1) {
    const linePoints = points.map((point) => `${toX(point.x)},${toY(point.y)}`).join(' ');
    nodes.push(svgEl('polyline', { points: linePoints, class: 'line-chart-path', style: accent }));
  }

  for (const mark of row.dayMarks) nodes.push(dayMarkPoint(row, mark, formatValue, valueLabel, accent));

  const head = points[points.length - 1];
  const marker = svgEl('circle', {
    cx: toX(head.x),
    cy: toY(head.y),
    r: points.length > 1 ? 3 : 3.6,
    class: 'line-chart-point',
    style: accent,
    tabindex: '0',
  });

  bindTooltip(marker, () =>
    tooltipContent(
      row.player.name,
      [
        [valueLabel, formatValue(head.value)],
        ['When', formatRelativeTime(new Date(head.t * 1000).toISOString())],
      ],
      row.player.colour,
    ),
  );
  nodes.push(marker);

  return { nodes, head, accent };
}

function lineChart(rows, formatValue, valueLabel, signed) {
  const svg = svgEl('svg', {
    viewBox: `0 0 ${WIDTH} ${HEIGHT}`,
    class: 'line-chart-svg',
    role: 'img',
    'aria-label': `${valueLabel} over time, one line per player`,
  });

  const labelEntries = rows.map((row) => {
    const { nodes, head, accent } = playerLine(row, formatValue, valueLabel);
    svg.append(...nodes);
    return { row, head, accent, y: Number(toY(head.y)) };
  });

  for (const entry of declutterLabels(labelEntries)) svg.append(headLabel(entry, formatValue, signed));

  return svg;
}

function lineCard(label, rows, formatValue, valueLabel, signed) {
  const body = rows.length
    ? [lineChart(rows, formatValue, valueLabel, signed)]
    : [el('p', { class: 'chart-empty', text: 'No data yet.' })];

  return el('section', { class: 'chart-card' }, [
    el('p', { class: 'chart-card-label' }, [typeof label === 'string' ? el('span', { text: label }) : label]),
    ...body,
  ]);
}

/** One card per metric, all reading from the same shape: `{ levels, xp, quests }`,
 * each `{ day, week, month }` of computeGainsSeries rows, plus one legend shared
 * by all three cards. `valueLabels` supplies the per-metric tooltip/axis wording,
 * since that's the one thing (besides `signed`) that differs between a
 * gains-since-baseline series and a raw-totals one. */
function renderLineCards(series, period, valueLabels, signed) {
  const levelsRows = series.levels[period].rows.filter((row) => row.points.length > 0);
  const xpRows = series.xp[period].rows.filter((row) => row.points.length > 0);
  const questsRows = series.quests[period].rows.filter((row) => row.points.length > 0);

  const players = legendPlayers([levelsRows, xpRows, questsRows]);

  return el('div', { class: 'chart-section-group' }, [
    el('div', { class: 'chart-section' }, [
      lineCard('Levels', levelsRows, formatNumber, valueLabels.levels, signed),
      lineCard('XP', xpRows, formatCompact, valueLabels.xp, signed),
      lineCard(questPointsIcon(), questsRows, formatNumber, valueLabels.quests, signed),
    ]),
    players.length ? el('div', { class: 'chart-legend' }, players.map((player) => legendItem(player))) : null,
  ]);
}

/** @param gains { series: { levels, xp, quests } }, each { day, week, month } from
 *   computeGainsSeries with `relative: true` — every line is that player's gain
 *   since the window's start, not their raw total. Head labels are signed
 *   ("+123") to match. */
export function renderGainsLines(gains, period) {
  return renderLineCards(
    gains.series,
    period,
    {
      levels: 'Levels gained',
      xp: 'XP gained',
      quests: 'Quest points gained',
    },
    true,
  );
}

/** @param gains { totalsSeries: { levels, xp, quests } }, each { day, week, month }
 *   from computeGainsSeries (default, non-relative) — every line is that player's
 *   raw total over time, matching what the rest of Account Standings shows. Head
 *   labels are unsigned, matching how a total reads everywhere else on the page. */
export function renderStandingsLines(gains, period) {
  return renderLineCards(
    gains.totalsSeries,
    period,
    {
      levels: 'Total level',
      xp: 'Total XP',
      quests: 'Quest points',
    },
    false,
  );
}
