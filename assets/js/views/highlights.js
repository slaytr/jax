import { el, svgEl, swatch } from '../dom.js';
import { formatNumber, formatCompact, formatWeekday } from '../format.js';
import { bindTooltip, tooltipContent } from '../tooltip.js';
import { questPointsIcon } from './gains-shared.js';

/**
 * Weekly Highlights: three superlative badges crowning whoever led Levels,
 * XP and Quest points over the rolling week — fixed to week regardless of
 * whatever period the Gains section itself is showing, the same reasoning
 * as Account Standings' line view being fixed to month (see standings.js).
 * Sits between the masthead and the Gains section (see app.js), so it reads
 * as a quick "who's winning" glance before the detailed bands below.
 *
 * Hovering a badge breaks its winner's gain down by the last 7 UTC calendar
 * days (see computeDailyBreakdown in compute.js), so the headline total
 * isn't the only thing on offer — a big weekly number earned in one binge
 * session reads very differently from the same number spread evenly.
 */

/** A drawn glyph: "weekly highlights" has no game asset to borrow. */
function crownIcon() {
  const svg = svgEl('svg', { class: 'lb-icon', viewBox: '0 0 18 18', 'aria-hidden': 'true', focusable: 'false' });
  svg.append(svgEl('polygon', { points: '9,1 11,6.5 17,7 12.5,10.8 14,17 9,13.5 4,17 5.5,10.8 1,7 7,6.5' }));
  return svg;
}

/** Reuses the matrix's own "Total level" icon rather than inventing a second one. */
const levelsIcon = () =>
  el('img', { class: 'highlight-icon', src: 'assets/icons/stats.png', alt: '', width: 16, height: 16, decoding: 'async' });

/** A drawn flame — "grinding" (XP) has no game asset to borrow either. */
function flameIcon() {
  const svg = svgEl('svg', { class: 'highlight-icon highlight-icon-svg', viewBox: '0 0 18 18', 'aria-hidden': 'true', focusable: 'false' });
  svg.append(
    svgEl('path', {
      d: 'M9 1c1.6 2.7-.7 4-.7 6.3 0 1.1.8 1.9 1.8 1.9s1.6-.7 1.6-1.6c1.7 1.5 2.8 3.6 2.8 5.5 0 3.1-2.4 5-5.5 5s-5.5-2-5.5-5c0-3.9 3.2-6.3 5.5-12.1z',
    }),
  );
  return svg;
}

const BADGES = [
  { key: 'level', label: 'Most Levels', formatValue: formatNumber, unit: '', icon: levelsIcon },
  { key: 'xp', label: 'Grind King', formatValue: formatCompact, unit: ' xp', icon: flameIcon },
  { key: 'quests', label: 'Quest God', formatValue: formatNumber, unit: ' qp', icon: questPointsIcon },
];

/** The metric keys, in the order `renderHighlights` expects — app.js builds
 * its `highlights` array in this same order so the two zip up by index. */
export const HIGHLIGHT_METRICS = BADGES.map((badge) => badge.key);

/** The hover tooltip's extra section: that day's gain for each of the last 7
 * UTC calendar days, oldest first. A day predating the group's own tracking
 * history reports `gained: null` (see computeDailyBreakdown) and reads as "—". */
function dailyBreakdownExtra(breakdown, formatValue) {
  if (!breakdown.length) return null;

  return el('div', { class: 'tooltip-daily' }, [
    el('p', { class: 'tooltip-daily-label', text: 'Daily breakdown' }),
    el(
      'dl',
      { class: 'tooltip-rows' },
      breakdown.flatMap((day) => [
        el('dt', { text: formatWeekday(day.dayStart) }),
        el('dd', { text: day.gained === null ? '—' : `+${formatValue(day.gained)}` }),
      ]),
    ),
  ]);
}

/**
 * One badge. `entry` is `{ winner: { player, value } | null, breakdown }` —
 * `winner` is null when nobody gained anything in that metric this week, in
 * which case the badge shows a muted placeholder and has no tooltip (there's
 * nothing to break down).
 */
function badge({ label, formatValue, unit, icon }, entry) {
  const { winner, breakdown } = entry;

  const node = el(
    'div',
    {
      class: `highlight-badge${winner ? '' : ' is-empty'}`,
      style: winner ? { '--accent': winner.player.colour } : {},
      tabindex: winner ? '0' : null,
    },
    [
      icon(),
      el('div', { class: 'highlight-body' }, [
        el('p', { class: 'highlight-label', text: label }),
        el(
          'p',
          { class: 'highlight-name' },
          winner ? [swatch(winner.player.colour), el('span', { text: winner.player.name })] : [el('span', { text: 'No gains yet' })],
        ),
      ]),
    ],
  );

  if (!winner) return node;

  return bindTooltip(node, () =>
    tooltipContent(
      winner.player.name,
      [[`${label} this week`, `+${formatValue(winner.value)}${unit}`]],
      winner.player.colour,
      dailyBreakdownExtra(breakdown, formatValue),
    ),
  );
}

/** @param highlights [{ key, winner, breakdown }], one per HIGHLIGHT_METRICS
 *   entry, in that same order — see app.js's computeHighlights. */
export function renderHighlights(highlights) {
  return el('section', { class: 'lb highlights' }, [
    el('div', { class: 'lb-head' }, [el('h2', {}, [crownIcon(), el('span', { text: 'Weekly highlights' })])]),
    el(
      'div',
      { class: 'highlights-row' },
      highlights.map((entry, index) => badge(BADGES[index], entry)),
    ),
  ]);
}
