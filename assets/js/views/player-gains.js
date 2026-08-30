import { el, svgEl, swatch } from '../dom.js';
import { formatCompact, formatNumber, formatShortDate, formatUtcMidnight } from '../format.js';
import { computeDailyBreakdown } from '../compute.js';
import { bindTooltip, tooltipContent } from '../tooltip.js';

/**
 * This player's Gains section: three bar charts — Levels, XP and Quest
 * points gained per day — rather than a Day/Week/Month grid of totals;
 * which days actually built this player's progress is the story here, not
 * just each period's end figure. `window` ('week' | 'month') picks how many
 * days back all three cover, via one shared toggle (mirrors the group
 * page's own Day/Week/Month tabs governing all three of its bands at once —
 * periodToggle, leaderboards.js).
 */

const WINDOWS = [
  ['week', 'Week', 7],
  ['month', 'Month', 30],
];

const windowIndex = (window) => WINDOWS.findIndex(([value]) => value === window);
const daysFor = (window) => WINDOWS.find(([value]) => value === window)?.[2] ?? 7;

/** Same 720px breakpoint the mobile CSS already stacks the three charts at
 * (styles.css) — read here too because, unlike everything else responsive
 * on this page, "does this chart get a y-axis" and "is its header a click
 * target" change the *rendered* markup, not just its styling, so CSS alone
 * can't carry it. `globalThis` (not `window`) because every function in
 * this file that needs it — metricCard, comparisonCard, windowToggle,
 * renderPlayerGains — already has its own `window` parameter (the
 * Week/Month value) shadowing the real one. Read once per render rather
 * than watched live: nothing on this page currently reacts to an in-place
 * resize, and a phone loading this page fresh always renders at its own
 * width on the first pass anyway. */
const isMobileViewport = () => globalThis.matchMedia?.('(max-width: 720px)').matches ?? false;

/** Week/Month — a 2-tab version of periodToggle's sliding-indicator segmented
 * control (leaderboards.js). `.tabs-2up` sets the indicator to half width
 * instead of the shared `.tabs-indicator`'s one-third, sized for that
 * control's usual three tabs. */
function windowToggle(window, onSelect, previousWindow) {
  const index = windowIndex(window);
  const fromIndex = previousWindow == null ? index : windowIndex(previousWindow);

  const indicator = el('span', { class: 'tabs-indicator', 'aria-hidden': 'true' });
  indicator.style.transform = `translateX(${fromIndex * 100}%)`;

  if (fromIndex !== index) {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        indicator.style.transform = `translateX(${index * 100}%)`;
      });
    });
  }

  return el('div', { class: 'tabs tabs-2up', role: 'tablist', 'aria-label': 'Gains window' }, [
    indicator,
    ...WINDOWS.map(([value, label]) =>
      el('button', {
        type: 'button',
        class: `tab${window === value ? ' is-active' : ''}`,
        role: 'tab',
        'aria-selected': window === value ? 'true' : 'false',
        onclick: () => onSelect(value),
        text: label,
      }),
    ),
  ]);
}

/**
 * One card per metric: Levels (plain count), XP (compact headline, exact
 * figure + "xp" unit on hover — same convention as the rest of the site,
 * e.g. standings.js's own gain tooltips) and Quest points (plain count).
 * `totalFormat` styles the headline total; the tooltip always shows the
 * exact number via formatNumber, with `unit` appended only for xp.
 */
const METRICS = [
  ['level', 'Levels gained', formatNumber, ''],
  ['xp', 'XP gained', formatCompact, ' xp'],
  ['quests', 'Quest points gained', formatNumber, ''],
];

/** Quest points have no per-skill breakdown (RuneMetrics reports one group
 * total, not a value per skill), so a skill filter never applies to that
 * metric — every other metric reads `selectedSkill`'s own slot instead of
 * index 0 ("Overall") when one is selected. Shared by metricCard and
 * comparisonCard so the two always agree on what's currently filtered. */
