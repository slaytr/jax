import { el, svgEl } from '../dom.js';
import { formatCompact, formatNumber, formatRank } from '../format.js';
import { standings, questStandings } from '../compute.js';
import { bindTooltip, tooltipContent } from '../tooltip.js';
import { entry, band, questPointsIcon } from './leaderboards.js';

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

function levelRow(row) {
  const node = entry({
    player: row.player,
    place: row.place,
    value: formatNumber(row.player.total?.level ?? 0),
    ribbon: row.place === 5 ? 'Trying' : null,
  });

  return bindTooltip(node, () =>
    tooltipContent(
      row.player.name,
      [
        ['Total level', formatNumber(row.player.total?.level)],
        ['Total experience', `${formatNumber(row.player.total?.xp)} xp`],
        ['Overall rank', formatRank(row.player.total?.rank)],
      ],
      row.player.colour,
    ),
  );
}

function xpRow(row) {
  const node = entry({
    player: row.player,
    place: row.place,
    value: formatCompact(row.player.total?.xp ?? 0),
    ribbon: row.place === 5 ? 'Trying' : null,
  });

  return bindTooltip(node, () =>
    tooltipContent(
      row.player.name,
      [
        ['Total experience', `${formatNumber(row.player.total?.xp)} xp`],
        ['Overall rank', formatRank(row.player.total?.rank)],
      ],
      row.player.colour,
    ),
  );
}

function questRow(row) {
  const { player } = row;
  const known = Number.isFinite(player.questPoints);

  const node = entry({
    player,
    place: row.place,
    value: known ? formatNumber(player.questPoints) : '—',
    sub: known ? null : 'unavailable',
    ribbon: row.place === 5 ? 'Trying' : null,
  });

  return bindTooltip(node, () =>
    tooltipContent(
      player.name,
      [
        ['Quest points', known ? formatNumber(player.questPoints) : 'unavailable'],
        ['Quests complete', Number.isFinite(player.questsComplete) ? formatNumber(player.questsComplete) : '—'],
        ['Source', player.questsStale ? 'cached — RuneMetrics unavailable' : 'RuneMetrics'],
      ],
      player.colour,
    ),
  );
}

export function renderStandings(state) {
  return el('section', { class: 'lb' }, [
    el('div', { class: 'lb-head' }, [
      el('h2', {}, [podiumIcon(), el('span', { text: 'Account standings' })]),
      el('p', { class: 'lb-note', text: 'Ranked highest first.' }),
    ]),
    el('div', { class: 'lb-stack' }, [
      band('Total levels', standings(state.players, 'level').map(levelRow)),
      band('Total XP', standings(state.players, 'xp').map(xpRow)),
      band(questPointsIcon(), questStandings(state.players).map(questRow)),
    ]),
  ]);
}
