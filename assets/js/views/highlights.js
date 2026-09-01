import { el, svgEl, swatch } from '../dom.js';
import { formatNumber, formatCompact, formatWeekday } from '../format.js';
import { bindTooltip, tooltipContent } from '../tooltip.js';
import { QUEST_POINTS_ICON } from '../config.js';

/**
 * Weekly Highlights: three superlative medallions crowning whoever led
 * Levels, XP and Quest points over the rolling week — fixed to week
 * regardless of whatever period the Gains section itself is showing, the
 * same reasoning as Account Standings' line view being fixed to month (see
 * standings.js). Sits between the masthead and the Gains section (see
 * app.js), so it reads as a quick "who's winning" glance before the
 * detailed bands below — styled as three small trophy plaques rather than
 * another row of leaderboard-style cards, since this section alone is
 * naming *champions*, not relaying figures.
 *
 * All three badges are decided the same simple way (app.js's own
 * computeHighlights): whoever ended the week with the single biggest total —
 * Ranker on levels gained, Grind King on xp gained, Quest God on quest
 * points gained. Every badge's hover tooltip also breaks the winner's gain
 * down by the last 7 UTC calendar days (see computeDailyBreakdown in
 * compute.js), so a viewer can see which days actually built that total.
 */

/** The section header's own mark — a five-point star, distinct from any of
 * the three medallion icons below (crownIcon, flameIcon) so nothing in this
 * section repeats its own iconography. */
function starIcon() {
  const svg = svgEl('svg', { class: 'lb-icon', viewBox: '0 0 18 18', 'aria-hidden': 'true', focusable: 'false' });
  svg.append(svgEl('polygon', { points: '9,1 11,6.5 17,7 12.5,10.8 14,17 9,13.5 4,17 5.5,10.8 1,7 7,6.5' }));
  return svg;
}

/** Ranker's own medallion glyph — a banded crown, read literally: topping
 * the levels leaderboard is the closest thing this scoreboard has to a
 * throne. */
function crownIcon() {
  const svg = svgEl('svg', { class: 'highlight-medal-icon', viewBox: '0 0 18 18', 'aria-hidden': 'true', focusable: 'false' });
  svg.append(
    svgEl('polygon', { points: '2,12 2,6 5.5,9.5 9,3 12.5,9.5 16,6 16,12' }),
    svgEl('rect', { x: 2, y: 12, width: 14, height: 2.6, rx: 0.6 }),
  );
  return svg;
}

/** Grind King's own medallion glyph — a flame, the most literal read of
 * "grinding" this side of an actual forge. */
function flameIcon() {
  const svg = svgEl('svg', { class: 'highlight-medal-icon', viewBox: '0 0 18 18', 'aria-hidden': 'true', focusable: 'false' });
  svg.append(
    svgEl('path', {
      d: 'M9,1.8 C6.7,5.1 5,7.6 5,10.6 C5,14 6.7,16.4 9,16.4 C11.3,16.4 13,14 13,10.6 C13,8.7 12,7.2 10.8,5.9 C11.1,7.5 10.1,8.4 9.3,7.7 C9.9,5.8 9.7,3.4 9,1.8 Z',
    }),
  );
  return svg;
}

/** Quest God's own medallion — the game's own quest-points icon rather than
 * a drawn glyph (same reasoning questPointsMark, gains-shared.js, already
 * follows): there's a real in-game asset for this one, so borrow it instead
 * of inventing an abstract stand-in the way Ranker/Grind King have to. */
function questPointsIconLarge() {
  return el('img', { class: 'highlight-medal-icon is-photo', src: QUEST_POINTS_ICON, alt: '', width: 22, height: 22, decoding: 'async' });
}

const BADGES = [
  { key: 'level', label: 'Ranker', formatValue: formatNumber, unit: '', icon: crownIcon },
  { key: 'xp', label: 'Grind King', formatValue: formatCompact, unit: ' xp', icon: flameIcon },
  { key: 'quests', label: 'Quest God', formatValue: formatNumber, unit: ' qp', icon: questPointsIconLarge },
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
 * One medallion — an icon plaque (badge.icon) ringed in the winner's own
 * colour, the category name beneath it, then who won and by how much: a
 * small trophy card rather than a leaderboard-style row, since this section
 * alone exists to name a champion rather than relay a figure. `entry` is
 * `{ winner, breakdown }` — `winner` is `{ player, value }` (app.js's own
 * topWeeklyGainer), or null when nobody has a claim on that badge this week
 * (nobody gained anything), in which case the medallion stays a muted,
 * ringless shell and has no tooltip.
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
      el('div', { class: 'highlight-medal' }, [icon()]),
      el('p', { class: 'highlight-label', text: label }),
      winner
        ? el('p', { class: 'highlight-answer' }, [swatch(winner.player.colour), el('span', { class: 'highlight-name', text: winner.player.name })])
        : el('p', { class: 'highlight-answer' }, [el('span', { class: 'highlight-name', text: 'No gains yet' })]),
      winner ? el('p', { class: 'highlight-value', text: `+${formatValue(winner.value)}` }) : null,
    ],
  );

  if (!winner) return node;

  return bindTooltip(node, () =>
    tooltipContent(winner.player.name, [[`${label} this week`, `+${formatValue(winner.value)}${unit}`]], winner.player.colour, dailyBreakdownExtra(breakdown, formatValue)),
  );
}

/** @param highlights [{ key, winner, breakdown }], one per HIGHLIGHT_METRICS
 *   entry, in that same order — see app.js's computeHighlights. */
export function renderHighlights(highlights) {
  return el('section', { class: 'lb highlights' }, [
    el('div', { class: 'lb-head' }, [el('h2', {}, [starIcon(), el('span', { text: 'Weekly highlights' })])]),
    el(
      'div',
      { class: 'highlights-row' },
      highlights.map((entry, index) => badge(BADGES[index], entry)),
    ),
  ]);
}