const skillIdFor = (metric, selectedSkill) => (metric !== 'quests' && selectedSkill ? selectedSkill.id : 0);
const skillLabel = (baseLabel, metric, selectedSkill) =>
  metric !== 'quests' && selectedSkill ? `${selectedSkill.name} ${baseLabel}` : baseLabel;

const WIDTH = 300;
const HEIGHT = 110;
const PAD_X = 3;
const PAD_LEFT_AXIS = 28; // room for y-axis tick labels — the active chart only
const PAD_TOP = 6;
const PAD_BOTTOM = 16; // room for the week view's weekday labels
const BAR_GAP = 2; // the surface gap between bars — see the dataviz skill's bar mark spec
const MAX_BAR_WIDTH = 24; // same spec's cap, so a lone bar (or a short month) never balloons
const CLUSTER_GAP = 0.6; // thinner gap between two players' bars *within* one day's cluster
const AXIS_TICKS = 4; // gridlines at 0 and three more evenly spaced steps up

/** A "nice" gridline step (1/2/5/10 × a power of ten) for a given max value —
 * the standard trick so axis labels read as round numbers (0, 50K, 100K…)
 * instead of whatever fraction the data's actual peak happens to land on. */
function niceStep(maxValue, tickCount) {
  if (maxValue <= 0) return 1;
  const rawStep = maxValue / tickCount;
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const residual = rawStep / magnitude;
  const niceResidual = residual > 5 ? 10 : residual > 2 ? 5 : residual > 1 ? 2 : 1;
  return niceResidual * magnitude;
}

/** The rounded axis max a `niceStep`-based axis actually tops out at — bars
 * scale against this, not the data's own raw peak, so the tallest bar
 * doesn't necessarily touch the top gridline (same as any rounded-tick
 * axis). */
const axisMaxFor = (rawMax, step) => Math.max(Math.ceil(rawMax / step) * step, step);

/** Recessive horizontal gridlines plus tick labels at each `niceStep`,
 * shared by the day-by-day chart and the player-comparison chart below —
 * same axis anatomy either way, just a different set of bars underneath. */
function drawAxis(svg, padLeft, baseline, plotHeight, axisMax, step, formatValue) {
  for (let value = 0; value <= axisMax + step * 0.001; value += step) {
    const y = baseline - (value / axisMax) * plotHeight;
    svg.append(svgEl('line', { x1: padLeft, x2: WIDTH - PAD_X, y1: y.toFixed(2), y2: y.toFixed(2), class: 'bar-chart-gridline' }));
    const tick = svgEl('text', { x: padLeft - 4, y: y.toFixed(2), class: 'bar-chart-axis-label', 'text-anchor': 'end' });
    tick.textContent = value === 0 ? '0' : formatValue(value);
    svg.append(tick);
  }
}

/**
 * One bar per day. The week view also labels each bar with its date; the
 * month view leaves that strip blank — 30 labels would just collide — and
 * relies on the hover/focus tooltip instead, same as any value pushed off
 * its mark. A day before the group's own tracking history (`gained: null`,
 * see computeDailyBreakdown) gets no bar at all: an empty slot reads as "no
 * data yet", where a zero-height bar would misread as "gained nothing" on a
 * day that was never actually tracked.
 *
 * `showAxis` (the active chart only — see metricCard) adds recessive
 * horizontal gridlines and tick labels at "nice" round values (niceStep)
 * along the left edge; bars then scale against that rounded axis max
 * instead of the data's own raw peak, so the tallest bar doesn't
 * necessarily touch the top gridline — same as any chart with rounded
 * ticks. The two stacked charts skip this: at that width there's no room
 * for tick labels, and their bars already carry the tooltip's exact value.
 */
