import { el, svgEl } from '../dom.js';
import { formatCompact, formatNumber, formatRank } from '../format.js';
import { standings, questStandings } from '../compute.js';
import { MAX_TOTAL_LEVEL, MAX_QUEST_POINTS } from '../config.js';
import { bindTooltip, tooltipContent } from '../tooltip.js';
import { entry, gainChip } from './leaderboards.js';
import { band, questPointsIcon, gridIcon, lineViewIcon, viewToggle } from './gains-shared.js';
import { renderStandingsLines } from './gains-line.js';

/** Grid ⇄ line chart — Account Standings only offers these two (no bar
 * chart: a single period's total per player has no "over time" story that a
 * bar adds beyond the grid's own per-row share bar). */
const VIEWS = [
  ['grid', 'the grid', gridIcon],
  ['line', 'line charts', lineViewIcon],
];

/** Screen-reader qualifier for the gain chip, matching the Gains section's own wording. */
const PERIOD_LABEL = { day: 'today', week: 'this week', month: 'this month' };

/** slug → gain, from a Gains band's rows (levels/xp use `total`, quests use `gained`). */
const gainsBySlug = (rows, key) => Object.fromEntries(rows.map((row) => [row.player.slug, row[key]]));

/** A drawn glyph: "standings" has no game asset to borrow, same reasoning as graphIcon. */
function podiumIcon() {
  const svg = svgEl('svg', { class: 'lb-icon', viewBox: '0 0 18 18', 'aria-hidden': 'true', focusable: 'false' });
  svg.append(
    svgEl('rect', { x: 1, y: 9.5, width: 4.5, height: 6.5, class: 'podium-block podium-second' }),
    svgEl('rect', { x: 6.75, y: 4.5, width: 4.5, height: 11.5, class: 'podium-block podium-first' }),
    svgEl('rect', { x: 12.5, y: 11.5, width: 4.5, height: 4.5, class: 'podium-block podium-third' }),
  );
  return svg;
}

/**
 * Account totals: total level, total xp and quest points. Unlike the gains
 * bands above, these are different metrics rather than different windows of
 * the same one — so each is its own band, sharing the leaderboard chrome
 * from renderLeaderboards.
 */

function levelRow(row, selectedPlayer, onSelectPlayer, gained, periodLabel, animate) {
  const node = entry({
    player: row.player,
    place: row.place,
    value: formatNumber(row.player.total?.level ?? 0),
    gain: gained > 0 ? gainChip(`+${formatNumber(gained)}`, `levels gained ${periodLabel}`) : null,
    share: (row.player.total?.level ?? 0) / MAX_TOTAL_LEVEL,
    ribbon: row.place === 5 ? 'Trying' : null,
    selected: row.player.slug === selectedPlayer,
    onSelect: onSelectPlayer,
    animate,
  });

  return bindTooltip(node, () =>
    tooltipContent(
      row.player.name,
      [
        ['Total level', formatNumber(row.player.total?.level)],
        ['Total experience', `${formatNumber(row.player.total?.xp)} xp`],
        ['Overall rank', formatRank(row.player.total?.rank)],
        [`Levels gained ${periodLabel}`, gained > 0 ? `+${formatNumber(gained)}` : 'none'],
      ],
      row.player.colour,
    ),
  );
}

function xpRow(row, selectedPlayer, onSelectPlayer, gained, periodLabel, maxXp, animate) {
  const node = entry({
    player: row.player,
    place: row.place,
    value: formatCompact(row.player.total?.xp ?? 0),
    gain: gained > 0 ? gainChip(`+${formatCompact(gained)}`, `xp gained ${periodLabel}`) : null,
    share: maxXp > 0 ? (row.player.total?.xp ?? 0) / maxXp : 0,
    ribbon: row.place === 5 ? 'Trying' : null,
    selected: row.player.slug === selectedPlayer,
    onSelect: onSelectPlayer,
    animate,
  });

  return bindTooltip(node, () =>
    tooltipContent(
      row.player.name,
      [
        ['Total experience', `${formatNumber(row.player.total?.xp)} xp`],
        ['Overall rank', formatRank(row.player.total?.rank)],
        [`XP gained ${periodLabel}`, gained > 0 ? `+${formatNumber(gained)} xp` : 'none'],
      ],
      row.player.colour,
    ),
  );
}

