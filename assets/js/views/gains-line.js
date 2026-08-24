import { svgEl, el, swatch } from '../dom.js';
import { formatCompact, formatNumber, formatRelativeTime, formatUtcMidnight } from '../format.js';
import { bindTooltip, tooltipContent } from '../tooltip.js';
import { questPointsIcon } from './gains-shared.js';

/**
 * Line-chart alternative to the Gains grid/bar-chart — one card per metric
 * (Levels, XP, Quest points), each plotting every player's value at every
 * snapshot in the selected period as its own coloured line, so relative
 * progress over time reads at a glance. Day/week/month share the exact same
 * shape from computeGainsSeries: a "day" window commonly has only one or two
 * snapshots in range and draws as a lone dot per player, while week/month
 * carry as many points as there are snapshots in range (data updates
 * hourly), not one point per day.
 *
 * Besides the line itself, each player gets a hoverable day-mark dot at every
 * UTC-midnight boundary they have data for — a fixed once-a-day rhythm laid
 * over the irregular snapshot cadence, so "where was everyone as of
 * yesterday" reads without having to hunt along the line for it.
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

const toX = (x) => (PAD_X + x * (WIDTH - PAD_X * 2)).toFixed(2);
const toY = (y) => (HEIGHT - PAD_Y - y * (HEIGHT - PAD_Y * 2)).toFixed(2);

const legendItem = (player) =>
  el('span', { class: 'line-chart-legend-item' }, [swatch(player.colour), el('span', { class: 'chart-name-text', text: player.name })]);

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

/**
 * One player's line: a polyline through every point (skipped entirely when
 * there's only one — a lone point has nothing to connect to), a day-mark dot
 * at each UTC-midnight the player has data for, and a head dot on the latest
 * point — all three share one hover/focus tooltip treatment.
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
    r: points.length > 1 ? 2.2 : 2.8,
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

  return nodes;
}

function lineChart(rows, formatValue, valueLabel) {
  const svg = svgEl('svg', {
    viewBox: `0 0 ${WIDTH} ${HEIGHT}`,
    class: 'line-chart-svg',
    role: 'img',
    'aria-label': `${valueLabel} over time, one line per player`,
  });

  for (const row of rows) svg.append(...playerLine(row, formatValue, valueLabel));

  return svg;
}

function lineCard(label, seriesResult, formatValue, valueLabel) {
  const rows = seriesResult.rows.filter((row) => row.points.length > 0);

  const body = rows.length
    ? [lineChart(rows, formatValue, valueLabel), el('div', { class: 'line-chart-legend' }, rows.map((row) => legendItem(row.player)))]
    : [el('p', { class: 'chart-empty', text: 'No data yet.' })];

  return el('section', { class: 'chart-card' }, [
    el('p', { class: 'chart-card-label' }, [typeof label === 'string' ? el('span', { text: label }) : label]),
    ...body,
  ]);
}

/** @param gains { series: { levels, xp, quests } }, each { day, week, month } from computeGainsSeries. */
export function renderGainsLines(gains, period) {
  return el('div', { class: 'chart-section' }, [
    lineCard('Levels', gains.series.levels[period], formatNumber, 'Total level'),
    lineCard('XP', gains.series.xp[period], formatCompact, 'Total XP'),
    lineCard(questPointsIcon(), gains.series.quests[period], formatNumber, 'Quest points'),
  ]);
}