function barChart(entries, accent, showLabels, label, unit, showAxis, formatValue) {
  const padLeft = showAxis ? PAD_LEFT_AXIS : PAD_X;
  const plotWidth = WIDTH - padLeft - PAD_X;
  const plotHeight = HEIGHT - PAD_TOP - PAD_BOTTOM;
  const slot = plotWidth / entries.length;
  const barWidth = Math.min(MAX_BAR_WIDTH, slot - BAR_GAP);
  const rawMax = Math.max(...entries.map((entry) => entry.gained ?? 0), 1);
  const step = showAxis ? niceStep(rawMax, AXIS_TICKS) : null;
  const maxGained = showAxis ? axisMaxFor(rawMax, step) : rawMax;
  const baseline = HEIGHT - PAD_BOTTOM;

  const svg = svgEl('svg', {
    viewBox: `0 0 ${WIDTH} ${HEIGHT}`,
    class: 'bar-chart-svg',
    role: 'img',
    'aria-label': `${label} per day over the last ${entries.length} days`,
  });

  if (showAxis) drawAxis(svg, padLeft, baseline, plotHeight, maxGained, step, formatValue);

  entries.forEach((entry, i) => {
    const slotX = padLeft + i * slot;

    if (showLabels) {
      const dayLabel = svgEl('text', {
        x: (slotX + slot / 2).toFixed(2),
        y: HEIGHT - 4,
        class: 'bar-chart-label',
        'text-anchor': 'middle',
      });
      dayLabel.textContent = formatShortDate(entry.dayStart);
      svg.append(dayLabel);
    }

    if (entry.gained === null) return;

    const height = Math.max(1.5, (entry.gained / maxGained) * plotHeight);
    const bar = svgEl('rect', {
      x: (slotX + (slot - barWidth) / 2).toFixed(2),
      y: (baseline - height).toFixed(2),
      width: barWidth.toFixed(2),
      height: height.toFixed(2),
      rx: 2,
      class: 'bar-chart-bar',
      style: `--accent:${accent}`,
      tabindex: '0',
    });

    bindTooltip(bar, () =>
      tooltipContent(
        formatUtcMidnight(entry.dayStart),
        [[label, entry.gained > 0 ? `+${formatNumber(entry.gained)}${unit}` : 'none']],
        accent,
      ),
    );

    svg.append(bar);
  });

  return svg;
}

/**
 * Grouped bars: the x-axis is days, exactly like the chart above it, but
 * each day's slot holds one thin bar per group member instead of one bar
 * for this player alone — so a day this player trained hard reads next to
 * how everyone else did that same day. Every player gets a fixed sub-slot
 * within each day's cluster (roster order), hidden or not, so toggling a
 * player never shifts anyone else's bar sideways — same reasoning as a
 * missing day's whole cluster staying reserved rather than collapsing.
 *
 * Same axis anatomy as the day-by-day chart (drawAxis), scaled to the
 * tallest bar across *every* player (not just the visible ones) so hiding
 * the current leader doesn't suddenly rescale everyone else's bars taller.
 *
 * `subjectSlug` — whose page this is — keeps that player's bars at full
 * opacity while every other player's dims (`.is-other-player`), so this
 * player's own shape still reads at a glance in a cluster of five; hovering
 * or focusing any bar (dimmed or not) brings it to full opacity, since the
 * tooltip is about to name whoever it belongs to anyway.
 *
 * `emphasizedSlugs` is a *persistent* version of that same hover boost:
 * clicking any bar toggles its whole player in and out of this set, and
 * every one of their bars (`.is-emphasized`) then reads at normal opacity
 * even at rest — a click-to-pin alternative to having to keep the pointer
 * over one player's bars to compare them against the subject's own.
 */
