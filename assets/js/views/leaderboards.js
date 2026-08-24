import { el, svgEl, swatch } from '../dom.js';
import { formatCompact, formatNumber } from '../format.js';
import { bindTooltip } from '../tooltip.js';
import { band, questPointsIcon, skillGain, skillGainTooltip, questGainTooltip, emptyEntry } from './gains-shared.js';
import { renderGainsCharts } from './gains-chart.js';
import { renderGainsLines } from './gains-line.js';

/**
 * The Gains section: levels, xp and quest points gained, for whichever
 * period (day/week/month) the reader has selected — see the tab row beside
 * the title. Each band shares one row component, so the eye reads all three
 * the same way.
 */

/** "1st", "2nd", "3rd", "4th"… — for the screen-reader-only place label. */
const ORDINAL_SUFFIX = new Intl.PluralRules('en', { type: 'ordinal' });
const ORDINAL_SUFFIXES = { one: 'st', two: 'nd', few: 'rd', other: 'th' };
const ordinal = (n) => `${n}${ORDINAL_SUFFIXES[ORDINAL_SUFFIX.select(n)]}`;

/** Podium column, 1st through 3rd — everything else is unmarked, not "4th". */
const MEDAL_RIBBON = { 1: ['1st', 'is-gold'], 2: ['2nd', 'is-silver'], 3: ['3rd', 'is-bronze'] };

/** The two trailing-column call-outs — Gains' "Slacker" reads as a warning, Account Standings' "Trying" as encouragement. */
const RIBBON_CLASS = { Slacker: 'is-crimson', Trying: 'is-green' };

/**
 * The rank number is dropped from view — column position already reads as
 * rank ("ranked highest first" per the band note) — and replaced with a
 * gold/silver/bronze corner banner on the top three columns. It stays for
 * screen readers, which have no notion of column position.
 *
 * `sub` may be a plain string or a node (e.g. an icon-led fragment). `ribbon`
 * is a custom corner banner for a column with no podium medal (e.g. the
 * trailing column's "Slacker") — ignored on a podium place, since that
 * banner already takes the corner. `gain`, when given, is a chip node (see
 * `gainChip`) that rides beside the headline value. `share` (0–1), when
 * given, draws a coloured progress rule along the cell's bottom edge in the
 * player's own colour — e.g. their total level's share of the game's cap.
 *
 * A real button rather than a div: clicking it selects the player, tinting
 * every cell of theirs in the same grid with their own colour (`--accent`,
 * set here) — see `.lb-entry.is-selected`. `selected` is that state for
 * *this* cell; `onSelect` reports the click back up so the grid can toggle it.
 */
export function entry({ player, value, sub, gain, share, place, ribbon, selected, onSelect }) {
  const medal = MEDAL_RIBBON[place];
  const ribbonText = medal ? medal[0] : ribbon;
  const ribbonClass = medal ? ` ${medal[1]}` : RIBBON_CLASS[ribbon] ? ` ${RIBBON_CLASS[ribbon]}` : '';

  return el(
    'button',
    {
      type: 'button',
      class: `lb-entry${selected ? ' is-selected' : ''}`,
      style: { '--accent': player.colour },
      onclick: () => onSelect(player.slug),
    },
    [
      ribbonText ? el('span', { class: `lb-ribbon${ribbonClass}`, text: ribbonText }) : null,
      el('span', { class: 'visually-hidden', text: `${ordinal(place)} place — ` }),
      el('span', { class: 'lb-name' }, [swatch(player.colour), el('span', { text: player.name })]),
      el('span', { class: 'lb-value' }, [
        el('span', { text: value }),
        gain,
        sub ? el('span', { class: 'lb-sub' }, [sub]) : null,
      ]),
      Number.isFinite(share)
        ? el('span', { class: 'lb-bar', role: 'presentation' }, [
            el('span', { class: 'lb-bar-fill', style: { width: `${Math.min(100, share * 100).toFixed(1)}%` } }),
          ])
        : null,
    ],
  );
}

/** A green "+N" chip — same voice as the matrix's per-skill gain chip
 * (`.chip-up.cell-gain`), reused wherever a headline value needs a gain
 * riding beside it. `label` is the screen-reader-only qualifier, e.g.
 * "gained today". */
export const gainChip = (text, label) =>
  el('span', { class: 'chip-up lb-gain' }, [
    el('span', { text }),
    el('span', { class: 'visually-hidden', text: ` ${label}` }),
  ]);

/**
 * The "Slacker" ribbon's column: the last row with any gain at all, not
 * necessarily the last column — rows are sorted descending, so a zero-gain
 * tail renders as empty cells (see `emptyEntry`) and the ribbon would
 * otherwise land on a blank column instead of the real trailing performer.
 */
const lastActivePlace = (rows, valueOf) => rows.filter((row) => valueOf(row) > 0).length;

/** A drawn glyph: "gained over time" has no game asset to borrow. */
function graphIcon() {
  const svg = svgEl('svg', { class: 'lb-icon', viewBox: '0 0 18 18', 'aria-hidden': 'true', focusable: 'false' });
  svg.append(
    svgEl('polyline', { points: '1,13 6,8 10,11 17,3', class: 'graph-line' }),
    svgEl('polyline', { points: '1,16.5 17,16.5', class: 'graph-axis' }),
  );
  return svg;
}

/**
 * Shared row builder for the two skill-driven bands (Levels, XP) — identical
 * shape from computeGains / computeLevelGains, differing only in how the
 * headline figure is formatted and what the tooltip calls it.
 */
