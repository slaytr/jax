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
 * single biggest total (see computeDailyLeaderCounts in compute.js) — the
 * figure shown beside their name is still that weekly total (`winner.total`),
 * same as Quest God's, but it's a supporting stat rather than the reason
 * they won; two players could show the same total with different day-counts
 * deciding between them. The hover tooltip's summary row spells this out
 * (`totalLabel`, e.g. "Total XP gained"). Quest God (`mode: 'total'`) is
 * decided by, and shows, the week's raw total directly, since RuneMetrics-
 * sourced quest data is too sparse day-to-day for a daily-leader count to
 * mean much.
 *
 * Every badge's hover tooltip also breaks the winner's gain down by the last
 * 7 UTC calendar days (see computeDailyBreakdown in compute.js) — for the
 * daily-leader badges that's *why* they're leading, not just a total.
 */

/** A drawn glyph: "weekly highlights" has no game asset to borrow. */
function crownIcon() {
  const svg = svgEl('svg', { class: 'lb-icon', viewBox: '0 0 18 18', 'aria-hidden': 'true', focusable: 'false' });
  svg.append(svgEl('polygon', { points: '9,1 11,6.5 17,7 12.5,10.8 14,17 9,13.5 4,17 5.5,10.8 1,7 7,6.5' }));
  return svg;
}

const BADGES = [
  { key: 'level', label: 'Ranker', mode: 'days', formatValue: formatNumber, unit: '', totalLabel: 'Total levels gained' },
  { key: 'xp', label: 'Grind King', mode: 'days', formatValue: formatCompact, unit: ' xp', totalLabel: 'Total XP gained' },
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
 * One badge, reading literally as "Grind King: PlayerName +8.03M" — a plain
 * bold number beside the name, in the same voice as Account Standings' own
 * headline totals (.lb-value), not the small green gain chip used elsewhere,
 * since here the number is the whole point of the badge rather than a
 * secondary annotation beside a bigger total. For `mode: 'total'` (Quest
 * God) that number is `winner.value`, the figure the badge was decided by;
 * for `mode: 'days'` (Ranker/Grind King) it's `winner.total`, the winner's
 * weekly total — a supporting stat, since day-count (not this total) is what
 * actually decided the badge. Only `mode: 'total'` gets a `valueIcon` beside
 * its figure (Quest God's game icon); the other two have none.
 *
 * `entry` is `{ winner, breakdown }` — `winner` is `{ player, value }` for a
 * `'total'` badge or `{ player, days, of, total }` for a `'days'` one, or
 * null when nobody has a claim on that badge this week (nobody gained
 * anything, or every day was a tie), in which case the badge shows a muted
 * placeholder and has no tooltip.
 */
function badge({ label, mode, formatValue, unit, valueIcon, totalLabel }, entry) {
  const { winner, breakdown } = entry;

  const valueNode = winner
    ? el('span', { class: 'highlight-value' }, [
        `+${formatValue(mode === 'total' ? winner.value : winner.total)}`,
        mode === 'total' && valueIcon ? valueIcon() : null,
      ])
    : null;

  // Split into two groups — "Ranker:" and "🔵 PlayerName +142" — rather than
  // five flat siblings, so a narrow layout can stack them onto their own
  // lines (see the mobile breakpoint in styles.css) without changing this
  // markup: at desktop widths the two groups just sit inline next to each
  // other, reading exactly as one line.
  const node = el(
    'div',
    {
      class: `highlight-badge${winner ? '' : ' is-empty'}`,
      style: winner ? { '--accent': winner.player.colour } : {},
      tabindex: winner ? '0' : null,
    },
    [
      el('p', { class: 'highlight-text' }, [
        el('span', { class: 'highlight-title' }, [
          el('span', { class: 'highlight-label', text: label }),
          el('span', { class: 'highlight-sep', text: ':' }),
        ]),
        el(
          'span',
          { class: 'highlight-answer' },
          winner
            ? [swatch(winner.player.colour), el('span', { class: 'highlight-name', text: winner.player.name })]
            : [el('span', { class: 'highlight-name', text: 'No gains yet' })],
        ),
        // Pinned to the card's far edge with margin-left: auto (see
        // .highlight-value) rather than nested inside .highlight-answer,
        // so the figure reads as its own right-hand column instead of
        // trailing the name.
        valueNode,
      ]),
    ],
  );

  if (!winner) return node;

  const summaryRow =
    mode === 'days' ? [totalLabel, `+${formatValue(winner.total)}${unit}`] : [`${label} this week`, `+${formatValue(winner.value)}${unit}`];

  return bindTooltip(node, () =>
    tooltipContent(winner.player.name, [summaryRow], winner.player.colour, dailyBreakdownExtra(breakdown, formatValue)),
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