function comparisonChart(playerRows, showLabels, label, unit, formatValue, hiddenSlugs, subjectSlug, emphasizedSlugs, onToggleEmphasis) {
  const dayCount = playerRows[0]?.entries.length ?? 0;
  const padLeft = PAD_LEFT_AXIS;
  const plotWidth = WIDTH - padLeft - PAD_X;
  const plotHeight = HEIGHT - PAD_TOP - PAD_BOTTOM;
  const daySlot = plotWidth / dayCount;
  const barSlot = (daySlot - BAR_GAP) / playerRows.length;
  const barWidth = Math.max(0.5, barSlot - CLUSTER_GAP);
  const rawMax = Math.max(...playerRows.flatMap((row) => row.entries.map((entry) => entry.gained ?? 0)), 1);
  const step = niceStep(rawMax, AXIS_TICKS);
  const axisMax = axisMaxFor(rawMax, step);
  const baseline = HEIGHT - PAD_BOTTOM;

  const svg = svgEl('svg', {
    viewBox: `0 0 ${WIDTH} ${HEIGHT}`,
    class: 'bar-chart-svg',
    role: 'img',
    'aria-label': `${label} per day, one bar per group member, over the last ${dayCount} days`,
  });

  drawAxis(svg, padLeft, baseline, plotHeight, axisMax, step, formatValue);

  for (let day = 0; day < dayCount; day += 1) {
    const dayStart = playerRows[0].entries[day].dayStart;
    const clusterX = padLeft + day * daySlot;

    if (showLabels) {
      const dayLabel = svgEl('text', {
        x: (clusterX + daySlot / 2).toFixed(2),
        y: HEIGHT - 4,
        class: 'bar-chart-label',
        'text-anchor': 'middle',
      });
      dayLabel.textContent = formatShortDate(dayStart);
      svg.append(dayLabel);
    }

    playerRows.forEach((row, p) => {
      if (hiddenSlugs.has(row.player.slug)) return;

      const entry = row.entries[day];
      if (entry.gained === null) return;

      const isOther = row.player.slug !== subjectSlug;
      const isEmphasized = emphasizedSlugs.has(row.player.slug);

      const height = Math.max(1.5, (entry.gained / axisMax) * plotHeight);
      const bar = svgEl('rect', {
        x: (clusterX + p * barSlot).toFixed(2),
        y: (baseline - height).toFixed(2),
        width: barWidth.toFixed(2),
        height: height.toFixed(2),
        rx: 1,
        class: `bar-chart-bar${isOther ? ' is-other-player' : ''}${isOther && isEmphasized ? ' is-emphasized' : ''}`,
        style: `--accent:${row.player.colour}`,
        tabindex: '0',
      });

      // Every bar toggles its own player's emphasis on click — not just the
      // dimmed ones — so clicking the subject's own bar by mistake is a
      // harmless no-op (it's already full opacity) rather than a dead spot.
      bar.addEventListener('click', () => onToggleEmphasis(row.player.slug));

      bindTooltip(bar, () =>
        tooltipContent(
          row.player.name,
          [
            [label, entry.gained > 0 ? `+${formatNumber(entry.gained)}${unit}` : 'none'],
            ['Day', formatUtcMidnight(dayStart)],
          ],
          row.player.colour,
        ),
      );

      svg.append(bar);
    });
  }

  return svg;
}

/** One player's show/hide chip — a real button (site convention), pressed
 * state carries both a class (the strike-through look) and `aria-pressed`,
 * so hiding a bar reads the same way to a screen reader as it does visually. */
function playerToggle(player, hidden, onToggle) {
  return el(
    'button',
    {
      type: 'button',
      class: `player-toggle${hidden ? ' is-hidden' : ''}`,
      'aria-pressed': hidden ? 'false' : 'true',
      onclick: () => onToggle(player.slug),
    },
    [swatch(player.colour), el('span', { text: player.name })],
  );
}

