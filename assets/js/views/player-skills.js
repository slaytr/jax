import { el } from '../dom.js';
import { formatNumber, formatRank } from '../format.js';
import { SKILL_GRID, iconFor } from '../config.js';
import { bindTooltip, tooltipContent } from '../tooltip.js';
import { xpForLevel, xpProgress } from '../xp-table.js';

const EMPTY_SKILL = Object.freeze({ level: 1, xp: 0, rank: null });

/**
 * One skill cell — the matrix's own `matrixCell` cut down to a single player:
 * same icon, level and hover tooltip, just without the per-row "who's ahead"
 * comparison the group matrix needs (there's only one account here) and
 * without a visible gain chip — the grid stays a plain read of *where this
 * player stands*; how much they've gained lives in the Gains section above
 * instead of repeating on every one of these cells.
 *
 * The bar below the figure is progress *to the next level* (xpProgress,
 * xp-table.js) rather than the matrix's own "share of the skill's level
 * cap" — a near-full bar means "about to level up", not "close to 99/120".
 * It's painted with `.cell-rule-fill`'s shared `background: var(--accent)`,
 * so it needs `--accent` set somewhere above it in the tree — unlike the
 * matrix, which sets it per cell (one player per column), every cell here
 * is the *same* player, so `renderPlayerSkills` sets it once on the whole
 * section instead.
 *
 * The whole cell is a real button (site convention: a click target is a
 * button, not a div with a handler) that filters every Levels/XP chart in
 * the Gains section down to this one skill — `onSelect` reports the click
 * up, and `renderPlayerSkills`'s caller (stats.js) does the actual
 * toggle-back-to-total comparison, same shape as the comparison chart's own
 * hidden/emphasized player toggles.
 */
function skillCell(skill, value, gainedToday, icon, name, isSelected, onSelect) {
  const progress = xpProgress(skill, value.level, value.xp);
  const nextLevelXp = xpForLevel(skill, value.level + 1);

  const node = el(
    'button',
    {
      type: 'button',
      class: `skill-cell${value.xp === 0 ? ' is-empty' : ''}${isSelected ? ' is-selected' : ''}`,
      'aria-pressed': isSelected ? 'true' : 'false',
      onclick: () => onSelect(skill.id),
    },
    [
      el('img', { class: 'skill-cell-icon', src: icon, alt: '', width: 18, height: 18, decoding: 'async' }),
      // The name isn't shown (icon + level only, kept tight) but still needs
      // to reach screen readers and the hover/focus tooltip below.
      el('span', { class: 'visually-hidden', text: `${name} ` }),
      el('span', { class: 'cell-primary', text: formatNumber(value.level) }),
      el('span', { class: 'cell-rule', role: 'presentation' }, [
        el('span', { class: 'cell-rule-fill', style: { width: `${(progress * 100).toFixed(1)}%` } }),
      ]),
    ],
  );

  return bindTooltip(node, () =>
    tooltipContent(name, [
      ['Level', `${formatNumber(value.level)} / ${skill.max}`],
      ['Levels today', gainedToday > 0 ? `+${gainedToday}` : 'none'],
      ['Experience', `${formatNumber(value.xp)} xp`],
      ['Next level', nextLevelXp === undefined ? 'maxed' : `${formatNumber(Math.max(0, nextLevelXp - value.xp))} xp to go`],
      ['Rank', formatRank(value.rank)],
    ]),
  );
}

/**
 * The 3×10 skill grid: RS3's own in-game skills-tab layout (see
 * `SKILL_GRID`), each cell an icon plus a level. 29 skills leaves one spare
 * cell at the bottom right (Total level used to stand in for it — now just
 * left empty; `el()` drops the `null` this maps that slot to, so the grid
 * simply has 29 cells instead of a filled 30th).
 *
 * @param player a decorated player (data.js) — `skillById` read here.
 * @param todayLevelGains computeLevelGains(snapshots, players, CALENDAR_DAY)'s
 *   result — `bySlug` feeds each cell's "Levels today" tooltip row (not shown
 *   on the cell face itself; see `skillCell`).
 * @param selectedSkillId the clicked cell's skill id, or null when every
 *   skill is showing combined (the default) — highlights that one cell
 *   (`.is-selected`) so it's clear which skill the Gains section below is
 *   currently filtered to.
 * @param onSelectSkill (skillId) => void — reports a cell click; the
 *   toggle-back-to-total comparison (clicking the already-selected cell)
 *   happens in the caller, same shape as the comparison chart's own
 *   hidden/emphasized player toggles (stats.js).
 */
export function renderPlayerSkills(player, todayLevelGains, selectedSkillId, onSelectSkill) {
  const bySlug = todayLevelGains.bySlug[player.slug];

  const cells = SKILL_GRID.flat().map((skill) => {
    if (skill === null) return null;
    return skillCell(
      skill,
      player.skillById?.[skill.id] ?? EMPTY_SKILL,
      bySlug?.bySkill?.[skill.id] ?? 0,
      iconFor(skill),
      skill.name,
      skill.id === selectedSkillId,
      onSelectSkill,
    );
  });

  return el('section', { class: 'lb', style: { '--accent': player.colour } }, [
    el('div', { class: 'lb-head' }, [
      el('div', { class: 'lb-title' }, [el('h2', { text: 'Skills' })]),
    ]),
    el('div', { class: 'skill-grid' }, cells),
  ]);
}
