import { el, swatch } from '../dom.js';
import { formatNumber, formatRank } from '../format.js';
import { buildMatrix, buildTotalsRow, leaderCounts, TOTAL_MEASURE } from '../compute.js';
import { iconFor, TOTAL_LEVEL_ICON } from '../config.js';
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
        el('span', { class: 'cell-level' }, [
          el('span', { class: 'cell-primary', text: formatNumber(cell.level) }),
          cell.isLeader ? el('span', { class: 'cell-star', 'aria-hidden': 'true', text: '★' }) : null,
        ]),
        // Levels gained in the last day, pinned to the cell's far edge.
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
      ],
      cell.player.colour,
    ),
  );
}

const LEADS_STAR = () => el('span', { class: 'player-leads-star', 'aria-hidden': 'true', text: '★' });

/** Melooms alone gets the five-star consolation badge on a shutout — everyone
 * else's zero still reads as "★ 0". */
const CONSOLATION_STARS_SLUG = 'melooms';

/**
 * The "N leads" badge beside a player's name — normally one star and a count.
 * `gold`: whether `.has-leads` (the badge's gold colouring) should apply.
 */
function leadsBadge(player, leads) {
  if (leads === 0 && player.slug === CONSOLATION_STARS_SLUG) {
    return { nodes: [LEADS_STAR(), LEADS_STAR(), LEADS_STAR(), LEADS_STAR(), LEADS_STAR()], gold: true };
  }

  return { nodes: [LEADS_STAR(), el('span', { 'aria-hidden': 'true', text: formatNumber(leads) })], gold: leads > 0 };
}

/**
 * Player column heading. The whole heading is a button: clicking sorts the
 * table by that account — the skills it leads first, then its level descending.
 * Wording follows the invert toggle: "leads"/"best" flip to "trails"/"weakest"
 * so the header still describes what's actually highlighted.
 */
function playerHead(player, leads, sortedBy, onSort, invertLeaders) {
  const isSorted = sortedBy === player.slug;
  const verb = invertLeaders ? 'Trails' : 'Leads';
  const badge = leadsBadge(player, leads);

  const button = el(
    'button',
    {
      type: 'button',
      class: 'player-sort',
      onclick: () => onSort(isSorted ? null : player.slug),
      title: isSorted ? 'Clear sorting' : `Sort by ${player.name}'s ${invertLeaders ? 'weakest' : 'best'} skills`,
    },
    [
      el('span', { class: 'player-name' }, [swatch(player.colour), el('span', { class: 'player-name-text', text: player.name })]),
      el('span', { class: `player-leads${badge.gold ? ' has-leads' : ''}` }, [
        ...badge.nodes,
        el('span', { class: 'visually-hidden', text: `${verb} ${formatNumber(leads)} rows` }),
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

/** Flips which end of each row gets the ember highlight — strongest or weakest. */
function invertToggle(invertLeaders, onToggle) {
  return el(
    'button',
    {
      type: 'button',
      class: `matrix-invert${invertLeaders ? ' is-active' : ''}`,
      onclick: onToggle,
      'aria-pressed': invertLeaders ? 'true' : 'false',
      title: invertLeaders
        ? 'Showing the lowest level per skill — click to show the highest'
        : 'Showing the highest level per skill — click to show the lowest',
    },
    [
      el('span', { 'aria-hidden': 'true', text: invertLeaders ? '▼' : '▲' }),
      el('span', {
        class: 'visually-hidden',
        text: invertLeaders ? 'Showing lowest' : 'Showing highest',
      }),
    ],
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
 * Totals row: each account's overall level, built from the exact same
 * `matrixCell` as a skill row — same leader star, same "+N" gain chip
 * (summed across every skill gained today), same right-aligned layout —
 * so it reads as one more row rather than a special case.
 */
function totalsRow(totalsData, totalLevelGainFor) {
  return el('tr', { class: 'row-total' }, [
    el('th', { scope: 'row', class: 'skill-head' }, [
      el('img', { class: 'skill-icon', src: TOTAL_LEVEL_ICON, alt: '', width: 18, height: 18, decoding: 'async' }),
      el('span', { class: 'skill-name', text: 'Total' }),
    ]),
    ...totalsData.cells.map((cell) => matrixCell(cell, TOTAL_MEASURE, totalLevelGainFor(cell.player.slug))),
  ]);
}

/**
 * Sorts rows for one account: the skills it leads first, then its own level
 * high to low. Ties fall back to experience so the order is stable. Inverted,
 * both the level and experience tie-breaks flip too — otherwise "weakest
 * skills first" would still list the account's strongest skills below its
 * one or two rock-bottom rows.
 */
function sortRowsFor(rows, slug, invertLeaders) {
  const cellFor = (row) => row.cells.find((cell) => cell.player.slug === slug);
  const direction = invertLeaders ? -1 : 1;

  return [...rows].sort((a, b) => {
    const left = cellFor(a);
    const right = cellFor(b);
    if (!left || !right) return 0;
    return (
      Number(right.isLeader) - Number(left.isLeader) ||
      direction * (right.level - left.level) ||
      direction * (right.xp - left.xp)
    );
  });
}

export function renderMatrix(state, levelGains, onSort, onToggleInvert) {
  const { players, sortedBy, invertLeaders } = state;

  const skillRows = buildMatrix(players, 'level', invertLeaders);
  const totalsData = buildTotalsRow(players, invertLeaders);
  const leads = leaderCounts([...skillRows, totalsData]);
  const ordered = sortedBy ? sortRowsFor(skillRows, sortedBy, invertLeaders) : skillRows;

  const gainFor = (slug, skillId) => levelGains.bySlug[slug]?.bySkill?.[skillId] ?? 0;
  const totalLevelGainFor = (slug) => levelGains.bySlug[slug]?.total ?? 0;

  const table = el('table', { class: 'matrix' }, [
    el('caption', {
      class: 'visually-hidden',
      text: `Every RuneScape 3 skill level by player, plus totals. The ${invertLeaders ? 'account behind' : 'group leader'} is marked in each row.`,
    }),
    el('thead', {}, [
      el('tr', {}, [
        el('th', { class: 'corner', scope: 'col' }, [el('span', { text: 'Skill' })]),
        ...players.map((player) => playerHead(player, leads[player.slug] ?? 0, sortedBy, onSort, invertLeaders)),
      ]),
    ]),
    el('tbody', {}, [
      ...ordered.map((row) =>
        el('tr', {}, [
          skillHead(row.skill),
          ...row.cells.map((cell) => matrixCell(cell, row.skill, gainFor(cell.player.slug, row.skill.id))),
        ]),
      ),
      totalsRow(totalsData, totalLevelGainFor),
    ]),
  ]);

  return el('section', { class: 'matrix-section' }, [
    el('div', { class: 'matrix-head' }, [
      el('div', { class: 'matrix-title' }, [
        el('h2', { text: `Skill Leaderboard${invertLeaders ? ' (Inverse)' : ''}` }),
        invertToggle(invertLeaders, onToggleInvert),
      ]),
      el('p', {
        class: 'matrix-note',
        text: sortedBy
          ? `Sorted by ${players.find((p) => p.slug === sortedBy)?.name ?? ''} — click the column again to reset.`
          : `Click a player column to sort by their ${invertLeaders ? 'weakest' : 'best'} skills. Hover a cell for experience and rank.`,
      }),
    ]),
    el('div', { class: 'matrix-scroll' }, [table]),
  ]);
}
