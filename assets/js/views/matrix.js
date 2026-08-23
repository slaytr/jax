import { el, swatch } from '../dom.js';
import { formatNumber, formatRank } from '../format.js';
import { buildMatrix, buildQuestRow, leaderCounts } from '../compute.js';
import { iconFor } from '../config.js';
import { bindTooltip, tooltipContent } from '../tooltip.js';

/**
 * The primary view: every skill level, side by side, one column per player.
 *
 * Cells show the level only — experience and rank live in the hover tooltip, so
 * all 30 rows stay legible without a second control to operate.
 */

function matrixCell(cell, skill, levelsGained) {
  const node = el(
    'td',
    {
      class: `cell${cell.isLeader ? ' is-leader' : ''}${cell.xp === 0 ? ' is-empty' : ''}`,
      style: { '--accent': cell.player.colour },
      tabindex: '0',
    },
    [
      el('span', { class: 'cell-figures' }, [
        el('span', { class: 'cell-primary', text: formatNumber(cell.level) }),
        // Levels gained in the last day, beside the level itself.
        levelsGained > 0
          ? el('span', { class: 'chip-up cell-gain' }, [
              el('span', { text: `+${levelsGained}` }),
              el('span', { class: 'visually-hidden', text: ' levels gained today' }),
            ])
          : null,
      ]),
      el('span', { class: 'cell-rule', role: 'presentation' }, [
        el('span', { class: 'cell-rule-fill', style: { width: `${(cell.share * 100).toFixed(1)}%` } }),
      ]),
      cell.isLeader ? el('span', { class: 'visually-hidden', text: ' — group leader' }) : null,
    ],
  );

  return bindTooltip(node, () =>
    tooltipContent(
      `${cell.player.name} · ${skill.name}`,
      [
        ['Level', `${formatNumber(cell.level)} / ${skill.max}`],
        ['Levels today', levelsGained > 0 ? `+${levelsGained}` : 'none'],
        ['Experience', `${formatNumber(cell.xp)} xp`],
        ['Rank', formatRank(cell.rank)],
        ['Group', cell.isLeader ? 'Leading this skill' : '—'],
      ],
      cell.player.colour,
    ),
  );
}

/** Quest points: a single figure per player, with no level/xp/rank behind it. */
function questCell(cell) {
  const node = el(
    'td',
    {
      class: `cell${cell.isLeader ? ' is-leader' : ''}${cell.points ? '' : ' is-empty'}`,
      style: { '--accent': cell.player.colour },
      tabindex: '0',
    },
    [
      el('span', { class: 'cell-figures' }, [
        el('span', { class: 'cell-primary', text: cell.points === null ? '—' : formatNumber(cell.points) }),
      ]),
      el('span', { class: 'cell-rule', role: 'presentation' }, [
        el('span', { class: 'cell-rule-fill', style: { width: `${(cell.share * 100).toFixed(1)}%` } }),
      ]),
      cell.isLeader ? el('span', { class: 'visually-hidden', text: ' — group leader' }) : null,
    ],
  );

  return bindTooltip(node, () =>
    tooltipContent(
      `${cell.player.name} · Quest points`,
      [
        ['Quest points', cell.points === null ? 'unavailable' : formatNumber(cell.points)],
        ['Quests complete', cell.questsComplete === null ? '—' : formatNumber(cell.questsComplete)],
        ['Source', cell.stale ? 'cached — RuneMetrics unavailable' : 'RuneMetrics'],
      ],
      cell.player.colour,
    ),
  );
}

/**
 * Player column heading. The whole heading is a button: clicking sorts the
 * table by that account — the skills it leads first, then its level descending.
 */
function playerHead(player, leads, sortedBy, onSort) {
  const isSorted = sortedBy === player.slug;

  const button = el(
    'button',
    {
      type: 'button',
      class: 'player-sort',
      onclick: () => onSort(isSorted ? null : player.slug),
      title: isSorted ? 'Clear sorting' : `Sort by ${player.name}'s best skills`,
    },
    [
      el('span', { class: 'player-name' }, [swatch(player.colour), el('span', { text: player.name })]),
      el('span', { class: `player-leads${leads > 0 ? ' has-leads' : ''}` }, [
        el('span', { 'aria-hidden': 'true', text: '★' }),
        el('span', { 'aria-hidden': 'true', text: formatNumber(leads) }),
        el('span', { class: 'visually-hidden', text: `Leads ${formatNumber(leads)} rows` }),
      ]),
      // No visual sort marker: the highlighted column carries it, and aria-sort
      // on the th announces it.
    ],
  );

  return el(
    'th',
    {
      class: `player-head${isSorted ? ' is-sorted' : ''}`,
      scope: 'col',
      style: { '--accent': player.colour },
      'aria-sort': isSorted ? 'descending' : 'none',
    },
    [button, player.stale ? el('span', { class: 'visually-hidden', text: ' (cached data)' }) : null],
  );
}

