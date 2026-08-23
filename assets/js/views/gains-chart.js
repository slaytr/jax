import { el, swatch } from '../dom.js';
import { formatCompact, formatNumber } from '../format.js';
import { bindTooltip } from '../tooltip.js';
import { skillGainTooltip, questGainTooltip, questPointsIcon } from './gains-shared.js';

/**
 * Bar-chart alternative to the Gains grid — one self-contained card per
 * metric (Levels, XP, Quest points), its bars grouped tightly together on a
 * shared baseline rather than boxed into the grid's per-player cells. Plain
 * flexbox HTML: five thin bars don't need a charting library, and the
 * dataviz skill's own guidance is to hand-build at this scale.
 *
 * A player with nothing gained this period is left out of that chart
 * entirely — with bars no longer pinned to fixed grid columns, an empty
 * placeholder has nothing left to align with.
 */

/** Value on top (a column's label sits on its cap), then the bar itself,
 * growing from the shared baseline below. */
function barColumn(row, value, buildTooltip) {
  const node = el('div', { class: 'chart-bar-col', style: { '--accent': row.player.colour }, tabindex: '0' }, [
    el('span', { class: 'chart-bar-value', text: value }),
    el('span', { class: 'chart-bar-fill', style: { height: `${Math.max(row.share * 100, 4).toFixed(1)}%` } }),
  ]);

  return bindTooltip(node, buildTooltip);
}

/** A parallel row below the bars, one swatch+name per column, same width and
 * gap as `.chart-bars` so every name lines up under its own bar. */
const nameColumn = (player) =>
  el('div', { class: 'chart-name-col' }, [swatch(player.colour), el('span', { class: 'chart-name-text', text: player.name })]);

function chartCard(label, rows, valueOf, formatValue, buildTooltip) {
  const active = rows.filter((row) => valueOf(row) > 0);

  const body = active.length
    ? [
        el(
          'div',
          { class: 'chart-bars' },
          active.map((row) => barColumn(row, `+${formatValue(valueOf(row))}`, () => buildTooltip(row))),
        ),
        el('div', { class: 'chart-names' }, active.map((row) => nameColumn(row.player))),
      ]
    : [el('p', { class: 'chart-empty', text: 'No gains yet.' })];

  return el('section', { class: 'chart-card' }, [
    el('p', { class: 'chart-card-label' }, [typeof label === 'string' ? el('span', { text: label }) : label]),
    ...body,
  ]);
}

/** @param gains { levels, xp, quests }, each { day, week, month } — same shape renderGains takes. */
export function renderGainsCharts(gains, period) {
  return el('div', { class: 'chart-section' }, [
    chartCard('Levels', gains.levels[period].rows, (row) => row.total, formatNumber, (row) => skillGainTooltip(row, 'Levels gained')),
    chartCard('XP', gains.xp[period].rows, (row) => row.total, formatCompact, (row) => skillGainTooltip(row, 'XP gained')),
    chartCard(questPointsIcon(), gains.quests[period].rows, (row) => row.gained, formatNumber, (row) => questGainTooltip(row)),
  ]);
}