function questRow(row, selectedPlayer, onSelectPlayer, gained, periodLabel, animate) {
  const { player } = row;
  const known = Number.isFinite(player.questPoints);

  const node = entry({
    player,
    place: row.place,
    value: known ? formatNumber(player.questPoints) : '—',
    gain: gained > 0 ? gainChip(`+${formatNumber(gained)}`, `quest points gained ${periodLabel}`) : null,
    share: known ? player.questPoints / MAX_QUEST_POINTS : 0,
    sub: known ? null : 'unavailable',
    ribbon: row.place === 5 ? 'Trying' : null,
    selected: player.slug === selectedPlayer,
    onSelect: onSelectPlayer,
    animate,
  });

  return bindTooltip(node, () =>
    tooltipContent(
      player.name,
      [
        ['Quest points', known ? formatNumber(player.questPoints) : 'unavailable'],
        ['Quests complete', Number.isFinite(player.questsComplete) ? formatNumber(player.questsComplete) : '—'],
        ['Source', player.questsStale ? 'cached — RuneMetrics unavailable' : 'RuneMetrics'],
        [`Quest points gained ${periodLabel}`, gained > 0 ? `+${formatNumber(gained)}` : 'none'],
      ],
      player.colour,
    ),
  );
}

/**
 * @param gains { levels, xp, quests } from computeAllGains — mined for
 *   gainsPeriod's window, so each standings row can carry that same period's
 *   gain as a chip.
 * @param gainsPeriod 'day' | 'week' | 'month' — whichever window the Gains
 *   section is currently showing (its grid and line views each track their
 *   own, see app.js's currentGainsPeriod), so the chip mirrors what's visible
 *   in the Gains section directly above.
 * @param onSelectPlayer (slug) => void — toggles state.standingsSelectedPlayer,
 *   read here to tint every cell of the selected player across all three bands.
 * @param view 'grid' | 'line' — which body renders below the shared header.
 *   Ignored (grid stays visible) unless explicitly 'line'.
 * @param onSelectView (view) => void
 * @param previousView whatever view was active on the *previous* render, or
 *   null on the very first — grid's share bars fill from empty (see
 *   `entry`'s `animate`) only when the grid is newly appearing (first render,
 *   or switching in from line view), not on every re-render (a player
 *   selection or a Gains period tab click shouldn't replay the fill). The
 *   very first render (`previousView` null) fills 'delayed', since the whole
 *   panel is still rising in at that point (see `shareBar`'s `PANEL_RISE_MS`);
 *   switching in from line view fills 'immediate', since nothing else on
 *   screen is still moving by then.
 */
export function renderStandings(state, gains, gainsPeriod, onSelectPlayer, view, onSelectView, previousView) {
  const selectedPlayer = state.standingsSelectedPlayer;
  const period = gainsPeriod;
  const periodLabel = PERIOD_LABEL[period];
  const animateBars =
    view !== 'grid' || previousView === 'grid' ? null : previousView == null ? 'delayed' : 'immediate';

  const levelGains = gainsBySlug(gains.levels[period].rows, 'total');
  const xpGains = gainsBySlug(gains.xp[period].rows, 'total');
  const questGains = gainsBySlug(gains.quests[period].rows, 'gained');
  const maxXp = Math.max(...state.players.map((player) => player.total?.xp ?? 0), 0);

  const body =
    view === 'line'
      ? // Fixed to month, not `period` — Standings has no Day/Week/Month tabs of
        // its own (that toggle lives in Gains and only drives the grid's gain
        // chips here), and a month of history reads better as a totals trend
        // than a single day's near-flat line.
        renderStandingsLines(gains, 'month')
      : el('div', { class: 'lb-stack' }, [
          band(
            'Total levels',
            standings(state.players, 'level').map((row) =>
              levelRow(row, selectedPlayer, onSelectPlayer, levelGains[row.player.slug] ?? 0, periodLabel, animateBars),
            ),
          ),
          band(
            'Total XP',
            standings(state.players, 'xp').map((row) =>
              xpRow(row, selectedPlayer, onSelectPlayer, xpGains[row.player.slug] ?? 0, periodLabel, maxXp, animateBars),
            ),
          ),
          band(
            questPointsIcon(),
            questStandings(state.players).map((row) =>
              questRow(row, selectedPlayer, onSelectPlayer, questGains[row.player.slug] ?? 0, periodLabel, animateBars),
            ),
          ),
        ]);

  return el('section', { class: 'lb' }, [
    el('div', { class: 'lb-head' }, [
      el('div', { class: 'lb-title' }, [
        el('h2', {}, [podiumIcon(), el('span', { text: 'Account standings' })]),
        viewToggle(view, VIEWS, onSelectView, 'Standings view'),
      ]),
    ]),
    body,
  ]);
}