const skillHead = (skill) =>
  el('th', { scope: 'row', class: 'skill-head' }, [
    el('img', {
      class: 'skill-icon',
      src: iconFor(skill),
      alt: '',
      width: 18,
      height: 18,
      loading: 'lazy',
      decoding: 'async',
    }),
    el('span', { class: 'skill-name', text: skill.name }),
  ]);

/**
 * Totals row: each account's overall level, presented exactly like a skill row.
 * Experience is in the tooltip rather than beside the figure.
 */
function totalsRow(players) {
  const best = Math.max(...players.map((player) => player.total?.level ?? 0), 1);

  return el('tr', { class: 'row-total' }, [
    el('th', { scope: 'row', class: 'skill-head' }, [
      el('img', { class: 'skill-icon', src: 'assets/icons/stats.png', alt: '', width: 18, height: 18, decoding: 'async' }),
      el('span', { class: 'skill-name', text: 'Total' }),
    ]),
    ...players.map((player) => {
      const level = player.total?.level ?? 0;
      const node = el('td', { class: 'cell', style: { '--accent': player.colour }, tabindex: '0' }, [
        el('span', { class: 'cell-figures' }, [el('span', { class: 'cell-primary', text: formatNumber(level) })]),
        el('span', { class: 'cell-rule', role: 'presentation' }, [
          el('span', { class: 'cell-rule-fill', style: { width: `${((level / best) * 100).toFixed(1)}%` } }),
        ]),
      ]);

      return bindTooltip(node, () =>
        tooltipContent(
          player.name,
          [
            ['Total level', formatNumber(player.total?.level)],
            ['Total experience', `${formatNumber(player.total?.xp)} xp`],
            ['Overall rank', formatRank(player.total?.rank)],
          ],
          player.colour,
        ),
      );
    }),
  ]);
}

/**
 * Sorts rows for one account: the skills it leads first, then its own level
 * high to low. Ties fall back to experience so the order is stable.
 */
function sortRowsFor(rows, slug) {
  const cellFor = (row) => row.cells.find((cell) => cell.player.slug === slug);

  return [...rows].sort((a, b) => {
    const left = cellFor(a);
    const right = cellFor(b);
    if (!left || !right) return 0;
    return Number(right.isLeader) - Number(left.isLeader) || right.level - left.level || right.xp - left.xp;
  });
}

export function renderMatrix(state, levelGains, onSort) {
  const { players, sortedBy } = state;

  const skillRows = buildMatrix(players, 'level');
  const questRow = buildQuestRow(players);
  const leads = leaderCounts([...skillRows, questRow]);
  const ordered = sortedBy ? sortRowsFor(skillRows, sortedBy) : skillRows;

  const gainFor = (slug, skillId) => levelGains.bySlug[slug]?.bySkill?.[skillId] ?? 0;

  const table = el('table', { class: 'matrix' }, [
    el('caption', {
      class: 'visually-hidden',
      text: 'Every RuneScape 3 skill level by player, plus quest points and totals. The group leader is marked in each row.',
    }),
    el('thead', {}, [
      el('tr', {}, [
        el('th', { class: 'corner', scope: 'col' }, [el('span', { text: 'Skill' })]),
        ...players.map((player) => playerHead(player, leads[player.slug] ?? 0, sortedBy, onSort)),
      ]),
    ]),
    el('tbody', {}, [
      ...ordered.map((row) =>
        el('tr', {}, [
          skillHead(row.skill),
          ...row.cells.map((cell) => matrixCell(cell, row.skill, gainFor(cell.player.slug, row.skill.id))),
        ]),
      ),
      el('tr', { class: 'row-quests' }, [skillHead(questRow.skill), ...questRow.cells.map(questCell)]),
      totalsRow(players),
    ]),
  ]);

  return el('section', { class: 'matrix-section' }, [
    el('div', { class: 'matrix-head' }, [
      el('h2', { text: 'Skill matrix' }),
      el('p', {
        class: 'matrix-note',
        text: sortedBy
          ? `Sorted by ${players.find((p) => p.slug === sortedBy)?.name ?? ''} — click the column again to reset.`
          : 'Click a player column to sort by their best skills. Hover a cell for experience and rank.',
      }),
    ]),
    el('div', { class: 'matrix-scroll' }, [table]),
  ]);
}