/**
 * The active chart's own comparison card: every group member's day-by-day
 * gain for that same metric and window, clustered by day, with a toggle
 * chip per player to hide/show their bars. Sits directly under the active
 * chart only (see renderPlayerGains) — the two smaller stacked charts don't
 * get one, same reasoning as their missing y-axis: there's no room, and
 * this is about the metric currently being looked at, not all three at
 * once. `players` (roster order, not ranked) fixes each player's sub-slot
 * position within every day's cluster — see comparisonChart. `subjectSlug`
 * is whose page this is, so their own bars stay undimmed (comparisonChart).
 * `emphasizedSlugs`/`onToggleEmphasis` carry the click-to-pin state — see
 * comparisonChart's own doc comment. `selectedSkill` narrows both the data
 * and the label down to one skill (skillIdFor/skillLabel) — null shows
 * every skill's combined total, same as before this existed.
 */
function comparisonCard(
  metric,
  baseLabel,
  totalFormat,
  unit,
  snapshots,
  players,
  window,
  hiddenSlugs,
  onToggleHidden,
  subjectSlug,
  emphasizedSlugs,
  onToggleEmphasis,
  selectedSkill,
) {
  const label = skillLabel(baseLabel, metric, selectedSkill);
  const skillId = skillIdFor(metric, selectedSkill);
  const days = daysFor(window);
  const playerRows = players.map((player) => ({
    player,
    entries: computeDailyBreakdown(snapshots, player.slug, metric, days, skillId),
  }));
  const hasData = playerRows.some((row) => row.entries.some((entry) => entry.gained !== null));

  return el('div', { class: 'chart-card player-compare-card' }, [
    el('p', { class: 'chart-card-label', text: label.replace(/gained$/, 'comparisons') }),
    el(
      'div',
      { class: 'player-toggle-row' },
      players.map((player) => playerToggle(player, hiddenSlugs.has(player.slug), onToggleHidden)),
    ),
    hasData
      ? comparisonChart(playerRows, window === 'week', label, unit, totalFormat, hiddenSlugs, subjectSlug, emphasizedSlugs, onToggleEmphasis)
      : el('p', { class: 'chart-empty', text: 'No data yet.' }),
  ]);
}

/**
 * One metric's card: headline total for the window, then its bar chart (or
 * "No data yet." when tracking hasn't reached back far enough to show
 * anything at all).
 *
 * The active card's header is plain text — clicking the chart that's
 * already big does nothing. An inactive card's header is a real `<button>`
 * instead (site convention: a click target is a button, not a div with an
 * handler) that swaps it in as the active one; the SVG itself sits outside
 * that button; its bars keep their own hover/focus tooltip regardless of
 * which state the card is in. `selectedSkill` narrows both the data and the
 * label down to one skill (skillIdFor/skillLabel), except for Quest points,
 * which has no per-skill breakdown and always shows the group total.
 *
 * On mobile (isMobileViewport) the three cards render at equal size with no
 * "active" one to swap into — see the mobile block in styles.css — so every
 * card's header is plain text there regardless of `isActive`, and every
 * card gets the axis normally reserved for the active chart alone, since at
 * that width there's no smaller stacked chart to spare the room from.
 */
function metricCard(metric, baseLabel, totalFormat, unit, snapshots, player, window, isActive, onActivate, selectedSkill) {
  const label = skillLabel(baseLabel, metric, selectedSkill);
  const entries = computeDailyBreakdown(snapshots, player.slug, metric, daysFor(window), skillIdFor(metric, selectedSkill));
  const total = entries.reduce((sum, entry) => sum + (entry.gained ?? 0), 0);
  const hasData = entries.some((entry) => entry.gained !== null);
  const showAxis = isActive || isMobileViewport();

  const header = [
    el('p', { class: 'chart-card-label', text: label }),
    el('p', { class: 'bar-chart-total' }, [
      el('span', { text: `+${totalFormat(total)}` }),
      el('span', { class: 'bar-chart-total-label', text: window === 'week' ? ' this week' : ' this month' }),
    ]),
  ];

  return el('div', { class: `chart-card bar-chart-card${isActive ? ' is-active' : ''}` }, [
    showAxis
      ? el('div', { class: 'bar-chart-header' }, header)
      : el(
          'button',
          { type: 'button', class: 'bar-chart-header bar-chart-activate', onclick: () => onActivate(metric) },
          [...header, el('span', { class: 'visually-hidden', text: ` — make ${label} the main chart` })],
        ),
    hasData
      ? barChart(entries, player.colour, window === 'week', label, unit, showAxis, totalFormat)
      : el('p', { class: 'chart-empty', text: 'No data yet.' }),
  ]);
}

