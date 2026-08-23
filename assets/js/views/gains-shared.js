import { el } from '../dom.js';
import { formatCompact, formatNumber } from '../format.js';
import { iconFor } from '../config.js';
import { tooltipContent } from '../tooltip.js';

/**
 * Pieces shared between the Gains grid (leaderboards.js) and its bar-chart
 * alternative (gains-chart.js) — currently just the tooltip content for a
 * skill-driven gain (levels/xp) or a quest-points gain, since the chart is
 * its own visual rather than reusing the grid's row/cell chrome.
 */

/** Skill icon plus its gain. The name rides along for screen readers. */
export const skillGain = (entry, className = 'skill-gain') =>
  el('span', { class: className }, [
    el('img', { src: iconFor(entry.skill), alt: '', width: 14, height: 14, decoding: 'async' }),
    el('span', { class: 'visually-hidden', text: `${entry.skill.name} ` }),
    el('span', { text: `+${formatCompact(entry.gained)}` }),
  ]);

/**
 * Every skill the player trained in the window, icon-led and ordered by gain.
 * `bySkill` is already sorted descending by computeGains / computeLevelGains.
 */
function skillBreakdown(bySkill) {
  if (bySkill.length === 0) return null;

  return el('div', { class: 'tooltip-skills' }, [
    el('p', { class: 'tooltip-skills-label', text: 'Skills trained' }),
    el('div', { class: 'tooltip-skills-grid' }, bySkill.map((entry) => skillGain(entry))),
  ]);
}

/** Tooltip body for a levels/xp gain row — same shape from computeGains and computeLevelGains. */
export function skillGainTooltip(row, valueLabel) {
  const top = row.bySkill[0];
  return tooltipContent(
    row.player.name,
    [
      [valueLabel, formatNumber(row.total)],
      ['Skills trained', formatNumber(row.bySkill.length)],
      ['Top skill', top ? skillGain(top, 'skill-gain is-top') : '—'],
    ],
    row.player.colour,
    skillBreakdown(row.bySkill),
  );
}

/** Tooltip body for a quest-points gain row — no per-skill breakdown to add. */
export const questGainTooltip = (row) =>
  tooltipContent(row.player.name, [['Quest points gained', formatNumber(row.gained)]], row.player.colour);

/**
 * One labelled band — a period name, then that period's ranked five,
 * grid-cell style. Used by the Gains grid and Account Standings.
 * `label` is usually a string, but may be a node (e.g. questPointsIcon()) for
 * a band identified by icon rather than text.
 */
export const band = (label, entries) =>
  el('div', { class: 'lb-band' }, [
    el(
      'div',
      { class: 'lb-band-head' },
      [typeof label === 'string' ? el('p', { class: 'lb-band-label', text: label }) : el('p', { class: 'lb-band-label' }, [label])],
    ),
    el('div', { class: 'lb-row' }, entries),
  ]);

/** A player with nothing gained this period sits out the grid's band entirely
 * — the column stays reserved so the grid doesn't reflow, but shows nothing. */
export const emptyEntry = () => el('div', { class: 'lb-entry lb-entry-empty', 'aria-hidden': 'true' });

/** The quest-points row/band, identified by its game icon rather than a text label. */
export const questPointsIcon = () =>
  el('img', {
    class: 'lb-band-icon',
    src: 'assets/icons/quest-points.png',
    alt: 'Quest points',
    width: 18,
    height: 18,
    decoding: 'async',
  });
