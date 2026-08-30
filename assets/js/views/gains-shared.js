import { el, svgEl } from '../dom.js';
import { formatCompact, formatNumber } from '../format.js';
import { iconFor, QUEST_POINTS_ICON } from '../config.js';
import { tooltipContent } from '../tooltip.js';

/**
 * Pieces shared between the Gains grid (leaderboards.js) and its line-chart
 * alternative (gains-line.js), plus the Account Standings section
 * (standings.js) — tooltip content for a skill-driven gain (levels/xp) or a
 * quest-points gain, the band layout, and the grid/line view-toggle glyphs
 * and control shared by both sections' headers.
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
 */
export const band = (label, entries) =>
  el('div', { class: 'lb-band' }, [
    el('div', { class: 'lb-band-head' }, [el('p', { class: 'lb-band-label', text: label })]),
    el('div', { class: 'lb-row' }, entries),
  ]);

/** A player with nothing gained this period sits out the grid's band entirely
 * — the column stays reserved so the grid doesn't reflow, but shows nothing. */
export const emptyEntry = () => el('div', { class: 'lb-entry lb-entry-empty', 'aria-hidden': 'true' });

/** The quest-points band header's game icon, for contexts that still lead
 * with the glyph instead of the "Quest points" text label (the line-chart
 * card header — see gains-line.js). */
export const questPointsIcon = () =>
  el('img', {
    class: 'lb-band-icon',
    src: QUEST_POINTS_ICON,
    alt: 'Quest points',
    width: 18,
    height: 18,
    decoding: 'async',
  });

/** The same game icon, small and riding right after a quest-points figure
 * (a grid cell's headline value, a Quest God badge's total) as that number's
 * unit — decorative itself, with the unit spelled out for screen readers. */
export const questPointsMark = () =>
  el('span', { class: 'lb-value-icon' }, [
    el('img', { src: QUEST_POINTS_ICON, alt: '', width: 15, height: 15, decoding: 'async' }),
    el('span', { class: 'visually-hidden', text: ' quest points' }),
  ]);

/** Four small squares — a drawn glyph for the grid view. */
export function gridIcon() {
  const svg = svgEl('svg', { class: 'toggle-icon', viewBox: '0 0 18 18', 'aria-hidden': 'true', focusable: 'false' });
  svg.append(
    svgEl('rect', { x: 1.5, y: 1.5, width: 6.5, height: 6.5, rx: 1 }),
    svgEl('rect', { x: 10, y: 1.5, width: 6.5, height: 6.5, rx: 1 }),
    svgEl('rect', { x: 1.5, y: 10, width: 6.5, height: 6.5, rx: 1 }),
    svgEl('rect', { x: 10, y: 10, width: 6.5, height: 6.5, rx: 1 }),
  );
  return svg;
}

/** A zigzag with a dot at each vertex — the line-chart view's icon. */
export function lineViewIcon() {
  const svg = svgEl('svg', { class: 'toggle-icon', viewBox: '0 0 18 18', 'aria-hidden': 'true', focusable: 'false' });
  svg.append(
    svgEl('polyline', { points: '2,14 7,6 11,10 16,3', class: 'toggle-line' }),
    ...[
      [2, 14],
      [7, 6],
      [11, 10],
      [16, 3],
    ].map(([cx, cy]) => svgEl('circle', { cx, cy, r: 1.3 })),
  );
  return svg;
}

/**
 * Grid ⇄ line chart, beside a section's title — an icon segmented control
 * shared by the Gains section and Account Standings. `views` is a list of
 * `[value, label, icon]` tuples; `label` feeds the screen-reader/title text
 * ("Show <label>"), `icon` is one of the glyph functions above.
 */
export function viewToggle(view, views, onSelectView, ariaLabel) {
  return el(
    'div',
    { class: 'gains-view-tabs', role: 'tablist', 'aria-label': ariaLabel },
    views.map(([value, label, icon]) =>
      el(
        'button',
        {
          type: 'button',
          class: `gains-view-toggle${view === value ? ' is-active' : ''}`,
          role: 'tab',
          'aria-selected': view === value ? 'true' : 'false',
          onclick: () => onSelectView(value),
          title: `Show ${label}`,
        },
        [icon(), el('span', { class: 'visually-hidden', text: `Show ${label}` })],
      ),
    ),
  );
}