/**
 * @param options.player a decorated player (data.js) — `slug` and `colour`
 *   read here; this is whose day-by-day charts render.
 * @param options.players the full roster (data.js) — every member's own
 *   gain feeds the active chart's player-comparison card below it.
 * @param options.snapshots the group's raw snapshot history (data.js), fed
 *   straight to compute.js here rather than precomputed upstream — same
 *   pattern as matrix.js/standings.js calling it themselves.
 * @param options.window 'week' | 'month' — which the Week/Month tabs
 *   currently show.
 * @param options.onSelectWindow (window) => void
 * @param options.previousWindow whatever window was active on the
 *   *previous* render, or null on the first — drives the tab indicator's
 *   slide.
 * @param options.activeMetric 'level' | 'xp' | 'quests' — which metric is
 *   shown big.
 * @param options.onSelectMetric (metric) => void — swaps the
 *   active/stacked charts.
 * @param options.hiddenSlugs a Set of player slugs currently hidden from
 *   the comparison chart (see playerToggle).
 * @param options.onToggleHidden (slug) => void — flips one player's
 *   membership in `hiddenSlugs`.
 * @param options.emphasizedSlugs a Set of player slugs click-pinned to
 *   full opacity in the comparison chart even when not hovered (see
 *   comparisonChart).
 * @param options.onToggleEmphasis (slug) => void — flips one player's
 *   membership in `emphasizedSlugs`.
 * @param options.selectedSkill the clicked skill-grid cell (a SKILLS entry
 *   from config.js), or null for every skill combined — narrows every
 *   Levels/XP chart on the page down to that one skill (skillIdFor,
 *   skillLabel); Quest points is always the group total regardless, since
 *   it has no per-skill breakdown to narrow to.
 */
export function renderPlayerGains({
  player,
  players,
  snapshots,
  window,
  onSelectWindow,
  previousWindow,
  activeMetric,
  onSelectMetric,
  hiddenSlugs,
  onToggleHidden,
  emphasizedSlugs,
  onToggleEmphasis,
  selectedSkill,
}) {
  const active = METRICS.find(([metric]) => metric === activeMetric) ?? METRICS[1];
  const others = METRICS.filter(([metric]) => metric !== active[0]);
  const [activeMetricKey, activeLabel, activeTotalFormat, activeUnit] = active;

  return el('section', { class: 'lb' }, [
    el('div', { class: 'lb-head' }, [
      el('div', { class: 'lb-title' }, [
        el('h2', { text: selectedSkill ? `Gains — ${selectedSkill.name}` : 'Gains' }),
      ]),
      windowToggle(window, onSelectWindow, previousWindow),
    ]),
    el('div', { class: 'bar-chart-layout' }, [
      metricCard(...active, snapshots, player, window, true, onSelectMetric, selectedSkill),
      comparisonCard(
        activeMetricKey,
        activeLabel,
        activeTotalFormat,
        activeUnit,
        snapshots,
        players,
        window,
        hiddenSlugs,
        onToggleHidden,
        player.slug,
        emphasizedSlugs,
        onToggleEmphasis,
        selectedSkill,
      ),
      el(
        'div',
        { class: 'bar-chart-stack' },
        others.map(([metric, label, totalFormat, unit]) =>
          metricCard(metric, label, totalFormat, unit, snapshots, player, window, false, onSelectMetric, selectedSkill),
        ),
      ),
    ]),
  ]);
}