function skillGainRow(gains, { formatValue, valueLabel }, selectedPlayer, onSelectPlayer) {
  const slackerPlace = lastActivePlace(gains.rows, (row) => row.total);

  return gains.rows.map((row, index) => {
    if (row.total <= 0) return emptyEntry();

    const place = index + 1;
    const top = row.bySkill[0];

    const node = entry({
      player: row.player,
      place,
      value: `+${formatValue(row.total)}`,
      sub: skillGain(top),
      ribbon: place === slackerPlace ? 'Slacker' : null,
      selected: row.player.slug === selectedPlayer,
      onSelect: onSelectPlayer,
    });

    return bindTooltip(node, () => skillGainTooltip(row, valueLabel));
  });
}

const levelsRow = (gains, selectedPlayer, onSelectPlayer) =>
  skillGainRow(gains, { formatValue: formatNumber, valueLabel: 'Levels gained' }, selectedPlayer, onSelectPlayer);
const xpRow = (gains, selectedPlayer, onSelectPlayer) =>
  skillGainRow(gains, { formatValue: formatCompact, valueLabel: 'XP gained' }, selectedPlayer, onSelectPlayer);

/** Quest points have no per-skill breakdown, so this stays a plain figure. */
function questsRow(gains, selectedPlayer, onSelectPlayer) {
  const slackerPlace = lastActivePlace(gains.rows, (row) => row.gained);

  return gains.rows.map((row, index) => {
    if (row.gained <= 0) return emptyEntry();

    const place = index + 1;
    const node = entry({
      player: row.player,
      place,
      value: `+${formatNumber(row.gained)}`,
      ribbon: place === slackerPlace ? 'Slacker' : null,
      selected: row.player.slug === selectedPlayer,
      onSelect: onSelectPlayer,
    });

    return bindTooltip(node, () => questGainTooltip(row));
  });
}

const PERIODS = [
  ['day', 'Day'],
  ['week', 'Week'],
  ['month', 'Month'],
];

/** Day/Week/Month — picks which pre-computed window the three bands show. */
function periodToggle(period, onSelect) {
  return el(
    'div',
    { class: 'tabs', role: 'tablist', 'aria-label': 'Gains period' },
    PERIODS.map(([value, label]) =>
      el('button', {
        type: 'button',
        class: `tab${period === value ? ' is-active' : ''}`,
        role: 'tab',
        'aria-selected': period === value ? 'true' : 'false',
        onclick: () => onSelect(value),
        text: label,
      }),
    ),
  );
}

/** Three ascending bars — a drawn glyph, since "bar chart" has no game asset either. */
function chartIcon() {
  const svg = svgEl('svg', { class: 'toggle-icon', viewBox: '0 0 18 18', 'aria-hidden': 'true', focusable: 'false' });
  svg.append(
    svgEl('rect', { x: 1.5, y: 9.5, width: 3.5, height: 7, rx: 1 }),
    svgEl('rect', { x: 7.25, y: 5.5, width: 3.5, height: 11, rx: 1 }),
    svgEl('rect', { x: 13, y: 2, width: 3.5, height: 14.5, rx: 1 }),
  );
  return svg;
}

/** Four small squares — a drawn glyph for the grid view, same recipe as the
 * other two toggle icons. */
function gridIcon() {
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
function lineViewIcon() {
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

const VIEWS = [
  ['grid', 'the grid', gridIcon],
  ['chart', 'bar charts', chartIcon],
  ['line', 'line charts', lineViewIcon],
];

/** Grid ⇄ bar chart ⇄ line chart, beside the title — a 3-way icon segmented
 * control, same visual language (and the same shared-border recipe) as the
 * Day/Week/Month tabs. */
function viewToggle(view, onSelectView) {
  return el(
    'div',
    { class: 'gains-view-tabs', role: 'tablist', 'aria-label': 'Gains view' },
    VIEWS.map(([value, label, icon]) =>
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

/**
 * One block, three bands (Levels, XP, Quest points), all showing the same
 * selected period. Kept adjacent so the same player can be tracked down the
 * columns, while each band stays independently ranked.
 *
 * @param gains { levels, xp, quests, series }, each (bar series aside) with
 *   { day, week, month } from computeLevelGains / computeGains /
 *   computeQuestGains / computeGainsSeries
 * @param period 'day' | 'week' | 'month' — which window to show
 * @param onSelectPeriod (period) => void
 * @param selectedPlayer slug of the player currently highlighted in this
 *   grid, or null — see entry()'s `selected`/`onSelect`. Ignored outside grid
 *   view, which is the only body with per-cell selection to highlight.
 * @param onSelectPlayer (slug) => void
 * @param view 'grid' | 'chart' | 'line' — which body renders below the shared header
 * @param onSelectView (view) => void
 */
export function renderGains(gains, period, onSelectPeriod, selectedPlayer, onSelectPlayer, view, onSelectView) {
  const body =
    view === 'chart'
      ? renderGainsCharts(gains, period)
      : view === 'line'
        ? renderGainsLines(gains, period)
        : el('div', { class: 'lb-stack' }, [
            band('Levels', levelsRow(gains.levels[period], selectedPlayer, onSelectPlayer)),
            band('XP', xpRow(gains.xp[period], selectedPlayer, onSelectPlayer)),
            band(questPointsIcon(), questsRow(gains.quests[period], selectedPlayer, onSelectPlayer)),
          ]);

  return el('section', { class: 'lb' }, [
    el('div', { class: 'lb-head' }, [
      el('div', { class: 'lb-title' }, [
        el('h2', {}, [graphIcon(), el('span', { text: 'Gains' })]),
        viewToggle(view, onSelectView),
      ]),
      periodToggle(period, onSelectPeriod),
    ]),
    body,
  ]);
}
