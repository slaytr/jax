import { el, svgEl, swatch } from '../dom.js';
import { formatCompact, formatNumber } from '../format.js';
import { bindTooltip, tooltipContent } from '../tooltip.js';

/**
 * The standings rows: experience gained over the last day, week and month.
 *
 * Each is ordered best-first and shares one row component, so the eye reads all
 * three the same way. Total level and quest points are not repeated here — both
 * are rows in the matrix below.
 */

function entry({ player, value, sub, share, place }) {
  return el('div', { class: 'lb-entry', style: { '--accent': player.colour }, tabindex: '0' }, [
    el('span', { class: 'lb-place', text: place }),
    el('span', { class: 'lb-name' }, [swatch(player.colour), el('span', { text: player.name })]),
    el('span', { class: 'lb-value' }, [el('span', { text: value })]),
    sub ? el('span', { class: 'lb-sub', text: sub }) : null,
    el('span', { class: 'lb-bar', role: 'presentation' }, [
      el('span', { class: 'lb-bar-fill', style: { width: `${(share * 100).toFixed(1)}%` } }),
    ]),
  ]);
}

/** A drawn glyph: "gained over time" has no game asset to borrow. */
function graphIcon() {
  const svg = svgEl('svg', { class: 'lb-icon', viewBox: '0 0 18 18', 'aria-hidden': 'true', focusable: 'false' });
  svg.append(
    svgEl('polyline', { points: '1,13 6,8 10,11 17,3', class: 'graph-line' }),
    svgEl('polyline', { points: '1,16.5 17,16.5', class: 'graph-axis' }),
  );
  return svg;
}

function gainsRow(players, gains, windowLabel) {
  const bySlug = Object.fromEntries(gains.rows.map((row) => [row.player.slug, row]));
  const ordered = [...players].sort((a, b) => (bySlug[b.slug]?.total ?? 0) - (bySlug[a.slug]?.total ?? 0));
  const best = Math.max(...ordered.map((player) => bySlug[player.slug]?.total ?? 0), 0);

  return ordered.map((player, index) => {
    const row = bySlug[player.slug];
    const total = row?.total ?? 0;
    const top = row?.bySkill?.[0];

    const node = entry({
      player,
      place: index + 1,
      value: total > 0 ? `+${formatCompact(total)}` : '—',
      sub: top ? `${top.skill.name} +${formatCompact(top.gained)}` : 'no training',
      share: best > 0 ? total / best : 0,
    });

    return bindTooltip(node, () =>
      tooltipContent(
        player.name,
        [
          [`XP gained (${windowLabel})`, formatNumber(total)],
          ['Skills trained', formatNumber(row?.bySkill?.length ?? 0)],
          ['Top skill', top ? `${top.skill.name} +${formatCompact(top.gained)}` : '—'],
        ],
        player.colour,
      ),
    );
  });
}

/** One labelled band — a period name, then that period's ranked five. */
const band = (label, note, entries) =>
  el('div', { class: 'lb-band' }, [
    el('div', { class: 'lb-band-head' }, [
      el('p', { class: 'lb-band-label', text: label }),
      note ? el('p', { class: 'lb-band-note', text: note }) : null,
    ]),
    el('div', { class: 'lb-row' }, entries),
  ]);

const plural = (amount, unit) => `${amount} ${unit}${amount === 1 ? '' : 's'}`;

/** Human span, so a short history can say what it actually covers. */
function describeSpan(seconds) {
  const hours = seconds / 3600;
  if (hours < 1) return plural(Math.max(1, Math.round(seconds / 60)), 'minute');
  if (hours < 48) return plural(Math.round(hours), 'hour');
  return plural(Math.round(hours / 24), 'day');
}

/**
 * A window longer than the stored history silently falls back to the oldest
 * snapshot, so say so rather than letting the heading overstate the range.
 */
function noteFor(gains) {
  if (!gains.hasSpan) return 'Needs two snapshots — populates once the update job has run again.';
  if (!gains.coversWindow) return `History only covers ${describeSpan(gains.spanSeconds)} so far.`;
  return null;
}

/**
 * One block, three bands. Kept adjacent so the same player can be tracked down
 * the columns, while each band stays independently ranked.
 *
 * @param windows day/week/month gain results, each from computeGains
 */
export function renderLeaderboards(state, windows) {
  const bands = [
    ['Day', 'last day', windows.day],
    ['Week', 'last week', windows.week],
    ['Month', 'last month', windows.month],
  ];

  return [
    el('section', { class: 'lb' }, [
      el('div', { class: 'lb-head' }, [
        el('h2', {}, [graphIcon(), el('span', { text: 'Experience gained' })]),
        el('p', { class: 'lb-note', text: 'Ranked highest first within each period.' }),
      ]),
      el(
        'div',
        { class: 'lb-stack' },
        bands.map(([label, windowLabel, gains]) =>
          band(label, noteFor(gains), gainsRow(state.players, gains, windowLabel)),
        ),
      ),
    ]),
  ];
}
