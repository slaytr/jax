import { el, svgEl, swatch } from '../dom.js';
import { formatNumber, formatCompact, formatWeekday } from '../format.js';
import { bindTooltip, tooltipContent } from '../tooltip.js';
import { questPointsMark } from './gains-shared.js';

/**
 * Weekly Highlights: three superlative badges crowning whoever led Levels,
 * XP and Quest points over the rolling week — fixed to week regardless of
 * whatever period the Gains section itself is showing, the same reasoning
 * as Account Standings' line view being fixed to month (see standings.js).
 * Sits between the masthead and the Gains section (see app.js), so it reads
 * as a quick "who's winning" glance before the detailed bands below.
 *
 * Ranker and Grind King (`mode: 'days'`) crown whoever finished #1 on the
 * most individual days this week, not whoever ended the week with the
 * single biggest total (see computeDailyLeaderCounts in compute.js) — so
 * they show no figure of their own beside the name, just who's leading and,
 * on hover, how many days and which ones. Quest God (`mode: 'total'`) is
 * still the week's raw total and does show one, since RuneMetrics-sourced
 * quest data is too sparse day-to-day for a daily-leader count to mean much.
 *
 * Every badge's hover tooltip still breaks the winner's gain down by the
 * last 7 UTC calendar days (see computeDailyBreakdown in compute.js) — for
 * the daily-leader badges that's *why* they're leading, not just a total.
 */

/** A drawn glyph: "weekly highlights" has no game asset to borrow. */
function crownIcon() {
  const svg = svgEl('svg', { class: 'lb-icon', viewBox: '0 0 18 18', 'aria-hidden': 'true', focusable: 'false' });
  svg.append(svgEl('polygon', { points: '9,1 11,6.5 17,7 12.5,10.8 14,17 9,13.5 4,17 5.5,10.8 1,7 7,6.5' }));
  return svg;
}

const BADGES = [
  { key: 'level', label: 'Ranker', mode: 'days', formatValue: formatNumber, unit: '' },
  { key: 'xp', label: 'Grind King', mode: 'days', formatValue: formatCompact, unit: ' xp' },
  { key: 'quests', label: 'Quest God', mode: 'total', formatValue: formatNumber, unit: ' qp', valueIcon: questPointsMark },
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
 * One badge. In `mode: 'total'` it reads literally as "Quest God: PlayerName
 * +23" — a plain bold number, in the same voice as Account Standings' own
 * headline totals (.lb-value), not the small green gain chip used elsewhere,
 * since here the number is the whole point of the badge rather than a
 * secondary annotation beside a bigger total. In `mode: 'days'` there's no
 * number beside the name at all ("Grind King: PlayerName") — the win is a
 * count of daily #1 finishes, not a total, so a figure there would read as
 * one when it isn't; the count only shows up in the hover tooltip.
 *
 * `entry` is `{ winner, breakdown }` — `winner` is `{ player, value }` for a
 * `'total'` badge or `{ player, days, of }` for a `'days'` one, or null when
 * nobody has a claim on that badge this week (nobody gained anything, or
 * every day was a tie), in which case the badge shows a muted placeholder
 * and has no tooltip.
 */
function badge({ label, mode, formatValue, unit, valueIcon }, entry) {
  const { winner, breakdown } = entry;

  const valueNode =
    winner && mode === 'total'
      ? el('span', { class: 'highlight-value' }, [`+${formatValue(winner.value)}`, valueIcon ? valueIcon() : null])
      : null;

  const node = el(
    'div',
    {
      class: `highlight-badge${winner ? '' : ' is-empty'}`,
      style: winner ? { '--accent': winner.player.colour } : {},
      tabindex: winner ? '0' : null,
    },
    [
      el('p', { class: 'highlight-text' }, [
        el('span', { class: 'highlight-label', text: label }),
        el('span', { class: 'highlight-sep', text: ':' }),
        ...(winner
          ? [swatch(winner.player.colour), el('span', { class: 'highlight-name', text: winner.player.name }), valueNode]
          : [el('span', { class: 'highlight-name', text: 'No gains yet' })]),
      ]),
    ],
  );

  if (!winner) return node;

  const summary = mode === 'days' ? `${winner.days} of ${winner.of} days` : `+${formatValue(winner.value)}${unit}`;

  return bindTooltip(node, () =>
    tooltipContent(
      winner.player.name,
      [[`${label} this week`, summary]],
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
