import { el, svgEl, swatch } from '../dom.js';
import { formatCompact, formatNumber } from '../format.js';
import { bindTooltip } from '../tooltip.js';
import {
  band,
  questPointsMark,
  skillGain,
  skillGainTooltip,
  questGainTooltip,
  emptyEntry,
  gridIcon,
  lineViewIcon,
  viewToggle,
} from './gains-shared.js';
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
 * `animate` ('immediate' | 'delayed' | falsy), when set, starts that rule
 * empty and fills it to `share` instead of painting it already full — see
 * `shareBar` for what the two animated variants mean. `valueIcon`, when
 * given, is a small unit glyph (e.g. `questPointsMark()`) riding right after
 * the headline value, ahead of `gain`.
 *
 * A real button rather than a div: clicking it selects the player, tinting
 * every cell of theirs in the same grid with their own colour (`--accent`,
 * set here) — see `.lb-entry.is-selected`. `selected` is that state for
 * *this* cell; `onSelect` reports the click back up so the grid can toggle it.
 */
export function entry({ player, value, sub, gain, share, place, ribbon, selected, onSelect, animate, valueIcon }) {
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
        el('span', {}, [value, valueIcon]),
        gain,
        sub ? el('span', { class: 'lb-sub' }, [sub]) : null,
      ]),
      Number.isFinite(share) ? shareBar(share, animate) : null,
    ],
  );
}

/** Full width (share = 1) takes this long to fill; smaller shares scale down
 * from it linearly, so every bar fills at the same constant rate — a small
 * bar stopping sooner reads as "smaller", not just "faster". */
const SHARE_BAR_FILL_MS = 900;

/** #panel's page-load "rise" animation is a 0.1s delay plus a 0.7s run (see
 * `body[data-ready] #panel` in styles.css) — a 'delayed' bar waits this long
 * before it starts filling, so it doesn't visibly move while the grid itself
 * is still animating up into place. Keep in sync with that CSS rule. */
const PANEL_RISE_MS = 800;

/**
 * The bottom-edge share rule. `animate` starts it at 0% width and grows it
 * to `share`, so the CSS `width` transition (`.lb-bar-fill`) plays instead
 * of painting the bar already full:
 *  - 'immediate' fills right away (a fresh view switch — nothing else on
 *    screen is still animating, so there's no reason to wait).
 *  - 'delayed' waits out `PANEL_RISE_MS` first (the initial page load, where
 *    the whole panel is already rising in — see `render()`'s page-load
 *    detection in app.js).
 * Either way the width change itself is scheduled two rAFs out, not one,
 * because the browser needs to actually paint the 0% state before a further
 * width change will transition rather than collapse into one recalculation
 * (same trick as `periodToggle`'s indicator slide, below).
 */
function shareBar(share, animate) {
  const width = `${Math.min(100, share * 100).toFixed(1)}%`;
  const fill = el('span', { class: 'lb-bar-fill', style: { width: animate ? '0%' : width } });

  if (animate) {
    fill.style.transitionDuration = `${Math.round(Math.max(0, Math.min(1, share)) * SHARE_BAR_FILL_MS)}ms`;
    fill.style.transitionDelay = animate === 'delayed' ? `${PANEL_RISE_MS}ms` : '0ms';
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        fill.style.width = width;
      });
    });
  }

  return el('span', { class: 'lb-bar', role: 'presentation' }, [fill]);
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
      valueIcon: questPointsMark(),
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

const periodIndex = (period) => PERIODS.findIndex(([value]) => value === period);

/**
 * Day/Week/Month — picks which pre-computed window the three bands show. The
 * active tab's ember highlight is a separate sliding block (`.tabs-indicator`)
 * rather than a background painted on each button, so switching periods can
 * animate as a slide instead of an instant recolour.
 *
 * `previousPeriod` is whatever period was active on the *previous* render —
 * not just from a tab click here, but also from switching Gains between grid
 * and line view, since each view now remembers its own period (see app.js's
 * gainsGridPeriod/gainsLinePeriod). When a view switch silently changes the
 * period out from under the reader, sliding the indicator over is what makes
 * that change obvious instead of easy to miss. `null` (the initial render)
 * skips the animation — there's nothing to slide from yet.
 */
function periodToggle(period, onSelect, previousPeriod) {
  const index = periodIndex(period);
  const fromIndex = previousPeriod == null ? index : periodIndex(previousPeriod);

  const indicator = el('span', { class: 'tabs-indicator', 'aria-hidden': 'true' });
  indicator.style.transform = `translateX(${fromIndex * 100}%)`;

  if (fromIndex !== index) {
    // Let the browser paint the "from" position first — changing the
    // transform again in the same tick would collapse both into one style
    // recalculation and skip the transition entirely. Two rAFs (rather than
    // one) reliably land after that first paint.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        indicator.style.transform = `translateX(${index * 100}%)`;
      });
    });
  }

  return el(
    'div',
    { class: 'tabs', role: 'tablist', 'aria-label': 'Gains period' },
    [
      indicator,
      ...PERIODS.map(([value, label]) =>
        el('button', {
          type: 'button',
          class: `tab${period === value ? ' is-active' : ''}`,
          role: 'tab',
          'aria-selected': period === value ? 'true' : 'false',
          onclick: () => onSelect(value),
          text: label,
        }),
      ),
    ],
  );
}

const VIEWS = [
  ['grid', 'the grid', gridIcon],
  ['line', 'line charts', lineViewIcon],
];

/**
 * One block, three bands (Levels, XP, Quest points), all showing the same
 * selected period. Kept adjacent so the same player can be tracked down the
 * columns, while each band stays independently ranked.
 *
 * @param gains { levels, xp, quests, series }, each { day, week, month } from
 *   computeLevelGains / computeGains / computeQuestGains / computeGainsSeries
 * @param period 'day' | 'week' | 'month' — which window to show
 * @param onSelectPeriod (period) => void
 * @param selectedPlayer slug of the player currently highlighted in this
 *   grid, or null — see entry()'s `selected`/`onSelect`. Ignored outside grid
 *   view, which is the only body with per-cell selection to highlight.
 * @param onSelectPlayer (slug) => void
 * @param view 'grid' | 'line' — which body renders below the shared header
 * @param onSelectView (view) => void
 * @param previousPeriod whatever period was active last render, or null on
 *   the very first — see periodToggle for why this drives the tab slide.
 */
export function renderGains(gains, period, onSelectPeriod, selectedPlayer, onSelectPlayer, view, onSelectView, previousPeriod) {
  const body =
    view === 'line'
      ? renderGainsLines(gains, period)
      : el('div', { class: 'lb-stack' }, [
          band('Levels', levelsRow(gains.levels[period], selectedPlayer, onSelectPlayer)),
          band('XP', xpRow(gains.xp[period], selectedPlayer, onSelectPlayer)),
          band('Quest points', questsRow(gains.quests[period], selectedPlayer, onSelectPlayer)),
        ]);

  return el('section', { class: 'lb' }, [
    el('div', { class: 'lb-head' }, [
      el('div', { class: 'lb-title' }, [
        el('h2', {}, [graphIcon(), el('span', { text: 'Gains' })]),
        viewToggle(view, VIEWS, onSelectView, 'Gains view'),
      ]),
      periodToggle(period, onSelectPeriod, previousPeriod),
    ]),
    body,
  ]);
}
